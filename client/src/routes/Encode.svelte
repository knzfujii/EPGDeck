<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { confirmDialog } from '../lib/stores/confirm.svelte';
    import { socketStore } from '../lib/stores/socket.svelte';
    import { readOnlyStore } from '../lib/stores/readOnly.svelte';
    import http from '@/lib/httpClient';
    import { Film, CheckCircle2, Trash2, RefreshCw, Lock } from '@lucide/svelte';

    let running = $state<any[]>([]);
    let waitList = $state<any[]>([]);
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
            const res = await http.get('/api/encode?isHalfWidth=true');
            running = res.data.runningItems || [];
            waitList = res.data.waitItems || [];
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
            await http.delete(`/api/encode/${id}`);
            snackbar.open({ text: 'エンコードをキャンセルしました', color: 'success' });
            fetchEncode();
        } catch (e) {
            console.error('Cancel encode error', e);
            snackbar.open({ text: 'エンコードのキャンセルに失敗しました', color: 'error' });
        }
    }
</script>

{#if !readOnlyStore.canViewEncode}
    <div class="flex flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50/50 p-8 text-center dark:border-amber-950/60 dark:bg-amber-950/20">
        <Lock size={32} class="text-amber-500 mb-2" />
        <h3 class="text-sm font-bold text-slate-800 dark:text-slate-200">閲覧専用モード</h3>
        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">エンコード管理の閲覧は制限されています。録画済み一覧へリダイレクトします...</p>
        <button
            type="button"
            onclick={() => router.replace('/recorded')}
            class="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 cursor-pointer"
        >
            録画済み一覧へ
        </button>
    </div>
{:else}
    <div class="space-y-5 w-full max-w-full min-w-0">
    <div class="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div>
            <h1 class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                <Film size={20} class="text-blue-600 dark:text-blue-400" />
                エンコード管理
            </h1>
            <p class="text-xs text-slate-500 dark:text-slate-400">録画ファイルのバックグラウンド変換キュー（リアルタイム同期中）</p>
        </div>
        <button
            type="button"
            onclick={() => fetchEncode()}
            class="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer"
        >
            <RefreshCw size={13} class={isLoading ? 'animate-spin' : ''} /> 更新
        </button>
    </div>

    <!-- 実行中のエンコード -->
    <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <h2 class="text-sm font-bold text-slate-900 dark:text-slate-100">実行中のエンコード ({running.length})</h2>
        {#if running.length === 0}
            <p class="py-6 text-center text-xs text-slate-400">現在実行中のエンコードはありません</p>
        {:else}
            <div class="mt-3 space-y-3">
                {#each running as item}
                    <div class="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40 space-y-2">
                        <div class="flex items-center justify-between">
                            <div>
                                <span class="rounded bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                    {item.mode || 'MP4'}
                                </span>
                                <h3 class="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">{item.recorded?.name}</h3>
                            </div>
                            {#if !readOnlyStore.isReadOnly}
                                <button
                                    type="button"
                                    onclick={() => cancelEncode(item.id)}
                                    class="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950 cursor-pointer"
                                    title="キャンセル"
                                >
                                    <Trash2 size={16} />
                                </button>
                            {/if}
                        </div>

                        {#if typeof item.percent === 'number'}
                            <div class="space-y-1">
                                <div class="flex items-center justify-between text-[11px] font-bold text-slate-500">
                                    <span>進捗</span>
                                    <span>{item.percent.toFixed(1)}%</span>
                                </div>
                                <div class="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                    <div
                                        class="h-full rounded-full bg-blue-600 transition-all duration-300"
                                        style="width: {item.percent}%"
                                    ></div>
                                </div>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <!-- 待機キュー -->
    <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <h2 class="text-sm font-bold text-slate-900 dark:text-slate-100">待機キュー ({waitList.length})</h2>
        {#if waitList.length === 0}
            <p class="py-6 text-center text-xs text-slate-400">待機中のエンコードはありません</p>
        {:else}
            <div class="mt-3 space-y-2">
                {#each waitList as item}
                    <div class="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/40">
                        <span class="font-bold text-slate-800 dark:text-slate-200">{item.recorded?.name}</span>
                        {#if !readOnlyStore.isReadOnly}
                            <button
                                type="button"
                                onclick={() => cancelEncode(item.id)}
                                class="rounded-lg p-1 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950 cursor-pointer"
                            >
                                <Trash2 size={14} />
                            </button>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</div>
{/if}

