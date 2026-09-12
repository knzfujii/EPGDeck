<script lang="ts">
    import { onMount, onDestroy, untrack } from 'svelte';
    import Hls from 'hls.js';
    import Mpegts from 'mpegts.js';
    import { SubtitleManager } from './SubtitleManager';
    import VideoControls from './VideoControls.svelte';
    import { playerState } from '../../stores/playerState.svelte';
    import { formatPlayerTime } from '../../utils/format';
    import { Play, Pause, RotateCcw, RotateCw, Loader2, AlertCircle } from '@lucide/svelte';

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

    let hideControlsTimer: ReturnType<typeof setTimeout> | null = null;
    let lastLoadedSrc = '';
    let lastLoadedType = '';
    let lastSavedSecond = -1;

    function resetHideControlsTimer() {
        showControls = true;
        if (hideControlsTimer) {
            clearTimeout(hideControlsTimer);
            hideControlsTimer = null;
        }
        if (isPlaying) {
            hideControlsTimer = setTimeout(() => {
                showControls = false;
            }, 3500);
        }
    }

    function pauseHideControlsTimer() {
        if (hideControlsTimer) {
            clearTimeout(hideControlsTimer);
            hideControlsTimer = null;
        }
    }

    function handlePointerMove(e: PointerEvent) {
        // タッチデバイス（スマホ・タブレット等）のタッチ移動は無視（PCマウスの移動時のみコントロールを表示）
        if (e.pointerType === 'touch') return;
        resetHideControlsTimer();
    }

    function handlePointerLeave(e: PointerEvent) {
        if (e.pointerType === 'touch') return;
        if (isPlaying) {
            showControls = false;
            pauseHideControlsTimer();
        }
    }

    function handleOverlayClick(e: MouseEvent) {
        e.stopPropagation();
        if (!showControls) {
            // コントロール非表示時：動画の再生・停止は行わず、コントロールを表示するのみ
            resetHideControlsTimer();
        } else {
            // コントロール表示時：背景タップでコントロールを即座に隠す
            showControls = false;
            pauseHideControlsTimer();
        }
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

                mpegtsInstance.on(Mpegts.Events.ERROR, (type: any, detail: any, info: any) => {
                    console.warn('Mpegts error:', type, detail, info);
                    const statusCode =
                        info?.code || info?.status || (info?.response ? info.response.status : undefined);
                    if (statusCode === 503 || (typeof detail === 'string' && detail.includes('503'))) {
                        errorMessage =
                            '利用可能なチューナーがありません（現在すべてのチューナーが録画等で使用されています）';
                    } else if (type === Mpegts.ErrorTypes.NETWORK_ERROR) {
                        errorMessage = 'ストリームの接続に失敗しました';
                    } else {
                        errorMessage = 'ストリームの再生に失敗しました';
                    }
                    isLoading = false;
                    cleanupEngines();
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
                            case Hls.ErrorTypes.NETWORK_ERROR: {
                                const statusCode = data.response?.code || (data.response as any)?.status;
                                if (statusCode === 503) {
                                    errorMessage =
                                        '利用可能なチューナーがありません（現在すべてのチューナーが録画等で使用されています）';
                                    isLoading = false;
                                    cleanupEngines();
                                } else {
                                    console.warn('HLS Network error, recovering...');
                                    hlsInstance?.startLoad();
                                }
                                break;
                            }
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                console.warn('HLS Media error, recovering...');
                                hlsInstance?.recoverMediaError();
                                break;
                            default:
                                errorMessage = 'ストリームの再生に失敗しました';
                                isLoading = false;
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
    onpointermove={handlePointerMove}
    onpointerleave={handlePointerLeave}
    class="group relative flex aspect-video w-full max-w-full items-center justify-center overflow-hidden rounded-none bg-black shadow-2xl select-none"
    role="region"
    aria-label="動画プレーヤー"
>
    <!-- ビデオ本体 -->
    <video
        bind:this={videoElement}
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
            pauseHideControlsTimer();
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
            pauseHideControlsTimer();
            if (recordedId) playerState.clearPosition(recordedId);
            if (props.onStreamEnded) props.onStreamEnded();
        }}
        onerror={() => {
            isLoading = false;
            if (!errorMessage) {
                errorMessage = isLive
                    ? 'ライブ配信の再生に失敗しました（チューナー不足または配信停止）'
                    : '動画の再生に失敗しました';
            }
        }}
        class="h-full w-full object-contain"
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

    <!-- タップ / クリック判定用オーバーレイ (非表示時はコントロール表示、表示時は非表示化) -->
    <button
        type="button"
        onclick={handleOverlayClick}
        class="absolute inset-0 z-10 h-full w-full cursor-pointer border-none bg-transparent p-0 focus:outline-hidden touch-manipulation"
        tabindex="-1"
        aria-label={showControls ? 'コントロールを非表示' : 'コントロールを表示'}
    ></button>

    <!-- ローディングスピナー -->
    {#if isLoading && !errorMessage}
        <div
            class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/30 backdrop-blur-2xs"
        >
            <Loader2 size={48} class="animate-spin text-blue-500" />
        </div>
    {/if}

    <!-- エラー表示 -->
    {#if errorMessage}
        <div
            class="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 p-6 text-center text-white"
        >
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
            class="pointer-events-none absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4 transition-opacity duration-300"
        >
            <h2 class="truncate text-sm font-bold text-white drop-shadow-md">{title}</h2>
        </div>
    {/if}

    {#snippet seekButton(offset: number, iconType: 'ccw' | 'cw', label: string, title: string)}
        <button
            type="button"
            onclick={e => {
                e.stopPropagation();
                seekRelative(offset);
            }}
            class="pointer-events-auto relative flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-black/20 text-white shadow-lg backdrop-blur-xs transition hover:scale-110 hover:bg-black/40 active:scale-95 cursor-pointer touch-manipulation drop-shadow-sm"
            {title}
            aria-label={title}
        >
            {#if iconType === 'ccw'}
                <RotateCcw class="h-10 w-10 sm:h-11 sm:w-11" strokeWidth={1.75} />
            {:else}
                <RotateCw class="h-10 w-10 sm:h-11 sm:w-11" strokeWidth={1.75} />
            {/if}
            <span
                class="absolute inset-0 flex items-center justify-center text-[10px] sm:text-[11px] font-black tracking-tighter select-none pt-0.5"
            >
                {label}
            </span>
        </button>
    {/snippet}

    <!-- 中央クイック操作ボタン群 (スマホでも快適にタップ可能) -->
    {#if showControls && !isLoading && !errorMessage}
        <div
            class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-5 sm:gap-10 transition-opacity duration-200"
        >
            {#if canSeek}
                {@render seekButton(-10, 'ccw', '-10s', '10秒戻る')}
            {/if}

            <button
                type="button"
                onclick={e => {
                    e.stopPropagation();
                    togglePlay();
                    resetHideControlsTimer();
                }}
                class="pointer-events-auto flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-blue-600/35 text-white shadow-xl backdrop-blur-xs transition hover:scale-110 hover:bg-blue-600/60 active:scale-95 cursor-pointer touch-manipulation drop-shadow-sm"
                title={isPlaying ? '一時停止' : '再生'}
                aria-label={isPlaying ? '一時停止' : '再生'}
            >
                {#if isPlaying}
                    <Pause size={32} class="sm:scale-110" />
                {:else}
                    <Play size={32} fill="currentColor" class="translate-x-0.5 sm:scale-110" />
                {/if}
            </button>

            {#if canSeek}
                {@render seekButton(30, 'cw', '+30s', '30秒進む')}
            {/if}
        </div>
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
        onSeekStart={pauseHideControlsTimer}
        onSeekEnd={resetHideControlsTimer}
        onToggleMute={toggleMute}
        onVolumeChange={handleVolumeChange}
        onSetPlaybackRate={setPlaybackRate}
        onToggleSubtitle={toggleSubtitle}
        onTogglePiP={togglePiP}
        onToggleFullscreen={toggleFullscreen}
    />
</div>
