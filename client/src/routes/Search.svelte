<script lang="ts">
    import { onMount } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import axios from 'axios';
    import { Search as SearchIcon, Plus, SlidersHorizontal, Check } from '@lucide/svelte';

    let keyword = $state(router.current.query.keyword || '');
    let searchResults = $state<any[]>([]);
    let isLoading = $state(false);

    // 検索オプション
    let isName = $state(true);
    let isDescription = $state(true);
    let selectedGenre = $state<number | null>(null);

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

    async function executeSearch() {
        if (!keyword.trim()) return;

        isLoading = true;
        try {
            await channelStore.fetch();
            const res = await axios.post('/api/schedules/search', {
                option: {
                    keyword: keyword.trim(),
                    name: isName,
                    description: isDescription,
                    genres: selectedGenre !== null ? [{ lv1: selectedGenre }] : [],
                },
                isHalfWidth: true,
                limit: 100,
            });
            searchResults = res.data || [];
        } catch (e) {
            console.error('Search error', e);
            snackbar.open({ text: '検索に失敗しました', color: 'error' });
        } finally {
            isLoading = false;
        }
    }

    onMount(() => {
        if (keyword.trim()) {
            executeSearch();
        }
    });

    function openCreateRuleModal() {
        if (!keyword.trim()) return;
        // 検索条件をクエリパラメータで渡してルール作成ページへ遷移
        const params = new URLSearchParams({
            keyword: keyword.trim(),
            name: isName ? '1' : '0',
            description: isDescription ? '1' : '0',
        });
        if (selectedGenre !== null) params.set('genre', String(selectedGenre));
        router.push(`/rule/edit?${params.toString()}`);
    }

    function formatTime(timestamp: number): string {
        const d = new Date(timestamp);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }

    function formatDate(timestamp: number): string {
        const d = new Date(timestamp);
        return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} (${['日','月','火','水','木','金','土'][d.getDay()]}) ${formatTime(timestamp)}`;
    }
</script>

<div class="space-y-5 w-full max-w-full min-w-0">
    <!-- 検索バー & 条件フォーム -->
    <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <h1 class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
            <SearchIcon size={20} class="text-blue-600 dark:text-blue-400" />
            番組検索 & 自動予約ルール作成
        </h1>

        <form onsubmit={(e) => { e.preventDefault(); executeSearch(); }} class="mt-4 space-y-4">
            <div class="flex gap-2">
                <input
                    type="text"
                    bind:value={keyword}
                    placeholder="番組名やキーワードを入力..."
                    class="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                <button
                    type="submit"
                    class="flex items-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white shadow-xs transition hover:bg-blue-700 cursor-pointer"
                >
                    <SearchIcon size={16} /> 検索
                </button>
            </div>

            <!-- オプション行 -->
            <div class="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" bind:checked={isName} class="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    番組名
                </label>
                <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" bind:checked={isDescription} class="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    番組概要
                </label>

                <div class="flex items-center gap-2">
                    <span>ジャンル:</span>
                    <select
                        bind:value={selectedGenre}
                        class="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                        {#each genres as g}
                            <option value={g.id}>{g.name}</option>
                        {/each}
                    </select>
                </div>

                {#if keyword.trim()}
                    <button
                        type="button"
                        onclick={openCreateRuleModal}
                        class="ml-auto flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3.5 py-1.5 font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 cursor-pointer"
                    >
                        <Plus size={14} /> この条件でルール作成
                    </button>
                {/if}
            </div>
        </form>
    </div>

    <!-- 検索結果一覧 -->
    {#if isLoading}
        <div class="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <p class="text-sm font-medium text-slate-400">検索中...</p>
        </div>
    {:else if searchResults.length > 0}
        <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div class="mb-3 text-xs font-bold text-slate-500 dark:text-slate-400">
                検索結果: {searchResults.length} 件
            </div>
            <div class="space-y-3">
                {#each searchResults as p}
                    <div class="flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-4 transition hover:border-blue-200 dark:border-slate-800 dark:bg-slate-800/40">
                        <div class="flex items-center justify-between gap-2">
                            <span class="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                {channelStore.getChannelName(p.channelId)}
                            </span>
                            <span class="text-xs font-medium text-slate-500 dark:text-slate-400">
                                {formatDate(p.startAt)} - {formatTime(p.endAt)}
                            </span>
                        </div>
                        <h3 class="mt-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                            {p.name}
                        </h3>
                        {#if p.description}
                            <p class="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                                {p.description}
                            </p>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>
