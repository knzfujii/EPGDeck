<script lang="ts">
    import { onMount, onDestroy, untrack } from 'svelte';
    import Hls from 'hls.js';
    import Mpegts from 'mpegts.js';
    import { SubtitleManager } from './SubtitleManager';
    import VideoControls from './VideoControls.svelte';
    import { playerState } from '../../stores/playerState.svelte';
    import { formatPlayerTime } from '../../utils/format';
    import { Play, Loader2, AlertCircle } from '@lucide/svelte';

    interface Props {
        src: string;
        streamType?: 'm2tsll' | 'm2ts' | 'webm' | 'mp4' | 'hls' | 'direct';
        isHls?: boolean;
        isLive?: boolean;
        title?: string;
        recordedId?: number;
        totalDuration?: number;
        vttSrc?: string;
        onStreamEnded?: () => void;
    }

    let props: Props = $props();

    let videoElement = $state<HTMLVideoElement | null>(null);
    let containerElement = $state<HTMLDivElement | null>(null);
    let subtitleContainer = $state<HTMLDivElement | null>(null);
    let hasSubtitle = $state(false);
    let isSubtitleOn = $state(false);
    const subtitleManager = new SubtitleManager({
        onSubtitleDetected: () => {
            hasSubtitle = true;
        },
    });
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

    // props のエイリアス
    let streamType = $derived(props.streamType || 'direct');
    let isHls = $derived(props.isHls ?? false);
    let isLive = $derived(props.isLive ?? false);
    let title = $derived(props.title || '');
    let recordedId = $derived(props.recordedId);
    let src = $derived(props.src);
    let vttSrc = $derived(props.vttSrc);

    // 表示用の動画全体の長さ (秒)
    // 直接再生（direct / mp4）の時はブラウザの videoElement.duration（実尺）を最優先。
    // HLS や WebM などのストリーミング時は、DB上の totalDuration を優先しつつ、
    // ネイティブ duration が totalDuration より大きい場合はネイティブを採用。
    let displayDuration = $derived.by(() => {
        const nativeDur = Number.isFinite(duration) && duration > 0 ? duration : 0;
        const total = props.totalDuration ?? 0;

        if (streamType === 'direct' && nativeDur > 0) {
            return nativeDur;
        }
        if (total > 0) {
            return nativeDur > total ? nativeDur : total;
        }
        return nativeDur;
    });

    // シーク可能かどうか
    let canSeek = $derived(!isLive && displayDuration > 0 && Number.isFinite(displayDuration));

    let hideControlsTimer: any = null;
    let lastLoadedSrc = '';
    let lastLoadedType = '';
    let lastSavedSecond = -1;

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
        const effectiveRate = isLive ? 1 : rate;
        if (!isLive) {
            playerState.setPlaybackRate(rate);
        }
        if (videoElement) {
            videoElement.playbackRate = effectiveRate;
            videoElement.defaultPlaybackRate = effectiveRate;
        }
        resetHideControlsTimer();
    }

    // 全画面切り替え
    function toggleFullscreen() {
        if (!containerElement) return;
        if (!document.fullscreenElement) {
            containerElement
                .requestFullscreen()
                .then(() => {
                    isFullscreen = true;
                })
                .catch(err => console.error('Fullscreen request failed:', err));
        } else {
            document
                .exitFullscreen()
                .then(() => {
                    isFullscreen = false;
                })
                .catch(err => console.error('Exit fullscreen failed:', err));
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

    // 字幕レンダラーの初期化 & 管理
    function initSubtitleRenderer() {
        if (!videoElement || !subtitleContainer) return;
        isSubtitleOn = playerState.isSubtitleEnabled ?? false;
        subtitleManager.attach(videoElement, subtitleContainer, isSubtitleOn);
    }

    function cleanupSubtitleRenderer() {
        subtitleManager.detach();
    }

    function syncNativeTextTracks(enabled: boolean) {
        if (!videoElement || !videoElement.textTracks) return;
        for (let i = 0; i < videoElement.textTracks.length; i++) {
            videoElement.textTracks[i].mode = enabled ? 'showing' : 'hidden';
        }
    }

    function toggleSubtitle() {
        const nextEnabled = !isSubtitleOn;
        isSubtitleOn = nextEnabled;

        if (typeof playerState.setSubtitleEnabled === 'function') {
            playerState.setSubtitleEnabled(nextEnabled);
        } else {
            playerState.isSubtitleEnabled = nextEnabled;
            try {
                localStorage.setItem('epgdeck_subtitle_enabled', nextEnabled.toString());
            } catch (e) {
                // ignore
            }
        }

        subtitleManager.setEnabled(nextEnabled);
        syncNativeTextTracks(nextEnabled);
        resetHideControlsTimer();
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
            case 'j':
                e.preventDefault();
                seekRelative(-10);
                break;
            case 'ArrowRight':
            case 'l':
                e.preventDefault();
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
            case 'c':
                e.preventDefault();
                toggleSubtitle();
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
        cleanupSubtitleRenderer();
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
        hasSubtitle = false;

        // 設定の復元
        videoElement.volume = playerState.volume;
        videoElement.muted = playerState.isMuted;
        videoElement.playbackRate = isLive ? 1 : playerState.playbackRate;

        // 1. M2TS-LL (MPEG-TS Low Latency) 爆速再生モード
        if (streamType === 'm2tsll' || streamType === 'm2ts') {
            if (Mpegts.isSupported() && Mpegts.getFeatureList().mseLivePlayback) {
                initSubtitleRenderer();
                Mpegts.LoggingControl.enableVerbose = false;
                // WebWorker 内での fetch に対応するため絶対 URL に変換
                const absoluteUrl = src.startsWith('http')
                    ? src
                    : `${window.location.origin}${src.startsWith('/') ? '' : '/'}${src}`;

                mpegtsInstance = Mpegts.createPlayer(
                    {
                        type: 'mse',
                        isLive: true,
                        url: absoluteUrl,
                    },
                    {
                        enableWorker: true,
                        enableStashBuffer: true,
                        stashInitialSize: 384 * 1024,
                        liveBufferLatencyChasing: true,
                        liveBufferLatencyMinRemain: 1.0,
                        liveBufferLatencyMaxLatency: 3.0,
                    },
                );
                mpegtsInstance.attachMediaElement(videoElement);
                mpegtsInstance.load();
                mpegtsInstance.play();

                mpegtsInstance.on(Mpegts.Events.ERROR, (type, detail, info) => {
                    console.warn('Mpegts error:', type, detail, info);
                });

                mpegtsInstance.on(Mpegts.Events.TIMED_ID3_METADATA_ARRIVED, (data: any) => {
                    subtitleManager.feedMpegtsId3Data(data);
                });

                mpegtsInstance.on(Mpegts.Events.PES_PRIVATE_DATA_ARRIVED, (data: any) => {
                    subtitleManager.feedMpegtsPesData(data);
                });
                return;
            }
        }

        // 2. HLS モード
        if (isHls || streamType === 'hls') {
            if (Hls.isSupported()) {
                initSubtitleRenderer();
                hlsInstance = new Hls({
                    enableWorker: true,
                    lowLatencyMode: isLive,
                    backBufferLength: isLive ? 30 : 90,
                    maxBufferLength: isLive ? 10 : 60,
                    maxMaxBufferLength: isLive ? 30 : 600,
                    manifestLoadingTimeOut: 20000,
                    manifestLoadingMaxRetry: 10,
                    manifestLoadingRetryDelay: 1000,
                });
                hlsInstance.loadSource(src);
                hlsInstance.attachMedia(videoElement);

                hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                    isLoading = false;
                    videoElement?.play().catch(e => console.log('Autoplay prevented:', e));
                });

                hlsInstance.on(Hls.Events.FRAG_PARSING_METADATA, (_event, data) => {
                    subtitleManager.feedHlsMetadata(data.samples);
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
        if (currentSrc && (currentSrc !== lastLoadedSrc || currentType !== lastLoadedType)) {
            lastLoadedSrc = currentSrc;
            lastLoadedType = currentType;
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
            window.removeEventListener('keydown', handleKeyDown);
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
    onmouseleave={() => {
        if (isPlaying) showControls = false;
    }}
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
                videoElement.playbackRate = isLive ? 1 : playerState.playbackRate;
            }
            resetHideControlsTimer();
        }}
        onpause={() => {
            isPlaying = false;
            showControls = true;
        }}
        onwaiting={() => (isLoading = true)}
        onplaying={() => {
            isLoading = false;
            if (videoElement) {
                videoElement.playbackRate = isLive ? 1 : playerState.playbackRate;
            }
        }}
        onloadedmetadata={() => {
            if (videoElement) {
                duration = videoElement.duration;
                videoElement.playbackRate = isLive ? 1 : playerState.playbackRate;
                isLoading = false;
                syncNativeTextTracks(isSubtitleOn);
            }
        }}
        ontimeupdate={() => {
            if (videoElement) {
                currentTime = videoElement.currentTime;
                const currentSec = Math.floor(currentTime);
                if (recordedId && currentSec % 5 === 0 && currentSec !== lastSavedSecond) {
                    lastSavedSecond = currentSec;
                    playerState.savePosition(recordedId, currentTime);
                }
            }
        }}
        onended={() => {
            isPlaying = false;
            showControls = true;
            if (recordedId) playerState.clearPosition(recordedId);
            if (props.onStreamEnded) props.onStreamEnded();
        }}
        class="h-full w-full object-contain cursor-pointer"
        playsinline
    >
        {#if vttSrc}
            <track src={vttSrc} kind="subtitles" srclang="ja" label="日本語" default={isSubtitleOn} />
        {/if}
    </video>
    <div
        bind:this={subtitleContainer}
        class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden"
        aria-hidden="true"
    ></div>

    <!-- ローディングスピナー -->
    {#if isLoading && !errorMessage}
        <div
            class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-2xs"
        >
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
        <div
            class="absolute top-4 left-4 right-4 z-30 flex items-center justify-between rounded-xl bg-slate-900/90 p-3 text-xs text-white shadow-xl backdrop-blur sm:left-auto sm:right-4 sm:w-80"
        >
            <span>
                前回 <strong>{formatPlayerTime(resumeNotice.position)}</strong>
                まで視聴しました
            </span>
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
        <div
            class="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4 transition-opacity duration-300"
        >
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
    <VideoControls
        {isPlaying}
        {showControls}
        {canSeek}
        {currentTime}
        {displayDuration}
        {isLive}
        {streamType}
        {isHls}
        {isSubtitleOn}
        {isFullscreen}
        onTogglePlay={togglePlay}
        onSeekChange={handleSeekChange}
        onSeekRelative={seekRelative}
        onToggleMute={toggleMute}
        onVolumeChange={handleVolumeChange}
        onSetPlaybackRate={setPlaybackRate}
        onToggleSubtitle={toggleSubtitle}
        onTogglePiP={togglePiP}
        onToggleFullscreen={toggleFullscreen}
    />
</div>
