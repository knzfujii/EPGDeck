import { hc } from 'hono/client';
import type { ApiRoutesType } from '../../../src/model/service/hono/apiRoutes.js';
import { getAuthToken } from './authStorage.js';

export type ApiClient = ReturnType<typeof hc<ApiRoutesType>>;

export const createApiClient = (baseUrl = '/api'): ApiClient => {
    const customFetch: typeof fetch = async (input, init = {}) => {
        const token = getAuthToken();
        const headers = new Headers(init.headers);
        if (token && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
        }
        return fetch(input, {
            ...init,
            headers,
        });
    };

    return hc<ApiRoutesType>(baseUrl, {
        fetch: customFetch,
    });
};

export const api: ApiClient = createApiClient();
export default api;
