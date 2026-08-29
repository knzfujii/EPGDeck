<script lang="ts">
    import { onMount } from 'svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import axios from 'axios';
    import { HardDrive, Server, CheckCircle2 } from '@lucide/svelte';

    interface StorageItem {
        name: string;
        available: number;
        used: number;
        total: number;
    }

    let storages = $state<StorageItem[]>([]);
    let isLoading = $state(true);

    async function fetchStorages() {
        isLoading = true;
        try {
            const res = await axios.get('/api/storages');
            storages = res.data?.items || [];
        } catch (e) {
            console.error('Failed to fetch storages', e);
            snackbar.open({ text: 'ストレージ情報の取得に失敗しました', color: 'error' });
        } finally {
            isLoading = false;
        }
    }

    onMount(() => {
        fetchStorages();
    });

    function formatGB(bytes?: number): string {
        if (typeof bytes !== 'number' || isNaN(bytes)) return '0 GB';
        const gb = bytes / (1024 * 1024 * 1024);
        if (gb >= 1000) {
            const tb = gb / 1024;
            return `${tb.toFixed(2)} TB`;
        }
        return `${gb.toFixed(1)} GB`;
    }

    function getUsagePercent(used: number, total: number): number {
        if (!total || total === 0) return 0;
        return Math.min(100, Math.max(0, Math.round((used / total) * 100)));
    }
</script>

<div class="space-y-5 w-full max-w-full min-w-0">
    <!-- ヘッダー -->
    <div class="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <h1 class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
            <HardDrive size={20} class="text-blue-600 dark:text-blue-400" />
            ストレージ容量
        </h1>
        <p class="text-xs text-slate-500 dark:text-slate-400">
            録画ファイルの保存先ストレージ一覧（全 {storages.length} ドライブ）
        </p>
    </div>

    {#if isLoading}
        <div class="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <p class="text-sm font-medium text-slate-400">ストレージ情報を取得中...</p>
        </div>
    {:else if storages.length === 0}
        <div class="flex h-64 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
            <HardDrive size={36} class="text-slate-300 dark:text-slate-600" />
            <p class="mt-2 text-sm font-bold text-slate-700 dark:text-slate-300">ストレージ情報が見つかりません</p>
        </div>
    {:else}
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {#each storages as st}
                {@const percent = getUsagePercent(st.used, st.total)}
                <div class="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
                    <div>
                        <div class="flex items-center justify-between">
                            <span class="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                                <Server size={18} class="text-blue-600 dark:text-blue-400" />
                                {st.name}
                            </span>
                            <span class="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                {percent}% 使用中
                            </span>
                        </div>

                        <!-- プログレスバー -->
                        <div class="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                                class="h-full transition-all duration-500 {percent > 90 ? 'bg-rose-500' : percent > 75 ? 'bg-amber-500' : 'bg-blue-500'}"
                                style="width: {percent}%"
                            ></div>
                        </div>

                        <!-- 容量詳細数値 -->
                        <div class="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center text-xs dark:border-slate-800">
                            <div>
                                <p class="text-[10px] font-semibold text-slate-400">使用容量</p>
                                <p class="mt-0.5 font-bold text-slate-800 dark:text-slate-200">{formatGB(st.used)}</p>
                            </div>
                            <div>
                                <p class="text-[10px] font-semibold text-slate-400">空き容量</p>
                                <p class="mt-0.5 font-bold text-emerald-600 dark:text-emerald-400">{formatGB(st.available)}</p>
                            </div>
                            <div>
                                <p class="text-[10px] font-semibold text-slate-400">総容量</p>
                                <p class="mt-0.5 font-bold text-slate-800 dark:text-slate-200">{formatGB(st.total)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>
