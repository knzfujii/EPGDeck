<script lang="ts">
    import { onMount, onDestroy, tick } from 'svelte';
    import { router } from '../../router.svelte';
    import { readOnlyStore } from '../../stores/readOnly.svelte';
    import { Search, X, CalendarSearch, Video, ArrowLeft } from '@lucide/svelte';
    import IconButton from '../common/IconButton.svelte';

    let query = $state('');
    let isFocused = $state(false);
    let isMobileOpen = $state(false);
    let selectedIndex = $state(0);

    let desktopInputRef = $state<HTMLInputElement | null>(null);
    let mobileInputRef = $state<HTMLInputElement | null>(null);
    let containerRef = $state<HTMLDivElement | null>(null);

    // 現在の画面が番組表・番組検索画面かどうか
    let isProgramContext = $derived(
        router.current.path.startsWith('/guide') || router.current.path.startsWith('/search'),
    );

    // 検索可能なオプション一覧
    interface SearchTarget {
        id: 'program' | 'recorded';
        title: string;
        subText: string;
        path: string;
        icon: typeof CalendarSearch;
    }

    let availableTargets = $derived.by<SearchTarget[]>(() => {
        const trimmed = query.trim();
        const targets: SearchTarget[] = [];

        // 1. 録画一覧から検索（最上位）
        targets.push({
            id: 'recorded',
            title: '録画一覧から検索',
            subText: '録画済みライブラリ',
            path: `/recorded?keyword=${encodeURIComponent(trimmed)}`,
            icon: Video,
        });

        // 2. 番組表から検索
        if (readOnlyStore.canViewSearch) {
            targets.push({
                id: 'program',
                title: '番組表から検索',
                subText: 'これからの放送・予約',
                path: `/search?keyword=${encodeURIComponent(trimmed)}`,
                icon: CalendarSearch,
            });
        }

        return targets;
    });

    // ポップオーバーを表示するか
    let isPopoverOpen = $derived((isFocused || isMobileOpen) && query.trim().length > 0 && availableTargets.length > 0);

    // コンテキストに応じた初期インデックスの設定
    $effect(() => {
        if (query.trim()) {
            if (isProgramContext) {
                const programIdx = availableTargets.findIndex(t => t.id === 'program');
                selectedIndex = programIdx >= 0 ? programIdx : 0;
            } else {
                selectedIndex = 0; // デフォルトは最上位の「録画一覧から検索」
            }
        }
    });

    function executeSearch(target: SearchTarget) {
        if (!query.trim()) return;
        const destination = target.path;

        // 状態リセット
        isFocused = false;
        isMobileOpen = false;
        desktopInputRef?.blur();
        mobileInputRef?.blur();

        router.push(destination);
    }

    function handleKeyDown(e: KeyboardEvent) {
        if (!isPopoverOpen) {
            if (e.key === 'Enter' && query.trim()) {
                e.preventDefault();
                const defaultTarget = isProgramContext
                    ? availableTargets.find(t => t.id === 'program') || availableTargets[0]
                    : availableTargets[0];
                if (defaultTarget) executeSearch(defaultTarget);
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % availableTargets.length;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + availableTargets.length) % availableTargets.length;
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const target = availableTargets[selectedIndex];
            if (target) {
                executeSearch(target);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            isFocused = false;
            isMobileOpen = false;
            desktopInputRef?.blur();
            mobileInputRef?.blur();
        }
    }

    // グローバルショートカット (/ および Ctrl+K / Cmd+K)
    function handleGlobalKeyDown(e: KeyboardEvent) {
        // 入力中なら無効
        const target = e.target as HTMLElement | null;
        const isInputElement =
            target &&
            (target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'SELECT' ||
                target.isContentEditable);

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            focusSearch();
            return;
        }

        if (e.key === '/' && !isInputElement) {
            e.preventDefault();
            focusSearch();
        }
    }

    async function focusSearch() {
        if (window.innerWidth < 768) {
            isMobileOpen = true;
            await tick();
            mobileInputRef?.focus();
            mobileInputRef?.select();
        } else {
            isFocused = true;
            await tick();
            desktopInputRef?.focus();
            desktopInputRef?.select();
        }
    }

    // 画面外クリック検知
    function handleClickOutside(e: MouseEvent) {
        if (containerRef && !containerRef.contains(e.target as Node)) {
            isFocused = false;
        }
    }

    onMount(() => {
        window.addEventListener('keydown', handleGlobalKeyDown);
        window.addEventListener('mousedown', handleClickOutside);
    });

    onDestroy(() => {
        if (typeof window !== 'undefined') {
            window.removeEventListener('keydown', handleGlobalKeyDown);
            window.removeEventListener('mousedown', handleClickOutside);
        }
    });

    function clearQuery() {
        query = '';
        if (isMobileOpen) {
            mobileInputRef?.focus();
        } else {
            desktopInputRef?.focus();
        }
    }

    async function openMobileSearch() {
        isMobileOpen = true;
        await tick();
        mobileInputRef?.focus();
    }

    function closeMobileSearch() {
        isMobileOpen = false;
        query = '';
    }
</script>

<div
    class="relative flex items-center mx-2 md:mx-4 md:flex-1 md:justify-center md:max-w-md lg:max-w-lg"
    bind:this={containerRef}
>
    <!-- 1. デスクトップ表示（md 以上）: ヘッダー中央に常時表示 -->
    <div class="relative hidden md:flex items-center w-full transition-all">
        <div class="pointer-events-none absolute left-3 flex items-center text-slate-400 dark:text-slate-500">
            <Search size={16} />
        </div>
        <input
            bind:this={desktopInputRef}
            type="text"
            bind:value={query}
            onfocus={() => (isFocused = true)}
            onkeydown={handleKeyDown}
            placeholder={isProgramContext ? '番組・録画を検索...' : '録画・番組を検索...'}
            class="h-9 w-full rounded-xl border border-slate-200 bg-slate-100/80 py-1.5 pl-9 pr-14 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:bg-slate-900 transition"
        />

        <!-- 右端のアクション: クリアボタン or ショートカットバッジ -->
        <div class="absolute right-2.5 flex items-center gap-1">
            {#if query}
                <button
                    type="button"
                    onclick={clearQuery}
                    class="rounded-md p-0.5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition cursor-pointer"
                    aria-label="検索ワードをクリア"
                >
                    <X size={14} />
                </button>
            {:else}
                <kbd
                    class="pointer-events-none hidden items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 shadow-2xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500 lg:inline-flex"
                >
                    /
                </kbd>
            {/if}
        </div>

        <!-- デスクトップ用 ポップオーバーメニュー -->
        {#if isPopoverOpen}
            <div
                class="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 animate-in fade-in-0 zoom-in-95 duration-100"
            >
                <div class="px-2 py-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                    検索先を選択 (↑↓ で選択, Enter で実行)
                </div>
                {#each availableTargets as target, idx}
                    {@const isSelected = idx === selectedIndex}
                    {@const TargetIcon = target.icon}
                    <button
                        type="button"
                        onmouseenter={() => (selectedIndex = idx)}
                        onclick={() => executeSearch(target)}
                        class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition cursor-pointer {isSelected
                            ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200'
                            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}"
                    >
                        <div
                            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg {isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}"
                        >
                            <TargetIcon size={16} />
                        </div>
                        <div class="min-w-0 flex-1">
                            <p class="truncate text-sm font-bold leading-tight">{target.title}</p>
                            <p class="text-xs text-slate-400 dark:text-slate-500">{target.subText}</p>
                        </div>
                    </button>
                {/each}
            </div>
        {/if}
    </div>

    <!-- 2. モバイル表示（md 未満）: 虫眼鏡アイコンボタン -->
    <div class="flex md:hidden">
        <IconButton variant="ghost" onclick={openMobileSearch} aria-label="検索を開く" title="検索">
            <Search size={20} />
        </IconButton>
    </div>

    <!-- モバイル用 フル幅検索オーバーレイ（展開時） -->
    {#if isMobileOpen}
        <div
            class="fixed inset-x-0 top-0 z-50 flex h-16 items-center border-b border-slate-200 bg-white px-3 gap-2 dark:border-slate-800 dark:bg-slate-900 shadow-md animate-in fade-in slide-in-from-top-2 duration-150"
        >
            <IconButton variant="ghost" onclick={closeMobileSearch} aria-label="検索を閉じる">
                <ArrowLeft size={20} />
            </IconButton>

            <div class="relative flex-1">
                <input
                    bind:this={mobileInputRef}
                    type="text"
                    bind:value={query}
                    onkeydown={handleKeyDown}
                    placeholder="番組・録画を検索..."
                    class="h-10 w-full rounded-xl border border-slate-200 bg-slate-100 py-2 pl-3 pr-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:bg-slate-900"
                />
                {#if query}
                    <button
                        type="button"
                        onclick={clearQuery}
                        class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 cursor-pointer"
                        aria-label="クリア"
                    >
                        <X size={16} />
                    </button>
                {/if}
            </div>

            <!-- モバイル用 ポップオーバーメニュー（インラインドロップダウン） -->
            {#if isPopoverOpen}
                <div
                    class="absolute inset-x-0 top-16 z-50 border-b border-slate-200 bg-white/98 p-2 shadow-2xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/98 animate-in fade-in slide-in-from-top-1 duration-100"
                >
                    {#each availableTargets as target, idx}
                        {@const isSelected = idx === selectedIndex}
                        {@const TargetIcon = target.icon}
                        <button
                            type="button"
                            onclick={() => executeSearch(target)}
                            class="flex w-full items-center gap-3 rounded-xl p-3 text-left transition cursor-pointer {isSelected
                                ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200'
                                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}"
                        >
                            <div
                                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg {isSelected
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}"
                            >
                                <TargetIcon size={18} />
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="truncate text-sm font-bold leading-tight">{target.title}</p>
                                <p class="text-xs text-slate-400 dark:text-slate-500">{target.subText}</p>
                            </div>
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
</div>
