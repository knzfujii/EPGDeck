<script lang="ts">
    import { router } from '../../router.svelte';
    import { readOnlyStore } from '../../stores/readOnly.svelte';
    import {
        Play,
        Tv,
        Radio,
        FileVideo,
        Sparkles,
        ExternalLink,
        Download,
        X,
        Zap,
        CheckCircle2,
        Lock,
    } from '@lucide/svelte';

    import type * as apid from '../../../../../api';
    import { isMp4VideoFile, getTopMp4File, getWatchUrl } from '../../utils/video';

    interface Props {
        isOpen: boolean;
        title: string;
        channelId?: number;
        channelName?: string;
        recordedId?: number;
        videoFiles?: apid.VideoFile[];
        defaultVideoFileId?: number;
        onClose: () => void;
    }

    let {
        isOpen,
        title,
        channelId,
        channelName,
        recordedId,
        videoFiles = [],
        defaultVideoFileId,
        onClose,
    }: Props = $props();

    // 選択状態
    let selectedFileId = $state<number | null>(null);
    let selectedStreamType = $state<'m2tsll' | 'webm' | 'mp4' | 'hls' | 'direct'>('m2tsll');
    let selectedMode = $state<number>(0);

    // デフォルトファイルと形式の初期化
    $effect(() => {
        if (isOpen) {
            if (videoFiles.length > 0) {
                // 指定された defaultVideoFileId -> 最上位MP4 -> 先頭ファイルの順で選択
                const targetFile =
                    (defaultVideoFileId ? videoFiles.find(f => f.id === defaultVideoFileId) : null) ??
                    getTopMp4File(videoFiles) ??
                    videoFiles[0];

                if (targetFile) {
                    selectedFileId = targetFile.id;
                    if (isMp4VideoFile(targetFile)) {
                        selectedStreamType = 'direct';
                    } else if (readOnlyStore.canRecordedStream) {
                        selectedStreamType = 'hls';
                    } else {
                        selectedStreamType = 'direct';
                    }
                }
            } else if (channelId) {
                // ライブ配信の場合: 最速の m2tsll をデフォルトに
                selectedStreamType = 'm2tsll';
            }
        }
    });

    const streamModes = [
        { id: 0, label: '720p', desc: '標準高画質' },
        { id: 1, label: '480p', desc: '中画質・節約' },
        { id: 2, label: '1080p', desc: '最高画質' },
    ];

    const canStartPlayback = $derived.by(() => {
        if (channelId) {
            return readOnlyStore.canLiveStream;
        }
        if (recordedId) {
            if (selectedStreamType === 'direct') {
                return !!selectedFileId;
            }
            return readOnlyStore.canRecordedStream && !!selectedFileId;
        }
        return false;
    });

    function startPlayback() {
        if (!canStartPlayback) return;
        if (channelId) {
            // ライブ視聴
            router.push(`/onair/watch?channelId=${channelId}&type=${selectedStreamType}&mode=${selectedMode}`);
        } else if (recordedId && selectedFileId) {
            if (selectedStreamType === 'direct') {
                // 直接再生
                router.push(getWatchUrl({ recordedId, videoId: selectedFileId }));
            } else {
                // 録画ストリーミング
                router.push(
                    getWatchUrl({
                        recordedId,
                        videoFileId: selectedFileId,
                        type: selectedStreamType,
                        mode: selectedMode,
                    }),
                );
            }
        }
        onClose();
    }

    function formatSize(bytes?: number): string {
        if (!bytes) return '-';
        const gb = bytes / (1024 * 1024 * 1024);
        return `${gb.toFixed(1)} GB`;
    }
</script>

{#if isOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <!-- バックドロップ -->
        <button
            type="button"
            class="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onclick={onClose}
            aria-label="閉じる"
        ></button>

        <!-- モーダルコンテンツ -->
        <div
            class="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900"
        >
            <!-- ヘッダー -->
            <div class="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div>
                    <span
                        class="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    >
                        {#if channelId}
                            <Radio size={14} /> ライブ配信設定
                        {:else}
                            <FileVideo size={14} /> 録画再生設定
                        {/if}
                    </span>
                    <h3 class="program-title-modal mt-2 line-clamp-2">
                        {title}
                    </h3>
                    {#if channelName}
                        <p class="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{channelName}</p>
                    {/if}
                </div>
                <button
                    type="button"
                    onclick={onClose}
                    class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                    <X size={18} />
                </button>
            </div>

            <div class="mt-5 space-y-5 text-xs">
                <!-- 動画ファイル選択 (録画の場合) -->
                {#if videoFiles.length > 0}
                    <div>
                        <p class="block font-bold text-slate-700 dark:text-slate-300 mb-2">再生する動画ファイル</p>
                        <div class="grid grid-cols-1 gap-2">
                            {#each videoFiles as file}
                                <button
                                    type="button"
                                    onclick={() => {
                                        selectedFileId = file.id;
                                        if (file.type === 'encoded' || file.name.toLowerCase().includes('mp4')) {
                                            selectedStreamType = 'direct';
                                        } else {
                                            selectedStreamType = 'hls';
                                        }
                                    }}
                                    class="flex items-center justify-between rounded-xl border p-3 text-left transition cursor-pointer {selectedFileId ===
                                    file.id
                                        ? 'border-blue-500 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/40'
                                        : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50'}"
                                >
                                    <div class="flex items-center gap-2.5">
                                        <span
                                            class="rounded px-2.5 py-0.5 text-xs font-black uppercase {file.type ===
                                            'encoded'
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                                : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}"
                                        >
                                            {file.name}
                                        </span>
                                        <span class="text-sm font-bold text-slate-900 dark:text-slate-100">
                                            {file.filename}
                                        </span>
                                    </div>
                                    <span class="text-sm font-semibold text-slate-400">{formatSize(file.size)}</span>
                                </button>
                            {/each}
                        </div>
                    </div>
                {/if}

                <!-- ストリーム形式 / 再生方式 (性能順: M2TS-LL > WebM > HLS) -->
                <div>
                    <p class="block font-bold text-slate-700 dark:text-slate-300 mb-2">
                        再生プロトコル / 形式（性能順: M2TS-LL ＞ WebM ＞ HLS）
                    </p>
                    <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {#if channelId}
                            <!-- M2TS-LL (最速・超低遅延) -->
                            <button
                                type="button"
                                onclick={() => (selectedStreamType = 'm2tsll')}
                                class="flex flex-col items-center justify-center rounded-xl border p-3 text-center transition cursor-pointer {selectedStreamType ===
                                'm2tsll'
                                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300 font-bold'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100'}"
                            >
                                <span class="flex items-center gap-1 text-sm font-black">
                                    <Zap size={15} class="text-amber-500" /> M2TS-LL
                                </span>
                                <span class="text-sm text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                                    超低遅延 (1-2秒)
                                </span>
                            </button>

                            <!-- WebM (高速) -->
                            <button
                                type="button"
                                onclick={() => (selectedStreamType = 'webm')}
                                class="flex flex-col items-center justify-center rounded-xl border p-3 text-center transition cursor-pointer {selectedStreamType ===
                                'webm'
                                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300 font-bold'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100'}"
                            >
                                <span class="text-sm font-black">WebM</span>
                                <span class="text-sm text-blue-600 dark:text-blue-400 font-medium mt-0.5">
                                    高速 (3-5秒)
                                </span>
                            </button>

                            <!-- HLS (高互換・字幕対応) -->
                            <button
                                type="button"
                                onclick={() => (selectedStreamType = 'hls')}
                                class="flex flex-col items-center justify-center rounded-xl border p-3 text-center transition cursor-pointer {selectedStreamType ===
                                'hls'
                                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300 font-bold'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100'}"
                            >
                                <span class="flex items-center gap-1.5 text-sm font-black">
                                    HLS <span
                                        class="rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                    >
                                        字幕対応
                                    </span>
                                </span>
                                <span class="text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                    字幕対応・iOS
                                </span>
                            </button>
                        {:else}
                            <!-- 録画再生の場合 -->
                            {#if videoFiles.length > 0 && selectedFileId && videoFiles.find(f => f.id === selectedFileId)?.type === 'encoded'}
                                <button
                                    type="button"
                                    onclick={() => (selectedStreamType = 'direct')}
                                    class="flex flex-col items-center justify-center rounded-xl border p-3 transition cursor-pointer {selectedStreamType ===
                                    'direct'
                                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300 font-bold'
                                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100'}"
                                >
                                    <span class="text-sm font-black">直接再生 (MP4)</span>
                                    <span class="text-sm text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                                        即時再生
                                    </span>
                                </button>
                            {/if}
                            <button
                                type="button"
                                disabled={!readOnlyStore.canRecordedStream}
                                onclick={() => (selectedStreamType = 'hls')}
                                class="flex flex-col items-center justify-center rounded-xl border p-3 transition cursor-pointer {!readOnlyStore.canRecordedStream
                                    ? 'opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50'
                                    : selectedStreamType === 'hls'
                                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300 font-bold'
                                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100'}"
                            >
                                <span class="flex items-center gap-1.5 text-sm font-black">
                                    HLS 配信 <span
                                        class="rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                    >
                                        字幕対応
                                    </span>
                                </span>
                                <span class="text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                    {#if !readOnlyStore.canRecordedStream}
                                        🔒 制限中
                                    {:else}
                                        字幕・高互換
                                    {/if}
                                </span>
                            </button>
                            <button
                                type="button"
                                disabled={!readOnlyStore.canRecordedStream}
                                onclick={() => (selectedStreamType = 'webm')}
                                class="flex flex-col items-center justify-center rounded-xl border p-3 transition cursor-pointer {!readOnlyStore.canRecordedStream
                                    ? 'opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50'
                                    : selectedStreamType === 'webm'
                                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300 font-bold'
                                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100'}"
                            >
                                <span class="text-sm font-black">WebM</span>
                                <span class="text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                    {#if !readOnlyStore.canRecordedStream}
                                        🔒 制限中
                                    {:else}
                                        高速トランスコード
                                    {/if}
                                </span>
                            </button>
                        {/if}
                    </div>
                </div>

                <!-- 画質・解像度 (トランスコード時) -->
                {#if selectedStreamType !== 'direct'}
                    <div>
                        <p class="block font-bold text-slate-700 dark:text-slate-300 mb-2">画質・解像度</p>
                        <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            {#each streamModes as mode}
                                <button
                                    type="button"
                                    onclick={() => (selectedMode = mode.id)}
                                    class="flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition cursor-pointer {selectedMode ===
                                    mode.id
                                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300 font-bold'
                                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100'}"
                                >
                                    <span class="text-sm font-bold">{mode.label}</span>
                                    <span class="text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                        {mode.desc}
                                    </span>
                                </button>
                            {/each}
                        </div>
                    </div>
                {/if}

                <!-- 外部アプリ連携導線 -->
                {#if recordedId && selectedFileId && readOnlyStore.canDownload}
                    <div class="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                        <div>
                            <span class="font-bold text-slate-800 dark:text-slate-200 text-sm">
                                外部プレーヤーで開く
                            </span>
                            <p class="text-xs text-slate-400">VLC / Infuse 向けの M3U プレイリスト</p>
                        </div>
                        <a
                            href={`/api/videos/${selectedFileId}/playlist${readOnlyStore.token ? `?token=${readOnlyStore.token}` : ''}`}
                            download
                            class="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                        >
                            <Download size={15} /> M3U 保存
                        </a>
                    </div>
                {/if}

                <!-- ライブ配信時のチューナー注意案内 -->
                {#if channelId}
                    <div
                        class="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200"
                    >
                        <p class="font-bold flex items-center gap-1.5 text-sm">
                            <Radio size={14} class="text-blue-600 dark:text-blue-400" />
                            チューナー確保について
                        </p>
                        <p class="text-xs text-blue-700/80 dark:text-blue-300/80 mt-1">
                            ライブ視聴には Mirakurun
                            の空きチューナーを1基使用します。全チューナーが録画で使用中の場合は視聴できないことがあります。
                        </p>
                    </div>
                {/if}
            </div>

            <!-- アクションボタン -->
            <div class="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button type="button" onclick={onClose} class="btn-secondary">キャンセル</button>
                <button type="button" disabled={!canStartPlayback} onclick={startPlayback} class="btn-primary">
                    {#if !canStartPlayback}
                        <Lock size={15} /> 閲覧制限中
                    {:else}
                        <Play size={15} fill="currentColor" /> 再生開始
                    {/if}
                </button>
            </div>
        </div>
    </div>
{/if}
