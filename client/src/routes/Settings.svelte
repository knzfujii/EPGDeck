<script lang="ts">
    import { onMount } from 'svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { themeStore, type ThemeMode } from '../lib/stores/theme.svelte';
    import { Settings as SettingsIcon, Moon, Sun, Monitor, HardDrive, Check, Save } from '@lucide/svelte';

    let isHalfWidth = $state(true);
    let themeMode = $state<ThemeMode>('auto');
    let isPWA = $state(true);
    let isSubdirCopy = $state(true);
    let isAvoidDuplicate = $state(true);

    onMount(() => {
        themeMode = themeStore.mode;
        const saved = localStorage.getItem('epgdeck_settings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (typeof parsed.isHalfWidth === 'boolean') isHalfWidth = parsed.isHalfWidth;
                if (typeof parsed.isPWA === 'boolean') isPWA = parsed.isPWA;
                if (typeof parsed.isSubdirCopy === 'boolean') isSubdirCopy = parsed.isSubdirCopy;
                if (typeof parsed.isAvoidDuplicate === 'boolean') isAvoidDuplicate = parsed.isAvoidDuplicate;
            } catch (e) {}
        }
    });

    function handleThemeChange(mode: ThemeMode) {
        themeMode = mode;
        themeStore.setMode(mode);
    }

    function saveSettings() {
        themeStore.setMode(themeMode);
        const settings = {
            isHalfWidth,
            themeMode,
            isPWA,
            isSubdirCopy,
            isAvoidDuplicate,
        };
        localStorage.setItem('epgdeck_settings', JSON.stringify(settings));
        snackbar.open({ text: '設定を保存しました', color: 'success' });
    }
</script>

<div class="w-full max-w-4xl min-w-0 space-y-5">
    <div class="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div>
            <h1 class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                <SettingsIcon size={20} class="text-blue-600 dark:text-blue-400" />
                アプリケーション設定
            </h1>
            <p class="text-xs text-slate-500 dark:text-slate-400">表示・動作設定のカスタマイズ</p>
        </div>

        <button
            type="button"
            onclick={saveSettings}
            class="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 cursor-pointer"
        >
            <Save size={14} /> 保存
        </button>
    </div>

    <div class="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-xs dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        <div class="p-5">
            <h2 class="text-sm font-bold text-slate-900 dark:text-slate-100">外観・テーマ</h2>
            <div class="mt-4 space-y-4">
                <!-- カラーテーマ切り替えボタングループ -->
                <div>
                    <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">テーマモード</p>
                    <div class="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800/80">
                        <button
                            type="button"
                            onclick={() => handleThemeChange('auto')}
                            class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition {themeMode === 'auto' ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-900 dark:text-blue-400' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}"
                        >
                            <Monitor size={14} />
                            <span>自動 (OS準拠)</span>
                        </button>
                        <button
                            type="button"
                            onclick={() => handleThemeChange('light')}
                            class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition {themeMode === 'light' ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-900 dark:text-blue-400' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}"
                        >
                            <Sun size={14} />
                            <span>ライト</span>
                        </button>
                        <button
                            type="button"
                            onclick={() => handleThemeChange('dark')}
                            class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition {themeMode === 'dark' ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-900 dark:text-blue-400' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}"
                        >
                            <Moon size={14} />
                            <span>ダーク</span>
                        </button>
                    </div>
                </div>

                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-xs font-semibold text-slate-800 dark:text-slate-200">半角表示</p>
                        <p class="text-[11px] text-slate-400">番組名の全角英数字・記号を強制的に半角で表示します</p>
                    </div>
                    <input type="checkbox" bind:checked={isHalfWidth} class="h-4 w-4 rounded border-slate-300 text-blue-600" />
                </div>

                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-xs font-semibold text-slate-800 dark:text-slate-200">PWA (ホーム画面追加)</p>
                        <p class="text-[11px] text-slate-400">スマホ・タブレットでアプリとして利用できるようにします</p>
                    </div>
                    <input type="checkbox" bind:checked={isPWA} class="h-4 w-4 rounded border-slate-300 text-blue-600" />
                </div>
            </div>
        </div>

        <div class="p-5">
            <h2 class="text-sm font-bold text-slate-900 dark:text-slate-100">ルール予約の自動化</h2>
            <div class="mt-4 space-y-4">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-xs font-semibold text-slate-800 dark:text-slate-200">フォルダ自動振り分け</p>
                        <p class="text-[11px] text-slate-400">ルール作成時、キーワードを保存先サブディレクトリ名に自動設定します</p>
                    </div>
                    <input type="checkbox" bind:checked={isSubdirCopy} class="h-4 w-4 rounded border-slate-300 text-blue-600" />
                </div>

                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-xs font-semibold text-slate-800 dark:text-slate-200">録画済み番組の重複排除</p>
                        <p class="text-[11px] text-slate-400">すでに録画済みの番組や再放送の二重録画を自動的にスキップします</p>
                    </div>
                    <input type="checkbox" bind:checked={isAvoidDuplicate} class="h-4 w-4 rounded border-slate-300 text-blue-600" />
                </div>
            </div>
        </div>
    </div>
</div>
