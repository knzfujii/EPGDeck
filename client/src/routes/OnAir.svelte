<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { socketStore } from '../lib/stores/socket.svelte';
    import { formatDate, formatTime, formatTimeRange, formatDuration } from '../lib/utils/format';
    import StreamSelectModal from '../lib/components/video/StreamSelectModal.svelte';
    import axios from 'axios';
    import type * as apid from '../../../api';
    import {
        Radio,
        Play,
        Tv,
        X,
        Clock,
        Info,
        Plus,
        Search,
        Layers,
        Calendar,
        CheckCircle2,
        Bookmark,
        ArrowRight
    } from '@lucide/svelte';

    interface OnAirItem {
        channel: apid.ChannelItem;
        current: apid.ScheduleProgramItem;
        next?: apid.ScheduleProgramItem;
    }

    let onAirList = $state<OnAirItem[]>([]);
    let isLoading = $state(true);
    let selectedType = $state<string>('all');

    // 配信設定モーダル状態
    let selectedChannel = $state<apid.ChannelItem | null>(null);
    let isStreamModalOpen = $state(false);

    // 番組詳細ポップアップモーダル状態
    let isDetailModalOpen = $state(false);
    let selectedDetailItem = $state<{ program: apid.ScheduleProgramItem; channel: apid.ChannelItem; isNext?: boolean } | null>(null);
    let isReserving = $state(false);

    let unsubscribeSocket: (() => void) | null = null;

    const channelTypes = [
        { id: 'all', name: 'すべて' },
        { id: 'GR', name: '地デジ' },
        { id: 'BS', name: 'BS' },
        { id: 'CS', name: 'CS' },
        { id: 'SKY', name: 'SKY' },
    ];

    async function fetchOnAir(isSilent = false) {
        if (!isSilent) isLoading = true;
        try {
            await channelStore.fetch();
            const now = Date.now();
            const startAt = now - 30 * 60 * 1000;
            const endAt = now + 6 * 60 * 60 * 1000;

            const res = await axios.get('/api/schedules', {
                params: {
                    startAt,
                    endAt,
                    isHalfWidth: true,
                    GR: true,
                    BS: true,
                    CS: true,
                    SKY: true,
                }
            });

            const schedules = res.data || [];
            const list: OnAirItem[] = [];

            for (const item of schedules) {
                const programs = (item.programs || []).sort((a: any, b: any) => a.startAt - b.startAt);
                if (programs.length === 0) continue;

                // 現在放映中の番組を特定
                const current = programs.find((p: any) => p.startAt <= now && p.endAt > now) || programs[0];
                // 次の番組を特定
                const next = programs.find((p: any) => p.startAt >= current.endAt);

                list.push({
                    channel: item.channel,
                    current,
                    next,
                });
            }

            onAirList = list;
        } catch (e) {
            console.error('Failed to fetch on-air schedules', e);
            if (!isSilent) snackbar.open({ text: '放映中データの取得に失敗しました', color: 'error' });
        } finally {
            if (!isSilent) isLoading = false;
        }
    }

    onMount(() => {
        fetchOnAir();
        const interval = setInterval(() => fetchOnAir(true), 30000); // 30秒毎に自動更新

        unsubscribeSocket = socketStore.on('updateStatus', () => {
            fetchOnAir(true);
        });

        return () => {
            clearInterval(interval);
        };
    });

    onDestroy(() => {
        unsubscribeSocket?.();
    });

    let filteredList = $derived.by(() => {
        if (selectedType === 'all') return onAirList;
        return onAirList.filter(item => item.channel?.channelType === selectedType);
    });

    function getProgress(startAt: number, endAt: number): number {
        const now = Date.now();
        if (now <= startAt) return 0;
        if (now >= endAt) return 100;
        return Math.min(100, Math.max(0, Math.round(((now - startAt) / (endAt - startAt)) * 100)));
    }

    function openStreamModal(channel: apid.ChannelItem) {
        selectedChannel = channel;
        isStreamModalOpen = true;
    }

    function openProgramDetail(program: apid.ScheduleProgramItem, channel: apid.ChannelItem, isNext: boolean = false) {
        selectedDetailItem = { program, channel, isNext };
        isDetailModalOpen = true;
    }

    // ワンクリック予約
    async function reserveProgram(program: any) {
        if (!program || !program.id) return;
        isReserving = true;
        try {
            await axios.post('/api/reserves', {
                programId: program.id,
                allowEndLack: true,
            });
            snackbar.open({ text: `「${program.name}」を予約しました`, color: 'success' });
            isDetailModalOpen = false;
        } catch (e) {
            console.error('Failed to reserve program', e);
            snackbar.open({ text: '番組の予約に失敗しました', color: 'error' });
        } finally {
            isReserving = false;
        }
    }
</script>

<div class="space-y-5 w-full max-w-full min-w-0">
    <!-- ヘッダー & 放送波タブ -->
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div>
            <h1 class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                <Radio size={20} class="text-blue-600 dark:text-blue-400" />
                放映中の番組
            </h1>
            <p class="text-xs text-slate-500 dark:text-slate-400">現在放送中の番組 ＆ 次の番組一覧（クリックで番組詳細・予約）</p>
        </div>

        <div class="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {#each channelTypes as type}
                <button
                    type="button"
                    onclick={() => selectedType = type.id}
                    class="rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer {selectedType === type.id
                        ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-blue-400 font-bold'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'}"
                >
                    {type.name}
                </button>
            {/each}
        </div>
    </div>

    <!-- 一覧テーブル -->
    {#if isLoading}
        <div class="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <p class="text-sm font-medium text-slate-400">放映中データを取得中...</p>
        </div>
    {:else if filteredList.length === 0}
        <div class="flex h-64 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
            <Tv size={36} class="text-slate-300 dark:text-slate-600" />
            <p class="mt-2 text-sm font-bold text-slate-700 dark:text-slate-300">放映中の番組が見つかりません</p>
        </div>
    {:else}
        <div class="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead class="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                        <tr>
                            <th class="px-4 py-3.5 w-44">放送局 / 時間</th>
                            <th class="px-3 py-3.5 w-20 text-center">視聴</th>
                            <th class="px-4 py-3.5">現在の番組</th>
                            <th class="px-4 py-3.5 w-72 lg:w-80 border-l border-slate-100 dark:border-slate-800">次の番組</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                        {#each filteredList as item}
                            {@const current = item.current}
                            {@const next = item.next}
                            {@const progress = current ? getProgress(current.startAt, current.endAt) : 0}
                            <tr class="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                                <!-- 1. 放送局 & 放送時間 (時間の下にプログレスバー、%表記なし) -->
                                <td class="whitespace-nowrap px-4 py-3.5 align-top">
                                    <span class="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                        {item.channel?.name || ''}
                                    </span>
                                    {#if current}
                                        <div class="mt-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            {formatTime(current.startAt)} - {formatTime(current.endAt)}
                                        </div>
                                        <!-- 時間の下の経過時間プログレスバー (%表記なし) -->
                                        <div class="mt-1.5 h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                            <div class="h-full bg-blue-500 transition-all duration-500" style="width: {progress}%"></div>
                                        </div>
                                    {/if}
                                </td>

                                <!-- 2. 視聴ボタン -->
                                <td class="whitespace-nowrap px-3 py-3.5 align-top text-center">
                                    <button
                                        type="button"
                                        onclick={(e) => { e.stopPropagation(); openStreamModal(item.channel); }}
                                        class="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 hover:shadow-md cursor-pointer"
                                        title="ライブ視聴"
                                    >
                                        <Play size={12} fill="currentColor" /> 視聴
                                    </button>
                                </td>

                                <!-- 3. 現在の番組 (番組名 / 概要) -->
                                <td
                                    onclick={() => openProgramDetail(current, item.channel, false)}
                                    class="px-4 py-3.5 align-top cursor-pointer group"
                                >
                                    {#if current}
                                        <div class="font-bold text-slate-900 group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-400 transition-colors">
                                            {current.name}
                                        </div>
                                        {#if current.description}
                                            <p class="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                                                {current.description}
                                            </p>
                                        {/if}
                                    {:else}
                                        <span class="text-slate-400 text-xs">番組情報なし</span>
                                    {/if}
                                </td>

                                <!-- 4. 最終カラム: 次の番組 (時間、タイトル & 予約導線) -->
                                <td
                                    onclick={() => next && openProgramDetail(next, item.channel, true)}
                                    class="px-4 py-3.5 align-top border-l border-slate-100 dark:border-slate-800 {next ? 'cursor-pointer group/next bg-slate-50/30 dark:bg-slate-900/20 hover:bg-blue-50/40 dark:hover:bg-blue-950/20' : ''} transition-colors"
                                >
                                    {#if next}
                                        <div class="flex items-center justify-between gap-1">
                                            <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                                {formatTime(next.startAt)} - {formatTime(next.endAt)}
                                            </span>
                                            <button
                                                type="button"
                                                onclick={(e) => { e.stopPropagation(); reserveProgram(next); }}
                                                class="flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300 transition cursor-pointer"
                                                title="ワンクリック予約"
                                            >
                                                <Bookmark size={11} /> 予約
                                            </button>
                                        </div>
                                        <p class="mt-1 line-clamp-2 text-xs font-bold text-slate-800 group-hover/next:text-blue-600 dark:text-slate-200 dark:group-hover/next:text-blue-400 transition-colors">
                                            {next.name}
                                        </p>
                                    {:else}
                                        <span class="text-slate-400 text-xs">-</span>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}
</div>

<!-- 番組詳細ポップアップモーダル (現在 / 次の番組 共通) -->
{#if isDetailModalOpen && selectedDetailItem}
    {@const p = selectedDetailItem.program}
    {@const ch = selectedDetailItem.channel}
    {@const isNext = selectedDetailItem.isNext}
    {@const prog = getProgress(p.startAt, p.endAt)}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
        <!-- バックドロップ -->
        <button
            type="button"
            class="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
            onclick={() => isDetailModalOpen = false}
            aria-label="背景をクリックして閉じる"
        ></button>

        <!-- モーダル本体 -->
        <div class="relative flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
            <!-- モーダルヘッダー -->
            <div class="flex items-start justify-between border-b border-slate-100 p-4 dark:border-slate-800">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            [{ch?.channelType}] {ch?.name}
                        </span>
                        {#if isNext}
                            <span class="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                次の番組
                            </span>
                        {:else}
                            <span class="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                現在放映中
                            </span>
                        {/if}
                    </div>
                    <h2 class="mt-2 text-base font-black text-slate-900 dark:text-slate-100">
                        {p.name}
                    </h2>
                </div>
                <button
                    type="button"
                    onclick={() => isDetailModalOpen = false}
                    class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                    aria-label="モーダルを閉じる"
                >
                    <X size={18} />
                </button>
            </div>

            <!-- モーダルコンテンツ -->
            <div class="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
                <!-- 時間・進行状況 -->
                <div class="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40 space-y-2">
                    <div class="flex items-center justify-between text-slate-600 dark:text-slate-400 font-semibold">
                        <span class="flex items-center gap-1.5">
                            <Clock size={14} />
                            {formatDate(p.startAt)} {formatTime(p.startAt)} - {formatTime(p.endAt)}
                        </span>
                        {#if !isNext}
                            <span class="text-blue-600 dark:text-blue-400 font-bold">{prog}% 経過</span>
                        {/if}
                    </div>
                    {#if !isNext}
                        <div class="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                            <div class="h-full bg-blue-500 transition-all duration-500" style="width: {prog}%"></div>
                        </div>
                    {/if}
                </div>

                <!-- 番組概要 -->
                {#if p.description}
                    <div>
                        <h4 class="font-bold text-slate-700 dark:text-slate-300 mb-1">番組概要</h4>
                        <p class="leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/20">
                            {p.description}
                        </p>
                    </div>
                {/if}

                <!-- 詳細情報 / 出演者 / あらすじ -->
                {#if p.extended}
                    <div>
                        <h4 class="font-bold text-slate-700 dark:text-slate-300 mb-1">詳細情報・出演者</h4>
                        <div class="space-y-2 rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/20 max-h-60 overflow-y-auto">
                            {#if typeof p.extended === 'object'}
                                {#each Object.entries(p.extended) as [key, value]}
                                    <div>
                                        <span class="font-bold text-blue-600 dark:text-blue-400">{key}:</span>
                                        <p class="mt-0.5 text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                                            {value}
                                        </p>
                                    </div>
                                {/each}
                            {:else}
                                <p class="text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                                    {p.extended}
                                </p>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>

            <!-- モーダルフッター (予約 / 視聴 / ルール作成) -->
            <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
                <button
                    type="button"
                    onclick={() => {
                        isDetailModalOpen = false;
                        router.push(`/search?keyword=${encodeURIComponent(p.name)}`);
                    }}
                    class="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer"
                >
                    <Search size={14} /> この番組でルール作成
                </button>

                <div class="flex items-center gap-2">
                    <!-- 番組予約ボタン (次番組はもちろん、放映中番組の録画も可能) -->
                    <button
                        type="button"
                        disabled={isReserving}
                        onclick={() => reserveProgram(p)}
                        class="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                    >
                        <Bookmark size={14} /> {isNext ? 'この番組を予約' : '録画予約'}
                    </button>

                    {#if !isNext}
                        <button
                            type="button"
                            onclick={() => {
                                isDetailModalOpen = false;
                                openStreamModal(ch);
                            }}
                            class="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 cursor-pointer"
                        >
                            <Play size={14} fill="currentColor" /> 今すぐ視聴
                        </button>
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- ライブ配信設定モーダル -->
{#if selectedChannel}
    {@const ch = selectedChannel}
    <StreamSelectModal
        isOpen={isStreamModalOpen}
        title={onAirList.find(s => s.channel?.id === ch.id)?.current?.name || `${ch.name} ライブ視聴`}
        channelId={ch.id}
        channelName={ch.name}
        onClose={() => {
            isStreamModalOpen = false;
            selectedChannel = null;
        }}
    />
{/if}
