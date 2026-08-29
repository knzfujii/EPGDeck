<script lang="ts">
    import { onMount } from 'svelte';
    import { router } from './lib/router.svelte';
    import Header from './lib/components/layout/Header.svelte';
    import Navigation from './lib/components/layout/Navigation.svelte';
    import Snackbar from './lib/components/common/Snackbar.svelte';

    // ルートコンポーネントのインポート
    import Dashboard from './routes/Dashboard.svelte';
    import OnAir from './routes/OnAir.svelte';
    import Guide from './routes/Guide.svelte';
    import Recorded from './routes/Recorded.svelte';
    import Reserves from './routes/Reserves.svelte';
    import ManualReserve from './routes/ManualReserve.svelte';
    import Search from './routes/Search.svelte';
    import Rule from './routes/Rule.svelte';
    import Encode from './routes/Encode.svelte';
    import Storages from './routes/Storages.svelte';
    import Settings from './routes/Settings.svelte';
    import Watch from './routes/Watch.svelte';
    import RecordedDetail from './routes/RecordedDetail.svelte';

    let isMobileOpen = $state(false);
    let isDesktopCollapsed = $state(false);

    function toggleDrawer() {
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
            isMobileOpen = !isMobileOpen;
        } else {
            isDesktopCollapsed = !isDesktopCollapsed;
        }
    }

    let currentRouteComponent = $derived.by(() => {
        const path = router.current.pathname;

        if (path === '/' || path === '/dashboard') return Dashboard;
        if (path === '/onair/watch' || path === '/recorded/watch') return Watch;
        if (path === '/recorded/detail') return RecordedDetail;
        if (path === '/onair') return OnAir;
        if (path === '/guide') return Guide;
        if (path === '/recorded') return Recorded;
        if (path === '/reserves/manual') return ManualReserve;
        if (path === '/reserves') return Reserves;
        if (path === '/search') return Search;
        if (path === '/rule') return Rule;
        if (path === '/encode') return Encode;
        if (path === '/storages') return Storages;
        if (path === '/settings') return Settings;

        return Dashboard;
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
                {#key router.current.path}
                    {@const Component = currentRouteComponent}
                    <Component />
                {/key}
            </div>
        </main>
    </div>

    <!-- グローバルトースト通知 -->
    <Snackbar />
</div>
