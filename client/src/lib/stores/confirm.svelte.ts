// Svelte 5 Confirm Dialog Store
export interface ConfirmOptions {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
}

class ConfirmState {
    isOpen = $state(false);
    title = $state('');
    message = $state('');
    confirmText = $state('OK');
    cancelText = $state('キャンセル');
    isDestructive = $state(false);
    private resolvePromise: ((value: boolean) => void) | null = null;

    public confirm(options: ConfirmOptions | string): Promise<boolean> {
        if (this.resolvePromise) {
            this.resolvePromise(false);
            this.resolvePromise = null;
        }

        const opts = typeof options === 'string' ? { message: options } : options;
        this.title = opts.title || '';
        this.message = opts.message;
        this.confirmText = opts.confirmText || 'OK';
        this.cancelText = opts.cancelText || 'キャンセル';
        this.isDestructive = opts.isDestructive ?? true;
        this.isOpen = true;

        return new Promise<boolean>((resolve) => {
            this.resolvePromise = resolve;
        });
    }

    public handleConfirm() {
        this.isOpen = false;
        if (this.resolvePromise) {
            this.resolvePromise(true);
            this.resolvePromise = null;
        }
    }

    public handleCancel() {
        this.isOpen = false;
        if (this.resolvePromise) {
            this.resolvePromise(false);
            this.resolvePromise = null;
        }
    }
}

export const confirmStore = new ConfirmState();
export const confirmDialog = (options: ConfirmOptions | string) => confirmStore.confirm(options);

