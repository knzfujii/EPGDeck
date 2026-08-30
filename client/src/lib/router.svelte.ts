// Svelte 5 Native Reactive SPA Router (HTML5 History Mode)
export interface RouteLocation {
    path: string;
    pathname: string;
    search: string;
    query: Record<string, string>;
    params: Record<string, string>;
}

class RouterState {
    pathname = $state(typeof window !== 'undefined' ? window.location.pathname : '/');
    search = $state(typeof window !== 'undefined' ? window.location.search : '');
    query = $state<Record<string, string>>(typeof window !== 'undefined' ? parseQuery(window.location.search) : {});

    get path(): string {
        return this.pathname + this.search;
    }

    get current(): RouteLocation {
        return {
            path: this.path,
            pathname: this.pathname,
            search: this.search,
            query: this.query,
            params: {},
        };
    }

    constructor() {
        if (typeof window !== 'undefined') {
            window.addEventListener('popstate', () => {
                this.update();
            });
        }
    }

    private update() {
        if (typeof window === 'undefined') return;
        this.pathname = window.location.pathname;
        this.search = window.location.search;
        this.query = parseQuery(window.location.search);
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

    public back() {
        if (typeof window !== 'undefined') {
            window.history.back();
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
