<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { readOnlyStore } from '../lib/stores/readOnly.svelte';
    import { getChannelTypeBadgeClass } from '../lib/utils/format';
    import VideoPlayer from '../lib/components/video/VideoPlayer.svelte';
    import api from '@/lib/apiClient';
    import { ArrowLeft, Radio, Clock, Loader2 } from '@lucide/svelte';
    import Button from '@/lib/components/common/Button.svelte';

    let videoSrc = $state<string>('');
    let streamType = $state<'m2tsll' | 'm2ts' | 'webm' | 'mp4' | 'hls' | 'direct'>('direct');
    let isHls = $state(false);
    let isLive = $state(false);
    let streamId = $state<number | null>(null);
    let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
    let isPreparingStream = $state(false);
    let statusText = $state('ストリームを準備中...');
    let statusMessage = $state('');

    // 番組情報
    let programTitle = $state('');
    let channelName = $state('');
    let timeRange = $state('');
    let description = $state('');
    let extended = $state('');
    let isLoadingInfo = $state(true);

    async function waitForStreamReady(id: number): Promise<boolean> {
        for (let i = 1; i <= 100; i++) {
            const sec = (i * 0.3).toFixed(1);
            statusText = `HLS 配信を準備中... (${sec}秒)`;
            if (statusMessage) {
                statusMessage = statusMessage.replace(/\s*\([\d.]+秒\)$/, '') + ` (${sec}秒)`;
            }
            try {
                // API での isEnable チェック
                const infoRes = await api.streams.$get({ query: { isHalfWidth: true } });
                if (infoRes.ok) {
                    const infoData = await infoRes.json();
                    const items = infoData?.items || [];
                    const stream = items.find(item => Number(item.streamId) === Number(id));
                    const isReady = stream?.isEnable;
                    if (isReady === true) {
                        return true;
                    }
                }

                // マニフェストファイルが直接取得できるか確認
                if (i >= 5) {
                    try {
                        const m3u8Res = await fetch(`/streamfiles/stream${id}.m3u8`);
                        if (m3u8Res.ok && (await m3u8Res.text()).includes('#EXTM3U')) {
                            return true;
                        }
                    } catch {
                        // ignore
                    }
                }
            } catch {
                // ignore
            }
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        return false;
    }

    async function startHlsStream(startFn: () => Promise<number>, preparingMessage: string): Promise<boolean> {
        streamType = 'hls';
        isPreparingStream = true;
        statusText = preparingMessage;

        const sId = await startFn();
        streamId = sId;
        startKeepAlive(sId);

        const isReady = await waitForStreamReady(sId);
        if (isReady) {
            videoSrc = `/streamfiles/stream${sId}.m3u8?t=${Date.now()}`;
            isHls = true;
            return true;
        }
        throw new Error('Stream timed out waiting for manifest');
    }

    async function initWatch() {
        const query = router.current.query;
        const channelId = query.channelId ? parseInt(query.channelId, 10) : null;
        const recordedId = query.recordedId ? parseInt(query.recordedId, 10) : null;
        const reqType = (query.type as string) || 'm2tsll';
        const mode = query.mode ? parseInt(query.mode, 10) : 0;

        await channelStore.fetch();

        if (channelId !== null && !isNaN(channelId)) {
            // ================= ライブストリーミング =================
            isLive = true;
            channelName = channelStore.getChannelName(channelId);

            // 現在の放送中番組情報を取得
            try {
                const onAirRes = await api.schedules.broadcasting.$get({ query: { isHalfWidth: true } });
                if (onAirRes.ok) {
                    const data = await onAirRes.json();
                    const channelSchedule = (data || []).find(s => s.channel?.id === channelId);
                    if (channelSchedule?.programs?.[0]) {
                        const prog = channelSchedule.programs[0];
                        programTitle = prog.name;
                        description = prog.description || '';
                        extended = prog.extended || '';
                        const start = new Date(prog.startAt);
                        const end = new Date(prog.endAt);
                        timeRange = `${formatTime(start)} - ${formatTime(end)}`;
                    } else {
                        programTitle = `${channelName} ライブ配信`;
                    }
                } else {
                    programTitle = `${channelName} ライブ配信`;
                }
            } catch (e) {
                console.error('Failed to fetch onair info', e);
                programTitle = `${channelName} ライブ配信`;
            }

            if (reqType === 'm2tsll' || reqType === 'm2ts') {
                // 🚀 M2TS-LL (最速・超低遅延): 待ち時間 0 秒で即座に再生
                streamType = reqType;
                isHls = false;
                videoSrc = readOnlyStore.withAuthToken(`/api/streams/live/${channelId}/${reqType}?mode=${mode}`);
                isLoadingInfo = false;
            } else if (reqType === 'webm' || reqType === 'mp4') {
                // ⚡ WebM / MP4 (高速): 待ち時間 0 秒で即座に再生
                streamType = reqType;
                isHls = false;
                videoSrc = readOnlyStore.withAuthToken(`/api/streams/live/${channelId}/${reqType}?mode=${mode}`);
                isLoadingInfo = false;
            } else {
                // 📱 HLS 配信
                try {
                    await startHlsStream(async () => {
                        const res = await api.streams.live[':channelId'].hls.$get({
                            param: { channelId: String(channelId) },
                            query: { mode },
                        });
                        if (!res.ok) {
                            const err = new Error(`Failed to start live stream: ${res.status}`) as Error & {
                                status?: number;
                            };
                            err.status = res.status;
                            throw err;
                        }
                        const data = await res.json();
                        return Number(data.streamId);
                    }, 'チューナーを確保してライブ配信を生成中...');
                } catch (e: unknown) {
                    console.error('Failed to start live stream', e);
                    const httpErr = e as { status?: number; response?: { status?: number } } | null;
                    if (httpErr?.status === 503 || httpErr?.response?.status === 503) {
                        const msg = 'チューナー不足: 現在利用可能なチューナーがありません（録画等で使用中）';
                        snackbar.open({ text: msg, color: 'error' });
                        statusText = msg;
                    } else {
                        snackbar.open({ text: 'ライブストリームの開始に失敗しました', color: 'error' });
                        statusText = 'ライブストリームの開始に失敗しました';
                    }
                } finally {
                    isLoadingInfo = false;
                    isPreparingStream = false;
                }
            }
        } else if (recordedId !== null && !isNaN(recordedId)) {
            // ================= 録画再生: /recorded/detail (一体化画面) へリダイレクト =================
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(router.current.query)) {
                if (v) params.set(k, v);
            }
            params.set('play', '1');
            router.replace(`/recorded/detail?${params.toString()}`);
            return;
        } else {
            router.replace('/onair');
            return;
        }
    }

    function startKeepAlive(id: number | null) {
        if (id === null || isNaN(id)) return;
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        keepAliveInterval = setInterval(async () => {
            try {
                await api.streams[':streamId'].keep.$put({
                    param: { streamId: String(id) },
                });
            } catch (e) {
                console.error('KeepAlive ping failed', e);
            }
        }, 10000);
    }

    async function stopStream() {
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
        }
        if (streamId !== null && !isNaN(streamId)) {
            const currentId = streamId;
            streamId = null;
            try {
                await api.streams[':streamId'].$delete({
                    param: { streamId: String(currentId) },
                });
            } catch (e) {
                console.error('Failed to stop stream', e);
            }
        }
    }

    function formatTime(d: Date): string {
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }

    onMount(() => {
        initWatch();
    });

    onDestroy(() => {
        stopStream();
    });
</script>

<div class="w-full max-w-5xl min-w-0 flex flex-col gap-4">
    <!-- ヘッダー & 戻るボタン -->
    <div class="flex items-center justify-between">
        <Button
            variant="secondary"
            onclick={() => {
                if (window.history.length > 1) {
                    window.history.back();
                } else {
                    router.push('/onair');
                }
            }}
            class="flex items-center gap-2"
        >
            <ArrowLeft size={16} />
            {isLive ? '放送中へ戻る' : '戻る'}
        </Button>

        {#if channelName}
            {@const ch = channelStore.channels.find(c => c.name === channelName)}
            <span
                class="flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs sm:text-sm font-bold {getChannelTypeBadgeClass(
                    ch?.channelType,
                )}"
            >
                <Radio size={14} />
                {channelName}
            </span>
        {/if}
    </div>

    <!-- プレーヤーコンポーネント (動画は角丸禁止・シャープな直角 rounded-none 厳守) -->
    <div class="w-full">
        {#if videoSrc}
            <VideoPlayer
                src={videoSrc}
                {streamType}
                {isHls}
                {isLive}
                {statusMessage}
                title={programTitle}
                onStreamEnded={stopStream}
            />
        {:else}
            <div
                class="flex aspect-video w-full flex-col items-center justify-center rounded-none bg-slate-900 text-xs text-slate-300 p-6 text-center shadow-xl"
            >
                <Loader2 size={36} class="animate-spin text-blue-500 mb-3" />
                <p class="font-bold">{statusText}</p>
                <p class="text-xs text-slate-500 mt-1">数秒お待ちください...</p>
            </div>
        {/if}
    </div>

    <!-- 番組詳細情報カード -->
    <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div class="flex flex-col gap-2.5">
            <h1 class="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100">
                {isLoadingInfo ? '読み込み中...' : programTitle || '（タイトルなし）'}
            </h1>

            {#if timeRange}
                <div
                    class="flex items-center gap-3 text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400 flex-wrap"
                >
                    <span class="flex items-center gap-1">
                        <Clock size={14} />
                        {timeRange}
                    </span>
                </div>
            {/if}

            {#if description}
                <p class="program-description mt-2">
                    {description}
                </p>
            {/if}

            {#if extended}
                <div class="program-extended mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                    {extended}
                </div>
            {/if}
        </div>
    </div>
</div>
