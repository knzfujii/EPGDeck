<script lang="ts">
    import { onMount } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import axios from 'axios';
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
        Info
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
    let isGR = $state(true);
    let isBS = $state(true);
    let isCS = $state(true);
    let isSKY = $state(true);

    // 放送局 (channelIds)
    let selectedChannelIds = $state<number[]>([]);

    // ジャンル & 時間
    let selectedGenre = $state<number | null>(null);
    let isFree = $state(false);
    let durationMin = $state<number | null>(null);
    let durationMax = $state<number | null>(null);

    // 2. 予約設定 (reserveOption)
    let isEnable = $state(true);
    let allowEndLack = $state(false);
    let avoidDuplicate = $state(true);
    let periodToAvoidDuplicate = $state<number | null>(null);

    // 3. 保存先設定 (saveOption)
    let parentDirectoryName = $state<string>('');
    let directory = $state<string>('');
    let recordedFormat = $state<string>('');

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

    const genres = [
        { id: null, name: 'すべてのジャンル' },
        { id: 7, name: 'アニメ' },
        { id: 6, name: '映画' },
        { id: 3, name: 'ドラマ' },
        { id: 0, name: 'ニュース' },
        { id: 5, name: 'バラエティ' },
        { id: 1, name: 'スポーツ' },
        { id: 4, name: '音楽' },
        { id: 2, name: '情報' },
    ];

    async function initOptions() {
        try {
            await channelStore.fetch();
            const [storageRes, configRes] = await Promise.all([
                axios.get('/api/storages').catch(() => ({ data: { items: [] } })),
                axios.get('/api/config').catch(() => ({ data: {} }))
            ]);

            const items = storageRes.data?.items || [];
            storageList = items.map((i: any) => i.name);
            const encList = configRes.data?.encode || [];
            encodeModes = encList.map((e: any) => typeof e === 'string' ? { name: e, suffix: '' } : e);
        } catch (e) {
            console.error('Failed to load options', e);
        }
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
        isGR = s.GR !== false;
        isBS = s.BS !== false;
        isCS = s.CS !== false;
        isSKY = s.SKY !== false;
        selectedChannelIds = Array.isArray(s.channelIds) ? [...s.channelIds] : [];
        selectedGenre = s.genres?.[0]?.lv1 ?? s.genres?.[0]?.genre ?? null;
        isFree = !!s.isFree;
        durationMin = s.durationMin || null;
        durationMax = s.durationMax || null;

        const rOpt = r.reserveOption || {};
        isEnable = rOpt.enable !== false;
        allowEndLack = rOpt.allowEndLack !== false;
        avoidDuplicate = rOpt.avoidDuplicate !== false;
        periodToAvoidDuplicate = rOpt.periodToAvoidDuplicate || null;

        const save = r.saveOption || {};
        parentDirectoryName = save.parentDirectoryName || '';
        directory = save.directory || '';
        recordedFormat = save.recordedFormat || '';

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

    onMount(async () => {
        await initOptions();

        const idParam = router.query['id'];
        if (idParam) {
            ruleId = parseInt(idParam, 10);
            try {
                const res = await axios.get(`/api/rules/${ruleId}?isHalfWidth=true`);
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
                if (q['genre']) selectedGenre = parseInt(q['genre'], 10);
            }
        }
        isLoading = false;
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

    async function handleSave() {
        if (!keyword.trim()) {
            snackbar.open({ text: '検索キーワードを入力してください', color: 'error' });
            return;
        }

        isSaving = true;
        try {
            const payload: any = {
                isTimeSpecification: false,
                searchOption: {
                    keyword: keyword.trim(),
                    keyCS,
                    keyRegExp,
                    name: isName,
                    description: isDescription,
                    extended: isExtended,
                    GR: isGR,
                    BS: isBS,
                    CS: isCS,
                    SKY: isSKY,
                    isFree,
                },
                reserveOption: {
                    enable: isEnable,
                    allowEndLack,
                    avoidDuplicate,
                },
            };

            // 放送局個別指定
            if (selectedChannelIds.length > 0) {
                payload.searchOption.channelIds = selectedChannelIds;
            }

            if (ignoreKeyword.trim()) {
                payload.searchOption.ignoreKeyword = ignoreKeyword.trim();
                payload.searchOption.ignoreKeyCS = ignoreKeyCS;
                payload.searchOption.ignoreKeyRegExp = ignoreKeyRegExp;
                payload.searchOption.ignoreName = isIgnoreName;
                payload.searchOption.ignoreDescription = isIgnoreDescription;
                payload.searchOption.ignoreExtended = isIgnoreExtended;
            }

            if (selectedGenre !== null) {
                payload.searchOption.genres = [{ genre: selectedGenre }];
            }

            if (durationMin !== null && durationMin > 0) payload.searchOption.durationMin = durationMin;
            if (durationMax !== null && durationMax > 0) payload.searchOption.durationMax = durationMax;
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
                await axios.put(`/api/rules/${ruleId}`, payload);
                snackbar.open({ text: `ルール「${keyword}」を更新しました`, color: 'success' });
            } else {
                await axios.post('/api/rules', payload);
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
            <p class="text-xs text-slate-500 dark:text-slate-400">検索条件・予約・保存先・エンコードをまとめて設定します</p>
        </div>
    </div>

    {#if isLoading}
        <div class="flex justify-center py-16">
            <div class="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600"></div>
        </div>
    {:else}
    <form
        onsubmit={(e) => { e.preventDefault(); handleSave(); }}
        class="space-y-5"
    >
        <!-- 1. 検索条件 -->
        <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h2 class="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">
                <Search size={16} class="text-blue-600 dark:text-blue-400" /> 検索条件
            </h2>
            <div class="space-y-4">
                <div>
                    <label for="rule-keyword" class="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">検索キーワード *</label>
                    <input
                        id="rule-keyword"
                        type="text"
                        bind:value={keyword}
                        placeholder="例: 葬送のフリーレン"
                        class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <div class="mt-2 flex flex-wrap items-center gap-4 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        <span>対象項目:</span>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" bind:checked={isName} class="rounded border-slate-300 text-blue-600" /> 番組名
                        </label>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" bind:checked={isDescription} class="rounded border-slate-300 text-blue-600" /> 概要
                        </label>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" bind:checked={isExtended} class="rounded border-slate-300 text-blue-600" /> 詳細・出演者
                        </label>
                        <label class="flex items-center gap-1 cursor-pointer ml-2">
                            <input type="checkbox" bind:checked={keyRegExp} class="rounded border-slate-300 text-blue-600" /> 正規表現
                        </label>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" bind:checked={keyCS} class="rounded border-slate-300 text-blue-600" /> 大小文字区別
                        </label>
                    </div>
                </div>

                <div class="border-t border-slate-100 pt-3 dark:border-slate-800">
                    <label for="rule-ignore-keyword" class="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">除外キーワード (任意)</label>
                    <input
                        id="rule-ignore-keyword"
                        type="text"
                        bind:value={ignoreKeyword}
                        placeholder="例: 再放送 / ダイジェスト"
                        class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <div class="mt-2 flex flex-wrap items-center gap-4 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        <span>除外対象:</span>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" bind:checked={isIgnoreName} class="rounded border-slate-300 text-blue-600" /> 番組名
                        </label>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" bind:checked={isIgnoreDescription} class="rounded border-slate-300 text-blue-600" /> 概要
                        </label>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" bind:checked={isIgnoreExtended} class="rounded border-slate-300 text-blue-600" /> 詳細
                        </label>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <div>
                        <label for="rule-genre" class="block font-bold text-slate-700 dark:text-slate-300 mb-2">ジャンル絞り込み</label>
                        <select
                            id="rule-genre"
                            bind:value={selectedGenre}
                            class="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                            {#each genres as g}
                                <option value={g.id}>{g.name}</option>
                            {/each}
                        </select>
                    </div>
                    <div>
                        <span class="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">番組の長さ (分)</span>
                        <div class="flex items-center gap-2">
                            <input
                                type="number"
                                min="0"
                                bind:value={durationMin}
                                placeholder="最小"
                                class="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            />
                            <span class="text-slate-400">~</span>
                            <input
                                type="number"
                                min="0"
                                bind:value={durationMax}
                                placeholder="最大"
                                class="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            />
                        </div>
                    </div>
                </div>

                <div class="border-t border-slate-100 pt-3 dark:border-slate-800">
                    <label class="flex items-center gap-2 cursor-pointer font-bold text-slate-700 dark:text-slate-300">
                        <input type="checkbox" bind:checked={isFree} class="rounded border-slate-300 text-blue-600" />
                        無料放送のみ録画する
                    </label>
                </div>
            </div>
        </section>

        <!-- 2. 放送波・放送局の指定 -->
        <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div class="flex items-center justify-between mb-4">
                <h2 class="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                    <Tv size={16} class="text-blue-600 dark:text-blue-400" /> 放送波・放送局の指定
                </h2>
                {#if selectedChannelIds.length > 0}
                    <span class="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                        個別指定モード優先中（{selectedChannelIds.length}局）
                    </span>
                {:else}
                    <span class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        放送波一括指定モード
                    </span>
                {/if}
            </div>

            <div class="space-y-4">
                <!-- 放送波一括指定 -->
                <div class="rounded-xl border p-3.5 transition-colors {selectedChannelIds.length > 0
                    ? 'border-slate-200 bg-slate-50/60 opacity-60 dark:border-slate-800 dark:bg-slate-900/40'
                    : 'border-blue-100 bg-blue-50/30 dark:border-blue-950 dark:bg-blue-950/20'}">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-xs text-slate-800 dark:text-slate-200">対象放送波（一括指定）</span>
                                {#if selectedChannelIds.length > 0}
                                    <span class="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded">
                                        ※ 下記で放送局が個別指定されているため無効（スキップ）
                                    </span>
                                {/if}
                            </div>
                            <p class="text-[11px] text-slate-400 mt-0.5">
                                下の放送局を個別指定していない場合に、チェックした放送波の全チャンネルが対象になります
                            </p>
                        </div>

                        <div class="flex items-center gap-4 text-xs font-semibold">
                            <label class="flex items-center gap-1.5 {selectedChannelIds.length > 0 ? 'cursor-not-allowed' : 'cursor-pointer'}">
                                <input
                                    type="checkbox"
                                    bind:checked={isGR}
                                    disabled={selectedChannelIds.length > 0}
                                    class="rounded border-slate-300 text-blue-600 disabled:opacity-50"
                                /> 地デジ (GR)
                            </label>
                            <label class="flex items-center gap-1.5 {selectedChannelIds.length > 0 ? 'cursor-not-allowed' : 'cursor-pointer'}">
                                <input
                                    type="checkbox"
                                    bind:checked={isBS}
                                    disabled={selectedChannelIds.length > 0}
                                    class="rounded border-slate-300 text-blue-600 disabled:opacity-50"
                                /> BS
                            </label>
                            <label class="flex items-center gap-1.5 {selectedChannelIds.length > 0 ? 'cursor-not-allowed' : 'cursor-pointer'}">
                                <input
                                    type="checkbox"
                                    bind:checked={isCS}
                                    disabled={selectedChannelIds.length > 0}
                                    class="rounded border-slate-300 text-blue-600 disabled:opacity-50"
                                /> CS
                            </label>
                        </div>
                    </div>
                </div>

                <!-- 放送局個別指定 -->
                <div class="space-y-3 pt-1">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <div class="flex items-center gap-2">
                                <p class="font-bold text-xs text-slate-800 dark:text-slate-200">対象放送局（個別指定・優先）</p>
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

                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-72 overflow-y-auto border border-slate-100 rounded-xl p-2.5 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
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
                                    <span class="text-[9px] font-black uppercase text-slate-400 block">[{ch.channelType}]</span>
                                    <p class="text-xs font-bold truncate">{ch.name}</p>
                                </div>
                                {#if isSelected}
                                    <div class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                                        <Check size={12} />
                                    </div>
                                {/if}
                            </button>
                        {/each}
                    </div>
                </div>
            </div>
        </section>

        <!-- 3. 予約設定 -->
        <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h2 class="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">
                <CheckCircle2 size={16} class="text-blue-600 dark:text-blue-400" /> 予約設定
            </h2>
            <div class="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40 space-y-3">
                <label class="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" bind:checked={isEnable} class="h-4 w-4 rounded border-slate-300 text-blue-600" />
                    <div>
                        <span class="font-bold text-slate-900 dark:text-slate-100">このルールを有効化する</span>
                        <p class="text-[11px] text-slate-400">チェックを外すと一時的に予約が無効化されます</p>
                    </div>
                </label>

                <label class="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" bind:checked={avoidDuplicate} class="h-4 w-4 rounded border-slate-300 text-blue-600" />
                    <div>
                        <span class="font-bold text-slate-900 dark:text-slate-100">重複録画を回避する (二重録画防止)</span>
                        <p class="text-[11px] text-slate-400">過去に録画済みの同一番組（同タイトル・話数）をスキップします</p>
                    </div>
                </label>

                <label class="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" bind:checked={allowEndLack} class="h-4 w-4 rounded border-slate-300 text-blue-600" />
                    <div>
                        <span class="font-bold text-slate-900 dark:text-slate-100">末尾切れを許可する</span>
                        <p class="text-[11px] text-slate-400">チューナー競合時に前後の番組が重なっても録画を許可します</p>
                    </div>
                </label>
            </div>
        </section>

        <!-- 4. 保存先ストレージ -->
        <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
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
                    <p class="mt-1 text-[11px] text-slate-400">EPGStation に登録されている保存先ストレージを指定します</p>
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
                    <p class="mt-1 text-[11px] text-slate-400">指定したフォルダの中に録画ファイルが保存されます（階層作成可）</p>
                </div>

                <div>
                    <label for="rule-filename-format" class="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                        ファイル名フォーマット (recordedFormat)
                    </label>
                    <input
                        id="rule-filename-format"
                        type="text"
                        bind:value={recordedFormat}
                        placeholder="例: %YEAR%-%MONTH%-%DAY%_%TITLE%_%EPISODE%"
                        class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <p class="mt-1 text-[11px] text-slate-400">空欄の場合は config.yml のデフォルトファイル名フォーマットが使用されます</p>
                </div>
            </div>
        </section>

        <!-- 5. 自動エンコード設定 -->
        <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h2 class="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">
                <Sparkles size={16} class="text-blue-600 dark:text-blue-400" /> 自動エンコード設定
            </h2>
            <div class="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <label class="flex items-center gap-2.5 cursor-pointer mb-4">
                    <input type="checkbox" bind:checked={isDeleteOriginalAfterEncode} class="h-4 w-4 rounded border-slate-300 text-rose-600" />
                    <div>
                        <span class="font-bold text-rose-700 dark:text-rose-400">エンコード完了後に元 TS ファイルを自動削除</span>
                        <p class="text-[11px] text-slate-400">ディスク容量を節約するため、エンコード成功後に元の巨大な TS ファイルを削除します</p>
                    </div>
                </label>

                <!-- エンコード設定 1 -->
                <div class="space-y-3 border-t border-slate-200/60 pt-3 dark:border-slate-700/60">
                    <p class="font-bold text-slate-800 dark:text-slate-200">エンコード設定 1</p>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                            <label for="rule-enc-mode1" class="block text-[11px] text-slate-500 mb-1">プリセット</label>
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
                            <label for="rule-enc-storage1" class="block text-[11px] text-slate-500 mb-1">保存先ストレージ</label>
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
                            <label for="rule-enc-dir1" class="block text-[11px] text-slate-500 mb-1">サブディレクトリ</label>
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
                            <label for="rule-enc-mode2" class="block text-[11px] text-slate-500 mb-1">プリセット</label>
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
                            <label for="rule-enc-storage2" class="block text-[11px] text-slate-500 mb-1">保存先ストレージ</label>
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
                            <label for="rule-enc-dir2" class="block text-[11px] text-slate-500 mb-1">サブディレクトリ</label>
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
                            <label for="rule-enc-mode3" class="block text-[11px] text-slate-500 mb-1">プリセット</label>
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
                            <label for="rule-enc-storage3" class="block text-[11px] text-slate-500 mb-1">保存先ストレージ</label>
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
                            <label for="rule-enc-dir3" class="block text-[11px] text-slate-500 mb-1">サブディレクトリ</label>
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
        <div class="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <button
                type="button"
                onclick={() => router.push('/rule')}
                class="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer"
            >
                キャンセル
            </button>
            <button
                type="submit"
                disabled={isSaving}
                class="flex items-center gap-1.5 rounded-xl bg-blue-600 px-6 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
            >
                <Save size={15} />
                {ruleId ? 'ルールを更新する' : '新規ルールを作成する'}
            </button>
        </div>
    </form>
    {/if}
</div>