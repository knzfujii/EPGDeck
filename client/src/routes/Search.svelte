<script lang="ts">
    import { onMount, untrack } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { readOnlyStore } from '../lib/stores/readOnly.svelte';
    import api from '@/lib/apiClient';
    import type * as apid from '../../../api';
    import { getChannelTypeBadgeClass, extractFirstSearchWord } from '../lib/utils/format';
    import { Search as SearchIcon, Plus, Lock, CalendarPlus, Check, Loader2, Sparkles } from '@lucide/svelte';

    let keyword = $state(router.current.query.keyword || '');
    let searchResults = $state<apid.ScheduleProgramItem[]>([]);
    let isLoading = $state(false);
    let hasSearched = $state(false);
    let reservingProgramId = $state<number | null>(null);
    let reservedProgramIds = $state<Set<number>>(new Set());

    $effect(() => {
        if (!readOnlyStore.canViewSearch) {
            router.replace('/recorded');
        }
    });

    // 検索オプション
    let isName = $state(true);
    let isDescription = $state(true);
    let selectedGenre = $state<number | null>(null);

    let isInitialized = false;

    $effect(() => {
        const q = router.current.query;
        const qKeyword = q.keyword || '';
        const qGenre = q.genre ? parseInt(q.genre, 10) : null;
        const qName = q.name !== '0';
        const qDesc = q.description !== '0';

        untrack(() => {
            if (!isInitialized) {
                isInitialized = true;
                keyword = qKeyword;
                selectedGenre = Number.isNaN(qGenre) ? null : qGenre;
                isName = qName;
                isDescription = qDesc;
                if (keyword.trim()) {
                    executeSearch({ replace: true });
                }
                return;
            }

            let hasChanged = false;
            if (qKeyword !== keyword) {
                keyword = qKeyword;
                hasChanged = true;
            }
            if (qGenre !== selectedGenre) {
                selectedGenre = Number.isNaN(qGenre) ? null : qGenre;
                hasChanged = true;
            }
            if (qName !== isName) {
                isName = qName;
                hasChanged = true;
            }
            if (qDesc !== isDescription) {
                isDescription = qDesc;
                hasChanged = true;
            }

            if (hasChanged && keyword.trim()) {
                executeSearch({ replace: true });
            } else if (hasChanged && !keyword.trim()) {
                searchResults = [];
                hasSearched = false;
            }
        });
    });

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

    async function fetchExistingReserves() {
        try {
            const res = await api.reserves.$get({ query: { isHalfWidth: true as any, limit: 1000 as any } });
            if (res.ok) {
                const data = await res.json();
                const ids = new Set<number>();
                for (const r of (data as any).reserves || []) {
                    if (r.programId) ids.add(r.programId);
                }
                reservedProgramIds = ids;
            }
        } catch (e) {
            console.error('Failed to fetch reserves', e);
        }
    }

    async function executeSearch(options: { replace?: boolean } = { replace: false }) {
        if (!keyword.trim()) return;

        router.setQuery(
            {
                keyword: keyword.trim(),
                genre: selectedGenre,
                name: !isName ? '0' : null,
                description: !isDescription ? '0' : null,
            },
            options,
        );

        isLoading = true;
        hasSearched = true;
        try {
            await Promise.all([channelStore.fetch(), fetchExistingReserves()]);
            const res = await api.schedules.search.$post({
                json: {
                    option: {
                        keyword: keyword.trim(),
                        name: isName,
                        description: isDescription,
                        genres: selectedGenre !== null ? [{ lv1: selectedGenre }] : [],
                    },
                    isHalfWidth: true,
                    limit: 100,
                } as any,
            });
            if (res.ok) {
                searchResults = ((await res.json()) as any) || [];
            }
        } catch (e) {
            console.error('Search error', e);
            snackbar.open({ text: '検索に失敗しました', color: 'error' });
        } finally {
            isLoading = false;
        }
    }

    async function reserveProgram(program: apid.ScheduleProgramItem) {
        if (readOnlyStore.isReadOnly) return;
        reservingProgramId = program.id;
        try {
            const res = await api.reserves.$post({
                json: {
                    programId: program.id,
                } as any,
            });
            if (!res.ok) {
                const errData = (await res.json().catch(() => ({}))) as any;
                throw new Error(errData?.message || '予約の登録に失敗しました');
            }
            const nextSet = new Set(reservedProgramIds);
            nextSet.add(program.id);
            reservedProgramIds = nextSet;
            snackbar.open({ text: `「${program.name}」を予約しました`, color: 'success' });
        } catch (e: any) {
            console.error('Failed to reserve program', e);
            const msg = e.message || '予約の登録に失敗しました';
            snackbar.open({ text: msg, color: 'error' });
        } finally {
            reservingProgramId = null;
        }
    }

    onMount(() => {
        if (!readOnlyStore.canViewSearch) {
            router.replace('/recorded');
            return;
        }
        fetchExistingReserves();
    });

    function openCreateRuleModal() {
        if (!keyword.trim()) return;
        const params = new URLSearchParams({
            keyword: keyword.trim(),
            name: isName ? '1' : '0',
            description: isDescription ? '1' : '0',
        });
        if (selectedGenre !== null) params.set('genre', String(selectedGenre));
        router.push(`/rule/edit?${params.toString()}`);
    }

    function openCreateRuleWithProgram(program: apid.ScheduleProgramItem) {
        const extractedKeyword = extractFirstSearchWord(program.name);
        const params = new URLSearchParams({
            keyword: extractedKeyword,
            name: '1',
            description: '0',
        });
        if (program.genre1 !== null && typeof program.genre1 !== 'undefined') {
            params.set('genre', String(program.genre1));
        }
        router.push(`/rule/edit?${params.toString()}`);
    }

    function formatTime(timestamp: number): string {
        const d = new Date(timestamp);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }

    function formatDate(timestamp: number): string {
        const d = new Date(timestamp);
        return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} (${['日', '月', '火', '水', '木', '金', '土'][d.getDay()]}) ${formatTime(timestamp)}`;
    }
</script>

{#if !readOnlyStore.canViewSearch}
    <div
        class="flex flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50/50 p-8 text-center dark:border-amber-950/60 dark:bg-amber-950/20"
    >
        <Lock size={32} class="text-amber-500 mb-2" />
        <h3 class="text-sm font-bold text-slate-800 dark:text-slate-200">閲覧専用モード</h3>
        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
            番組検索の利用は制限されています。録画一覧へリダイレクトします...
        </p>
        <button
            type="button"
            onclick={() => router.replace('/recorded')}
            class="btn-secondary h-10 px-5 text-sm font-bold mt-4 cursor-pointer"
        >
            録画一覧へ
        </button>
    </div>
{:else}
    <div class="space-y-5 w-full max-w-full min-w-0">
        <!-- 検索バー & 条件フォーム -->
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h1 class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                <SearchIcon size={20} class="text-blue-600 dark:text-blue-400" />
                番組検索
            </h1>

            <form
                onsubmit={e => {
                    e.preventDefault();
                    executeSearch();
                }}
                class="mt-4 space-y-4"
            >
                <div class="flex gap-2">
                    <input
                        type="text"
                        bind:value={keyword}
                        placeholder="番組名やキーワードを入力..."
                        class="form-input flex-1 h-11 text-sm sm:text-base rounded-xl"
                    />
                    <button
                        type="submit"
                        class="btn-primary flex items-center gap-2 h-11 px-6 text-sm sm:text-base font-bold cursor-pointer"
                    >
                        <SearchIcon size={18} /> 検索
                    </button>
                </div>

                <!-- オプション行 -->
                <div
                    class="flex flex-wrap items-center justify-between gap-3 sm:gap-4 text-sm font-bold text-slate-700 dark:text-slate-300"
                >
                    <div class="flex flex-wrap items-center gap-4 sm:gap-5">
                        <label class="flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
                            <input type="checkbox" bind:checked={isName} class="form-checkbox" />
                            <span>番組名</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
                            <input type="checkbox" bind:checked={isDescription} class="form-checkbox" />
                            <span>番組概要</span>
                        </label>

                        <div class="flex items-center gap-2 whitespace-nowrap shrink-0">
                            <span class="text-slate-600 dark:text-slate-400 whitespace-nowrap">ジャンル:</span>
                            <select bind:value={selectedGenre} class="h-10 form-select py-1.5 px-3 text-sm rounded-xl">
                                {#each genres as g}
                                    <option value={g.id}>{g.name}</option>
                                {/each}
                            </select>
                        </div>
                    </div>

                    {#if keyword.trim() && !readOnlyStore.isReadOnly}
                        <button
                            type="button"
                            onclick={openCreateRuleModal}
                            class="flex items-center gap-1.5 h-10 rounded-xl bg-emerald-50 px-4 text-sm font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60 cursor-pointer whitespace-nowrap shrink-0"
                        >
                            <Plus size={16} /> この条件でルール作成
                        </button>
                    {/if}
                </div>
            </form>
        </div>

        <!-- 検索結果一覧 -->
        {#if isLoading}
            <div
                class="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
                <p class="text-sm font-medium text-slate-400">検索中...</p>
            </div>
        {:else if searchResults.length > 0}
            <div
                class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
            >
                <div class="mb-4 text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400">
                    検索結果: <span class="text-blue-600 dark:text-blue-400 font-black">{searchResults.length}</span>
                    件
                </div>
                <div class="space-y-3">
                    {#each searchResults as p}
                        {@const ch = channelStore.getChannel(p.channelId)}
                        <div
                            class="flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-4 transition hover:border-blue-200 dark:border-slate-800 dark:bg-slate-800/40"
                        >
                            <div class="flex items-center justify-between gap-2 flex-wrap">
                                <span
                                    class="rounded-lg px-2.5 py-0.5 text-sm font-bold whitespace-nowrap {getChannelTypeBadgeClass(
                                        ch?.channelType,
                                    )}"
                                >
                                    {channelStore.getChannelName(p.channelId)}
                                </span>
                                <span class="text-sm font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                    {formatDate(p.startAt)} - {formatTime(p.endAt)}
                                </span>
                            </div>
                            <h3 class="program-title mt-2">
                                {p.name}
                            </h3>
                            {#if p.description}
                                <p class="program-summary mt-1 line-clamp-2 leading-relaxed">
                                    {p.description}
                                </p>
                            {/if}

                            <!-- アクションエリア -->
                            <div
                                class="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-2 flex-wrap"
                            >
                                <div class="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                    {#if p.endAt < Date.now()}
                                        <span
                                            class="px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 font-semibold text-[11px]"
                                        >
                                            放映終了
                                        </span>
                                    {:else if reservedProgramIds.has(p.id)}
                                        <span
                                            class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold text-xs"
                                        >
                                            <Check size={13} /> 予約済み
                                        </span>
                                    {/if}
                                </div>

                                <div class="flex items-center gap-2 shrink-0">
                                    {#if !readOnlyStore.isReadOnly}
                                        <button
                                            type="button"
                                            onclick={() => openCreateRuleWithProgram(p)}
                                            class="btn-secondary h-8 px-2.5 text-xs font-bold flex items-center gap-1 cursor-pointer"
                                            title="この番組名でルール作成"
                                        >
                                            <Plus size={13} /> ルール作成
                                        </button>
                                        {#if p.endAt >= Date.now() && !reservedProgramIds.has(p.id)}
                                            <button
                                                type="button"
                                                disabled={reservingProgramId === p.id}
                                                onclick={() => reserveProgram(p)}
                                                class="btn-primary h-8 px-3 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                                title="この番組を予約"
                                            >
                                                {#if reservingProgramId === p.id}
                                                    <Loader2 size={13} class="animate-spin" />
                                                    <span>予約中...</span>
                                                {:else}
                                                    <CalendarPlus size={13} />
                                                    <span>予約</span>
                                                {/if}
                                            </button>
                                        {/if}
                                    {/if}
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {:else if hasSearched && searchResults.length === 0}
            <div
                class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900"
            >
                <SearchIcon size={40} class="text-slate-300 dark:text-slate-600 mb-3" />
                <h3 class="text-base font-bold text-slate-800 dark:text-slate-200">
                    一致する番組が見つかりませんでした
                </h3>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md">
                    検索キーワードの誤字・脱字がないか確認するか、ジャンルや検索対象の絞り込み条件を広げてお試しください。
                </p>
                {#if !readOnlyStore.isReadOnly}
                    <button
                        type="button"
                        onclick={openCreateRuleModal}
                        class="btn-primary mt-4 flex items-center gap-1.5 h-10 px-4 text-xs font-bold cursor-pointer"
                    >
                        <Plus size={16} /> このキーワードで自動録画ルールを作成
                    </button>
                {/if}
            </div>
        {/if}
    </div>
{/if}
