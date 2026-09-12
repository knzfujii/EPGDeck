<script lang="ts">
    import { router } from '../../router.svelte';
    import { readOnlyStore } from '../../stores/readOnly.svelte';
    import { Play, Radio, FileVideo, Download, X, Zap, CheckCircle2, Lock } from '@lucide/svelte';
    import { formatSize } from '../../utils/format';

    import type * as apid from '../../../../../api';
    import {
        isMp4VideoFile,
        getTopMp4File,
        getWatchUrl,
        getPlaybackPreference,
        savePlaybackPreference,
        getProtocolOptions,
        getAvailableStreamModes,
        type PlaybackStreamType,
    } from '../../utils/video';

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
    let selectedStreamType = $state<PlaybackStreamType>('m2tsll');
    let selectedMode = $state<number>(0);

    let selectedFile = $derived(videoFiles.find(f => f.id === selectedFileId) ?? null);
    let isCurrentFileMp4 = $derived(selectedFile ? isMp4VideoFile(selectedFile) : false);

    function applyPreferenceForFile(file: apid.VideoFile) {
        selectedFileId = file.id;
        const target = isMp4VideoFile(file) ? 'recorded_mp4' : 'recorded_ts';
        const pref = getPlaybackPreference(target);
        selectedStreamType = pref.streamType;
        selectedMode = pref.mode;
    }

    // デフォルトファイルと形式の初期化 (前回設定の復元)
    $effect(() => {
        if (isOpen) {
            if (videoFiles.length > 0) {
                // 指定された defaultVideoFileId -> 最上位MP4 -> 先頭ファイルの順で選択
                const targetFile =
                    (defaultVideoFileId ? videoFiles.find(f => f.id === defaultVideoFileId) : null) ??
                    getTopMp4File(videoFiles) ??
                    videoFiles[0];

                if (targetFile) {
                    applyPreferenceForFile(targetFile);
                }
            } else if (channelId) {
                // ライブ配信の場合: 記憶設定を復元
                const pref = getPlaybackPreference('live');
                selectedStreamType = pref.streamType;
                selectedMode = pref.mode;
            }
        }
    });

    // プロトコルごとの利用可否と説明文
    const protocolOptions = $derived(
        getProtocolOptions({
            channelId,
            recordedId,
            isCurrentFileMp4,
            hasSelectedFile: !!selectedFile,
            canLiveStream: readOnlyStore.canLiveStream,
            canRecordedStream: readOnlyStore.canRecordedStream,
        }),
    );

    // サーバー設定に基づく動的画質モードの取得と降順ソート
    const availableStreamModes = $derived(
        getAvailableStreamModes({
            streamType: selectedStreamType,
            channelId,
            recordedId,
            isEncoded: selectedFile?.type === 'encoded',
            streamConfig: readOnlyStore.serverConfig?.streamConfig,
        }),
    );

    // モードが存在しない場合は有効な最高画質（先頭）に自動調整
    $effect(() => {
        if (availableStreamModes.length > 0) {
            const exists = availableStreamModes.some(m => m.id === selectedMode);
            if (!exists) {
                selectedMode = availableStreamModes[0].id;
            }
        }
    });

    // 選択されたプロトコルが利用不可の場合、利用可能な先頭プロトコルに安全にフォールバック
    $effect(() => {
        if (protocolOptions.length > 0) {
            const current = protocolOptions.find(p => p.type === selectedStreamType);
            if (!current || !current.isAvailable) {
                const firstAvail = protocolOptions.find(p => p.isAvailable);
                if (firstAvail) {
                    selectedStreamType = firstAvail.type;
                }
            }
        }
    });

    const canStartPlayback = $derived.by(() => {
        const curOpt = protocolOptions.find(p => p.type === selectedStreamType);
        return curOpt ? curOpt.isAvailable : false;
    });

    function startPlayback() {
        if (!canStartPlayback) return;
        if (channelId) {
            // ライブ視聴設定を保存
            savePlaybackPreference('live', {
                streamType: selectedStreamType,
                mode: selectedMode,
            });
            router.push(`/onair/watch?channelId=${channelId}&type=${selectedStreamType}&mode=${selectedMode}`);
        } else if (recordedId && selectedFileId) {
            // 録画設定を保存 (MP4かTSかに応じて別々に保存)
            const target = isCurrentFileMp4 ? 'recorded_mp4' : 'recorded_ts';
            savePlaybackPreference(target, {
                streamType: selectedStreamType,
                mode: selectedMode,
            });

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
                                {@const isSelected = selectedFileId === file.id}
                                <button
                                    type="button"
                                    onclick={() => applyPreferenceForFile(file)}
                                    class="flex items-center justify-between rounded-xl border p-3 text-left transition cursor-pointer {isSelected
                                        ? 'border-blue-500 bg-blue-50/70 hover:bg-blue-100/60 dark:border-blue-500 dark:bg-blue-950/60 dark:hover:bg-blue-900/40 ring-1 ring-blue-500'
                                        : 'border-slate-200 bg-white hover:bg-slate-100/80 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:bg-slate-800 dark:hover:border-slate-700'}"
                                >
                                    <div class="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                                        <span
                                            class="rounded px-2.5 py-0.5 text-xs font-black uppercase shrink-0 {file.type ===
                                            'encoded'
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                                : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}"
                                        >
                                            {file.name}
                                        </span>
                                        <span class="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                                            {file.filename}
                                        </span>
                                    </div>
                                    <div class="flex items-center gap-2 shrink-0">
                                        <span
                                            class="text-sm font-semibold {isSelected
                                                ? 'text-blue-700 dark:text-blue-300'
                                                : 'text-slate-500 dark:text-slate-400'}"
                                        >
                                            {formatSize(file.size)}
                                        </span>
                                        {#if isSelected}
                                            <CheckCircle2 size={16} class="text-blue-600 dark:text-blue-400 shrink-0" />
                                        {/if}
                                    </div>
                                </button>
                            {/each}
                        </div>
                    </div>
                {/if}

                <!-- ストリーム形式 / 再生方式 (全 4 項目固定グリッド) -->
                <div>
                    <p class="block font-bold text-slate-700 dark:text-slate-300 mb-2">
                        再生プロトコル / 形式（性能順: 直接再生 ＞ M2TS-LL ＞ WebM ＞ HLS）
                    </p>
                    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {#each protocolOptions as opt}
                            {@const isSelected = selectedStreamType === opt.type}
                            <button
                                type="button"
                                disabled={!opt.isAvailable}
                                onclick={() => {
                                    if (opt.isAvailable) {
                                        selectedStreamType = opt.type;
                                    }
                                }}
                                class="flex flex-col items-center justify-center rounded-xl border px-1.5 py-2.5 text-center transition {!opt.isAvailable
                                    ? 'opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500'
                                    : isSelected
                                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300 font-bold ring-1 ring-blue-500 cursor-pointer'
                                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer'}"
                            >
                                <span class="flex items-center gap-1 text-sm font-black whitespace-nowrap">
                                    {#if opt.type === 'direct'}
                                        <Play size={13} fill="currentColor" />
                                    {:else if opt.type === 'm2tsll'}
                                        <Zap size={14} class={opt.isAvailable ? 'text-amber-500' : ''} />
                                    {/if}
                                    {opt.label}
                                    {#if opt.badge}
                                        <span
                                            class="rounded px-1.5 py-0.5 text-[10px] font-bold shrink-0 whitespace-nowrap {opt.type ===
                                            'direct'
                                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
                                                : opt.badge === '字幕非対応'
                                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}"
                                        >
                                            {opt.badge}
                                        </span>
                                    {/if}
                                </span>
                                <span
                                    class="text-xs font-medium mt-1 whitespace-nowrap {isSelected
                                        ? 'text-blue-600 dark:text-blue-300'
                                        : opt.isAvailable
                                          ? 'text-slate-500 dark:text-slate-400'
                                          : 'text-slate-400 dark:text-slate-500'}"
                                >
                                    {opt.subText}
                                </span>
                            </button>
                        {/each}
                    </div>
                </div>

                <!-- 画質・解像度 -->
                <div>
                    <p class="block font-bold text-slate-700 dark:text-slate-300 mb-2">画質・解像度</p>
                    {#if selectedStreamType === 'direct'}
                        <div
                            class="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-center text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300"
                        >
                            直接再生のためトランスコード不要（元ファイルの画質で再生）
                        </div>
                    {:else if availableStreamModes.length > 0}
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {#each availableStreamModes as mode}
                                {@const isModeSelected = selectedMode === mode.id}
                                <button
                                    type="button"
                                    onclick={() => (selectedMode = mode.id)}
                                    class="flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition cursor-pointer {isModeSelected
                                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300 font-bold ring-1 ring-blue-500'
                                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100'}"
                                >
                                    <span class="text-sm font-bold">{mode.label}</span>
                                    <span class="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                        {mode.desc}
                                    </span>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>

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
