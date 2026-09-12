<script lang="ts">
    import { onMount, untrack } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { confirmDialog } from '../lib/stores/confirm.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { readOnlyStore } from '../lib/stores/readOnly.svelte';
    import http from '@/lib/httpClient';
    import type * as apid from '../../../api';
    import { getGenreName, getGenreBadgeClass, getChannelTypeBadgeClass } from '../lib/utils/format';
    import {
        SlidersHorizontal,
        Plus,
        Trash2,
        Folder,
        CheckCircle2,
        Edit3,
        HardDrive,
        Sparkles,
        Power,
        Layers,
        AlertCircle,
        Tv,
        Lock,
        ListVideo,
        Search,
        X,
    } from '@lucide/svelte';

    let rules = $state<apid.Rule[]>([]);
    let total = $state(0);
    let totalAllRules = $state(0);
    let isLoading = $state(true);
    let ruleReservesMap = $state<Record<number, number>>({});

    let keyword = $state(router.current.query.keyword || '');
    let activeKeyword = $state(router.current.query.keyword || '');

    async function fetchRules(kw: string = activeKeyword) {
        isLoading = true;
        try {
            const params: Record<string, any> = {
                limit: 100,
                isHalfWidth: true,
                type: 'all',
            };
            const trimmed = kw.trim();
            if (trimmed) {
                params.keyword = trimmed;
            }

            const [rulesRes, reservesRes] = await Promise.all([
                http.get('/api/rules', { params }),
                Object.keys(ruleReservesMap).length === 0
                    ? http.get('/api/reserves?limit=1000&isHalfWidth=true').catch(() => ({ data: { reserves: [] } }))
                    : Promise.resolve(null),
            ]);

            rules = rulesRes.data.rules || [];
            total = rulesRes.data.total || 0;
            if (!trimmed) {
                totalAllRules = total;
            } else if (totalAllRules === 0) {
                // 初回アクセス時にキーワード付きで開かれた場合、全件数を非同期で取得
                http.get('/api/rules?limit=1&isHalfWidth=true')
                    .then(res => {
                        totalAllRules = res.data.total || 0;
                    })
                    .catch(() => {});
            }

            // ルールIDごとの予約数を集計
            if (reservesRes?.data?.reserves) {
                const counts: Record<number, number> = {};
                for (const res of reservesRes.data.reserves) {
                    if (res.ruleId) {
                        counts[res.ruleId] = (counts[res.ruleId] || 0) + 1;
                    }
                }
                ruleReservesMap = counts;
            }
        } catch (e) {
            console.error('Fetch rules error', e);
            snackbar.open({ text: 'ルール一覧の取得に失敗しました', color: 'error' });
        } finally {
            isLoading = false;
        }
    }

    let isInitialized = false;

    $effect(() => {
        if (!readOnlyStore.canViewRules) {
            router.replace('/recorded');
            return;
        }

        const qKeyword = router.current.query.keyword || '';

        untrack(() => {
            if (!isInitialized) {
                isInitialized = true;
                keyword = qKeyword;
                activeKeyword = qKeyword;
                fetchRules(qKeyword);
                return;
            }

            if (qKeyword !== activeKeyword) {
                keyword = qKeyword;
                activeKeyword = qKeyword;
                fetchRules(qKeyword);
            }
        });
    });

    function handleSearch() {
        const trimmed = keyword.trim();
        activeKeyword = trimmed;
        router.setQuery({ keyword: trimmed || null });
        fetchRules(trimmed);
    }

    function clearSearch() {
        keyword = '';
        activeKeyword = '';
        router.setQuery({ keyword: null });
        fetchRules('');
    }

    function onInputKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            clearSearch();
        }
    }

    function onInput(e: Event) {
        const target = e.target as HTMLInputElement;
        if (target.value === '' && activeKeyword !== '') {
            clearSearch();
        }
    }

    // 新規作成ページへ遷移
    function goCreateRule() {
        router.push('/rule/edit');
    }

    // 編集ページへ遷移
    function goEditRule(rule: apid.Rule) {
        router.push(`/rule/edit?ruleId=${rule.id}`);
    }

    // 有効 / 無効トグル
    async function toggleRuleEnable(rule: apid.Rule, event: Event) {
        event.stopPropagation();
        const isEnable = !rule.reserveOption?.enable;
        try {
            if (isEnable) {
                await http.put(`/api/rules/${rule.id}/enable`);
            } else {
                await http.put(`/api/rules/${rule.id}/disable`);
            }
            rule.reserveOption.enable = isEnable;
            snackbar.open({ text: `ルールを${isEnable ? '有効' : '無効'}にしました`, color: 'success' });
        } catch (e) {
            console.error('Toggle rule error', e);
            snackbar.open({ text: 'ルールの更新に失敗しました', color: 'error' });
        }
    }

    // ルール削除
    async function deleteRule(rule: apid.Rule, event: Event) {
        event.stopPropagation();
        const kw = rule.searchOption?.keyword || `#${rule.id}`;
        const ok = await confirmDialog({
            title: 'ルールの削除',
            message: `ルール「${kw}」を削除しますか？`,
            confirmText: '削除',
            cancelText: 'キャンセル',
            isDestructive: true,
        });
        if (!ok) return;

        try {
            await http.delete(`/api/rules/${rule.id}`);
            snackbar.open({ text: 'ルールを削除しました', color: 'success' });
            if (totalAllRules > 0) totalAllRules--;
            fetchRules(activeKeyword);
        } catch (e) {
            console.error('Delete rule error', e);
            snackbar.open({ text: 'ルールの削除に失敗しました', color: 'error' });
        }
    }

    function formatGenreLabel(genreId?: number): string {
        return genreId !== undefined && genreId !== null ? getGenreName(genreId) : 'すべて';
    }
</script>

{#if !readOnlyStore.canViewRules}
    <div
        class="flex flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50/50 p-8 text-center dark:border-amber-950/60 dark:bg-amber-950/20"
    >
        <Lock size={32} class="text-amber-500 mb-2" />
        <h3 class="text-sm font-bold text-slate-800 dark:text-slate-200">閲覧専用モード</h3>
        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
            ルール一覧の閲覧は制限されています。録画一覧へリダイレクトします...
        </p>
        <button type="button" onclick={() => router.replace('/recorded')} class="btn-secondary mt-4 cursor-pointer">
            録画一覧へ
        </button>
    </div>
{:else}
    <div class="space-y-5 w-full max-w-full min-w-0">
        <!-- ヘッダーツールバー -->
        <div
            class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
        >
            <div>
                <h1 class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                    <SlidersHorizontal size={20} class="text-blue-600 dark:text-blue-400" />
                    ルール一覧
                </h1>
                <div class="flex items-center gap-2 flex-wrap mt-0.5">
                    <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                        {#if activeKeyword}
                            絞り込み結果: <span class="font-bold text-slate-800 dark:text-slate-200">{total}</span>
                            件
                            {#if totalAllRules > 0}
                                <span class="text-slate-400">（全 {totalAllRules} 件）</span>
                            {/if}
                        {:else}
                            登録済みルール: <span class="font-bold text-slate-800 dark:text-slate-200">{total}</span>
                            件
                        {/if}
                    </p>
                    {#if activeKeyword}
                        <span
                            class="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        >
                            <Search size={12} class="text-blue-500" />
                            <span class="max-w-[120px] sm:max-w-[180px] truncate">{activeKeyword}</span>
                            <button
                                type="button"
                                onclick={clearSearch}
                                class="hover:text-blue-900 dark:hover:text-white cursor-pointer ml-0.5"
                                title="絞り込みを解除"
                                aria-label="絞り込みを解除"
                            >
                                <X size={12} />
                            </button>
                        </span>
                    {/if}
                </div>
            </div>

            <div class="flex items-center gap-2.5 w-full sm:w-auto">
                <!-- 検索フォーム -->
                <form
                    onsubmit={e => {
                        e.preventDefault();
                        handleSearch();
                    }}
                    class="relative flex-1 sm:w-64"
                >
                    <input
                        type="text"
                        bind:value={keyword}
                        onkeydown={onInputKeydown}
                        oninput={onInput}
                        placeholder="ルールを検索..."
                        aria-label="ルールをキーワードで絞り込み"
                        class="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 transition"
                    />
                    <Search
                        size={16}
                        class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    {#if keyword}
                        <button
                            type="button"
                            onclick={clearSearch}
                            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
                            title="検索をクリア"
                            aria-label="検索をクリア"
                        >
                            <X size={14} />
                        </button>
                    {/if}
                </form>

                {#if !readOnlyStore.isReadOnly}
                    <button
                        type="button"
                        onclick={goCreateRule}
                        class="btn-primary flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                        <Plus size={16} />
                        <span class="hidden sm:inline">新規ルール作成</span>
                        <span class="sm:hidden">新規作成</span>
                    </button>
                {/if}
            </div>
        </div>

        <!-- ルール一覧テーブル -->
        {#if isLoading}
            <div
                class="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
                <p class="text-sm font-medium text-slate-400">ルール一覧を取得中...</p>
            </div>
        {:else if rules.length === 0}
            {#if activeKeyword}
                <div
                    class="flex h-64 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900"
                >
                    <Search size={36} class="text-slate-300 dark:text-slate-600" />
                    <p class="mt-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                        「{activeKeyword}」に一致するルールは見つかりませんでした
                    </p>
                    <p class="mt-1 text-xs text-slate-400">キーワードを変更するか、絞り込みを解除してください</p>
                    <button type="button" onclick={clearSearch} class="btn-secondary mt-3 cursor-pointer">
                        絞り込みを解除
                    </button>
                </div>
            {:else}
                <div
                    class="flex h-64 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900"
                >
                    <SlidersHorizontal size={36} class="text-slate-300 dark:text-slate-600" />
                    <p class="mt-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                        登録されたルールはありません
                    </p>
                    <button type="button" onclick={goCreateRule} class="btn-primary mt-3 cursor-pointer">
                        最初のルールを作成する
                    </button>
                </div>
            {/if}
        {:else}
            <!-- モバイル表示: カード型ルールリスト (md:hidden) -->
            <div class="space-y-3 md:hidden">
                {#each rules as r}
                    {@const isEnabled = r.reserveOption?.enable !== false}
                    {@const opt = r.searchOption || {}}
                    {@const save = r.saveOption}
                    {@const enc = r.encodeOption}
                    {@const genreId = opt.genres?.[0]?.genre}
                    <div
                        role="button"
                        tabindex="0"
                        onclick={() => goEditRule(r)}
                        onkeydown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                goEditRule(r);
                            }
                        }}
                        class="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 cursor-pointer {isEnabled
                            ? ''
                            : 'opacity-60 bg-slate-50/50 dark:bg-slate-900/40'}"
                    >
                        <!-- 1行目: スイッチ + キーワード + 予約数バッジ -->
                        <div class="flex items-center justify-between gap-2">
                            <div class="flex items-center gap-2.5 min-w-0">
                                <!-- 有効/無効スイッチ -->
                                {#if !readOnlyStore.isReadOnly}
                                    <button
                                        type="button"
                                        onclick={e => toggleRuleEnable(r, e)}
                                        class="shrink-0 inline-flex items-center justify-center rounded-full p-1.5 transition cursor-pointer {isEnabled
                                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                                            : 'bg-slate-200 text-slate-500 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400'}"
                                        title={isEnabled ? 'クリックして無効化' : 'クリックして有効化'}
                                    >
                                        <Power size={14} />
                                    </button>
                                {:else}
                                    <span
                                        class="shrink-0 inline-flex items-center justify-center rounded-full p-1.5 {isEnabled
                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                            : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}"
                                    >
                                        <Power size={14} />
                                    </span>
                                {/if}

                                <span class="font-bold text-slate-900 dark:text-slate-100 text-sm truncate">
                                    {opt.keyword || '(全番組)'}
                                </span>
                            </div>

                            <!-- 予約数バッジ -->
                            <div class="shrink-0">
                                {#if (r.reservesCnt ?? ruleReservesMap[r.id] ?? 0) > 0}
                                    <span
                                        class="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60"
                                    >
                                        {r.reservesCnt ?? ruleReservesMap[r.id] ?? 0} 件
                                    </span>
                                {:else}
                                    <span class="text-xs text-slate-400 font-medium">0 件</span>
                                {/if}
                            </div>
                        </div>

                        <!-- 2行目: 検索条件タグ・除外キーワード -->
                        <div class="mt-2.5 flex items-center gap-1.5 flex-wrap text-xs">
                            {#if opt.keyRegExp}
                                <span
                                    class="rounded-md bg-purple-100 px-1.5 py-0.5 font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                                >
                                    正規表現
                                </span>
                            {/if}
                            {#if opt.keyCS}
                                <span
                                    class="rounded-md bg-blue-100 px-1.5 py-0.5 font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                >
                                    大小区別
                                </span>
                            {/if}

                            <!-- ジャンル -->
                            {#if genreId !== undefined}
                                <span class="rounded-md px-1.5 py-0.5 font-bold {getGenreBadgeClass(genreId)}">
                                    {getGenreName(genreId)}
                                </span>
                            {/if}

                            <!-- 放送波 / 放送局 -->
                            {#if opt.channelIds && opt.channelIds.length > 0}
                                <span
                                    class="rounded-md bg-indigo-50 px-1.5 py-0.5 font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/60 flex items-center gap-1"
                                >
                                    <Tv size={10} />
                                    {channelStore.getChannelName(opt.channelIds[0])}
                                    {#if opt.channelIds.length > 1}
                                        <span>+{opt.channelIds.length - 1}</span>
                                    {/if}
                                </span>
                            {:else}
                                {#if opt.GR !== false}<span
                                        class="rounded-md px-1.5 py-0.5 font-bold {getChannelTypeBadgeClass('GR')}"
                                    >
                                        地デジ
                                    </span>{/if}
                                {#if opt.BS !== false}<span
                                        class="rounded-md px-1.5 py-0.5 font-bold {getChannelTypeBadgeClass('BS')}"
                                    >
                                        BS
                                    </span>{/if}
                                {#if opt.CS !== false}<span
                                        class="rounded-md px-1.5 py-0.5 font-bold {getChannelTypeBadgeClass('CS')}"
                                    >
                                        CS
                                    </span>{/if}
                            {/if}

                            <!-- エンコード -->
                            {#if enc?.mode1}
                                <span
                                    class="rounded-md bg-amber-50 px-1.5 py-0.5 font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60"
                                >
                                    {enc.mode1}
                                </span>
                            {/if}
                            {#if enc?.isDeleteOriginalAfterEncode}
                                <span
                                    class="rounded-md bg-rose-50 px-1.5 py-0.5 font-bold text-rose-600 dark:bg-rose-950 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60"
                                >
                                    TS削除
                                </span>
                            {/if}
                        </div>

                        {#if opt.ignoreKeyword}
                            <p class="mt-1.5 text-xs text-rose-600 dark:text-rose-400 truncate">
                                除外: {opt.ignoreKeyword}
                            </p>
                        {/if}

                        <!-- 3行目: 保存先 & アクションボタン -->
                        <div
                            class="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between"
                        >
                            <div class="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[60%]">
                                {#if save?.parentDirectoryName || save?.directory}
                                    <span class="flex items-center gap-1 truncate">
                                        <Folder size={12} class="shrink-0 text-amber-500" />
                                        <span class="truncate">
                                            {save.parentDirectoryName || ''}/{save.directory || ''}
                                        </span>
                                    </span>
                                {:else}
                                    <span class="text-slate-400">デフォルト保存先</span>
                                {/if}
                            </div>

                            <div class="flex items-center gap-2">
                                <!-- 録画一覧ボタン -->
                                <button
                                    type="button"
                                    onclick={e => {
                                        e.stopPropagation();
                                        router.push(`/recorded?ruleId=${r.id}`);
                                    }}
                                    class="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:bg-blue-950/60 dark:hover:text-blue-400 transition-colors shadow-2xs cursor-pointer shrink-0"
                                    title="このルールの録画一覧を表示"
                                    aria-label="このルールの録画一覧を表示"
                                >
                                    <ListVideo size={14} class="text-blue-500 dark:text-blue-400" />
                                    <span>録画一覧</span>
                                </button>

                                {#if !readOnlyStore.isReadOnly}
                                    <button
                                        type="button"
                                        onclick={e => {
                                            e.stopPropagation();
                                            goEditRule(r);
                                        }}
                                        class="btn-secondary flex h-8 min-h-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold cursor-pointer shrink-0"
                                        title="ルールを編集"
                                    >
                                        <Edit3 size={13} /> 編集
                                    </button>

                                    <div class="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

                                    <button
                                        type="button"
                                        onclick={e => deleteRule(r, e)}
                                        class="btn-danger flex h-8 w-8 min-h-0 items-center justify-center rounded-lg p-0 cursor-pointer shrink-0"
                                        title="削除"
                                    >
                                        <Trash2 size={14} />
                                    </button>
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
                            class="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400"
                        >
                            <tr>
                                <th class="px-4 py-3.5 text-center w-16">状態</th>
                                <th class="px-4 py-3.5">検索キーワード / 条件</th>
                                <th class="px-4 py-3.5">対象局 / ジャンル</th>
                                <th class="px-4 py-3.5">保存先ストレージ / フォルダ</th>
                                <th class="px-4 py-3.5">エンコード</th>
                                <th class="px-4 py-3.5 text-center">予約数</th>
                                <th class="px-4 py-3.5 text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                            {#each rules as r}
                                {@const isEnabled = r.reserveOption?.enable !== false}
                                {@const opt = r.searchOption || {}}
                                {@const save = r.saveOption}
                                {@const enc = r.encodeOption}
                                {@const genreId = opt.genres?.[0]?.genre}
                                <tr
                                    onclick={() => goEditRule(r)}
                                    class="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer {isEnabled
                                        ? ''
                                        : 'opacity-60 bg-slate-50/50 dark:bg-slate-900/40'}"
                                >
                                    <!-- 有効/無効スイッチ -->
                                    <td class="px-4 py-3.5 text-center">
                                        {#if !readOnlyStore.isReadOnly}
                                            <button
                                                type="button"
                                                onclick={e => toggleRuleEnable(r, e)}
                                                class="inline-flex items-center justify-center rounded-full p-1.5 transition cursor-pointer {isEnabled
                                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900'
                                                    : 'bg-slate-200 text-slate-500 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-300'}"
                                                title={isEnabled ? 'クリックして無効化' : 'クリックして有効化'}
                                            >
                                                <Power size={14} />
                                            </button>
                                        {:else}
                                            <span
                                                class="inline-flex items-center justify-center rounded-full p-1.5 {isEnabled
                                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                                    : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}"
                                            >
                                                <Power size={14} />
                                            </span>
                                        {/if}
                                    </td>

                                    <!-- キーワード / 検索条件 -->
                                    <td class="px-4 py-3.5">
                                        <div class="flex items-center gap-1.5 flex-wrap">
                                            <span
                                                class="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base"
                                            >
                                                {opt.keyword || '(全番組)'}
                                            </span>
                                            {#if opt.keyRegExp}
                                                <span
                                                    class="rounded-md bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                                                >
                                                    正規表現
                                                </span>
                                            {/if}
                                            {#if opt.keyCS}
                                                <span
                                                    class="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                                >
                                                    大小区別
                                                </span>
                                            {/if}
                                        </div>

                                        {#if opt.ignoreKeyword}
                                            <p
                                                class="mt-1 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1"
                                            >
                                                除外: {opt.ignoreKeyword}
                                            </p>
                                        {/if}

                                        <div class="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                                            <span>対象:</span>
                                            {#if opt.name !== false}<span
                                                    class="rounded-md bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium"
                                                >
                                                    番組名
                                                </span>{/if}
                                            {#if opt.description !== false}<span
                                                    class="rounded-md bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium"
                                                >
                                                    概要
                                                </span>{/if}
                                            {#if opt.extended}<span
                                                    class="rounded-md bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium"
                                                >
                                                    詳細
                                                </span>{/if}
                                        </div>
                                    </td>

                                    <!-- 対象局 / ジャンル -->
                                    <td class="px-4 py-3.5">
                                        {#if opt.channelIds && opt.channelIds.length > 0}
                                            <div class="flex items-center gap-1.5 flex-wrap">
                                                <span
                                                    class="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/60 flex items-center gap-1"
                                                >
                                                    <Tv size={12} />
                                                    {channelStore.getChannelName(opt.channelIds[0])}
                                                    {#if opt.channelIds.length > 1}
                                                        <span class="text-xs font-normal opacity-80">
                                                            (他{opt.channelIds.length - 1}局)
                                                        </span>
                                                    {/if}
                                                </span>
                                            </div>
                                        {:else}
                                            <div class="flex items-center gap-1.5 flex-wrap">
                                                {#if opt.GR !== false}<span
                                                        class="rounded-md px-2 py-0.5 text-xs font-bold {getChannelTypeBadgeClass(
                                                            'GR',
                                                        )}"
                                                    >
                                                        地デジ
                                                    </span>{/if}
                                                {#if opt.BS !== false}<span
                                                        class="rounded-md px-2 py-0.5 text-xs font-bold {getChannelTypeBadgeClass(
                                                            'BS',
                                                        )}"
                                                    >
                                                        BS
                                                    </span>{/if}
                                                {#if opt.CS !== false}<span
                                                        class="rounded-md px-2 py-0.5 text-xs font-bold {getChannelTypeBadgeClass(
                                                            'CS',
                                                        )}"
                                                    >
                                                        CS
                                                    </span>{/if}
                                            </div>
                                        {/if}
                                        <div class="mt-1.5">
                                            {#if genreId !== undefined && genreId !== null}
                                                <span
                                                    class="inline-block rounded-md px-2 py-0.5 text-xs font-bold {getGenreBadgeClass(
                                                        genreId,
                                                    )}"
                                                >
                                                    {formatGenreLabel(genreId)}
                                                </span>
                                            {:else}
                                                <span class="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                                    全ジャンル
                                                </span>
                                            {/if}
                                        </div>
                                    </td>

                                    <!-- 保存先ストレージ / ディレクトリ -->
                                    <td class="px-4 py-3.5">
                                        <div
                                            class="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 text-xs sm:text-sm"
                                        >
                                            <HardDrive size={14} class="text-slate-400 shrink-0" />
                                            <span class="font-bold">{save?.parentDirectoryName || 'デフォルト'}</span>
                                        </div>
                                        {#if save?.directory}
                                            <p
                                                class="mt-1 text-xs text-slate-400 flex items-center gap-1 truncate max-w-xs"
                                            >
                                                <Folder size={12} />
                                                {save.directory}
                                            </p>
                                        {/if}
                                    </td>

                                    <!-- エンコード設定 -->
                                    <td class="px-4 py-3.5">
                                        {#if enc?.mode1 || enc?.mode2 || enc?.mode3}
                                            <div class="flex items-center gap-1.5 flex-wrap">
                                                {#if enc.mode1}
                                                    <span
                                                        class="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60"
                                                    >
                                                        {enc.mode1}
                                                    </span>
                                                {/if}
                                                {#if enc.mode2}
                                                    <span
                                                        class="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60"
                                                    >
                                                        {enc.mode2}
                                                    </span>
                                                {/if}
                                                {#if enc.isDeleteOriginalAfterEncode}
                                                    <span
                                                        class="rounded-md bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-600 dark:bg-rose-950 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60"
                                                    >
                                                        TS削除
                                                    </span>
                                                {/if}
                                            </div>
                                        {:else}
                                            <span class="text-slate-400 text-xs">TSのみ</span>
                                        {/if}
                                    </td>

                                    <!-- 予約数 -->
                                    <td class="px-4 py-3.5 text-center font-bold">
                                        {#if (r.reservesCnt ?? ruleReservesMap[r.id] ?? 0) > 0}
                                            <span
                                                class="inline-flex items-center justify-center rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60"
                                            >
                                                {r.reservesCnt ?? ruleReservesMap[r.id] ?? 0} 件
                                            </span>
                                        {:else}
                                            <span class="text-xs text-slate-400 font-medium">0 件</span>
                                        {/if}
                                    </td>

                                    <!-- 操作ボタン -->
                                    <td class="px-4 py-3.5 text-right">
                                        <div class="flex items-center justify-end gap-2">
                                            <!-- 録画一覧ボタン -->
                                            <button
                                                type="button"
                                                onclick={e => {
                                                    e.stopPropagation();
                                                    router.push(`/recorded?ruleId=${r.id}`);
                                                }}
                                                class="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:bg-blue-950/60 dark:hover:text-blue-400 transition-colors shadow-2xs cursor-pointer shrink-0"
                                                title="このルールの録画一覧を表示"
                                                aria-label="このルールの録画一覧を表示"
                                            >
                                                <ListVideo size={14} class="text-blue-500 dark:text-blue-400" />
                                                <span>録画一覧</span>
                                            </button>

                                            <!-- 編集ボタン -->
                                            {#if !readOnlyStore.isReadOnly}
                                                <button
                                                    type="button"
                                                    onclick={e => {
                                                        e.stopPropagation();
                                                        goEditRule(r);
                                                    }}
                                                    class="btn-secondary flex h-8 min-h-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold cursor-pointer shrink-0"
                                                    title="ルールを編集"
                                                >
                                                    <Edit3 size={13} /> 編集
                                                </button>

                                                <div class="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

                                                <!-- 削除ボタン -->
                                                <button
                                                    type="button"
                                                    onclick={e => deleteRule(r, e)}
                                                    class="btn-danger flex h-8 w-8 min-h-0 items-center justify-center rounded-lg p-0 cursor-pointer shrink-0"
                                                    title="削除"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
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
{/if}
