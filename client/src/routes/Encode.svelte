<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { confirmDialog } from '../lib/stores/confirm.svelte';
    import { socketStore } from '../lib/stores/socket.svelte';
    import { readOnlyStore } from '../lib/stores/readOnly.svelte';
    import api from '@/lib/apiClient';
    import type * as apid from '../../../api';
    import { Film, CheckCircle2, Trash2, RefreshCw } from '@lucide/svelte';
    import ReadOnlyGuard from '../lib/components/common/ReadOnlyGuard.svelte';
    import Button from '../lib/components/common/Button.svelte';
    import IconButton from '../lib/components/common/IconButton.svelte';

    let running = $state<apid.EncodeProgramItem[]>([]);
    let waitList = $state<apid.EncodeProgramItem[]>([]);
    let isLoading = $state(true);

    $effect(() => {
        if (!readOnlyStore.canViewEncode) {
            router.replace('/recorded');
        }
    });

    let unsubscribeSockets: (() => void)[] = [];

    async function fetchEncode(isSilent = false) {
        if (!isSilent) isLoading = true;
        try {
            const res = await api.encode.$get({ query: { isHalfWidth: true } });
            if (res.ok) {
                const data = await res.json();
                running = data.runningItems || [];
                waitList = data.waitItems || [];
            }
        } catch (e) {
            console.error('Failed to fetch encode', e);
            if (!isSilent) snackbar.open({ text: 'エンコード情報の取得に失敗しました', color: 'error' });
        } finally {
            if (!isSilent) isLoading = false;
        }
    }

    onMount(() => {
        if (!readOnlyStore.canViewEncode) {
            router.replace('/recorded');
            return;
        }
        fetchEncode();

        // Socket.IO によるエンコード進捗通知およびステータス更新を受信
        unsubscribeSockets = [
            socketStore.on('updateEncode', () => {
                fetchEncode(true);
            }),
            socketStore.on('updateStatus', () => {
                fetchEncode(true);
            }),
        ];
    });

    onDestroy(() => {
        for (const unsub of unsubscribeSockets) {
            unsub();
        }
        unsubscribeSockets = [];
    });

    async function cancelEncode(id: number) {
        const ok = await confirmDialog({
            title: 'エンコードのキャンセル',
            message: 'このエンコードジョブをキャンセルしますか？',
            confirmText: 'キャンセル実行',
            cancelText: '戻る',
            isDestructive: true,
        });
        if (!ok) return;

        try {
            await api.encode[':encodeId'].$delete({ param: { encodeId: String(id) } });
            snackbar.open({ text: 'エンコードをキャンセルしました', color: 'success' });
            fetchEncode();
        } catch (e) {
            console.error('Cancel encode error', e);
            snackbar.open({ text: 'エンコードのキャンセルに失敗しました', color: 'error' });
        }
    }
</script>

{#if !readOnlyStore.canViewEncode}
    <ReadOnlyGuard
        description="エンコード一覧の閲覧は制限されています。録画一覧へリダイレクトします..."
        returnPath="/recorded"
        returnText="録画一覧へ"
    />
{:else}
    <div class="space-y-5 w-full max-w-full min-w-0">
        <div
            class="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
        >
            <div>
                <h1 class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                    <Film size={20} class="text-blue-600 dark:text-blue-400" />
                    エンコード一覧
                </h1>
                <p class="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    全 <span class="font-bold text-slate-900 dark:text-slate-100">
                        {running.length + waitList.length}
                    </span>
                    件
                    {#if running.length > 0}
                        <span class="text-slate-400">（実行中 {running.length} / 待機中 {waitList.length}）</span>
                    {/if}
                </p>
            </div>
            <Button variant="secondary" onclick={() => fetchEncode()} class="whitespace-nowrap shrink-0">
                <RefreshCw size={14} class={isLoading ? 'animate-spin' : ''} /> 更新
            </Button>
        </div>

        <!-- 実行中のエンコード -->
        <div
            class="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
        >
            <h2 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                実行中のエンコード ({running.length})
            </h2>
            {#if running.length === 0}
                <p class="py-6 text-center text-xs sm:text-sm text-slate-400">現在実行中のエンコードはありません</p>
            {:else}
                <div class="mt-3 space-y-3">
                    {#each running as item}
                        <div
                            class="rounded-xl border border-slate-100 bg-slate-50/50 p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-800/40 space-y-2.5"
                        >
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0 flex-1">
                                    <span
                                        class="inline-block rounded-md bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60"
                                    >
                                        {item.mode || 'MP4'}
                                    </span>
                                    <h3
                                        class="mt-1.5 text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 break-words"
                                    >
                                        {item.recorded?.name}
                                    </h3>
                                </div>
                                {#if !readOnlyStore.isReadOnly}
                                    <IconButton
                                        variant="danger-outline"
                                        onclick={() => cancelEncode(item.id)}
                                        class="mr-1 shrink-0"
                                        title="キャンセル"
                                        aria-label="エンコードをキャンセル"
                                    >
                                        <Trash2 size={16} />
                                    </IconButton>
                                {/if}
                            </div>

                            {#if typeof item.percent === 'number'}
                                <div class="space-y-1">
                                    <div
                                        class="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400"
                                    >
                                        <span>進捗</span>
                                        <span>{item.percent.toFixed(1)}%</span>
                                    </div>
                                    <div
                                        class="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                                    >
                                        <div
                                            class="h-full rounded-full bg-blue-600 transition-all duration-300"
                                            style="width: {item.percent}%"
                                        ></div>
                                    </div>
                                </div>
                            {:else}
                                <p class="text-xs text-slate-500 dark:text-slate-400">
                                    この動画は進捗の表示はできません
                                </p>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- 待機キュー -->
        <div
            class="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
        >
            <h2 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                待機キュー ({waitList.length})
            </h2>
            {#if waitList.length === 0}
                <p class="py-6 text-center text-xs sm:text-sm text-slate-400">待機中のエンコードはありません</p>
            {:else}
                <div class="mt-3 space-y-2">
                    {#each waitList as item}
                        <div
                            class="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-xs sm:text-sm dark:border-slate-800 dark:bg-slate-800/40"
                        >
                            <span class="min-w-0 flex-1 font-bold text-slate-800 dark:text-slate-200 truncate">
                                {item.recorded?.name}
                            </span>
                            {#if !readOnlyStore.isReadOnly}
                                <IconButton
                                    variant="danger-outline"
                                    size="sm"
                                    onclick={() => cancelEncode(item.id)}
                                    class="mr-1 shrink-0"
                                    title="キャンセル"
                                    aria-label="エンコードをキャンセル"
                                >
                                    <Trash2 size={15} />
                                </IconButton>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
{/if}
