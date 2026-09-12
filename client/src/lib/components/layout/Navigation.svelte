<script lang="ts">
    import { router } from '../../router.svelte';
    import { readOnlyStore } from '../../stores/readOnly.svelte';
    import {
        LayoutDashboard,
        Tv,
        Calendar,
        Video,
        Clock,
        Search,
        SlidersHorizontal,
        Film,
        Settings,
        Terminal,
        X,
    } from '@lucide/svelte';

    let {
        isMobileOpen = false,
        isDesktopCollapsed = false,
        onCloseMobile,
    }: {
        isMobileOpen?: boolean;
        isDesktopCollapsed?: boolean;
        onCloseMobile?: () => void;
    } = $props();

    const mainNavItems = $derived.by(() => {
        const items: Array<{ label: string; path: string; icon: any }> = [];

        if (readOnlyStore.canViewDashboard) {
            items.push({ label: 'ダッシュボード', path: '/', icon: LayoutDashboard });
        }
        if (readOnlyStore.canLiveStream) {
            items.push({ label: '放送中', path: '/onair', icon: Tv });
        }
        // 番組表・録画一覧・予約一覧は常時表示
        items.push(
            { label: '番組表', path: '/guide', icon: Calendar },
            { label: '録画一覧', path: '/recorded', icon: Video },
            { label: '予約一覧', path: '/reserves', icon: Clock },
        );
        return items;
    });

    const subNavItems = $derived.by(() => {
        const items: Array<{ label: string; path: string; icon: any }> = [];

        if (readOnlyStore.canViewSearch) {
            items.push({ label: '番組検索', path: '/search', icon: Search });
        }
        if (readOnlyStore.canViewRules) {
            items.push({ label: 'ルール一覧', path: '/rule', icon: SlidersHorizontal });
        }
        if (readOnlyStore.canViewEncode) {
            items.push({ label: 'エンコード一覧', path: '/encode', icon: Film });
        }
        if (!readOnlyStore.isReadOnly) {
            items.push(
                { label: 'システムログ', path: '/logs', icon: Terminal },
                { label: '設定', path: '/settings', icon: Settings },
            );
        }
        return items;
    });

    function navigate(path: string) {
        router.push(path);
        if (onCloseMobile) onCloseMobile();
    }
</script>

<!-- PC サイドバー (デスクトップ) -->
{#if !isDesktopCollapsed}
    <aside
        class="hidden lg:flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
    >
        <div class="mb-3 px-3 py-1.5">
            <span class="text-xs font-black tracking-widest text-slate-400 uppercase">Menu</span>
        </div>
        <nav class="space-y-1">
            {#each mainNavItems as item}
                {@const isActive =
                    router.current.pathname === item.path ||
                    (item.path !== '/' && router.current.pathname.startsWith(item.path))}
                <button
                    type="button"
                    onclick={() => navigate(item.path)}
                    class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer {isActive
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 font-bold shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'}"
                >
                    <item.icon size={18} class="shrink-0" />
                    <span class="truncate">{item.label}</span>
                </button>
            {/each}

            {#if subNavItems.length > 0}
                <!-- セクションパーティション線 -->
                <div class="my-2 border-t border-slate-200 dark:border-slate-800"></div>

                {#each subNavItems as item}
                    {@const isActive =
                        router.current.pathname === item.path ||
                        (item.path !== '/' && router.current.pathname.startsWith(item.path))}
                    <button
                        type="button"
                        onclick={() => navigate(item.path)}
                        class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer {isActive
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 font-bold shadow-2xs'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'}"
                    >
                        <item.icon size={18} class="shrink-0" />
                        <span class="truncate">{item.label}</span>
                    </button>
                {/each}
            {/if}
        </nav>
    </aside>
{/if}

<!-- モバイル用ドロワー (スマホ / タブレット) -->
{#if isMobileOpen}
    <div class="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true">
        <!-- バックドロップ -->
        <button
            type="button"
            class="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
            onclick={onCloseMobile}
            aria-label="オーバーレイを閉じる"
        ></button>

        <!-- ドロワーコンテンツ (幅を w-56 にスリム化) -->
        <div
            class="relative flex w-56 max-w-[75vw] flex-1 flex-col bg-white p-3.5 pt-safe pb-safe shadow-2xl dark:bg-slate-900"
        >
            <div class="flex items-center justify-between px-1.5 py-1">
                <span class="text-lg font-black tracking-wider text-blue-600 dark:text-blue-400">EPGDeck</span>
                <button
                    type="button"
                    onclick={onCloseMobile}
                    class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
                    aria-label="閉じる"
                >
                    <X size={20} />
                </button>
            </div>
            <nav class="mt-3 space-y-1 overflow-y-auto">
                {#each mainNavItems as item}
                    {@const isActive =
                        router.current.pathname === item.path ||
                        (item.path !== '/' && router.current.pathname.startsWith(item.path))}
                    <button
                        type="button"
                        onclick={() => navigate(item.path)}
                        class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer {isActive
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 font-bold'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'}"
                    >
                        <item.icon size={19} class="shrink-0" />
                        <span class="truncate">{item.label}</span>
                    </button>
                {/each}

                {#if subNavItems.length > 0}
                    <!-- セクションパーティション線 -->
                    <div class="my-2 border-t border-slate-200 dark:border-slate-800"></div>

                    {#each subNavItems as item}
                        {@const isActive =
                            router.current.pathname === item.path ||
                            (item.path !== '/' && router.current.pathname.startsWith(item.path))}
                        <button
                            type="button"
                            onclick={() => navigate(item.path)}
                            class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer {isActive
                                ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 font-bold'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'}"
                        >
                            <item.icon size={19} class="shrink-0" />
                            <span class="truncate">{item.label}</span>
                        </button>
                    {/each}
                {/if}
            </nav>
        </div>
    </div>
{/if}
