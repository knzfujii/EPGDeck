<script lang="ts">
    import { onMount, onDestroy, type Component as SvelteComponent } from 'svelte';
    import { router } from './lib/router.svelte';
    import { socketStore } from './lib/stores/socket.svelte';
    import Header from './lib/components/layout/Header.svelte';
    import Navigation from './lib/components/layout/Navigation.svelte';
    import Snackbar from './lib/components/common/Snackbar.svelte';
    import { Loader2 } from '@lucide/svelte';

    type RouteLoader = () => Promise<{ default: any }>;

    const routeLoaders: Record<string, RouteLoader> = {
        '/': () => import('./routes/Dashboard.svelte'),
        '/dashboard': () => import('./routes/Dashboard.svelte'),
        '/onair/watch': () => import('./routes/Watch.svelte'),
        '/recorded/watch': () => import('./routes/Watch.svelte'),
        '/recorded/detail': () => import('./routes/RecordedDetail.svelte'),
        '/onair': () => import('./routes/OnAir.svelte'),
        '/guide': () => import('./routes/Guide.svelte'),
        '/recorded': () => import('./routes/Recorded.svelte'),
        '/reserves/manual': () => import('./routes/ManualReserve.svelte'),
        '/reserves': () => import('./routes/Reserves.svelte'),
        '/search': () => import('./routes/Search.svelte'),
        '/rule': () => import('./routes/Rule.svelte'),
        '/rule/edit': () => import('./routes/RuleEdit.svelte'),
        '/encode': () => import('./routes/Encode.svelte'),
        '/storages': () => import('./routes/Storages.svelte'),
        '/settings': () => import('./routes/Settings.svelte'),
        '/logs': () => import('./routes/Logs.svelte'),
    };

    let isMobileOpen = $state(false);
    let isDesktopCollapsed = $state(false);

    let CurrentComponent = $state<any>(null);
    let isPageLoading = $state(true);

    $effect(() => {
        const path = router.pathname;
        const loader = routeLoaders[path];

        isPageLoading = true;
        if (loader) {
            loader()
                .then(mod => {
                    CurrentComponent = mod.default;
                })
                .catch(err => {
                    console.error('Failed to load page component:', err);
                })
                .finally(() => {
                    isPageLoading = false;
                });
        } else {
            import('./routes/NotFound.svelte')
                .then(mod => {
                    CurrentComponent = mod.default;
                })
                .finally(() => {
                    isPageLoading = false;
                });
        }
    });

    function toggleDrawer() {
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
            isMobileOpen = !isMobileOpen;
        } else {
            isDesktopCollapsed = !isDesktopCollapsed;
        }
    }

    onMount(() => {
        socketStore.init();
    });

    onDestroy(() => {
        socketStore.destroy();
    });
</script>

<div class="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
    <Navigation {isMobileOpen} {isDesktopCollapsed} onCloseMobile={() => (isMobileOpen = false)} />

    <div class="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Header onToggleDrawer={toggleDrawer} />

        <main class="relative flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
            {#if isPageLoading && !CurrentComponent}
                <div class="flex h-64 items-center justify-center">
                    <Loader2 size={32} class="animate-spin text-blue-600 dark:text-blue-400" />
                </div>
            {:else if CurrentComponent}
                <CurrentComponent />
            {/if}
        </main>
    </div>

    <Snackbar />
</div>
