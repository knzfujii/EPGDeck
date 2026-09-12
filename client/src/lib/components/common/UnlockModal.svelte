<script lang="ts">
    import { readOnlyStore } from '../../stores/readOnly.svelte';
    import { snackbar } from '../../stores/snackbar.svelte';
    import { Lock, X, KeyRound, Loader2 } from '@lucide/svelte';

    let password = $state('');
    let errorMessage = $state('');
    let isSubmitting = $state(false);
    let inputEl = $state<HTMLInputElement | null>(null);

    $effect(() => {
        if (readOnlyStore.isModalOpen) {
            password = '';
            errorMessage = '';
            isSubmitting = false;
            setTimeout(() => {
                inputEl?.focus();
            }, 50);
        }
    });

    function handleKeydown(e: KeyboardEvent) {
        if (!readOnlyStore.isModalOpen) return;
        if (e.key === 'Escape') {
            close();
        }
    }

    function close() {
        if (isSubmitting) return;
        readOnlyStore.closeUnlockModal();
    }

    async function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        if (!password || isSubmitting) return;

        isSubmitting = true;
        errorMessage = '';

        try {
            await readOnlyStore.unlock(password);
            snackbar.open({ text: '管理者モードに切り替えました', color: 'success' });
        } catch (err: any) {
            if (err?.response?.status === 401) {
                errorMessage = 'パスワードが正しくありません';
            } else if (err?.response?.data?.message === 'passwordNotConfigured') {
                errorMessage = '管理者パスワードが設定されていません (config.yml)';
            } else {
                errorMessage = '認証に失敗しました。もう一度お試しください';
            }
        } finally {
            isSubmitting = false;
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if readOnlyStore.isModalOpen}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlock-dialog-title"
    >
        <!-- バックドロップ -->
        <button
            type="button"
            class="fixed inset-0 bg-black/60 backdrop-blur-xs cursor-default"
            onclick={close}
            aria-label="閉じる"
            tabindex="-1"
        ></button>

        <!-- ダイアログ本体 -->
        <div
            class="relative w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150"
        >
            <div class="flex items-start gap-3">
                <div
                    class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
                >
                    <KeyRound size={20} />
                </div>

                <div class="flex-1 min-w-0">
                    <h3 id="unlock-dialog-title" class="text-base font-bold text-slate-900 dark:text-slate-100">
                        管理者モードへの切り替え
                    </h3>
                    <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        録画の削除や予約変更などの制限を解除するには、管理者パスワードを入力してください。
                    </p>
                </div>

                <button
                    type="button"
                    onclick={close}
                    class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label="閉じる"
                >
                    <X size={18} />
                </button>
            </div>

            <form onsubmit={handleSubmit} class="mt-4 space-y-4">
                <div>
                    <label
                        for="admin-password"
                        class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                        管理者パスワード
                    </label>
                    <input
                        id="admin-password"
                        bind:this={inputEl}
                        type="password"
                        bind:value={password}
                        placeholder="パスワードを入力..."
                        disabled={isSubmitting}
                        class="form-input"
                    />
                    {#if errorMessage}
                        <p class="mt-1.5 text-xs text-rose-500 font-medium">{errorMessage}</p>
                    {/if}
                </div>

                <div class="flex justify-end gap-2.5 pt-2">
                    <button type="button" onclick={close} disabled={isSubmitting} class="btn-secondary">
                        キャンセル
                    </button>
                    <button type="submit" disabled={!password || isSubmitting} class="btn-primary">
                        {#if isSubmitting}
                            <Loader2 size={16} class="animate-spin" />
                            解除中...
                        {:else}
                            <Lock size={14} />
                            ロック解除
                        {/if}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
