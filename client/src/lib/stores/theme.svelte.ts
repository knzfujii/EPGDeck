const THEME_KEY = 'epgdeck_theme';

class ThemeStore {
    isDark = $state(false);

    constructor() {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(THEME_KEY);
            if (saved === 'dark') {
                this.isDark = true;
            } else if (saved === 'light') {
                this.isDark = false;
            } else {
                this.isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            }
            this.applyTheme();
        }
    }

    toggle() {
        this.isDark = !this.isDark;
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem(THEME_KEY, this.isDark ? 'dark' : 'light');
            } catch (e) {
                // ignore
            }
            this.applyTheme();
        }
    }

    setDark(val: boolean) {
        this.isDark = val;
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem(THEME_KEY, this.isDark ? 'dark' : 'light');
            } catch (e) {
                // ignore
            }
            this.applyTheme();
        }
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

