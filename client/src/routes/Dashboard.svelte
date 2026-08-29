<script lang="ts">
    import { onMount } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import axios from 'axios';
    import { Video, Clock, ArrowRight, AlertTriangle, Play } from '@lucide/svelte';

    let recordedTotal = $state(0);
    let reservesTotal = $state(0);
    let latestRecorded = $state<any[]>([]);
    let upcomingReserves = $state<any[]>([]);
    let isLoading = $state(true);

    async function fetchDashboard() {
        isLoading = true;
        try {
            await channelStore.fetch();
            const [recordingRes, recordedRes, reservesRes] = await Promise.all([
                axios.get('/api/recording?isHalfWidth=true').catch(() => ({ data: { records: [] } })),
                axios.get('/api/recorded?limit=8&isHalfWidth=true').catch(() => ({ data: { records: [], total: 0 } })),
                axios.get('/api/reserves?limit=10&isHalfWidth=true').catch(() => ({ data: { reserves: [], total: 0 } })),
            ]);

            const recordingList = recordingRes.data.records || [];
            latestRecorded = recordedRes.data.records || [];
            recordedTotal = recordedRes.data.total || 0;

            // 予約リストに録画中フラグを付与
            const now = Date.now();
            const reservesList = reservesRes.data.reserves || [];
            upcomingReserves = reservesList.map((r: any) => {
                const isCurrentlyRecording = recordingList.some((rec: any) => rec.programId === r.programId || rec.id === r.id) || (r.startAt <= now && now < r.endAt);
                return {
                    ...r,
                    isRecording: isCurrentlyRecording
                };
            });
            reservesTotal = reservesRes.data.total || 0;
        } catch (e) {
            console.error('Failed to fetch dashboard data', e);
        } finally {
            isLoading = false;
        }
    }

    onMount(() => {
        fetchDashboard();
        const interval = setInterval(fetchDashboard, 30000); // 30秒ごとに自動更新
        return () => clearInterval(interval);
    });

    function formatTime(timestamp: number): string {
        const d = new Date(timestamp);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }

    function formatDate(timestamp: number): string {
        const d = new Date(timestamp);
        return `${d.getMonth() + 1}/${d.getDate()} (${['日','月','火','水','木','金','土'][d.getDay()]}) ${formatTime(timestamp)}`;
    }

    function getRecordingProgress(startAt: number, endAt: number): number {
        const now = Date.now();
        if (now <= startAt) return 0;
        if (now >= endAt) return 100;
        return Math.round(((now - startAt) / (endAt - startAt)) * 100);
    }
</script>

<div class="space-y-5 w-full max-w-full min-w-0">
    <!-- ステータス概要カード (予約中 & 録画済み の2枚構成で固定) -->
    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <button
            type="button"
            onclick={() => router.push('/reserves')}
            class="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xs transition hover:border-amber-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 cursor-pointer"
        >
            <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                <Clock size={28} />
            </div>
            <div>
                <p class="text-xs font-bold text-slate-500 dark:text-slate-400">予約中</p>
                <p class="text-3xl font-black text-slate-900 dark:text-slate-100">{reservesTotal} <span class="text-sm font-normal text-slate-500">件</span></p>
            </div>
        </button>

        <button
            type="button"
            onclick={() => router.push('/recorded')}
            class="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xs transition hover:border-emerald-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 cursor-pointer"
        >
            <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <Video size={28} />
            </div>
            <div>
                <p class="text-xs font-bold text-slate-500 dark:text-slate-400">録画済み</p>
                <p class="text-3xl font-black text-slate-900 dark:text-slate-100">{recordedTotal.toLocaleString()} <span class="text-sm font-normal text-slate-500">件</span></p>
            </div>
        </button>
    </div>

    <!-- 直近の予約 & 最新録画 2カラム -->
    <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <!-- 予約一覧 (一覧の中で録画中を自然に表現) -->
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div class="mb-4 flex items-center justify-between">
                <h2 class="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
                    <Clock size={18} class="text-amber-500" />
                    直近の予約
                </h2>
                <button
                    type="button"
                    onclick={() => router.push('/reserves')}
                    class="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                    すべて見る <ArrowRight size={14} />
                </button>
            </div>

            {#if isLoading}
                <p class="py-8 text-center text-xs text-slate-400">読み込み中...</p>
            {:else if upcomingReserves.length === 0}
                <p class="py-8 text-center text-xs text-slate-400">直近の予約はありません</p>
            {:else}
                <div class="space-y-2.5">
                    {#each upcomingReserves as item}
                        <div class="flex flex-col gap-2 rounded-xl border p-3 transition {item.isRecording ? 'border-rose-300 bg-rose-50/40 dark:border-rose-900/60 dark:bg-rose-950/20' : 'border-slate-100 bg-slate-50/50 hover:border-slate-200 dark:border-slate-800 dark:bg-slate-800/40'}">
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        {#if item.isRecording}
                                            <span class="flex items-center gap-1 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-black text-white uppercase tracking-wider animate-pulse">
                                                ● 録画中
                                            </span>
                                        {/if}
                                        {#if item.isConflict}
                                            <span class="flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                                                <AlertTriangle size={12} /> チューナー競合
                                            </span>
                                        {/if}
                                        {#if item.isOverlap}
                                            <span class="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                                重複スキップ
                                            </span>
                                        {/if}
                                        <span class="text-xs font-bold text-slate-600 dark:text-slate-300">
                                            {channelStore.getChannelName(item.channelId)}
                                        </span>
                                    </div>
                                    <h3 class="mt-1 truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                                        {item.name}
                                    </h3>
                                </div>

                                <div class="shrink-0 text-right">
                                    {#if item.isRecording}
                                        <button
                                            type="button"
                                            onclick={() => router.push(`/onair/watch?channelId=${item.channelId}&type=m2tsll&mode=0`)}
                                            class="flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-rose-700 transition"
                                        >
                                            <Play size={12} fill="currentColor" /> 視聴
                                        </button>
                                    {:else}
                                        <span class="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            {formatDate(item.startAt)}
                                        </span>
                                    {/if}
                                </div>
                            </div>

                            <!-- 録画中番組の進行状況バー -->
                            {#if item.isRecording}
                                <div class="flex items-center gap-2 pt-1 border-t border-rose-200/50 dark:border-rose-900/30">
                                    <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-rose-200 dark:bg-rose-950">
                                        <div
                                            class="h-full rounded-full bg-rose-600 transition-all duration-500"
                                            style="width: {getRecordingProgress(item.startAt, item.endAt)}%"
                                        ></div>
                                    </div>
                                    <span class="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                                        {getRecordingProgress(item.startAt, item.endAt)}% ({formatTime(item.startAt)} - {formatTime(item.endAt)})
                                    </span>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- 最新の録画 (再生ボタンを目立たせて配置) -->
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div class="mb-4 flex items-center justify-between">
                <h2 class="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
                    <Video size={18} class="text-emerald-500" />
                    最新の録画済み
                </h2>
                <button
                    type="button"
                    onclick={() => router.push('/recorded')}
                    class="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                    すべて見る <ArrowRight size={14} />
                </button>
            </div>
            {#if isLoading}
                <p class="py-8 text-center text-xs text-slate-400">読み込み中...</p>
            {:else if latestRecorded.length === 0}
                <p class="py-8 text-center text-xs text-slate-400">録画データがありません</p>
            {:else}
                <div class="space-y-2.5">
                    {#each latestRecorded as item}
                        <div class="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 transition hover:border-blue-200 dark:border-slate-800 dark:bg-slate-800/40">
                            <div
                                onclick={() => router.push(`/recorded/detail?recordedId=${item.id}`)}
                                class="min-w-0 flex-1 cursor-pointer group"
                                role="button"
                                tabindex="0"
                                onkeydown={(e) => { if (e.key === 'Enter') router.push(`/recorded/detail?recordedId=${item.id}`); }}
                            >
                                <div class="flex items-center gap-2">
                                    <span class="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        {channelStore.getChannelName(item.channelId)}
                                    </span>
                                    <span class="text-[11px] text-slate-400">
                                        {formatDate(item.startAt)}
                                    </span>
                                </div>
                                <h3 class="mt-0.5 truncate text-xs font-bold text-slate-900 transition group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-400">
                                    {item.name}
                                </h3>
                            </div>

                            <!-- 再生ボタン (目立つ青色ボタン) -->
                            <button
                                type="button"
                                onclick={(e) => { e.stopPropagation(); router.push(`/recorded/watch?recordedId=${item.id}`); }}
                                class="flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700"
                                title="今すぐ再生"
                            >
                                <Play size={13} fill="currentColor" /> 再生
                            </button>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
</div>
