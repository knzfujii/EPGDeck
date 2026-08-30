<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { socketStore } from '../lib/stores/socket.svelte';
    import { formatDate, formatTime, formatTimeRange, formatDuration, formatSize } from '../lib/utils/format';
    import StreamSelectModal from '../lib/components/video/StreamSelectModal.svelte';
    import axios from 'axios';
    import type * as apid from '../../../api';
    import {
        Video,
        Search,
        Calendar,
        Filter,
        LayoutGrid,
        Table as TableIcon,
        Play,
        Download,
        Trash2,
        Lock,
        Unlock,
        MoreVertical,
        ChevronLeft,
        ChevronRight,
        AlertTriangle,
        Sparkles
    } from '@lucide/svelte';

    let recorded = $state<apid.RecordedItem[]>([]);
    let total = $state(0);
    let isLoading = $state(true);

    const SAVED_VIEW_MODE_KEY = 'epgdeck_recorded_view_mode';
    let viewMode = $state<'table' | 'card'>('card'); // デフォルトはカード表示

    function setViewMode(mode: 'table' | 'card') {
        viewMode = mode;
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem(SAVED_VIEW_MODE_KEY, mode);
            } catch (e) {
                // ignore
            }
        }
    }

    // 検索・絞り込み状態
    let keyword = $state(router.current.query.keyword || '');
    let selectedGenre = $state<number | null>(router.current.query.genre ? parseInt(router.current.query.genre, 10) : null);
    let selectedYear = $state<number | null>(null);
    let selectedMonth = $state<number | null>(null);
    let currentPage = $state(router.current.query.page ? parseInt(router.current.query.page, 10) : 1);
    const limit = 50;

    // 再生モーダル状態
    let isStreamModalOpen = $state(false);
    let selectedItemForStream = $state<apid.RecordedItem | null>(null);

    // ジャンル定義
    const genres = [
        { id: null, name: 'すべて' },
        { id: 7, name: 'アニメ' },
        { id: 6, name: '映画' },
        { id: 3, name: 'ドラマ' },
        { id: 0, name: 'ニュース' },
        { id: 5, name: 'バラエティ' },
        { id: 1, name: 'スポーツ' },
        { id: 4, name: '音楽' },
        { id: 2, name: '情報' },
    ];

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 10 }, (_, i) => currentYear - i);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    let unsubscribeSocket: (() => void) | null = null;

    async function fetchRecorded(isSilent = false) {
        if (!isSilent) isLoading = true;
        try {
            await channelStore.fetch();
            const params: Record<string, any> = {
                offset: (currentPage - 1) * limit,
                limit,
                isHalfWidth: true,
            };

            if (keyword.trim()) params.keyword = keyword.trim();
            if (selectedGenre !== null) params.genre = selectedGenre;

            if (selectedYear !== null && selectedMonth !== null) {
                const startDate = new Date(selectedYear, selectedMonth - 1, 1);
                const endDate = new Date(selectedYear, selectedMonth, 1);
                params.startAt = startDate.getTime();
                params.endAt = endDate.getTime();
            } else if (selectedYear !== null) {
                const startDate = new Date(selectedYear, 0, 1);
                const endDate = new Date(selectedYear + 1, 0, 1);
                params.startAt = startDate.getTime();
                params.endAt = endDate.getTime();
            }

            const res = await axios.get('/api/recorded', { params });
            recorded = res.data.records || [];
            total = res.data.total || 0;
        } catch (e) {
            console.error('Failed to fetch recorded', e);
            if (!isSilent) snackbar.open({ text: '録画データの取得に失敗しました', color: 'error' });
        } finally {
            if (!isSilent) isLoading = false;
        }
    }

    onMount(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem(SAVED_VIEW_MODE_KEY);
                if (saved === 'table' || saved === 'card') {
                    viewMode = saved;
                }
            } catch (e) {
                // ignore
            }
        }
        fetchRecorded();

        // Socket.IO による録画ステータス更新の受信
        unsubscribeSocket = socketStore.on('updateStatus', () => {
            fetchRecorded(true);
        });
    });

    onDestroy(() => {
        unsubscribeSocket?.();
    });

    function handleSearch() {
        currentPage = 1;
        fetchRecorded();
    }

    function selectGenre(id: number | null) {
        selectedGenre = id;
        currentPage = 1;
        fetchRecorded();
    }

    function handleDateJump(year: number | null, month: number | null) {
        selectedYear = year;
        selectedMonth = month;
        currentPage = 1;
        fetchRecorded();
    }

    function changePage(page: number) {
        if (page < 1 || page > Math.ceil(total / limit)) return;
        currentPage = page;
        fetchRecorded();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // スマート再生トリガー
    function handlePlayClick(item: apid.RecordedItem) {
        const files = item.videoFiles || [];
        const encoded = files.filter((f: any) => f.type === 'encoded' || f.name.toLowerCase().includes('mp4'));

        if (encoded.length === 1 && files.length === 1) {
            // 直接再生可能ファイルが1つの場合は即座に再生
            router.push(`/recorded/watch?recordedId=${item.id}&videoId=${encoded[0].id}`);
        } else {
            // 複数ファイルまたはTSの場合はモーダルを開く
            selectedItemForStream = item;
            isStreamModalOpen = true;
        }
    }

    // 保護 / 保護解除
    async function toggleProtect(item: apid.RecordedItem) {
        try {
            if (item.isProtected) {
                await axios.put(`/api/recorded/${item.id}/unprotect`);
                item.isProtected = false;
                snackbar.open({ text: '保護を解除しました', color: 'success' });
            } else {
                await axios.put(`/api/recorded/${item.id}/protect`);
                item.isProtected = true;
                snackbar.open({ text: '番組を保護しました', color: 'success' });
            }
        } catch (e) {
            console.error('Failed to toggle protect', e);
            snackbar.open({ text: '保護設定の変更に失敗しました', color: 'error' });
        }
    }

    async function deleteRecorded(id: number, name: string) {
        if (!confirm(`「${name}」を削除しますか？\n（録画ファイルも削除されます）`)) return;

        try {
            await axios.delete(`/api/recorded/${id}?isDeleteFile=true`);
            snackbar.open({ text: '録画を削除しました', color: 'success' });
            fetchRecorded();
        } catch (e) {
            console.error('Failed to delete recorded', e);
            snackbar.open({ text: '録画の削除に失敗しました', color: 'error' });
        }
    }

    function formatRecordedDuration(startAt: number, endAt: number): string {
        return formatDuration(endAt - startAt);
    }
</script>

<div class="space-y-5 w-full max-w-full min-w-0">
    <!-- ヘッダーツールバー -->
    <div class="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
                <h1 class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                    <Video size={20} class="text-blue-600 dark:text-blue-400" />
                    録画済み一覧
                </h1>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                    全 <span class="font-bold text-slate-900 dark:text-slate-100">{total.toLocaleString()}</span> 件中 {(currentPage - 1) * limit + 1} - {Math.min(currentPage * limit, total)} 件
                </p>
            </div>

            <!-- 表示切り替え & 検索 -->
            <div class="flex items-center gap-2">
                <form onsubmit={(e) => { e.preventDefault(); handleSearch(); }} class="relative flex items-center">
                    <input
                        type="text"
                        bind:value={keyword}
                        placeholder="録画を検索..."
                        class="h-9 w-48 rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-hidden sm:w-64 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <Search size={14} class="absolute left-2.5 text-slate-400" />
                </form>

                <div class="flex rounded-xl border border-slate-200 p-0.5 dark:border-slate-700">
                    <button
                        type="button"
                        onclick={() => setViewMode('table')}
                        class="rounded-lg p-1.5 {viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'}"
                        title="テーブル表示"
                        aria-label="テーブル表示"
                    >
                        <TableIcon size={16} />
                    </button>
                    <button
                        type="button"
                        onclick={() => setViewMode('card')}
                        class="rounded-lg p-1.5 {viewMode === 'card' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'}"
                        title="カード表示"
                        aria-label="カード表示"
                    >
                        <LayoutGrid size={16} />
                    </button>
                </div>
            </div>
        </div>

        <!-- 年月ジャンプナビゲーション (15,000件対応) -->
        <div class="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <span class="flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <Calendar size={14} /> 年月指定:
            </span>
            <select
                bind:value={selectedYear}
                onchange={() => handleDateJump(selectedYear, selectedMonth)}
                class="h-7 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
                <option value={null}>すべての年</option>
                {#each years as y}
                    <option value={y}>{y}年</option>
                {/each}
            </select>

            {#if selectedYear !== null}
                <select
                    bind:value={selectedMonth}
                    onchange={() => handleDateJump(selectedYear, selectedMonth)}
                    class="h-7 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                    <option value={null}>すべての月</option>
                    {#each months as m}
                        <option value={m}>{m}月</option>
                    {/each}
                </select>
            {/if}

            {#if selectedYear !== null || selectedMonth !== null}
                <button
                    type="button"
                    onclick={() => handleDateJump(null, null)}
                    class="h-7 rounded-lg bg-slate-100 px-2 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                >
                    クリア
                </button>
            {/if}
        </div>

        <!-- ジャンルフィルターチップ -->
        <div class="flex flex-wrap gap-1.5">
            {#each genres as g}
                <button
                    type="button"
                    onclick={() => selectGenre(g.id)}
                    class="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors {selectedGenre === g.id
                        ? 'bg-blue-600 text-white font-bold'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}"
                >
                    {g.name}
                </button>
            {/each}
        </div>
    </div>

    <!-- コンテンツ表示 (テーブル or カード) -->
    {#if isLoading}
        <div class="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <p class="text-sm font-medium text-slate-400">録画データを読み込み中...</p>
        </div>
    {:else if recorded.length === 0}
        <div class="flex h-64 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
            <Video size={36} class="text-slate-300 dark:text-slate-600" />
            <p class="mt-2 text-sm font-bold text-slate-700 dark:text-slate-300">該当する録画が見つかりません</p>
            <p class="text-xs text-slate-400">検索条件やフィルターを変更してお試しください</p>
        </div>
    {:else if viewMode === 'table'}
        <!-- テーブル表示 (再生ボタンを目立たせる) -->
        <div class="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                    <thead class="border-b border-slate-200 bg-slate-50 font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                        <tr>
                            <th class="px-4 py-3">放送日時</th>
                            <th class="px-4 py-3">放送局</th>
                            <th class="px-4 py-3">番組名 / 概要</th>
                            <th class="px-4 py-3">時間 / サイズ</th>
                            <th class="px-4 py-3">ドロップ</th>
                            <th class="px-4 py-3 text-right">再生 / 操作</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                        {#each recorded as item}
                            <tr class="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                                <td class="whitespace-nowrap px-4 py-3.5 font-medium text-slate-500 dark:text-slate-400">
                                    {formatDate(item.startAt)}
                                </td>
                                <td class="whitespace-nowrap px-4 py-3.5">
                                    <span class="rounded bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                        {channelStore.getChannelName(item.channelId)}
                                    </span>
                                </td>
                                <td class="px-4 py-3.5">
                                    <div class="flex items-center gap-1.5">
                                        {#if item.isProtected}
                                            <Lock size={13} class="text-amber-500 shrink-0" title="保護中" />
                                        {/if}
                                        <button
                                            type="button"
                                            onclick={() => router.push(`/recorded/detail?recordedId=${item.id}`)}
                                            class="text-left font-bold text-slate-900 hover:text-blue-600 hover:underline dark:text-slate-100 dark:hover:text-blue-400 cursor-pointer"
                                            title="番組詳細・ファイル一覧を見る"
                                        >
                                            {item.name}
                                        </button>
                                    </div>
                                    {#if item.description}
                                        <div
                                            onclick={() => router.push(`/recorded/detail?recordedId=${item.id}`)}
                                            role="button"
                                            tabindex="0"
                                            onkeydown={(e) => { if (e.key === 'Enter') router.push(`/recorded/detail?recordedId=${item.id}`); }}
                                            class="mt-0.5 line-clamp-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                                            title="番組詳細を見る"
                                        >
                                            {item.description}
                                        </div>
                                    {/if}
                                </td>
                                <td class="whitespace-nowrap px-4 py-3.5 text-slate-500 dark:text-slate-400">
                                    <div>{formatDuration(item.endAt - item.startAt)}</div>
                                    <div class="text-xs text-slate-400">{formatSize(item.videoFiles?.[0]?.size)}</div>
                                </td>
                                <td class="whitespace-nowrap px-4 py-3.5">
                                    {#if item.dropLogFile && (item.dropLogFile.dropCnt > 0 || item.dropLogFile.errorCnt > 0)}
                                        <span class="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300" title={`Drop: ${item.dropLogFile.dropCnt}, Error: ${item.dropLogFile.errorCnt}, Scramble: ${item.dropLogFile.scramblingCnt}`}>
                                            <AlertTriangle size={11} /> Drop: {item.dropLogFile.dropCnt}
                                        </span>
                                    {:else if item.dropLogFile}
                                        <span class="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                                            なし (0)
                                        </span>
                                    {:else}
                                        <span class="text-xs text-slate-400">-</span>
                                    {/if}
                                </td>
                                <td class="whitespace-nowrap px-4 py-3.5 text-right">
                                    <div class="flex items-center justify-end gap-2">
                                        <!-- 目立つ青色の再生ボタン -->
                                        <button
                                            type="button"
                                            onclick={() => handlePlayClick(item)}
                                            class="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 hover:shadow-md"
                                            title="今すぐ再生"
                                        >
                                            <Play size={13} fill="currentColor" /> 再生
                                        </button>

                                        <!-- 保護トグルボタン -->
                                        <button
                                            type="button"
                                            onclick={() => toggleProtect(item)}
                                            class="rounded-lg p-1.5 {item.isProtected ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-400 hover:bg-slate-100'} dark:hover:bg-slate-800"
                                            title={item.isProtected ? '保護解除' : '番組を保護'}
                                        >
                                            {#if item.isProtected}
                                                <Lock size={15} />
                                            {:else}
                                                <Unlock size={15} />
                                            {/if}
                                        </button>

                                        <!-- 削除ボタン -->
                                        <button
                                            type="button"
                                            onclick={() => deleteRecorded(item.id, item.name)}
                                            class="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
                                            title="削除"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {:else}
        <!-- カード表示 (サムネイル & 詳細遷移) -->
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {#each recorded as item}
                <div
                    onclick={() => router.push(`/recorded/detail?recordedId=${item.id}`)}
                    class="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition hover:border-blue-400 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 cursor-pointer"
                    role="button"
                    tabindex="0"
                    onkeydown={(e) => { if (e.key === 'Enter') router.push(`/recorded/detail?recordedId=${item.id}`); }}
                >
                    <!-- サムネイルエリア (カードの一部として機能、中央ボタンのみ即座再生) -->
                    <div class="relative aspect-video w-full bg-slate-900 overflow-hidden">
                        {#if item.thumbnails?.[0]}
                            <img
                                src={`/api/thumbnails/${item.thumbnails[0]}`}
                                alt={item.name}
                                class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                            />
                        {:else}
                            <div class="flex h-full w-full items-center justify-center text-slate-600">
                                <Video size={40} />
                            </div>
                        {/if}

                        <!-- 再生ボタンオーバーレイ (丸ボタンクリック時のみ再生) -->
                        <div class="absolute inset-0 flex items-center justify-center bg-black/30 transition group-hover:bg-black/15">
                            <button
                                type="button"
                                onclick={(e) => { e.stopPropagation(); handlePlayClick(item); }}
                                class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl transition duration-200 hover:scale-115 hover:bg-blue-500"
                                title="今すぐ動画を再生"
                            >
                                <Play size={20} fill="currentColor" class="translate-x-0.5" />
                            </button>
                        </div>

                        <span class="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {formatDuration(item.endAt - item.startAt)}
                        </span>

                        {#if item.isProtected}
                            <span class="absolute top-2 left-2 flex items-center gap-1 rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-black text-white shadow-xs">
                                <Lock size={10} /> 保護中
                            </span>
                        {/if}
                    </div>

                    <!-- カード本文 -->
                    <div class="flex flex-1 flex-col justify-between p-4">
                        <div>
                            <div class="flex items-center justify-between gap-2">
                                <span class="rounded bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                    {channelStore.getChannelName(item.channelId)}
                                </span>
                                <span class="text-xs font-semibold text-slate-400">
                                    {formatSize(item.videoFiles?.[0]?.size)}
                                </span>
                            </div>
                            <h3 class="mt-2 line-clamp-2 text-sm font-bold text-slate-900 transition group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-400">
                                {item.name}
                            </h3>
                            {#if item.description}
                                <p class="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                                    {item.description}
                                </p>
                            {/if}
                        </div>

                        <!-- 下部メタ & アクションボタン -->
                        <div class="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400 dark:border-slate-800">
                            <span class="font-medium">{formatDate(item.startAt)} {formatTime(item.startAt)}</span>
                            <div class="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onclick={(e) => { e.stopPropagation(); toggleProtect(item); }}
                                    class="rounded-lg p-1.5 {item.isProtected ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-400 hover:bg-slate-100'} dark:hover:bg-slate-800"
                                    title={item.isProtected ? '保護解除' : '番組を保護'}
                                >
                                    {#if item.isProtected}
                                        <Lock size={15} />
                                    {:else}
                                        <Unlock size={15} />
                                    {/if}
                                </button>
                                <button
                                    type="button"
                                    onclick={(e) => { e.stopPropagation(); deleteRecorded(item.id, item.name); }}
                                    class="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
                                    title="削除"
                                >
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}

    <!-- ページネーションコントロール -->
    {#if Math.ceil(total / limit) > 1}
        <div class="flex items-center justify-center gap-2 pt-2">
            <button
                type="button"
                disabled={currentPage <= 1}
                onclick={() => changePage(currentPage - 1)}
                class="flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
                <ChevronLeft size={14} /> 前へ
            </button>
            <span class="px-3 text-xs font-semibold text-slate-600 dark:text-slate-400">
                {currentPage} / {Math.ceil(total / limit)} ページ
            </span>
            <button
                type="button"
                disabled={currentPage >= Math.ceil(total / limit)}
                onclick={() => changePage(currentPage + 1)}
                class="flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
                次へ <ChevronRight size={14} />
            </button>
        </div>
    {/if}
</div>

<!-- ストリーム選択モーダル -->
{#if selectedItemForStream}
    <StreamSelectModal
        isOpen={isStreamModalOpen}
        title={selectedItemForStream.name}
        channelName={channelStore.getChannelName(selectedItemForStream.channelId)}
        recordedId={selectedItemForStream.id}
        videoFiles={selectedItemForStream.videoFiles || []}
        onClose={() => {
            isStreamModalOpen = false;
            selectedItemForStream = null;
        }}
    />
{/if}
