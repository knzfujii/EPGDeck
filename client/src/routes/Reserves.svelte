<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { confirmDialog } from '../lib/stores/confirm.svelte';
    import { socketStore } from '../lib/stores/socket.svelte';
    import { readOnlyStore } from '../lib/stores/readOnly.svelte';
    import { configStore } from '../lib/stores/config.svelte';
    import { formatDate, formatTime, formatTimeRange, formatDuration, formatSize } from '../lib/utils/format';
    import {
        isReserveCurrentlyRecording,
        executeRecordingAction,
        type RecordingActionType,
    } from '../lib/utils/recording';
    import api from '@/lib/apiClient';
    import type * as apid from '../../../api';
    import LoadingState from '../lib/components/common/LoadingState.svelte';
    import EmptyState from '../lib/components/common/EmptyState.svelte';
    import Badge from '../lib/components/common/Badge.svelte';
    import FilterTabs from '../lib/components/common/FilterTabs.svelte';
    import Button from '../lib/components/common/Button.svelte';
    import Divider from '../lib/components/common/Divider.svelte';
    import {
        Clock,
        Plus,
        AlertTriangle,
        Trash2,
        CheckCircle2,
        X,
        Info,
        SlidersHorizontal,
        Ban,
        RotateCcw,
        Play,
        Square,
        History,
        ExternalLink,
        Film,
        Loader2,
        Search,
    } from '@lucide/svelte';
    import RecordingActionModal from '../lib/components/recording/RecordingActionModal.svelte';
    import RecordingOptionForm from '../lib/components/recording/RecordingOptionForm.svelte';
    import { RecordingOptionFormState } from '../lib/stores/recordingOptionForm.svelte';

    interface ReserveWithRecording extends apid.ReserveItem {
        isRecording?: boolean;
    }

    let reserves = $state<ReserveWithRecording[]>([]);
    let total = $state(0);
    let isLoading = $state(true);
    let filterMode = $state<'all' | 'conflicts' | 'skips' | 'overlaps'>('all');

    // 予約詳細モーダル状態
    let isDetailModalOpen = $state(false);
    let selectedReserve = $state<ReserveWithRecording | null>(null);
    let isCanceling = $state(false);
    let cancelingReserveId = $state<number | null>(null);
    let restoringReserveId = $state<number | null>(null);

    // 録画中番組の操作モーダル状態
    let isRecordingActionModalOpen = $state(false);
    let recordingActionItem = $state<ReserveWithRecording | null>(null);
    let isRecordingActionProcessing = $state(false);

    // 予約オプション設定 (エンコードプリセット名 / 保存先ディレクトリ名)
    let encodeModes = $state<string[]>([]);
    let storageDirs = $state<string[]>([]);

    // 予約フォーム状態
    const recOptions = new RecordingOptionFormState();
    let isUpdating = $state(false);

    // 予約フォームに既存の予約設定を反映
    function loadReserveForm(reserve: apid.ReserveItem) {
        recOptions.load(reserve);
    }

    // 予約設定の更新 (個別予約のみ)
    async function updateReserve(item: apid.ReserveItem) {
        if (!item || isUpdating) return;
        isUpdating = true;
        try {
            await api.reserves[':reserveId'].$put({
                param: { reserveId: String(item.id) },
                json: {
                    allowEndLack: recOptions.allowEndLack,
                    saveOption: recOptions.buildSaveOption(),
                    encodeOption: recOptions.buildEncodeOption(),
                },
            });
            snackbar.open({ text: `「${item.name}」の予約設定を更新しました`, color: 'success' });
            await fetchReserves(true);
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
        router.push(`/rule/edit?ruleId=${item.ruleId}`);
    }

    let unsubscribeSocket: (() => void) | null = null;

    function getRecordingProgress(startAt: number, endAt: number): number {
        const now = Date.now();
        if (now <= startAt) return 0;
        if (now >= endAt) return 100;
        return Math.round(((now - startAt) / (endAt - startAt)) * 100);
    }

    async function fetchReserves(isSilent = false) {
        if (!isSilent) isLoading = true;
        try {
            await channelStore.fetch();
            const [reservesRes, recordingRes] = await Promise.all([
                api.reserves
                    .$get({ query: { limit: 100, isHalfWidth: true } })
                    .then(async r => (r.ok ? await r.json() : { reserves: [], total: 0 })),
                api.recording
                    .$get({ query: { isHalfWidth: true } })
                    .then(async r => (r.ok ? await r.json() : { records: [] }))
                    .catch(() => ({ records: [] })),
            ]);

            const recordingList = recordingRes.records || [];
            const now = Date.now();
            const rawReserves: apid.ReserveItem[] = (reservesRes.reserves as apid.ReserveItem[]) || [];

            reserves = rawReserves.map(r => {
                return {
                    ...r,
                    isRecording: isReserveCurrentlyRecording(r, recordingList, now),
                };
            });
            total = reservesRes.total || 0;
        } catch (e) {
            console.error('Failed to fetch reserves', e);
            if (!isSilent) snackbar.open({ text: '予約一覧の取得に失敗しました', color: 'error' });
        } finally {
            if (!isSilent) isLoading = false;
        }
    }

    $effect(() => {
        if (!readOnlyStore.canViewReserves) {
            router.replace('/recorded');
        }
    });

    onMount(() => {
        if (!readOnlyStore.canViewReserves) {
            router.replace('/recorded');
            return;
        }
        fetchReserves();

        // エンコードプリセット名と保存先ディレクトリ名を取得
        configStore
            .fetch()
            .then(() => {
                encodeModes = configStore.encodeModeNames;
                storageDirs = configStore.recordedDirs;
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
                : reserves,
    );

    let conflictCount = $derived(reserves.filter(r => r.isConflict).length);
    let skipCount = $derived(reserves.filter(r => r.isSkip).length);
    let overlapCount = $derived(reserves.filter(r => r.isOverlap).length);

    // 予約キャンセル / 取り消し
    async function cancelReserve(item: ReserveWithRecording, e?: MouseEvent) {
        if (e) e.stopPropagation();

        // 録画中の番組の場合は専用の操作選択ダイアログを開く
        if (item.isRecording === true) {
            recordingActionItem = item;
            isRecordingActionModalOpen = true;
            return;
        }

        const actionLabel = item.ruleId ? 'この回の録画をスキップ（除外）' : '予約を取り消し';
        const ok = await confirmDialog({
            title: item.ruleId ? '録画のスキップ' : '予約の取り消し',
            message: `「${item.name}」の${actionLabel}しますか？`,
            confirmText: '実行',
            cancelText: 'キャンセル',
            isDestructive: true,
        });
        if (!ok) return;

        isCanceling = true;
        cancelingReserveId = item.id;
        try {
            await api.reserves[':reserveId'].$delete({ param: { reserveId: String(item.id) } });
            snackbar.open({ text: `${actionLabel}しました`, color: 'success' });
            if (isDetailModalOpen) isDetailModalOpen = false;
            await fetchReserves(true);
        } catch (e) {
            console.error('Failed to cancel reserve', e);
            snackbar.open({ text: '予約の取り消しに失敗しました', color: 'error' });
        } finally {
            isCanceling = false;
            cancelingReserveId = null;
        }
    }

    // 録画中番組の操作ハンドラー
    async function handleRecordingAction(action: RecordingActionType) {
        if (!recordingActionItem) return;
        isRecordingActionProcessing = true;

        try {
            const success = await executeRecordingAction(recordingActionItem, action, snackbar);
            if (success) {
                isRecordingActionModalOpen = false;
                recordingActionItem = null;
                if (isDetailModalOpen) isDetailModalOpen = false;
                await fetchReserves(true);
            }
        } finally {
            isRecordingActionProcessing = false;
        }
    }

    // スキップ解除 (予約復活)
    async function restoreSkip(item: apid.ReserveItem, e?: MouseEvent) {
        if (e) e.stopPropagation();
        restoringReserveId = item.id;
        try {
            await api.reserves[':reserveId'].skip.$delete({ param: { reserveId: String(item.id) } });
            snackbar.open({ text: '予約を復活しました', color: 'success' });
            if (isDetailModalOpen) isDetailModalOpen = false;
            await fetchReserves(true);
        } catch (e) {
            console.error('Failed to restore skip', e);
            snackbar.open({ text: '予約の復活に失敗しました', color: 'error' });
        } finally {
            restoringReserveId = null;
        }
    }

    // 重複確認専用モーダル状態
    let duplicatesData = $state<apid.ReserveDuplicates | null>(null);
    let isLoadingDuplicates = $state(false);
    let isDuplicateModalOpen = $state(false);
    let duplicateModalReserve = $state<apid.ReserveItem | null>(null);
    let restoringOverlapReserveId = $state<number | null>(null);

    async function loadDuplicates(reserveId: number) {
        isLoadingDuplicates = true;
        duplicatesData = null;
        try {
            const res = await api.reserves[':reserveId'].duplicates.$get({
                param: { reserveId: String(reserveId) },
                query: { isHalfWidth: 'true' },
            });
            if (res.ok) {
                duplicatesData = await res.json();
            }
        } catch (e) {
            console.error('Failed to load duplicates', e);
        } finally {
            isLoadingDuplicates = false;
        }
    }

    function openDuplicateModal(reserve: apid.ReserveItem, e?: MouseEvent) {
        if (e) e.stopPropagation();
        duplicateModalReserve = reserve;
        isDuplicateModalOpen = true;
        loadDuplicates(reserve.id);
    }

    // 重複解除（この回を録画）
    async function restoreOverlap(item: apid.ReserveItem, e?: MouseEvent) {
        if (e) e.stopPropagation();

        const timeStr = formatTimeRange(item.startAt, item.endAt);
        const ok = await confirmDialog({
            title: 'この回を録画',
            message: `「${item.name}」（${timeStr}）の重複スキップを解除し、この回を録画しますか？（過去の録画履歴や他の重複予約には影響しません）`,
            confirmText: '録画する',
            cancelText: 'キャンセル',
            isDestructive: false,
        });
        if (!ok) return;

        restoringOverlapReserveId = item.id;
        try {
            await api.reserves[':reserveId'].overlap.$delete({ param: { reserveId: String(item.id) } });
            snackbar.open({
                text: `「${item.name}」の重複を解除し、この回の録画予約を有効化しました`,
                color: 'success',
            });
            if (isDuplicateModalOpen) isDuplicateModalOpen = false;
            if (isDetailModalOpen) isDetailModalOpen = false;
            await fetchReserves(true);
        } catch (e) {
            console.error('Failed to restore overlap', e);
            snackbar.open({ text: '重複の解除に失敗しました', color: 'error' });
        } finally {
            restoringOverlapReserveId = null;
        }
    }

    function openReserveDetail(item: apid.ReserveItem) {
        selectedReserve = item;
        loadReserveForm(item);
        isDetailModalOpen = true;
    }
</script>

<div class="flex flex-col gap-5 w-full max-w-full min-w-0">
    <!-- ヘッダー & アクション -->
    <div
        class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
    >
        <div class="flex items-center justify-between gap-2">
            <div>
                <h1 class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                    <Clock size={20} class="text-amber-500" />
                    予約一覧
                </h1>
                <p class="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    {#if filterMode !== 'all'}
                        <span class="font-bold text-slate-900 dark:text-slate-100">{filteredReserves.length}</span>
                        件 / 全 {total} 件
                    {:else}
                        全 <span class="font-bold text-slate-900 dark:text-slate-100">{total}</span>
                        件
                    {/if}
                </p>
            </div>

            <!-- スマホ用手動予約ボタン -->
            {#if !readOnlyStore.isReadOnly}
                <Button
                    variant="primary"
                    size="compact"
                    onclick={() => router.push('/reserves/manual')}
                    class="sm:hidden whitespace-nowrap shrink-0"
                >
                    <Plus size={14} /> 予約追加
                </Button>
            {/if}
        </div>

        <div class="flex items-center gap-2.5 min-w-0 max-w-full w-full sm:w-auto">
            <!-- フィルタータブ -->
            <FilterTabs
                class="w-full sm:w-auto"
                tabs={[
                    { id: 'all', label: 'すべて', count: total },
                    { id: 'overlaps', label: '重複', count: overlapCount },
                    { id: 'skips', label: 'スキップ', count: skipCount },
                    { id: 'conflicts', label: '競合', count: conflictCount, icon: AlertTriangle },
                ]}
                activeTab={filterMode}
                onselect={id => (filterMode = id)}
            />

            <!-- 手動予約ボタン (PC用) -->
            {#if !readOnlyStore.isReadOnly}
                <div class="hidden sm:inline-flex shrink-0">
                    <Button
                        variant="primary"
                        onclick={() => router.push('/reserves/manual')}
                        class="whitespace-nowrap shrink-0"
                    >
                        <Plus size={16} /> 予約追加
                    </Button>
                </div>
            {/if}
        </div>
    </div>

    <!-- コンテンツ表示 -->
    {#if isLoading}
        <LoadingState message="予約データを読み込み中..." />
    {:else if filteredReserves.length === 0}
        <EmptyState
            icon={Clock}
            title={filterMode === 'conflicts'
                ? 'チューナー競合している予約はありません'
                : filterMode === 'skips'
                  ? 'スキップ中の予約はありません'
                  : '録画予約はありません'}
            description={readOnlyStore.isReadOnly ? undefined : '番組表や検索画面から録画予約を追加できます'}
        />
    {:else}
        <!-- テーブル表示 -->
        <!-- モバイル表示: カード型予約リスト (md:hidden) -->
        <div class="flex flex-col gap-3 md:hidden">
            {#each filteredReserves as item (item.id)}
                <div
                    role="button"
                    tabindex="0"
                    onclick={() => openReserveDetail(item)}
                    onkeydown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openReserveDetail(item);
                        }
                    }}
                    class="rounded-2xl border p-3.5 shadow-xs transition cursor-pointer border-l-4 {item.isRecording
                        ? 'border-l-rose-600 border-rose-300 bg-rose-100 hover:border-rose-400 dark:border-rose-800 dark:bg-rose-950/60'
                        : item.isConflict
                          ? 'border-l-red-600 border-red-300 bg-red-100 hover:border-red-400 dark:border-red-800 dark:bg-red-950/60'
                          : item.isSkip || item.isOverlap
                            ? 'border-l-slate-400 border-slate-300 bg-slate-200/80 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            : 'border-l-transparent border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'}"
                >
                    <!-- 1行目: 日時・局・種別・状態 -->
                    <div class="flex items-center justify-between gap-2 flex-wrap text-xs">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="font-bold text-slate-900 dark:text-slate-100">
                                {formatDate(item.startAt)}
                                {formatTime(item.startAt)}{item.endAt ? ` - ${formatTime(item.endAt)}` : ''}
                            </span>
                            <Badge variant="channel" text={channelStore.getChannelName(item.channelId)} />
                            <Badge
                                variant={item.ruleId ? 'rule' : 'manual'}
                                text={item.ruleId ? 'ルール' : '個別'}
                                size="xs"
                            />
                        </div>

                        <!-- 状態バッジ -->
                        <div>
                            {#if item.isRecording}
                                <Badge variant="recording" size="xs" />
                            {:else if item.isConflict}
                                <Badge variant="conflict" size="xs" />
                            {:else if item.isSkip}
                                <Badge variant="skip" size="xs" />
                            {:else if item.isOverlap}
                                <Badge variant="overlap" size="xs" />
                            {:else}
                                <span
                                    class="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                                >
                                    予約完了
                                </span>
                            {/if}
                        </div>
                    </div>

                    <!-- 2行目: 番組名 & 概要 -->
                    <div class="mt-2">
                        <h3 class="program-title-dense hover:text-blue-600 dark:hover:text-blue-400 text-sm">
                            {item.name}
                        </h3>
                        {#if item.description}
                            <p class="program-summary mt-1 line-clamp-2 leading-snug">
                                {item.description}
                            </p>
                        {/if}
                    </div>

                    <!-- 録画進捗バー (録画中のみ) -->
                    {#if item.isRecording}
                        <div class="mt-2.5 flex items-center gap-2">
                            <div class="h-2 flex-1 overflow-hidden rounded-full bg-rose-200 dark:bg-rose-950">
                                <div
                                    class="h-full rounded-full bg-rose-600 transition-all duration-500"
                                    style="width: {getRecordingProgress(item.startAt, item.endAt)}%"
                                ></div>
                            </div>
                            <span class="text-xs font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                                {getRecordingProgress(item.startAt, item.endAt)}%
                            </span>
                        </div>
                    {/if}

                    <!-- 3行目: 長さ & アクションボタン（端からのインセット余白確保） -->
                    <div
                        class="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between pr-1"
                    >
                        <span class="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {formatDuration(item.endAt - item.startAt)}
                        </span>

                        <div class="flex items-center gap-2">
                            {#if item.isRecording && readOnlyStore.canLiveStream}
                                <Button
                                    variant="primary"
                                    size="compact"
                                    onclick={e => {
                                        e.stopPropagation();
                                        router.push(`/onair/watch?channelId=${item.channelId}&type=m2tsll&mode=0`);
                                    }}
                                >
                                    <Play size={13} fill="currentColor" /> 視聴
                                </Button>
                            {/if}
                            {#if !readOnlyStore.isReadOnly}
                                {#if item.isSkip}
                                    <Button
                                        variant="secondary"
                                        size="compact"
                                        disabled={restoringReserveId === item.id}
                                        onclick={e => restoreSkip(item, e)}
                                        class="bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900/60"
                                    >
                                        <RotateCcw size={13} /> 復活
                                    </Button>
                                {:else if item.isOverlap}
                                    <Button
                                        variant="secondary"
                                        size="compact"
                                        onclick={e => openDuplicateModal(item, e)}
                                        class="bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800"
                                    >
                                        <Search size={13} /> 重複確認
                                    </Button>
                                {:else}
                                    {#if item.isRecording && readOnlyStore.canLiveStream}
                                        <Divider orientation="vertical" />
                                    {/if}
                                    <Button
                                        variant="danger-outline"
                                        size="compact"
                                        disabled={cancelingReserveId === item.id}
                                        onclick={e => cancelReserve(item, e)}
                                        title={item.isRecording
                                            ? '録画を停止・破棄'
                                            : item.ruleId
                                              ? 'この回の録画をスキップ'
                                              : '予約を取り消し'}
                                    >
                                        {#if item.isRecording}
                                            <Square size={12} fill="currentColor" /> 停止
                                        {:else}
                                            <Trash2 size={12} /> キャンセル
                                        {/if}
                                    </Button>
                                {/if}
                            {/if}
                        </div>
                    </div>
                </div>
            {/each}
        </div>

        <!-- デスクトップ表示: テーブル (hidden md:block) -->
        <div
            class="hidden md:block w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900"
        >
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead
                        class="border-b border-slate-200 bg-slate-50 font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400"
                    >
                        <tr class="border-l-4 border-l-transparent">
                            <th class="px-4 py-3.5 whitespace-nowrap min-w-[130px]">放送日時</th>
                            <th class="px-4 py-3.5 whitespace-nowrap min-w-[110px]">放送局</th>
                            <th class="px-4 py-3.5 whitespace-nowrap min-w-[70px]">種別</th>
                            <th class="px-4 py-3.5 min-w-[220px]">番組名 / 概要</th>
                            <th class="px-4 py-3.5 whitespace-nowrap min-w-[70px]">時間</th>
                            <th class="px-4 py-3.5 whitespace-nowrap min-w-[100px]">状態</th>
                            <th class="px-4 py-3.5 text-right whitespace-nowrap w-40 min-w-[160px]">
                                キャンセル / 操作
                            </th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                        {#each filteredReserves as item (item.id)}
                            <tr
                                onclick={() => openReserveDetail(item)}
                                class="transition cursor-pointer border-l-4 {item.isRecording
                                    ? 'border-l-rose-600 bg-rose-100 hover:bg-rose-200/70 dark:border-l-rose-500 dark:bg-rose-950/60 dark:hover:bg-rose-950/80'
                                    : item.isConflict
                                      ? 'border-l-red-600 bg-red-100 hover:bg-red-200/70 dark:border-l-red-500 dark:bg-red-950/60 dark:hover:bg-red-950/80'
                                      : item.isSkip || item.isOverlap
                                        ? 'border-l-slate-400 bg-slate-200/80 hover:bg-slate-200 dark:border-l-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-300'
                                        : 'border-l-transparent hover:bg-slate-50/80 dark:hover:bg-slate-800/40'}"
                            >
                                <!-- 放送日時 (2行スタック化) -->
                                <td class="whitespace-nowrap px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                                    <div class="font-bold text-slate-900 dark:text-slate-100 text-sm">
                                        {formatDate(item.startAt)}
                                    </div>
                                    <div class="text-xs text-slate-500 dark:text-slate-400 font-mono">
                                        {formatTime(item.startAt)}{item.endAt ? ` - ${formatTime(item.endAt)}` : ''}
                                    </div>
                                </td>

                                <!-- 放送局 -->
                                <td class="whitespace-nowrap px-4 py-3.5">
                                    <Badge variant="channel" text={channelStore.getChannelName(item.channelId)} />
                                </td>

                                <!-- 種別 (ルール / 個別) -->
                                <td class="whitespace-nowrap px-4 py-3.5">
                                    <Badge
                                        variant={item.ruleId ? 'rule' : 'manual'}
                                        text={item.ruleId ? 'ルール' : '個別予約'}
                                    />
                                </td>

                                <!-- 番組名 & 概要 -->
                                <td class="px-4 py-3.5">
                                    <div class="program-title hover:text-blue-600 dark:hover:text-blue-400">
                                        {item.name}
                                    </div>
                                    {#if item.description}
                                        <p class="program-summary mt-0.5 line-clamp-1">{item.description}</p>
                                    {/if}
                                    {#if item.isRecording}
                                        <div class="mt-1.5 flex items-center gap-2 max-w-xs">
                                            <div
                                                class="h-2 flex-1 overflow-hidden rounded-full bg-rose-200 dark:bg-rose-950"
                                            >
                                                <div
                                                    class="h-full rounded-full bg-rose-600 transition-all duration-500"
                                                    style="width: {getRecordingProgress(item.startAt, item.endAt)}%"
                                                ></div>
                                            </div>
                                            <span
                                                class="text-xs font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap"
                                            >
                                                {getRecordingProgress(item.startAt, item.endAt)}%
                                            </span>
                                        </div>
                                    {/if}
                                </td>

                                <!-- 番組長 -->
                                <td
                                    class="whitespace-nowrap px-4 py-3.5 font-medium text-slate-500 dark:text-slate-400"
                                >
                                    {formatDuration(item.endAt - item.startAt)}
                                </td>

                                <!-- 状態バッジ -->
                                <td class="whitespace-nowrap px-4 py-3.5">
                                    {#if item.isRecording}
                                        <Badge variant="recording" />
                                    {:else if item.isConflict}
                                        <Badge variant="conflict" text="チューナー競合" />
                                    {:else if item.isSkip}
                                        <Badge variant="skip" text="スキップ中" />
                                    {:else if item.isOverlap}
                                        <Badge variant="overlap" text="重複スキップ" />
                                    {:else}
                                        <span
                                            class="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                                        >
                                            予約完了
                                        </span>
                                    {/if}
                                </td>

                                <!-- キャンセル / 操作ボタン (端からの余白確保 & 分離) -->
                                <td class="whitespace-nowrap px-4 pr-5 sm:pr-6 py-3.5 text-right">
                                    <div class="inline-flex items-center justify-end gap-1.5">
                                        {#if item.isRecording && readOnlyStore.canLiveStream}
                                            <Button
                                                variant="primary"
                                                size="compact"
                                                onclick={e => {
                                                    e.stopPropagation();
                                                    router.push(
                                                        `/onair/watch?channelId=${item.channelId}&type=m2tsll&mode=0`,
                                                    );
                                                }}
                                                title="放送中の番組を視聴"
                                            >
                                                <Play size={14} fill="currentColor" /> 視聴
                                            </Button>
                                        {/if}
                                        {#if !readOnlyStore.isReadOnly}
                                            {#if item.isSkip}
                                                <Button
                                                    variant="secondary"
                                                    size="compact"
                                                    disabled={restoringReserveId === item.id}
                                                    onclick={e => restoreSkip(item, e)}
                                                    class="bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900/60"
                                                    title="スキップを解除して予約を復活"
                                                >
                                                    <RotateCcw size={14} /> 復活
                                                </Button>
                                            {:else if item.isOverlap}
                                                <Button
                                                    variant="secondary"
                                                    size="compact"
                                                    onclick={e => openDuplicateModal(item, e)}
                                                    class="bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800"
                                                    title="重複元の過去録画を確認"
                                                >
                                                    <Search size={14} /> 重複確認
                                                </Button>
                                            {:else}
                                                {#if item.isRecording && readOnlyStore.canLiveStream}
                                                    <Divider orientation="vertical" />
                                                {/if}
                                                <Button
                                                    variant="danger-outline"
                                                    size="compact"
                                                    disabled={cancelingReserveId === item.id}
                                                    onclick={e => cancelReserve(item, e)}
                                                    title={item.isRecording
                                                        ? '録画を停止・破棄'
                                                        : item.ruleId
                                                          ? 'この回の録画をスキップ'
                                                          : '予約を取り消し'}
                                                >
                                                    {#if item.isRecording}
                                                        <Square size={14} fill="currentColor" /> 停止
                                                    {:else}
                                                        <Trash2 size={14} /> キャンセル
                                                    {/if}
                                                </Button>
                                            {/if}
                                        {:else if !item.isRecording}
                                            <span class="text-xs text-slate-400">-</span>
                                        {/if}
                                    </div>
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
            onclick={() => (isDetailModalOpen = false)}
            aria-label="背景をクリックして閉じる"
        ></button>

        <!-- モーダル本体 -->
        <div
            class="relative flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 overflow-hidden"
        >
            <!-- モーダルヘッダー -->
            <div class="flex items-start justify-between border-b border-slate-100 p-4 dark:border-slate-800">
                <div>
                    <div class="flex items-center gap-2">
                        <span
                            class="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        >
                            {channelStore.getChannelName(item.channelId)}
                        </span>
                        {#if item.ruleId}
                            <span
                                class="rounded-md bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                            >
                                自動録画ルール予約 (Rule #{item.ruleId})
                            </span>
                        {:else}
                            <span
                                class="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            >
                                個別手動予約
                            </span>
                        {/if}
                    </div>
                    <h2 class="program-title-modal mt-2">
                        {item.name}
                    </h2>
                </div>
                <button
                    type="button"
                    onclick={() => (isDetailModalOpen = false)}
                    class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                    aria-label="モーダルを閉じる"
                >
                    <X size={18} />
                </button>
            </div>

            <!-- モーダルコンテンツ -->
            <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                <!-- 放送日時・状態 -->
                <div
                    class="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40 space-y-2 text-xs sm:text-sm"
                >
                    <div class="flex items-center justify-between text-slate-700 dark:text-slate-300 font-bold">
                        <span class="flex items-center gap-1.5">
                            <Clock size={15} class="text-blue-600" />
                            {formatTimeRange(item.startAt, item.endAt)} ({formatDuration(item.endAt - item.startAt)})
                        </span>
                        {#if item.isRecording}
                            <span class="text-rose-600 font-bold flex items-center gap-1 animate-pulse">● 録画中</span>
                        {:else if item.isConflict}
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

                    {#if item.isRecording}
                        <div class="pt-2 border-t border-rose-200/50 dark:border-rose-900/30 flex items-center gap-2">
                            <div class="h-2 flex-1 overflow-hidden rounded-full bg-rose-200 dark:bg-rose-950">
                                <div
                                    class="h-full rounded-full bg-rose-600 transition-all duration-500"
                                    style="width: {getRecordingProgress(item.startAt, item.endAt)}%"
                                ></div>
                            </div>
                            <span class="text-xs font-bold text-rose-600 dark:text-rose-400">
                                {getRecordingProgress(item.startAt, item.endAt)}% 進行中
                            </span>
                        </div>
                    {/if}
                </div>

                <!-- 番組概要 -->
                {#if item.description}
                    <div>
                        <h4 class="font-bold text-sm text-slate-800 dark:text-slate-100 mb-1">番組概要</h4>
                        <div
                            class="program-description rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-800/20"
                        >
                            {item.description}
                        </div>
                    </div>
                {/if}

                <!-- 詳細情報 / 出演者 / あらすじ -->
                {#if item.extended}
                    <div>
                        <h4 class="font-bold text-sm text-slate-800 dark:text-slate-100 mb-1">詳細情報・出演者</h4>
                        <div
                            class="program-extended space-y-2 rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-800/20 max-h-52 overflow-y-auto"
                        >
                            {#if typeof item.extended === 'object'}
                                {#each Object.entries(item.extended) as [key, value]}
                                    <div>
                                        <span class="font-bold text-blue-600 dark:text-blue-400">{key}:</span>
                                        <p class="mt-0.5 whitespace-pre-wrap leading-relaxed">
                                            {value}
                                        </p>
                                    </div>
                                {/each}
                            {:else}
                                <p class="whitespace-pre-wrap leading-relaxed">
                                    {item.extended}
                                </p>
                            {/if}
                        </div>
                    </div>
                {/if}

                <!-- 録画オプション設定 -->
                {#if item.ruleId}
                    <!-- ルール予約: ルール側の設定が反映されるため、ルール編集ページへ誘導 -->
                    <div
                        class="rounded-xl border border-purple-200 bg-purple-50/60 p-3.5 dark:border-purple-900/50 dark:bg-purple-950/30"
                    >
                        <h4
                            class="flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-300 mb-2"
                        >
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
                                    {item.parentDirectoryName || 'デフォルト'}
                                    {item.directory ? `/ ${item.directory}` : ''}
                                </span>
                            </div>
                            <div class="rounded-lg bg-white/70 p-2.5 dark:bg-slate-800/60">
                                <span class="text-slate-400 text-[11px] block">エンコード設定</span>
                                <span class="font-bold text-slate-800 dark:text-slate-200">
                                    {[item.encodeMode1, item.encodeMode2, item.encodeMode3]
                                        .filter(Boolean)
                                        .join(', ') || 'なし'}
                                </span>
                            </div>
                        </div>
                        {#if !readOnlyStore.isReadOnly}
                            <button
                                type="button"
                                onclick={() => goToRuleEdit(item)}
                                class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-700 cursor-pointer"
                            >
                                <SlidersHorizontal size={14} /> ルール編集
                            </button>
                        {/if}
                    </div>
                {:else if !readOnlyStore.isReadOnly}
                    <!-- 個別予約: 予約自体を編集可能 -->
                    <div>
                        <RecordingOptionForm
                            bind:saveParentDir={recOptions.saveParentDir}
                            bind:saveSubDir={recOptions.saveSubDir}
                            bind:encRows={recOptions.encRows}
                            bind:isDeleteOriginal={recOptions.isDeleteOriginal}
                            bind:allowEndLack={recOptions.allowEndLack}
                            {encodeModes}
                            {storageDirs}
                        />
                    </div>
                {:else}
                    <!-- 個別予約 (リードオンリー): 設定内容を閲覧表示 -->
                    <div
                        class="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/40"
                    >
                        <h4 class="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                            <SlidersHorizontal size={13} /> 録画オプション
                        </h4>
                        <div class="grid grid-cols-2 gap-2 text-xs">
                            <div class="rounded-lg bg-white/70 p-2.5 dark:bg-slate-800/60">
                                <span class="text-slate-400 text-[11px] block">保存先</span>
                                <span class="font-bold text-slate-800 dark:text-slate-200">
                                    {item.parentDirectoryName || 'デフォルト'}
                                    {item.directory ? `/ ${item.directory}` : ''}
                                </span>
                            </div>
                            <div class="rounded-lg bg-white/70 p-2.5 dark:bg-slate-800/60">
                                <span class="text-slate-400 text-[11px] block">エンコード設定</span>
                                <span class="font-bold text-slate-800 dark:text-slate-200">
                                    {[item.encodeMode1, item.encodeMode2, item.encodeMode3]
                                        .filter(Boolean)
                                        .join(', ') || 'なし'}
                                </span>
                            </div>
                        </div>
                    </div>
                {/if}
            </div>

            <!-- モーダルフッター -->
            <div
                class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-4 dark:border-slate-800"
            >
                <div class="flex items-center gap-2">
                    {#if item.isRecording && readOnlyStore.canLiveStream}
                        <Button
                            variant="primary"
                            size="compact"
                            onclick={() => {
                                isDetailModalOpen = false;
                                router.push(`/onair/watch?channelId=${item.channelId}&type=m2tsll&mode=0`);
                            }}
                        >
                            <Play size={14} fill="currentColor" /> ライブ視聴
                        </Button>
                    {/if}
                </div>

                <div class="flex items-center gap-2">
                    {#if !readOnlyStore.isReadOnly}
                        {#if !item.ruleId}
                            <Button
                                variant="primary"
                                size="compact"
                                disabled={isUpdating}
                                onclick={() => updateReserve(item)}
                            >
                                設定更新
                            </Button>
                            <Divider orientation="vertical" />
                        {/if}
                        {#if item.isSkip}
                            <Button
                                variant="primary"
                                size="compact"
                                disabled={restoringReserveId === item.id}
                                onclick={() => restoreSkip(item)}
                            >
                                予約復活
                            </Button>
                        {:else if item.isOverlap}
                            <Button
                                variant="secondary"
                                size="compact"
                                onclick={() => {
                                    isDetailModalOpen = false;
                                    openDuplicateModal(item);
                                }}
                            >
                                <Search size={14} /> 重複確認
                            </Button>
                            <Button
                                variant="primary"
                                size="compact"
                                disabled={restoringOverlapReserveId === item.id}
                                onclick={() => restoreOverlap(item)}
                            >
                                <RotateCcw size={14} /> この回を録画
                            </Button>
                        {:else}
                            <Button
                                variant="danger-outline"
                                size="compact"
                                disabled={isCanceling || cancelingReserveId === item.id}
                                onclick={() => cancelReserve(item)}
                            >
                                {#if item.isRecording}
                                    <Square size={14} fill="currentColor" /> 停止
                                {:else}
                                    {item.ruleId ? 'この回をスキップ' : '予約キャンセル'}
                                {/if}
                            </Button>
                        {/if}
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- 録画中番組の操作モーダル（完了保存 / 中断保存 / 破棄） -->
<RecordingActionModal
    isOpen={isRecordingActionModalOpen}
    item={recordingActionItem}
    isProcessing={isRecordingActionProcessing}
    onClose={() => {
        isRecordingActionModalOpen = false;
        recordingActionItem = null;
    }}
    onAction={handleRecordingAction}
/>

<!-- 重複元の録画確認専用モーダル -->
{#if isDuplicateModalOpen && duplicateModalReserve}
    {@const item = duplicateModalReserve}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
        <!-- バックドロップ -->
        <button
            type="button"
            class="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
            onclick={() => (isDuplicateModalOpen = false)}
            aria-label="背景をクリックして閉じる"
        ></button>

        <!-- モーダル本体 -->
        <div
            class="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 overflow-hidden"
        >
            <!-- モーダルヘッダー -->
            <div class="flex items-start justify-between border-b border-slate-100 p-4 sm:p-5 dark:border-slate-800">
                <div>
                    <div class="flex items-center gap-2">
                        <span
                            class="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        >
                            {channelStore.getChannelName(item.channelId)}
                        </span>
                        {#if item.ruleId}
                            <span
                                class="rounded-md bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                            >
                                自動録画ルール予約 (Rule #{item.ruleId})
                            </span>
                        {/if}
                    </div>
                    <h2
                        class="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 mt-1.5 flex items-center gap-2"
                    >
                        <History size={18} class="text-amber-500 shrink-0" />
                        重複元の録画確認
                    </h2>
                </div>
                <button
                    type="button"
                    class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                    onclick={() => (isDuplicateModalOpen = false)}
                    aria-label="モーダルを閉じる"
                >
                    <X size={18} />
                </button>
            </div>

            <!-- モーダルコンテンツ -->
            <div class="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                <!-- 対象予約番組サマリー -->
                <div
                    class="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/30"
                >
                    <div
                        class="flex flex-wrap items-center justify-between gap-1 text-xs text-amber-800 dark:text-amber-300 font-bold mb-1"
                    >
                        <span>
                            対象予約枠: {formatTimeRange(item.startAt, item.endAt)} ({formatDuration(
                                item.endAt - item.startAt,
                            )})
                        </span>
                        <span class="rounded bg-amber-200/80 dark:bg-amber-900/80 px-1.5 py-0.5 text-[11px]">
                            重複スキップ対象
                        </span>
                    </div>
                    <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {item.name}
                    </h3>
                    <p class="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        二重録画防止（ルール重複判定）によってスキップ対象となっている番組です。過去に録画された同一番組（オリジナル）の状態を確認できます。
                    </p>
                </div>

                <!-- 過去の録画（オリジナル一覧） -->
                <div>
                    {#if isLoadingDuplicates}
                        <div
                            class="flex flex-col items-center justify-center py-10 text-xs text-slate-500 dark:text-slate-400"
                        >
                            <Loader2 size={24} class="animate-spin text-amber-600 dark:text-amber-400 mb-2" />
                            過去の録画情報を取得中...
                        </div>
                    {:else if duplicatesData}
                        {#if duplicatesData.records.length > 0}
                            <div class="space-y-3">
                                <div class="flex items-center justify-between">
                                    <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300">
                                        該当する過去の録画（{duplicatesData.records.length}件）
                                    </h4>
                                    <span class="text-[11px] text-slate-500">※新しい順に表示</span>
                                </div>

                                {#each duplicatesData.records as record, idx}
                                    <div
                                        class="flex flex-col sm:flex-row gap-3 rounded-xl bg-slate-50/80 p-3.5 border border-slate-200 dark:bg-slate-800/40 dark:border-slate-800"
                                    >
                                        <!-- サムネイル (クリックで録画詳細を別タブで開く) -->
                                        <a
                                            href={`/recorded/detail?recordedId=${record.id}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            class="relative w-full sm:w-36 aspect-video bg-slate-200 dark:bg-slate-800 rounded-lg overflow-hidden shrink-0 group block"
                                            title="録画詳細を別タブで開く"
                                        >
                                            {#if record.thumbnails && record.thumbnails.length > 0}
                                                <img
                                                    src={`/api/thumbnails/${record.thumbnails[0]}`}
                                                    alt={record.name}
                                                    class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                                    loading="lazy"
                                                />
                                            {:else}
                                                <div
                                                    class="w-full h-full flex items-center justify-center text-slate-400 group-hover:scale-105 transition-transform duration-200"
                                                >
                                                    <Film size={24} />
                                                </div>
                                            {/if}
                                            <div
                                                class="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                                            >
                                                <div class="rounded-full bg-white/90 text-slate-900 p-1.5 shadow-md">
                                                    <ExternalLink size={14} />
                                                </div>
                                            </div>
                                        </a>

                                        <!-- 録画詳細情報 -->
                                        <div class="flex-1 min-w-0 flex flex-col justify-between gap-1.5">
                                            <div>
                                                <div class="flex flex-wrap items-center gap-1.5 text-xs mb-1">
                                                    {#if idx === 0}
                                                        <span
                                                            class="rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold px-1.5 py-0.5 text-[10px]"
                                                        >
                                                            最新の録画
                                                        </span>
                                                    {/if}
                                                    <span class="font-bold text-slate-700 dark:text-slate-300">
                                                        {formatTimeRange(record.startAt, record.endAt)}
                                                    </span>
                                                    <span class="text-slate-500">
                                                        ({channelStore.getChannelName(record.channelId)})
                                                    </span>
                                                </div>
                                                <h5
                                                    class="text-xs font-bold text-slate-900 dark:text-slate-100 line-clamp-2"
                                                >
                                                    {record.name}
                                                </h5>
                                                {#if record.description}
                                                    <p
                                                        class="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5"
                                                    >
                                                        {record.description}
                                                    </p>
                                                {/if}
                                            </div>

                                            <!-- ドロップログ状態 & 動画ファイル情報 -->
                                            <div
                                                class="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px]"
                                            >
                                                {#if record.dropLogFile}
                                                    {#if record.dropLogFile.dropCnt === 0 && record.dropLogFile.errorCnt === 0}
                                                        <span
                                                            class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60"
                                                        >
                                                            <CheckCircle2 size={12} />
                                                            ドロップなし (Drop: 0 / Error: 0)
                                                        </span>
                                                    {:else}
                                                        <span
                                                            class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                                                        >
                                                            <AlertTriangle size={12} />
                                                            ドロップ検知 (Drop: {record.dropLogFile.dropCnt} / Error: {record
                                                                .dropLogFile.errorCnt}{record.dropLogFile
                                                                .scramblingCnt > 0
                                                                ? ` / Scramble: ${record.dropLogFile.scramblingCnt}`
                                                                : ''})
                                                        </span>
                                                    {/if}
                                                {:else}
                                                    <span class="text-slate-400">ドロップログなし</span>
                                                {/if}

                                                {#if record.videoFiles && record.videoFiles.length > 0}
                                                    <div
                                                        class="flex flex-wrap items-center gap-1 text-slate-500 dark:text-slate-400"
                                                    >
                                                        {#each record.videoFiles as vf}
                                                            <span
                                                                class="rounded bg-slate-100 px-1 py-0.5 text-[10px] dark:bg-slate-800 font-mono"
                                                            >
                                                                {vf.name} ({formatSize(vf.size)})
                                                            </span>
                                                        {/each}
                                                    </div>
                                                {/if}
                                            </div>

                                            <!-- アクションボタン -->
                                            <div class="flex items-center gap-3 pt-1">
                                                <a
                                                    href={`/recorded/detail?recordedId=${record.id}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    class="inline-flex items-center gap-1.5 rounded bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors"
                                                >
                                                    <ExternalLink size={13} /> 録画詳細を確認（別タブ）
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        {:else if duplicatesData.histories.length > 0}
                            <div
                                class="rounded-xl bg-slate-50 p-4 text-xs text-slate-600 dark:bg-slate-800/40 dark:text-slate-400 border border-slate-200 dark:border-slate-800"
                            >
                                <p class="font-bold text-slate-800 dark:text-slate-200">
                                    過去の録画履歴に該当します（動画ファイルは削除済み）
                                </p>
                                <p class="mt-1 text-[11px] text-slate-500">
                                    録画終了日時: {formatDate(duplicatesData.histories[0].endAt)}
                                    {formatTime(duplicatesData.histories[0].endAt)}
                                </p>
                            </div>
                        {:else}
                            <div
                                class="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-500 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800"
                            >
                                該当する過去の録画は見つかりませんでした。
                            </div>
                        {/if}
                    {/if}
                </div>
            </div>

            <!-- モーダルフッター -->
            <div
                class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 p-4 sm:p-5 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"
            >
                <p class="text-[11px] text-slate-500 dark:text-slate-400">
                    ※この予約枠（{formatTime(
                        item.startAt,
                    )}〜）のみ重複スキップを解除して録画します。過去の録画ファイルや履歴には影響しません。
                </p>

                <div class="flex items-center justify-end gap-2 shrink-0">
                    <Button variant="secondary" size="compact" onclick={() => (isDuplicateModalOpen = false)}>
                        閉じる
                    </Button>
                    {#if !readOnlyStore.isReadOnly}
                        <Button
                            variant="primary"
                            size="compact"
                            disabled={restoringOverlapReserveId === item.id}
                            onclick={() => restoreOverlap(item)}
                        >
                            <RotateCcw size={14} /> この回を録画
                        </Button>
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/if}
