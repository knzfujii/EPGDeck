<script lang="ts">
    import { onMount } from 'svelte';
    import { router } from '../../router.svelte';
    import { themeStore } from '../../stores/theme.svelte';
    import http from '@/lib/httpClient';
    import { readOnlyStore } from '../../stores/readOnly.svelte';
    import { confirmDialog } from '../../stores/confirm.svelte';
    import { snackbar } from '../../stores/snackbar.svelte';
    import { Moon, Sun, Menu, Lock, Unlock } from '@lucide/svelte';

    let { title = 'EPGDeck', onToggleDrawer }: { title?: string; onToggleDrawer?: () => void } = $props();

    let appVersion = $state<string>('');

    onMount(async () => {
        try {
            const res = await http.get('/api/version');
            if (res.data?.version) {
                appVersion = res.data.version;
            }
        } catch (e) {
            // ignore
        }
    });

    async function handleLock() {
        const ok = await confirmDialog({
            title: '閲覧専用モードに戻す',
            message: '管理者モードを終了し、閲覧専用モード（ロック状態）に戻しますか？',
            confirmText: 'ロックする',
            cancelText: 'キャンセル',
        });
        if (ok) {
            await readOnlyStore.lock();
            snackbar.open({ text: '閲覧専用モードに戻しました', color: 'info' });
        }
    }
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

    <div class="flex items-center gap-2">
        {#if readOnlyStore.enabled}
            {#if readOnlyStore.isReadOnly}
                <button
                    type="button"
                    onclick={() => readOnlyStore.openUnlockModal()}
                    class="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300 dark:hover:bg-amber-900/60 transition cursor-pointer"
                    title="パスワードを入力して管理者モードへ切り替える"
                >
                    <Lock size={13} class="text-amber-600 dark:text-amber-400" />
                    <span>閲覧専用</span>
                </button>
            {:else}
                <button
                    type="button"
                    onclick={handleLock}
                    class="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60 transition cursor-pointer"
                    title="クリックして閲覧専用モード（ロック）に戻す"
                >
                    <Unlock size={13} class="text-emerald-600 dark:text-emerald-400" />
                    <span class="hidden sm:inline">管理者モード</span>
                    <span class="sm:hidden">管理者</span>
                </button>
            {/if}
        {/if}

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
