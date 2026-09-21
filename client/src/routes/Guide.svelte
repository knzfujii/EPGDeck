<script lang="ts">
    import { onMount, onDestroy, tick } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { socketStore } from '../lib/stores/socket.svelte';
    import { readOnlyStore } from '../lib/stores/readOnly.svelte';
    import { configStore } from '../lib/stores/config.svelte';
    import type * as apid from '../../../api';
    import api from '@/lib/apiClient';
    import { extractFirstSearchWord, getChannelTypeBadgeClass } from '../lib/utils/format';
    import RecordingActionModal from '../lib/components/recording/RecordingActionModal.svelte';
    import RecordingOptionForm from '../lib/components/recording/RecordingOptionForm.svelte';
    import {
        getDefaultRecordingOptionState,
        loadRecordingOptionState,
        buildSaveOption,
        buildEncodeOption,
        type EncodeRow,
    } from '../lib/utils/recordingOptions';
    import {
        Calendar,
        ChevronLeft,
        ChevronRight,
        Clock,
        Filter,
        X,
        Plus,
        Trash2,
        Search,
        CheckCircle2,
        AlertTriangle,
        Lock,
        Radio,
        Compass,
        SlidersHorizontal,
        Ban,
        RotateCcw,
        Square,
    } from '@lucide/svelte';

    import {
        getBaseDate,
        isGuideTimeRange,
        calculateTargetMinutes,
        calculateCurrentTimeTop,
        HOUR_HEIGHT,
        MINUTE_HEIGHT,
        DISPLAY_HOURS,
        GRID_HEIGHT,
        HEADER_HEIGHT,
        MAX_DAYS_AHEAD,
    } from '../lib/utils/guide';

    let schedules = $state<apid.Schedule[]>([]);
    let isLoading = $state(true);
    let selectedDate = $state(getBaseDate());
    let selectedType = $state<'all' | 'GR' | 'BS' | 'CS' | 'SKY'>('all');
    let isFilterExpanded = $state(false);

    // 選択可能な日付リスト (今日〜8日後)
    let availableDates = $derived.by(() => {
        const list: { date: Date; label: string; value: string; isToday: boolean }[] = [];
        const base = getBaseDate();
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

        for (let i = 0; i <= MAX_DAYS_AHEAD; i++) {
            const d = new Date(base);
            d.setDate(d.getDate() + i);
            const month = d.getMonth() + 1;
            const day = d.getDate();
            const dayOfWeek = dayNames[d.getDay()];
            const isToday = i === 0;
            const prefix = isToday ? '今日 ' : i === 1 ? '明日 ' : i === 2 ? '明後日 ' : '';

            list.push({
                date: d,
                label: `${prefix}${month}/${day} (${dayOfWeek})`,
                value: d.toDateString(),
                isToday,
            });
        }
        return list;
    });

    // 過去方向 / 未来方向のナビゲーション可否判定
    let isMinDate = $derived.by(() => {
        const base = getBaseDate();
        return selectedDate.getTime() <= base.getTime();
    });

    let isMaxDate = $derived.by(() => {
        const max = getBaseDate();
        max.setDate(max.getDate() + MAX_DAYS_AHEAD);
        return selectedDate.getTime() >= max.getTime();
    });

    // 番組詳細モーダル状態
    let selectedProgram = $state<any>(null);
    let isModalOpen = $state(false);
    let isReserving = $state(false);

    // 予約マップ (programId -> reserve)
    let reservesMap = $state<Map<number, apid.ReserveItem & { isRecording?: boolean }>>(new Map());
    let unsubscribeSocket: (() => void) | null = null;

    // 録画中番組の操作モーダル状態
    let isRecordingActionModalOpen = $state(false);
    let recordingActionItem = $state<(apid.ReserveItem & { isRecording?: boolean }) | null>(null);
    let isRecordingActionProcessing = $state(false);

    // 予約オプション設定 (エンコードプリセット名 / 保存先ディレクトリ名)
    let encodeModes = $state<string[]>([]);
    let storageDirs = $state<string[]>([]);

    // 予約フォーム状態
    const defaultOptionState = getDefaultRecordingOptionState();
    let saveParentDir = $state(defaultOptionState.saveParentDir);
    let saveSubDir = $state(defaultOptionState.saveSubDir);
    let encRows = $state<EncodeRow[]>(defaultOptionState.encRows);
    let isDeleteOriginal = $state(defaultOptionState.isDeleteOriginal);
    let allowEndLack = $state(defaultOptionState.allowEndLack);

    // 予約フォームを初期化 (新規予約時)
    function resetReserveForm() {
        const state = getDefaultRecordingOptionState();
        saveParentDir = state.saveParentDir;
        saveSubDir = state.saveSubDir;
        encRows = state.encRows;
        isDeleteOriginal = state.isDeleteOriginal;
        allowEndLack = state.allowEndLack;
    }

    // 予約フォームに既存の予約設定を反映 (編集時)
    function loadReserveForm(reserve: any) {
        const state = loadRecordingOptionState(reserve);
        saveParentDir = state.saveParentDir;
        saveSubDir = state.saveSubDir;
        encRows = state.encRows;
        isDeleteOriginal = state.isDeleteOriginal;
        allowEndLack = state.allowEndLack;
    }

    // グリッドスクロールコンテナ参照
    let scrollContainer = $state<HTMLDivElement | null>(null);

    const ALL_CHANNEL_TYPES = [
        { id: 'all', name: 'すべて' },
        { id: 'GR', name: '地デジ' },
        { id: 'BS', name: 'BS' },
        { id: 'CS', name: 'CS' },
        { id: 'SKY', name: 'SKY' },
    ] as const;

    let channelTypes = $derived.by(() => {
        const active = new Set(channelStore.activeChannelTypes);
        return ALL_CHANNEL_TYPES.filter(t => t.id === 'all' || active.has(t.id as apid.ChannelType));
    });

    $effect(() => {
        if (channelTypes.length > 0 && !channelTypes.some(t => t.id === selectedType)) {
            selectedType = 'all';
        }
    });

    // 時間帯ジャンプのプリセット (早朝4時は削除)
    const timeJumps = [
        { hour: 9, name: '朝 9時' },
        { hour: 12, name: '昼 12時' },
        { hour: 19, name: 'ゴールデン 19時' },
        { hour: 23, name: '深夜 23時' },
    ];

    // 「現在」ボタンのクリック処理 (今日以外なら今日に復帰して現在時刻へスクロール)
    function jumpToNow() {
        const now = Date.now();
        if (!isGuideTimeRange(now, guideStartAt, guideEndAt)) {
            selectedDate = getBaseDate();
            fetchGuide(true);
        } else {
            scrollToCurrentOrPreset('now', true);
        }
    }

    // 番組表の開始・終了Unixtime
    let guideStartAt = $state<number>(0);
    let guideEndAt = $state<number>(0);

    // タイムスケールの時間ラベル配列 [4, 5, 6, ..., 23, 0, 1, 2, 3]
    let timeScaleHours = $derived.by(() => {
        const hours: { hour: number; label: string; top: number }[] = [];
        const base = new Date(guideStartAt || Date.now());
        const startHour = base.getHours();

        for (let i = 0; i < DISPLAY_HOURS; i++) {
            const h = (startHour + i) % 24;
            hours.push({
                hour: h,
                label: `${h.toString().padStart(2, '0')}:00`,
                top: i * HOUR_HEIGHT,
            });
        }
        return hours;
    });

    // 現在時刻（ミリ秒）
    let now = $state(Date.now());

    // 現在時刻ラインの top 位置 (px)
    let currentTimeTop = $state<number | null>(null);

    function updateCurrentTimeLine() {
        now = Date.now();
        currentTimeTop = calculateCurrentTimeTop(now, guideStartAt, guideEndAt);
    }

    function createReservesMap(reserves: apid.ReserveItem[], recordingList: any[]) {
        const now = Date.now();
        const map = new Map<number, apid.ReserveItem & { isRecording?: boolean }>();
        for (const r of reserves || []) {
            if (r.programId) {
                const isCurrentlyRecording =
                    recordingList.some(
                        (rec: any) =>
                            (rec.programId && rec.programId === r.programId) ||
                            (rec.channelId === r.channelId &&
                                Math.abs(rec.startAt - r.startAt) < 60000 &&
                                Math.abs(rec.endAt - r.endAt) < 60000),
                    ) ||
                    (r.startAt <= now && now < r.endAt && !r.isSkip);
                map.set(r.programId, { ...r, isRecording: isCurrentlyRecording });
            }
        }
        return map;
    }

    async function fetchGuide(autoScroll = false) {
        isLoading = true;
        try {
            await channelStore.fetch();

            // 番組表の開始時刻を「選択日の 4:00」に設定 (テレビ番組表標準)
            const start = new Date(selectedDate);
            start.setHours(4, 0, 0, 0);
            guideStartAt = start.getTime();
            guideEndAt = guideStartAt + DISPLAY_HOURS * 60 * 60 * 1000;

            const scheduleParams: Record<string, any> = {
                startAt: guideStartAt,
                endAt: guideEndAt,
                isHalfWidth: true,
            };
            if (selectedType === 'all') {
                scheduleParams.GR = true;
                scheduleParams.BS = true;
                scheduleParams.CS = true;
                scheduleParams.SKY = true;
            } else {
                scheduleParams[selectedType] = true;
            }

            const [scheduleRes, reservesRes, recordingRes] = await Promise.all([
                api.schedules
                    .$get({
                        query: scheduleParams,
                    })
                    .then(async r => (r.ok ? await r.json() : [])),
                api.reserves
                    .$get({
                        query: {
                            startAt: guideStartAt,
                            endAt: guideEndAt,
                            isHalfWidth: true,
                        },
                    })
                    .then(async r => (r.ok ? await r.json() : { reserves: [] }))
                    .catch(() => ({ reserves: [] })),
                api.recording
                    .$get({ query: { isHalfWidth: true } })
                    .then(async r => (r.ok ? await r.json() : { records: [] }))
                    .catch(() => ({ records: [] })),
            ]);

            schedules = scheduleRes || [];
            reservesMap = createReservesMap(
                (reservesRes.reserves as apid.ReserveItem[]) || [],
                recordingRes.records || [],
            );

            updateCurrentTimeLine();
        } catch (e) {
            console.error('Failed to fetch guide schedules', e);
            snackbar.open({ text: '番組表データの取得に失敗しました', color: 'error' });
        } finally {
            isLoading = false;
        }

        // DOM が描画された後に確実に現在時刻へスクロール
        if (autoScroll) {
            await tick();
            setTimeout(() => {
                scrollToCurrentOrPreset('now');
            }, 60);
        }
    }

    // 予約マップのみを更新 (番組表の再描画・スクロール位置のリセットを避ける)
    async function refreshReservesMap() {
        try {
            const [reservesRes, recordingRes] = await Promise.all([
                api.reserves
                    .$get({
                        query: {
                            startAt: guideStartAt,
                            endAt: guideEndAt,
                            isHalfWidth: true,
                        },
                    })
                    .then(async r => (r.ok ? await r.json() : { reserves: [] }))
                    .catch(() => ({ reserves: [] })),
                api.recording
                    .$get({ query: { isHalfWidth: true } })
                    .then(async r => (r.ok ? await r.json() : { records: [] }))
                    .catch(() => ({ records: [] })),
            ]);

            reservesMap = createReservesMap(
                (reservesRes.reserves as apid.ReserveItem[]) || [],
                recordingRes.records || [],
            );
        } catch (e) {
            console.error('Failed to refresh reserves map', e);
        }
    }

    // 指定時間または現在時刻へスクロール
    function scrollToCurrentOrPreset(target: string | number, smooth = false) {
        if (!scrollContainer) return;

        const targetMinutes = calculateTargetMinutes(target, Date.now(), guideStartAt, guideEndAt);
        const targetScrollTop = targetMinutes * MINUTE_HEIGHT;
        if (smooth) {
            scrollContainer.scrollTo({
                top: targetScrollTop,
                behavior: 'smooth',
            });
        } else {
            scrollContainer.scrollTop = targetScrollTop;
        }
    }

    onMount(() => {
        fetchGuide(true);
        // エンコードプリセット名と保存先ディレクトリ名を取得
        configStore
            .fetch()
            .then(() => {
                encodeModes = configStore.encodeModeNames;
                storageDirs = configStore.recordedDirs;
            })
            .catch(e => console.error('Failed to fetch config', e));
        const timer = setInterval(updateCurrentTimeLine, 30000);

        // Socket.IO による予約変更通知を受信してリアルタイム更新
        unsubscribeSocket = socketStore.on('updateStatus', () => {
            refreshReservesMap();
        });

        return () => {
            clearInterval(timer);
            unsubscribeSocket?.();
        };
    });

    onDestroy(() => {
        unsubscribeSocket?.();
    });

    function changeDate(days: number) {
        const base = getBaseDate();
        const max = new Date(base);
        max.setDate(max.getDate() + MAX_DAYS_AHEAD);

        const nextTime = selectedDate.getTime() + days * 24 * 60 * 60 * 1000;
        if (days < 0 && nextTime < base.getTime()) return;
        if (days > 0 && nextTime > max.getTime()) return;

        selectedDate = new Date(nextTime);
        fetchGuide(true);
    }

    function setDateToday() {
        selectedDate = getBaseDate();
        fetchGuide(true);
    }

    function formatDate(d: Date): string {
        return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} (${['日', '月', '火', '水', '木', '金', '土'][d.getDay()]})`;
    }

    function formatTime(timestamp: number): string {
        const d = new Date(timestamp);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }

    // 番組クリックで詳細モーダルを開く
    function openProgramModal(program: any, channel: any) {
        const reserve = reservesMap.get(program.id) || null;
        selectedProgram = {
            ...program,
            channelName: channel.name,
            channelId: channel.id,
            reserve: reserve,
        };
        if (reserve) {
            loadReserveForm(reserve);
        } else {
            resetReserveForm();
        }
        isModalOpen = true;
    }

    // 予約追加
    async function addReserve(program: apid.ScheduleProgramItem) {
        if (!program || isReserving) return;
        isReserving = true;
        try {
            await api.reserves.$post({
                json: {
                    programId: program.id,
                    isHalfWidth: true,
                    allowEndLack: allowEndLack,
                    saveOption: buildSaveOption({ saveParentDir, saveSubDir }),
                    encodeOption: buildEncodeOption({ encRows, isDeleteOriginal }),
                },
            });
            snackbar.open({ text: `「${program.name}」を録画予約しました`, color: 'success' });
            await refreshReservesMap();
            if (selectedProgram) {
                selectedProgram.reserve = reservesMap.get(selectedProgram.id) || null;
            }
            isModalOpen = false;
        } catch (e: any) {
            console.error('Failed to add reserve', e);
            const errorMsg = e.message || '録画予約の追加に失敗しました';
            snackbar.open({ text: errorMsg, color: 'error' });
        } finally {
            isReserving = false;
        }
    }

    // 予約設定の更新
    async function updateReserve(reserveId: number, program: apid.ScheduleProgramItem) {
        if (!reserveId || isReserving) return;
        isReserving = true;
        try {
            await api.reserves[':reserveId'].$put({
                param: { reserveId: String(reserveId) },
                json: {
                    allowEndLack: allowEndLack,
                    saveOption: buildSaveOption({ saveParentDir, saveSubDir }),
                    encodeOption: buildEncodeOption({ encRows, isDeleteOriginal }),
                },
            });
            snackbar.open({ text: `「${program.name}」の予約設定を更新しました`, color: 'success' });
            await refreshReservesMap();
            if (selectedProgram) {
                selectedProgram.reserve = reservesMap.get(selectedProgram.id) || null;
            }
            isModalOpen = false;
        } catch (e: any) {
            console.error('Failed to update reserve', e);
            const errorMsg = e.message || '予約設定の更新に失敗しました';
            snackbar.open({ text: errorMsg, color: 'error' });
        } finally {
            isReserving = false;
        }
    }

    // 予約解除 / スキップ
    async function deleteReserve(reserveId: number, name: string, isRule: boolean = false) {
        if (!reserveId || isReserving) return;
        isReserving = true;
        try {
            await api.reserves[':reserveId'].$delete({ param: { reserveId: String(reserveId) } });
            const actionText = isRule ? 'この回の録画をスキップ（除外）しました' : '予約を解除しました';
            snackbar.open({ text: `「${name}」の${actionText}`, color: 'success' });
            await refreshReservesMap();
            if (selectedProgram) {
                selectedProgram.reserve = reservesMap.get(selectedProgram.id) || null;
            }
            isModalOpen = false;
        } catch (e: any) {
            console.error('Failed to delete reserve', e);
            const errorMsg = e.message || '予約解除に失敗しました';
            snackbar.open({ text: errorMsg, color: 'error' });
        } finally {
            isReserving = false;
        }
    }

    // スキップ解除 (予約復活)
    async function restoreSkip(reserveId: number, name: string) {
        if (!reserveId || isReserving) return;
        isReserving = true;
        try {
            await api.reserves[':reserveId'].skip.$delete({ param: { reserveId: String(reserveId) } });
            snackbar.open({ text: `「${name}」の予約を復活しました`, color: 'success' });
            await refreshReservesMap();
            if (selectedProgram) {
                selectedProgram.reserve = reservesMap.get(selectedProgram.id) || null;
            }
            isModalOpen = false;
        } catch (e: any) {
            console.error('Failed to restore skip', e);
            const errorMsg = e.message || '予約の復活に失敗しました';
            snackbar.open({ text: errorMsg, color: 'error' });
        } finally {
            isReserving = false;
        }
    }

    // 録画中番組の操作ハンドラー
    async function handleRecordingAction(action: 'finish' | 'stop' | 'discard') {
        if (!recordingActionItem) return;
        const target = recordingActionItem;
        isRecordingActionProcessing = true;

        try {
            if (action === 'finish') {
                await api.recording[':reserveId'].finish.$post({ param: { reserveId: String(target.id) } });
                snackbar.open({ text: `「${target.name}」を完了として保存しました`, color: 'success' });
            } else if (action === 'stop') {
                await api.recording[':reserveId'].stop.$post({ param: { reserveId: String(target.id) } });
                snackbar.open({ text: `「${target.name}」を中断して保存しました（未完了扱い）`, color: 'info' });
            } else if (action === 'discard') {
                await api.recording[':reserveId'].discard.$post({ param: { reserveId: String(target.id) } });
                snackbar.open({ text: `「${target.name}」の録画を取り消し、ファイルを破棄しました`, color: 'warning' });
            }

            isRecordingActionModalOpen = false;
            recordingActionItem = null;
            if (isModalOpen) isModalOpen = false;
            await refreshReservesMap();
        } catch (e: any) {
            console.error(`Failed to execute recording action: ${action}`, e);
            const msg = e.message || '録画操作の実行に失敗しました';
            snackbar.open({ text: msg, color: 'error' });
        } finally {
            isRecordingActionProcessing = false;
        }
    }

    // ジャンル色（ARIB標準カラー準拠・ダークモードでも気分を盛り上げるポップな配色）
    function getGenreClass(genre1?: number): string {
        switch (genre1) {
            case 0:
                return 'border-l-4 border-l-blue-500 bg-blue-50/30 dark:bg-blue-700/45'; // ニュース
            case 1:
                return 'border-l-4 border-l-orange-500 bg-orange-50/30 dark:bg-orange-700/45'; // スポーツ
            case 2:
                return 'border-l-4 border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-700/45'; // 情報
            case 3:
                return 'border-l-4 border-l-rose-500 bg-rose-50/30 dark:bg-rose-700/45'; // ドラマ
            case 4:
                return 'border-l-4 border-l-purple-500 bg-purple-50/30 dark:bg-purple-700/45'; // 音楽
            case 5:
                return 'border-l-4 border-l-amber-500 bg-amber-50/30 dark:bg-amber-700/45'; // バラエティ
            case 6:
                return 'border-l-4 border-l-green-500 bg-green-50/30 dark:bg-green-700/45'; // 映画
            case 7:
                return 'border-l-4 border-l-pink-500 bg-pink-50/30 dark:bg-pink-700/45'; // アニメ
            case 8:
                return 'border-l-4 border-l-cyan-500 bg-cyan-50/30 dark:bg-cyan-700/45'; // ドキュメンタリー
            case 9:
                return 'border-l-4 border-l-violet-500 bg-violet-50/30 dark:bg-violet-700/45'; // 劇場・公演
            case 10:
                return 'border-l-4 border-l-lime-500 bg-lime-50/30 dark:bg-lime-700/45'; // 趣味・教育
            case 11:
                return 'border-l-4 border-l-teal-500 bg-teal-50/30 dark:bg-teal-700/45'; // 福祉
            default:
                return 'border-l-4 border-l-slate-300 dark:border-l-slate-500 bg-white dark:bg-slate-800/80';
        }
    }
</script>

<div class="space-y-3 sm:space-y-5 w-full max-w-full min-w-0">
    <!-- 日付 & 放送波ツールバー -->
    <div
        class="flex flex-col gap-2 sm:gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
    >
        <!-- 1行目: 日付ナビゲーション + 現在ボタン + スマホ用絞り込みトグル -->
        <div class="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
            <!-- 日付ナビゲーション -->
            <div class="flex items-center gap-1 sm:gap-2">
                <button
                    type="button"
                    onclick={() => changeDate(-1)}
                    disabled={isMinDate}
                    class="rounded-xl border border-slate-200 p-1.5 sm:p-2 text-slate-600 transition hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                    title="前日"
                >
                    <ChevronLeft size={16} />
                </button>

                <!-- 日付クイックドロップダウン選択 -->
                <div class="relative flex items-center">
                    <select
                        value={selectedDate.toDateString()}
                        onchange={e => {
                            const target = availableDates.find(d => d.value === e.currentTarget.value);
                            if (target) {
                                selectedDate = target.date;
                                fetchGuide(true);
                            }
                        }}
                        class="appearance-none h-9 sm:h-10 rounded-xl border border-slate-200 bg-slate-50 pl-7 sm:pl-8 pr-6 sm:pr-7 text-xs sm:text-sm font-bold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                    >
                        {#each availableDates as opt}
                            <option value={opt.value}>{opt.label}</option>
                        {/each}
                    </select>
                    <Calendar
                        size={14}
                        class="pointer-events-none absolute left-2 sm:left-2.5 text-slate-500 dark:text-slate-400"
                    />
                </div>

                <button
                    type="button"
                    onclick={() => changeDate(1)}
                    disabled={isMaxDate}
                    class="rounded-xl border border-slate-200 p-1.5 sm:p-2 text-slate-600 transition hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                    title="翌日"
                >
                    <ChevronRight size={16} />
                </button>
            </div>

            <!-- アクションボタングループ (現在ボタン ＋ スマホ用絞り込みトグル) -->
            <div class="flex items-center gap-1.5 shrink-0">
                <!-- 🔴 目立つ「現在」ボタン -->
                <button
                    type="button"
                    onclick={jumpToNow}
                    class="flex shrink-0 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm font-black text-rose-700 shadow-xs transition hover:bg-rose-100 hover:border-rose-300 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60 cursor-pointer"
                    title="現在の放送時刻へ移動（別の日を表示中の場合は今日に戻ります）"
                >
                    <span class="relative flex h-2 w-2">
                        <span
                            class="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"
                        ></span>
                        <span class="relative inline-flex h-2 w-2 rounded-full bg-rose-600"></span>
                    </span>
                    現在
                </button>

                <!-- スマホ用絞り込み開閉トグル (sm以上は非表示) -->
                <button
                    type="button"
                    onclick={() => (isFilterExpanded = !isFilterExpanded)}
                    class="sm:hidden flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer {isFilterExpanded
                        ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/60 dark:text-blue-400'
                        : ''}"
                >
                    <SlidersHorizontal size={14} />
                    <span>フィルタ</span>
                </button>
            </div>
        </div>

        <!-- 2行目: 時間帯クイックジャンプ & 放送波セレクター (スマホではトグル時のみ、sm以上は常時表示) -->
        <div
            class="items-center justify-between gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 {isFilterExpanded
                ? 'flex flex-wrap'
                : 'hidden sm:flex'}"
        >
            <!-- 時間帯クイックジャンプ -->
            <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                {#each timeJumps as jump}
                    <button
                        type="button"
                        onclick={() => scrollToCurrentOrPreset(jump.hour, true)}
                        class="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                    >
                        {jump.name}
                    </button>
                {/each}
            </div>

            <!-- 放送波セレクター -->
            <div class="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                {#each channelTypes as type}
                    <button
                        type="button"
                        onclick={() => {
                            selectedType = type.id;
                            fetchGuide(true);
                        }}
                        class="rounded-lg px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer {selectedType ===
                        type.id
                            ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-blue-400 font-bold'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'}"
                    >
                        {type.name}
                    </button>
                {/each}
            </div>
        </div>
    </div>

    <!-- 番組表グリッド (絶対時間軸レイアウト) -->
    {#if isLoading}
        <div
            class="flex h-96 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
            <p class="text-sm font-medium text-slate-400">番組表データを読み込み中...</p>
        </div>
    {:else if schedules.length === 0}
        <div
            class="flex h-96 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900"
        >
            <Calendar size={36} class="text-slate-300 dark:text-slate-600" />
            <p class="mt-2 text-sm font-bold text-slate-700 dark:text-slate-300">番組表データがありません</p>
        </div>
    {:else}
        <div
            bind:this={scrollContainer}
            class="relative w-full max-w-full min-w-0 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900"
            style="max-height: calc(100vh - 150px);"
        >
            <!-- 番組表グリッド親コンテナ -->
            <div class="inline-flex min-w-full">
                <!-- 左端: タイムスケール目盛り列 (横固定) - 幅を w-9 sm:w-16 にスリム化 -->
                <div
                    class="sticky left-0 z-40 w-9 sm:w-16 shrink-0 border-r border-slate-200 bg-slate-100/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 shadow-xs"
                >
                    <!-- 左上コーナーヘッダー (局名行と高さ合わせ) -->
                    <div
                        class="sticky top-0 z-50 flex h-12 items-center justify-center border-b border-slate-200 bg-slate-200/95 font-bold text-[10px] sm:text-xs text-slate-600 backdrop-blur dark:border-slate-800 dark:bg-slate-800/95 dark:text-slate-300"
                    >
                        時刻
                    </div>

                    <!-- 24時間目盛り (絶対配置) -->
                    <div class="relative w-full" style="height: {GRID_HEIGHT}px;">
                        {#each timeScaleHours as hour}
                            <div
                                class="absolute left-0 right-0 border-t border-slate-200/80 px-0.5 sm:px-1 pt-0.5 sm:pt-1 text-center font-mono text-[10px] sm:text-xs font-black text-slate-700 dark:border-slate-800 dark:text-slate-300"
                                style="top: {hour.top}px; height: {HOUR_HEIGHT}px;"
                            >
                                {hour.label}
                            </div>
                        {/each}

                        <!-- 現在時刻の補助線 (目盛り側) -->
                        {#if currentTimeTop !== null}
                            <div
                                class="pointer-events-none absolute left-0 right-0 z-30 flex items-center -translate-y-1/2"
                                style="top: {currentTimeTop}px;"
                            >
                                <div class="h-0.5 w-full bg-rose-500 shadow-sm"></div>
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- チャンネル列コンテナ群 -->
                <div class="relative flex">
                    <!-- 現在時刻の赤い水平線 -->
                    {#if currentTimeTop !== null}
                        <div
                            class="pointer-events-none absolute left-0 right-0 z-20 flex items-center -translate-y-1/2"
                            style="top: {currentTimeTop + HEADER_HEIGHT}px;"
                        >
                            <span
                                class="rounded bg-rose-600 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-black text-white shadow-md animate-pulse"
                            >
                                現在
                            </span>
                            <div class="h-0.5 w-full bg-rose-500 shadow-sm"></div>
                        </div>
                    {/if}

                    {#each schedules as col (col.channel?.id)}
                        <!-- チャンネル列幅を w-28 sm:w-44 に最適化 (スマホで3チャンネル以上表示) -->
                        <div
                            class="w-28 sm:w-44 shrink-0 border-r border-slate-200 last:border-r-0 dark:border-slate-800"
                        >
                            <!-- 局名ヘッダー (上部固定) -->
                            <div
                                class="sticky top-0 z-30 flex h-12 items-center justify-center border-b border-slate-200 bg-slate-50/95 px-1 sm:px-2 text-center backdrop-blur dark:border-slate-800 dark:bg-slate-800/95"
                            >
                                <div class="flex items-center gap-1 min-w-0 max-w-full justify-center">
                                    {#if col.channel?.channelType}
                                        <span
                                            class="shrink-0 rounded px-1 sm:px-2 py-0.5 text-[10px] sm:text-xs font-black uppercase {getChannelTypeBadgeClass(
                                                col.channel.channelType,
                                            )}"
                                        >
                                            {col.channel.channelType}
                                        </span>
                                    {/if}
                                    <span
                                        class="truncate text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100"
                                    >
                                        {col.channel?.name}
                                    </span>
                                </div>
                            </div>

                            <!-- チャンネル内番組配置エリア (高さ 4320px の絶対グリッド) -->
                            <div class="relative w-full" style="height: {GRID_HEIGHT}px;">
                                <!-- 1時間ごとの補助グリッド線 -->
                                {#each timeScaleHours as hour}
                                    <div
                                        class="pointer-events-none absolute left-0 right-0 border-t border-slate-100/80 dark:border-slate-800/50"
                                        style="top: {hour.top}px;"
                                    ></div>
                                {/each}
                                <!-- 番組セル群 (計算された top と height で絶対配置) -->
                                {#each col.programs || [] as prog (prog.id)}
                                    {@const progStart = Math.max(guideStartAt, prog.startAt)}
                                    {@const progEnd = Math.min(guideEndAt, prog.endAt)}
                                    {@const topPx = ((progStart - guideStartAt) / 60000) * MINUTE_HEIGHT}
                                    {@const heightPx = Math.max(14, ((progEnd - progStart) / 60000) * MINUTE_HEIGHT)}
                                    {@const reserve = reservesMap.get(prog.id)}
                                    {@const isEnded = prog.endAt <= now}

                                    {#if heightPx > 0}
                                        <button
                                            type="button"
                                            onclick={() => openProgramModal(prog, col.channel)}
                                            style="top: {topPx}px; height: {heightPx}px;"
                                            class="group absolute inset-x-0.5 overflow-hidden rounded-md border border-slate-200/90 p-1 sm:p-2 text-left transition hover:z-20 hover:border-blue-500 hover:shadow-lg dark:border-slate-800 {getGenreClass(
                                                prog.genre1,
                                            )} {isEnded
                                                ? 'opacity-50 grayscale-[40%] bg-slate-100/80 dark:bg-slate-900/60 dark:opacity-40'
                                                : ''} {reserve?.isRecording
                                                ? 'ring-2 ring-rose-500 shadow-xs'
                                                : reserve?.isSkip
                                                  ? 'opacity-60 border-dashed'
                                                  : ''}"
                                        >
                                            <div class="flex flex-col h-full justify-start overflow-hidden">
                                                <!-- 予約バッジ (予約状態に合わせて表示) -->
                                                {#if reserve}
                                                    <div class="flex items-center justify-end mb-0.5 sm:mb-1 shrink-0">
                                                        {#if reserve.isRecording}
                                                            <span
                                                                class="flex items-center gap-0.5 rounded bg-rose-600 px-1 sm:px-1.5 py-0.2 text-[10px] sm:text-xs font-black text-white shadow-xs animate-pulse"
                                                            >
                                                                ● 録画中
                                                            </span>
                                                        {:else if reserve.isSkip}
                                                            <span
                                                                class="flex items-center gap-0.5 rounded bg-slate-500/85 px-1 sm:px-1.5 py-0.2 text-[10px] sm:text-xs font-bold text-white shadow-xs"
                                                            >
                                                                スキップ
                                                            </span>
                                                        {:else if reserve.isConflict}
                                                            <span
                                                                class="flex items-center gap-0.5 rounded bg-rose-600 px-1 sm:px-1.5 py-0.2 text-[10px] sm:text-xs font-black text-white shadow-xs"
                                                            >
                                                                ▲ 競合
                                                            </span>
                                                        {:else if reserve.isOverlap}
                                                            <span
                                                                class="flex items-center gap-0.5 rounded bg-amber-600 px-1 sm:px-1.5 py-0.2 text-[10px] sm:text-xs font-black text-white shadow-xs"
                                                            >
                                                                重複
                                                            </span>
                                                        {:else}
                                                            <span
                                                                class="flex items-center gap-0.5 rounded bg-rose-600 px-1 sm:px-1.5 py-0.2 text-[10px] sm:text-xs font-black text-white shadow-xs"
                                                            >
                                                                ● 予約中
                                                            </span>
                                                        {/if}
                                                    </div>
                                                {/if}

                                                <!-- 番組タイトル (高密度化) -->
                                                <p
                                                    class="text-[11px] sm:text-xs font-bold leading-tight text-slate-900 dark:text-slate-100 {heightPx <=
                                                    30
                                                        ? 'truncate'
                                                        : heightPx <= 60
                                                          ? 'line-clamp-2'
                                                          : 'line-clamp-3'}"
                                                >
                                                    {prog.name}
                                                </p>

                                                <!-- 概要 (縦幅に合わせて優先表示) -->
                                                {#if heightPx > 50 && prog.description}
                                                    <p
                                                        class="mt-1 text-[10px] sm:text-xs leading-snug text-slate-600 line-clamp-3 dark:text-slate-300"
                                                    >
                                                        {prog.description}
                                                    </p>
                                                {/if}
                                            </div>
                                        </button>
                                    {/if}
                                {/each}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    {/if}
</div>

<!-- 番組詳細 & 予約ダイアログ (`ProgramDialog`) -->
{#if isModalOpen && selectedProgram}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true">
        <!-- バックドロップ -->
        <button
            type="button"
            class="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onclick={() => (isModalOpen = false)}
            aria-label="閉じる"
        ></button>

        <!-- モーダル本体 (画面高さの最大94%に制限し、flex-colで固定ヘッダー・フッター化) -->
        <div
            class="relative flex max-h-[94vh] sm:max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900"
        >
            <!-- モーダルヘッダー (固定) -->
            <div
                class="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-5 dark:border-slate-800"
            >
                <div>
                    <div class="flex items-center gap-2 flex-wrap">
                        <span
                            class="rounded-md bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300 whitespace-nowrap shrink-0"
                        >
                            {selectedProgram.channelName}
                        </span>
                        {#if selectedProgram.genre1 !== undefined}
                            <span
                                class="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300 whitespace-nowrap shrink-0"
                            >
                                ジャンル: {selectedProgram.genre1}
                            </span>
                        {/if}
                        {#if selectedProgram.reserve}
                            {#if selectedProgram.reserve.isRecording}
                                <span
                                    class="flex items-center gap-1 rounded-md bg-rose-600 px-2 py-0.5 text-xs font-bold text-white shadow-xs animate-pulse whitespace-nowrap shrink-0"
                                >
                                    ● 録画中
                                </span>
                            {:else if selectedProgram.reserve.isSkip}
                                <span
                                    class="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300 whitespace-nowrap shrink-0"
                                >
                                    <Ban size={12} /> スキップ中
                                </span>
                            {:else if selectedProgram.reserve.isConflict}
                                <span
                                    class="flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300 whitespace-nowrap shrink-0"
                                >
                                    <AlertTriangle size={12} /> チューナー競合
                                </span>
                            {:else if selectedProgram.reserve.ruleId}
                                <span
                                    class="flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300 whitespace-nowrap shrink-0"
                                >
                                    <SlidersHorizontal size={12} /> ルール予約 (#{selectedProgram.reserve.ruleId})
                                </span>
                            {:else}
                                <span
                                    class="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 whitespace-nowrap shrink-0"
                                >
                                    <CheckCircle2 size={12} /> 個別予約
                                </span>
                            {/if}
                        {/if}
                    </div>
                    <h3 class="program-title-modal mt-2">
                        {selectedProgram.name}
                    </h3>
                    <p class="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-300">
                        <Clock size={14} />
                        {formatDate(new Date(selectedProgram.startAt))}
                        {formatTime(selectedProgram.startAt)} - {formatTime(selectedProgram.endAt)} ({Math.round(
                            (selectedProgram.endAt - selectedProgram.startAt) / 60000,
                        )}分間)
                    </p>
                </div>
                <button
                    type="button"
                    onclick={() => (isModalOpen = false)}
                    class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer shrink-0"
                    aria-label="閉じる"
                >
                    <X size={18} />
                </button>
            </div>

            <!-- モーダルボディ (スクロール可能領域) -->
            <div class="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 min-h-0">
                <!-- 番組内容・詳細テキスト -->
                {#if selectedProgram.description}
                    <div>
                        <h4 class="font-bold text-sm text-slate-800 dark:text-slate-100 mb-1">番組概要</h4>
                        <p class="program-description">
                            {selectedProgram.description}
                        </p>
                    </div>
                {/if}

                {#if selectedProgram.extended}
                    <div class="border-t border-slate-100 pt-3 dark:border-slate-800">
                        <h4 class="font-bold text-sm text-slate-800 dark:text-slate-100 mb-1">詳細情報・出演者</h4>
                        <div class="program-extended">
                            {selectedProgram.extended}
                        </div>
                    </div>
                {/if}

                <!-- 録画オプション設定 / ルール予約案内 -->
                {#if selectedProgram.reserve?.ruleId}
                    <div
                        class="mt-4 rounded-xl border border-purple-200 bg-purple-50/60 p-3.5 dark:border-purple-900/50 dark:bg-purple-950/30"
                    >
                        <h4
                            class="flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-300 mb-1.5"
                        >
                            <SlidersHorizontal size={13} /> 自動録画ルール予約 (Rule #{selectedProgram.reserve.ruleId})
                        </h4>
                        <p class="text-xs leading-relaxed text-purple-700/80 dark:text-purple-300/80">
                            この予約は自動録画ルールによって作成されています。TS保存先・エンコード設定などの録画オプションはルール側で管理されます。
                        </p>
                        <div class="mt-2.5 flex items-center justify-between text-xs">
                            <span class="text-[11px] text-purple-600/75 dark:text-purple-400/75">
                                保存先: {selectedProgram.reserve.parentDirectoryName || 'デフォルト'}
                                {selectedProgram.reserve.directory ? `/ ${selectedProgram.reserve.directory}` : ''}
                            </span>
                            {#if !readOnlyStore.isReadOnly}
                                <button
                                    type="button"
                                    onclick={() => {
                                        isModalOpen = false;
                                        router.push(`/rule/edit?ruleId=${selectedProgram.reserve.ruleId}`);
                                    }}
                                    class="flex items-center gap-1 rounded-lg bg-purple-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-purple-700 shadow-xs cursor-pointer"
                                >
                                    <SlidersHorizontal size={11} /> ルールを編集
                                </button>
                            {/if}
                        </div>
                    </div>
                {:else if !readOnlyStore.isReadOnly}
                    {#if selectedProgram.endAt <= now}
                        <div
                            class="mt-4 rounded-xl border border-slate-200 bg-slate-100/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/50"
                        >
                            <p
                                class="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5"
                            >
                                <Ban size={13} /> この番組はすでに放送が終了しています。
                            </p>
                        </div>
                    {:else}
                        <div class="mt-4">
                            <RecordingOptionForm
                                bind:saveParentDir
                                bind:saveSubDir
                                bind:encRows
                                bind:isDeleteOriginal
                                bind:allowEndLack
                                {encodeModes}
                                {storageDirs}
                            />
                        </div>
                    {/if}
                {/if}
            </div>

            <!-- アクションフッター (固定) -->
            <div
                class="flex shrink-0 items-center justify-between border-t border-slate-100 p-3 sm:p-4 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70"
            >
                <button
                    type="button"
                    onclick={() => {
                        isModalOpen = false;
                        const kw = extractFirstSearchWord(selectedProgram.name);
                        router.push(`/search?keyword=${encodeURIComponent(kw)}`);
                    }}
                    class="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer whitespace-nowrap shrink-0"
                >
                    <Search size={14} /> ルール検索へ
                </button>

                <div class="flex items-center gap-2 overflow-x-auto">
                    <button
                        type="button"
                        onclick={() => (isModalOpen = false)}
                        class="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer whitespace-nowrap shrink-0"
                    >
                        閉じる
                    </button>

                    {#if !readOnlyStore.isReadOnly}
                        {#if selectedProgram.reserve}
                            {#if selectedProgram.reserve.isRecording}
                                <button
                                    type="button"
                                    onclick={() => {
                                        recordingActionItem = selectedProgram.reserve;
                                        isRecordingActionModalOpen = true;
                                    }}
                                    class="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-rose-700 cursor-pointer whitespace-nowrap shrink-0"
                                    title="録画を停止・破棄"
                                >
                                    <Square size={14} fill="currentColor" /> 停止
                                </button>
                            {:else if selectedProgram.reserve.isSkip}
                                <button
                                    type="button"
                                    disabled={isReserving}
                                    onclick={() => restoreSkip(selectedProgram.reserve.id, selectedProgram.name)}
                                    class="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                                >
                                    <RotateCcw size={14} /> 予約を復活 (スキップ解除)
                                </button>
                            {:else if selectedProgram.reserve.ruleId}
                                <button
                                    type="button"
                                    disabled={isReserving}
                                    onclick={() =>
                                        deleteReserve(selectedProgram.reserve.id, selectedProgram.name, true)}
                                    class="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-rose-700 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                                >
                                    <Trash2 size={14} /> この回をスキップ (除外)
                                </button>
                            {:else}
                                <button
                                    type="button"
                                    disabled={isReserving}
                                    onclick={() => updateReserve(selectedProgram.reserve.id, selectedProgram)}
                                    class="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                                >
                                    <CheckCircle2 size={14} /> 設定を更新
                                </button>
                                <button
                                    type="button"
                                    disabled={isReserving}
                                    onclick={() =>
                                        deleteReserve(selectedProgram.reserve.id, selectedProgram.name, false)}
                                    class="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-rose-700 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                                >
                                    <Trash2 size={14} /> 予約解除
                                </button>
                            {/if}
                        {:else if selectedProgram.endAt <= now}
                            <button
                                type="button"
                                disabled={true}
                                class="flex items-center gap-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-400 dark:text-slate-500 cursor-not-allowed whitespace-nowrap shrink-0"
                            >
                                <Ban size={14} /> 放送終了
                            </button>
                        {:else}
                            <button
                                type="button"
                                disabled={isReserving}
                                onclick={() => addReserve(selectedProgram)}
                                class="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                            >
                                <Plus size={14} /> 録画予約する
                            </button>
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
