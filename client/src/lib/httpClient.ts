export interface RequestConfig extends Omit<RequestInit, 'body'> {
    params?: Record<string, any> | URLSearchParams;
    validateStatus?: (status: number) => boolean;
    responseType?: 'json' | 'text' | 'blob' | 'arraybuffer';
    body?: any;
    data?: any; // axios compatibility
}

export interface ApiResponse<T = any> {
    data: T;
    status: number;
    statusText: string;
    headers: Headers;
}

export class HttpError extends Error {
    response: ApiResponse;

    constructor(message: string, response: ApiResponse) {
        super(message);
        this.name = 'HttpError';
        this.response = response;
    }
}

export function buildUrl(url: string, params?: Record<string, any> | URLSearchParams): string {
    if (!params) return url;

    const [base, hash] = url.split('#');
    const [path, existingQuery] = base.split('?');
    const searchParams = new URLSearchParams(existingQuery || '');

    if (params instanceof URLSearchParams) {
        for (const [key, value] of params.entries()) {
            searchParams.append(key, value);
        }
    } else {
        for (const [key, val] of Object.entries(params)) {
            if (val === undefined || val === null) continue;
            if (Array.isArray(val)) {
                for (const item of val) {
                    if (item !== undefined && item !== null) {
                        searchParams.append(key, String(item));
                    }
                }
            } else {
                searchParams.set(key, String(val));
            }
        }
    }

    const queryString = searchParams.toString();
    const finalPath = queryString ? `${path}?${queryString}` : path;
    return hash !== undefined ? `${finalPath}#${hash}` : finalPath;
}

export function getAuthToken(): string | null {
    if (typeof window !== 'undefined') {
        try {
            return localStorage.getItem('epgdeck_auth_token');
        } catch {
            return null;
        }
    }
    return null;
}

export async function request<T = any>(
    url: string,
    config: RequestConfig & { method?: string } = {},
): Promise<ApiResponse<T>> {
    const finalUrl = buildUrl(url, config.params);
    const headers = new Headers(config.headers);

    const token = getAuthToken();
    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    let body = config.body !== undefined ? config.body : config.data;

    if (
        body !== undefined &&
        !(body instanceof FormData) &&
        !(body instanceof Blob) &&
        !(body instanceof ArrayBuffer) &&
        !(body instanceof URLSearchParams) &&
        typeof body !== 'string'
    ) {
        if (!headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
        }
        body = JSON.stringify(body);
    }

    const res = await fetch(finalUrl, {
        ...config,
        headers,
        body,
    });

    let data: any;
    if (config.responseType === 'text') {
        data = await res.text();
    } else if (config.responseType === 'blob') {
        data = await res.blob();
    } else if (config.responseType === 'arraybuffer') {
        data = await res.arrayBuffer();
    } else {
        const text = await res.text();
        if (text) {
            try {
                data = JSON.parse(text);
            } catch {
                data = text;
            }
        } else {
            data = null;
        }
    }

    const response: ApiResponse<T> = {
        data,
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
    };

    const validate = config.validateStatus ?? ((status: number) => status >= 200 && status < 300);
    if (!validate(res.status)) {
        throw new HttpError(`Request failed with status code ${res.status}`, response);
    }

    return response;
}

export const http = {
    get<T = any>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
        return request<T>(url, { ...config, method: 'GET' });
    },
    post<T = any>(url: string, data?: any, config?: RequestConfig): Promise<ApiResponse<T>> {
        return request<T>(url, { ...config, method: 'POST', data });
    },
    put<T = any>(url: string, data?: any, config?: RequestConfig): Promise<ApiResponse<T>> {
        return request<T>(url, { ...config, method: 'PUT', data });
    },
    delete<T = any>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
        return request<T>(url, { ...config, method: 'DELETE' });
    },
    patch<T = any>(url: string, data?: any, config?: RequestConfig): Promise<ApiResponse<T>> {
        return request<T>(url, { ...config, method: 'PATCH', data });
    },
    request,
};

export default http;
