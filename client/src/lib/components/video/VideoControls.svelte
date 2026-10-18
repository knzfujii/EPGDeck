<script lang="ts">
    import { playerState } from '../../stores/playerState.svelte';
    import { formatPlayerTime } from '../../utils/format';
    import { getDropCategoryLabel } from '../../utils/dropLog';
    import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, PictureInPicture, Subtitles } from '@lucide/svelte';

    interface Props {
        isPlaying: boolean;
        showControls: boolean;
        canSeek: boolean;
        currentTime: number;
        displayDuration: number;
        bufferedEnd?: number;
        isLive: boolean;
        streamType: string;
        isHls: boolean;
        isSubtitleOn: boolean;
        isFullscreen: boolean;
        canShowSubtitle: boolean;
        dropMarkers?: import('../../utils/dropLog').DropMarker[];
        onDirectSeek?: (targetTime: number) => void;
        onTogglePlay: () => void;
        onSeekChange: (e: Event) => void;
        onSeekStart?: () => void;
        onSeekEnd?: () => void;
        onToggleMute: () => void;
        onVolumeChange: (e: Event) => void;
        onSetPlaybackRate: (rate: number) => void;
        onToggleSubtitle: () => void;
        onTogglePiP: () => void;
        onToggleFullscreen: () => void;
    }

    let {
        isPlaying,
        showControls,
        canSeek,
        currentTime,
        displayDuration,
        bufferedEnd = 0,
        isLive,
        streamType,
        isHls,
        isSubtitleOn,
        isFullscreen,
        canShowSubtitle,
        dropMarkers = [],
        onDirectSeek,
        onTogglePlay,
        onSeekChange,
        onSeekStart,
        onSeekEnd,
        onToggleMute,
        onVolumeChange,
        onSetPlaybackRate,
        onToggleSubtitle,
        onTogglePiP,
        onToggleFullscreen,
    }: Props = $props();

    const playbackRates = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

    let isDragging = $state(false);
    let isHovering = $state(false);
    let dragTime = $state(0);
    let hoverTime = $state(0);
    let hoverPercent = $state(0);

    let effectiveCurrentTime = $derived(isDragging ? dragTime : currentTime);

    let progressPercent = $derived(
        displayDuration > 0 ? Math.min(100, Math.max(0, (effectiveCurrentTime / displayDuration) * 100)) : 0,
    );
    let bufferedPercent = $derived(
        displayDuration > 0 ? Math.min(100, Math.max(0, (bufferedEnd / displayDuration) * 100)) : 0,
    );

    let showBubble = $derived(isDragging || isHovering);
    let bubbleTime = $derived(isDragging ? dragTime : hoverTime);
    let bubblePercent = $derived(isDragging ? progressPercent : hoverPercent);

    function handleTrackPointerMove(e: PointerEvent) {
        if (e.pointerType === 'touch' || isDragging) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        if (rect.width > 0 && displayDuration > 0) {
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            hoverPercent = ratio * 100;
            hoverTime = ratio * displayDuration;
            isHovering = true;
        }
    }

    function handleTrackPointerLeave() {
        isHovering = false;
    }

    function handleSliderInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const val = parseFloat(target.value);
        dragTime = val;
        isDragging = true;

        // トランスコードストリーム (HLS, WebM, MP4) 以外 (Direct再生) の場合のみリアルタイムに onSeekChange を呼び出す
        const isTranscodeStream = isHls || streamType === 'hls' || streamType === 'webm' || streamType === 'mp4';
        if (!isTranscodeStream) {
            onSeekChange(e);
        }
    }

    function handleSliderStart() {
        isDragging = true;
        dragTime = currentTime;
        onSeekStart?.();
    }

    function handleSliderEnd(e: Event) {
        const target = e.currentTarget as HTMLInputElement;
        if (isDragging) {
            const finalTime = parseFloat(target.value);
            isDragging = false;
            // トランスコードストリームの場合は離した時に確定コミット
            const isTranscodeStream = isHls || streamType === 'hls' || streamType === 'webm' || streamType === 'mp4';
            if (isTranscodeStream) {
                if (onDirectSeek) {
                    onDirectSeek(finalTime);
                } else {
                    onSeekChange(e);
                }
            }
        }
        onSeekEnd?.();
    }
</script>

<!-- コントロールバー (下部オーバーレイ) -->
<div
    class="absolute bottom-0 left-0 right-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 sm:p-4 transition-opacity duration-300 {showControls
        ? 'opacity-100 pointer-events-auto'
        : 'opacity-0 pointer-events-none'}"
    inert={!showControls || undefined}
    aria-hidden={!showControls}
>
    <!-- シークバー (シーク可能時のみ表示) -->
    {#if canSeek}
        <div class="mb-2.5 flex items-center gap-2">
            <span class="text-xs font-medium text-slate-300 min-w-[36px] text-right">
                {formatPlayerTime(effectiveCurrentTime)}
            </span>
            <div
                role="presentation"
                class="relative flex-1 flex items-center py-2 cursor-pointer"
                onpointermove={handleTrackPointerMove}
                onpointerleave={handleTrackPointerLeave}
            >
                <!-- シーク位置タイムバブル（ドラッグ中またはホバー時にツマミの上部に追従表示） -->
                {#if showBubble}
                    <div
                        class="pointer-events-none absolute -top-7 sm:-top-8 -translate-x-1/2 rounded-md bg-slate-900/95 border border-slate-700/80 px-2 py-0.5 text-[10px] sm:text-[11px] font-bold text-white shadow-xl backdrop-blur-xs select-none z-30 whitespace-nowrap after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-slate-900/95"
                        style="left: clamp(24px, {bubblePercent}%, calc(100% - 24px));"
                    >
                        {formatPlayerTime(bubbleTime)}
                    </div>
                {/if}
                <!-- トラック背景 ＆ バッファバー (エンコード生成済み範囲) -->
                <div class="absolute inset-x-0 h-2 rounded-full bg-slate-700 overflow-hidden pointer-events-none">
                    {#if bufferedPercent > 0}
                        <div
                            class="h-full bg-slate-500/60 transition-all duration-300"
                            style="width: {bufferedPercent}%;"
                        ></div>
                    {/if}
                </div>
                <!-- ドロップ発生位置マーカー -->
                {#if dropMarkers.length > 0 && displayDuration > 0}
                    <div class="absolute inset-x-0 h-2 pointer-events-none z-10">
                        {#each dropMarkers as marker}
                            {@const leftPercent = Math.min(100, Math.max(0, (marker.time / displayDuration) * 100))}
                            <button
                                type="button"
                                class="absolute top-0 bottom-0 w-1.5 -translate-x-1/2 rounded-full {marker.category ===
                                'video'
                                    ? 'bg-rose-500 shadow-rose-950/80'
                                    : marker.category === 'audio'
                                      ? 'bg-amber-500 shadow-amber-950/80'
                                      : marker.category === 'subtitle'
                                        ? 'bg-sky-500 shadow-sky-950/80'
                                        : marker.type === 'scramble'
                                          ? 'bg-purple-500 shadow-purple-950/80'
                                          : 'bg-slate-400 shadow-slate-950/80'} shadow-sm pointer-events-auto cursor-pointer transition hover:w-2 hover:scale-y-125"
                                style="left: {leftPercent}%;"
                                onclick={e => {
                                    e.stopPropagation();
                                    onDirectSeek?.(marker.time);
                                }}
                                title={`${marker.timecode} [${getDropCategoryLabel(marker.category)}] ${marker.type === 'drop' ? 'ドロップ' : marker.type === 'error' ? 'エラー' : 'スクランブル'}: ${marker.description}`}
                                aria-label={`${marker.timecode} [${getDropCategoryLabel(marker.category)}] ドロップマーカー`}
                            ></button>
                        {/each}
                    </div>
                {/if}
                <input
                    type="range"
                    min="0"
                    max={displayDuration}
                    step="1"
                    value={effectiveCurrentTime}
                    oninput={handleSliderInput}
                    onpointerdown={handleSliderStart}
                    onpointerup={handleSliderEnd}
                    onchange={handleSliderEnd}
                    tabindex="-1"
                    class="relative z-10 h-2 w-full cursor-pointer appearance-none rounded-full bg-transparent accent-blue-500 touch-none"
                    style="background: linear-gradient(to right, rgb(59 130 246) 0%, rgb(59 130 246) {progressPercent}%, transparent {progressPercent}%, transparent 100%);"
                />
            </div>
            <span class="text-xs font-medium text-slate-300 min-w-[36px]">{formatPlayerTime(displayDuration)}</span>
        </div>
    {/if}

    <!-- ボタンツールバー -->
    <div class="flex items-center justify-between gap-2 text-white">
        <!-- 左側: 再生・スキップ・音量 -->
        <div class="flex items-center gap-1.5 sm:gap-2">
            <button
                type="button"
                onclick={onTogglePlay}
                class="rounded-lg p-1.5 text-white hover:bg-white/20 transition touch-manipulation cursor-pointer"
                title={isPlaying ? '一時停止 (Space)' : '再生 (Space)'}
            >
                {#if isPlaying}
                    <Pause size={20} />
                {:else}
                    <Play size={20} fill="currentColor" />
                {/if}
            </button>

            <!-- 音量 & ミュート -->
            <div class="flex items-center gap-1 ml-1">
                <button
                    type="button"
                    onclick={onToggleMute}
                    class="rounded-lg p-1.5 text-white hover:bg-white/20 transition touch-manipulation cursor-pointer"
                    title={playerState.isMuted ? 'ミュート解除 (M)' : 'ミュート (M)'}
                >
                    {#if playerState.isMuted || playerState.volume === 0}
                        <VolumeX size={18} />
                    {:else}
                        <Volume2 size={18} />
                    {/if}
                </button>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={playerState.isMuted ? 0 : playerState.volume}
                    oninput={onVolumeChange}
                    onpointerdown={() => onSeekStart?.()}
                    onpointerup={handleSliderEnd}
                    onchange={handleSliderEnd}
                    tabindex="-1"
                    class="hidden sm:block h-1 w-16 cursor-pointer appearance-none rounded-full bg-slate-600 accent-white"
                />
            </div>

            {#if isLive}
                <span
                    class="flex items-center gap-1 rounded bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider animate-pulse"
                >
                    LIVE ({streamType.toUpperCase()})
                </span>
            {/if}
        </div>

        <!-- 右側: 倍速・PiP・全画面 -->
        <div class="flex items-center gap-1.5 sm:gap-2">
            {#if !isLive}
                <!-- モバイル用単一サイクルボタン -->
                <button
                    type="button"
                    onclick={() => {
                        const cycle = [1.0, 1.25, 1.5, 2.0];
                        const cur = playerState.playbackRate;
                        const idx = cycle.indexOf(cur);
                        const nextRate = idx !== -1 ? cycle[(idx + 1) % cycle.length] : 1.0;
                        onSetPlaybackRate(nextRate);
                    }}
                    class="sm:hidden rounded-lg bg-white/10 px-2 py-1 text-xs font-bold text-white hover:bg-white/20 transition cursor-pointer touch-manipulation"
                    title="タップで速度切り替え"
                >
                    {playerState.playbackRate}x
                </button>

                <!-- デスクトップ用全レートボタン -->
                <div class="hidden sm:flex rounded-lg bg-white/10 p-0.5 text-[11px] font-bold">
                    {#each playbackRates as rate}
                        <button
                            type="button"
                            onclick={() => onSetPlaybackRate(rate)}
                            class="rounded px-1.5 py-0.5 transition cursor-pointer touch-manipulation {playerState.playbackRate ===
                            rate
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-300 hover:text-white'}"
                        >
                            {rate}x
                        </button>
                    {/each}
                </div>
            {/if}

            <!-- 字幕切り替えボタン (HLS / M2TS 配信時、または直接再生時) -->
            {#if canShowSubtitle}
                <button
                    type="button"
                    onclick={onToggleSubtitle}
                    class="rounded-lg p-1.5 transition touch-manipulation cursor-pointer {isSubtitleOn
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-300 hover:text-white hover:bg-white/20'}"
                    title={isSubtitleOn ? '字幕を非表示 (C)' : '字幕を表示 (C)'}
                    aria-label="字幕切り替え"
                >
                    <Subtitles size={18} />
                </button>
            {/if}

            <button
                type="button"
                onclick={onTogglePiP}
                class="rounded-lg p-1.5 text-white hover:bg-white/20 transition hidden sm:block touch-manipulation cursor-pointer"
                title="ピクチャー・イン・ピクチャー"
            >
                <PictureInPicture size={18} />
            </button>

            <button
                type="button"
                onclick={onToggleFullscreen}
                class="rounded-lg p-1.5 text-white hover:bg-white/20 transition touch-manipulation cursor-pointer"
                title="全画面表示 (F)"
            >
                {#if isFullscreen}
                    <Minimize size={18} />
                {:else}
                    <Maximize size={18} />
                {/if}
            </button>
        </div>
    </div>
</div>
