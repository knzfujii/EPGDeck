<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { socketStore } from '../lib/stores/socket.svelte';
    import { readOnlyStore } from '../lib/stores/readOnly.svelte';
    import {
        formatDate,
        formatTime,
        formatTimeRange,
        formatDuration,
        extractFirstSearchWord,
        getGenreName,
        getGenreBadgeClass,
        getChannelTypeBadgeClass,
        formatTimeRemaining,
    } from '../lib/utils/format';
    import StreamSelectModal from '../lib/components/video/StreamSelectModal.svelte';
    import RecordingActionModal from '../lib/components/recording/RecordingActionModal.svelte';
    import http from '@/lib/httpClient';
    import type * as apid from '../../../api';
    import {
        Radio,
        Play,
        Tv,
        X,
        Clock,
        Info,
        Plus,
        Search,
        Layers,
        Calendar,
        CheckCircle2,
        Bookmark,
        ArrowRight,
        Lock,
        CircleDot,
        Check,
        Filter,
    } from '@lucide/svelte';

    interface OnAirProgram extends apid.ScheduleProgramItem {
        isRecording?: boolean;
        recordingReserveId?: number;
        isReserved?: boolean;
        reserveId?: number;
    }

    interface OnAirItem {
        channel: apid.ChannelItem;
        current: OnAirProgram;
        next?: OnAirProgram;
    }

    let onAirList = $state<OnAirItem[]>([]);
    let isLoading = $state(true);
    let selectedType = $state<string>('all');
    let selectedGenre = $state<number | null>(null);
    let keyword = $state<string>('');
    let currentTime = $state<number>(Date.now());

    // 配信設定モーダル状態
    let selectedChannel = $state<apid.ChannelItem | null>(null);
    let streamModalTitle = $state<string>('');
    let isStreamModalOpen = $state(false);

    // 録画中番組の3択操作モーダル状態
    let isRecordingActionModalOpen = $state(false);
    let recordingActionItem = $state<any | null>(null);
    let isRecordingActionProcessing = $state(false);

    // 番組詳細ポップアップモーダル状態
    let isDetailModalOpen = $state(false);
    let selectedDetailItem = $state<{
        program: OnAirProgram;
        channel: apid.ChannelItem;
        isNext?: boolean;
    } | null>(null);
    let isReserving = $state(false);

    let unsubscribeSocket: (() => void) | null = null;

    const ALL_CHANNEL_TYPES = [
        { id: 'all', name: 'すべて' },
        { id: 'GR', name: '地デジ' },
        { id: 'BS', name: 'BS' },
        { id: 'CS', name: 'CS' },
        { id: 'SKY', name: 'SKY' },
    ] as const;

    const GENRES = [
        { id: null, name: '全ジャンル' },
        { id: 0, name: 'ニュース' },
        { id: 7, name: 'アニメ' },
        { id: 3, name: 'ドラマ' },
        { id: 5, name: 'バラエティ' },
        { id: 6, name: '映画' },
        { id: 1, name: 'スポーツ' },
        { id: 2, name: '情報' },
        { id: 4, name: '音楽' },
    ];

    let channelTypes = $derived.by(() => {
        const active = new Set(channelStore.activeChannelTypes);
        return ALL_CHANNEL_TYPES.filter(t => t.id === 'all' || active.has(t.id as any));
    });

    $effect(() => {
        if (channelTypes.length > 0 && !channelTypes.some(t => t.id === selectedType)) {
            selectedType = 'all';
        }
    });

    async function fetchOnAir(isSilent = false) {
        if (!isSilent) isLoading = true;
        try {
            await channelStore.fetch();
            const now = Date.now();
            currentTime = now;
            const startAt = now - 30 * 60 * 1000;
            const endAt = now + 6 * 60 * 60 * 1000;

            const [schedulesRes, recordingRes, reservesRes] = await Promise.all([
                http.get('/api/schedules', {
                    params: {
                        startAt,
                        endAt,
                        isHalfWidth: true,
                        GR: true,
                        BS: true,
                        CS: true,
                        SKY: true,
                    },
                }),
                http.get('/api/recording?isHalfWidth=true').catch(() => ({ data: { records: [] } })),
                http.get('/api/reserves?isHalfWidth=true').catch(() => ({ data: { reserves: [] } })),
            ]);

            const schedules = schedulesRes.data || [];
            const recordingList = recordingRes.data.records || [];
            const reservesList: apid.ReserveItem[] = reservesRes.data.reserves || [];

            const list: OnAirItem[] = [];

            for (const item of schedules) {
                const programs = (item.programs || []).sort((a: any, b: any) => a.startAt - b.startAt);
                if (programs.length === 0) continue;

                // 現在放映中の番組を特定
                const rawCurrent = programs.find((p: any) => p.startAt <= now && p.endAt > now) || programs[0];
                // 次の番組を特定
                const rawNext = programs.find((p: any) => p.startAt >= rawCurrent.endAt);

                // 現在番組の録画中判定
                const matchedRec = recordingList.find(
                    (rec: any) =>
                        (rec.programId && rawCurrent.id && rec.programId === rawCurrent.id) ||
                        (rec.channelId === item.channel.id &&
                            Math.abs(rec.startAt - rawCurrent.startAt) < 60000 &&
                            Math.abs(rec.endAt - rawCurrent.endAt) < 60000),
                );

                // 録画中である場合、対応する予約 (ReserveItem) を特定
                const matchedReserve = matchedRec
                    ? reservesList.find(
                          (r: any) =>
                              (r.programId && rawCurrent.id && r.programId === rawCurrent.id) ||
                              (r.channelId === item.channel.id &&
                                  Math.abs(r.startAt - rawCurrent.startAt) < 60000 &&
                                  Math.abs(r.endAt - rawCurrent.endAt) < 60000),
                      )
                    : undefined;

                const current: OnAirProgram = {
                    ...rawCurrent,
                    isRecording: !!matchedRec,
                    recordingReserveId: matchedReserve ? matchedReserve.id : undefined,
                };

                // 次番組の予約中判定
                let next: OnAirProgram | undefined = undefined;
                if (rawNext) {
                    const matchedRes = reservesList.find(
                        (r: any) =>
                            (r.programId && rawNext.id && r.programId === rawNext.id) ||
                            (r.channelId === item.channel.id &&
                                Math.abs(r.startAt - rawNext.startAt) < 60000 &&
                                Math.abs(r.endAt - rawNext.endAt) < 60000),
                    );
                    next = {
                        ...rawNext,
                        isReserved: !!matchedRes,
                        reserveId: matchedRes ? matchedRes.id : undefined,
                    };
                }

                list.push({
                    channel: item.channel,
                    current,
                    next,
                });
            }

            onAirList = list;
        } catch (e) {
            console.error('Failed to fetch on-air schedules', e);
            if (!isSilent) snackbar.open({ text: '放送中データの取得に失敗しました', color: 'error' });
        } finally {
            if (!isSilent) isLoading = false;
        }
    }

    $effect(() => {
        if (!readOnlyStore.canLiveStream) {
            router.replace('/recorded');
        }
    });

    onMount(() => {
        if (!readOnlyStore.canLiveStream) {
            router.replace('/recorded');
            return;
        }
        fetchOnAir();
        // 30秒毎にスケジュール・予約状態再取得
        const interval = setInterval(() => fetchOnAir(true), 30000);
        // 10秒毎に現在時刻を更新（プログレスバー・残り時間をスムーズに追従）
        const timeInterval = setInterval(() => {
            currentTime = Date.now();
        }, 10000);

        unsubscribeSocket = socketStore.on('updateStatus', () => {
            fetchOnAir(true);
        });

        return () => {
            clearInterval(interval);
            clearInterval(timeInterval);
        };
    });

    onDestroy(() => {
        unsubscribeSocket?.();
    });

    let filteredList = $derived.by(() => {
        return onAirList.filter(item => {
            // 放送波フィルタ
            if (selectedType !== 'all' && item.channel?.channelType !== selectedType) {
                return false;
            }
            // ジャンルフィルタ
            if (selectedGenre !== null) {
                const curGenre = item.current?.genre1;
                const nextGenre = item.next?.genre1;
                if (curGenre !== selectedGenre && nextGenre !== selectedGenre) {
                    return false;
                }
            }
            // キーワードフィルタ
            if (keyword.trim()) {
                const kw = keyword.trim().toLowerCase();
                const chName = (item.channel?.name || '').toLowerCase();
                const curName = (item.current?.name || '').toLowerCase();
                const curDesc = (item.current?.description || '').toLowerCase();
                const nextName = (item.next?.name || '').toLowerCase();
                if (!chName.includes(kw) && !curName.includes(kw) && !curDesc.includes(kw) && !nextName.includes(kw)) {
                    return false;
                }
            }
            return true;
        });
    });

    function getProgress(startAt: number, endAt: number, now: number): number {
        if (now <= startAt) return 0;
        if (now >= endAt) return 100;
        return Math.min(100, Math.max(0, Math.round(((now - startAt) / (endAt - startAt)) * 100)));
    }

    function openStreamModal(channel: apid.ChannelItem, programName?: string) {
        selectedChannel = channel;
        streamModalTitle = programName || `${channel.name} ライブ視聴`;
        isStreamModalOpen = true;
    }

    function openProgramDetail(program: OnAirProgram, channel: apid.ChannelItem, isNext: boolean = false) {
        selectedDetailItem = { program, channel, isNext };
        isDetailModalOpen = true;
    }

    // 現在放送中番組の即時録画開始
    async function startRecordCurrentProgram(item: OnAirItem) {
        if (readOnlyStore.isReadOnly) return;
        const program = item.current;
        if (!program || !program.id) return;

        // すでに録画中の場合は3択モーダルを開く
        if (program.isRecording) {
            openRecordingAction(item);
            return;
        }

        isReserving = true;
        try {
            await http.post('/api/reserves', {
                programId: program.id,
                allowEndLack: true, // 途中からの録画を許可
            });
            snackbar.open({ text: `「${program.name}」の録画を開始しました`, color: 'success' });
            await fetchOnAir(true);
        } catch (e) {
            console.error('Failed to start recording', e);
            snackbar.open({ text: '録画の開始に失敗しました', color: 'error' });
        } finally {
            isReserving = false;
        }
    }

    // 録画中番組の操作モーダルを開く
    function openRecordingAction(item: OnAirItem) {
        if (readOnlyStore.isReadOnly) return;
        const program = item.current;
        recordingActionItem = {
            id: program.recordingReserveId,
            name: program.name,
            channelId: item.channel.id,
            startAt: program.startAt,
            endAt: program.endAt,
        };
        isRecordingActionModalOpen = true;
    }

    // 録画中番組の3択操作実行
    async function handleRecordingAction(action: 'finish' | 'stop' | 'discard') {
        if (!recordingActionItem || isRecordingActionProcessing) return;
        isRecordingActionProcessing = true;
        const reserveId = recordingActionItem.id;
        const name = recordingActionItem.name;

        if (!reserveId) {
            snackbar.open({ text: '予約情報の取得に失敗したため、操作を実行できませんでした', color: 'error' });
            isRecordingActionProcessing = false;
            return;
        }

        try {
            if (action === 'finish') {
                await http.post(`/api/recording/${reserveId}/finish`);
                snackbar.open({ text: `「${name}」を正常終了として保存しました`, color: 'success' });
            } else if (action === 'stop') {
                await http.post(`/api/recording/${reserveId}/stop`);
                snackbar.open({ text: `「${name}」を中断保存しました（録画履歴は未登録）`, color: 'info' });
            } else if (action === 'discard') {
                await http.post(`/api/recording/${reserveId}/discard`);
                snackbar.open({ text: `「${name}」の録画を取り消し、ファイルを破棄しました`, color: 'info' });
            }
            isRecordingActionModalOpen = false;
            recordingActionItem = null;
            await fetchOnAir(true);
        } catch (e) {
            console.error(`Failed to execute recording action ${action}`, e);
            snackbar.open({ text: '録画の停止操作に失敗しました', color: 'error' });
        } finally {
            isRecordingActionProcessing = false;
        }
    }

    // 次の番組のワンクリック予約 / 解除
    async function toggleReserveProgram(program: OnAirProgram) {
        if (readOnlyStore.isReadOnly || !program || !program.id) return;

        // すでに予約されている場合は予約画面へ遷移
        if (program.isReserved) {
            router.push('/reserves');
            return;
        }

        isReserving = true;
        try {
            await http.post('/api/reserves', {
                programId: program.id,
                allowEndLack: false,
            });
            snackbar.open({ text: `「${program.name}」を予約しました`, color: 'success' });
            if (isDetailModalOpen) isDetailModalOpen = false;
            await fetchOnAir(true);
        } catch (e) {
            console.error('Failed to reserve program', e);
            snackbar.open({ text: '番組の予約に失敗しました', color: 'error' });
        } finally {
            isReserving = false;
        }
    }
</script>

{#if !readOnlyStore.canLiveStream}
    <div
        class="flex flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50/50 p-8 text-center dark:border-amber-950/60 dark:bg-amber-950/20"
    >
        <Lock size={32} class="text-amber-500 mb-2" />
        <h3 class="text-sm font-bold text-slate-800 dark:text-slate-200">閲覧専用モード</h3>
        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
            放送中画面の閲覧は制限されています。録画一覧へリダイレクトします...
        </p>
        <button
            type="button"
            onclick={() => router.replace('/recorded')}
            class="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 cursor-pointer"
        >
            録画一覧へ
        </button>
    </div>
{:else}
    <div class="space-y-5 w-full max-w-full min-w-0">
        <!-- ツールバー & フィルター -->
        <div
            class="space-y-3.5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
        >
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                        <Radio size={20} class="text-blue-600 dark:text-blue-400" />
                        放送中の番組
                    </h1>
                    <p class="text-xs text-slate-500 dark:text-slate-400">
                        現在放送中の番組をリアルタイムに視聴・録画、次の番組を即座に予約
                    </p>
                </div>

                <!-- 放送波タブ -->
                <div class="flex overflow-x-auto max-w-full rounded-xl bg-slate-100 p-1 dark:bg-slate-800 no-scrollbar">
                    {#each channelTypes as type}
                        <button
                            type="button"
                            onclick={() => (selectedType = type.id)}
                            class="rounded-xl px-4 py-2 text-sm font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 {selectedType ===
                            type.id
                                ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-blue-400'
                                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'}"
                        >
                            {type.name}
                        </button>
                    {/each}
                </div>
            </div>

            <!-- キーワード検索 & ジャンルチップ -->
            <div class="flex flex-wrap items-center gap-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
                <!-- 検索入力 -->
                <div class="relative flex-1 min-w-[220px] max-w-md">
                    <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        bind:value={keyword}
                        placeholder="番組名や概要で絞り込み..."
                        class="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-9 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-hidden dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-400 dark:focus:bg-slate-800 transition-colors"
                    />
                    {#if keyword}
                        <button
                            type="button"
                            onclick={() => (keyword = '')}
                            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                            aria-label="検索ワードをクリア"
                        >
                            <X size={15} />
                        </button>
                    {/if}
                </div>

                <!-- ジャンルチップ -->
                <div class="flex flex-wrap items-center gap-1.5">
                    {#each GENRES as g}
                        <button
                            type="button"
                            onclick={() => (selectedGenre = g.id)}
                            class="rounded-lg px-3 py-1.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap {selectedGenre ===
                            g.id
                                ? 'bg-blue-600 text-white font-bold shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}"
                        >
                            {g.name}
                        </button>
                    {/each}
                </div>
            </div>
        </div>

        <!-- 一覧テーブル -->
        {#if isLoading}
            <div
                class="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
                <p class="text-sm font-medium text-slate-400">放送中データを取得中...</p>
            </div>
        {:else if filteredList.length === 0}
            <div
                class="flex h-64 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900"
            >
                <Tv size={36} class="text-slate-300 dark:text-slate-600" />
                <p class="mt-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                    条件に一致する放送中の番組が見つかりません
                </p>
                <p class="text-xs text-slate-400 mt-1">放送波タブやジャンル条件を変更してみてください</p>
            </div>
        {:else}
            <!-- モバイル向けカードリスト (md:hidden) -->
            <div class="space-y-3 md:hidden">
                {#each filteredList as item}
                    {@const current = item.current}
                    {@const next = item.next}
                    {@const progress = current ? getProgress(current.startAt, current.endAt, currentTime) : 0}
                    {@const isRec = current?.isRecording}

                    <div
                        class="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3 {isRec
                            ? 'border-l-4 border-l-rose-500 bg-rose-50/20 dark:bg-rose-950/10'
                            : ''}"
                    >
                        <!-- 局情報ヘッダー -->
                        <div class="flex items-center justify-between gap-2">
                            <div class="flex items-center gap-2">
                                <span
                                    class="rounded-lg px-2.5 py-0.5 text-xs font-bold {getChannelTypeBadgeClass(
                                        item.channel?.channelType,
                                    )}"
                                >
                                    [{item.channel?.channelType}] {item.channel?.name || ''}
                                </span>
                                {#if item.channel?.remoteControlKeyId}
                                    <span class="text-xs font-semibold text-slate-400">
                                        ch.{item.channel.remoteControlKeyId}
                                    </span>
                                {/if}
                            </div>
                            {#if isRec}
                                <span
                                    class="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-black text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 animate-pulse"
                                >
                                    <CircleDot size={12} /> 録画中
                                </span>
                            {/if}
                        </div>

                        <!-- 現在放送中 -->
                        {#if current}
                            <div class="space-y-2.5">
                                <div
                                    class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400"
                                >
                                    <span class="flex items-center gap-1 font-semibold">
                                        <Clock size={13} />
                                        {formatTime(current.startAt)} - {formatTime(current.endAt)}
                                    </span>
                                    <span
                                        class="font-bold text-blue-600 dark:text-blue-400 bg-blue-50/60 dark:bg-blue-950/40 px-2 py-0.5 rounded"
                                    >
                                        {formatTimeRemaining(current.endAt, currentTime)}
                                    </span>
                                </div>

                                <!-- 番組名 -->
                                <button
                                    type="button"
                                    onclick={() => openProgramDetail(current, item.channel, false)}
                                    class="program-title hover:text-blue-600 dark:hover:text-blue-400 text-left line-clamp-2 cursor-pointer transition-colors w-full"
                                >
                                    {current.name}
                                </button>

                                <!-- 進捗バー -->
                                <div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                    <div
                                        class="h-full bg-blue-500 transition-all duration-500"
                                        style="width: {progress}%"
                                    ></div>
                                </div>

                                {#if current.description}
                                    <p class="program-summary line-clamp-2">
                                        {current.description}
                                    </p>
                                {/if}

                                <!-- 視聴・録画ボタン -->
                                <div class="flex items-center gap-2 pt-1">
                                    {#if readOnlyStore.canLiveStream}
                                        <button
                                            type="button"
                                            onclick={() => openStreamModal(item.channel, current.name)}
                                            class="flex-1 btn-primary h-10 text-sm font-bold cursor-pointer"
                                        >
                                            <Play size={15} fill="currentColor" /> 視聴する
                                        </button>
                                    {/if}
                                    {#if !readOnlyStore.isReadOnly}
                                        {#if isRec}
                                            <button
                                                type="button"
                                                onclick={() => openRecordingAction(item)}
                                                class="h-10 px-4 rounded-xl border border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950 dark:text-rose-300 text-sm font-bold cursor-pointer transition-colors flex items-center gap-1.5"
                                            >
                                                <CircleDot size={14} /> 録画中
                                            </button>
                                        {:else}
                                            <button
                                                type="button"
                                                disabled={isReserving}
                                                onclick={() => startRecordCurrentProgram(item)}
                                                class="h-10 px-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 text-sm font-bold cursor-pointer transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                            >
                                                <Bookmark size={14} /> 録画
                                            </button>
                                        {/if}
                                    {/if}
                                </div>
                            </div>
                        {:else}
                            <p class="text-xs text-slate-400">現在放送中の番組情報がありません</p>
                        {/if}

                        <!-- 次の番組 -->
                        {#if next}
                            <div
                                class="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2"
                            >
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-1.5 text-xs text-slate-400 mb-0.5">
                                        <span class="font-bold text-slate-500 dark:text-slate-400">次の番組</span>
                                        <span>{formatTime(next.startAt)} - {formatTime(next.endAt)}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onclick={() => openProgramDetail(next, item.channel, true)}
                                        class="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-1 hover:text-blue-600 dark:hover:text-blue-400 text-left cursor-pointer w-full"
                                    >
                                        {next.name}
                                    </button>
                                </div>
                                {#if !readOnlyStore.isReadOnly}
                                    <button
                                        type="button"
                                        disabled={isReserving}
                                        onclick={() => toggleReserveProgram(next)}
                                        class="shrink-0 h-9 px-3.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer disabled:opacity-50 {next.isReserved
                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                            : 'btn-secondary'}"
                                    >
                                        {next.isReserved ? '予約中' : '予約'}
                                    </button>
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>

            <!-- デスクトップ向けテーブル (hidden md:block) -->
            <div
                class="hidden md:block w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900"
            >
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs">
                        <thead
                            class="border-b border-slate-200 bg-slate-50/80 font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400"
                        >
                            <tr>
                                <th class="px-4 py-3.5 w-36 sm:w-44">放送局</th>
                                <th class="px-4 py-3.5 min-w-[320px]">現在の番組 (放送中)</th>
                                <th
                                    class="px-4 py-3.5 w-64 sm:w-80 lg:w-96 border-l border-slate-100 dark:border-slate-800"
                                >
                                    次の番組
                                </th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                            {#each filteredList as item}
                                {@const current = item.current}
                                {@const next = item.next}
                                {@const progress = current
                                    ? getProgress(current.startAt, current.endAt, currentTime)
                                    : 0}
                                {@const isRec = current?.isRecording}
                                <tr
                                    class="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40 {isRec
                                        ? 'bg-rose-50/40 dark:bg-rose-950/20'
                                        : ''}"
                                >
                                    <!-- 1. 放送局カラム -->
                                    <td class="px-4 py-4 align-top whitespace-nowrap">
                                        <div class="space-y-1.5">
                                            <span
                                                class="inline-block rounded-lg px-2.5 py-1 text-xs font-bold {getChannelTypeBadgeClass(
                                                    item.channel?.channelType,
                                                )}"
                                            >
                                                [{item.channel?.channelType}] {item.channel?.name || ''}
                                            </span>
                                            {#if item.channel?.remoteControlKeyId}
                                                <div
                                                    class="text-xs font-semibold text-slate-400 dark:text-slate-500 pl-1"
                                                >
                                                    ch.{item.channel.remoteControlKeyId}
                                                </div>
                                            {/if}
                                        </div>
                                    </td>

                                    <!-- 2. 現在の番組カラム (主役: メタ情報 ➔ タイトル ＋ 視聴・録画ボタン ➔ 進捗バー ➔ 概要) -->
                                    <td class="px-4 py-4 align-top min-w-0">
                                        {#if current}
                                            <div class="space-y-2.5">
                                                <!-- メタ情報: 時間、残り時間、ジャンルバッジ、録画中ステータス -->
                                                <div class="flex flex-wrap items-center gap-2">
                                                    <span
                                                        class="flex items-center gap-1 font-semibold text-slate-500 dark:text-slate-400 text-xs"
                                                    >
                                                        <Clock size={13} />
                                                        {formatTime(current.startAt)} - {formatTime(current.endAt)}
                                                    </span>

                                                    <span
                                                        class="font-bold text-blue-600 dark:text-blue-400 bg-blue-50/60 dark:bg-blue-950/40 px-2 py-0.5 rounded text-xs"
                                                    >
                                                        {formatTimeRemaining(current.endAt, currentTime)}
                                                    </span>

                                                    {#if current.genre1 !== undefined}
                                                        <span
                                                            class="rounded-md border px-2 py-0.5 text-xs font-bold {getGenreBadgeClass(
                                                                current.genre1,
                                                            )}"
                                                        >
                                                            {getGenreName(current.genre1)}
                                                        </span>
                                                    {/if}

                                                    {#if isRec}
                                                        <span
                                                            class="flex items-center gap-1 rounded-md bg-rose-600 px-2 py-0.5 text-xs font-black text-white shadow-xs animate-pulse"
                                                        >
                                                            <CircleDot size={12} /> 録画中
                                                        </span>
                                                    {/if}
                                                </div>

                                                <!-- 番組タイトル ＆ アクションボタン群 (番組名のすぐ傍に配置) -->
                                                <div class="flex flex-wrap items-center justify-between gap-3">
                                                    <button
                                                        type="button"
                                                        onclick={() => openProgramDetail(current, item.channel, false)}
                                                        class="program-title text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer flex-1 min-w-[200px]"
                                                    >
                                                        {current.name}
                                                    </button>

                                                    <!-- アクションボタン群 (視聴 ＆ 録画) -->
                                                    <div class="flex items-center gap-2 shrink-0">
                                                        <!-- 【▶ 視聴】ボタン -->
                                                        {#if readOnlyStore.canLiveStream}
                                                            <button
                                                                type="button"
                                                                onclick={() =>
                                                                    openStreamModal(item.channel, current.name)}
                                                                class="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:shadow-md transition cursor-pointer"
                                                                title="ライブ視聴を開始"
                                                            >
                                                                <Play size={13} fill="currentColor" /> 視聴
                                                            </button>
                                                        {/if}

                                                        <!-- 【🔴 録画】/【● 録画中 (3択)】ボタン -->
                                                        {#if !readOnlyStore.isReadOnly}
                                                            {#if isRec}
                                                                <button
                                                                    type="button"
                                                                    onclick={() => openRecordingAction(item)}
                                                                    class="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
                                                                    title="録画中の操作 (完了・中断・破棄)"
                                                                >
                                                                    <CircleDot size={13} /> 録画中
                                                                </button>
                                                            {:else}
                                                                <button
                                                                    type="button"
                                                                    disabled={isReserving}
                                                                    onclick={() => startRecordCurrentProgram(item)}
                                                                    class="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 px-3.5 py-2 text-xs font-bold text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60 transition cursor-pointer disabled:opacity-50"
                                                                    title="この番組を今すぐ録画"
                                                                >
                                                                    <Bookmark size={13} /> 録画
                                                                </button>
                                                            {/if}
                                                        {/if}
                                                    </div>
                                                </div>

                                                <!-- 進捗プログレスバー -->
                                                <div
                                                    class="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                                                >
                                                    <div
                                                        class="h-full bg-blue-500 transition-all duration-500"
                                                        style="width: {progress}%"
                                                    ></div>
                                                </div>

                                                <!-- 番組概要 (2行クランプ、クリックでモーダル) -->
                                                {#if current.description}
                                                    <button
                                                        type="button"
                                                        onclick={() => openProgramDetail(current, item.channel, false)}
                                                        class="text-left line-clamp-2 text-xs leading-relaxed text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer w-full"
                                                    >
                                                        {current.description}
                                                    </button>
                                                {/if}
                                            </div>
                                        {:else}
                                            <span class="text-slate-400 text-xs">番組情報なし</span>
                                        {/if}
                                    </td>

                                    <!-- 3. 次の番組カラム (開始時刻、ジャンル、タイトル、予約ボタン/予約中バッジ) -->
                                    <td
                                        class="px-4 py-4 align-top border-l border-slate-100 dark:border-slate-800 bg-slate-50/25 dark:bg-slate-900/20"
                                    >
                                        {#if next}
                                            <div class="space-y-2">
                                                <!-- メタ情報 & 予約アクション -->
                                                <div class="flex items-center justify-between gap-1">
                                                    <div class="flex items-center gap-1.5 flex-wrap">
                                                        <span
                                                            class="text-xs font-bold text-slate-600 dark:text-slate-300"
                                                        >
                                                            {formatTime(next.startAt)}〜
                                                        </span>
                                                        {#if next.genre1 !== undefined}
                                                            <span
                                                                class="rounded-md border px-2 py-0.5 text-xs font-bold {getGenreBadgeClass(
                                                                    next.genre1,
                                                                )}"
                                                            >
                                                                {getGenreName(next.genre1)}
                                                            </span>
                                                        {/if}
                                                    </div>

                                                    <!-- 予約状態バッジ / 予約ボタン -->
                                                    {#if !readOnlyStore.isReadOnly}
                                                        {#if next.isReserved}
                                                            <button
                                                                type="button"
                                                                onclick={() => router.push('/reserves')}
                                                                class="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-sm font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 transition cursor-pointer"
                                                                title="予約一覧で確認"
                                                            >
                                                                <Check size={15} /> 予約中
                                                            </button>
                                                        {:else}
                                                            <button
                                                                type="button"
                                                                disabled={isReserving}
                                                                onclick={() => toggleReserveProgram(next)}
                                                                class="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 px-3.5 py-1.5 text-sm font-bold text-rose-600 dark:bg-rose-950 dark:text-rose-300 dark:hover:bg-rose-900/60 transition cursor-pointer disabled:opacity-50"
                                                                title="ワンクリック予約"
                                                            >
                                                                <Plus size={15} /> 予約
                                                            </button>
                                                        {/if}
                                                    {/if}
                                                </div>

                                                <!-- 次番組タイトル -->
                                                <button
                                                    type="button"
                                                    onclick={() => openProgramDetail(next, item.channel, true)}
                                                    class="program-title-dense text-left line-clamp-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer w-full"
                                                >
                                                    {next.name}
                                                </button>
                                            </div>
                                        {:else}
                                            <span class="text-slate-400 text-xs">-</span>
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
{/if}

<!-- 番組詳細ポップアップモーダル (現在 / 次の番組 共通) -->
{#if isDetailModalOpen && selectedDetailItem}
    {@const p = selectedDetailItem.program}
    {@const ch = selectedDetailItem.channel}
    {@const isNext = selectedDetailItem.isNext}
    {@const prog = getProgress(p.startAt, p.endAt, currentTime)}
    {@const isRec = p.isRecording}
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
                    <div class="flex flex-wrap items-center gap-2">
                        <span
                            class="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        >
                            [{ch?.channelType}] {ch?.name}
                        </span>
                        {#if p.genre1 !== undefined}
                            <span
                                class="rounded-md border px-2 py-0.5 text-xs font-bold {getGenreBadgeClass(p.genre1)}"
                            >
                                {getGenreName(p.genre1)}
                            </span>
                        {/if}
                        {#if isNext}
                            <span
                                class="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            >
                                次の番組
                            </span>
                        {:else if isRec}
                            <span
                                class="flex items-center gap-1 rounded-md bg-rose-600 px-2 py-0.5 text-xs font-bold text-white shadow-xs animate-pulse"
                            >
                                <CircleDot size={12} /> 録画中
                            </span>
                        {:else}
                            <span
                                class="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            >
                                現在放送中
                            </span>
                        {/if}
                    </div>
                    <h2 class="program-title-modal mt-2">
                        {p.name}
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
                <!-- 時間・進行状況 -->
                <div
                    class="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40 space-y-2 text-xs sm:text-sm"
                >
                    <div class="flex items-center justify-between text-slate-600 dark:text-slate-400 font-semibold">
                        <span class="flex items-center gap-1.5">
                            <Clock size={14} />
                            {formatDate(p.startAt)}
                            {formatTime(p.startAt)} - {formatTime(p.endAt)}
                        </span>
                        {#if !isNext}
                            <span class="text-blue-600 dark:text-blue-400 font-bold">
                                {formatTimeRemaining(p.endAt, currentTime)} ({prog}% 経過)
                            </span>
                        {/if}
                    </div>
                    {#if !isNext}
                        <div class="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                            <div class="h-full bg-blue-500 transition-all duration-500" style="width: {prog}%"></div>
                        </div>
                    {/if}
                </div>

                <!-- 番組概要 -->
                {#if p.description}
                    <div>
                        <h4 class="font-bold text-sm text-slate-800 dark:text-slate-100 mb-1">番組概要</h4>
                        <div
                            class="program-description rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-800/20"
                        >
                            {p.description}
                        </div>
                    </div>
                {/if}

                <!-- 詳細情報 / 出演者 / あらすじ -->
                {#if p.extended}
                    <div>
                        <h4 class="font-bold text-sm text-slate-800 dark:text-slate-100 mb-1">詳細情報・出演者</h4>
                        <div
                            class="program-extended space-y-2 rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-800/20 max-h-60 overflow-y-auto"
                        >
                            {#if typeof p.extended === 'object'}
                                {#each Object.entries(p.extended) as [key, value]}
                                    <div>
                                        <span class="font-bold text-blue-600 dark:text-blue-400">{key}:</span>
                                        <p class="mt-0.5 whitespace-pre-wrap leading-relaxed">
                                            {value}
                                        </p>
                                    </div>
                                {/each}
                            {:else}
                                <p class="whitespace-pre-wrap leading-relaxed">
                                    {p.extended}
                                </p>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>

            <!-- モーダルフッター (予約 / 視聴 / ルール作成) -->
            <div
                class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-4 dark:border-slate-800"
            >
                {#if !readOnlyStore.isReadOnly}
                    <button
                        type="button"
                        onclick={() => {
                            isDetailModalOpen = false;
                            const kw = extractFirstSearchWord(p.name);
                            router.push(`/search?keyword=${encodeURIComponent(kw)}`);
                        }}
                        class="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer"
                    >
                        <Search size={14} /> この番組でルール作成
                    </button>
                {:else}
                    <div></div>
                {/if}

                <div class="flex items-center gap-2">
                    {#if !readOnlyStore.isReadOnly}
                        {#if isRec}
                            <!-- 録画中の場合は3択モーダルを開く -->
                            <button
                                type="button"
                                onclick={() => {
                                    isDetailModalOpen = false;
                                    const item = onAirList.find(s => s.channel.id === ch.id);
                                    if (item) openRecordingAction(item);
                                }}
                                class="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-rose-700 cursor-pointer"
                            >
                                <CircleDot size={14} /> 録画操作 (3択)
                            </button>
                        {:else if isNext && p.isReserved}
                            <button
                                type="button"
                                onclick={() => {
                                    isDetailModalOpen = false;
                                    router.push('/reserves');
                                }}
                                class="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 cursor-pointer"
                            >
                                <Check size={14} /> 予約一覧で確認
                            </button>
                        {:else}
                            <button
                                type="button"
                                disabled={isReserving}
                                onclick={() => {
                                    if (isNext) {
                                        toggleReserveProgram(p);
                                    } else {
                                        const item = onAirList.find(s => s.channel.id === ch.id);
                                        if (item) startRecordCurrentProgram(item);
                                    }
                                }}
                                class="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                            >
                                <Bookmark size={14} />
                                {isNext ? 'この番組を予約' : '今すぐ録画'}
                            </button>
                        {/if}
                    {/if}

                    {#if !isNext && readOnlyStore.canLiveStream}
                        <button
                            type="button"
                            onclick={() => {
                                isDetailModalOpen = false;
                                openStreamModal(ch, p.name);
                            }}
                            class="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 cursor-pointer"
                        >
                            <Play size={14} fill="currentColor" /> 今すぐ視聴
                        </button>
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- 録画中番組の操作モーダル (3択アクション) -->
{#if isRecordingActionModalOpen && recordingActionItem}
    <RecordingActionModal
        isOpen={isRecordingActionModalOpen}
        item={recordingActionItem}
        isProcessing={isRecordingActionProcessing}
        onAction={handleRecordingAction}
        onClose={() => {
            isRecordingActionModalOpen = false;
            recordingActionItem = null;
        }}
    />
{/if}

<!-- ライブ配信設定モーダル -->
{#if selectedChannel}
    {@const ch = selectedChannel}
    <StreamSelectModal
        isOpen={isStreamModalOpen}
        title={streamModalTitle || `${ch.name} ライブ視聴`}
        channelId={ch.id}
        channelName={ch.name}
        onClose={() => {
            isStreamModalOpen = false;
            selectedChannel = null;
            streamModalTitle = '';
        }}
    />
{/if}
