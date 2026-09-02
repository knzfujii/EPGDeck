<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import axios from 'axios';
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
        SlidersHorizontal
    } from '@lucide/svelte';

    const MAX_DAYS_AHEAD = 8; // 今日から最大8日先まで (計9日間)

    function getBaseDate(): Date {
        const now = new Date();
        if (now.getHours() < 4) {
            now.setDate(now.getDate() - 1);
        }
        now.setHours(4, 0, 0, 0);
        return now;
    }

    let schedules = $state<any[]>([]);
    let isLoading = $state(true);
    let selectedDate = $state(getBaseDate());
    let selectedType = $state<'GR' | 'BS' | 'CS' | 'SKY'>('GR');

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
    let reservesMap = $state<Map<number, any>>(new Map());

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
    let allowEndLack = $state(false);

    // 予約フォームを初期化 (新規予約時)
    function resetReserveForm() {
        saveParentDir = '';
        saveSubDir = '';
        encRows = [{ mode: '', parentDir: '', subDir: '' }];
        isDeleteOriginal = false;
        allowEndLack = false;
    }

    // 予約フォームに既存の予約設定を反映 (編集時)
    function loadReserveForm(reserve: any) {
        saveParentDir = reserve?.parentDirectoryName || '';
        saveSubDir = reserve?.directory || '';
        allowEndLack = reserve?.allowEndLack || false;
        encRows = [
            { mode: reserve?.encodeMode1 || '', parentDir: reserve?.encodeParentDirectoryName1 || '', subDir: reserve?.encodeDirectory1 || '' },
            { mode: reserve?.encodeMode2 || '', parentDir: reserve?.encodeParentDirectoryName2 || '', subDir: reserve?.encodeDirectory2 || '' },
            { mode: reserve?.encodeMode3 || '', parentDir: reserve?.encodeParentDirectoryName3 || '', subDir: reserve?.encodeDirectory3 || '' },
        ].filter(r => r.mode || r.parentDir || r.subDir);
        if (encRows.length === 0) encRows = [{ mode: '', parentDir: '', subDir: '' }];
        isDeleteOriginal = reserve?.isDeleteOriginalAfterEncode || false;
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

    // グリッドスクロールコンテナ参照
    let scrollContainer = $state<HTMLDivElement | null>(null);

    // タイムスケール定数 (1時間 = 180px, 1分 = 3px)
    const HOUR_HEIGHT = 180;
    const MINUTE_HEIGHT = HOUR_HEIGHT / 60; // 3px
    const DISPLAY_HOURS = 24; // 24時間
    const GRID_HEIGHT = DISPLAY_HOURS * HOUR_HEIGHT; // 4320px

    const channelTypes = [
        { id: 'GR', name: '地デジ' },
        { id: 'BS', name: 'BS' },
        { id: 'CS', name: 'CS' },
        { id: 'SKY', name: 'SKY' },
    ];

    // 時間帯ジャンプのプリセット (早朝4時は削除)
    const timeJumps = [
        { hour: 9, name: '朝 9時' },
        { hour: 12, name: '昼 12時' },
        { hour: 19, name: 'ゴールデン 19時' },
        { hour: 23, name: '深夜 23時' },
    ];

    // 「現在」ボタンのクリック処理 (今日以外なら今日に復帰して現在時刻へスクロール)
    function jumpToNow() {
        const base = getBaseDate();
        const isToday = base.toDateString() === selectedDate.toDateString();
        if (!isToday) {
            selectedDate = base;
            fetchGuide(true);
        } else {
            scrollToCurrentOrPreset('now');
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
                top: i * HOUR_HEIGHT
            });
        }
        return hours;
    });

    // 現在時刻ラインの top 位置 (px)
    let currentTimeTop = $state<number | null>(null);

    function updateCurrentTimeLine() {
        const now = Date.now();
        if (now >= guideStartAt && now <= guideEndAt) {
            currentTimeTop = ((now - guideStartAt) / 60000) * MINUTE_HEIGHT;
        } else {
            currentTimeTop = null;
        }
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

            const [scheduleRes, reservesRes] = await Promise.all([
                axios.get('/api/schedules', {
                    params: {
                        startAt: guideStartAt,
                        endAt: guideEndAt,
                        [selectedType]: true,
                        isHalfWidth: true,
                    }
                }),
                axios.get('/api/reserves', {
                    params: {
                        startAt: guideStartAt,
                        endAt: guideEndAt,
                        isHalfWidth: true,
                    }
                }).catch(() => ({ data: { reserves: [] } }))
            ]);

            schedules = scheduleRes.data || [];

            // 予約マップ構築
            const map = new Map<number, any>();
            for (const r of reservesRes.data.reserves || []) {
                if (r.programId) map.set(r.programId, r);
            }
            reservesMap = map;

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
            const reservesRes = await axios.get('/api/reserves', {
                params: {
                    startAt: guideStartAt,
                    endAt: guideEndAt,
                    isHalfWidth: true,
                }
            }).catch(() => ({ data: { reserves: [] } }));

            const map = new Map<number, any>();
            for (const r of reservesRes.data.reserves || []) {
                if (r.programId) map.set(r.programId, r);
            }
            reservesMap = map;
        } catch (e) {
            console.error('Failed to refresh reserves map', e);
        }
    }

    // 指定時間または現在時刻へスクロール
    function scrollToCurrentOrPreset(target: string | number) {
        if (!scrollContainer) return;

        let targetMinutes = 0;
        if (target === 'now') {
            const now = new Date();
            const isToday = now.toDateString() === selectedDate.toDateString();
            if (isToday) {
                const diffMs = now.getTime() - guideStartAt;
                targetMinutes = Math.max(0, diffMs / 60000 - 30); // 現在時刻の30分前を表示
            } else {
                targetMinutes = (19 - 4) * 60; // 他の日は夜19時を初期表示
            }
        } else {
            const h = typeof target === 'number' ? target : parseInt(target, 10);
            const baseHour = new Date(guideStartAt).getHours();
            const diffHours = (h >= baseHour ? h - baseHour : h + 24 - baseHour);
            targetMinutes = diffHours * 60;
        }

        const targetScrollTop = targetMinutes * MINUTE_HEIGHT;
        scrollContainer.scrollTop = targetScrollTop;
        scrollContainer.scrollTo({
            top: targetScrollTop,
            behavior: 'smooth'
        });
    }

    onMount(() => {
        fetchGuide(true);
        // エンコードプリセット名と保存先ディレクトリ名を取得
        axios.get('/api/config')
            .then(res => {
                encodeModes = res.data.encode || [];
                storageDirs = res.data.recorded || [];
            })
            .catch(e => console.error('Failed to fetch config', e));
        const timer = setInterval(updateCurrentTimeLine, 30000);
        return () => clearInterval(timer);
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
        return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} (${['日','月','火','水','木','金','土'][d.getDay()]})`;
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
            reserve: reserve
        };
        if (reserve) {
            loadReserveForm(reserve);
        } else {
            resetReserveForm();
        }
        isModalOpen = true;
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

    // 予約追加
    async function addReserve(program: any) {
        if (!program || isReserving) return;
        isReserving = true;
        try {
            await axios.post('/api/reserves', {
                programId: program.id,
                isHalfWidth: true,
                allowEndLack: allowEndLack,
                saveOption: buildSaveOption(),
                encodeOption: buildEncodeOption(),
            });
            snackbar.open({ text: `「${program.name}」を録画予約しました`, color: 'success' });
            await refreshReservesMap();
            if (selectedProgram) {
                selectedProgram.reserve = reservesMap.get(selectedProgram.id) || null;
            }
            isModalOpen = false;
        } catch (e) {
            console.error('Failed to add reserve', e);
            snackbar.open({ text: '録画予約の追加に失敗しました', color: 'error' });
        } finally {
            isReserving = false;
        }
    }

    // 予約設定の更新
    async function updateReserve(reserveId: number, program: any) {
        if (!reserveId || isReserving) return;
        isReserving = true;
        try {
            await axios.put(`/api/reserves/${reserveId}`, {
                allowEndLack: allowEndLack,
                saveOption: buildSaveOption(),
                encodeOption: buildEncodeOption(),
            });
            snackbar.open({ text: `「${program.name}」の予約設定を更新しました`, color: 'success' });
            await refreshReservesMap();
            if (selectedProgram) {
                selectedProgram.reserve = reservesMap.get(selectedProgram.id) || null;
            }
            isModalOpen = false;
        } catch (e) {
            console.error('Failed to update reserve', e);
            snackbar.open({ text: '予約設定の更新に失敗しました', color: 'error' });
        } finally {
            isReserving = false;
        }
    }

    // 予約解除
    async function deleteReserve(reserveId: number, name: string) {
        if (!reserveId || isReserving) return;
        isReserving = true;
        try {
            await axios.delete(`/api/reserves/${reserveId}`);
            snackbar.open({ text: `「${name}」の予約を解除しました`, color: 'success' });
            await refreshReservesMap();
            if (selectedProgram) {
                selectedProgram.reserve = null;
            }
            isModalOpen = false;
        } catch (e) {
            console.error('Failed to delete reserve', e);
            snackbar.open({ text: '予約解除に失敗しました', color: 'error' });
        } finally {
            isReserving = false;
        }
    }

    // ジャンル色
    function getGenreClass(genre1?: number): string {
        switch (genre1) {
            case 0: return 'border-l-4 border-l-blue-500 bg-blue-50/30 dark:bg-blue-700/45'; // ニュース
            case 1: return 'border-l-4 border-l-orange-500 bg-orange-50/30 dark:bg-orange-700/45'; // スポーツ
            case 2: return 'border-l-4 border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-700/45'; // 情報
            case 3: return 'border-l-4 border-l-rose-500 bg-rose-50/30 dark:bg-rose-700/45'; // ドラマ
            case 4: return 'border-l-4 border-l-purple-500 bg-purple-50/30 dark:bg-purple-700/45'; // 音楽
            case 5: return 'border-l-4 border-l-amber-500 bg-amber-50/30 dark:bg-amber-700/45'; // バラエティ
            case 6: return 'border-l-4 border-l-green-500 bg-green-50/30 dark:bg-green-700/45'; // 映画
            case 7: return 'border-l-4 border-l-pink-500 bg-pink-50/30 dark:bg-pink-700/45'; // アニメ
            default: return 'border-l-4 border-l-slate-300 dark:border-l-slate-500 bg-white dark:bg-slate-600';
        }
    }
</script>

<div class="space-y-5 w-full max-w-full min-w-0">
    <!-- 日付 & 放送波ツールバー -->
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <!-- 日付ナビゲーション -->
        <div class="flex items-center gap-1.5 sm:gap-2">
            <button
                type="button"
                onclick={() => changeDate(-1)}
                disabled={isMinDate}
                class="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                title="前日"
            >
                <ChevronLeft size={16} />
            </button>

            <!-- 日付クイックドロップダウン選択 -->
            <div class="relative flex items-center">
                <select
                    value={selectedDate.toDateString()}
                    onchange={(e) => {
                        const target = availableDates.find(d => d.value === e.currentTarget.value);
                        if (target) {
                            selectedDate = target.date;
                            fetchGuide(true);
                        }
                    }}
                    class="appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-7 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                >
                    {#each availableDates as opt}
                        <option value={opt.value}>{opt.label}</option>
                    {/each}
                </select>
                <Calendar size={14} class="pointer-events-none absolute left-2.5 text-slate-500 dark:text-slate-400" />
            </div>

            <button
                type="button"
                onclick={() => changeDate(1)}
                disabled={isMaxDate}
                class="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                title="翌日"
            >
                <ChevronRight size={16} />
            </button>
        </div>

        <!-- 時間帯クイックジャンプ -->
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <!-- 🔴 目立つ「現在」ボタン (今日以外なら今日に戻してスクロール) -->
            <button
                type="button"
                onclick={jumpToNow}
                class="flex shrink-0 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 shadow-xs transition hover:bg-rose-100 hover:border-rose-300 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60"
                title="現在の放送時刻へ移動（別の日を表示中の場合は今日に戻ります）"
            >
                <span class="relative flex h-2 w-2">
                    <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
                    <span class="relative inline-flex h-2 w-2 rounded-full bg-rose-600"></span>
                </span>
                現在
            </button>

            {#each timeJumps as jump}
                <button
                    type="button"
                    onclick={() => scrollToCurrentOrPreset(jump.hour)}
                    class="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
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
                    onclick={() => { selectedType = type.id as any; fetchGuide(true); }}
                    class="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors {selectedType === type.id
                        ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-blue-400 font-bold'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'}"
                >
                    {type.name}
                </button>
            {/each}
        </div>
    </div>

    <!-- 番組表グリッド (絶対時間軸レイアウト) -->
    {#if isLoading}
        <div class="flex h-96 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <p class="text-sm font-medium text-slate-400">番組表データを読み込み中...</p>
        </div>
    {:else if schedules.length === 0}
        <div class="flex h-96 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
            <Calendar size={36} class="text-slate-300 dark:text-slate-600" />
            <p class="mt-2 text-sm font-bold text-slate-700 dark:text-slate-300">番組表データがありません</p>
        </div>
    {:else}
        <div
            bind:this={scrollContainer}
            class="relative w-full max-w-full min-w-0 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900"
            style="max-height: calc(100vh - 180px);"
        >
            <div class="inline-flex min-w-full">
                <!-- 左端: タイムスケール目盛り列 (横固定) -->
                <div class="sticky left-0 z-30 w-16 shrink-0 border-r border-slate-200 bg-slate-100/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
                    <!-- 左上コーナーヘッダー (局名行と高さ合わせ) -->
                    <div class="sticky top-0 z-40 flex h-12 items-center justify-center border-b border-slate-200 bg-slate-200/95 font-bold text-xs text-slate-600 backdrop-blur dark:border-slate-800 dark:bg-slate-800/95 dark:text-slate-300">
                        時刻
                    </div>

                    <!-- 24時間目盛り (絶対配置) -->
                    <div class="relative w-full" style="height: {GRID_HEIGHT}px;">
                        {#each timeScaleHours as hour}
                            <div
                                class="absolute left-0 right-0 border-t border-slate-200/80 px-1 pt-1 text-center font-mono text-xs font-black text-slate-700 dark:border-slate-800 dark:text-slate-300"
                                style="top: {hour.top}px; height: {HOUR_HEIGHT}px;"
                            >
                                {hour.label}
                            </div>
                        {/each}
                    </div>
                </div>

                <!-- チャンネル列コンテナ群 -->
                <div class="relative flex min-w-max flex-1">
                    <!-- 現在時刻の赤い水平線 -->
                    {#if currentTimeTop !== null}
                        <div
                            class="pointer-events-none absolute left-0 right-0 z-20 flex items-center"
                            style="top: {currentTimeTop}px;"
                        >
                            <span class="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white shadow-md animate-pulse">
                                現在
                            </span>
                            <div class="h-0.5 w-full bg-rose-500 shadow-sm"></div>
                        </div>
                    {/if}

                    {#each schedules as col}
                        <div class="w-40 shrink-0 border-r border-slate-200 last:border-r-0 dark:border-slate-800">
                            <!-- 局名ヘッダー (上部固定) -->
                            <div class="sticky top-0 z-30 flex h-12 items-center justify-center border-b border-slate-200 bg-slate-50/95 px-2 text-center backdrop-blur dark:border-slate-800 dark:bg-slate-800/95">
                                <span class="truncate text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                                    {col.channel?.name}
                                </span>
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
                                {#each col.programs || [] as prog}
                                    {@const progStart = Math.max(guideStartAt, prog.startAt)}
                                    {@const progEnd = Math.min(guideEndAt, prog.endAt)}
                                    {@const topPx = ((progStart - guideStartAt) / 60000) * MINUTE_HEIGHT}
                                    {@const heightPx = Math.max(14, ((progEnd - progStart) / 60000) * MINUTE_HEIGHT)}
                                    {@const isReserved = reservesMap.has(prog.id)}

                                    {#if heightPx > 0}
                                        <button
                                            type="button"
                                            onclick={() => openProgramModal(prog, col.channel)}
                                            style="top: {topPx}px; height: {heightPx}px;"
                                            class="group absolute inset-x-0.5 overflow-hidden rounded-md border border-slate-200/90 p-2 text-left transition hover:z-20 hover:border-blue-500 hover:shadow-lg dark:border-slate-800 {getGenreClass(prog.genre1)}"
                                        >
                                            <div class="flex flex-col h-full justify-start overflow-hidden">
                                                <!-- 予約バッジ (予約時のみ右上表示) -->
                                                {#if isReserved}
                                                    <div class="flex items-center justify-end mb-1 shrink-0">
                                                        <span class="flex items-center gap-0.5 rounded bg-rose-600 px-1.5 py-0.2 text-[10px] font-black text-white shadow-xs">
                                                            ● 予約中
                                                        </span>
                                                    </div>
                                                {/if}

                                                <!-- 番組タイトル -->
                                                <p class="font-bold text-xs sm:text-[13px] leading-snug text-slate-900 dark:text-slate-100 {heightPx <= 30 ? 'truncate' : heightPx <= 60 ? 'line-clamp-2' : 'line-clamp-3'}">
                                                    {prog.name}
                                                </p>

                                                <!-- 概要 (縦幅に合わせて優先表示) -->
                                                {#if heightPx > 45 && prog.description}
                                                    <p class="mt-1 text-xs leading-relaxed text-slate-600 line-clamp-3 dark:text-slate-400">
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
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <!-- バックドロップ -->
        <button
            type="button"
            class="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onclick={() => isModalOpen = false}
            aria-label="閉じる"
        ></button>

        <!-- モーダル本体 -->
        <div class="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900">
            <!-- モーダルヘッダー -->
            <div class="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div>
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="rounded-md bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            {selectedProgram.channelName}
                        </span>
                        {#if selectedProgram.genre1 !== undefined}
                            <span class="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                ジャンル: {selectedProgram.genre1}
                            </span>
                        {/if}
                    </div>
                    <h3 class="mt-2 text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 leading-snug">
                        {selectedProgram.name}
                    </h3>
                    <p class="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <Clock size={14} />
                        {formatDate(new Date(selectedProgram.startAt))} {formatTime(selectedProgram.startAt)} - {formatTime(selectedProgram.endAt)} ({Math.round((selectedProgram.endAt - selectedProgram.startAt) / 60000)}分間)
                    </p>
                </div>
                <button
                    type="button"
                    onclick={() => isModalOpen = false}
                    class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                    <X size={18} />
                </button>
            </div>

            <!-- 番組内容・詳細テキスト -->
            <div class="mt-4 max-h-80 overflow-y-auto space-y-3 text-xs pr-1">
                {#if selectedProgram.description}
                    <div>
                        <h4 class="font-bold text-slate-700 dark:text-slate-300 mb-1">番組概要</h4>
                        <p class="leading-relaxed text-slate-600 dark:text-slate-400 text-xs">
                            {selectedProgram.description}
                        </p>
                    </div>
                {/if}

                {#if selectedProgram.extended}
                    <div class="border-t border-slate-100 pt-3 dark:border-slate-800">
                        <h4 class="font-bold text-slate-700 dark:text-slate-300 mb-1">詳細情報・出演者</h4>
                        <div class="whitespace-pre-wrap leading-relaxed text-slate-600 dark:text-slate-400 text-xs">
                            {selectedProgram.extended}
                        </div>
                    </div>
                {/if}
            </div>

            <!-- 録画オプション設定 -->
            <div class="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/30">
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

            <!-- アクションフッター (予約 / 解除 / ルール検索) -->
            <div class="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                    type="button"
                    onclick={() => {
                        isModalOpen = false;
                        router.push(`/search?keyword=${encodeURIComponent(selectedProgram.name)}`);
                    }}
                    class="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400"
                >
                    <Search size={14} /> ルール検索へ
                </button>

                <div class="flex items-center gap-2">
                    <button
                        type="button"
                        onclick={() => isModalOpen = false}
                        class="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                    >
                        閉じる
                    </button>

                    {#if selectedProgram.reserve}
                        <button
                            type="button"
                            disabled={isReserving}
                            onclick={() => updateReserve(selectedProgram.reserve.id, selectedProgram)}
                            class="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
                        >
                            <CheckCircle2 size={14} /> 設定を更新
                        </button>
                        <button
                            type="button"
                            disabled={isReserving}
                            onclick={() => deleteReserve(selectedProgram.reserve.id, selectedProgram.name)}
                            class="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-rose-700 disabled:opacity-50"
                        >
                            <Trash2 size={14} /> 予約解除
                        </button>
                    {:else}
                        <button
                            type="button"
                            disabled={isReserving}
                            onclick={() => addReserve(selectedProgram)}
                            class="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
                        >
                            <Plus size={14} /> 録画予約する
                        </button>
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/if}
