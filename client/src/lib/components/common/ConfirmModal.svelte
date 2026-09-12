<script lang="ts">
    import { confirmStore } from '../../stores/confirm.svelte';
    import { AlertTriangle, HelpCircle, X } from '@lucide/svelte';

    function handleKeydown(e: KeyboardEvent) {
        if (!confirmStore.isOpen) return;
        if (e.key === 'Escape') {
            confirmStore.handleCancel();
        } else if (e.key === 'Enter') {
            confirmStore.handleConfirm();
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if confirmStore.isOpen}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
    >
        <!-- バックドロップ -->
        <button
            type="button"
            class="fixed inset-0 bg-black/60 backdrop-blur-xs cursor-default"
            onclick={() => confirmStore.handleCancel()}
            aria-label="閉じる"
            tabindex="-1"
        ></button>

        <!-- ダイアログ本体 -->
        <div
            class="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150"
        >
            <div class="flex items-start gap-4">
                <div
                    class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl {confirmStore.isDestructive
                        ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
                        : 'bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'}"
                >
                    {#if confirmStore.isDestructive}
                        <AlertTriangle size={20} />
                    {:else}
                        <HelpCircle size={20} />
                    {/if}
                </div>

                <div class="flex-1 min-w-0">
                    {#if confirmStore.title}
                        <h3 id="confirm-dialog-title" class="text-base font-bold text-slate-900 dark:text-slate-100">
                            {confirmStore.title}
                        </h3>
                    {/if}
                    <p
                        class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap {confirmStore.title
                            ? 'mt-2'
                            : ''}"
                    >
                        {confirmStore.message}
                    </p>
                </div>

                <button
                    type="button"
                    onclick={() => confirmStore.handleCancel()}
                    class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                    title="キャンセル"
                >
                    <X size={18} />
                </button>
            </div>

            <!-- アクションボタン -->
            <div class="mt-6 flex items-center justify-end gap-3">
                <button type="button" onclick={() => confirmStore.handleCancel()} class="btn-secondary">
                    {confirmStore.cancelText}
                </button>
                <button
                    type="button"
                    onclick={() => confirmStore.handleConfirm()}
                    class={confirmStore.isDestructive ? 'btn-danger' : 'btn-primary'}
                >
                    {confirmStore.confirmText}
                </button>
            </div>
        </div>
    </div>
{/if}
