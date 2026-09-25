<script lang="ts">
    import type { Snippet } from 'svelte';
    import { X } from '@lucide/svelte';

    interface Props {
        isOpen: boolean;
        title?: string;
        titleId?: string;
        maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
        closable?: boolean;
        showCloseButton?: boolean;
        onClose: () => void;
        header?: Snippet;
        children?: Snippet;
        footer?: Snippet;
    }

    let {
        isOpen,
        title,
        titleId,
        maxWidth = 'md',
        closable = true,
        showCloseButton = true,
        onClose,
        header,
        children,
        footer,
    }: Props = $props();

    function handleKeydown(e: KeyboardEvent) {
        if (!isOpen || !closable) return;
        if (e.key === 'Escape') {
            onClose();
        }
    }

    const maxWidthClasses: Record<string, string> = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
        '3xl': 'max-w-3xl',
        '4xl': 'max-w-4xl',
        '5xl': 'max-w-5xl',
    };
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
    >
        <button
            type="button"
            class="fixed inset-0 bg-black/60 backdrop-blur-xs cursor-default"
            onclick={() => {
                if (closable) onClose();
            }}
            aria-label="閉じる"
            tabindex="-1"
        ></button>

        <div
            class="relative w-full {maxWidthClasses[maxWidth] ??
                'max-w-md'} overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150"
        >
            {#if header}
                {@render header()}
            {:else if title}
                <div
                    class="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800 mb-4"
                >
                    <h3 id={titleId} class="text-base font-bold text-slate-900 dark:text-slate-100 truncate pr-2">
                        {title}
                    </h3>
                    {#if showCloseButton}
                        <button
                            type="button"
                            onclick={onClose}
                            disabled={!closable}
                            class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 disabled:opacity-40 transition-colors cursor-pointer"
                            aria-label="閉じる"
                        >
                            <X size={18} />
                        </button>
                    {/if}
                </div>
            {/if}

            {#if children}
                {@render children()}
            {/if}

            {#if footer}
                <div class="mt-5 sm:mt-6 border-t border-slate-100 pt-4 dark:border-slate-800 flex justify-end gap-2.5">
                    {@render footer()}
                </div>
            {/if}
        </div>
    </div>
{/if}
