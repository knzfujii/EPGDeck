<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { socketStore } from '../lib/stores/socket.svelte';
    import { formatDate, formatTime, formatTimeRange, formatDuration, formatSize } from '../lib/utils/format';
    import StreamSelectModal from '../lib/components/video/StreamSelectModal.svelte';
    import axios from 'axios';
    import type * as apid from '../../../api';
    import {
        ArrowLeft,
        Play,
        Lock,
        Unlock,
        Trash2,
        Download,
        Share2,
        Clock,
        Tv,
        FileVideo,
        Sparkles,
        AlertTriangle,
        CheckCircle2,
        Layers,
        Info,
        HardDrive,
        FileText
    } from '@lucide/svelte';

    let recorded = $state<apid.RecordedItem | null>(null);
    let isLoading = $state(true);
    let isStreamModalOpen = $state(false);

    // エンコード追加モーダル
    let isEncodeModalOpen = $state(false);
    let encodeModes = $state<any[]>([]);
    let selectedEncodeMode = $state<string>('');
    let isEncodeSubtitles = $state(false);
    let isRemoveOriginal = $state(false);

    // ドロップログモーダル
    let isDropLogModalOpen = $state(false);
    let dropLogData = $state<any>(null);
    let isLoadingDropLog = $state(false);

    let unsubscribeSocket: (() => void) | null = null;

    const query = $derived(router.current.query);
    const recordedId = $derived(query.recordedId ? parseInt(query.recordedId, 10) : null);

    async function fetchRecordedDetail(isSilent = false) {
        if (!recordedId) return;
        if (!isSilent) isLoading = true;
        try {
            const [, res] = await Promise.all([
                channelStore.fetch(),
                axios.get(`/api/recorded/${recordedId}?isNeedVideoFiles=true&isNeedThumbnails=true&isNeedsDropLog=true&isNeedTags=true`),
            ]);
            recorded = res.data;

            axios.get('/api/config').then(configRes => {
                const encList = configRes.data?.encode || [];
                encodeModes = encList.map((e: any) => typeof e === 'string' ? { name: e, suffix: '' } : e);
                if (!selectedEncodeMode && encodeModes.length > 0) {
                    selectedEncodeMode = encodeModes[0].name;
                }
            }).catch(() => {});
        } catch (e) {
            console.error('Failed to fetch recorded detail', e);
            snackbar.open({ text: '録画詳細の取得に失敗しました', color: 'error' });
        } finally {
            if (!isSilent) isLoading = false;
        }
    }

    onMount(() => {
        fetchRecordedDetail();

        unsubscribeSocket = socketStore.on('updateStatus', () => {
            fetchRecordedDetail(true);
        });
    });

    onDestroy(() => {
        unsubscribeSocket?.();
    });

    // 番組保護トグル
    async function toggleProtect() {
        if (!recorded) return;
        try {
            if (recorded.isProtected) {
                await axios.put(`/api/recorded/${recorded.id}/unprotect`);
                recorded.isProtected = false;
                snackbar.open({ text: '保護を解除しました', color: 'success' });
            } else {
                await axios.put(`/api/recorded/${recorded.id}/protect`);
                recorded.isProtected = true;
                snackbar.open({ text: '番組を保護しました', color: 'success' });
            }
        } catch (e) {
            console.error('Failed to toggle protect', e);
            snackbar.open({ text: '保護状態の変更に失敗しました', color: 'error' });
        }
    }

    // 録画削除
    async function deleteRecorded() {
        if (!recorded) return;
        if (!confirm(`「${recorded.name}」を削除しますか？関連する録画ファイルもすべて削除されます。`)) {
            return;
        }
        try {
            await axios.delete(`/api/recorded/${recorded.id}`);
            snackbar.open({ text: '録画を削除しました', color: 'success' });
            router.push('/recorded');
        } catch (e) {
            console.error('Failed to delete recorded', e);
            snackbar.open({ text: '削除に失敗しました', color: 'error' });
        }
    }

    // 個別動画ファイル削除
    async function deleteVideoFile(fileId: number, fileName: string) {
        if (!confirm(`ファイル「${fileName}」を削除しますか？`)) return;
        try {
            await axios.delete(`/api/videos/${fileId}`);
            snackbar.open({ text: '動画ファイルを削除しました', color: 'success' });
            await fetchRecordedDetail();
        } catch (e) {
            console.error('Failed to delete video file', e);
            snackbar.open({ text: 'ファイルの削除に失敗しました', color: 'error' });
        }
    }

    // ドロップログ表示
    async function openDropLog() {
        if (!recorded) return;
        isDropLogModalOpen = true;
        isLoadingDropLog = true;
        try {
            const res = await axios.get(`/api/dropLogs/${recorded.id}`);
            dropLogData = res.data;
        } catch (e) {
            console.error('Failed to fetch drop log', e);
            dropLogData = null;
        } finally {
            isLoadingDropLog = false;
        }
    }

    // エンコード追加
    async function addEncode() {
        if (!recorded) return;
        const targetFile = (recorded.videoFiles || []).find((f: any) => f.type === 'ts') || recorded.videoFiles?.[0];
        if (!targetFile) {
            snackbar.open({ text: 'エンコード元の動画ファイルがありません', color: 'error' });
            return;
        }

        if (!selectedEncodeMode) {
            snackbar.open({ text: 'エンコードプリセットを選択してください', color: 'error' });
            return;
        }

        try {
            await axios.post('/api/encode', {
                recordedId: recorded.id,
                sourceVideoFileId: targetFile.id,
                mode: selectedEncodeMode,
                isSaveSameDirectory: true,
                removeOriginal: isRemoveOriginal,
            });
            snackbar.open({ text: 'エンコードキューに追加しました', color: 'success' });
            isEncodeModalOpen = false;
        } catch (e) {
            console.error('Failed to add encode', e);
            snackbar.open({ text: 'エンコード追加に失敗しました', color: 'error' });
        }
    }
</script>

<div class="w-full max-w-5xl min-w-0 space-y-5">
    <!-- ヘッダー & ナビゲーション -->
    <div class="flex items-center justify-between">
        <button
            type="button"
            onclick={() => router.push('/recorded')}
            class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        >
            <ArrowLeft size={16} /> 録画一覧へ戻る
        </button>

        {#if recorded}
            <div class="flex items-center gap-2">
                <!-- 保護トグルボタン -->
                <button
                    type="button"
                    onclick={toggleProtect}
                    class="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition {recorded.isProtected
                        ? 'border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'}"
                    title={recorded.isProtected ? '保護を解除' : '誤削除から保護'}
                >
                    {#if recorded.isProtected}
                        <Lock size={14} class="text-amber-500" /> 保護中
                    {:else}
                        <Unlock size={14} /> 保護する
                    {/if}
                </button>

                <!-- 削除ボタン -->
                <button
                    type="button"
                    onclick={deleteRecorded}
                    class="flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-600 shadow-xs transition hover:bg-rose-50 dark:border-rose-900/50 dark:bg-slate-900 dark:text-rose-400"
                    title="録画を削除"
                >
                    <Trash2 size={14} /> 削除
                </button>
            </div>
        {/if}
    </div>

    {#if isLoading}
        <div class="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <p class="text-xs text-slate-400">録画詳細を読み込み中...</p>
        </div>
    {:else if !recorded}
        <div class="flex h-64 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
            <AlertTriangle size={36} class="text-amber-500 mb-2" />
            <p class="text-sm font-bold text-slate-800 dark:text-slate-200">録画情報が見つかりませんでした</p>
            <button
                type="button"
                onclick={() => router.push('/recorded')}
                class="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
            >
                録画一覧へ戻る
            </button>
        </div>
    {:else}
        <!-- メイン詳細カード -->
        <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div class="grid grid-cols-1 md:grid-cols-3">
                <!-- 左側: サムネイル & クイック再生 -->
                <div class="relative aspect-video w-full bg-slate-900 md:aspect-auto">
                    {#if recorded.thumbnails?.[0]}
                        <img
                            src={`/api/thumbnails/${recorded.thumbnails[0]}`}
                            alt={recorded.name}
                            class="h-full w-full object-cover"
                        />
                    {:else}
                        <div class="flex h-full w-full items-center justify-center text-slate-600">
                            <Tv size={48} />
                        </div>
                    {/if}

                    <div class="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-2xs transition hover:bg-black/20">
                        <button
                            type="button"
                            onclick={() => isStreamModalOpen = true}
                            class="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-2xl transition hover:scale-110 hover:bg-blue-500"
                            aria-label="動画を再生"
                        >
                            <Play size={24} fill="currentColor" class="translate-x-0.5" />
                        </button>
                    </div>
                </div>

                <!-- 右側: 番組メタデータ -->
                <div class="p-6 md:col-span-2 space-y-4">
                    <div>
                        <div class="flex items-center gap-2 flex-wrap mb-2">
                            <span class="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                {channelStore.getChannelName(recorded.channelId)}
                            </span>
                            {#if typeof recorded.genre1 === 'number'}
                                <span class="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    ジャンル: {recorded.genre1}
                                </span>
                            {/if}
                            {#if recorded.isProtected}
                                <span class="flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                    <Lock size={12} /> 保護中
                                </span>
                            {/if}
                        </div>

                        <h1 class="text-lg font-black text-slate-900 dark:text-slate-100 sm:text-xl leading-snug">
                            {recorded.name}
                        </h1>

                        <div class="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            <Clock size={14} />
                            <span>{formatTimeRange(recorded.startAt, recorded.endAt)}</span>
                            <span>({formatDuration(recorded.endAt - recorded.startAt)})</span>
                        </div>
                    </div>

                    <!-- 再生 & アクションボタン列 -->
                    <div class="flex items-center gap-2.5 flex-wrap pt-2">
                        <button
                            type="button"
                            onclick={() => isStreamModalOpen = true}
                            class="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700"
                        >
                            <Play size={14} fill="currentColor" /> 再生する
                        </button>

                        <button
                            type="button"
                            onclick={() => isEncodeModalOpen = true}
                            class="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                            <Sparkles size={14} class="text-amber-500" /> エンコード追加
                        </button>

                        {#if recorded.dropLogFile}
                            <button
                                type="button"
                                onclick={openDropLog}
                                class="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                                <FileText size={14} /> ドロップログ
                            </button>
                        {/if}
                    </div>
                </div>
            </div>

            <!-- 番組概要 & 詳細テキスト -->
            <div class="border-t border-slate-100 p-6 dark:border-slate-800 space-y-4">
                {#if recorded.description}
                    <div>
                        <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">番組概要</h2>
                        <p class="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                            {recorded.description}
                        </p>
                    </div>
                {/if}

                {#if recorded.extended}
                    <div>
                        <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">詳細情報・出演者</h2>
                        <div class="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">
                            {recorded.extended}
                        </div>
                    </div>
                {/if}
            </div>
        </div>

        <!-- 録画ファイル一覧カード -->
        <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h2 class="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">
                <HardDrive size={16} class="text-blue-500" />
                生成ファイル一覧 ({(recorded.videoFiles || []).length}件)
            </h2>

            <div class="space-y-3">
                {#each recorded.videoFiles || [] as file}
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4 transition hover:border-slate-200 dark:border-slate-800 dark:bg-slate-800/40">
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2">
                                <span class="rounded px-2 py-0.5 text-[11px] font-black uppercase {file.type === 'encoded' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}">
                                    {file.name}
                                </span>
                                <span class="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{file.filename}</span>
                            </div>
                            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                容量: <strong class="text-slate-700 dark:text-slate-300">{formatSize(file.size)}</strong>
                            </p>
                        </div>

                        <!-- ファイルアクション -->
                        <div class="flex items-center gap-2 shrink-0">
                            <!-- 直接再生 / トランスコード再生 -->
                            <button
                                type="button"
                                onclick={() => {
                                    if (file.type === 'encoded' && recorded) {
                                        router.push(`/recorded/watch?recordedId=${recorded.id}&videoId=${file.id}`);
                                    } else {
                                    }
                                }}
                                class="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700"
                            >
                                <Play size={13} fill="currentColor" /> 再生
                            </button>

                            <!-- ダウンロード -->
                            <a
                                href={`/api/videos/${file.id}`}
                                download
                                class="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                title="ファイルをダウンロード"
                            >
                                <Download size={13} />
                            </a>

                            <!-- M3U プレイリスト -->
                            <a
                                href={`/api/videos/${file.id}/playlist`}
                                download
                                class="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                title="VLC/Infuse 向け M3U プレイリスト"
                            >
                                <Share2 size={13} /> M3U
                            </a>

                            <!-- ファイル削除 -->
                            <button
                                type="button"
                                onclick={() => deleteVideoFile(file.id, file.filename)}
                                class="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50"
                                title="この動画ファイルのみ削除"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>

<!-- ストリーム選択モーダル -->
{#if recorded}
    <StreamSelectModal
        isOpen={isStreamModalOpen}
        title={recorded.name}
        channelName={channelStore.getChannelName(recorded.channelId)}
        recordedId={recorded.id}
        videoFiles={recorded.videoFiles || []}
        onClose={() => isStreamModalOpen = false}
    />
{/if}

<!-- エンコード追加モーダル -->
{#if isEncodeModalOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <button
            type="button"
            class="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onclick={() => isEncodeModalOpen = false}
            aria-label="閉じる"
        ></button>
        <div class="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">エンコード追加</h3>

            <div class="space-y-4 text-xs">
                <div>
                    <p class="block font-bold text-slate-700 dark:text-slate-300 mb-2">エンコードプリセット</p>
                    <div class="space-y-2">
                        {#each encodeModes as mode}
                            <label class="flex items-center gap-2.5 rounded-xl border p-3 cursor-pointer {selectedEncodeMode === mode.name ? 'border-blue-500 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/40' : 'border-slate-200 dark:border-slate-800'}">
                                <input
                                    type="radio"
                                    name="encodeMode"
                                    value={mode.name}
                                    bind:group={selectedEncodeMode}
                                    class="accent-blue-600"
                                />
                                <span class="font-bold text-slate-900 dark:text-slate-100">{mode.name}</span>
                                {#if mode.suffix}
                                    <span class="text-slate-400 font-mono">({mode.suffix})</span>
                                {/if}
                            </label>
                        {/each}
                    </div>
                </div>

                <div class="space-y-2 pt-2">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            bind:checked={isRemoveOriginal}
                            class="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                        />
                        <span class="font-bold text-slate-700 dark:text-slate-300">エンコード完了後に元ファイルを削除する</span>
                    </label>
                </div>
            </div>

            <div class="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                    type="button"
                    onclick={() => isEncodeModalOpen = false}
                    class="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                    キャンセル
                </button>
                <button
                    type="button"
                    onclick={addEncode}
                    class="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700"
                >
                    追加する
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- ドロップログモーダル -->
{#if isDropLogModalOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <button
            type="button"
            class="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onclick={() => isDropLogModalOpen = false}
            aria-label="閉じる"
        ></button>
        <div class="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">ドロップログ</h3>

            {#if isLoadingDropLog}
                <p class="py-8 text-center text-xs text-slate-400">読み込み中...</p>
            {:else if !dropLogData}
                <p class="py-8 text-center text-xs text-slate-400">ドロップログ情報がありません</p>
            {:else}
                <div class="space-y-4 text-xs">
                    <div class="grid grid-cols-3 gap-3 text-center">
                        <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                            <p class="text-slate-400 text-[11px]">ドロップ</p>
                            <p class="text-base font-black text-rose-600">{dropLogData.drop || 0}</p>
                        </div>
                        <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                            <p class="text-slate-400 text-[11px]">エラー</p>
                            <p class="text-base font-black text-amber-600">{dropLogData.error || 0}</p>
                        </div>
                        <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                            <p class="text-slate-400 text-[11px]">スクランブル</p>
                            <p class="text-base font-black text-slate-700 dark:text-slate-300">{dropLogData.scrambling || 0}</p>
                        </div>
                    </div>
                </div>
            {/if}

            <div class="mt-6 flex items-center justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                    type="button"
                    onclick={() => isDropLogModalOpen = false}
                    class="rounded-xl bg-slate-100 px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                >
                    閉じる
                </button>
            </div>
        </div>
    </div>
{/if}
