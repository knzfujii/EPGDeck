<script lang="ts">
    import type * as apid from '../../../../../api';
    import { channelStore } from '../../stores/channels.svelte';
    import { formatTimeRange, formatDuration } from '../../utils/format';
    import { X, CheckCircle2, PauseCircle, Trash2, Loader2 } from '@lucide/svelte';

    interface Props {
        isOpen: boolean;
        item: (apid.ReserveItem & { isRecording?: boolean }) | null;
        onClose: () => void;
        onAction: (action: 'finish' | 'stop' | 'discard') => Promise<void>;
        isProcessing?: boolean;
    }

    let { isOpen, item, onClose, onAction, isProcessing = false }: Props = $props();

    function handleKeydown(e: KeyboardEvent) {
        if (!isOpen || isProcessing) return;
        if (e.key === 'Escape') {
            onClose();
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen && item}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recording-action-title"
    >
        <!-- バックドロップ -->
        <button
            type="button"
            class="fixed inset-0 bg-black/60 backdrop-blur-xs cursor-default"
            onclick={() => {
                if (!isProcessing) onClose();
            }}
            aria-label="閉じる"
            tabindex="-1"
        ></button>

        <!-- ダイアログ本体 -->
        <div
            class="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150"
        >
            <!-- ヘッダー -->
            <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div class="flex items-center gap-2">
                    <span class="relative flex h-2.5 w-2.5">
                        <span
                            class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"
                        ></span>
                        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                    </span>
                    <h3 id="recording-action-title" class="text-base font-bold text-slate-900 dark:text-slate-100">
                        録画中番組の操作
                    </h3>
                </div>
                <button
                    type="button"
                    disabled={isProcessing}
                    onclick={onClose}
                    class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer disabled:opacity-50"
                    title="閉じる"
                >
                    <X size={18} />
                </button>
            </div>

            <!-- 番組情報サマリー -->
            <div
                class="mt-4 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60"
            >
                <div class="font-bold text-sm text-slate-900 dark:text-slate-100 line-clamp-2">
                    {item.name}
                </div>
                <div
                    class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400"
                >
                    <span class="font-medium text-slate-700 dark:text-slate-300">
                        {channelStore.getChannelName(item.channelId)}
                    </span>
                    <span>•</span>
                    <span>{formatTimeRange(item.startAt, item.endAt)}</span>
                    <span>•</span>
                    <span>{formatDuration(item.endAt - item.startAt)}</span>
                </div>
            </div>

            <p class="mt-3 text-xs text-slate-500 dark:text-slate-400">
                この番組は現在録画中です。目的に応じた処理を選択してください：
            </p>

            <!-- 3択アクションリスト -->
            <div class="mt-3 space-y-2.5">
                <!-- 1: 完了として保存 -->
                <button
                    type="button"
                    disabled={isProcessing}
                    onclick={() => onAction('finish')}
                    class="w-full text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 hover:border-emerald-500/80 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 dark:hover:border-emerald-500/50 transition cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <div class="flex items-start gap-3">
                        <div
                            class="p-2 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 group-hover:scale-105 transition shrink-0"
                        >
                            <CheckCircle2 size={20} />
                        </div>
                        <div class="flex-1 min-w-0">
                            <div
                                class="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition flex items-center justify-between"
                            >
                                <span>完了として保存</span>
                                <span
                                    class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300"
                                >
                                    正常終了扱い
                                </span>
                            </div>
                            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                ここまでの録画を保存して正常完了にします。
                                <strong>録画履歴に登録</strong>
                                され、サムネイルや自動エンコードも通常通り実行されます。
                            </p>
                        </div>
                    </div>
                </button>

                <!-- 2: 中断して保存 -->
                <button
                    type="button"
                    disabled={isProcessing}
                    onclick={() => onAction('stop')}
                    class="w-full text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 hover:border-amber-500/80 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 dark:hover:border-amber-500/50 transition cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <div class="flex items-start gap-3">
                        <div
                            class="p-2 rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 group-hover:scale-105 transition shrink-0"
                        >
                            <PauseCircle size={20} />
                        </div>
                        <div class="flex-1 min-w-0">
                            <div
                                class="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition flex items-center justify-between"
                            >
                                <span>中断して保存</span>
                                <span
                                    class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300"
                                >
                                    未完了・欠損
                                </span>
                            </div>
                            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                ここまでの録画ファイルを保存しますが、未完了として扱います。
                                <strong>録画履歴には残さない</strong>
                                ため、再放送があれば自動録画されます。
                            </p>
                        </div>
                    </div>
                </button>

                <!-- 3: 取り消し（破棄） -->
                <button
                    type="button"
                    disabled={isProcessing}
                    onclick={() => onAction('discard')}
                    class="w-full text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 hover:border-rose-500/80 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 dark:hover:border-rose-500/50 transition cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <div class="flex items-start gap-3">
                        <div
                            class="p-2 rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 group-hover:scale-105 transition shrink-0"
                        >
                            <Trash2 size={20} />
                        </div>
                        <div class="flex-1 min-w-0">
                            <div
                                class="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition flex items-center justify-between"
                            >
                                <span>録画を取り消し（ファイルを破棄）</span>
                                <span
                                    class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300"
                                >
                                    完全削除
                                </span>
                            </div>
                            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                録画を直ちに中止し、書き込み途中の録画ファイルやデータベースの記録も
                                <strong>完全に削除</strong>
                                します。
                            </p>
                        </div>
                    </div>
                </button>
            </div>

            <!-- フッター -->
            <div class="mt-5 flex items-center justify-end">
                <button
                    type="button"
                    disabled={isProcessing}
                    onclick={onClose}
                    class="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/70 disabled:opacity-50"
                >
                    {#if isProcessing}
                        <span class="inline-flex items-center gap-1.5">
                            <Loader2 size={14} class="animate-spin" />
                            処理中...
                        </span>
                    {:else}
                        何もしない（閉じる）
                    {/if}
                </button>
            </div>
        </div>
    </div>
{/if}
