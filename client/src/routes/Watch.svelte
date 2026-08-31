<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import VideoPlayer from '../lib/components/video/VideoPlayer.svelte';
    import axios from 'axios';
    import {
        ArrowLeft,
        Radio,
        Calendar,
        Clock,
        FileVideo,
        Download,
        Share2,
        Loader2,
        AlertTriangle
    } from '@lucide/svelte';

    let videoSrc = $state<string>('');
    let streamType = $state<'m2tsll' | 'm2ts' | 'webm' | 'mp4' | 'hls' | 'direct'>('direct');
    let isHls = $state(false);
    let isLive = $state(false);
    let streamId = $state<number | null>(null);
    let keepAliveInterval: any = null;
    let isPreparingStream = $state(false);
    let statusText = $state('ストリームを準備中...');

    // 番組情報
    let programTitle = $state('');
    let channelName = $state('');
    let timeRange = $state('');
    let description = $state('');
    let extended = $state('');
    let recordedData = $state<any>(null);
    let isLoadingInfo = $state(true);

    let totalDuration = $derived.by(() => {
        if (!recordedData) return 0;
        if (recordedData.startAt && recordedData.endAt) {
            return Math.max(0, Math.floor((recordedData.endAt - recordedData.startAt) / 1000));
        }
        if (recordedData.duration && recordedData.duration > 0) {
            return recordedData.duration > 86400 ? Math.floor(recordedData.duration / 1000) : recordedData.duration;
        }
        return 0;
    });

    async function waitForStreamReady(id: number): Promise<boolean> {
        for (let i = 1; i <= 100; i++) {
            const sec = (i * 0.3).toFixed(1);
            statusText = `HLS 配信を準備中... (${sec}秒)`;
            try {
                // 1. API での isEnable チェック
                const infoRes = await axios.get('/api/streams?isHalfWidth=true');
                const items = infoRes.data?.items || [];
                const stream = items.find((item: any) => Number(item.streamId) === Number(id));
                const isReady = stream?.info?.isEnable ?? stream?.isEnable;
                if (isReady === true) {
                    return true;
                }

                // 2. マニフェストファイルが直接取得できるか確認
                if (i >= 5) {
                    try {
                        const m3u8Res = await axios.get(`/streamfiles/stream${id}.m3u8`, {
                            validateStatus: status => status === 200,
                        });
                        if (m3u8Res.status === 200 && typeof m3u8Res.data === 'string' && m3u8Res.data.includes('#EXTM3U')) {
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

    async function initWatch() {
        const query = router.current.query;
        const channelId = query.channelId ? parseInt(query.channelId, 10) : null;
        const recordedId = query.recordedId ? parseInt(query.recordedId, 10) : null;
        const videoId = query.videoId ? parseInt(query.videoId, 10) : null;
        const videoFileId = query.videoFileId ? parseInt(query.videoFileId, 10) : null;
        const reqType = (query.type as any) || 'm2tsll';
        const mode = query.mode ? parseInt(query.mode, 10) : 0;

        await channelStore.fetch();

        if (channelId !== null && !isNaN(channelId)) {
            // ================= ライブストリーミング =================
            isLive = true;
            channelName = channelStore.getChannelName(channelId);

            // 現在の放送中番組情報を取得
            try {
                const onAirRes = await axios.get('/api/schedules/broadcasting?isHalfWidth=true');
                const channelSchedule = (onAirRes.data || []).find((s: any) => s.channel?.id === channelId);
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
            } catch (e) {
                console.error('Failed to fetch onair info', e);
                programTitle = `${channelName} ライブ配信`;
            }

            if (reqType === 'm2tsll' || reqType === 'm2ts') {
                // 🚀 M2TS-LL (最速・超低遅延): 待ち時間 0 秒で即座に再生
                streamType = reqType;
                isHls = false;
                videoSrc = `/api/streams/live/${channelId}/${reqType}?mode=${mode}`;
                isLoadingInfo = false;
            } else if (reqType === 'webm' || reqType === 'mp4') {
                // ⚡ WebM / MP4 (高速): 待ち時間 0 秒で即座に再生
                streamType = reqType;
                isHls = false;
                videoSrc = `/api/streams/live/${channelId}/${reqType}?mode=${mode}`;
                isLoadingInfo = false;
            } else {
                // 📱 HLS 配信
                streamType = 'hls';
                isPreparingStream = true;
                statusText = 'チューナーを確保してライブ配信を生成中...';

                try {
                    const streamRes = await axios.get(`/api/streams/live/${channelId}/hls`, {
                        params: { mode }
                    });
                    const sId = Number(streamRes.data.streamId);
                    streamId = sId;
                    startKeepAlive(sId);

                    const isReady = await waitForStreamReady(sId);
                    if (isReady) {
                        videoSrc = `/streamfiles/stream${sId}.m3u8`;
                        isHls = true;
                    } else {
                        throw new Error('Stream timed out waiting for manifest');
                    }
                } catch (e) {
                    console.error('Failed to start live stream', e);
                    snackbar.open({ text: 'ライブストリームの開始に失敗しました', color: 'error' });
                    statusText = 'ライブストリームの開始に失敗しました';
                } finally {
                    isLoadingInfo = false;
                    isPreparingStream = false;
                }
            }
        } else if (recordedId !== null && !isNaN(recordedId)) {
            // ================= 録画再生 =================
            isLive = false;

            try {
                const recRes = await axios.get(`/api/recorded/${recordedId}?isHalfWidth=true`);
                recordedData = recRes.data;
                programTitle = recordedData.name;
                channelName = channelStore.getChannelName(recordedData.channelId);
                description = recordedData.description || '';
                extended = recordedData.extended || '';
                const start = new Date(recordedData.startAt);
                const end = new Date(recordedData.endAt);
                timeRange = `${start.getMonth() + 1}/${start.getDate()} ${formatTime(start)} - ${formatTime(end)}`;

                if (videoId !== null && !isNaN(videoId)) {
                    // 直接再生 (MP4 / WebM)
                    streamType = 'direct';
                    videoSrc = `/api/videos/${videoId}`;
                    isHls = false;
                } else if (videoFileId !== null && !isNaN(videoFileId)) {
                    if (reqType === 'mp4' || reqType === 'webm') {
                        // トランスコード MP4/WebM 直接ストリーム
                        streamType = reqType;
                        videoSrc = `/api/streams/recorded/${videoFileId}/${reqType}?mode=${mode}`;
                        isHls = false;
                    } else {
                        // トランスコード HLS ストリーミング
                        streamType = 'hls';
                        isPreparingStream = true;
                        statusText = 'トランスコード配信を生成中...';
                        const streamRes = await axios.get(`/api/streams/recorded/${videoFileId}/hls`, {
                            params: { mode }
                        });
                        const sId = Number(streamRes.data.streamId);
                        streamId = sId;
                        startKeepAlive(sId);

                        const isReady = await waitForStreamReady(sId);
                        if (isReady) {
                            videoSrc = `/streamfiles/stream${sId}.m3u8`;
                            isHls = true;
                        } else {
                            throw new Error('Stream timed out');
                        }
                    }
                } else if (recordedData.videoFiles?.[0]) {
                    // デフォルト: 最初のファイル
                    const firstFile = recordedData.videoFiles[0];
                    if (firstFile.type === 'encoded') {
                        streamType = 'direct';
                        videoSrc = `/api/videos/${firstFile.id}`;
                        isHls = false;
                    } else {
                        streamType = 'hls';
                        isPreparingStream = true;
                        statusText = 'トランスコード配信を生成中...';
                        const streamRes = await axios.get(`/api/streams/recorded/${firstFile.id}/hls`, {
                            params: { mode: 0 }
                        });
                        const sId = Number(streamRes.data.streamId);
                        streamId = sId;
                        startKeepAlive(sId);

                        const isReady = await waitForStreamReady(sId);
                        if (isReady) {
                            videoSrc = `/streamfiles/stream${sId}.m3u8`;
                            isHls = true;
                        }
                    }
                }
            } catch (e) {
                console.error('Failed to fetch recorded detail', e);
                snackbar.open({ text: '録画情報の取得に失敗しました', color: 'error' });
            } finally {
                isLoadingInfo = false;
                isPreparingStream = false;
            }
        }
    }

    function startKeepAlive(id: number | null) {
        if (id === null || isNaN(id)) return;
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        keepAliveInterval = setInterval(async () => {
            try {
                await axios.put(`/api/streams/${id}/keep`);
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
                await axios.delete(`/api/streams/${currentId}`);
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

<div class="w-full max-w-5xl min-w-0 space-y-4">
    <!-- ヘッダー & 戻るボタン -->
    <div class="flex items-center justify-between">
        <button
            type="button"
            onclick={() => {
                if (window.history.length > 1) {
                    window.history.back();
                } else if (isLive) {
                    router.push('/onair');
                } else if (recordedData?.id) {
                    router.push(`/recorded/detail?recordedId=${recordedData.id}`);
                } else {
                    router.push('/recorded');
                }
            }}
            class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        >
            <ArrowLeft size={16} />
            {isLive ? '放映中へ戻る' : '戻る'}
        </button>

        {#if channelName}
            <span class="flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                {#if isLive}
                    <Radio size={14} />
                {:else}
                    <FileVideo size={14} />
                {/if}
                {channelName}
            </span>
        {/if}
    </div>

    <!-- プレーヤーコンポーネント -->
    <div class="w-full">
        {#if videoSrc}
            <VideoPlayer
                src={videoSrc}
                {streamType}
                {isHls}
                {isLive}
                title={programTitle}
                recordedId={recordedData?.id}
                totalDuration={totalDuration}
                onStreamEnded={stopStream}
            />
        {:else}
            <div class="flex aspect-video w-full flex-col items-center justify-center rounded-none bg-slate-900 text-xs text-slate-300 p-6 text-center shadow-xl">
                <Loader2 size={36} class="animate-spin text-blue-500 mb-3" />
                <p class="font-bold">{statusText}</p>
                <p class="text-[11px] text-slate-500 mt-1">数秒お待ちください...</p>
            </div>
        {/if}
    </div>

    <!-- 番組詳細情報カード -->
    <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div class="flex flex-col gap-2">
            <h1 class="text-base font-black text-slate-900 dark:text-slate-100 sm:text-lg">
                {programTitle || '読み込み中...'}
            </h1>

            {#if timeRange}
                <div class="flex items-center gap-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <span class="flex items-center gap-1">
                        <Clock size={13} /> {timeRange}
                    </span>
                    {#if recordedData?.videoFiles?.[0]}
                        <span class="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {recordedData.videoFiles[0].name}
                        </span>
                    {/if}
                </div>
            {/if}

            {#if description}
                <p class="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                    {description}
                </p>
            {/if}

            {#if extended}
                <div class="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500 whitespace-pre-wrap leading-relaxed dark:border-slate-800 dark:text-slate-400">
                    {extended}
                </div>
            {/if}
        </div>
    </div>
</div>
