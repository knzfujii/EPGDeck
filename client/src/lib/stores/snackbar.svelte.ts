// Svelte 5 Snackbar Notification Store
export interface SnackbarOption {
    text: string;
    color?: 'success' | 'error' | 'warning' | 'info';
    timeout?: number;
}

class SnackbarState {
    isOpen = $state(false);
    text = $state('');
    color = $state<'success' | 'error' | 'warning' | 'info'>('info');
    private timer: any = null;

    public open(option: SnackbarOption) {
        if (this.timer) clearTimeout(this.timer);

        this.text = option.text;
        this.color = option.color || 'info';
        this.isOpen = true;

        const timeout = option.timeout || 4000;
        this.timer = setTimeout(() => {
            this.close();
        }, timeout);
    }

    public close() {
        this.isOpen = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}

export const snackbar = new SnackbarState();

