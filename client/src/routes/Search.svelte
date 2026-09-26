<script lang="ts">
    import { onMount, untrack } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { readOnlyStore } from '../lib/stores/readOnly.svelte';
    import api from '@/lib/apiClient';
    import type * as apid from '../../../api';
    import { getChannelTypeBadgeClass, extractFirstSearchWord } from '../lib/utils/format';
    import { QUICK_GENRES } from '../lib/constants/genres';
    import { Search as SearchIcon, Plus, CalendarPlus, Check, Loader2, Sparkles } from '@lucide/svelte';
    import ReadOnlyGuard from '../lib/components/common/ReadOnlyGuard.svelte';
    import SearchInput from '../lib/components/common/SearchInput.svelte';
    import EmptyState from '../lib/components/common/EmptyState.svelte';
    import LoadingState from '../lib/components/common/LoadingState.svelte';
    import Badge from '../lib/components/common/Badge.svelte';
    import Button from '../lib/components/common/Button.svelte';
    import Checkbox from '../lib/components/common/Checkbox.svelte';
    import Select from '../lib/components/common/Select.svelte';

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
                if (keyword.trim() || selectedGenre !== null) {
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

            if (hasChanged && (keyword.trim() || selectedGenre !== null)) {
                executeSearch({ replace: true });
            } else if (hasChanged && !keyword.trim() && selectedGenre === null) {
                searchResults = [];
                hasSearched = false;
            }
        });
    });

    const genres = [{ id: null, name: 'すべてのジャンル' }, ...QUICK_GENRES];

    async function fetchExistingReserves() {
        try {
            const res = await api.reserves.$get({ query: { isHalfWidth: true, limit: 1000 } });
            if (res.ok) {
                const data = await res.json();
                const ids = new Set<number>();
                for (const r of data.reserves || []) {
                    if (r.programId) ids.add(r.programId);
                }
                reservedProgramIds = ids;
            }
        } catch (e) {
            console.error('Failed to fetch reserves', e);
        }
    }

    async function executeSearch(options: { replace?: boolean } = { replace: false }) {
        if (!keyword.trim() && selectedGenre === null) {
            router.setQuery(
                {
                    keyword: null,
                    genre: null,
                    name: null,
                    description: null,
                },
                options,
            );
            searchResults = [];
            hasSearched = false;
            return;
        }

        router.setQuery(
            {
                keyword: keyword.trim() || null,
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
            const searchOpt: apid.RuleSearchOption = {
                genres: selectedGenre !== null ? [{ genre: selectedGenre }] : [],
            };
            if (keyword.trim()) {
                searchOpt.keyword = keyword.trim();
                searchOpt.name = isName;
                searchOpt.description = isDescription;
            }
            const res = await api.schedules.search.$post({
                json: {
                    option: searchOpt,
                    isHalfWidth: true,
                    limit: 100,
                },
            });
            if (res.ok) {
                searchResults = (await res.json()) || [];
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
                },
            });
            if (!res.ok) {
                const errData = (await res.json().catch(() => ({}))) as { message?: string };
                throw new Error(errData?.message || '予約の登録に失敗しました');
            }
            const nextSet = new Set(reservedProgramIds);
            nextSet.add(program.id);
            reservedProgramIds = nextSet;
            snackbar.open({ text: `「${program.name}」を予約しました`, color: 'success' });
        } catch (e: unknown) {
            console.error('Failed to reserve program', e);
            const msg = e instanceof Error ? e.message : '予約の登録に失敗しました';
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
        if (!keyword.trim() && selectedGenre === null) return;
        const params = new URLSearchParams();
        if (keyword.trim()) {
            params.set('keyword', keyword.trim());
            params.set('name', isName ? '1' : '0');
            params.set('description', isDescription ? '1' : '0');
        }
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

    function clearSearch() {
        keyword = '';
        if (selectedGenre === null) {
            router.setQuery({
                keyword: null,
                genre: null,
                name: null,
                description: null,
            });
            searchResults = [];
            hasSearched = false;
        } else {
            executeSearch();
        }
    }
</script>

{#if !readOnlyStore.canViewSearch}
    <ReadOnlyGuard
        description="番組検索の利用は制限されています。録画一覧へリダイレクトします..."
        returnPath="/recorded"
        returnText="録画一覧へ"
    />
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
                    <SearchInput
                        bind:value={keyword}
                        placeholder="番組名やキーワードを入力..."
                        ariaLabel="検索キーワード"
                        size="md"
                        onsubmit={() => executeSearch()}
                        onclear={clearSearch}
                    />
                    <Button
                        type="submit"
                        variant="primary"
                        disabled={isLoading}
                        class="px-5 text-xs sm:text-sm shrink-0"
                    >
                        <SearchIcon size={16} /> 検索
                    </Button>
                </div>

                <!-- オプション行 -->
                <div
                    class="flex flex-wrap items-center justify-between gap-3 sm:gap-4 text-sm font-bold text-slate-700 dark:text-slate-300"
                >
                    <div class="flex flex-wrap items-center gap-4 sm:gap-5">
                        <Checkbox bind:checked={isName} label="番組名" class="whitespace-nowrap" />
                        <Checkbox bind:checked={isDescription} label="番組概要" class="whitespace-nowrap" />

                        <div class="flex items-center gap-2 whitespace-nowrap shrink-0">
                            <span class="text-slate-600 dark:text-slate-400 whitespace-nowrap">ジャンル:</span>
                            <Select bind:value={selectedGenre} class="w-auto">
                                {#each genres as g}
                                    <option value={g.id}>{g.name}</option>
                                {/each}
                            </Select>
                        </div>
                    </div>

                    {#if (keyword.trim() || selectedGenre !== null) && !readOnlyStore.isReadOnly}
                        <Button variant="secondary" onclick={openCreateRuleModal} class="whitespace-nowrap shrink-0">
                            <Plus size={16} /> この条件でルール作成
                        </Button>
                    {/if}
                </div>
            </form>
        </div>

        <!-- 検索結果一覧 -->
        {#if isLoading}
            <LoadingState message="番組を検索中..." />
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
                                        <Badge variant="skip" text="放映終了" />
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
                                        <Button
                                            variant="secondary"
                                            size="compact"
                                            onclick={() => openCreateRuleWithProgram(p)}
                                            title="この番組名でルール作成"
                                        >
                                            <Plus size={14} /> ルール作成
                                        </Button>
                                        {#if p.endAt >= Date.now() && !reservedProgramIds.has(p.id)}
                                            <Button
                                                variant="primary"
                                                size="compact"
                                                disabled={reservingProgramId === p.id}
                                                onclick={() => reserveProgram(p)}
                                                title="この番組を予約"
                                            >
                                                {#if reservingProgramId === p.id}
                                                    <Loader2 size={14} class="animate-spin" />
                                                    <span>予約中...</span>
                                                {:else}
                                                    <CalendarPlus size={14} />
                                                    <span>予約</span>
                                                {/if}
                                            </Button>
                                        {/if}
                                    {/if}
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {:else if hasSearched && searchResults.length === 0}
            <EmptyState
                icon={SearchIcon}
                title="一致する番組が見つかりませんでした"
                description="検索キーワードの誤字・脱字がないか確認するか、ジャンルや検索対象の絞り込み条件を広げてお試しください。"
            />
        {/if}
    </div>
{/if}
