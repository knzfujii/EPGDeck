import { Context } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { NotFoundError } from '../../error/ApiError.js';
import IPlayList from '../../api/IPlayList.js';

export interface IError {
    readonly code: number;
    readonly message: string;
    errors?: string;
}

export const responseJSON = (c: Context, code: number, body?: any): Response => {
    return c.json(body ?? null, code as any, {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        Expires: '-1',
        Pragma: 'no-cache',
    });
};

export const responseError = (c: Context, reason: IError): Response => {
    return c.json(
        {
            code: reason.code,
            message: reason.message,
            ...(reason.errors ? { errors: reason.errors } : {}),
        },
        reason.code as any,
    );
};

export const responseServerError = (c: Context, err?: string): Response => {
    return c.json(
        {
            code: 500,
            message: 'Internal Server Error',
            ...(typeof err !== 'undefined' ? { errors: err } : {}),
        },
        500,
    );
};

export const responsePlayList = (c: Context, list: IPlayList): Response => {
    const userAgent = c.req.header('user-agent') || '';
    const disposition = /firefox|Firefox/.test(userAgent) ? 'inline' : 'attachment';

    return new Response(list.playList, {
        status: 200,
        headers: {
            'Content-Type': 'application/x-mpegURL; charset="UTF-8"',
            'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(list.name)};`,
        },
    });
};

export const responseFile = async (c: Context, filePath: string, mime: string, download = false): Promise<Response> => {
    let stat: fs.Stats;
    try {
        stat = await fs.promises.stat(filePath);
    } catch (err: any) {
        if (err?.code === 'ENOENT') {
            throw new NotFoundError('file is not found');
        }
        throw err;
    }
    if (stat.isDirectory()) {
        throw new Error('file path is directory');
    }

    const headers: Record<string, string> = {};
    if (download) {
        headers['Content-Type'] = 'application/octet-stream';
        headers['Content-Disposition'] = `attachment; filename*=utf-8'ja'${encodeURIComponent(
            path.basename(filePath),
        )};`;
    } else {
        headers['Content-Type'] = mime;
    }

    const rangeHeader = c.req.header('range');
    const rangeRequest = readRangeHeader(rangeHeader, stat.size);

    if (rangeRequest === null) {
        headers['Content-Length'] = stat.size.toString();
        headers['Accept-Ranges'] = 'bytes';

        if (c.req.method === 'HEAD') {
            return new Response(null, { status: 200, headers });
        }

        return createFileStreamResponse(c, filePath, 200, headers);
    }

    const start = rangeRequest.Start;
    const end = rangeRequest.End;

    if (start >= stat.size || end >= stat.size || start > end) {
        headers['Content-Range'] = `bytes */${stat.size}`;
        return new Response(null, { status: 416, headers });
    }

    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    headers['Content-Length'] = (end - start + 1).toString();
    headers['Accept-Ranges'] = 'bytes';

    if (c.req.method === 'HEAD') {
        return new Response(null, { status: 206, headers });
    }

    return createFileStreamResponse(c, filePath, 206, headers, { start, end });
};

/**
 * クライアント切断（シーク・タブ離脱等）時に fs.ReadStream を即座に破棄する Response 生成ヘルパー
 * Node.js 環境（c.env.outgoing が存在する場合）は、@hono/node-server の Web Streams ループによる
 * drain / バックプレッシャーストール（数十MBで転送が止まるデッドロック）を回避するため、
 * Express 時代と同様に Node.js ネイティブの stream.pipe(outgoing) で直接ソケットに流し込む。
 */
const createFileStreamResponse = (
    c: Context,
    filePath: string,
    status: number,
    headers: Record<string, string>,
    options?: { start?: number; end?: number },
): Response => {
    const stream = options ? fs.createReadStream(filePath, options) : fs.createReadStream(filePath);

    let isCleanedUp = false;
    const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        try {
            if (!stream.destroyed) {
                stream.destroy();
            }
        } catch {
            // ignore
        }
    };

    stream.on('error', cleanup);

    const outgoing = c.env?.outgoing;
    if (outgoing && !outgoing.headersSent) {
        outgoing.writeHead(status, headers);
        stream.pipe(outgoing);

        c.req.raw.signal?.addEventListener('abort', cleanup, { once: true });
        if (c.env?.incoming) {
            c.env.incoming.once('close', cleanup);
        }
        outgoing.once('close', cleanup);
        outgoing.once('error', cleanup);
        stream.once('close', () => {
            isCleanedUp = true;
        });

        return createAlreadySentResponse();
    }

    // fallback for environments without outgoing (e.g. testing)
    c.req.raw.signal?.addEventListener('abort', cleanup, { once: true });
    if (c.env?.incoming) {
        c.env.incoming.once('close', cleanup);
    }
    if (c.env?.outgoing) {
        c.env.outgoing.once('close', cleanup);
    }
    stream.once('close', () => {
        isCleanedUp = true;
    });

    return new Response(Readable.toWeb(stream) as any, { status, headers });
};

/**
 * @hono/node-server の内部キャッシュシンボルを剥奪した「送信済みダミーレスポンス」を生成する。
 * CORS ミドルウェア等で c.res が先行初期化されている環境において、
 * @hono/node-server の responseViaCache() による writeHead 二重呼出（ERR_HTTP_HEADERS_SENT）を防止する。
 * 注意: Node.js 22 等の undici 実装では内部スロット/Headers 参照が Symbol で管理されているため、
 * 無差別に Symbol を削除すると res.headers が undefined となりクラッシュする。
 * そのため、'cache' シンボルのみを対象に削除する。
 */
const createAlreadySentResponse = (): Response => {
    const res = new Response(null, {
        headers: { 'x-hono-already-sent': 'true' },
    });
    for (const sym of Object.getOwnPropertySymbols(res)) {
        if (sym.description === 'cache') {
            delete (res as any)[sym];
        }
    }
    return res;
};

const readRangeHeader = (
    range: string | undefined | null,
    totalLength: number,
): { Start: number; End: number } | null => {
    if (typeof range !== 'string' || range.length === 0) {
        return null;
    }

    const array = range.split(/bytes=([0-9]*)-([0-9]*)/);
    const start = parseInt(array[1], 10);
    const end = parseInt(array[2], 10);
    const result = {
        Start: isNaN(start) ? 0 : start,
        End: isNaN(end) ? totalLength - 1 : end,
    };

    if (!isNaN(start) && isNaN(end)) {
        result.Start = start;
        result.End = totalLength - 1;
    }

    if (isNaN(start) && !isNaN(end)) {
        result.Start = Math.max(0, totalLength - end);
        result.End = totalLength - 1;
    }

    return result;
};

export const isSecureProtocol = (c: Context): boolean => {
    const forwardedProto = c.req.header('x-forwarded-proto') || c.req.header('X-Forwarded-Proto');
    if (forwardedProto === 'https') return true;
    try {
        const url = new URL(c.req.url);
        return url.protocol === 'https:';
    } catch {
        return false;
    }
};
