<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { socketStore } from '../lib/stores/socket.svelte';
    import { formatDate, formatTime, formatTimeRange, formatDuration } from '../lib/utils/format';
    import axios from 'axios';
    import type * as apid from '../../../api';
    import {
        Clock,
        Plus,
        AlertTriangle,
        Trash2,
        CheckCircle2,
        X,
        Info,
        Search,
        SlidersHorizontal,
        Ban,
        RotateCcw,
        Calendar
    } from '@lucide/svelte';

    let reserves = $state<apid.ReserveItem[]>([]);
    let total = $state(0);
    let isLoading = $state(true);
    let filterMode = $state<'all' | 'conflicts' | 'skips' | 'overlaps'>('all');

    // 予約詳細モーダル状態
    let isDetailModalOpen = $state(false);
    let selectedReserve = $state<apid.ReserveItem | null>(null);
    let isCanceling = $state(false);

    let unsubscribeSocket: (() => void) | null = null;

    async function fetchReserves(isSilent = false) {
        if (!isSilent) isLoading = true;
        try {
            await channelStore.fetch();
            const res = await axios.get('/api/reserves?limit=100&isHalfWidth=true');
            reserves = res.data.reserves || [];
            total = res.data.total || 0;
        } catch (e) {
            console.error('Failed to fetch reserves', e);
            if (!isSilent) snackbar.open({ text: '予約一覧の取得に失敗しました', color: 'error' });
        } finally {
            if (!isSilent) isLoading = false;
        }
    }

    onMount(() => {
        fetchReserves();

        // Socket.IO による予約変更通知を受信してリアルタイム更新
        unsubscribeSocket = socketStore.on('updateStatus', () => {
            fetchReserves(true);
        });
    });

    onDestroy(() => {
        unsubscribeSocket?.();
    });

    let filteredReserves = $derived(
        filterMode === 'conflicts'
            ? reserves.filter(r => r.isConflict)
            : filterMode === 'skips'
            ? reserves.filter(r => r.isSkip)
            : filterMode === 'overlaps'
            ? reserves.filter(r => r.isOverlap)
            : reserves
    );

    let conflictCount = $derived(reserves.filter(r => r.isConflict).length);
    let skipCount = $derived(reserves.filter(r => r.isSkip).length);
    let overlapCount = $derived(reserves.filter(r => r.isOverlap).length);

    // 予約キャンセル / 取り消し
    async function cancelReserve(item: apid.ReserveItem, e?: MouseEvent) {
        if (e) e.stopPropagation();
        const actionLabel = item.ruleId ? 'この回の録画をスキップ（除外）' : '予約を取り消し';
        if (!confirm(`「${item.name}」の${actionLabel}しますか？`)) return;

        isCanceling = true;
        try {
            await axios.delete(`/api/reserves/${item.id}`);
            snackbar.open({ text: `${actionLabel}しました`, color: 'success' });
            if (isDetailModalOpen) isDetailModalOpen = false;
            fetchReserves();
        } catch (e) {
            console.error('Failed to cancel reserve', e);
            snackbar.open({ text: '予約の取り消しに失敗しました', color: 'error' });
        } finally {
            isCanceling = false;
        }
    }

    // スキップ解除 (予約復活)
    async function restoreSkip(item: apid.ReserveItem, e?: MouseEvent) {
        if (e) e.stopPropagation();
        try {
            await axios.delete(`/api/reserves/${item.id}/skip`);
            snackbar.open({ text: '予約を復活しました', color: 'success' });
            if (isDetailModalOpen) isDetailModalOpen = false;
            fetchReserves();
        } catch (e) {
            console.error('Failed to restore skip', e);
            snackbar.open({ text: '予約の復活に失敗しました', color: 'error' });
        }
    }

    function openReserveDetail(item: apid.ReserveItem) {
        selectedReserve = item;
        isDetailModalOpen = true;
    }
</script>

<div class="space-y-5 w-full max-w-full min-w-0">
    <!-- ヘッダー & アクション -->
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div>
            <h1 class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                <Clock size={20} class="text-amber-500" />
                予約一覧
            </h1>
            <p class="text-xs text-slate-500 dark:text-slate-400">
                全 <span class="font-bold text-slate-900 dark:text-slate-100">{total}</span> 件の録画予約（クリックで詳細確認・キャンセル）
            </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
            <!-- フィルタータブ -->
            <div class="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                <button
                    type="button"
                    onclick={() => filterMode = 'all'}
                    class="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer {filterMode === 'all'
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100 font-bold'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'}"
                >
                    すべて ({total})
                </button>
                <button
                    type="button"
                    onclick={() => filterMode = 'conflicts'}
                    class="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer {filterMode === 'conflicts'
                        ? 'bg-rose-600 text-white font-bold shadow-xs'
                        : conflictCount > 0 ? 'text-rose-600 font-bold' : 'text-slate-500'}"
                >
                    <AlertTriangle size={12} /> 競合 ({conflictCount})
                </button>
                <button
                    type="button"
                    onclick={() => filterMode = 'skips'}
                    class="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer {filterMode === 'skips'
                        ? 'bg-amber-500 text-white font-bold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'}"
                >
                    スキップ ({skipCount})
                </button>
                <button
                    type="button"
                    onclick={() => filterMode = 'overlaps'}
                    class="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer {filterMode === 'overlaps'
                        ? 'bg-slate-700 text-white font-bold shadow-xs dark:bg-slate-600'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'}"
                >
                    重複 ({overlapCount})
                </button>
            </div>

            <!-- 手動予約ボタン -->
            <button
                type="button"
                onclick={() => router.push('/reserves/manual')}
                class="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 transition cursor-pointer"
            >
                <Plus size={15} /> 手動予約を追加
            </button>
        </div>
    </div>

    <!-- コンテンツ表示 -->
    {#if isLoading}
        <div class="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <p class="text-sm font-medium text-slate-400">予約データを読み込み中...</p>
        </div>
    {:else if filteredReserves.length === 0}
        <div class="flex h-64 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
            <Clock size={36} class="text-slate-300 dark:text-slate-600" />
            <p class="mt-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                {#if filterMode === 'conflicts'}
                    チューナー競合している予約はありません
                {:else if filterMode === 'skips'}
                    スキップ中の予約はありません
                {:else}
                    録画予約はありません
                {/if}
            </p>
            <p class="text-xs text-slate-400">番組表や検索画面から録画予約を追加できます</p>
        </div>
    {:else}
        <!-- テーブル表示 -->
        <div class="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                    <thead class="border-b border-slate-200 bg-slate-50 font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                        <tr>
                            <th class="px-4 py-3.5">放送日時</th>
                            <th class="px-4 py-3.5">放送局</th>
                            <th class="px-4 py-3.5">種別</th>
                            <th class="px-4 py-3.5">番組名 / 概要</th>
                            <th class="px-4 py-3.5">時間</th>
                            <th class="px-4 py-3.5">状態</th>
                            <th class="px-4 py-3.5 text-right w-32">キャンセル / 操作</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                        {#each filteredReserves as item}
                            <tr
                                onclick={() => openReserveDetail(item)}
                                class="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer {item.isConflict ? 'bg-rose-50/40 dark:bg-rose-950/20' : item.isSkip ? 'opacity-60 bg-slate-50/50 dark:bg-slate-900/40' : ''}"
                            >
                                <!-- 放送日時 -->
                                <td class="whitespace-nowrap px-4 py-3.5 font-medium text-slate-600 dark:text-slate-400">
                                    {formatDate(item.startAt)} {formatTime(item.startAt)}
                                </td>

                                <!-- 放送局 -->
                                <td class="whitespace-nowrap px-4 py-3.5">
                                    <span class="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                        {channelStore.getChannelName(item.channelId)}
                                    </span>
                                </td>

                                <!-- 種別 (ルール / 個別) -->
                                <td class="whitespace-nowrap px-4 py-3.5">
                                    {#if item.ruleId}
                                        <span class="rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                                            ルール
                                        </span>
                                    {:else}
                                        <span class="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                            個別予約
                                        </span>
                                    {/if}
                                </td>

                                <!-- 番組名 & 概要 -->
                                <td class="px-4 py-3.5">
                                    <div class="font-bold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400">
                                        {item.name}
                                    </div>
                                    {#if item.description}
                                        <p class="mt-0.5 line-clamp-1 text-xs text-slate-400">{item.description}</p>
                                    {/if}
                                </td>

                                <!-- 番組長 -->
                                <td class="whitespace-nowrap px-4 py-3.5 font-medium text-slate-500 dark:text-slate-400">
                                    {formatDuration(item.endAt - item.startAt)}
                                </td>

                                <!-- 状態バッジ -->
                                <td class="whitespace-nowrap px-4 py-3.5">
                                    {#if item.isConflict}
                                        <span class="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                                            <AlertTriangle size={12} /> チューナー競合
                                        </span>
                                    {:else if item.isSkip}
                                        <span class="inline-flex items-center gap-1 rounded-md bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                            <Ban size={12} /> スキップ中
                                        </span>
                                    {:else if item.isOverlap}
                                        <span class="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                            重複スキップ
                                        </span>
                                    {:else}
                                        <span class="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                                            予約完了
                                        </span>
                                    {/if}
                                </td>

                                <!-- キャンセル / 操作ボタン -->
                                <td class="whitespace-nowrap px-4 py-3.5 text-right">
                                    {#if item.isSkip}
                                        <button
                                            type="button"
                                            onclick={(e) => restoreSkip(item, e)}
                                            class="inline-flex items-center gap-1 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 transition cursor-pointer"
                                            title="スキップを解除して予約を復活"
                                        >
                                            <RotateCcw size={12} /> 復活
                                        </button>
                                    {:else}
                                        <button
                                            type="button"
                                            onclick={(e) => cancelReserve(item, e)}
                                            class="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-600 shadow-2xs hover:bg-rose-50 dark:border-rose-900/50 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/40 transition cursor-pointer"
                                            title={item.ruleId ? 'この回の録画をスキップ' : '予約を取り消し'}
                                        >
                                            <Trash2 size={12} /> キャンセル
                                        </button>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}
</div>

<!-- 予約詳細ポップアップモーダル -->
{#if isDetailModalOpen && selectedReserve}
    {@const item = selectedReserve}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
        <!-- バックドロップ -->
        <button
            type="button"
            class="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
            onclick={() => isDetailModalOpen = false}
            aria-label="背景をクリックして閉じる"
        ></button>

        <!-- モーダル本体 -->
        <div class="relative flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
            <!-- モーダルヘッダー -->
            <div class="flex items-start justify-between border-b border-slate-100 p-4 dark:border-slate-800">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            {channelStore.getChannelName(item.channelId)}
                        </span>
                        {#if item.ruleId}
                            <span class="rounded-md bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                                自動録画ルール予約 (Rule #{item.ruleId})
                            </span>
                        {:else}
                            <span class="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                個別手動予約
                            </span>
                        {/if}
                    </div>
                    <h2 class="mt-2 text-base font-black text-slate-900 dark:text-slate-100">
                        {item.name}
                    </h2>
                </div>
                <button
                    type="button"
                    onclick={() => isDetailModalOpen = false}
                    class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                    aria-label="モーダルを閉じる"
                >
                    <X size={18} />
                </button>
            </div>

            <!-- モーダルコンテンツ -->
            <div class="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
                <!-- 放送日時・状態 -->
                <div class="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40 space-y-2">
                    <div class="flex items-center justify-between text-slate-700 dark:text-slate-300 font-bold">
                        <span class="flex items-center gap-1.5">
                            <Clock size={15} class="text-blue-600" />
                            {formatTimeRange(item.startAt, item.endAt)} ({formatDuration(item.endAt - item.startAt)})
                        </span>
                        {#if item.isConflict}
                            <span class="text-rose-600 font-bold flex items-center gap-1">
                                <AlertTriangle size={13} /> チューナー競合
                            </span>
                        {:else if item.isSkip}
                            <span class="text-amber-600 font-bold flex items-center gap-1">
                                <Ban size={13} /> スキップ中
                            </span>
                        {:else}
                            <span class="text-emerald-600 font-bold flex items-center gap-1">
                                <CheckCircle2 size={13} /> 正常予約
                            </span>
                        {/if}
                    </div>
                </div>

                <!-- 番組概要 -->
                {#if item.description}
                    <div>
                        <h4 class="font-bold text-slate-700 dark:text-slate-300 mb-1">番組概要</h4>
                        <p class="leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/20">
                            {item.description}
                        </p>
                    </div>
                {/if}

                <!-- 詳細情報 / 出演者 / あらすじ -->
                {#if item.extended}
                    <div>
                        <h4 class="font-bold text-slate-700 dark:text-slate-300 mb-1">詳細情報・出演者</h4>
                        <div class="space-y-2 rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/20 max-h-52 overflow-y-auto">
                            {#if typeof item.extended === 'object'}
                                {#each Object.entries(item.extended) as [key, value]}
                                    <div>
                                        <span class="font-bold text-blue-600 dark:text-blue-400">{key}:</span>
                                        <p class="mt-0.5 text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                                            {value}
                                        </p>
                                    </div>
                                {/each}
                            {:else}
                                <p class="text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                                    {item.extended}
                                </p>
                            {/if}
                        </div>
                    </div>
                {/if}

                <!-- 保存・エンコード情報 -->
                <div class="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/40">
                        <span class="text-slate-400 text-[11px] block">保存先</span>
                        <span class="font-bold text-slate-800 dark:text-slate-200">
                            {item.parentDirectoryName || 'デフォルト'} {item.directory ? `/ ${item.directory}` : ''}
                        </span>
                    </div>
                    <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/40">
                        <span class="text-slate-400 text-[11px] block">エンコード設定</span>
                        <span class="font-bold text-slate-800 dark:text-slate-200">
                            {item.encodeMode1 || 'なし'} {item.encodeMode2 ? `, ${item.encodeMode2}` : ''}
                        </span>
                    </div>
                </div>
            </div>

            <!-- モーダルフッター -->
            <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
                <div class="flex items-center gap-2">
                    <button
                        type="button"
                        onclick={() => {
                            isDetailModalOpen = false;
                            router.push(`/search?keyword=${encodeURIComponent(item.name)}`);
                        }}
                        class="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                    >
                        <Search size={14} /> 類似番組を検索
                    </button>
                    {#if item.ruleId}
                        <button
                            type="button"
                            onclick={() => {
                                isDetailModalOpen = false;
                                router.push('/rule');
                            }}
                            class="flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-bold text-purple-700 hover:bg-purple-100 dark:border-purple-900/50 dark:bg-purple-950/40 dark:text-purple-300 cursor-pointer"
                        >
                            <SlidersHorizontal size={14} /> ルール一覧を見る
                        </button>
                    {/if}
                </div>

                <div class="flex items-center gap-2">
                    {#if item.isSkip}
                        <button
                            type="button"
                            onclick={() => restoreSkip(item)}
                            class="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 cursor-pointer"
                        >
                            <RotateCcw size={14} /> 予約を復活する
                        </button>
                    {:else}
                        <button
                            type="button"
                            disabled={isCanceling}
                            onclick={() => cancelReserve(item)}
                            class="flex items-center gap-1.5 rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                        >
                            <Trash2 size={14} /> {item.ruleId ? 'この回をスキップ (キャンセル)' : '予約をキャンセル'}
                        </button>
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/if}
