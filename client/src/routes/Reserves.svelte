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

    // 予約オプション設定 (エンコードプリセット名 / 保存先ディレクトリ名)
    let encodeModes = $state<string[]>([]);
    let storageDirs = $state<string[]>([]);

    // 予約フォーム状態
    let saveParentDir = $state<string>(''); // TS保存先 (親ディレクトリ名)
    let saveSubDir = $state<string>(''); // TS保存先 (サブディレクトリ)
    let encRows = $state<{ mode: string; parentDir: string; subDir: string }[]>([
        { mode: '', parentDir: '', subDir: '' },
    ]);
    let isDeleteOriginal = $state(false);
    let isUpdating = $state(false);
    let allowEndLack = $state(false);

    // 予約フォームに既存の予約設定を反映
    function loadReserveForm(reserve: apid.ReserveItem) {
        saveParentDir = reserve.parentDirectoryName || '';
        saveSubDir = reserve.directory || '';
        allowEndLack = reserve.allowEndLack || false;
        encRows = [
            { mode: reserve.encodeMode1 || '', parentDir: reserve.encodeParentDirectoryName1 || '', subDir: reserve.encodeDirectory1 || '' },
            { mode: reserve.encodeMode2 || '', parentDir: reserve.encodeParentDirectoryName2 || '', subDir: reserve.encodeDirectory2 || '' },
            { mode: reserve.encodeMode3 || '', parentDir: reserve.encodeParentDirectoryName3 || '', subDir: reserve.encodeDirectory3 || '' },
        ].filter(r => r.mode || r.parentDir || r.subDir);
        if (encRows.length === 0) encRows = [{ mode: '', parentDir: '', subDir: '' }];
        isDeleteOriginal = reserve.isDeleteOriginalAfterEncode || false;
    }

    // エンコード行の追加 / 削除
    function addEncodeRow() {
        if (encRows.length >= 3) return;
        encRows = [...encRows, { mode: '', parentDir: '', subDir: '' }];
    }
    function removeEncodeRow(index: number) {
        encRows = encRows.filter((_, i) => i !== index);
        if (encRows.length === 0) encRows = [{ mode: '', parentDir: '', subDir: '' }];
    }

    // 予約フォームから saveOption を構築
    function buildSaveOption() {
        return {
            parentDirectoryName: saveParentDir || undefined,
            directory: saveSubDir || undefined,
        };
    }

    // 予約フォームから encodeOption を構築
    function buildEncodeOption() {
        const filled = encRows.filter(r => r.mode);
        return {
            mode1: filled[0]?.mode || undefined,
            encodeParentDirectoryName1: filled[0]?.parentDir || undefined,
            directory1: filled[0]?.subDir || undefined,
            mode2: filled[1]?.mode || undefined,
            encodeParentDirectoryName2: filled[1]?.parentDir || undefined,
            directory2: filled[1]?.subDir || undefined,
            mode3: filled[2]?.mode || undefined,
            encodeParentDirectoryName3: filled[2]?.parentDir || undefined,
            directory3: filled[2]?.subDir || undefined,
            isDeleteOriginalAfterEncode: isDeleteOriginal,
        };
    }

    // 予約設定の更新 (個別予約のみ)
    async function updateReserve(item: apid.ReserveItem) {
        if (!item || isUpdating) return;
        isUpdating = true;
        try {
            await axios.put(`/api/reserves/${item.id}`, {
                allowEndLack: allowEndLack,
                saveOption: buildSaveOption(),
                encodeOption: buildEncodeOption(),
            });
            snackbar.open({ text: `「${item.name}」の予約設定を更新しました`, color: 'success' });
            fetchReserves();
        } catch (e) {
            console.error('Failed to update reserve', e);
            snackbar.open({ text: '予約設定の更新に失敗しました', color: 'error' });
        } finally {
            isUpdating = false;
        }
    }

    // ルール予約の場合はルール編集ページへ遷移
    function goToRuleEdit(item: apid.ReserveItem) {
        isDetailModalOpen = false;
        router.push(`/rule/edit?id=${item.ruleId}`);
    }

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

        // エンコードプリセット名と保存先ディレクトリ名を取得
        axios.get('/api/config')
            .then(res => {
                encodeModes = res.data.encode || [];
                storageDirs = res.data.recorded || [];
            })
            .catch(e => console.error('Failed to fetch config', e));

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
        loadReserveForm(item);
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

                <!-- 録画オプション設定 -->
                {#if item.ruleId}
                    <!-- ルール予約: ルール側の設定が反映されるため、ルール編集ページへ誘導 -->
                    <div class="rounded-xl border border-purple-200 bg-purple-50/60 p-3.5 dark:border-purple-900/50 dark:bg-purple-950/30">
                        <h4 class="flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-300 mb-2">
                            <SlidersHorizontal size={13} /> 録画オプション
                        </h4>
                        <p class="text-xs leading-relaxed text-purple-700/80 dark:text-purple-300/80">
                            この予約は自動録画ルール (Rule #{item.ruleId}) によって作成されています。
                            保存先・エンコード設定・末尾欠け許可などの録画オプションは、ルール側で管理されます。
                        </p>
                        <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div class="rounded-lg bg-white/70 p-2.5 dark:bg-slate-800/60">
                                <span class="text-slate-400 text-[11px] block">保存先</span>
                                <span class="font-bold text-slate-800 dark:text-slate-200">
                                    {item.parentDirectoryName || 'デフォルト'} {item.directory ? `/ ${item.directory}` : ''}
                                </span>
                            </div>
                            <div class="rounded-lg bg-white/70 p-2.5 dark:bg-slate-800/60">
                                <span class="text-slate-400 text-[11px] block">エンコード設定</span>
                                <span class="font-bold text-slate-800 dark:text-slate-200">
                                    {item.encodeMode1 || 'なし'} {item.encodeMode2 ? `, ${item.encodeMode2}` : ''}
                                </span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onclick={() => goToRuleEdit(item)}
                            class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-700 cursor-pointer"
                        >
                            <SlidersHorizontal size={14} /> ルールを編集する
                        </button>
                    </div>
                {:else}
                <!-- 個別予約: 予約自体を編集可能 -->
                <div class="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-700 dark:bg-slate-800/30">
                    <h4 class="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 mb-3">
                        <SlidersHorizontal size={13} /> 録画オプション
                    </h4>

                    <!-- TS保存先 -->
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <span class="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">TS保存先 (親)</span>
                            <select
                                bind:value={saveParentDir}
                                class="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-hidden dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                            >
                                <option value="">デフォルト</option>
                                {#each storageDirs as dir}
                                    <option value={dir}>{dir}</option>
                                {/each}
                            </select>
                        </div>
                        <div>
                            <span class="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">TS保存先 (サブ)</span>
                            <input
                                type="text"
                                bind:value={saveSubDir}
                                placeholder="サブディレクトリ (任意)"
                                class="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
                            />
                        </div>
                    </div>

                    <!-- エンコード設定 -->
                    <div class="mt-3 space-y-2">
                        <div class="flex items-center justify-between">
                            <span class="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">エンコード設定</span>
                            {#if encRows.length < 3}
                                <button
                                    type="button"
                                    onclick={addEncodeRow}
                                    class="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                                >
                                    <Plus size={12} /> 追加
                                </button>
                            {/if}
                        </div>

                        {#each encRows as row, i}
                            <div class="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-600 dark:bg-slate-800">
                                <div class="flex items-center gap-2">
                                    <span class="text-[11px] font-bold text-slate-400">#{i + 1}</span>
                                    <select
                                        bind:value={row.mode}
                                        class="h-8 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-hidden dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                                    >
                                        <option value="">エンコードなし</option>
                                        {#each encodeModes as mode}
                                            <option value={mode}>{mode}</option>
                                        {/each}
                                    </select>
                                    {#if encRows.length > 1}
                                        <button
                                            type="button"
                                            onclick={() => removeEncodeRow(i)}
                                            class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-700"
                                            aria-label="エンコード行を削除"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    {/if}
                                </div>
                                <div class="mt-2 grid grid-cols-2 gap-2">
                                    <select
                                        bind:value={row.parentDir}
                                        class="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-hidden dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                                    >
                                        <option value="">保存先: デフォルト</option>
                                        {#each storageDirs as dir}
                                            <option value={dir}>{dir}</option>
                                        {/each}
                                    </select>
                                    <input
                                        type="text"
                                        bind:value={row.subDir}
                                        placeholder="サブディレクトリ (任意)"
                                        class="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
                                    />
                                </div>
                            </div>
                        {/each}
                    </div>

                    <!-- TSファイル削除 -->
                    <label class="mt-3 flex cursor-pointer items-center gap-2">
                        <input
                            type="checkbox"
                            bind:checked={isDeleteOriginal}
                            class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
                        />
                        <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            エンコード完了後に元のTSファイルを削除する
                        </span>
                    </label>

                    <!-- 末尾欠け許可 -->
                    <label class="mt-3 flex cursor-pointer items-center gap-2">
                        <input
                            type="checkbox"
                            bind:checked={allowEndLack}
                            class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
                        />
                        <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            状況に応じて末尾が欠けることを許可する
                        </span>
                    </label>
                </div>
                {/if}
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
                        class="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer"
                    >
                        <Search size={14} /> 類似番組を検索
                    </button>
                </div>

                <div class="flex items-center gap-2">
                    {#if !item.ruleId}
                        <button
                            type="button"
                            disabled={isUpdating}
                            onclick={() => updateReserve(item)}
                            class="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                        >
                            <CheckCircle2 size={14} /> 設定を更新
                        </button>
                    {/if}
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
