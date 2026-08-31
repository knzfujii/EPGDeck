const THEME_KEY = 'epgdeck_theme';

export type ThemeMode = 'auto' | 'dark' | 'light';

class ThemeStore {
    mode = $state<ThemeMode>('auto');
    isDark = $state(false);

    constructor() {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(THEME_KEY) as ThemeMode | null;
            if (saved === 'dark' || saved === 'light' || saved === 'auto') {
                this.mode = saved;
            }
            this.updateDarkState();

            // システム設定変更の監視
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                if (this.mode === 'auto') {
                    this.updateDarkState();
                }
            });
        }
    }

    setMode(mode: ThemeMode) {
        this.mode = mode;
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem(THEME_KEY, mode);
            } catch (e) {
                // ignore
            }
            this.updateDarkState();
        }
    }

    toggle() {
        this.setMode(this.isDark ? 'light' : 'dark');
    }

    setDark(val: boolean) {
        this.setMode(val ? 'dark' : 'light');
    }

    private updateDarkState() {
        if (typeof window === 'undefined') return;

        if (this.mode === 'dark') {
            this.isDark = true;
        } else if (this.mode === 'light') {
            this.isDark = false;
        } else {
            this.isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        this.applyTheme();
    }

    applyTheme() {
        if (typeof document !== 'undefined') {
            if (this.isDark) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        }
    }
}

export const themeStore = new ThemeStore();
