import { Context } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import IPlayList from '../../api/IPlayList';

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
    const stat = await fs.promises.stat(filePath);
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

        const stream = fs.createReadStream(filePath);
        return new Response(Readable.toWeb(stream) as any, { status: 200, headers });
    }

    const start = rangeRequest.Start;
    const end = rangeRequest.End;

    if (start >= stat.size || end >= stat.size) {
        headers['Content-Range'] = `bytes */${stat.size}`;
        return new Response(null, { status: 416, headers });
    }

    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    headers['Content-Length'] = (start === end ? 0 : end - start + 1).toString();
    headers['Accept-Ranges'] = 'bytes';

    const option = { start, end };
    const stream = fs.createReadStream(filePath, option);
    return new Response(Readable.toWeb(stream) as any, { status: 206, headers });
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
