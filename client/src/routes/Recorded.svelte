<script lang="ts">
    import { onMount, onDestroy, untrack, tick } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { confirmDialog } from '../lib/stores/confirm.svelte';
    import { socketStore } from '../lib/stores/socket.svelte';
    import { formatDate, formatTime, formatTimeRange, formatDuration, formatSize } from '../lib/utils/format';
    import { getSmartWatchUrl, getTotalVideoFileSize } from '../lib/utils/video';
    import StreamSelectModal from '../lib/components/video/StreamSelectModal.svelte';
    import EmptyState from '../lib/components/common/EmptyState.svelte';
    import LoadingState from '../lib/components/common/LoadingState.svelte';
    import Pagination from '../lib/components/common/Pagination.svelte';
    import { QUICK_GENRES } from '../lib/constants/genres';
    import { readOnlyStore } from '../lib/stores/readOnly.svelte';
    import api from '@/lib/apiClient';
    import {
        saveLastRecordedPath,
        saveLastRecordedTargetId,
        consumeLastRecordedTargetId,
    } from '../lib/navigationHistory';
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
        AlertTriangle,
        Sparkles,
        CheckSquare,
        X,
        SlidersHorizontal,
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

    // ルール一覧
    interface RuleOption {
        id: number;
        name: string;
    }
    let rulesList = $state<RuleOption[]>([]);
    let selectedRuleId = $state<number | null>(
        router.current.query.ruleId ? parseInt(router.current.query.ruleId, 10) : null,
    );
    const selectedRuleName = $derived.by(() => {
        if (selectedRuleId === null) return null;
        if (selectedRuleId === 0) return '手動録画のみ';
        const found = rulesList.find(r => r.id === selectedRuleId);
        return found ? found.name : `ルール #${selectedRuleId}`;
    });

    // 検索・絞り込み状態
    let keyword = $state(router.current.query.keyword || '');
    let activeKeyword = $state(router.current.query.keyword || '');
    let selectedGenre = $state<number | null>(
        router.current.query.genre ? parseInt(router.current.query.genre, 10) : null,
    );
    let selectedYear = $state<number | null>(
        router.current.query.year ? parseInt(router.current.query.year, 10) : null,
    );
    let selectedMonth = $state<number | null>(
        router.current.query.month ? parseInt(router.current.query.month, 10) : null,
    );
    let currentPage = $state(router.current.query.page ? parseInt(router.current.query.page, 10) : 1);
    const limit = 50;

    // 再生モーダル状態
    let isStreamModalOpen = $state(false);
    let selectedItemForStream = $state<apid.RecordedItem | null>(null);

    // ジャンル定義
    const genres = [{ id: null, name: 'すべて' }, ...QUICK_GENRES];

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 10 }, (_, i) => currentYear - i);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    let unsubscribeSocket: (() => void) | null = null;

    async function fetchRecorded(isSilent = false) {
        if (!isSilent) isLoading = true;
        try {
            await channelStore.fetch();
            const query: Parameters<typeof api.recorded.$get>[0]['query'] = {
                isHalfWidth: true,
                limit,
                offset: (currentPage - 1) * limit,
            };
            if (activeKeyword.trim()) query.keyword = activeKeyword.trim();
            if (selectedGenre !== null) query.genre = selectedGenre;
            if (selectedRuleId !== null) query.ruleId = selectedRuleId;

            if (selectedYear !== null && selectedMonth !== null) {
                const startDate = new Date(selectedYear, selectedMonth - 1, 1);
                const endDate = new Date(selectedYear, selectedMonth, 1);
                query.startAt = startDate.getTime();
                query.endAt = endDate.getTime();
            } else if (selectedYear !== null) {
                const startDate = new Date(selectedYear, 0, 1);
                const endDate = new Date(selectedYear + 1, 0, 1);
                query.startAt = startDate.getTime();
                query.endAt = endDate.getTime();
            }

            const res = await api.recorded.$get({ query });
            if (res.ok) {
                const data = await res.json();
                recorded = (data.records as apid.RecordedItem[]) || [];
                total = data.total || 0;
            }
        } catch (e) {
            console.error('Failed to fetch recorded', e);
            if (!isSilent) snackbar.open({ text: '録画データの取得に失敗しました', color: 'error' });
        } finally {
            if (!isSilent) isLoading = false;
        }

        // 直前に開いた番組IDが存在する場合はその位置へ自動スクロール
        const targetId = consumeLastRecordedTargetId();
        if (targetId !== null) {
            await tick();
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const el = document.getElementById(`recorded-item-${targetId}`);
                    if (el) {
                        el.scrollIntoView({ block: 'center', behavior: 'instant' });
                    }
                });
            });
        }
    }

    async function fetchRules() {
        try {
            const res = await api.rules.$get({ query: { limit: 1000, isHalfWidth: true } });
            if (res.ok) {
                const data = await res.json();
                const rawRules: apid.Rule[] = data.rules || [];
                rulesList = rawRules.map((r: apid.Rule) => ({
                    id: r.id,
                    name: r.searchOption?.keyword || `ルール #${r.id}`,
                }));
            }
        } catch (e) {
            console.error('Failed to fetch rules', e);
        }
    }

    function scrollToTop(smooth = false) {
        const mainEl = document.querySelector('main');
        if (mainEl) {
            mainEl.scrollTo({ top: 0, left: 0, behavior: smooth ? 'smooth' : 'instant' });
        }
        window.scrollTo({ top: 0, left: 0, behavior: smooth ? 'smooth' : 'instant' });
    }

    let isInitialized = false;

    $effect(() => {
        if (router.current.pathname !== '/recorded') return;

        const q = router.current.query;
        const qKeyword = q.keyword || '';
        const qGenre = q.genre ? parseInt(q.genre, 10) : null;
        const qRuleId = q.ruleId !== undefined ? (q.ruleId === '0' ? 0 : parseInt(q.ruleId, 10)) : null;
        const qYear = q.year ? parseInt(q.year, 10) : null;
        const qMonth = q.month ? parseInt(q.month, 10) : null;
        const qPage = q.page ? parseInt(q.page, 10) : 1;

        untrack(() => {
            if (!isInitialized) {
                isInitialized = true;
                keyword = qKeyword;
                activeKeyword = qKeyword;
                selectedGenre = Number.isNaN(qGenre) ? null : qGenre;
                selectedRuleId = Number.isNaN(qRuleId) ? null : qRuleId;
                selectedYear = Number.isNaN(qYear) ? null : qYear;
                selectedMonth = Number.isNaN(qMonth) ? null : qMonth;
                currentPage = Number.isNaN(qPage) ? 1 : qPage;
                fetchRecorded();
                return;
            }

            let hasChanged = false;
            if (qKeyword !== activeKeyword) {
                keyword = qKeyword;
                activeKeyword = qKeyword;
                hasChanged = true;
            }
            if (qGenre !== selectedGenre) {
                selectedGenre = Number.isNaN(qGenre) ? null : qGenre;
                hasChanged = true;
            }
            if (qRuleId !== selectedRuleId) {
                selectedRuleId = Number.isNaN(qRuleId) ? null : qRuleId;
                hasChanged = true;
            }
            if (qYear !== selectedYear) {
                selectedYear = Number.isNaN(qYear) ? null : qYear;
                hasChanged = true;
            }
            if (qMonth !== selectedMonth) {
                selectedMonth = Number.isNaN(qMonth) ? null : qMonth;
                hasChanged = true;
            }
            if (qPage !== currentPage) {
                currentPage = Number.isNaN(qPage) ? 1 : qPage;
                hasChanged = true;
            }

            if (hasChanged) {
                fetchRecorded();
            }
        });
    });

    // 直近の録画一覧パス（クエリ付き）をセッションストレージに自動保存
    $effect(() => {
        if (router.current.pathname === '/recorded') {
            saveLastRecordedPath(router.current.path);
        }
    });

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
        fetchRules();

        // Socket.IO による録画ステータス更新の受信
        unsubscribeSocket = socketStore.on('updateStatus', () => {
            fetchRecorded(true);
        });
    });

    onDestroy(() => {
        unsubscribeSocket?.();
    });

    function handleSearch() {
        const trimmed = keyword.trim();
        if (trimmed === activeKeyword && currentPage === 1) {
            fetchRecorded();
        } else {
            router.setQuery({
                page: null,
                keyword: trimmed || null,
            });
        }
        scrollToTop();
    }

    function clearSearch() {
        if (activeKeyword === '') {
            keyword = '';
            return;
        }
        keyword = '';
        router.setQuery({
            page: null,
            keyword: null,
        });
        scrollToTop();
    }

    function onInputKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            clearSearch();
        }
    }

    function selectGenre(id: number | null) {
        if (id === selectedGenre && currentPage === 1) return;
        router.setQuery({
            page: null,
            genre: id,
        });
        scrollToTop();
    }

    function selectRule(id: number | null | undefined) {
        const val = id ?? null;
        if (val === selectedRuleId && currentPage === 1) return;
        router.setQuery({
            page: null,
            ruleId: val,
        });
        scrollToTop();
    }

    function handleDateJump(year: number | null, month: number | null) {
        if (year === selectedYear && month === selectedMonth && currentPage === 1) return;
        router.setQuery({
            page: null,
            year: year,
            month: month,
        });
        scrollToTop();
    }

    function changePage(page: number) {
        if (page < 1 || page > Math.ceil(total / limit) || page === currentPage) return;
        router.setQuery({
            page: page > 1 ? page : null,
        });
        scrollToTop(true);
    }

    function openRecordedDetail(item: { id: number }) {
        saveLastRecordedTargetId(item.id);
        router.push(`/recorded/detail?recordedId=${item.id}`);
    }

    // スマート再生トリガー（最上位MP4があれば即座に直接再生、なければ再生方法選択モーダル）
    function handlePlayClick(item: apid.RecordedItem) {
        saveLastRecordedTargetId(item.id);
        const watchUrl = getSmartWatchUrl(item.id, item.videoFiles);
        if (watchUrl) {
            router.push(watchUrl);
        } else {
            selectedItemForStream = item;
            isStreamModalOpen = true;
        }
    }

    // 保護 / 保護解除
    async function toggleProtect(item: apid.RecordedItem) {
        try {
            if (item.isProtected) {
                await api.recorded[':recordedId'].unprotect.$put({ param: { recordedId: String(item.id) } });
                item.isProtected = false;
                snackbar.open({ text: '保護を解除しました', color: 'success' });
            } else {
                await api.recorded[':recordedId'].protect.$put({ param: { recordedId: String(item.id) } });
                item.isProtected = true;
                snackbar.open({ text: '番組を保護しました', color: 'success' });
            }
        } catch (e) {
            console.error('Failed to toggle protect', e);
            snackbar.open({ text: '保護設定の変更に失敗しました', color: 'error' });
        }
    }

    async function deleteRecorded(id: number, name: string) {
        const ok = await confirmDialog({
            title: '録画番組の削除',
            message: `「${name}」を削除しますか？\n（録画ファイルも削除されます）`,
            confirmText: '削除',
            cancelText: 'キャンセル',
            isDestructive: true,
        });
        if (!ok) return;

        try {
            await api.recorded[':recordedId'].$delete({
                param: { recordedId: String(id) },
                query: { isDeleteFile: true },
            });
            snackbar.open({ text: '録画を削除しました', color: 'success' });
            fetchRecorded();
        } catch (e) {
            console.error('Failed to delete recorded', e);
            snackbar.open({ text: '録画の削除に失敗しました', color: 'error' });
        }
    }

    function formatRecordedDuration(item: apid.RecordedItem): string {
        return formatDuration(item.duration && item.duration > 0 ? item.duration : item.endAt - item.startAt);
    }

    // --- 複数選択一括削除ロジック ---
    let isSelectionMode = $state(false);
    let selectedIds = $state<number[]>([]);
    let isDeletingMultiple = $state(false);

    // 現在表示中のページ内で選択可能な番組（保護中を除く）
    const selectableItems = $derived(recorded.filter(item => !item.isProtected));
    const isAllSelected = $derived(
        selectableItems.length > 0 && selectableItems.every(item => selectedIds.includes(item.id)),
    );

    function toggleSelectionMode() {
        isSelectionMode = !isSelectionMode;
        if (!isSelectionMode) {
            selectedIds = [];
        }
    }

    function toggleSelectItem(id: number) {
        const target = recorded.find(item => item.id === id);
        if (!target || target.isProtected) return;

        if (selectedIds.includes(id)) {
            selectedIds = selectedIds.filter(i => i !== id);
        } else {
            selectedIds = [...selectedIds, id];
        }
    }

    function toggleSelectAll() {
        if (isAllSelected) {
            // 現在のページの選択可能アイテムのみ解除
            const pageSelectableIds = selectableItems.map(item => item.id);
            selectedIds = selectedIds.filter(id => !pageSelectableIds.includes(id));
        } else {
            const currentSelected = new Set(selectedIds);
            for (const item of selectableItems) {
                currentSelected.add(item.id);
            }
            selectedIds = Array.from(currentSelected);
        }
    }

    function clearSelection() {
        selectedIds = [];
    }

    async function deleteSelectedRecorded() {
        if (selectedIds.length === 0 || isDeletingMultiple) return;

        const count = selectedIds.length;
        const ok = await confirmDialog({
            title: '録画番組の一括削除',
            message: `選択した ${count} 件の録画番組を削除しますか？\n（録画ファイルもすべて削除されます。この操作は取り消せません）`,
            confirmText: `${count}件を削除`,
            cancelText: 'キャンセル',
            isDestructive: true,
        });
        if (!ok) return;

        isDeletingMultiple = true;
        let successCount = 0;
        let failCount = 0;

        try {
            for (const id of [...selectedIds]) {
                try {
                    await api.recorded[':recordedId'].$delete({
                        param: { recordedId: String(id) },
                        query: { isDeleteFile: true },
                    });
                    successCount++;
                } catch (e) {
                    console.error(`Failed to delete recorded id: ${id}`, e);
                    failCount++;
                }
            }

            if (failCount === 0) {
                snackbar.open({ text: `${successCount} 件の録画を削除しました`, color: 'success' });
            } else {
                snackbar.open({
                    text: `${successCount} 件の録画を削除しました（${failCount} 件失敗）`,
                    color: failCount > 0 && successCount > 0 ? 'warning' : 'error',
                });
            }

            selectedIds = [];
            isSelectionMode = false;
            fetchRecorded();
        } finally {
            isDeletingMultiple = false;
        }
    }
</script>

<div class="space-y-5 w-full max-w-full min-w-0">
    <!-- ヘッダーツールバー -->
    <div
        class="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
    >
        <!-- 上段: タイトル・件数・アクティブ条件バッジ ＆ コントロール（ルール、年月、表示切替、選択モード） -->
        <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
                <h1 class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                    <Video size={20} class="text-blue-600 dark:text-blue-400" />
                    録画一覧
                </h1>
                <div class="flex items-center gap-2 flex-wrap mt-0.5">
                    <p class="text-xs text-slate-500 dark:text-slate-400">
                        全 <span class="font-bold text-slate-900 dark:text-slate-100">{total.toLocaleString()}</span>
                        件中 {(currentPage - 1) * limit + 1} - {Math.min(currentPage * limit, total)} 件
                    </p>
                    {#if selectedRuleName}
                        <span
                            class="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        >
                            <SlidersHorizontal size={12} class="text-blue-500" />
                            <span class="max-w-[150px] sm:max-w-[200px] truncate">{selectedRuleName}</span>
                            <button
                                type="button"
                                onclick={() => selectRule(null)}
                                class="hover:text-blue-900 dark:hover:text-white cursor-pointer ml-0.5"
                                title="ルール絞り込みを解除"
                            >
                                <X size={12} />
                            </button>
                        </span>
                    {/if}
                    {#if selectedYear !== null || selectedMonth !== null}
                        <span
                            class="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        >
                            <Calendar size={12} class="text-blue-500" />
                            <span>
                                {selectedYear ? `${selectedYear}年` : ''}{selectedMonth ? `${selectedMonth}月` : ''}
                            </span>
                            <button
                                type="button"
                                onclick={() => handleDateJump(null, null)}
                                class="hover:text-blue-900 dark:hover:text-white cursor-pointer ml-0.5"
                                title="年月指定を解除"
                            >
                                <X size={12} />
                            </button>
                        </span>
                    {/if}
                    {#if activeKeyword}
                        <span
                            class="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        >
                            <Search size={12} class="text-blue-500" />
                            <span class="max-w-[150px] sm:max-w-[200px] truncate">"{activeKeyword}"</span>
                            <button
                                type="button"
                                onclick={clearSearch}
                                class="hover:text-blue-900 dark:hover:text-white cursor-pointer ml-0.5"
                                title="キーワード検索を解除"
                            >
                                <X size={12} />
                            </button>
                        </span>
                    {/if}
                </div>
            </div>

            <!-- 右側: ルール選択・年月選択・表示切替・選択モード -->
            <div class="flex flex-wrap items-center gap-2 sm:gap-2.5">
                <!-- ルール選択 -->
                <div class="relative flex items-center">
                    <select
                        value={selectedRuleId !== null ? String(selectedRuleId) : ''}
                        onchange={e => {
                            const val = e.currentTarget.value;
                            selectRule(val === '' ? null : parseInt(val, 10));
                        }}
                        class="h-9 max-w-[140px] sm:max-w-[180px] truncate rounded-xl border pl-2.5 pr-7 text-xs font-semibold transition-colors cursor-pointer shrink-0 {selectedRuleId !==
                        null
                            ? 'border-blue-500 bg-blue-50/50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-200'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'}"
                    >
                        <option value="">すべてのルール</option>
                        <option value="0">手動録画のみ (ルールなし)</option>
                        {#each rulesList as r}
                            <option value={String(r.id)}>{r.name}</option>
                        {/each}
                    </select>
                    {#if selectedRuleId !== null}
                        <button
                            type="button"
                            onclick={() => selectRule(null)}
                            class="ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
                            title="ルール絞り込みを解除"
                        >
                            <X size={14} />
                        </button>
                    {/if}
                </div>

                <!-- 年月選択 -->
                <div class="flex items-center gap-1">
                    <select
                        value={selectedYear ?? ''}
                        onchange={e => {
                            const val = e.currentTarget.value;
                            const newYear = val === '' ? null : parseInt(val, 10);
                            handleDateJump(newYear, newYear === null ? null : selectedMonth);
                        }}
                        class="h-9 w-[88px] sm:w-[94px] rounded-xl border pl-2.5 pr-7 text-xs font-semibold transition-colors cursor-pointer shrink-0 {selectedYear !==
                        null
                            ? 'border-blue-500 bg-blue-50/50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-200'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'}"
                    >
                        <option value="">年</option>
                        {#each years as y}
                            <option value={y}>{y}年</option>
                        {/each}
                    </select>

                    <select
                        value={selectedMonth ?? ''}
                        disabled={selectedYear === null}
                        onchange={e => {
                            const val = e.currentTarget.value;
                            handleDateJump(selectedYear, val === '' ? null : parseInt(val, 10));
                        }}
                        class="h-9 w-[78px] sm:w-[82px] rounded-xl border pl-2.5 pr-7 text-xs font-semibold transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed {selectedMonth !==
                        null
                            ? 'border-blue-500 bg-blue-50/50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-200'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'}"
                    >
                        <option value="">月</option>
                        {#each months as m}
                            <option value={m}>{m}月</option>
                        {/each}
                    </select>

                    {#if selectedYear !== null || selectedMonth !== null}
                        <button
                            type="button"
                            onclick={() => handleDateJump(null, null)}
                            class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
                            title="年月指定を解除"
                        >
                            <X size={14} />
                        </button>
                    {/if}
                </div>

                <!-- 垂直ディバイダー -->
                <div class="hidden sm:block h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5"></div>

                <!-- 表示切り替え -->
                <div class="flex rounded-xl border border-slate-200 p-0.5 dark:border-slate-700">
                    <button
                        type="button"
                        onclick={() => setViewMode('card')}
                        class="rounded-lg p-1.5 cursor-pointer transition {viewMode === 'card'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800'}"
                        title="カード表示"
                        aria-label="カード表示"
                    >
                        <LayoutGrid size={16} />
                    </button>
                    <button
                        type="button"
                        onclick={() => setViewMode('table')}
                        class="rounded-lg p-1.5 cursor-pointer transition {viewMode === 'table'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800'}"
                        title="テーブル表示"
                        aria-label="テーブル表示"
                    >
                        <TableIcon size={16} />
                    </button>
                </div>

                <!-- 複数選択モード -->
                {#if !readOnlyStore.isReadOnly}
                    <button
                        type="button"
                        onclick={toggleSelectionMode}
                        class="flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition cursor-pointer {isSelectionMode
                            ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}"
                        title={isSelectionMode ? '選択モードを終了' : '複数選択モードを開始'}
                    >
                        <CheckSquare size={15} />
                        <span class="hidden sm:inline">{isSelectionMode ? '選択終了' : '選択'}</span>
                    </button>
                {/if}
            </div>
        </div>

        <!-- 下段: キーワード検索 ＆ ジャンルチップ（横スクロール対応） -->
        <div
            class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80"
        >
            <!-- 検索入力 (フォーム) -->
            <form
                onsubmit={e => {
                    e.preventDefault();
                    handleSearch();
                }}
                class="relative w-full sm:w-64 shrink-0"
            >
                <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                    type="text"
                    bind:value={keyword}
                    onkeydown={onInputKeydown}
                    placeholder="録画を検索..."
                    aria-label="録画を検索"
                    class="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 py-1.5 pl-9 pr-8 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-hidden dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:bg-slate-800 transition-colors"
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

            <!-- ジャンルチップ (横スクロール) -->
            <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0">
                {#each genres as g}
                    <button
                        type="button"
                        onclick={() => selectGenre(g.id)}
                        class="rounded-lg px-3 py-1.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 {selectedGenre ===
                        g.id
                            ? 'bg-blue-600 text-white font-bold shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100'}"
                    >
                        {g.name}
                    </button>
                {/each}
            </div>
        </div>
    </div>

    <!-- コンテンツ表示 (テーブル or カード) -->
    {#if isLoading}
        <LoadingState message="録画データを読み込み中..." />
    {:else if recorded.length === 0}
        <EmptyState
            icon={Video}
            title="該当する録画が見つかりません"
            description="検索条件やフィルターを変更してお試しください"
        />
    {:else if viewMode === 'table'}
        <!-- テーブル表示 (再生ボタンを目立たせる) -->
        <div
            class="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900"
        >
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead
                        class="border-b border-slate-200 bg-slate-50 font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400"
                    >
                        <tr>
                            {#if isSelectionMode}
                                <th class="w-12 min-w-[48px] px-3 py-3 text-center">
                                    <input
                                        type="checkbox"
                                        checked={isAllSelected}
                                        onchange={toggleSelectAll}
                                        aria-label="ページ内の未保護番組を全選択"
                                        class="form-checkbox"
                                        title="ページ内の未保護番組を全選択"
                                    />
                                </th>
                            {/if}
                            <th class="px-4 py-3 whitespace-nowrap min-w-[130px]">放送日時</th>
                            <th class="px-4 py-3 whitespace-nowrap min-w-[120px]">放送局</th>
                            <th class="px-4 py-3 min-w-[220px]">番組名 / 概要</th>
                            <th class="px-4 py-3 whitespace-nowrap min-w-[100px]">時間 / サイズ</th>
                            <th class="px-4 py-3 whitespace-nowrap min-w-[120px]">ドロップ</th>
                            <th class="px-4 py-3 text-right whitespace-nowrap w-px min-w-[160px]">再生 / 操作</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                        {#each recorded as item}
                            <tr
                                id="recorded-item-{item.id}"
                                onclick={() => {
                                    if (isSelectionMode) {
                                        if (!item.isProtected) toggleSelectItem(item.id);
                                    } else {
                                        openRecordedDetail(item);
                                    }
                                }}
                                class="transition {isSelectionMode ? 'cursor-pointer' : ''} {selectedIds.includes(
                                    item.id,
                                )
                                    ? 'bg-blue-50/80 dark:bg-blue-950/40'
                                    : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'}"
                            >
                                {#if isSelectionMode}
                                    <td class="w-12 px-3 py-3.5 text-center">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(item.id)}
                                            disabled={item.isProtected}
                                            onclick={e => e.stopPropagation()}
                                            onchange={() => toggleSelectItem(item.id)}
                                            aria-label={`${item.name}を選択`}
                                            class="form-checkbox disabled:opacity-30"
                                        />
                                    </td>
                                {/if}
                                <td
                                    class="whitespace-nowrap px-4 py-3.5 font-medium text-slate-500 dark:text-slate-400"
                                >
                                    <div>{formatDate(item.startAt)}</div>
                                    <div class="text-xs text-slate-400">{formatTime(item.startAt)}</div>
                                </td>
                                <td class="whitespace-nowrap px-4 py-3.5">
                                    <div class="flex items-center gap-1.5">
                                        <span
                                            class="rounded bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                        >
                                            {channelStore.getChannelName(item.channelId)}
                                        </span>
                                        {#if item.ruleId}
                                            <button
                                                type="button"
                                                onclick={e => {
                                                    e.stopPropagation();
                                                    selectRule(item.ruleId);
                                                }}
                                                class="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-blue-950 dark:hover:text-blue-300 transition-colors cursor-pointer"
                                                title="このルールの録画を絞り込み"
                                            >
                                                ルール
                                            </button>
                                        {/if}
                                    </div>
                                </td>
                                <td class="px-4 py-3.5">
                                    <div class="flex items-center gap-1.5">
                                        {#if item.isProtected}
                                            <span
                                                class="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-xs leading-none"
                                            >
                                                保護中
                                            </span>
                                        {/if}
                                        <button
                                            type="button"
                                            onclick={e => {
                                                e.stopPropagation();
                                                openRecordedDetail(item);
                                            }}
                                            class="program-title hover:text-blue-600 dark:hover:text-blue-400 text-left line-clamp-1 cursor-pointer transition-colors"
                                        >
                                            {item.name}
                                        </button>
                                    </div>
                                    {#if item.description}
                                        <div class="program-summary mt-0.5 line-clamp-1">
                                            {item.description}
                                        </div>
                                    {/if}
                                </td>
                                <td class="whitespace-nowrap px-4 py-3.5 text-slate-500 dark:text-slate-400">
                                    <div>{formatRecordedDuration(item)}</div>
                                    <div class="text-xs text-slate-400">
                                        {formatSize(getTotalVideoFileSize(item.videoFiles))}
                                    </div>
                                </td>
                                <td class="whitespace-nowrap px-4 py-3.5">
                                    {#if item.dropLogFile && (item.dropLogFile.dropCnt > 0 || item.dropLogFile.errorCnt > 0)}
                                        <span
                                            class="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                                            title={`Drop: ${item.dropLogFile.dropCnt}, Error: ${item.dropLogFile.errorCnt}, Scramble: ${item.dropLogFile.scramblingCnt}`}
                                        >
                                            <AlertTriangle size={11} /> Drop: {item.dropLogFile.dropCnt}
                                        </span>
                                    {:else if item.dropLogFile}
                                        <span
                                            class="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                                        >
                                            なし (0)
                                        </span>
                                    {:else}
                                        <span class="text-xs text-slate-400">-</span>
                                    {/if}
                                </td>
                                <td class="whitespace-nowrap px-4 py-3.5 text-right">
                                    <div class="flex items-center justify-end gap-2">
                                        <!-- 目立つ青色の再生ボタン -->
                                        {#if readOnlyStore.canPlayRecorded(item.videoFiles)}
                                            <button
                                                type="button"
                                                onclick={() => handlePlayClick(item)}
                                                class="flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-1.5 text-sm font-bold text-white shadow-xs transition hover:bg-blue-700 hover:shadow-md cursor-pointer shrink-0 whitespace-nowrap"
                                                title="今すぐ再生"
                                            >
                                                <Play size={15} fill="currentColor" /> 再生
                                            </button>
                                        {/if}

                                        <!-- 保護トグルボタン -->
                                        {#if !readOnlyStore.isReadOnly}
                                            <button
                                                type="button"
                                                onclick={() => toggleProtect(item)}
                                                class="rounded-lg p-2 shrink-0 {item.isProtected
                                                    ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                                                    : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200'} cursor-pointer transition-colors"
                                                title={item.isProtected ? '保護解除' : '番組を保護'}
                                            >
                                                {#if item.isProtected}
                                                    <Lock size={16} />
                                                {:else}
                                                    <Unlock size={16} />
                                                {/if}
                                            </button>

                                            <!-- 削除ボタン (保護中は不可視プレースホルダーで幅32pxを維持し再生ボタンのズレを防止) -->
                                            {#if !item.isProtected}
                                                <button
                                                    type="button"
                                                    onclick={() => deleteRecorded(item.id, item.name)}
                                                    class="rounded-lg p-2 shrink-0 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950 cursor-pointer transition-colors"
                                                    title="削除"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            {:else}
                                                <div class="h-8 w-8 shrink-0" aria-hidden="true"></div>
                                            {/if}
                                        {/if}
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {:else}
        <!-- コンパクトカード表示 (可変カラム: 260px以上で自動配置) -->
        <div class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
            {#each recorded as item}
                <div
                    id="recorded-item-{item.id}"
                    onclick={() => {
                        if (isSelectionMode) {
                            toggleSelectItem(item.id);
                            return;
                        }
                        openRecordedDetail(item);
                    }}
                    class="group relative flex flex-col justify-between overflow-hidden rounded-xl border bg-white shadow-2xs transition hover:shadow-md dark:bg-slate-900 cursor-pointer {isSelectionMode &&
                    selectedIds.includes(item.id)
                        ? 'border-blue-600 ring-2 ring-blue-600/70 bg-blue-50/20 dark:bg-blue-950/20'
                        : 'border-slate-200 hover:border-blue-400 dark:border-slate-800'}"
                    role="button"
                    tabindex="0"
                    onkeydown={e => {
                        if (e.key === 'Enter') {
                            if (isSelectionMode) {
                                toggleSelectItem(item.id);
                            } else {
                                openRecordedDetail(item);
                            }
                        }
                    }}
                >
                    <!-- サムネイルエリア (カードの一部として機能、中央ボタンのみ即座再生) -->
                    <div class="relative aspect-video w-full bg-slate-900 overflow-hidden">
                        <!-- 選択モード時のチェックボックス -->
                        {#if isSelectionMode}
                            <div
                                class="absolute top-2 left-2 z-20 flex h-8 w-8 items-center justify-center rounded-xl bg-black/75 backdrop-blur-xs shadow-md"
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(item.id)}
                                    disabled={item.isProtected}
                                    onclick={e => e.stopPropagation()}
                                    onchange={() => toggleSelectItem(item.id)}
                                    aria-label={`${item.name}を選択`}
                                    class="form-checkbox disabled:opacity-30 cursor-pointer"
                                />
                            </div>
                        {/if}

                        {#if item.thumbnails?.[0]}
                            <img
                                src={`/api/thumbnails/${item.thumbnails[0]}`}
                                alt={item.name}
                                loading="lazy"
                                decoding="async"
                                class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                            />
                        {:else}
                            <div class="flex h-full w-full items-center justify-center text-slate-600">
                                <Video size={28} />
                            </div>
                        {/if}

                        <!-- 再生ボタンオーバーレイ (丸ボタンクリック時のみ再生、選択モード時は非表示) -->
                        {#if !isSelectionMode && readOnlyStore.canPlayRecorded(item.videoFiles)}
                            <div
                                class="absolute inset-0 flex items-center justify-center bg-black/25 opacity-90 transition group-hover:bg-black/15"
                            >
                                <button
                                    type="button"
                                    onclick={e => {
                                        e.stopPropagation();
                                        handlePlayClick(item);
                                    }}
                                    class="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl transition duration-150 hover:scale-110 hover:bg-blue-500 cursor-pointer"
                                    title="今すぐ動画を再生"
                                >
                                    <Play size={24} fill="currentColor" class="translate-x-0.5" />
                                </button>
                            </div>
                        {/if}

                        <span
                            class="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1 py-0.5 text-[9px] font-bold text-white leading-none"
                        >
                            {formatRecordedDuration(item)}
                        </span>

                        {#if item.isProtected}
                            <span
                                class="absolute {isSelectionMode
                                    ? 'top-2.5 left-9.5'
                                    : 'top-1.5 left-1.5'} z-10 flex items-center gap-1 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-xs font-bold text-white shadow-2xs leading-none"
                            >
                                <Lock size={12} /> 保護中
                            </span>
                        {/if}
                    </div>

                    <!-- カード本文 (コンパクト) -->
                    <div class="flex flex-1 flex-col justify-between p-3">
                        <div>
                            <div class="flex items-center justify-between gap-2">
                                <div class="flex items-center gap-1.5 min-w-0 max-w-[68%]">
                                    <span
                                        class="truncate rounded-lg bg-blue-50 px-2.5 py-0.5 text-sm font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                    >
                                        {channelStore.getChannelName(item.channelId)}
                                    </span>
                                    {#if item.ruleId}
                                        <button
                                            type="button"
                                            onclick={e => {
                                                e.stopPropagation();
                                                selectRule(item.ruleId);
                                            }}
                                            class="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-blue-950 dark:hover:text-blue-300 transition-colors cursor-pointer shrink-0"
                                            title="このルールの録画を絞り込み"
                                        >
                                            ルール
                                        </button>
                                    {/if}
                                </div>
                                <span class="text-sm font-medium text-slate-400 shrink-0">
                                    {formatSize(getTotalVideoFileSize(item.videoFiles))}
                                </span>
                            </div>
                            <h3
                                class="program-title mt-2 line-clamp-2 transition group-hover:text-blue-600 dark:group-hover:text-blue-400"
                                title={item.name}
                            >
                                {item.name}
                            </h3>
                            {#if item.description}
                                <p class="program-summary mt-1.5 line-clamp-1">
                                    {item.description}
                                </p>
                            {/if}
                        </div>

                        <!-- 下部メタ & アクションボタン -->
                        <div
                            class="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-sm text-slate-400 dark:border-slate-800"
                        >
                            <span class="font-medium text-sm">
                                {formatDate(item.startAt)}
                                {formatTime(item.startAt)}
                            </span>
                            <div class="flex items-center gap-1">
                                {#if !readOnlyStore.isReadOnly}
                                    <button
                                        type="button"
                                        onclick={e => {
                                            e.stopPropagation();
                                            toggleProtect(item);
                                        }}
                                        class="rounded-lg p-2 {item.isProtected
                                            ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                                            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200'} cursor-pointer transition-colors"
                                        title={item.isProtected ? '保護解除' : '番組を保護'}
                                    >
                                        {#if item.isProtected}
                                            <Lock size={16} />
                                        {:else}
                                            <Unlock size={16} />
                                        {/if}
                                    </button>
                                    {#if !item.isProtected}
                                        <button
                                            type="button"
                                            onclick={e => {
                                                e.stopPropagation();
                                                deleteRecorded(item.id, item.name);
                                            }}
                                            class="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950 cursor-pointer transition-colors"
                                            title="削除"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    {/if}
                                {/if}
                            </div>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}

    <!-- ページネーションコントロール -->
    <Pagination {currentPage} {total} {limit} onPageChange={changePage} />

    <!-- フローティング一括操作バー (画面下部固定) -->
    {#if isSelectionMode}
        <div
            class="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2.5 sm:gap-4 rounded-2xl border border-slate-700/80 bg-slate-900/95 px-4 py-3 shadow-2xl backdrop-blur-md text-white animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
            <div class="flex items-center gap-2 border-r border-slate-700 pr-3 sm:pr-4">
                <CheckSquare size={18} class="text-blue-400" />
                <span class="text-xs font-bold whitespace-nowrap">
                    <span class="text-sm text-blue-400 font-extrabold">{selectedIds.length}</span>
                    件選択中
                </span>
            </div>

            <div class="flex items-center gap-2">
                <button
                    type="button"
                    onclick={toggleSelectAll}
                    class="rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition cursor-pointer"
                >
                    {isAllSelected ? '選択全解除' : 'すべて選択'}
                </button>
                {#if selectedIds.length > 0}
                    <button
                        type="button"
                        onclick={clearSelection}
                        class="hidden sm:inline-block rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition cursor-pointer"
                    >
                        解除
                    </button>
                    <button
                        type="button"
                        disabled={isDeletingMultiple}
                        onclick={deleteSelectedRecorded}
                        class="flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-md transition disabled:opacity-50 cursor-pointer"
                    >
                        <Trash2 size={14} />
                        <span>{isDeletingMultiple ? '削除中...' : '一括削除'}</span>
                    </button>
                {/if}
                <button
                    type="button"
                    onclick={toggleSelectionMode}
                    class="rounded-xl bg-slate-800/80 hover:bg-slate-700 p-1.5 text-slate-400 hover:text-white transition cursor-pointer"
                    title="選択モードを終了"
                >
                    <X size={16} />
                </button>
            </div>
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
