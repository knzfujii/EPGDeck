<script lang="ts">
    import { onMount, onDestroy, untrack } from 'svelte';
    import Hls from 'hls.js';
    import Mpegts from 'mpegts.js';
    import { playerState } from '../../stores/playerState.svelte';
    import { formatPlayerTime } from '../../utils/format';
    import {
        Play,
        Pause,
        Volume2,
        VolumeX,
        RotateCcw,
        RotateCw,
        Maximize,
        Minimize,
        PictureInPicture,
        FastForward,
        Loader2,
        AlertCircle,
        Subtitles
    } from '@lucide/svelte';

    interface Props {
        src: string;
        streamType?: 'm2tsll' | 'm2ts' | 'webm' | 'mp4' | 'hls' | 'direct';
        isHls?: boolean;
        isLive?: boolean;
        title?: string;
        recordedId?: number;
        onStreamEnded?: () => void;
    }

    let {
        src,
        streamType = 'direct',
        isHls = false,
        isLive = false,
        title = '',
        recordedId,
        onStreamEnded
    }: Props = $props();

    let videoElement = $state<HTMLVideoElement | null>(null);
    let containerElement = $state<HTMLDivElement | null>(null);
    let hlsInstance: Hls | null = null;
    let mpegtsInstance: Mpegts.Player | null = null;

    // プレーヤー状態
    let isPlaying = $state(false);
    let isLoading = $state(true);
    let currentTime = $state(0);
    let duration = $state(0);
    let isFullscreen = $state(false);
    let showControls = $state(true);
    let errorMessage = $state<string | null>(null);
    let resumeNotice = $state<{ position: number; visible: boolean } | null>(null);

    let hideControlsTimer: any = null;
    let lastLoadedSrc = '';

    function resetHideControlsTimer() {
        showControls = true;
        if (hideControlsTimer) clearTimeout(hideControlsTimer);
        if (isPlaying) {
            hideControlsTimer = setTimeout(() => {
                showControls = false;
            }, 3000);
        }
    }

    function formatTime(seconds: number): string {
        return formatPlayerTime(seconds);
    }

    // 再生 / 一時停止
    function togglePlay() {
        if (!videoElement) return;
        if (videoElement.paused) {
            videoElement.play().catch(err => {
                console.warn('Playback play() failed:', err);
            });
        } else {
            videoElement.pause();
        }
    }

    // シーク
    function seekRelative(offsetSeconds: number) {
        if (!videoElement || isLive) return;
        videoElement.currentTime = Math.max(0, Math.min(duration, videoElement.currentTime + offsetSeconds));
        resetHideControlsTimer();
    }

    function handleSeekChange(e: Event) {
        if (!videoElement || isLive) return;
        const target = e.target as HTMLInputElement;
        const targetTime = parseFloat(target.value);
        videoElement.currentTime = targetTime;
        resetHideControlsTimer();
    }

    // 音量
    function handleVolumeChange(e: Event) {
        if (!videoElement) return;
        const target = e.target as HTMLInputElement;
        const vol = parseFloat(target.value);
        playerState.setVolume(vol);
        videoElement.volume = vol;
        if (vol > 0 && playerState.isMuted) {
            playerState.setMuted(false);
            videoElement.muted = false;
        }
        resetHideControlsTimer();
    }

    function toggleMute() {
        if (!videoElement) return;
        const nextMuted = !playerState.isMuted;
        playerState.setMuted(nextMuted);
        videoElement.muted = nextMuted;
        resetHideControlsTimer();
    }

    // 再生速度 (動画をリロードせずに直接速度を変更)
    function setPlaybackRate(rate: number) {
        playerState.setPlaybackRate(rate);
        if (videoElement) {
            videoElement.playbackRate = rate;
            videoElement.defaultPlaybackRate = rate;
        }
        resetHideControlsTimer();
    }

    const playbackRates = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

    // 全画面切り替え
    function toggleFullscreen() {
        if (!containerElement) return;
        if (!document.fullscreenElement) {
            containerElement.requestFullscreen().then(() => {
                isFullscreen = true;
            }).catch(err => console.error('Fullscreen request failed:', err));
        } else {
            document.exitFullscreen().then(() => {
                isFullscreen = false;
            }).catch(err => console.error('Exit fullscreen failed:', err));
        }
    }

    // Picture-in-Picture
    function togglePiP() {
        if (!videoElement) return;
        if (document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(console.error);
        } else if (videoElement.requestPictureInPicture) {
            videoElement.requestPictureInPicture().catch(console.error);
        }
    }

    // キーボードショートカット
    function handleKeyDown(e: KeyboardEvent) {
        // 入力フォームフォーカス中は無視
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

        // 修飾キー（Alt, Ctrl, Meta, Shift）が押されている場合は、ブラウザ標準動作（Alt+←で戻る等）を優先して完全にスキップ
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

        switch (e.key) {
            case ' ':
            case 'k':
                e.preventDefault();
                togglePlay();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                seekRelative(-10);
                break;
                seekRelative(10);
                break;
            case 'ArrowUp':
                e.preventDefault();
                playerState.setVolume(Math.min(1, playerState.volume + 0.05));
                if (videoElement) videoElement.volume = playerState.volume;
                break;
            case 'ArrowDown':
                e.preventDefault();
                playerState.setVolume(Math.max(0, playerState.volume - 0.05));
                if (videoElement) videoElement.volume = playerState.volume;
                break;
            case 'f':
                e.preventDefault();
                toggleFullscreen();
                break;
            case 'm':
                e.preventDefault();
                toggleMute();
                break;
        }
    }

    // レジューム位置の適用
    function resumeFromSaved() {
        if (resumeNotice && videoElement) {
            videoElement.currentTime = resumeNotice.position;
            resumeNotice.visible = false;
        }
    }

    function dismissResume() {
        if (resumeNotice) {
            resumeNotice.visible = false;
        }
    }

    function cleanupEngines() {
        if (hlsInstance) {
            hlsInstance.stopLoad();
            hlsInstance.detachMedia();
            hlsInstance.destroy();
            hlsInstance = null;
        }
        if (mpegtsInstance) {
            mpegtsInstance.pause();
            mpegtsInstance.unload();
            mpegtsInstance.detachMediaElement();
            mpegtsInstance.destroy();
            mpegtsInstance = null;
        }
    }

    // 動画ソースの初期化 (M2TS-LL, HLS, WebM/MP4直接ストリーム)
    function initVideo() {
        if (!videoElement || !src) return;

        cleanupEngines();
        isLoading = true;
        errorMessage = null;

        // 設定の復元
        videoElement.volume = playerState.volume;
        videoElement.muted = playerState.isMuted;
        videoElement.playbackRate = playerState.playbackRate;

        // 1. M2TS-LL (MPEG-TS Low Latency) 爆速再生モード
        if (streamType === 'm2tsll' || streamType === 'm2ts') {
            if (Mpegts.isSupported() && Mpegts.getFeatureList().mseLivePlayback) {
                Mpegts.LoggingControl.enableVerbose = false;
                // WebWorker 内での fetch に対応するため絶対 URL に変換
                const absoluteUrl = src.startsWith('http') ? src : `${window.location.origin}${src.startsWith('/') ? '' : '/'}${src}`;

                mpegtsInstance = Mpegts.createPlayer(
                    {
                        type: 'mse',
                        isLive: true,
                        url: absoluteUrl,
                    },
                    {
                        enableWorker: true,
                        liveBufferLatencyChasing: true,
                        liveBufferLatencyMinRemain: 0.8,
                        liveBufferLatencyMaxLatency: 1.5,
                    },
                );
                mpegtsInstance.attachMediaElement(videoElement);
                mpegtsInstance.load();
                mpegtsInstance.play();

                mpegtsInstance.on(Mpegts.Events.ERROR, (type, detail, info) => {
                    console.warn('Mpegts error:', type, detail, info);
                });
                return;
            }
        }

        // 2. HLS モード
        if (isHls || streamType === 'hls') {
            if (Hls.isSupported()) {
                hlsInstance = new Hls({
                    enableWorker: true,
                    lowLatencyMode: true,
                    backBufferLength: 90,
                    manifestLoadingTimeOut: 15000,
                    manifestLoadingMaxRetry: 8,
                    manifestLoadingRetryDelay: 1000,
                });
                hlsInstance.loadSource(src);
                hlsInstance.attachMedia(videoElement);

                hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                    isLoading = false;
                    videoElement?.play().catch(e => console.log('Autoplay prevented:', e));
                });

                hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
                    if (data.fatal) {
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                console.warn('HLS Network error, recovering...');
                                hlsInstance?.startLoad();
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                console.warn('HLS Media error, recovering...');
                                hlsInstance?.recoverMediaError();
                                break;
                            default:
                                errorMessage = 'ストリームの再生に失敗しました';
                                cleanupEngines();
                                break;
                        }
                    }
                });
                return;
            } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
                videoElement.src = src;
                videoElement.play().catch(e => console.log('Autoplay prevented:', e));
                return;
            }
        }

        // 3. WebM / MP4 / 直接再生ストリーム (ブラウザネイティブ)
        videoElement.src = src;
        videoElement.load();
        videoElement.play().catch(e => console.log('Autoplay prevented:', e));

        // レジューム位置の確認
        if (recordedId && !isLive) {
            const savedPos = playerState.getPosition(recordedId);
            if (savedPos > 15) {
                resumeNotice = { position: savedPos, visible: true };
                setTimeout(() => {
                    if (resumeNotice) resumeNotice.visible = false;
                }, 8000);
            }
        }
    }

    $effect(() => {
        const currentSrc = src;
        const currentType = streamType;
        if (currentSrc && currentSrc !== lastLoadedSrc) {
            lastLoadedSrc = currentSrc;
            untrack(() => {
                initVideo();
            });
        }
    });

    onMount(() => {
        const handleFullscreenChange = () => {
            isFullscreen = !!document.fullscreenElement;
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            window.removeEventListener('keydown', handleKeyDown);
            cleanupEngines();
            if (hideControlsTimer) clearTimeout(hideControlsTimer);
        };
    });

    onDestroy(() => {
        if (videoElement && recordedId && currentTime > 10 && duration > 0) {
            if (currentTime < duration - 15) {
                playerState.savePosition(recordedId, currentTime);
            } else {
                playerState.clearPosition(recordedId);
            }
        }
        cleanupEngines();
    });
</script>

<div
    bind:this={containerElement}
    onmousemove={resetHideControlsTimer}
    onmouseleave={() => { if (isPlaying) showControls = false; }}
    class="group relative flex aspect-video w-full max-w-full items-center justify-center overflow-hidden rounded-none bg-black shadow-2xl select-none"
    role="region"
    aria-label="動画プレーヤー"
>
    <!-- ビデオ本体 -->
    <video
        bind:this={videoElement}
        onclick={togglePlay}
        onplay={() => {
            isPlaying = true;
            if (videoElement) {
                videoElement.playbackRate = playerState.playbackRate;
            }
            resetHideControlsTimer();
        }}
        onpause={() => { isPlaying = false; showControls = true; }}
        onwaiting={() => isLoading = true}
        onplaying={() => {
            isLoading = false;
            if (videoElement) {
                videoElement.playbackRate = playerState.playbackRate;
            }
        }}
        onloadedmetadata={() => {
            if (videoElement) {
                duration = videoElement.duration;
                videoElement.playbackRate = playerState.playbackRate;
                isLoading = false;
            }
        }}
        ontimeupdate={() => {
            if (videoElement) {
                currentTime = videoElement.currentTime;
                if (recordedId && Math.round(currentTime) % 5 === 0) {
                    playerState.savePosition(recordedId, currentTime);
                }
            }
        }}
        onended={() => {
            isPlaying = false;
            showControls = true;
            if (recordedId) playerState.clearPosition(recordedId);
            if (onStreamEnded) onStreamEnded();
        }}
        class="h-full w-full object-contain cursor-pointer"
        playsinline
    >
        <track kind="captions" />
    </video>

    <!-- ローディングスピナー -->
    {#if isLoading && !errorMessage}
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-2xs">
            <Loader2 size={48} class="animate-spin text-blue-500" />
        </div>
    {/if}

    <!-- エラー表示 -->
    {#if errorMessage}
        <div class="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-6 text-center text-white">
            <AlertCircle size={48} class="text-rose-500" />
            <p class="mt-3 text-sm font-bold">{errorMessage}</p>
            <button
                type="button"
                onclick={initVideo}
                class="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-700"
            >
                再読み込み
            </button>
        </div>
    {/if}

    <!-- レジューム再開トースト通知 -->
    {#if resumeNotice?.visible && !isLive}
        <div class="absolute top-4 left-4 right-4 z-30 flex items-center justify-between rounded-xl bg-slate-900/90 p-3 text-xs text-white shadow-xl backdrop-blur sm:left-auto sm:right-4 sm:w-80">
            <span>前回 <strong>{formatTime(resumeNotice.position)}</strong> まで視聴しました</span>
            <div class="flex items-center gap-2">
                <button
                    type="button"
                    onclick={resumeFromSaved}
                    class="rounded-lg bg-blue-600 px-2.5 py-1 font-bold text-white hover:bg-blue-700"
                >
                    再開
                </button>
                <button
                    type="button"
                    onclick={dismissResume}
                    class="rounded-lg px-2 py-1 text-slate-400 hover:text-white"
                >
                    ✕
                </button>
            </div>
        </div>
    {/if}

    <!-- タイトルバー (上部オーバーレイ) -->
    {#if title && showControls}
        <div class="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4 transition-opacity duration-300">
            <h2 class="truncate text-sm font-bold text-white drop-shadow-md">{title}</h2>
        </div>
    {/if}

    <!-- 中央クイック再生/一時停止バッジ (画面クリック時) -->
    {#if !isPlaying && !isLoading && showControls}
        <button
            type="button"
            onclick={togglePlay}
            class="absolute z-20 flex h-16 w-16 items-center justify-center rounded-full bg-blue-600/90 text-white shadow-2xl transition hover:scale-110 hover:bg-blue-600"
            aria-label="再生"
        >
            <Play size={28} fill="currentColor" class="translate-x-0.5" />
        </button>
    {/if}

    <!-- コントロールバー (下部オーバーレイ) -->
    <div
        class="absolute bottom-0 left-0 right-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 sm:p-4 transition-opacity duration-300 {showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}"
    >
        <!-- シークバー (ライブ時は非表示) -->
        {#if !isLive && duration > 0}
            <div class="mb-2.5 flex items-center gap-2">
                <span class="text-[11px] font-medium text-slate-300">{formatTime(currentTime)}</span>
                <input
                    type="range"
                    min="0"
                    max={duration}
                    step="1"
                    value={currentTime}
                    oninput={handleSeekChange}
                    onchange={(e) => (e.currentTarget as HTMLElement)?.blur()}
                    onpointerup={(e) => (e.currentTarget as HTMLElement)?.blur()}
                    tabindex="-1"
                    class="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-600 accent-blue-500 transition hover:h-2"
                />
                <span class="text-[11px] font-medium text-slate-300">{formatTime(duration)}</span>
            </div>
        {/if}

        <!-- ボタンツールバー -->
        <div class="flex items-center justify-between gap-2 text-white">
            <!-- 左側: 再生・スキップ・音量 -->
            <div class="flex items-center gap-1.5 sm:gap-2">
                <button
                    type="button"
                    onclick={togglePlay}
                    class="rounded-lg p-1.5 text-white hover:bg-white/20 transition"
                    title={isPlaying ? '一時停止 (Space)' : '再生 (Space)'}
                >
                    {#if isPlaying}
                        <Pause size={20} />
                    {:else}
                        <Play size={20} fill="currentColor" />
                    {/if}
                </button>

                {#if !isLive}
                    <button
                        type="button"
                        onclick={() => seekRelative(-10)}
                        class="rounded-lg p-1.5 text-white hover:bg-white/20 transition"
                        title="10秒戻る (←)"
                    >
                        <RotateCcw size={18} />
                    </button>

                    <button
                        type="button"
                        onclick={() => seekRelative(30)}
                        class="flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-bold text-white hover:bg-white/20 transition"
                        title="30秒スキップ (CM送り)"
                    >
                        <FastForward size={16} />
                        <span class="text-[10px]">+30s</span>
                    </button>
                {/if}

                <!-- 音量 & ミュート -->
                <div class="flex items-center gap-1 ml-1">
                    <button
                        type="button"
                        onclick={toggleMute}
                        class="rounded-lg p-1.5 text-white hover:bg-white/20 transition"
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
                        oninput={handleVolumeChange}
                        onchange={(e) => (e.currentTarget as HTMLElement)?.blur()}
                        onpointerup={(e) => (e.currentTarget as HTMLElement)?.blur()}
                        tabindex="-1"
                        class="hidden sm:block h-1 w-16 cursor-pointer appearance-none rounded-full bg-slate-600 accent-white"
                    />
                </div>

                {#if isLive}
                    <span class="flex items-center gap-1 rounded bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider animate-pulse">
                        LIVE ({streamType.toUpperCase()})
                    </span>
                {/if}
            </div>

            <!-- 右側: 倍速・PiP・全画面 -->
            <div class="flex items-center gap-1.5 sm:gap-2">
                {#if !isLive}
                    <div class="flex rounded-lg bg-white/10 p-0.5 text-[11px] font-bold">
                        {#each playbackRates as rate}
                            <button
                                type="button"
                                onclick={() => setPlaybackRate(rate)}
                                class="rounded px-1.5 py-0.5 transition {playerState.playbackRate === rate ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'}"
                            >
                                {rate}x
                            </button>
                        {/each}
                    </div>
                {/if}

                <button
                    type="button"
                    onclick={togglePiP}
                    class="rounded-lg p-1.5 text-white hover:bg-white/20 transition hidden sm:block"
                    title="ピクチャー・イン・ピクチャー"
                >
                    <PictureInPicture size={18} />
                </button>

                <button
                    type="button"
                    onclick={toggleFullscreen}
                    class="rounded-lg p-1.5 text-white hover:bg-white/20 transition"
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
</div>
