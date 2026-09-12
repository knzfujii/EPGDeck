<script lang="ts">
    import { playerState } from '../../stores/playerState.svelte';
    import { formatPlayerTime } from '../../utils/format';
    import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, PictureInPicture, Subtitles } from '@lucide/svelte';

    interface Props {
        isPlaying: boolean;
        showControls: boolean;
        canSeek: boolean;
        currentTime: number;
        displayDuration: number;
        isLive: boolean;
        streamType: string;
        isHls: boolean;
        isSubtitleOn: boolean;
        isFullscreen: boolean;
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
        isLive,
        streamType,
        isHls,
        isSubtitleOn,
        isFullscreen,
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

    let canShowSubtitle = $derived(
        isHls || streamType === 'hls' || streamType === 'm2tsll' || streamType === 'm2ts' || streamType === 'direct',
    );

    function handleSliderEnd(e: Event) {
        (e.currentTarget as HTMLElement)?.blur();
        onSeekEnd?.();
    }
</script>

<!-- コントロールバー (下部オーバーレイ) -->
<div
    class="absolute bottom-0 left-0 right-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 sm:p-4 transition-opacity duration-300 {showControls
        ? 'opacity-100 pointer-events-auto'
        : 'opacity-0 pointer-events-none'}"
    onclick={e => e.stopPropagation()}
    onkeydown={e => e.stopPropagation()}
    role="presentation"
    inert={!showControls || undefined}
    aria-hidden={!showControls}
>
    <!-- シークバー (シーク可能時のみ表示) -->
    {#if canSeek}
        <div class="mb-2.5 flex items-center gap-2">
            <span class="text-xs font-medium text-slate-300 min-w-[36px] text-right">
                {formatPlayerTime(currentTime)}
            </span>
            <div class="flex-1 flex items-center py-2 cursor-pointer">
                <input
                    type="range"
                    min="0"
                    max={displayDuration}
                    step="1"
                    value={currentTime}
                    oninput={onSeekChange}
                    onpointerdown={() => onSeekStart?.()}
                    onpointerup={handleSliderEnd}
                    onchange={handleSliderEnd}
                    tabindex="-1"
                    class="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-600 accent-blue-500 transition hover:h-2.5 touch-none"
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
