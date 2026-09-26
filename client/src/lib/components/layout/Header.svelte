<script lang="ts">
    import { onMount } from 'svelte';
    import { router } from '../../router.svelte';
    import { themeStore } from '../../stores/theme.svelte';
    import api from '@/lib/apiClient';
    import { readOnlyStore } from '../../stores/readOnly.svelte';
    import { confirmDialog } from '../../stores/confirm.svelte';
    import { snackbar } from '../../stores/snackbar.svelte';
    import { Moon, Sun, Monitor, Menu, Lock, Unlock } from '@lucide/svelte';
    import IconButton from '../common/IconButton.svelte';

    let { title = 'EPGDeck', onToggleDrawer }: { title?: string; onToggleDrawer?: () => void } = $props();

    let appVersion = $state<string>('');

    onMount(async () => {
        try {
            const res = await api.version.$get();
            if (res.ok) {
                const data = await res.json();
                if (data?.version) {
                    appVersion = data.version;
                }
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

<header
    class="sticky top-0 z-30 flex h-16 w-full shrink-0 items-center justify-between border-b border-slate-200 bg-white/90 px-3 sm:px-5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90"
>
    <div class="flex items-center gap-2.5 sm:gap-3.5">
        <IconButton variant="ghost" onclick={() => onToggleDrawer?.()} aria-label="メニューを開閉">
            <Menu size={22} />
        </IconButton>

        <button
            type="button"
            onclick={() => router.push('/')}
            class="flex items-center gap-2 text-lg sm:text-xl font-black tracking-tight text-blue-600 hover:opacity-80 dark:text-blue-400 cursor-pointer"
        >
            <span>{title}</span>
            {#if appVersion}
                <span
                    class="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                >
                    v{appVersion}
                </span>
            {/if}
        </button>
    </div>

    <div class="flex items-center gap-2.5">
        {#if readOnlyStore.enabled}
            {#if readOnlyStore.isReadOnly}
                <button
                    type="button"
                    onclick={() => readOnlyStore.openUnlockModal()}
                    class="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300 dark:hover:bg-amber-900/60 transition cursor-pointer shadow-xs"
                    title="パスワードを入力して管理者モードへ切り替える"
                >
                    <Lock size={15} class="text-amber-600 dark:text-amber-400" />
                    <span>閲覧専用</span>
                </button>
            {:else}
                <button
                    type="button"
                    onclick={handleLock}
                    class="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60 transition cursor-pointer shadow-xs"
                    title="クリックして閲覧専用モード（ロック）に戻す"
                >
                    <Unlock size={15} class="text-emerald-600 dark:text-emerald-400" />
                    <span class="hidden sm:inline">管理者モード</span>
                    <span class="sm:hidden">管理者</span>
                </button>
            {/if}
        {/if}

        <IconButton
            variant="ghost"
            onclick={() => themeStore.cycleMode()}
            aria-label="テーマ切り替え"
            title={themeStore.mode === 'auto'
                ? 'テーマ: 自動 (OS準拠) - クリックでライトに変更'
                : themeStore.mode === 'light'
                  ? 'テーマ: ライト - クリックでダークに変更'
                  : 'テーマ: ダーク - クリックで自動に変更'}
        >
            {#if themeStore.mode === 'auto'}
                <Monitor size={20} class="text-blue-600 dark:text-blue-400" />
            {:else if themeStore.mode === 'light'}
                <Sun size={20} class="text-amber-500" />
            {:else}
                <Moon size={20} class="text-indigo-400" />
            {/if}
        </IconButton>
    </div>
</header>
