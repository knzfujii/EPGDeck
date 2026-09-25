<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { socketStore } from '../lib/stores/socket.svelte';
    import { readOnlyStore } from '../lib/stores/readOnly.svelte';
    import { configStore } from '../lib/stores/config.svelte';
    import type * as apid from '../../../api';
    import api from '@/lib/apiClient';
    import { getLastRulePath, saveLastRuleTargetId } from '../lib/navigationHistory';
    import { getChannelTypeBadgeClass, getGenreBadgeClass } from '../lib/utils/format';
    import {
        ArrowLeft,
        SlidersHorizontal,
        Search,
        Tv,
        CheckCircle2,
        Check,
        Save,
        Info,
        ChevronDown,
        ChevronUp,
        Calendar,
        Clock,
        Ban,
        RotateCcw,
        AlertTriangle,
        Lock,
    } from '@lucide/svelte';
    import RecordingOptionForm from '@/lib/components/recording/RecordingOptionForm.svelte';
    import { buildEncodeOption, type EncodeRow } from '@/lib/utils/recordingOptions';

    // 編集対象のルールID (?ruleId=<ruleId>)。未指定なら新規作成
    let ruleId = $state<number | null>(null);
    let rule = $state<apid.Rule | null>(null);
    let isLoading = $state(true);
    let isSaving = $state(false);

    // ストレージ一覧 & エンコード設定
    let storageDirs = $state<string[]>([]);
    let encodeModes = $state<string[]>([]);

    // フォーム状態
    // 1. 検索設定 (searchOption)
    let keyword = $state('');
    let ignoreKeyword = $state('');
    let keyCS = $state(false);
    let keyRegExp = $state(false);
    let isName = $state(true);
    let isDescription = $state(true);
    let isExtended = $state(false);
    let ignoreKeyCS = $state(false);
    let ignoreKeyRegExp = $state(false);
    let isIgnoreName = $state(true);
    let isIgnoreDescription = $state(true);
    let isIgnoreExtended = $state(false);

    // 放送波
    let isGR = $state(false);
    let isBS = $state(false);
    let isCS = $state(false);
    let isSKY = $state(false);

    // 放送局 (channelIds)
    let selectedChannelIds = $state<number[]>([]);

    // ジャンル & 時間 (value は "genre" または "genre:subGenre")
    let selectedGenreKeys = $state<string[]>([]);
    let isFree = $state(false);
    let isTimeSpecification = $state(false);
    let existingTags = $state<number[] | undefined>(undefined);
    let durationMin = $state<number | null>(null);
    let durationMax = $state<number | null>(null);

    // 期間指定 (searchPeriods: startAt, endAt)
    let periodStart = $state<string>(''); // YYYY-MM-DDTHH:mm
    let periodEnd = $state<string>(''); // YYYY-MM-DDTHH:mm

    // 時刻・曜日指定 (times: week, start, range)
    // week: 0x01(日), 0x02(月), 0x04(火), 0x08(水), 0x10(木), 0x20(金), 0x40(土)
    let daysOfWeek = $state<number[]>([0, 1, 2, 3, 4, 5, 6]);
    let startTimeStr = $state<string>(''); // HH:mm
    let endTimeStr = $state<string>(''); // HH:mm

    // 時刻文字列 (HH:mm) を「00:00:00 からの経過秒数」に変換（整数）
    function timeStrToSeconds(timeStr: string): number | null {
        if (!timeStr || !timeStr.includes(':')) return null;
        const [h, m] = timeStr.split(':').map(v => parseInt(v, 10));
        if (isNaN(h) || isNaN(m)) return null;
        return h * 3600 + m * 60;
    }

    // 秒数から "HH:mm" 文字列に変換
    function secondsToTimeStr(sec: number | null): string {
        if (sec === null || isNaN(sec)) return '';
        const totalMinutes = Math.floor((sec % (24 * 3600)) / 60);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    function timeStrToDecimal(timeStr: string): number | null {
        if (!timeStr || !timeStr.includes(':')) return null;
        const [h, m] = timeStr.split(':').map(v => parseInt(v, 10));
        if (isNaN(h) || isNaN(m)) return null;
        return h + m / 60;
    }

    function decimalToTimeStr(decimal: number | null): string {
        if (decimal === null || isNaN(decimal)) return '';
        const totalMinutes = Math.round(decimal * 60);
        const h = Math.floor(totalMinutes / 60) % 24;
        const m = totalMinutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    const weekDayOptions = [
        { label: '日', value: 0, bit: 0x01, isWeekend: true },
        { label: '月', value: 1, bit: 0x02, isWeekend: false },
        { label: '火', value: 2, bit: 0x04, isWeekend: false },
        { label: '水', value: 3, bit: 0x08, isWeekend: false },
        { label: '木', value: 4, bit: 0x10, isWeekend: false },
        { label: '金', value: 5, bit: 0x20, isWeekend: false },
        { label: '土', value: 6, bit: 0x40, isWeekend: true },
    ];

    function toggleDayOfWeek(day: number) {
        if (daysOfWeek.includes(day)) {
            daysOfWeek = daysOfWeek.filter(d => d !== day);
        } else {
            daysOfWeek = [...daysOfWeek, day].sort();
        }
    }

    function setAllWeekDays() {
        daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
    }

    function setWeekdaysOnly() {
        daysOfWeek = [1, 2, 3, 4, 5];
    }

    function setWeekendsOnly() {
        daysOfWeek = [0, 6];
    }

    // プレビュー検索 & スキップ管理状態
    let isPreviewSearching = $state(false);
    let previewPrograms = $state<apid.ScheduleProgramItem[] | null>(null);
    let previewReservesMap = $state<Map<number, apid.ReserveItem>>(new Map());
    let isProcessingSkipProgramId = $state<number | null>(null);

    // 録画ファイル名フォーマット
    let recordedFormat = $state<string>('');

    // 詳細条件の開閉状態
    let showAdvancedSearch = $state(false);
    let advancedActiveCount = $derived(
        (selectedGenreKeys.length > 0 ? 1 : 0) +
            (isGR || isBS || isCS || isSKY || selectedChannelIds.length > 0 ? 1 : 0) +
            (recordedFormat.trim() ? 1 : 0),
    );

    // 2. 予約設定 (reserveOption)
    let isEnable = $state(true);
    let priority = $state<number>(5);
    let allowEndLack = $state(false);
    let avoidDuplicate = $state(true);
    let periodToAvoidDuplicate = $state<number | null>(null);

    // 3. 保存先設定 (saveOption)
    let parentDirectoryName = $state<string>('');
    let directory = $state<string>('');

    // 4. エンコード設定 (encodeOption)
    let encRows = $state<EncodeRow[]>([{ mode: '', parentDir: '', subDir: '' }]);
    let isDeleteOriginalAfterEncode = $state(false);

    interface SubGenreItem {
        id: number;
        name: string;
    }

    interface GenreItem {
        id: number | null;
        name: string;
        subGenres?: SubGenreItem[];
    }

    const genres: GenreItem[] = [
        { id: null, name: 'すべてのジャンル' },
        {
            id: 0,
            name: 'ニュース／報道',
            subGenres: [
                { id: 0, name: '定時・総合' },
                { id: 1, name: '天気' },
                { id: 2, name: '特集・ドキュメント' },
                { id: 3, name: '政治・国会' },
                { id: 4, name: '経済・市況' },
                { id: 5, name: '海外・国際' },
                { id: 6, name: '解説' },
                { id: 7, name: '討論・会談' },
                { id: 8, name: '報道特番' },
                { id: 9, name: 'ローカル・地域' },
                { id: 10, name: '交通' },
                { id: 15, name: 'その他' },
            ],
        },
        {
            id: 1,
            name: 'スポーツ',
            subGenres: [
                { id: 0, name: 'スポーツニュース' },
                { id: 1, name: '野球' },
                { id: 2, name: 'サッカー' },
                { id: 3, name: 'ゴルフ' },
                { id: 4, name: 'その他の球技' },
                { id: 5, name: '相撲・格闘技' },
                { id: 6, name: 'オリンピック・国際大会' },
                { id: 7, name: 'マラソン・陸上・水泳' },
                { id: 8, name: 'モータースポーツ' },
                { id: 9, name: 'マリン・ウィンタースポーツ' },
                { id: 10, name: '競馬・公営競技' },
                { id: 15, name: 'その他' },
            ],
        },
        {
            id: 2,
            name: '情報／ワイドショー',
            subGenres: [
                { id: 0, name: '芸能・ワイドショー' },
                { id: 1, name: 'ファッション' },
                { id: 2, name: '暮らし・住まい' },
                { id: 3, name: '健康・医療' },
                { id: 4, name: 'ショッピング・通販' },
                { id: 5, name: 'グルメ・料理' },
                { id: 6, name: 'イベント' },
                { id: 7, name: '番組紹介・お知らせ' },
                { id: 15, name: 'その他' },
            ],
        },
        {
            id: 3,
            name: 'ドラマ',
            subGenres: [
                { id: 0, name: '国内ドラマ' },
                { id: 1, name: '海外ドラマ' },
                { id: 2, name: '時代劇' },
                { id: 15, name: 'その他' },
            ],
        },
        {
            id: 4,
            name: '音楽',
            subGenres: [
                { id: 0, name: '国内ロック・ポップス' },
                { id: 1, name: '海外ロック・ポップス' },
                { id: 2, name: 'クラシック・オペラ' },
                { id: 3, name: 'ジャズ・フュージョン' },
                { id: 4, name: '歌謡曲・演歌' },
                { id: 5, name: 'ライブ・コンサート' },
                { id: 6, name: 'ランキング・リクエスト' },
                { id: 7, name: 'カラオケ・のど自慢' },
                { id: 8, name: '民謡・邦楽' },
                { id: 9, name: '童謡・キッズ' },
                { id: 10, name: '民族音楽・ワールドミュージック' },
                { id: 15, name: 'その他' },
            ],
        },
        {
            id: 5,
            name: 'バラエティ',
            subGenres: [
                { id: 0, name: 'クイズ' },
                { id: 1, name: 'ゲーム' },
                { id: 2, name: 'トークバラエティ' },
                { id: 3, name: 'お笑い・コメディ' },
                { id: 4, name: '音楽バラエティ' },
                { id: 5, name: '旅バラエティ' },
                { id: 6, name: '料理バラエティ' },
                { id: 15, name: 'その他' },
            ],
        },
        {
            id: 6,
            name: '映画',
            subGenres: [
                { id: 0, name: '洋画' },
                { id: 1, name: '邦画' },
                { id: 2, name: 'アニメ' },
                { id: 15, name: 'その他' },
            ],
        },
        {
            id: 7,
            name: 'アニメ／特撮',
            subGenres: [
                { id: 0, name: '国内アニメ' },
                { id: 1, name: '海外アニメ' },
                { id: 2, name: '特撮' },
                { id: 15, name: 'その他' },
            ],
        },
        {
            id: 8,
            name: 'ドキュメンタリー／教養',
            subGenres: [
                { id: 0, name: '社会・時事' },
                { id: 1, name: '歴史・紀行' },
                { id: 2, name: '自然・動物・環境' },
                { id: 3, name: '宇宙・科学・医学' },
                { id: 4, name: 'カルチャー・伝統文化' },
                { id: 5, name: '文学・文芸' },
                { id: 6, name: 'スポーツ' },
                { id: 7, name: 'ドキュメンタリー全般' },
                { id: 8, name: 'インタビュー・討論' },
                { id: 15, name: 'その他' },
            ],
        },
        {
            id: 9,
            name: '劇場／公演',
            subGenres: [
                { id: 0, name: '現代劇・新劇' },
                { id: 1, name: 'ミュージカル' },
                { id: 2, name: 'ダンス・バレエ' },
                { id: 3, name: '落語・演芸' },
                { id: 4, name: '歌舞伎・古典' },
                { id: 15, name: 'その他' },
            ],
        },
        {
            id: 10,
            name: '趣味／教育',
            subGenres: [
                { id: 0, name: '旅・釣り・アウトドア' },
                { id: 1, name: '園芸・ペット・手芸' },
                { id: 2, name: '音楽・美術・工芸' },
                { id: 3, name: '囲碁・将棋' },
                { id: 4, name: '麻雀・パチンコ' },
                { id: 5, name: '車・オートバイ' },
                { id: 6, name: 'コンピュータ・TVゲーム' },
                { id: 7, name: '会話・語学' },
                { id: 8, name: '幼児・小学生' },
                { id: 9, name: '中学生・高校生' },
                { id: 10, name: '大学生・受験' },
                { id: 11, name: '生涯教育・資格' },
                { id: 15, name: 'その他' },
            ],
        },
        {
            id: 11,
            name: '福祉',
            subGenres: [
                { id: 0, name: '高齢者' },
                { id: 1, name: '障害者' },
                { id: 2, name: '社会福祉' },
                { id: 3, name: 'ボランティア' },
                { id: 4, name: '手話' },
                { id: 5, name: '文字（字幕）' },
                { id: 6, name: '音声解説' },
                { id: 15, name: 'その他' },
            ],
        },
        {
            id: 15,
            name: 'その他',
            subGenres: [{ id: 15, name: 'その他' }],
        },
    ];

    function clearAllGenres() {
        selectedGenreKeys = [];
    }

    function toggleGenreKey(key: string, g: (typeof genres)[number]) {
        if (g.id === null) return;
        const mainKey = `${g.id}`;
        if (selectedGenreKeys.includes(mainKey)) {
            // もし「主ジャンルすべて」が選択されていた場合、それを外して
            // クリックした子ジャンル以外のすべての子ジャンルを選択状態にする（除外動作）
            const otherSubKeys = (g.subGenres || [])
                .filter(sg => `${g.id}:${sg.id}` !== key)
                .map(sg => `${g.id}:${sg.id}`);
            selectedGenreKeys = selectedGenreKeys.filter(k => k !== mainKey).concat(otherSubKeys);
        } else if (selectedGenreKeys.includes(key)) {
            selectedGenreKeys = selectedGenreKeys.filter(k => k !== key);
        } else {
            selectedGenreKeys = [...selectedGenreKeys, key];
        }
    }

    function toggleMainGenre(g: (typeof genres)[number]) {
        if (g.id === null) return;
        const mainKey = `${g.id}`;
        const subKeys = g.subGenres ? g.subGenres.map(sg => `${g.id}:${sg.id}`) : [];
        const allKeys = [mainKey, ...subKeys];

        const isAnySelected = selectedGenreKeys.includes(mainKey) || subKeys.some(k => selectedGenreKeys.includes(k));

        if (isAnySelected) {
            // 解除: このジャンルの主・子キーをすべて削除
            selectedGenreKeys = selectedGenreKeys.filter(k => !allKeys.includes(k));
        } else {
            // 選択: 主ジャンルすべて（mainKey）をオンにする
            selectedGenreKeys = [...selectedGenreKeys, mainKey];
        }
    }

    async function initOptions() {
        try {
            await Promise.all([channelStore.fetch(), configStore.fetch()]);
            const storageRes = await api.storages
                .$get()
                .then(async r => (r.ok ? await r.json() : { items: [] }))
                .catch(() => ({ items: [] }));

            const items = storageRes.items || [];
            storageDirs = items.map(i => i.name);
            encodeModes = configStore.encodeModeNames;
        } catch (e) {
            console.error('Failed to load options', e);
        }
    }

    function toDatetimeLocalString(timestamp: number): string {
        const d = new Date(timestamp);
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function formatTime(timestamp: number): string {
        const d = new Date(timestamp);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }

    function formatDate(timestamp: number): string {
        const d = new Date(timestamp);
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} (${days[d.getDay()]})`;
    }

    function formatDuration(ms: number): string {
        const min = Math.round(ms / 60000);
        if (min < 60) return `${min}分`;
        const h = Math.floor(min / 60);
        const m = min % 60;
        return m > 0 ? `${h}時間${m}分` : `${h}時間`;
    }

    function loadRule(r: apid.Rule) {
        isTimeSpecification = !!r.isTimeSpecification;
        existingTags = r.reserveOption?.tags;
        const s = r.searchOption || {};
        keyword = s.keyword || '';
        ignoreKeyword = s.ignoreKeyword || '';
        keyCS = !!s.keyCS;
        keyRegExp = !!s.keyRegExp;
        isName = s.name !== false;
        isDescription = s.description !== false;
        isExtended = !!s.extended;
        ignoreKeyCS = !!s.ignoreKeyCS;
        ignoreKeyRegExp = !!s.ignoreKeyRegExp;
        isIgnoreName = s.ignoreName !== false;
        isIgnoreDescription = s.ignoreDescription !== false;
        isIgnoreExtended = !!s.ignoreExtended;
        isGR = !!s.GR;
        isBS = !!s.BS;
        isCS = !!s.CS;
        isSKY = !!s.SKY;
        selectedChannelIds = Array.isArray(s.channelIds) ? [...s.channelIds] : [];
        if (Array.isArray(s.genres)) {
            selectedGenreKeys = s.genres
                .filter(
                    (g: { genre?: number; subGenre?: number; lv1?: number; lv2?: number }) =>
                        typeof (g.lv1 ?? g.genre) === 'number',
                )
                .map((g: { genre?: number; subGenre?: number; lv1?: number; lv2?: number }) => {
                    const genre = (g.lv1 ?? g.genre)!;
                    const subGenre = g.lv2 ?? g.subGenre;
                    return typeof subGenre === 'number' ? `${genre}:${subGenre}` : `${genre}`;
                });
        } else {
            selectedGenreKeys = [];
        }
        isFree = !!s.isFree;
        // DB / API は秒単位のため、UI表示用に分に変換（秒 ÷ 60）
        durationMin = typeof s.durationMin === 'number' && s.durationMin > 0 ? Math.floor(s.durationMin / 60) : null;
        durationMax = typeof s.durationMax === 'number' && s.durationMax > 0 ? Math.floor(s.durationMax / 60) : null;

        // 期間 (searchPeriods)
        if (Array.isArray(s.searchPeriods) && s.searchPeriods.length > 0) {
            const sp = s.searchPeriods[0];
            periodStart = sp.startAt ? toDatetimeLocalString(sp.startAt) : '';
            periodEnd = sp.endAt ? toDatetimeLocalString(sp.endAt) : '';
        } else {
            periodStart = '';
            periodEnd = '';
        }

        // 時刻・曜日 (times)
        if (Array.isArray(s.times) && s.times.length > 0) {
            const t = s.times[0];
            const days: number[] = [];
            if ((t.week & 0x01) !== 0) days.push(0); // 日
            if ((t.week & 0x02) !== 0) days.push(1); // 月
            if ((t.week & 0x04) !== 0) days.push(2); // 火
            if ((t.week & 0x08) !== 0) days.push(3); // 水
            if ((t.week & 0x10) !== 0) days.push(4); // 木
            if ((t.week & 0x20) !== 0) days.push(5); // 金
            if ((t.week & 0x40) !== 0) days.push(6); // 土
            daysOfWeek = days;
            if (typeof t.start === 'number') {
                if (isTimeSpecification || t.start >= 24) {
                    startTimeStr = secondsToTimeStr(t.start);
                    endTimeStr = typeof t.range === 'number' ? secondsToTimeStr(t.start + t.range) : '';
                } else {
                    startTimeStr = decimalToTimeStr(t.start);
                    endTimeStr = typeof t.range === 'number' ? decimalToTimeStr((t.start + t.range) % 24) : '';
                }
            } else {
                startTimeStr = '';
                endTimeStr = '';
            }
        } else {
            daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
            startTimeStr = '';
            endTimeStr = '';
        }

        const rOpt = r.reserveOption || {};
        isEnable = rOpt.enable !== false;
        priority = typeof rOpt.priority === 'number' ? rOpt.priority : 5;
        allowEndLack = rOpt.allowEndLack !== false;
        avoidDuplicate = rOpt.avoidDuplicate !== false;
        periodToAvoidDuplicate = rOpt.periodToAvoidDuplicate || null;

        const save = r.saveOption || {};
        parentDirectoryName = save.parentDirectoryName || '';
        directory = save.directory || '';
        recordedFormat = save.recordedFormat || '';

        if (
            selectedGenreKeys.length > 0 ||
            isGR ||
            isBS ||
            isCS ||
            isSKY ||
            selectedChannelIds.length > 0 ||
            recordedFormat.trim() !== ''
        ) {
            showAdvancedSearch = true;
        }

        const enc: Partial<apid.ReserveEncodedOption> = r.encodeOption || {};
        const loadedRows: EncodeRow[] = [
            { mode: enc.mode1 || '', parentDir: enc.encodeParentDirectoryName1 || '', subDir: enc.directory1 || '' },
            { mode: enc.mode2 || '', parentDir: enc.encodeParentDirectoryName2 || '', subDir: enc.directory2 || '' },
            { mode: enc.mode3 || '', parentDir: enc.encodeParentDirectoryName3 || '', subDir: enc.directory3 || '' },
        ].filter(row => row.mode || row.parentDir || row.subDir);
        encRows = loadedRows.length > 0 ? loadedRows : [{ mode: '', parentDir: '', subDir: '' }];
        isDeleteOriginalAfterEncode = !!enc.isDeleteOriginalAfterEncode;
    }

    let unsubscribeSocket: (() => void) | null = null;

    async function refreshReservesSilently() {
        if (previewPrograms === null) return;
        try {
            const res = await api.reserves.$get({ query: { limit: 1000, isHalfWidth: true } });
            if (res.ok) {
                const data = await res.json();
                const map = new Map<number, apid.ReserveItem>();
                for (const r of data.reserves || []) {
                    if (r.programId) {
                        map.set(r.programId, r);
                    }
                }
                previewReservesMap = map;
            }
        } catch (e) {
            console.error('Failed to silently refresh reserves', e);
        }
    }

    $effect(() => {
        if (readOnlyStore.isReadOnly) {
            snackbar.open({ text: '閲覧専用モードのため、ルールの編集・作成は行えません', color: 'warning' });
            router.replace(readOnlyStore.canViewRules ? '/rule' : '/recorded');
        }
    });

    onMount(async () => {
        if (readOnlyStore.isReadOnly) {
            router.replace(readOnlyStore.canViewRules ? '/rule' : '/recorded');
            return;
        }
        await initOptions();

        const idParam = router.current.query['ruleId'];
        let shouldAutoPreview = false;

        if (idParam) {
            ruleId = parseInt(idParam, 10);
            try {
                const res = await api.rules[':ruleId'].$get({
                    param: { ruleId: String(ruleId) },
                    query: { isHalfWidth: true },
                });
                if (res.ok) {
                    rule = await res.json();
                    loadRule(rule);
                    if (!rule.isTimeSpecification) {
                        shouldAutoPreview = true;
                    }
                }
            } catch (e) {
                console.error('Failed to fetch rule', e);
                snackbar.open({ text: 'ルールの取得に失敗しました', color: 'error' });
            }
        } else {
            // 新規作成時: 検索画面から渡された検索条件をプリフィル
            const q = router.current.query;
            let hasQueryCondition = false;
            if (q['keyword']) {
                keyword = q['keyword'];
                if (configStore.copyKeywordToDirectory) {
                    directory = q['keyword'].trim();
                }
                isName = q['name'] !== '0';
                isDescription = q['description'] !== '0';
                hasQueryCondition = true;
            }
            if (q['genre']) {
                const gVal = q['genre'];
                const sgVal = q['subGenre'];
                selectedGenreKeys = [sgVal ? `${gVal}:${sgVal}` : `${gVal}`];
                showAdvancedSearch = true;
                hasQueryCondition = true;
            }
            if (q['channelId']) {
                const chId = parseInt(q['channelId'], 10);
                if (!isNaN(chId)) {
                    selectedChannelIds = [chId];
                    showAdvancedSearch = true;
                    hasQueryCondition = true;
                }
            }
            if (hasQueryCondition) {
                shouldAutoPreview = true;
            }
        }
        isLoading = false;

        if (shouldAutoPreview) {
            void handlePreviewSearch();
        }

        // Socket.IO による予約変更通知を受信してリアルタイム更新
        unsubscribeSocket = socketStore.on('updateStatus', () => {
            refreshReservesSilently();
        });
    });

    onDestroy(() => {
        unsubscribeSocket?.();
    });

    function toggleChannel(chId: number) {
        if (selectedChannelIds.includes(chId)) {
            selectedChannelIds = selectedChannelIds.filter(id => id !== chId);
        } else {
            selectedChannelIds = [...selectedChannelIds, chId];
        }
    }

    function selectAllChannels() {
        selectedChannelIds = channelStore.channels.map(ch => ch.id);
    }

    function clearAllChannels() {
        selectedChannelIds = [];
    }

    function selectChannelsByType(type: 'GR' | 'BS' | 'CS' | 'SKY') {
        const ids = channelStore.channels.filter(ch => ch.channelType === type).map(ch => ch.id);
        const set = new Set([...selectedChannelIds, ...ids]);
        selectedChannelIds = Array.from(set);
    }

    function buildSearchOptionPayload() {
        const trimmedKeyword = keyword.trim();

        // 時間指定予約ルールの場合は必要なフィールドのみを抽出して返す (秒単位の完全な整数)
        if (isTimeSpecification) {
            let weekBitmask = 0;
            for (const d of daysOfWeek) {
                weekBitmask |= 1 << d;
            }
            const startSec = timeStrToSeconds(startTimeStr) ?? 0;
            const endSec = timeStrToSeconds(endTimeStr) ?? 0;
            const rangeSec = startSec <= endSec ? endSec - startSec : 24 * 3600 - (startSec - endSec);

            return {
                keyword: trimmedKeyword,
                channelIds: selectedChannelIds,
                times: [
                    {
                        week: weekBitmask,
                        start: startSec,
                        range: rangeSec,
                    },
                ],
            };
        }

        const hasChannelIds = selectedChannelIds.length > 0;
        const opt: apid.RuleSearchOption = {
            GR: hasChannelIds ? false : isGR,
            BS: hasChannelIds ? false : isBS,
            CS: hasChannelIds ? false : isCS,
            SKY: hasChannelIds ? false : isSKY,
            isFree,
        };

        if (trimmedKeyword) {
            // キーワードが入っていてチェックが入っていない場合は番組名と概要を有効化
            if (!isName && !isDescription && !isExtended) {
                isName = true;
                isDescription = true;
            }
            opt.keyword = trimmedKeyword;
            opt.keyCS = keyCS;
            opt.keyRegExp = keyRegExp;
            opt.name = isName;
            opt.description = isDescription;
            opt.extended = isExtended;
        }

        if (selectedChannelIds.length > 0) {
            opt.channelIds = selectedChannelIds;
        }

        const trimmedIgnoreKeyword = ignoreKeyword.trim();
        if (trimmedIgnoreKeyword) {
            if (!isIgnoreName && !isIgnoreDescription && !isIgnoreExtended) {
                isIgnoreName = true;
                isIgnoreDescription = true;
            }
            opt.ignoreKeyword = trimmedIgnoreKeyword;
            opt.ignoreKeyCS = ignoreKeyCS;
            opt.ignoreKeyRegExp = ignoreKeyRegExp;
            opt.ignoreName = isIgnoreName;
            opt.ignoreDescription = isIgnoreDescription;
            opt.ignoreExtended = isIgnoreExtended;
        }

        if (selectedGenreKeys.length > 0) {
            opt.genres = selectedGenreKeys.map(key => {
                const parts = key.split(':');
                const genre = parseInt(parts[0], 10);
                const item: { genre: number; subGenre?: number } = { genre };
                if (parts.length > 1) {
                    item.subGenre = parseInt(parts[1], 10);
                }
                return item;
            });
        }

        // UI の入力値（分）を API / DB 仕様の（秒）に変換（分 × 60）
        if (durationMin !== null && durationMin > 0) opt.durationMin = durationMin * 60;
        if (durationMax !== null && durationMax > 0) opt.durationMax = durationMax * 60;

        // 検索対象期間
        if (periodStart || periodEnd) {
            const startAt = periodStart ? new Date(periodStart).getTime() : 0;
            const endAt = periodEnd ? new Date(periodEnd).getTime() : 253402268399000;
            opt.searchPeriods = [{ startAt, endAt }];
        }

        // 時刻・曜日
        const startDec = timeStrToDecimal(startTimeStr);
        const endDec = timeStrToDecimal(endTimeStr);
        const hasTime = startDec !== null || endDec !== null;

        if (daysOfWeek.length < 7 || hasTime) {
            let weekBitmask = 0;
            for (const d of daysOfWeek) {
                weekBitmask |= 1 << d;
            }
            const timeObj: { week: number; start?: number; range?: number } = { week: weekBitmask };
            if (startDec !== null && endDec !== null) {
                timeObj.start = Math.round(startDec * 1000) / 1000;
                let r = endDec - startDec;
                if (r <= 0) r += 24; // 日跨ぎ対応 (例: 23:00 〜 01:00 は range = 2)
                timeObj.range = Math.round(r * 1000) / 1000;
            } else if (startDec !== null && endDec === null) {
                timeObj.start = Math.round(startDec * 1000) / 1000;
                timeObj.range = 1; // 終了未指定時は1時間
            } else if (startDec === null && endDec !== null) {
                timeObj.start = 0;
                timeObj.range = Math.round(endDec * 1000) / 1000 || 24;
            }
            opt.times = [timeObj];
        }

        return opt;
    }

    async function handlePreviewSearch() {
        isPreviewSearching = true;
        try {
            await channelStore.fetch();
            const searchOpt = buildSearchOptionPayload();

            const [searchRes, reservesRes] = await Promise.all([
                api.schedules.search
                    .$post({
                        json: {
                            option: searchOpt,
                            isHalfWidth: true,
                            limit: 100,
                        },
                    })
                    .then(async r => (r.ok ? await r.json() : [])),
                api.reserves
                    .$get({ query: { limit: 1000, isHalfWidth: true } })
                    .then(async r => (r.ok ? await r.json() : { reserves: [] }))
                    .catch(() => ({ reserves: [] })),
            ]);

            previewPrograms = searchRes || [];

            const map = new Map<number, apid.ReserveItem>();
            for (const r of (reservesRes.reserves as apid.ReserveItem[]) || []) {
                if (r.programId) {
                    map.set(r.programId, r);
                }
            }
            previewReservesMap = map;
        } catch (e) {
            console.error('Failed to preview search', e);
            snackbar.open({ text: 'プレビュー検索に失敗しました', color: 'error' });
        } finally {
            isPreviewSearching = false;
        }
    }

    async function handleToggleSkip(program: apid.ScheduleProgramItem, reserve: apid.ReserveItem) {
        if (!reserve || isProcessingSkipProgramId !== null) return;
        isProcessingSkipProgramId = program.id;

        const willSkip = !reserve.isSkip;
        try {
            if (willSkip) {
                await api.reserves[':reserveId'].$delete({ param: { reserveId: String(reserve.id) } });
                snackbar.open({ text: `「${program.name}」をスキップ設定しました`, color: 'success' });
            } else {
                await api.reserves[':reserveId'].skip.$delete({ param: { reserveId: String(reserve.id) } });
                snackbar.open({ text: `「${program.name}」のスキップを解除しました`, color: 'success' });
            }
            // 新しいオブジェクト参照で Map を即座に更新（Svelte 5 のリアクティブ反映を保証）
            const nextMap = new Map(previewReservesMap);
            nextMap.set(program.id, { ...reserve, isSkip: willSkip });
            previewReservesMap = nextMap;

            // サーバー側の最新状態（重複・競合等の再計算結果）をサイレント再同期
            refreshReservesSilently();
        } catch (e) {
            console.error('Failed to toggle skip', e);
            snackbar.open({ text: 'スキップ操作に失敗しました', color: 'error' });
        } finally {
            isProcessingSkipProgramId = null;
        }
    }

    async function handleSave() {
        if (readOnlyStore.isReadOnly) {
            snackbar.open({ text: '閲覧専用モードのためルールを保存できません', color: 'warning' });
            return;
        }
        if (daysOfWeek.length === 0) {
            snackbar.open({ text: '対象曜日を1つ以上選択してください', color: 'warning' });
            return;
        }
        if (isTimeSpecification) {
            if (!keyword.trim()) {
                snackbar.open({ text: '番組名を入力してください', color: 'warning' });
                return;
            }
            if (selectedChannelIds.length === 0) {
                snackbar.open({ text: '放送局を1つ選択してください', color: 'warning' });
                return;
            }
            if (!startTimeStr || !endTimeStr) {
                snackbar.open({ text: '開始時刻と終了時刻を指定してください', color: 'warning' });
                return;
            }
        }
        if (durationMin !== null && durationMax !== null && durationMin > durationMax) {
            snackbar.open({ text: '番組長の最小値は最大値以下に設定してください', color: 'warning' });
            return;
        }
        isSaving = true;
        try {
            const payload: apid.AddRuleOption = {
                isTimeSpecification,
                searchOption: buildSearchOptionPayload(),
                reserveOption: {
                    enable: isEnable,
                    priority: Number(priority) || 5,
                    allowEndLack,
                    avoidDuplicate,
                },
            };

            if (periodToAvoidDuplicate !== null && periodToAvoidDuplicate > 0) {
                payload.reserveOption.periodToAvoidDuplicate = periodToAvoidDuplicate;
            }

            if (existingTags && existingTags.length > 0) {
                payload.reserveOption.tags = existingTags;
            }

            // 保存先オプション
            if (parentDirectoryName || directory.trim() || recordedFormat.trim()) {
                payload.saveOption = {};
                if (parentDirectoryName) payload.saveOption.parentDirectoryName = parentDirectoryName;
                if (directory.trim()) payload.saveOption.directory = directory.trim();
                if (recordedFormat.trim()) payload.saveOption.recordedFormat = recordedFormat.trim();
            }

            // エンコードオプション
            const filledEnc = encRows.filter(r => r.mode);
            if (filledEnc.length > 0) {
                payload.encodeOption = buildEncodeOption({
                    encRows,
                    isDeleteOriginal: isDeleteOriginalAfterEncode,
                });
            }

            const ruleName = keyword.trim() || '(全番組)';
            if (ruleId) {
                await api.rules[':ruleId'].$put({
                    param: { ruleId: String(ruleId) },
                    json: payload,
                });
                saveLastRuleTargetId(ruleId);
                snackbar.open({ text: `ルール「${ruleName}」を更新しました`, color: 'success' });
            } else {
                const res = await api.rules.$post({
                    json: payload,
                });
                const data = (await res.json()) as { ruleId?: number } | undefined;
                if (data?.ruleId) {
                    saveLastRuleTargetId(data.ruleId);
                }
                snackbar.open({ text: `新規ルール「${ruleName}」を作成しました`, color: 'success' });
            }

            goBackToRuleList();
        } catch (e) {
            console.error('Failed to save rule', e);
            snackbar.open({ text: 'ルールの保存に失敗しました', color: 'error' });
        } finally {
            isSaving = false;
        }
    }

    function goBackToRuleList() {
        router.push(getLastRulePath());
    }

    function handleWindowKeydown(e: KeyboardEvent) {
        if (router.current.pathname !== '/rule/edit') return;
        if (e.key === 'Enter') {
            const target = e.target as HTMLElement | null;
            // textarea での Enter は改行入力なので許可
            if (target?.tagName === 'TEXTAREA') return;

            // Ctrl+Enter または Cmd+Enter は意図的な保存ショートカットとして許可
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                handleSave();
                return;
            }

            // 検索キーワード・除外キーワード欄での Enter はプレビュー検索を発火
            if (target?.id === 'rule-keyword' || target?.id === 'rule-ignore-keyword') {
                e.preventDefault();
                handlePreviewSearch();
                return;
            }

            // その他の input 要素での単純な Enter 押下による意図しないルール保存を防止
            if (target?.tagName === 'INPUT') {
                e.preventDefault();
            }
        }
    }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="w-full max-w-full min-w-0 space-y-5">
    <!-- ヘッダー -->
    <div class="flex items-center gap-3">
        <button
            type="button"
            onclick={goBackToRuleList}
            class="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
            aria-label="ルール一覧に戻る"
        >
            <ArrowLeft size={18} />
        </button>
        <div>
            <h1 class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                <SlidersHorizontal size={20} class="text-blue-600 dark:text-blue-400" />
                {ruleId ? `ルール編集: ${rule?.searchOption?.keyword || '#' + ruleId}` : '新規自動録画ルールの作成'}
            </h1>
            <p class="text-xs text-slate-500 dark:text-slate-400">
                検索条件・予約・保存先・エンコードをまとめて設定します
            </p>
        </div>
    </div>

    {#if readOnlyStore.isReadOnly}
        <div
            class="flex flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50/50 p-8 text-center dark:border-amber-950/60 dark:bg-amber-950/20"
        >
            <Lock size={32} class="text-amber-500 mb-2" />
            <h3 class="text-sm font-bold text-slate-800 dark:text-slate-200">閲覧専用モード</h3>
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                ルールの編集および新規作成は管理者のみ許可されています。
            </p>
            <button
                type="button"
                onclick={() => router.replace(readOnlyStore.canViewRules ? '/rule' : '/recorded')}
                class="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white cursor-pointer transition-colors"
            >
                {readOnlyStore.canViewRules ? 'ルール一覧へ戻る' : '録画一覧へ'}
            </button>
        </div>
    {:else if isLoading}
        <div class="flex justify-center py-16">
            <div class="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600"></div>
        </div>
    {:else}
        <form
            onsubmit={e => {
                e.preventDefault();
                handleSave();
            }}
            class="space-y-5"
        >
            <!-- ルール種別の切り替え -->
            <div
                class="flex rounded-2xl border border-slate-200 bg-slate-100/80 p-1 dark:border-slate-800 dark:bg-slate-900/60 max-w-md"
            >
                <button
                    type="button"
                    onclick={() => {
                        isTimeSpecification = false;
                    }}
                    class="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs sm:text-sm font-bold transition-all cursor-pointer {!isTimeSpecification
                        ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-800 dark:text-blue-400'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}"
                >
                    <Search size={16} />
                    <span>通常検索ルール</span>
                </button>
                <button
                    type="button"
                    onclick={() => {
                        isTimeSpecification = true;
                    }}
                    class="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs sm:text-sm font-bold transition-all cursor-pointer {isTimeSpecification
                        ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-800 dark:text-blue-400'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}"
                >
                    <Clock size={16} />
                    <span>時間指定予約ルール</span>
                </button>
            </div>

            {#if isTimeSpecification}
                <!-- 時間指定予約設定 -->
                <section
                    class="rounded-2xl border border-blue-200 bg-white p-5 shadow-xs dark:border-blue-900/40 dark:bg-slate-900 space-y-5"
                >
                    <div
                        class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800"
                    >
                        <h2 class="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                            <Clock size={16} class="text-blue-600 dark:text-blue-400" /> 時間指定予約設定
                        </h2>
                        <span class="text-xs text-blue-600 dark:text-blue-400 font-medium">
                            番組表の更新に依存せず、指定した曜日・時間枠を毎週定期録画します
                        </span>
                    </div>

                    <!-- 1. 録画タイトル (番組名) -->
                    <div>
                        <label
                            for="rule-time-keyword"
                            class="block font-bold text-xs sm:text-sm text-slate-700 dark:text-slate-300 mb-1.5"
                        >
                            録画タイトル / 番組名 <span class="text-rose-500 font-bold">*必須</span>
                        </label>
                        <input
                            id="rule-time-keyword"
                            type="text"
                            bind:value={keyword}
                            placeholder="例: 日曜討論 / 深夜アニメ枠"
                            class="form-input h-11 text-sm sm:text-base rounded-xl"
                            required
                        />
                        <p class="text-xs text-slate-400 mt-1">録画ファイル名や一覧に表示されるタイトルになります。</p>
                    </div>

                    <!-- 2. 対象放送局 (必須) -->
                    <div class="border-t border-slate-100 pt-3.5 dark:border-slate-800 space-y-3">
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <span class="block font-bold text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                                    対象放送局 <span class="text-rose-500 font-bold">*必須</span>
                                </span>
                                <p class="text-xs text-slate-400 mt-0.5">録画対象の放送局を選択してください</p>
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                                {#if selectedChannelIds.length > 0}
                                    <span class="text-xs font-bold text-blue-600 dark:text-blue-400 mr-1">
                                        {selectedChannelIds.length} 局選択中
                                    </span>
                                    <button
                                        type="button"
                                        onclick={clearAllChannels}
                                        class="h-8 rounded-lg bg-amber-50 px-3 text-xs font-bold text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 cursor-pointer transition-colors"
                                    >
                                        クリア
                                    </button>
                                {/if}
                            </div>
                        </div>

                        <div
                            class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-60 overflow-y-auto border border-slate-200 rounded-xl p-2.5 dark:border-slate-800 bg-white dark:bg-slate-950/40"
                        >
                            {#each channelStore.channels as ch}
                                {@const isSelected = selectedChannelIds.includes(ch.id)}
                                <button
                                    type="button"
                                    onclick={() => toggleChannel(ch.id)}
                                    class="flex items-center justify-between rounded-xl p-2.5 text-left transition border cursor-pointer {isSelected
                                        ? 'border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-100'
                                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'}"
                                >
                                    <div class="min-w-0 pr-1">
                                        <span class="text-[10px] font-black uppercase text-slate-400 block">
                                            [{ch.channelType}]
                                        </span>
                                        <p class="text-xs sm:text-sm font-bold truncate">{ch.name}</p>
                                    </div>
                                    {#if isSelected}
                                        <div
                                            class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"
                                        >
                                            <Check size={12} />
                                        </div>
                                    {/if}
                                </button>
                            {/each}
                        </div>
                    </div>

                    <!-- 3. 対象曜日 & 時間帯 (必須) -->
                    <div class="border-t border-slate-100 pt-3.5 dark:border-slate-800 space-y-4">
                        <!-- 曜日指定 -->
                        <div>
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                                    対象曜日 <span class="text-rose-500 font-bold">*必須</span>
                                </span>
                                <div class="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onclick={setAllWeekDays}
                                        class="h-8 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                                    >
                                        全曜日
                                    </button>
                                    <button
                                        type="button"
                                        onclick={setWeekdaysOnly}
                                        class="h-8 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                                    >
                                        平日のみ
                                    </button>
                                    <button
                                        type="button"
                                        onclick={setWeekendsOnly}
                                        class="h-8 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                                    >
                                        土日のみ
                                    </button>
                                </div>
                            </div>
                            <div class="grid grid-cols-7 gap-1.5 sm:gap-2 w-full max-w-md">
                                {#each weekDayOptions as day}
                                    {@const isSelected = daysOfWeek.includes(day.value)}
                                    <button
                                        type="button"
                                        onclick={() => toggleDayOfWeek(day.value)}
                                        class="h-10 w-full rounded-xl border text-sm font-bold transition cursor-pointer {isSelected
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/70 dark:text-blue-200 shadow-xs'
                                            : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-800/80 dark:bg-slate-950 dark:text-slate-500 dark:hover:bg-slate-900/60 dark:hover:text-slate-300'}"
                                    >
                                        {day.label}
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <!-- 時間帯指定 -->
                        <div>
                            <span class="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                時間帯 (開始時刻 〜 終了時刻) <span class="text-rose-500 font-bold">*必須</span>
                            </span>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                                <div>
                                    <label
                                        for="rule-time-start-spec"
                                        class="block text-xs text-slate-500 dark:text-slate-400 mb-1"
                                    >
                                        開始時刻
                                    </label>
                                    <input
                                        id="rule-time-start-spec"
                                        type="time"
                                        bind:value={startTimeStr}
                                        class="form-input text-xs sm:text-sm"
                                        required
                                    />
                                </div>
                                <div>
                                    <label
                                        for="rule-time-end-spec"
                                        class="block text-xs text-slate-500 dark:text-slate-400 mb-1"
                                    >
                                        終了時刻
                                    </label>
                                    <input
                                        id="rule-time-end-spec"
                                        type="time"
                                        bind:value={endTimeStr}
                                        class="form-input text-xs sm:text-sm"
                                        required
                                    />
                                </div>
                            </div>
                            <p class="text-xs text-slate-400 mt-1.5">
                                ※ 日跨ぎの時間帯（例: 23:00 〜
                                01:00）も指定可能です。分単位で正確に予約枠が作成されます。
                            </p>
                        </div>
                    </div>
                </section>
            {:else}
                <!-- 1. 検索条件 -->
                <section
                    class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                >
                    <h2 class="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">
                        <Search size={16} class="text-blue-600 dark:text-blue-400" /> 検索条件
                    </h2>
                    <div class="space-y-4">
                        <div>
                            <label
                                for="rule-keyword"
                                class="block font-bold text-xs sm:text-sm text-slate-700 dark:text-slate-300 mb-1.5"
                            >
                                検索キーワード
                            </label>
                            <input
                                id="rule-keyword"
                                type="text"
                                bind:value={keyword}
                                placeholder="例: 葬送のフリーレン (未指定の場合は全番組)"
                                class="form-input h-11 text-sm sm:text-base rounded-xl"
                            />
                            <div
                                class="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-bold text-slate-700 dark:text-slate-300"
                            >
                                <span class="text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                                    対象項目:
                                </span>
                                <label
                                    class="flex items-center gap-2 cursor-pointer select-none py-1 whitespace-nowrap"
                                >
                                    <input type="checkbox" bind:checked={isName} class="form-checkbox" />
                                    <span>番組名</span>
                                </label>
                                <label
                                    class="flex items-center gap-2 cursor-pointer select-none py-1 whitespace-nowrap"
                                >
                                    <input type="checkbox" bind:checked={isDescription} class="form-checkbox" />
                                    <span>概要</span>
                                </label>
                                <label
                                    class="flex items-center gap-2 cursor-pointer select-none py-1 whitespace-nowrap"
                                >
                                    <input type="checkbox" bind:checked={isExtended} class="form-checkbox" />
                                    <span>詳細・出演者</span>
                                </label>
                                <label
                                    class="flex items-center gap-2 cursor-pointer select-none py-1 sm:ml-2 whitespace-nowrap"
                                >
                                    <input type="checkbox" bind:checked={keyRegExp} class="form-checkbox" />
                                    <span>正規表現</span>
                                </label>
                                <label
                                    class="flex items-center gap-2 cursor-pointer select-none py-1 whitespace-nowrap"
                                >
                                    <input type="checkbox" bind:checked={keyCS} class="form-checkbox" />
                                    <span>大小区別</span>
                                </label>
                            </div>
                        </div>

                        <div class="border-t border-slate-100 pt-3.5 dark:border-slate-800">
                            <label
                                for="rule-ignore-keyword"
                                class="block font-bold text-sm sm:text-base text-slate-800 dark:text-slate-200 mb-1.5"
                            >
                                除外キーワード (任意)
                            </label>
                            <input
                                id="rule-ignore-keyword"
                                type="text"
                                bind:value={ignoreKeyword}
                                placeholder="例: 再放送 / ダイジェスト"
                                class="form-input h-11 text-sm sm:text-base rounded-xl"
                            />
                            <div
                                class="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-bold text-slate-700 dark:text-slate-300"
                            >
                                <span class="text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                                    除外対象:
                                </span>
                                <label
                                    class="flex items-center gap-2 cursor-pointer select-none py-1 whitespace-nowrap"
                                >
                                    <input type="checkbox" bind:checked={isIgnoreName} class="form-checkbox" />
                                    <span>番組名</span>
                                </label>
                                <label
                                    class="flex items-center gap-2 cursor-pointer select-none py-1 whitespace-nowrap"
                                >
                                    <input type="checkbox" bind:checked={isIgnoreDescription} class="form-checkbox" />
                                    <span>概要</span>
                                </label>
                                <label
                                    class="flex items-center gap-2 cursor-pointer select-none py-1 whitespace-nowrap"
                                >
                                    <input type="checkbox" bind:checked={isIgnoreExtended} class="form-checkbox" />
                                    <span>詳細</span>
                                </label>
                                <label
                                    class="flex items-center gap-2 cursor-pointer select-none py-1 sm:ml-2 whitespace-nowrap"
                                >
                                    <input type="checkbox" bind:checked={ignoreKeyRegExp} class="form-checkbox" />
                                    <span>正規表現</span>
                                </label>
                                <label
                                    class="flex items-center gap-2 cursor-pointer select-none py-1 whitespace-nowrap"
                                >
                                    <input type="checkbox" bind:checked={ignoreKeyCS} class="form-checkbox" />
                                    <span>大小区別</span>
                                </label>
                            </div>
                        </div>

                        <!-- 曜日・時間帯の指定 (times) -->
                        <div class="border-t border-slate-100 pt-3.5 dark:border-slate-800 space-y-3">
                            <div class="flex items-center justify-between">
                                <span class="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                    <Clock size={15} class="text-blue-600 dark:text-blue-400" /> 曜日・時間帯の指定
                                </span>
                                {#if daysOfWeek.length < 7 || startTimeStr || endTimeStr}
                                    <span
                                        class="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-950 dark:text-blue-300"
                                    >
                                        条件適用中
                                    </span>
                                {/if}
                            </div>

                            <!-- 曜日指定 -->
                            <div>
                                <div class="flex items-center justify-between mb-2">
                                    <span class="text-sm font-bold text-slate-700 dark:text-slate-300">対象曜日</span>
                                    <div class="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onclick={setAllWeekDays}
                                            class="h-9 rounded-xl border border-slate-200 px-3.5 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                                        >
                                            全曜日
                                        </button>
                                        <button
                                            type="button"
                                            onclick={setWeekdaysOnly}
                                            class="h-9 rounded-xl border border-slate-200 px-3.5 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                                        >
                                            平日のみ
                                        </button>
                                        <button
                                            type="button"
                                            onclick={setWeekendsOnly}
                                            class="h-9 rounded-xl border border-slate-200 px-3.5 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                                        >
                                            土日のみ
                                        </button>
                                    </div>
                                </div>
                                <div class="grid grid-cols-7 gap-1.5 sm:gap-2 w-full max-w-md">
                                    {#each weekDayOptions as day}
                                        {@const isSelected = daysOfWeek.includes(day.value)}
                                        <button
                                            type="button"
                                            onclick={() => toggleDayOfWeek(day.value)}
                                            class="h-10 w-full rounded-xl border text-sm font-bold transition cursor-pointer {isSelected
                                                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/70 dark:text-blue-200 shadow-xs'
                                                : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-800/80 dark:bg-slate-950 dark:text-slate-500 dark:hover:bg-slate-900/60 dark:hover:text-slate-300'}"
                                        >
                                            {day.label}
                                        </button>
                                    {/each}
                                </div>
                            </div>

                            <!-- 時間帯指定 -->
                            <div>
                                <div class="flex items-center justify-between mb-1.5">
                                    <span class="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                        時間帯 (開始時刻 〜 終了時刻)
                                    </span>
                                    {#if startTimeStr || endTimeStr}
                                        <button
                                            type="button"
                                            onclick={() => {
                                                startTimeStr = '';
                                                endTimeStr = '';
                                            }}
                                            class="text-[11px] font-bold text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                                        >
                                            全時間帯 (クリア)
                                        </button>
                                    {/if}
                                </div>
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                                    <div>
                                        <label
                                            for="rule-time-start"
                                            class="block text-xs text-slate-500 dark:text-slate-400 mb-1"
                                        >
                                            開始時刻
                                        </label>
                                        <input
                                            id="rule-time-start"
                                            type="time"
                                            bind:value={startTimeStr}
                                            class="form-input text-xs sm:text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label
                                            for="rule-time-end"
                                            class="block text-xs text-slate-500 dark:text-slate-400 mb-1"
                                        >
                                            終了時刻
                                        </label>
                                        <input
                                            id="rule-time-end"
                                            type="time"
                                            bind:value={endTimeStr}
                                            class="form-input text-xs sm:text-sm"
                                        />
                                    </div>
                                </div>
                                <p class="text-xs text-slate-400 mt-1">
                                    ※ 指定した開始時刻〜終了時刻の枠内に放送される番組が対象になります
                                </p>
                            </div>
                        </div>

                        <!-- 番組の長さ (分) & 検索対象期間 -->
                        <div
                            class="border-t border-slate-100 pt-3.5 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4"
                        >
                            <!-- 番組の長さ (分) -->
                            <div>
                                <span
                                    class="block font-bold text-xs sm:text-sm text-slate-700 dark:text-slate-300 mb-1.5"
                                >
                                    番組の長さ (分)
                                </span>
                                <div class="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="0"
                                        bind:value={durationMin}
                                        placeholder="最小 (分)"
                                        class="form-input text-xs sm:text-sm"
                                    />
                                    <span class="text-slate-400 font-bold">~</span>
                                    <input
                                        type="number"
                                        min="0"
                                        bind:value={durationMax}
                                        placeholder="最大 (分)"
                                        class="form-input text-xs sm:text-sm"
                                    />
                                </div>
                            </div>

                            <!-- 検索対象期間 (searchPeriods) -->
                            <div>
                                <div class="flex items-center justify-between mb-1.5">
                                    <span
                                        class="font-bold text-xs sm:text-sm text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
                                    >
                                        <Calendar size={15} class="text-blue-600 dark:text-blue-400" />
                                        検索対象期間 (任意)
                                    </span>
                                    {#if periodStart || periodEnd}
                                        <button
                                            type="button"
                                            onclick={() => {
                                                periodStart = '';
                                                periodEnd = '';
                                            }}
                                            class="text-xs font-bold text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                                        >
                                            クリア
                                        </button>
                                    {/if}
                                </div>
                                <div class="flex items-center gap-2">
                                    <input
                                        type="datetime-local"
                                        bind:value={periodStart}
                                        class="form-input text-xs sm:text-sm"
                                        title="開始日時"
                                    />
                                    <span class="text-slate-400 font-bold">~</span>
                                    <input
                                        type="datetime-local"
                                        bind:value={periodEnd}
                                        class="form-input text-xs sm:text-sm"
                                        title="終了日時"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 2. 詳細条件 (ジャンル・放送波/局) -->
                <section
                    class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                >
                    <button
                        type="button"
                        onclick={() => (showAdvancedSearch = !showAdvancedSearch)}
                        class="flex w-full items-center justify-between text-left transition cursor-pointer"
                    >
                        <div class="flex items-center gap-2">
                            <SlidersHorizontal size={16} class="text-blue-600 dark:text-blue-400" />
                            <h2 class="text-sm font-bold text-slate-900 dark:text-slate-100">
                                詳細条件 (ジャンル・放送波/局・ファイル名)
                            </h2>
                            {#if advancedActiveCount > 0}
                                <span
                                    class="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                >
                                    {advancedActiveCount}件設定中
                                </span>
                            {/if}
                        </div>
                        <div
                            class="flex items-center gap-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                            <span class="text-xs font-medium">{showAdvancedSearch ? '閉じる' : '詳細を指定する'}</span>
                            {#if showAdvancedSearch}
                                <ChevronUp size={16} />
                            {:else}
                                <ChevronDown size={16} />
                            {/if}
                        </div>
                    </button>

                    {#if showAdvancedSearch}
                        <div class="mt-4 space-y-5 border-t border-slate-100 pt-4 dark:border-slate-800">
                            <!-- ジャンル絞り込み (スクロールコンテナ & バッジ複数選択) -->
                            <div>
                                <div class="flex items-center justify-between mb-1.5">
                                    <span class="block font-bold text-xs text-slate-700 dark:text-slate-300">
                                        ジャンル絞り込み (複数選択可)
                                    </span>
                                    {#if selectedGenreKeys.length > 0}
                                        <button
                                            type="button"
                                            onclick={clearAllGenres}
                                            class="h-9 rounded-xl bg-amber-50 px-3.5 text-sm font-bold text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 cursor-pointer transition-colors"
                                        >
                                            全解除
                                        </button>
                                    {/if}
                                </div>
                                <p class="text-sm text-slate-500 dark:text-slate-400 mb-2">
                                    未選択時は全ジャンルが対象です（親ジャンルで一括、子ジャンルで個別選択）
                                </p>

                                <div
                                    id="rule-genre-container"
                                    class="max-h-72 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/40 space-y-3"
                                >
                                    {#each genres as g}
                                        {#if g.id !== null}
                                            {@const mainKey = `${g.id}`}
                                            {@const isMainAll = selectedGenreKeys.includes(mainKey)}
                                            {@const hasSelectedSub = g.subGenres
                                                ? g.subGenres.some(sg => selectedGenreKeys.includes(`${g.id}:${sg.id}`))
                                                : false}
                                            <div
                                                class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 transition-shadow hover:shadow-xs"
                                            >
                                                <div class="flex items-center justify-between mb-2">
                                                    <div class="flex items-center gap-2">
                                                        <span
                                                            class="text-sm font-bold text-slate-800 dark:text-slate-200"
                                                        >
                                                            {g.name}
                                                        </span>
                                                        {#if isMainAll}
                                                            <span
                                                                class="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                                            >
                                                                全選択中
                                                            </span>
                                                        {:else if hasSelectedSub}
                                                            <span
                                                                class="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
                                                            >
                                                                一部選択中
                                                            </span>
                                                        {/if}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onclick={() => toggleMainGenre(g)}
                                                        class="h-9 rounded-xl border px-3 text-sm font-bold transition cursor-pointer {isMainAll ||
                                                        hasSelectedSub
                                                            ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300'
                                                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}"
                                                    >
                                                        {isMainAll || hasSelectedSub ? '解除' : '全選択'}
                                                    </button>
                                                </div>

                                                {#if g.subGenres && g.subGenres.length > 0}
                                                    <div class="flex flex-wrap gap-2">
                                                        {#each g.subGenres as sg}
                                                            {@const sgKey = `${g.id}:${sg.id}`}
                                                            {@const isSgSelected = selectedGenreKeys.includes(sgKey)}
                                                            {@const isCoveredByMain = isMainAll}
                                                            <button
                                                                type="button"
                                                                onclick={() => toggleGenreKey(sgKey, g)}
                                                                class="rounded-xl border px-3 py-1.5 text-sm font-medium transition cursor-pointer {isSgSelected ||
                                                                isCoveredByMain
                                                                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/70 dark:text-blue-200 font-bold'
                                                                    : 'border-slate-200 bg-slate-50/50 text-slate-600 hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800'}"
                                                            >
                                                                {sg.name}
                                                            </button>
                                                        {/each}
                                                    </div>
                                                {/if}
                                            </div>
                                        {/if}
                                    {/each}
                                </div>
                            </div>

                            <!-- 放送波・放送局の指定 -->
                            <div class="border-t border-slate-100 pt-3.5 dark:border-slate-800 space-y-3">
                                <div class="flex items-center justify-between">
                                    <h3
                                        class="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200"
                                    >
                                        <Tv size={15} class="text-blue-600 dark:text-blue-400" /> 放送波・放送局の指定
                                    </h3>
                                    {#if selectedChannelIds.length > 0}
                                        <span
                                            class="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-950 dark:text-blue-300"
                                        >
                                            個別指定モード優先中（{selectedChannelIds.length}局）
                                        </span>
                                    {:else}
                                        <span
                                            class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                        >
                                            放送波一括指定モード
                                        </span>
                                    {/if}
                                </div>

                                <!-- 放送波一括指定 -->
                                <div
                                    class="rounded-xl border p-3.5 transition-colors {selectedChannelIds.length > 0
                                        ? 'border-slate-200 bg-slate-50/60 opacity-60 dark:border-slate-800 dark:bg-slate-900/40'
                                        : 'border-blue-100 bg-blue-50/30 dark:border-blue-950 dark:bg-blue-950/20'}"
                                >
                                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div>
                                            <div class="flex items-center gap-2">
                                                <span class="font-bold text-xs text-slate-800 dark:text-slate-200">
                                                    対象放送波（一括指定）
                                                </span>
                                                {#if selectedChannelIds.length > 0}
                                                    <span
                                                        class="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded"
                                                    >
                                                        ※ 下記で放送局が個別指定されているため無効（スキップ）
                                                    </span>
                                                {/if}
                                            </div>
                                            <p class="text-[11px] text-slate-400 mt-0.5">
                                                下の放送局を個別指定していない場合に、チェックした放送波の全チャンネルが対象になります（※すべてチェックなしの場合は全放送波が対象）
                                            </p>
                                        </div>

                                        <div
                                            class="flex items-center gap-5 text-sm font-bold text-slate-700 dark:text-slate-300"
                                        >
                                            <label
                                                class="flex items-center gap-2 select-none py-1 {selectedChannelIds.length >
                                                0
                                                    ? 'cursor-not-allowed opacity-50'
                                                    : 'cursor-pointer'}"
                                            >
                                                <input
                                                    type="checkbox"
                                                    bind:checked={isGR}
                                                    disabled={selectedChannelIds.length > 0}
                                                    class="form-checkbox disabled:opacity-50"
                                                />
                                                <span>地デジ (GR)</span>
                                            </label>
                                            <label
                                                class="flex items-center gap-2 select-none py-1 {selectedChannelIds.length >
                                                0
                                                    ? 'cursor-not-allowed opacity-50'
                                                    : 'cursor-pointer'}"
                                            >
                                                <input
                                                    type="checkbox"
                                                    bind:checked={isBS}
                                                    disabled={selectedChannelIds.length > 0}
                                                    class="form-checkbox disabled:opacity-50"
                                                />
                                                <span>BS</span>
                                            </label>
                                            <label
                                                class="flex items-center gap-2 select-none py-1 {selectedChannelIds.length >
                                                0
                                                    ? 'cursor-not-allowed opacity-50'
                                                    : 'cursor-pointer'}"
                                            >
                                                <input
                                                    type="checkbox"
                                                    bind:checked={isCS}
                                                    disabled={selectedChannelIds.length > 0}
                                                    class="form-checkbox disabled:opacity-50"
                                                />
                                                <span>CS</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <!-- 放送局個別指定 -->
                                <div class="space-y-3 pt-1">
                                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div>
                                            <div class="flex items-center gap-2">
                                                <p class="font-bold text-xs text-slate-800 dark:text-slate-200">
                                                    対象放送局（個別指定・優先）
                                                </p>
                                                {#if selectedChannelIds.length > 0}
                                                    <span
                                                        class="text-[10px] font-bold text-blue-600 dark:text-blue-400"
                                                    >
                                                        {selectedChannelIds.length} 局選択中
                                                    </span>
                                                {/if}
                                            </div>
                                            <p class="text-[11px] text-slate-400 mt-0.5">
                                                {selectedChannelIds.length === 0
                                                    ? '局を選択すると個別指定が最優先されます（未選択時は上の放送波指定が適用されます）'
                                                    : '局が指定されているため、上の放送波指定にかかわらず選択された局のみが録画されます'}
                                            </p>
                                        </div>
                                        <div class="flex items-center gap-2 shrink-0">
                                            <button
                                                type="button"
                                                data-testid="select-all-channels-btn"
                                                onclick={selectAllChannels}
                                                class="h-9 rounded-xl bg-blue-50 px-3.5 text-sm font-bold text-blue-600 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 cursor-pointer transition-colors"
                                            >
                                                全選択
                                            </button>
                                            {#if selectedChannelIds.length > 0}
                                                <button
                                                    type="button"
                                                    data-testid="clear-channels-btn"
                                                    onclick={clearAllChannels}
                                                    class="h-9 rounded-xl bg-amber-50 px-3.5 text-sm font-bold text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 cursor-pointer transition-colors"
                                                >
                                                    選択クリア
                                                </button>
                                            {/if}
                                        </div>
                                    </div>

                                    <div class="flex items-center gap-2 pt-0.5 flex-wrap">
                                        <span class="text-sm font-bold text-slate-500">放送波ごとに追加:</span>
                                        <button
                                            type="button"
                                            onclick={() => selectChannelsByType('GR')}
                                            class="h-9 rounded-xl border border-slate-200 px-3.5 text-sm font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer transition-colors"
                                        >
                                            + 地デジ局
                                        </button>
                                        <button
                                            type="button"
                                            onclick={() => selectChannelsByType('BS')}
                                            class="h-9 rounded-xl border border-slate-200 px-3.5 text-sm font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer transition-colors"
                                        >
                                            + BS局
                                        </button>
                                        <button
                                            type="button"
                                            onclick={() => selectChannelsByType('CS')}
                                            class="h-9 rounded-xl border border-slate-200 px-3.5 text-sm font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer transition-colors"
                                        >
                                            + CS局
                                        </button>
                                    </div>

                                    <div
                                        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-72 overflow-y-auto border border-slate-200 rounded-xl p-2.5 dark:border-slate-800 bg-white dark:bg-slate-950/40"
                                    >
                                        {#each channelStore.channels as ch}
                                            {@const isSelected = selectedChannelIds.includes(ch.id)}
                                            <button
                                                type="button"
                                                onclick={() => toggleChannel(ch.id)}
                                                class="flex items-center justify-between rounded-xl p-2.5 text-left transition border cursor-pointer {isSelected
                                                    ? 'border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-100'
                                                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'}"
                                            >
                                                <div class="min-w-0 pr-1">
                                                    <span class="text-xs font-black uppercase text-slate-400 block">
                                                        [{ch.channelType}]
                                                    </span>
                                                    <p class="text-sm font-bold truncate">{ch.name}</p>
                                                </div>
                                                {#if isSelected}
                                                    <div
                                                        class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"
                                                    >
                                                        <Check size={12} />
                                                    </div>
                                                {/if}
                                            </button>
                                        {/each}
                                    </div>
                                </div>

                                <!-- 録画ファイル名フォーマット -->
                                <div class="border-t border-slate-100 pt-3.5 dark:border-slate-800">
                                    <div class="flex items-center justify-between mb-1.5">
                                        <label
                                            for="rule-recorded-format"
                                            class="block font-bold text-xs text-slate-700 dark:text-slate-300"
                                        >
                                            録画ファイル名フォーマット (recordedFormat)
                                        </label>
                                        {#if recordedFormat.trim()}
                                            <button
                                                type="button"
                                                onclick={() => (recordedFormat = '')}
                                                class="text-[11px] font-bold text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                                            >
                                                デフォルトに戻す
                                            </button>
                                        {/if}
                                    </div>
                                    <input
                                        id="rule-recorded-format"
                                        type="text"
                                        bind:value={recordedFormat}
                                        placeholder="例: %YEAR%-%MONTH%-%DAY%_%TITLE%_%EPISODE%"
                                        class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                    />
                                    <p class="mt-1 text-[11px] text-slate-400">
                                        空欄の場合は config.yml
                                        のデフォルトファイル名フォーマットが使用されます（利用可能変数: %TITLE%, %YEAR%,
                                        %MONTH%, %DAY%, %EPISODE% 等）
                                    </p>
                                </div>
                            </div>
                        </div>
                    {/if}
                </section>

                <!-- 3. 番組検索 & 録画予定プレビュー (スキップ設定) -->
                <section
                    class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                >
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <div>
                            <h2 class="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                                <Search size={16} class="text-blue-600 dark:text-blue-400" />
                                未来の録画予定プレビュー & スキップ管理
                            </h2>
                            <p class="text-xs text-slate-400 mt-0.5">
                                現在の検索条件に一致する未来の放送番組を検索し、録画予約の確認やスキップ（除外）を行えます
                            </p>
                        </div>
                        <button
                            type="button"
                            onclick={handlePreviewSearch}
                            disabled={isPreviewSearching}
                            class="btn-primary flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                        >
                            {#if isPreviewSearching}
                                <div
                                    class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
                                ></div>
                                <span>検索中...</span>
                            {:else}
                                <Search size={15} />
                                <span>録画予定を検索する</span>
                            {/if}
                        </button>
                    </div>

                    <!-- 検索結果表示エリア -->
                    {#if isPreviewSearching && previewPrograms === null}
                        <div
                            class="rounded-xl border border-slate-100 bg-slate-50/50 p-8 text-center dark:border-slate-800 dark:bg-slate-850/40 flex flex-col items-center justify-center gap-2.5"
                        >
                            <div
                                class="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent dark:border-blue-400"
                            ></div>
                            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                                未来の録画予定を検索しています...
                            </p>
                        </div>
                    {:else if previewPrograms === null}
                        <div
                            class="rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800"
                        >
                            <p class="text-xs sm:text-sm text-slate-400">
                                上の「録画予定を検索する」ボタンを押すと、現在の設定条件に合致する未来の番組一覧が表示されます
                            </p>
                        </div>
                    {:else if previewPrograms.length === 0}
                        <div
                            class="rounded-xl border border-slate-100 bg-slate-50/50 p-8 text-center dark:border-slate-800 dark:bg-slate-850/40"
                        >
                            <p class="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400">
                                現在の条件に一致する未来の番組は見つかりませんでした
                            </p>
                            <p class="text-xs text-slate-400 mt-1">
                                キーワードや放送局、ジャンルなどの条件をご確認ください
                            </p>
                        </div>
                    {:else}
                        <div class="space-y-3">
                            <div class="flex items-center justify-between text-xs sm:text-sm">
                                <span class="font-bold text-slate-700 dark:text-slate-300">
                                    該当する番組: <span class="text-blue-600 dark:text-blue-400 font-black">
                                        {previewPrograms.length}
                                    </span>
                                    件
                                </span>
                                <span class="text-xs text-slate-400">
                                    ※ ルール予約済みの番組はスキップ（除外）操作が可能です
                                </span>
                            </div>

                            <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                                <table class="w-full text-left text-xs sm:text-sm">
                                    <thead
                                        class="border-b border-slate-200 bg-slate-50 font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400"
                                    >
                                        <tr>
                                            <th class="px-3.5 py-2.5 whitespace-nowrap min-w-[130px]">放送日時</th>
                                            <th class="px-3.5 py-2.5 whitespace-nowrap min-w-[110px]">放送局</th>
                                            <th class="px-3.5 py-2.5 min-w-[200px]">番組名 / 概要</th>
                                            <th class="px-3.5 py-2.5 whitespace-nowrap min-w-[80px]">状態</th>
                                            <th class="px-3.5 py-2.5 text-right whitespace-nowrap w-px min-w-[110px]">
                                                スキップ操作
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                                        {#each previewPrograms as p}
                                            {@const reserve = previewReservesMap.get(p.id)}
                                            {@const isProcessing = isProcessingSkipProgramId === p.id}
                                            {@const ch = channelStore.getChannel(p.channelId)}
                                            <tr
                                                class="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40 {reserve?.isSkip
                                                    ? 'opacity-60 bg-slate-50/50 dark:bg-slate-900/40'
                                                    : ''}"
                                            >
                                                <!-- 放送日時 -->
                                                <td
                                                    class="whitespace-nowrap px-3.5 py-3 font-medium text-slate-600 dark:text-slate-400"
                                                >
                                                    <div>{formatDate(p.startAt)}</div>
                                                    <div class="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                        {formatTime(p.startAt)} ~ {formatTime(p.endAt)} ({formatDuration(
                                                            p.endAt - p.startAt,
                                                        )})
                                                    </div>
                                                </td>

                                                <!-- 放送局 -->
                                                <td class="whitespace-nowrap px-3.5 py-3">
                                                    <span
                                                        class="rounded-md px-2 py-0.5 text-xs font-bold {getChannelTypeBadgeClass(
                                                            ch?.channelType,
                                                        )}"
                                                    >
                                                        {channelStore.getChannelName(p.channelId)}
                                                    </span>
                                                </td>

                                                <!-- 番組名 / 概要 -->
                                                <td class="px-3.5 py-3 min-w-[200px]">
                                                    <div class="program-title">
                                                        {p.name}
                                                    </div>
                                                    {#if p.description}
                                                        <p class="mt-0.5 line-clamp-1 text-xs text-slate-400">
                                                            {p.description}
                                                        </p>
                                                    {/if}
                                                </td>

                                                <!-- 状態バッジ -->
                                                <td class="whitespace-nowrap px-3.5 py-3">
                                                    {#if !reserve}
                                                        <span
                                                            class="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                                                        >
                                                            未予約 (保存後反映)
                                                        </span>
                                                    {:else if reserve.isSkip}
                                                        <span
                                                            class="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60"
                                                        >
                                                            <Ban size={12} /> スキップ中
                                                        </span>
                                                    {:else if reserve.isConflict}
                                                        <span
                                                            class="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60"
                                                        >
                                                            <AlertTriangle size={12} /> 競合中
                                                        </span>
                                                    {:else if reserve.isOverlap}
                                                        <span
                                                            class="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-900/60"
                                                        >
                                                            重複
                                                        </span>
                                                    {:else}
                                                        <span
                                                            class="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60"
                                                        >
                                                            <CheckCircle2 size={12} /> 録画予約中
                                                        </span>
                                                    {/if}
                                                </td>

                                                <!-- 操作ボタン -->
                                                <td class="whitespace-nowrap px-3.5 py-3 text-right">
                                                    {#if reserve}
                                                        {#if reserve.isSkip}
                                                            <button
                                                                type="button"
                                                                onclick={() => handleToggleSkip(p, reserve)}
                                                                disabled={isProcessing}
                                                                class="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 cursor-pointer"
                                                            >
                                                                <RotateCcw size={13} /> スキップ解除
                                                            </button>
                                                        {:else}
                                                            <button
                                                                type="button"
                                                                onclick={() => handleToggleSkip(p, reserve)}
                                                                disabled={isProcessing}
                                                                class="btn-danger inline-flex items-center gap-1 px-2.5 py-1 text-xs cursor-pointer"
                                                            >
                                                                <Ban size={13} /> スキップ
                                                            </button>
                                                        {/if}
                                                    {:else}
                                                        <span class="text-xs text-slate-400">-</span>
                                                    {/if}
                                                </td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    {/if}
                </section>
            {/if}

            <!-- 4. 予約設定 -->
            <section
                class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
            >
                <h2 class="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">
                    <CheckCircle2 size={16} class="text-blue-600 dark:text-blue-400" /> 予約設定
                </h2>
                <div
                    class="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40 space-y-3"
                >
                    <label class="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" bind:checked={isEnable} class="form-checkbox" />
                        <span class="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-200">
                            ルールを有効にする
                        </span>
                    </label>

                    <label class="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" bind:checked={avoidDuplicate} class="form-checkbox" />
                        <span class="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-200">
                            同一番組の二重録画を防止
                        </span>
                    </label>

                    {#if avoidDuplicate}
                        <div class="ml-8 pt-1">
                            <label
                                for="rule-period-avoid-dup"
                                class="block font-bold text-sm text-slate-700 dark:text-slate-300 mb-1.5"
                            >
                                重複確認期間 (日) (空欄で全期間)
                            </label>
                            <input
                                id="rule-period-avoid-dup"
                                type="number"
                                min="1"
                                bind:value={periodToAvoidDuplicate}
                                placeholder="空欄で無期限（デフォルト）"
                                class="h-10 w-56 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            />
                        </div>
                    {/if}

                    <label class="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" bind:checked={isFree} class="form-checkbox" />
                        <span class="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-200">
                            無料放送（ノンスクランブル）のみ録画
                        </span>
                    </label>

                    <!-- 優先度設定 -->
                    <div class="pt-3 border-t border-slate-200/80 dark:border-slate-700/80">
                        <label
                            for="rule-priority"
                            class="block font-bold text-sm text-slate-800 dark:text-slate-200 mb-1"
                        >
                            ルールの優先度 (1 〜 10)
                        </label>
                        <p class="text-xs text-slate-500 dark:text-slate-400 mb-2">
                            チューナー不足で録画が競合した際、数値が大きいルールが優先的に録画枠を確保します（標準:
                            5、最高: 10、最低: 1）。
                        </p>
                        <div class="flex items-center gap-3">
                            <select
                                id="rule-priority"
                                bind:value={priority}
                                class="h-10 w-48 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            >
                                <option value={10}>10 (最高・最優先)</option>
                                <option value={9}>9 (より高)</option>
                                <option value={8}>8 (より高)</option>
                                <option value={7}>7 (高)</option>
                                <option value={6}>6 (高)</option>
                                <option value={5}>5 (標準)</option>
                                <option value={4}>4 (低)</option>
                                <option value={3}>3 (低)</option>
                                <option value={2}>2 (低)</option>
                                <option value={1}>1 (最低)</option>
                            </select>
                            <span
                                class="text-xs font-bold px-2.5 py-1 rounded-md {priority >= 8
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60'
                                    : priority >= 6
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60'
                                      : priority === 5
                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60'
                                        : 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60'}"
                            >
                                {#if priority >= 8}
                                    ★ 優先度: 最高 ({priority})
                                {:else if priority >= 6}
                                    ▲ 優先度: 高 ({priority})
                                {:else if priority === 5}
                                    ● 優先度: 標準 (5)
                                {:else}
                                    ▼ 優先度: 低 ({priority})
                                {/if}
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 5. 録画オプション (TS保存先・エンコード設定) -->
            <section
                class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
            >
                <h2 class="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">
                    <SlidersHorizontal size={16} class="text-blue-600 dark:text-blue-400" /> 録画オプション
                </h2>
                <RecordingOptionForm
                    bind:saveParentDir={parentDirectoryName}
                    bind:saveSubDir={directory}
                    bind:encRows
                    bind:isDeleteOriginal={isDeleteOriginalAfterEncode}
                    bind:allowEndLack
                    {encodeModes}
                    {storageDirs}
                    showHeading={false}
                />
            </section>

            <!-- フッター操作 -->
            <div
                class="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
            >
                <button type="button" onclick={goBackToRuleList} class="btn-secondary cursor-pointer">
                    キャンセル
                </button>
                {#if !readOnlyStore.isReadOnly}
                    <button
                        type="submit"
                        disabled={isSaving}
                        class="btn-primary flex items-center gap-1.5 cursor-pointer"
                    >
                        <Save size={16} />
                        {ruleId ? 'ルールを更新する' : '新規ルールを作成する'}
                    </button>
                {:else}
                    <p class="text-xs sm:text-sm font-bold text-amber-600 dark:text-amber-400">
                        ※閲覧専用モードのためルールの変更・作成はできません
                    </p>
                {/if}
            </div>
        </form>
    {/if}
</div>
