import { MiddlewareHandler } from 'hono';
import IConfiguration from '../../IConfiguration';
import container from '../../ModelContainer';
import { AuthManager } from './AuthManager';
import * as api from './HonoApiUtil';

export const readOnlyMiddleware: MiddlewareHandler = async (c, next) => {
    let configuration: IConfiguration;
    try {
        configuration = container.get<IConfiguration>('IConfiguration');
    } catch {
        return await next();
    }

    const config = configuration.getConfig();
    const readOnly = config.readOnly;

    // リードオンリーが無効ならすべて許可
    if (!readOnly || !readOnly.enabled) {
        return await next();
    }

    // トークン検証 (Authorization ヘッダー または query param 'token')
    const authHeader = c.req.header('authorization');
    let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    if (!token) {
        token = c.req.query('token') || null;
    }

    if (token && AuthManager.verifyToken(token, readOnly.password)) {
        // 管理者として認証成功
        return await next();
    }

    // === 未認証 (リードオンリーモード) ===
    const rawPath = c.req.path;
    const method = c.req.method.toUpperCase();
    const allowed = readOnly.allowedOperations || [];

    // subDirectory 運用に対応するため、API相対パスに正規化 (例: "/sub/api/recording" -> "/api/recording")
    const apiMatch = rawPath.match(/(?:^|\/)(api(?:\/.*)?)$/);
    const apiPath = apiMatch ? `/${apiMatch[1]}` : rawPath;

    // 認証関連APIや公開メタ情報は無条件許可
    if (
        apiPath.startsWith('/api/auth') ||
        apiPath === '/api/config' ||
        apiPath === '/api/version' ||
        apiPath === '/api/docs' ||
        apiPath === '/api/debug'
    ) {
        return await next();
    }

    // システムログ API (/api/logs) は閲覧専用モード時は常時遮断（管理者専用）
    if (apiPath.startsWith('/api/logs')) {
        return api.responseError(c, {
            code: 403,
            message: 'readOnlyMode: logs are restricted to admin',
        });
    }

    // ストリームのキープアライブおよび個別停止 (/api/streams/:streamId/keep, DELETE /api/streams/:streamId)
    // liveStream または recordedStream のいずれかが許可されている場合、視聴セッション維持・終了操作として許可
    if (/^\/api\/streams\/\d+\/keep$/.test(apiPath) || (/^\/api\/streams\/\d+$/.test(apiPath) && method === 'DELETE')) {
        if (allowed.includes('liveStream') || allowed.includes('recordedStream')) {
            return await next();
        }
        return api.responseError(c, {
            code: 403,
            message: 'readOnlyMode: streaming is not allowed',
        });
    }

    // オンエア（ライブ）ストリーミング判定
    if (apiPath.startsWith('/api/streams/live') || apiPath.startsWith('/api/iptv')) {
        if (allowed.includes('liveStream')) {
            return await next();
        }
        return api.responseError(c, {
            code: 403,
            message: 'readOnlyMode: liveStream is not allowed',
        });
    }

    // 録画ストリーミング判定 (/api/streams/recorded)
    if (apiPath.startsWith('/api/streams/recorded')) {
        if (allowed.includes('recordedStream')) {
            return await next();
        }
        return api.responseError(c, {
            code: 403,
            message: 'readOnlyMode: recordedStream is not allowed',
        });
    }

    // 録画ファイル（/api/videos）判定
    if (apiPath.startsWith('/api/videos')) {
        if (method === 'GET') {
            const isDownload = c.req.query('isDownload') === 'true';
            const isPlaylist = apiPath.endsWith('/playlist');
            if (isDownload || isPlaylist) {
                if (allowed.includes('download')) {
                    return await next();
                }
                return api.responseError(c, {
                    code: 403,
                    message: 'readOnlyMode: download is not allowed',
                });
            } else {
                // MP4 等の直接再生はリードオンリーモードでも常時許可
                return await next();
            }
        } else {
            // POST (upload) や DELETE (video削除) は管理者のみ
            return api.responseError(c, {
                code: 403,
                message: 'readOnlyMode',
            });
        }
    }

    // ダッシュボード判定 (録画中一覧 /api/recording)
    if (apiPath.startsWith('/api/recording')) {
        if (method === 'GET') {
            if (!allowed.includes('dashboard')) {
                return api.responseError(c, {
                    code: 403,
                    message: 'readOnlyMode: dashboard is not allowed',
                });
            }
        }
    }

    // 番組検索判定 (POST /api/schedules/search)
    if (apiPath.startsWith('/api/schedules/search')) {
        if (allowed.includes('search')) {
            return await next();
        }
        return api.responseError(c, {
            code: 403,
            message: 'readOnlyMode: search is not allowed',
        });
    }

    // ルール管理判定 (/api/rules)
    if (apiPath.startsWith('/api/rules')) {
        if (method === 'GET') {
            if (!allowed.includes('rules')) {
                return api.responseError(c, {
                    code: 403,
                    message: 'readOnlyMode: rules is not allowed',
                });
            }
            // ルール編集用詳細 (GET /api/rules/:id) は管理者専用
            if (/^\/api\/rules\/\d+$/.test(apiPath)) {
                return api.responseError(c, {
                    code: 403,
                    message: 'readOnlyMode: rule edit detail is restricted to admin',
                });
            }
        }
    }

    // エンコード判定 (/api/encode)
    if (apiPath.startsWith('/api/encode')) {
        if (method === 'GET') {
            if (!allowed.includes('encode')) {
                return api.responseError(c, {
                    code: 403,
                    message: 'readOnlyMode: encode is not allowed',
                });
            }
        }
    }

    // その他の GET リクエスト（番組表、録画一覧、予約一覧等）は閲覧許可
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
        return await next();
    }

    // 更新系リクエスト (POST, PUT, DELETE, PATCH 等) はリードオンリーでは全面禁止
    return api.responseError(c, {
        code: 403,
        message: 'readOnlyMode',
    });
};
