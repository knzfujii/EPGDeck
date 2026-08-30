<script lang="ts">
    import { onMount, onDestroy, type Component as SvelteComponent } from 'svelte';
    import { router } from './lib/router.svelte';
    import { socketStore } from './lib/stores/socket.svelte';
    import Header from './lib/components/layout/Header.svelte';
    import Navigation from './lib/components/layout/Navigation.svelte';
    import Snackbar from './lib/components/common/Snackbar.svelte';

    import Dashboard from './routes/Dashboard.svelte';
    import Watch from './routes/Watch.svelte';
    import RecordedDetail from './routes/RecordedDetail.svelte';
    import OnAir from './routes/OnAir.svelte';
    import Guide from './routes/Guide.svelte';
    import Recorded from './routes/Recorded.svelte';
    import ManualReserve from './routes/ManualReserve.svelte';
    import Reserves from './routes/Reserves.svelte';
    import Search from './routes/Search.svelte';
    import Rule from './routes/Rule.svelte';
    import Encode from './routes/Encode.svelte';
    import Storages from './routes/Storages.svelte';
    import Settings from './routes/Settings.svelte';
    import Logs from './routes/Logs.svelte';

    const routes: Record<string, any> = {
        '/': Dashboard,
        '/dashboard': Dashboard,
        '/onair/watch': Watch,
        '/recorded/watch': Watch,
        '/recorded/detail': RecordedDetail,
        '/onair': OnAir,
        '/guide': Guide,
        '/recorded': Recorded,
        '/reserves/manual': ManualReserve,
        '/reserves': Reserves,
        '/search': Search,
        '/rule': Rule,
        '/encode': Encode,
        '/storages': Storages,
        '/settings': Settings,
        '/logs': Logs,
    };

    let isMobileOpen = $state(false);
    let isDesktopCollapsed = $state(false);

    let CurrentComponent = $derived(routes[router.pathname] || Dashboard);

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

<div class="flex min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
    <!-- ナビゲーションサイドバー -->
    <Navigation
        {isMobileOpen}
        {isDesktopCollapsed}
        onCloseMobile={() => isMobileOpen = false}
    />

    <!-- メインエリア -->
    <div class="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <Header onToggleDrawer={toggleDrawer} />

        <main class="w-full min-w-0 flex-1 p-3 sm:p-5 lg:p-6 overflow-x-hidden">
            <div class="w-full min-w-0">
                {#key router.path}
                    {@const Component = CurrentComponent}
                    <Component />
                {/key}
            </div>
        </main>
    </div>

    <!-- グローバルトースト通知 -->
    <Snackbar />
</div>
