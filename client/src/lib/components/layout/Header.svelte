<script lang="ts">
    import { onMount } from 'svelte';
    import { router } from '../../router.svelte';
    import { themeStore } from '../../stores/theme.svelte';
    import axios from 'axios';
    import { Moon, Sun, Menu } from '@lucide/svelte';

    let { title = 'EPGDeck', onToggleDrawer }: { title?: string; onToggleDrawer?: () => void } = $props();

    let appVersion = $state<string>('');

    onMount(async () => {
        try {
            const res = await axios.get('/api/version');
            if (res.data?.version) {
                appVersion = res.data.version;
            }
        } catch (e) {
            // ignore
        }
    });
</script>

<header class="sticky top-0 z-30 flex h-14 w-full shrink-0 items-center justify-between border-b border-slate-200 bg-white/90 px-3 sm:px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
    <div class="flex items-center gap-2 sm:gap-3">
        <button
            type="button"
            onclick={() => onToggleDrawer?.()}
            class="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="メニューを開閉"
        >
            <Menu size={20} />
        </button>

        <button
            type="button"
            onclick={() => router.push('/')}
            class="flex items-center gap-1.5 text-base sm:text-lg font-black tracking-tight text-blue-600 hover:opacity-80 dark:text-blue-400 cursor-pointer"
        >
            <span>{title}</span>
            {#if appVersion}
                <span class="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    v{appVersion}
                </span>
            {/if}
        </button>
    </div>

    <div class="flex items-center gap-1.5">
        <button
            type="button"
            onclick={() => themeStore.toggle()}
            class="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="テーマ切り替え"
        >
            {#if themeStore.isDark}
                <Sun size={18} class="text-amber-400" />
            {:else}
                <Moon size={18} class="text-slate-600" />
            {/if}
        </button>
    </div>
</header>
