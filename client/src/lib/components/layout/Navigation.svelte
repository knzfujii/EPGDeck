<script lang="ts">
    import { router } from '../../router.svelte';
    import {
        LayoutDashboard,
        Tv,
        Calendar,
        Video,
        Clock,
        Search,
        SlidersHorizontal,
        Film,
        HardDrive,
        Settings,
        Terminal,
        X
    } from '@lucide/svelte';

    let { isMobileOpen = false, isDesktopCollapsed = false, onCloseMobile }: {
        isMobileOpen?: boolean;
        isDesktopCollapsed?: boolean;
        onCloseMobile?: () => void;
    } = $props();

    const navItems = [
        { label: 'ダッシュボード', path: '/', icon: LayoutDashboard },
        { label: '放映中', path: '/onair', icon: Tv },
        { label: '番組表', path: '/guide', icon: Calendar },
        { label: '録画済み', path: '/recorded', icon: Video },
        { label: '予約一覧', path: '/reserves', icon: Clock },
        { label: '番組検索', path: '/search', icon: Search },
        { label: 'ルール管理', path: '/rule', icon: SlidersHorizontal },
        { label: 'エンコード', path: '/encode', icon: Film },
        { label: 'システムログ', path: '/logs', icon: Terminal },
        { label: '設定', path: '/settings', icon: Settings },
    ];

    function navigate(path: string) {
        router.push(path);
        if (onCloseMobile) onCloseMobile();
    }
</script>

<!-- PC サイドバー (デスクトップ) -->
{#if !isDesktopCollapsed}
    <aside class="hidden md:flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div class="mb-4 px-3 py-2">
            <span class="text-xs font-black tracking-widest text-slate-400 uppercase">Menu</span>
        </div>
        <nav class="space-y-1">
            {#each navItems as item}
                {@const isActive = router.current.pathname === item.path || (item.path !== '/' && router.current.pathname.startsWith(item.path))}
                <button
                    type="button"
                    onclick={() => navigate(item.path)}
                    class="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors cursor-pointer {isActive
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 font-bold shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'}"
                >
                    <item.icon size={19} class="shrink-0" />
                    <span class="truncate">{item.label}</span>
                </button>
            {/each}
        </nav>
    </aside>
{/if}

<!-- モバイル用ドロワー (スマホ / タブレット) -->
{#if isMobileOpen}
    <div class="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true">
        <!-- バックドロップ -->
        <button
            type="button"
            class="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
            onclick={onCloseMobile}
            aria-label="オーバーレイを閉じる"
        ></button>

        <!-- ドロワーコンテンツ -->
        <div class="relative flex w-68 max-w-[85vw] flex-1 flex-col bg-white p-4 shadow-2xl dark:bg-slate-900">
            <div class="flex items-center justify-between px-2 py-2">
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
            <nav class="mt-4 space-y-1.5 overflow-y-auto">
                {#each navItems as item}
                    {@const isActive = router.current.pathname === item.path || (item.path !== '/' && router.current.pathname.startsWith(item.path))}
                    <button
                        type="button"
                        onclick={() => navigate(item.path)}
                        class="flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold transition-colors cursor-pointer {isActive
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 font-bold'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'}"
                    >
                        <item.icon size={20} class="shrink-0" />
                        <span>{item.label}</span>
                    </button>
                {/each}
            </nav>
        </div>
    </div>
{/if}
