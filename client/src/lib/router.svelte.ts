// Svelte 5 Native Reactive SPA Router (HTML5 History Mode)
export interface RouteLocation {
    path: string;
    pathname: string;
    search: string;
    query: Record<string, string>;
    params: Record<string, string>;
}

class RouterState {
    current = $state<RouteLocation>({
        path: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/',
        pathname: typeof window !== 'undefined' ? window.location.pathname : '/',
        search: typeof window !== 'undefined' ? window.location.search : '',
        query: typeof window !== 'undefined' ? parseQuery(window.location.search) : {},
        params: {},
    });

    constructor() {
        if (typeof window !== 'undefined') {
            window.addEventListener('popstate', () => {
                this.update();
            });
        }
    }

    private update() {
        this.current = {
            path: window.location.pathname + window.location.search,
            pathname: window.location.pathname,
            search: window.location.search,
            query: parseQuery(window.location.search),
            params: {},
        };
    }

    public push(url: string) {
        if (typeof window !== 'undefined' && window.location.pathname + window.location.search !== url) {
            window.history.pushState({}, '', url);
            this.update();
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        }
    }

    public replace(url: string) {
        if (typeof window !== 'undefined') {
            window.history.replaceState({}, '', url);
            this.update();
        }
    }
}

function parseQuery(search: string): Record<string, string> {
    const params = new URLSearchParams(search);
    const result: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
        result[key] = value;
    }
    return result;
}

export const router = new RouterState();

