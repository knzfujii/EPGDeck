<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { socketStore } from '../lib/stores/socket.svelte';
    import { readOnlyStore } from '../lib/stores/readOnly.svelte';
    import http from '@/lib/httpClient';
    import {
        ArrowLeft,
        SlidersHorizontal,
        Search,
        Tv,
        CheckCircle2,
        HardDrive,
        Sparkles,
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

    // 編集対象のルールID (?id=<ruleId>)。未指定なら新規作成
    let ruleId = $state<number | null>(null);
    let rule = $state<any>(null);
    let isLoading = $state(true);
    let isSaving = $state(false);

    // ストレージ一覧 & エンコード設定
    let storageList = $state<string[]>([]);
    let encodeModes = $state<any[]>([]);

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
    let durationMin = $state<number | null>(null);
    let durationMax = $state<number | null>(null);

    // 期間指定 (searchPeriods: startAt, endAt)
    let periodStart = $state<string>(''); // YYYY-MM-DDTHH:mm
    let periodEnd = $state<string>(''); // YYYY-MM-DDTHH:mm

    // 時刻・曜日指定 (times: week, start, range)
    // week: 0x01(日), 0x02(月), 0x04(火), 0x08(水), 0x10(木), 0x20(金), 0x40(土)
    let daysOfWeek = $state<number[]>([0, 1, 2, 3, 4, 5, 6]);
    let timeStartHour = $state<number | null>(null); // 0〜23
    let timeRangeHour = $state<number | null>(null); // 1〜24 (時間幅)

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
    let previewPrograms = $state<any[] | null>(null);
    let previewReservesMap = $state<Map<number, any>>(new Map());
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
    let allowEndLack = $state(false);
    let avoidDuplicate = $state(true);
    let periodToAvoidDuplicate = $state<number | null>(null);

    // 3. 保存先設定 (saveOption)
    let parentDirectoryName = $state<string>('');
    let directory = $state<string>('');

    // 4. エンコード設定 (encodeOption)
    let encodeMode1 = $state<string>('');
    let encodeParentDir1 = $state<string>('');
    let encodeDir1 = $state<string>('');
    let encodeMode2 = $state<string>('');
    let encodeParentDir2 = $state<string>('');
    let encodeDir2 = $state<string>('');
    let encodeMode3 = $state<string>('');
    let encodeParentDir3 = $state<string>('');
    let encodeDir3 = $state<string>('');
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
            await channelStore.fetch();
            const [storageRes, configRes] = await Promise.all([
                http.get('/api/storages').catch(() => ({ data: { items: [] } })),
                http.get('/api/config').catch(() => ({ data: {} })),
            ]);

            const items = storageRes.data?.items || [];
            storageList = items.map((i: any) => i.name);
            const encList = configRes.data?.encode || [];
            encodeModes = encList.map((e: any) => (typeof e === 'string' ? { name: e, suffix: '' } : e));
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

    function loadRule(r: any) {
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
                .filter((g: any) => typeof (g.lv1 ?? g.genre) === 'number')
                .map((g: any) => {
                    const genre = g.lv1 ?? g.genre;
                    const subGenre = g.lv2 ?? g.subGenre;
                    return typeof subGenre === 'number' ? `${genre}:${subGenre}` : `${genre}`;
                });
        } else {
            selectedGenreKeys = [];
        }
        isFree = !!s.isFree;
        durationMin = s.durationMin || null;
        durationMax = s.durationMax || null;

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
            timeStartHour = typeof t.start === 'number' ? t.start : null;
            timeRangeHour = typeof t.range === 'number' ? t.range : null;
        } else {
            daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
            timeStartHour = null;
            timeRangeHour = null;
        }

        const rOpt = r.reserveOption || {};
        isEnable = rOpt.enable !== false;
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

        const enc = r.encodeOption || {};
        encodeMode1 = enc.mode1 || '';
        encodeParentDir1 = enc.encodeParentDirectoryName1 || '';
        encodeDir1 = enc.directory1 || '';
        encodeMode2 = enc.mode2 || '';
        encodeParentDir2 = enc.encodeParentDirectoryName2 || '';
        encodeDir2 = enc.directory2 || '';
        encodeMode3 = enc.mode3 || '';
        encodeParentDir3 = enc.encodeParentDirectoryName3 || '';
        encodeDir3 = enc.directory3 || '';
        isDeleteOriginalAfterEncode = !!enc.isDeleteOriginalAfterEncode;
    }

    let unsubscribeSocket: (() => void) | null = null;

    async function refreshReservesSilently() {
        if (previewPrograms === null) return;
        try {
            const res = await http.get('/api/reserves?limit=1000&isHalfWidth=true');
            const map = new Map<number, any>();
            for (const r of res.data?.reserves || []) {
                if (r.programId) {
                    map.set(r.programId, r);
                }
            }
            previewReservesMap = map;
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

        const idParam = router.query['id'];
        if (idParam) {
            ruleId = parseInt(idParam, 10);
            try {
                const res = await http.get(`/api/rules/${ruleId}?isHalfWidth=true`);
                rule = res.data;
                loadRule(rule);
            } catch (e) {
                console.error('Failed to fetch rule', e);
                snackbar.open({ text: 'ルールの取得に失敗しました', color: 'error' });
            }
        } else {
            // 新規作成時: 検索画面から渡された検索条件をプリフィル
            const q = router.query;
            if (q['keyword']) {
                keyword = q['keyword'];
                isName = q['name'] !== '0';
                isDescription = q['description'] !== '0';
                if (q['genre']) {
                    const gVal = q['genre'];
                    const sgVal = q['subGenre'];
                    selectedGenreKeys = [sgVal ? `${gVal}:${sgVal}` : `${gVal}`];
                    showAdvancedSearch = true;
                }
            }
        }
        isLoading = false;

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
        const opt: any = {
            GR: isGR,
            BS: isBS,
            CS: isCS,
            SKY: isSKY,
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
                const item: any = { genre };
                if (parts.length > 1) {
                    item.subGenre = parseInt(parts[1], 10);
                }
                return item;
            });
        }

        if (durationMin !== null && durationMin > 0) opt.durationMin = durationMin;
        if (durationMax !== null && durationMax > 0) opt.durationMax = durationMax;

        // 検索対象期間
        if (periodStart || periodEnd) {
            const startAt = periodStart ? new Date(periodStart).getTime() : 0;
            const endAt = periodEnd ? new Date(periodEnd).getTime() : 253402268399000;
            opt.searchPeriods = [{ startAt, endAt }];
        }

        // 時刻・曜日
        if (daysOfWeek.length < 7 || timeStartHour !== null || timeRangeHour !== null) {
            let weekBitmask = 0;
            for (const d of daysOfWeek) {
                weekBitmask |= 1 << d;
            }
            const timeObj: any = { week: weekBitmask };
            if (timeStartHour !== null) timeObj.start = timeStartHour;
            if (timeRangeHour !== null) timeObj.range = timeRangeHour;
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
                http.post('/api/schedules/search', {
                    option: searchOpt,
                    isHalfWidth: true,
                    limit: 100,
                }),
                http.get('/api/reserves?limit=1000&isHalfWidth=true').catch(() => ({ data: { reserves: [] } })),
            ]);

            previewPrograms = searchRes.data || [];

            const map = new Map<number, any>();
            for (const r of reservesRes.data?.reserves || []) {
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

    async function handleToggleSkip(program: any, reserve: any) {
        if (!reserve || isProcessingSkipProgramId !== null) return;
        isProcessingSkipProgramId = program.id;

        const willSkip = !reserve.isSkip;
        try {
            if (willSkip) {
                await http.delete(`/api/reserves/${reserve.id}`);
                snackbar.open({ text: `「${program.name}」をスキップ設定しました`, color: 'success' });
            } else {
                await http.delete(`/api/reserves/${reserve.id}/skip`);
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
        isSaving = true;
        try {
            const payload: any = {
                isTimeSpecification: false,
                searchOption: buildSearchOptionPayload(),
                reserveOption: {
                    enable: isEnable,
                    allowEndLack,
                    avoidDuplicate,
                },
            };

            if (periodToAvoidDuplicate !== null && periodToAvoidDuplicate > 0) {
                payload.reserveOption.periodToAvoidDuplicate = periodToAvoidDuplicate;
            }

            // 保存先オプション
            if (parentDirectoryName || directory.trim() || recordedFormat.trim()) {
                payload.saveOption = {};
                if (parentDirectoryName) payload.saveOption.parentDirectoryName = parentDirectoryName;
                if (directory.trim()) payload.saveOption.directory = directory.trim();
                if (recordedFormat.trim()) payload.saveOption.recordedFormat = recordedFormat.trim();
            }

            // エンコードオプション
            if (encodeMode1 || encodeMode2 || encodeMode3) {
                payload.encodeOption = {
                    isDeleteOriginalAfterEncode,
                };
                if (encodeMode1) {
                    payload.encodeOption.mode1 = encodeMode1;
                    if (encodeParentDir1) payload.encodeOption.encodeParentDirectoryName1 = encodeParentDir1;
                    if (encodeDir1.trim()) payload.encodeOption.directory1 = encodeDir1.trim();
                }
                if (encodeMode2) {
                    payload.encodeOption.mode2 = encodeMode2;
                    if (encodeParentDir2) payload.encodeOption.encodeParentDirectoryName2 = encodeParentDir2;
                    if (encodeDir2.trim()) payload.encodeOption.directory2 = encodeDir2.trim();
                }
                if (encodeMode3) {
                    payload.encodeOption.mode3 = encodeMode3;
                    if (encodeParentDir3) payload.encodeOption.encodeParentDirectoryName3 = encodeParentDir3;
                    if (encodeDir3.trim()) payload.encodeOption.directory3 = encodeDir3.trim();
                }
            }

            if (ruleId) {
                await http.put(`/api/rules/${ruleId}`, payload);
                snackbar.open({ text: `ルール「${keyword}」を更新しました`, color: 'success' });
            } else {
                await http.post('/api/rules', payload);
                snackbar.open({ text: `新規ルール「${keyword}」を作成しました`, color: 'success' });
            }

            router.push('/rule');
        } catch (e) {
            console.error('Failed to save rule', e);
            snackbar.open({ text: 'ルールの保存に失敗しました', color: 'error' });
        } finally {
            isSaving = false;
        }
    }
</script>

<div class="w-full max-w-full min-w-0 space-y-5">
    <!-- ヘッダー -->
    <div class="flex items-center gap-3">
        <button
            type="button"
            onclick={() => router.push('/rule')}
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
                class="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 cursor-pointer"
            >
                {readOnlyStore.canViewRules ? 'ルール一覧へ戻る' : '録画済み一覧へ'}
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
            <!-- 1. 検索条件 -->
            <section
                class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
            >
                <h2 class="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">
                    <Search size={16} class="text-blue-600 dark:text-blue-400" /> 検索条件
                </h2>
                <div class="space-y-4">
                    <div>
                        <label for="rule-keyword" class="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                            検索キーワード
                        </label>
                        <input
                            id="rule-keyword"
                            type="text"
                            bind:value={keyword}
                            placeholder="例: 葬送のフリーレン (未指定の場合は全番組)"
                            class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                        <div
                            class="mt-2 flex flex-wrap items-center gap-4 text-[11px] font-semibold text-slate-600 dark:text-slate-400"
                        >
                            <span>対象項目:</span>
                            <label class="flex items-center gap-1 cursor-pointer">
                                <input
                                    type="checkbox"
                                    bind:checked={isName}
                                    class="rounded border-slate-300 text-blue-600"
                                />
                                番組名
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer">
                                <input
                                    type="checkbox"
                                    bind:checked={isDescription}
                                    class="rounded border-slate-300 text-blue-600"
                                />
                                概要
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer">
                                <input
                                    type="checkbox"
                                    bind:checked={isExtended}
                                    class="rounded border-slate-300 text-blue-600"
                                />
                                詳細・出演者
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer ml-2">
                                <input
                                    type="checkbox"
                                    bind:checked={keyRegExp}
                                    class="rounded border-slate-300 text-blue-600"
                                />
                                正規表現
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer">
                                <input
                                    type="checkbox"
                                    bind:checked={keyCS}
                                    class="rounded border-slate-300 text-blue-600"
                                />
                                大小文字区別
                            </label>
                        </div>
                    </div>

                    <div class="border-t border-slate-100 pt-3 dark:border-slate-800">
                        <label
                            for="rule-ignore-keyword"
                            class="block font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                        >
                            除外キーワード (任意)
                        </label>
                        <input
                            id="rule-ignore-keyword"
                            type="text"
                            bind:value={ignoreKeyword}
                            placeholder="例: 再放送 / ダイジェスト"
                            class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                        <div
                            class="mt-2 flex flex-wrap items-center gap-4 text-[11px] font-semibold text-slate-600 dark:text-slate-400"
                        >
                            <span>除外対象:</span>
                            <label class="flex items-center gap-1 cursor-pointer">
                                <input
                                    type="checkbox"
                                    bind:checked={isIgnoreName}
                                    class="rounded border-slate-300 text-blue-600"
                                />
                                番組名
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer">
                                <input
                                    type="checkbox"
                                    bind:checked={isIgnoreDescription}
                                    class="rounded border-slate-300 text-blue-600"
                                />
                                概要
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer">
                                <input
                                    type="checkbox"
                                    bind:checked={isIgnoreExtended}
                                    class="rounded border-slate-300 text-blue-600"
                                />
                                詳細
                            </label>
                        </div>
                    </div>

                    <!-- 曜日・時間帯の指定 (times) -->
                    <div class="border-t border-slate-100 pt-3.5 dark:border-slate-800 space-y-3">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <Clock size={15} class="text-blue-600 dark:text-blue-400" /> 曜日・時間帯の指定
                            </span>
                            {#if daysOfWeek.length < 7 || timeStartHour !== null || timeRangeHour !== null}
                                <span
                                    class="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-950 dark:text-blue-300"
                                >
                                    条件適用中
                                </span>
                            {/if}
                        </div>

                        <!-- 曜日指定 -->
                        <div>
                            <div class="flex items-center justify-between mb-1.5">
                                <span class="text-[11px] font-bold text-slate-700 dark:text-slate-300">対象曜日</span>
                                <div class="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onclick={setAllWeekDays}
                                        class="rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                                    >
                                        全曜日
                                    </button>
                                    <button
                                        type="button"
                                        onclick={setWeekdaysOnly}
                                        class="rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                                    >
                                        平日のみ
                                    </button>
                                    <button
                                        type="button"
                                        onclick={setWeekendsOnly}
                                        class="rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                                    >
                                        土日のみ
                                    </button>
                                </div>
                            </div>
                            <div class="flex flex-wrap gap-1.5">
                                {#each weekDayOptions as day}
                                    {@const isSelected = daysOfWeek.includes(day.value)}
                                    <button
                                        type="button"
                                        onclick={() => toggleDayOfWeek(day.value)}
                                        class="h-8 w-11 rounded-lg border text-xs font-bold transition cursor-pointer {isSelected
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/70 dark:text-blue-200'
                                            : 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 dark:border-slate-800/80 dark:bg-slate-950 dark:text-slate-600 hover:dark:bg-slate-900/60 hover:dark:text-slate-400'}"
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
                                    時間帯 (開始時刻 & 時間幅)
                                </span>
                                {#if timeStartHour !== null || timeRangeHour !== null}
                                    <button
                                        type="button"
                                        onclick={() => {
                                            timeStartHour = null;
                                            timeRangeHour = null;
                                        }}
                                        class="text-[11px] font-bold text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                                    >
                                        全時間帯 (クリア)
                                    </button>
                                {/if}
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md">
                                <div>
                                    <label for="rule-time-start" class="block text-[10px] text-slate-400 mb-1">
                                        開始時刻
                                    </label>
                                    <select
                                        id="rule-time-start"
                                        bind:value={timeStartHour}
                                        class="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                    >
                                        <option value={null}>指定なし (0時〜)</option>
                                        {#each Array.from({ length: 24 }, (_, i) => i) as h}
                                            <option value={h}>{h}:00</option>
                                        {/each}
                                    </select>
                                </div>
                                <div>
                                    <label for="rule-time-range" class="block text-[10px] text-slate-400 mb-1">
                                        時間の長さ (時間幅)
                                    </label>
                                    <select
                                        id="rule-time-range"
                                        bind:value={timeRangeHour}
                                        class="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                    >
                                        <option value={null}>指定なし (終日)</option>
                                        {#each Array.from({ length: 24 }, (_, i) => i + 1) as r}
                                            <option value={r}>{r} 時間</option>
                                        {/each}
                                    </select>
                                </div>
                            </div>
                            <p class="text-[11px] text-slate-400 mt-1">
                                ※ 指定した開始時刻から時間幅の間に開始する番組のみが対象になります
                            </p>
                        </div>
                    </div>

                    <!-- 番組の長さ (分) & 検索対象期間 -->
                    <div
                        class="border-t border-slate-100 pt-3.5 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4"
                    >
                        <!-- 番組の長さ (分) -->
                        <div>
                            <span class="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                番組の長さ (分)
                            </span>
                            <div class="flex items-center gap-2">
                                <input
                                    type="number"
                                    min="0"
                                    bind:value={durationMin}
                                    placeholder="最小 (分)"
                                    class="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                />
                                <span class="text-slate-400 font-bold">~</span>
                                <input
                                    type="number"
                                    min="0"
                                    bind:value={durationMax}
                                    placeholder="最大 (分)"
                                    class="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                />
                            </div>
                        </div>

                        <!-- 検索対象期間 (searchPeriods) -->
                        <div>
                            <div class="flex items-center justify-between mb-1.5">
                                <span class="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                    <Calendar size={14} class="text-blue-600 dark:text-blue-400" />
                                    検索対象期間 (任意)
                                </span>
                                {#if periodStart || periodEnd}
                                    <button
                                        type="button"
                                        onclick={() => {
                                            periodStart = '';
                                            periodEnd = '';
                                        }}
                                        class="text-[11px] font-bold text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                                    >
                                        クリア
                                    </button>
                                {/if}
                            </div>
                            <div class="flex items-center gap-2">
                                <input
                                    type="datetime-local"
                                    bind:value={periodStart}
                                    class="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                    title="開始日時"
                                />
                                <span class="text-slate-400 font-bold">~</span>
                                <input
                                    type="datetime-local"
                                    bind:value={periodEnd}
                                    class="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
                    <div class="flex items-center gap-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
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
                                        class="rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 cursor-pointer"
                                    >
                                        全解除 (すべて対象)
                                    </button>
                                {/if}
                            </div>
                            <p class="text-[11px] text-slate-400 mb-2">
                                {selectedGenreKeys.length === 0
                                    ? '※ 未選択時は「すべてのジャンル」が対象になります。親ジャンルをクリックで一括選択、各子ジャンルをクリックで個別選択できます。'
                                    : '※ 選択したジャンル・子ジャンルに一致する番組のみが対象になります'}
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
                                            class="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900 transition-shadow hover:shadow-xs"
                                        >
                                            <div class="flex items-center justify-between mb-2">
                                                <div class="flex items-center gap-1.5">
                                                    <span class="text-xs font-bold text-slate-800 dark:text-slate-200">
                                                        {g.name}
                                                    </span>
                                                    {#if isMainAll}
                                                        <span
                                                            class="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                                        >
                                                            全選択中
                                                        </span>
                                                    {:else if hasSelectedSub}
                                                        <span
                                                            class="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
                                                        >
                                                            一部選択中
                                                        </span>
                                                    {/if}
                                                </div>
                                                <button
                                                    type="button"
                                                    onclick={() => toggleMainGenre(g)}
                                                    class="rounded-md border px-2 py-0.5 text-[10px] font-bold transition cursor-pointer {isMainAll ||
                                                    hasSelectedSub
                                                        ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300'
                                                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}"
                                                >
                                                    {isMainAll || hasSelectedSub ? 'ジャンル解除' : '一括選択 (すべて)'}
                                                </button>
                                            </div>

                                            {#if g.subGenres && g.subGenres.length > 0}
                                                <div class="flex flex-wrap gap-1.5">
                                                    {#each g.subGenres as sg}
                                                        {@const sgKey = `${g.id}:${sg.id}`}
                                                        {@const isSgSelected = selectedGenreKeys.includes(sgKey)}
                                                        {@const isCoveredByMain = isMainAll}
                                                        <button
                                                            type="button"
                                                            onclick={() => toggleGenreKey(sgKey, g)}
                                                            class="rounded-lg border px-2.5 py-1 text-[11px] font-medium transition cursor-pointer {isSgSelected ||
                                                            isCoveredByMain
                                                                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/70 dark:text-blue-200'
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

                                    <div class="flex items-center gap-4 text-xs font-semibold">
                                        <label
                                            class="flex items-center gap-1.5 {selectedChannelIds.length > 0
                                                ? 'cursor-not-allowed'
                                                : 'cursor-pointer'}"
                                        >
                                            <input
                                                type="checkbox"
                                                bind:checked={isGR}
                                                disabled={selectedChannelIds.length > 0}
                                                class="rounded border-slate-300 text-blue-600 disabled:opacity-50"
                                            />
                                            地デジ (GR)
                                        </label>
                                        <label
                                            class="flex items-center gap-1.5 {selectedChannelIds.length > 0
                                                ? 'cursor-not-allowed'
                                                : 'cursor-pointer'}"
                                        >
                                            <input
                                                type="checkbox"
                                                bind:checked={isBS}
                                                disabled={selectedChannelIds.length > 0}
                                                class="rounded border-slate-300 text-blue-600 disabled:opacity-50"
                                            />
                                            BS
                                        </label>
                                        <label
                                            class="flex items-center gap-1.5 {selectedChannelIds.length > 0
                                                ? 'cursor-not-allowed'
                                                : 'cursor-pointer'}"
                                        >
                                            <input
                                                type="checkbox"
                                                bind:checked={isCS}
                                                disabled={selectedChannelIds.length > 0}
                                                class="rounded border-slate-300 text-blue-600 disabled:opacity-50"
                                            />
                                            CS
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
                                                <span class="text-[10px] font-bold text-blue-600 dark:text-blue-400">
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
                                    <div class="flex items-center gap-1.5 shrink-0">
                                        <button
                                            type="button"
                                            onclick={selectAllChannels}
                                            class="rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-600 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 cursor-pointer"
                                        >
                                            全選択
                                        </button>
                                        {#if selectedChannelIds.length > 0}
                                            <button
                                                type="button"
                                                onclick={clearAllChannels}
                                                class="rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 cursor-pointer"
                                            >
                                                クリア (放送波指定に戻す)
                                            </button>
                                        {/if}
                                    </div>
                                </div>

                                <div class="flex items-center gap-2 pt-0.5">
                                    <span class="text-[11px] font-bold text-slate-500">放送波ごとに追加:</span>
                                    <button
                                        type="button"
                                        onclick={() => selectChannelsByType('GR')}
                                        class="rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer"
                                    >
                                        + 地デジ局
                                    </button>
                                    <button
                                        type="button"
                                        onclick={() => selectChannelsByType('BS')}
                                        class="rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer"
                                    >
                                        + BS局
                                    </button>
                                    <button
                                        type="button"
                                        onclick={() => selectChannelsByType('CS')}
                                        class="rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer"
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
                                            class="flex items-center justify-between rounded-xl p-2 text-left transition border cursor-pointer {isSelected
                                                ? 'border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-100'
                                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'}"
                                        >
                                            <div class="min-w-0 pr-1">
                                                <span class="text-[9px] font-black uppercase text-slate-400 block">
                                                    [{ch.channelType}]
                                                </span>
                                                <p class="text-xs font-bold truncate">{ch.name}</p>
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
                        class="flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer shrink-0"
                    >
                        {#if isPreviewSearching}
                            <div
                                class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
                            ></div>
                            <span>検索中...</span>
                        {:else}
                            <Search size={14} />
                            <span>録画予定を検索する</span>
                        {/if}
                    </button>
                </div>

                <!-- 検索結果表示エリア -->
                {#if previewPrograms === null}
                    <div class="rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                        <p class="text-xs text-slate-400">
                            上の「録画予定を検索する」ボタンを押すと、現在の設定条件に合致する未来の番組一覧が表示されます
                        </p>
                    </div>
                {:else if previewPrograms.length === 0}
                    <div
                        class="rounded-xl border border-slate-100 bg-slate-50/50 p-8 text-center dark:border-slate-800 dark:bg-slate-850/40"
                    >
                        <p class="text-xs font-bold text-slate-500 dark:text-slate-400">
                            現在の条件に一致する未来の番組は見つかりませんでした
                        </p>
                        <p class="text-[11px] text-slate-400 mt-1">
                            キーワードや放送局、ジャンルなどの条件をご確認ください
                        </p>
                    </div>
                {:else}
                    <div class="space-y-3">
                        <div class="flex items-center justify-between text-xs">
                            <span class="font-bold text-slate-700 dark:text-slate-300">
                                該当する番組: <span class="text-blue-600 dark:text-blue-400 font-black">
                                    {previewPrograms.length}
                                </span>
                                件
                            </span>
                            <span class="text-[11px] text-slate-400">
                                ※ ルール予約済みの番組はスキップ（除外）操作が可能です
                            </span>
                        </div>

                        <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                            <table class="w-full text-left text-xs">
                                <thead
                                    class="border-b border-slate-200 bg-slate-50 font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400"
                                >
                                    <tr>
                                        <th class="px-3.5 py-2.5">放送日時</th>
                                        <th class="px-3.5 py-2.5">放送局</th>
                                        <th class="px-3.5 py-2.5">番組名 / 概要</th>
                                        <th class="px-3.5 py-2.5">状態</th>
                                        <th class="px-3.5 py-2.5 text-right">スキップ操作</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                                    {#each previewPrograms as p}
                                        {@const reserve = previewReservesMap.get(p.id)}
                                        {@const isProcessing = isProcessingSkipProgramId === p.id}
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
                                                <div class="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                                    {formatTime(p.startAt)} ~ {formatTime(p.endAt)} ({formatDuration(
                                                        p.endAt - p.startAt,
                                                    )})
                                                </div>
                                            </td>

                                            <!-- 放送局 -->
                                            <td class="whitespace-nowrap px-3.5 py-3">
                                                <span
                                                    class="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                                >
                                                    {channelStore.getChannelName(p.channelId)}
                                                </span>
                                            </td>

                                            <!-- 番組名 / 概要 -->
                                            <td class="px-3.5 py-3 min-w-[200px]">
                                                <div class="font-bold text-slate-900 dark:text-slate-100">
                                                    {p.name}
                                                </div>
                                                {#if p.description}
                                                    <p class="mt-0.5 line-clamp-1 text-[11px] text-slate-400">
                                                        {p.description}
                                                    </p>
                                                {/if}
                                            </td>

                                            <!-- 状態バッジ -->
                                            <td class="whitespace-nowrap px-3.5 py-3">
                                                {#if !reserve}
                                                    <span
                                                        class="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                                                    >
                                                        未予約 (保存後反映)
                                                    </span>
                                                {:else if reserve.isSkip}
                                                    <span
                                                        class="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                                                    >
                                                        <Ban size={11} /> スキップ中
                                                    </span>
                                                {:else if reserve.isConflict}
                                                    <span
                                                        class="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                                                    >
                                                        <AlertTriangle size={11} /> 競合中
                                                    </span>
                                                {:else if reserve.isOverlap}
                                                    <span
                                                        class="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                                                    >
                                                        重複
                                                    </span>
                                                {:else}
                                                    <span
                                                        class="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                                    >
                                                        <CheckCircle2 size={11} /> 録画予約中
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
                                                            class="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 cursor-pointer"
                                                        >
                                                            <RotateCcw size={12} /> スキップ解除
                                                        </button>
                                                    {:else}
                                                        <button
                                                            type="button"
                                                            onclick={() => handleToggleSkip(p, reserve)}
                                                            disabled={isProcessing}
                                                            class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:border-rose-300 hover:bg-rose-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-rose-950/40 cursor-pointer"
                                                        >
                                                            <Ban size={12} /> スキップ
                                                        </button>
                                                    {/if}
                                                {:else}
                                                    <span class="text-[11px] text-slate-400">-</span>
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
                    <label class="flex items-center gap-2.5 cursor-pointer">
                        <input
                            type="checkbox"
                            bind:checked={isEnable}
                            class="h-4 w-4 rounded border-slate-300 text-blue-600"
                        />
                        <div>
                            <span class="font-bold text-slate-900 dark:text-slate-100">このルールを有効化する</span>
                            <p class="text-[11px] text-slate-400">チェックを外すと一時的に予約が無効化されます</p>
                        </div>
                    </label>

                    <label class="flex items-center gap-2.5 cursor-pointer">
                        <input
                            type="checkbox"
                            bind:checked={avoidDuplicate}
                            class="h-4 w-4 rounded border-slate-300 text-blue-600"
                        />
                        <div>
                            <span class="font-bold text-slate-900 dark:text-slate-100">
                                重複録画を回避する (二重録画防止)
                            </span>
                            <p class="text-[11px] text-slate-400">
                                過去に録画済みの同一番組（同タイトル・話数）をスキップします
                            </p>
                        </div>
                    </label>

                    {#if avoidDuplicate}
                        <div class="ml-6 pt-1">
                            <label
                                for="rule-period-avoid-dup"
                                class="block font-bold text-xs text-slate-700 dark:text-slate-300 mb-1"
                            >
                                重複確認期間 (日) (任意)
                            </label>
                            <input
                                id="rule-period-avoid-dup"
                                type="number"
                                min="1"
                                bind:value={periodToAvoidDuplicate}
                                placeholder="空欄で無期限（デフォルト）"
                                class="h-9 w-48 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            />
                            <p class="mt-0.5 text-[11px] text-slate-400">
                                指定日数以内の録画履歴のみ重複チェック対象にします（例: 90日、空欄で全期間）
                            </p>
                        </div>
                    {/if}

                    <label class="flex items-center gap-2.5 cursor-pointer">
                        <input
                            type="checkbox"
                            bind:checked={allowEndLack}
                            class="h-4 w-4 rounded border-slate-300 text-blue-600"
                        />
                        <div>
                            <span class="font-bold text-slate-900 dark:text-slate-100">末尾切れを許可する</span>
                            <p class="text-[11px] text-slate-400">
                                チューナー競合時に前後の番組が重なっても録画を許可します
                            </p>
                        </div>
                    </label>

                    <label class="flex items-center gap-2.5 cursor-pointer">
                        <input
                            type="checkbox"
                            bind:checked={isFree}
                            class="h-4 w-4 rounded border-slate-300 text-blue-600"
                        />
                        <div>
                            <span class="font-bold text-slate-900 dark:text-slate-100">無料放送のみ録画する</span>
                            <p class="text-[11px] text-slate-400">
                                有料放送（スクランブル番組）を除外し、無料番組のみを予約します
                            </p>
                        </div>
                    </label>
                </div>
            </section>

            <!-- 5. 保存先ストレージ -->
            <section
                class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
            >
                <h2 class="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">
                    <HardDrive size={16} class="text-blue-600 dark:text-blue-400" /> 保存先ストレージ
                </h2>
                <div class="space-y-4">
                    <div>
                        <label for="rule-parent-dir" class="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                            親保存先ストレージ / ドライブ (parentDirectoryName)
                        </label>
                        <select
                            id="rule-parent-dir"
                            bind:value={parentDirectoryName}
                            class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                            <option value="">デフォルトストレージ</option>
                            {#each storageList as st}
                                <option value={st}>{st}</option>
                            {/each}
                        </select>
                        <p class="mt-1 text-[11px] text-slate-400">
                            EPGStation に登録されている保存先ストレージを指定します
                        </p>
                    </div>

                    <div>
                        <label for="rule-sub-dir" class="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                            保存サブディレクトリ (directory)
                        </label>
                        <input
                            id="rule-sub-dir"
                            type="text"
                            bind:value={directory}
                            placeholder="例: アニメ / %TITLE%"
                            class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                        <p class="mt-1 text-[11px] text-slate-400">
                            親保存先の下に作成するサブフォルダのパスを指定します
                        </p>
                    </div>
                </div>
            </section>

            <!-- 6. 自動エンコード設定 -->
            <section
                class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
            >
                <h2 class="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">
                    <Sparkles size={16} class="text-blue-600 dark:text-blue-400" /> 自動エンコード設定
                </h2>
                <div
                    class="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40"
                >
                    <label class="flex items-center gap-2.5 cursor-pointer mb-4">
                        <input
                            type="checkbox"
                            bind:checked={isDeleteOriginalAfterEncode}
                            class="h-4 w-4 rounded border-slate-300 text-rose-600"
                        />
                        <div>
                            <span class="font-bold text-rose-700 dark:text-rose-400">
                                エンコード完了後に元 TS ファイルを自動削除
                            </span>
                            <p class="text-[11px] text-slate-400">
                                ディスク容量を節約するため、エンコード成功後に元の巨大な TS ファイルを削除します
                            </p>
                        </div>
                    </label>

                    <!-- エンコード設定 1 -->
                    <div class="space-y-3 border-t border-slate-200/60 pt-3 dark:border-slate-700/60">
                        <p class="font-bold text-slate-800 dark:text-slate-200">エンコード設定 1</p>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                                <label for="rule-enc-mode1" class="block text-[11px] text-slate-500 mb-1">
                                    プリセット
                                </label>
                                <select
                                    id="rule-enc-mode1"
                                    bind:value={encodeMode1}
                                    class="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                >
                                    <option value="">なし</option>
                                    {#each encodeModes as em}
                                        <option value={em.name}>{em.name}{em.suffix ? ` (${em.suffix})` : ''}</option>
                                    {/each}
                                </select>
                            </div>
                            <div>
                                <label for="rule-enc-storage1" class="block text-[11px] text-slate-500 mb-1">
                                    保存先ストレージ
                                </label>
                                <select
                                    id="rule-enc-storage1"
                                    bind:value={encodeParentDir1}
                                    class="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                >
                                    <option value="">デフォルト</option>
                                    {#each storageList as st}
                                        <option value={st}>{st}</option>
                                    {/each}
                                </select>
                            </div>
                            <div>
                                <label for="rule-enc-dir1" class="block text-[11px] text-slate-500 mb-1">
                                    サブディレクトリ
                                </label>
                                <input
                                    id="rule-enc-dir1"
                                    type="text"
                                    bind:value={encodeDir1}
                                    placeholder="サブディレクトリ (任意)"
                                    class="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                />
                            </div>
                        </div>
                    </div>

                    <!-- エンコード設定 2 -->
                    <div class="space-y-3 border-t border-slate-200/60 pt-3 mt-3 dark:border-slate-700/60">
                        <p class="font-bold text-slate-800 dark:text-slate-200">エンコード設定 2 (追加)</p>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                                <label for="rule-enc-mode2" class="block text-[11px] text-slate-500 mb-1">
                                    プリセット
                                </label>
                                <select
                                    id="rule-enc-mode2"
                                    bind:value={encodeMode2}
                                    class="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                >
                                    <option value="">なし</option>
                                    {#each encodeModes as em}
                                        <option value={em.name}>{em.name}{em.suffix ? ` (${em.suffix})` : ''}</option>
                                    {/each}
                                </select>
                            </div>
                            <div>
                                <label for="rule-enc-storage2" class="block text-[11px] text-slate-500 mb-1">
                                    保存先ストレージ
                                </label>
                                <select
                                    id="rule-enc-storage2"
                                    bind:value={encodeParentDir2}
                                    class="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                >
                                    <option value="">デフォルト</option>
                                    {#each storageList as st}
                                        <option value={st}>{st}</option>
                                    {/each}
                                </select>
                            </div>
                            <div>
                                <label for="rule-enc-dir2" class="block text-[11px] text-slate-500 mb-1">
                                    サブディレクトリ
                                </label>
                                <input
                                    id="rule-enc-dir2"
                                    type="text"
                                    bind:value={encodeDir2}
                                    placeholder="サブディレクトリ (任意)"
                                    class="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                />
                            </div>
                        </div>
                    </div>

                    <!-- エンコード設定 3 -->
                    <div class="space-y-3 border-t border-slate-200/60 pt-3 mt-3 dark:border-slate-700/60">
                        <p class="font-bold text-slate-800 dark:text-slate-200">エンコード設定 3 (追加)</p>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                                <label for="rule-enc-mode3" class="block text-[11px] text-slate-500 mb-1">
                                    プリセット
                                </label>
                                <select
                                    id="rule-enc-mode3"
                                    bind:value={encodeMode3}
                                    class="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                >
                                    <option value="">なし</option>
                                    {#each encodeModes as em}
                                        <option value={em.name}>{em.name}{em.suffix ? ` (${em.suffix})` : ''}</option>
                                    {/each}
                                </select>
                            </div>
                            <div>
                                <label for="rule-enc-storage3" class="block text-[11px] text-slate-500 mb-1">
                                    保存先ストレージ
                                </label>
                                <select
                                    id="rule-enc-storage3"
                                    bind:value={encodeParentDir3}
                                    class="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                >
                                    <option value="">デフォルト</option>
                                    {#each storageList as st}
                                        <option value={st}>{st}</option>
                                    {/each}
                                </select>
                            </div>
                            <div>
                                <label for="rule-enc-dir3" class="block text-[11px] text-slate-500 mb-1">
                                    サブディレクトリ
                                </label>
                                <input
                                    id="rule-enc-dir3"
                                    type="text"
                                    bind:value={encodeDir3}
                                    placeholder="サブディレクトリ (任意)"
                                    class="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- フッター操作 -->
            <div
                class="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
            >
                <button
                    type="button"
                    onclick={() => router.push('/rule')}
                    class="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer"
                >
                    キャンセル
                </button>
                {#if !readOnlyStore.isReadOnly}
                    <button
                        type="submit"
                        disabled={isSaving}
                        class="flex items-center gap-1.5 rounded-xl bg-blue-600 px-6 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                    >
                        <Save size={15} />
                        {ruleId ? 'ルールを更新する' : '新規ルールを作成する'}
                    </button>
                {:else}
                    <p class="text-xs font-bold text-amber-600 dark:text-amber-400">
                        ※閲覧専用モードのためルールの変更・作成はできません
                    </p>
                {/if}
            </div>
        </form>
    {/if}
</div>
