<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { confirmDialog } from '../lib/stores/confirm.svelte';
    import { socketStore } from '../lib/stores/socket.svelte';
    import { readOnlyStore } from '../lib/stores/readOnly.svelte';
    import { configStore } from '../lib/stores/config.svelte';
    import {
        formatDate,
        formatTime,
        formatTimeRange,
        formatDuration,
        extractFirstSearchWord,
    } from '../lib/utils/format';
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
        Search,
        SlidersHorizontal,
        Ban,
        RotateCcw,
        Play,
        Square,
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
        try {
            await api.reserves[':reserveId'].$delete({ param: { reserveId: String(item.id) } });
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
                fetchReserves();
            }
        } finally {
            isRecordingActionProcessing = false;
        }
    }

    // スキップ解除 (予約復活)
    async function restoreSkip(item: apid.ReserveItem, e?: MouseEvent) {
        if (e) e.stopPropagation();
        try {
            await api.reserves[':reserveId'].skip.$delete({ param: { reserveId: String(item.id) } });
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
                    <Plus size={14} /> 手動予約
                </Button>
            {/if}
        </div>

        <div class="flex items-center gap-2.5 min-w-0 max-w-full">
            <!-- フィルタータブ -->
            <FilterTabs
                tabs={[
                    { id: 'all', label: 'すべて', count: total },
                    { id: 'conflicts', label: '競合', count: conflictCount, icon: AlertTriangle },
                    { id: 'skips', label: 'スキップ', count: skipCount },
                    { id: 'overlaps', label: '重複', count: overlapCount },
                ]}
                activeTab={filterMode}
                onselect={id => (filterMode = id)}
            />

            <!-- 手動予約ボタン (PC用) -->
            {#if !readOnlyStore.isReadOnly}
                <Button
                    variant="primary"
                    onclick={() => router.push('/reserves/manual')}
                    class="hidden sm:inline-flex whitespace-nowrap shrink-0"
                >
                    <Plus size={16} /> 手動予約を追加
                </Button>
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
            description="番組表や検索画面から録画予約を追加できます"
        />
    {:else}
        <!-- テーブル表示 -->
        <!-- モバイル表示: カード型予約リスト (md:hidden) -->
        <div class="space-y-3 md:hidden">
            {#each filteredReserves as item}
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
                    class="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 cursor-pointer {item.isRecording
                        ? 'border-rose-300 bg-rose-50/40 dark:border-rose-900/60 dark:bg-rose-950/20'
                        : item.isConflict
                          ? 'border-rose-200 bg-rose-50/20 dark:border-rose-900/40'
                          : item.isSkip
                            ? 'opacity-60 bg-slate-50/50'
                            : ''}"
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
                                        onclick={e => restoreSkip(item, e)}
                                        class="bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900/60"
                                    >
                                        <RotateCcw size={13} /> 復活
                                    </Button>
                                {:else}
                                    {#if item.isRecording && readOnlyStore.canLiveStream}
                                        <Divider orientation="vertical" />
                                    {/if}
                                    <Button
                                        variant="danger-outline"
                                        size="compact"
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
                        <tr>
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
                        {#each filteredReserves as item}
                            <tr
                                onclick={() => openReserveDetail(item)}
                                class="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer {item.isRecording
                                    ? 'bg-rose-50/70 dark:bg-rose-950/30'
                                    : item.isConflict
                                      ? 'bg-rose-50/40 dark:bg-rose-950/20'
                                      : item.isSkip
                                        ? 'opacity-60 bg-slate-50/50 dark:bg-slate-900/40'
                                        : ''}"
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
                                                    onclick={e => restoreSkip(item, e)}
                                                    class="bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900/60"
                                                    title="スキップを解除して予約を復活"
                                                >
                                                    <RotateCcw size={14} /> 復活
                                                </Button>
                                            {:else}
                                                {#if item.isRecording && readOnlyStore.canLiveStream}
                                                    <Divider orientation="vertical" />
                                                {/if}
                                                <Button
                                                    variant="danger-outline"
                                                    size="compact"
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
            <div class="flex-1 overflow-y-auto p-5 space-y-4">
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
                                <SlidersHorizontal size={14} /> ルールを編集する
                            </button>
                        {/if}
                    </div>
                {:else}
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
                    <Button
                        variant="secondary"
                        size="compact"
                        onclick={() => {
                            isDetailModalOpen = false;
                            const kw = extractFirstSearchWord(item.name);
                            router.push(`/search?keyword=${encodeURIComponent(kw)}`);
                        }}
                    >
                        <Search size={14} /> 類似番組を検索
                    </Button>
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
                                <CheckCircle2 size={14} /> 設定を更新
                            </Button>
                            <Divider orientation="vertical" />
                        {/if}
                        {#if item.isSkip}
                            <Button variant="primary" size="compact" onclick={() => restoreSkip(item)}>
                                <RotateCcw size={14} /> 予約を復活する
                            </Button>
                        {:else}
                            <Button
                                variant="danger-outline"
                                size="compact"
                                disabled={isCanceling}
                                onclick={() => cancelReserve(item)}
                            >
                                {#if item.isRecording}
                                    <Square size={14} fill="currentColor" /> 停止
                                {:else}
                                    <Trash2 size={14} />
                                    {item.ruleId ? 'この回をスキップ (キャンセル)' : '予約をキャンセル'}
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
