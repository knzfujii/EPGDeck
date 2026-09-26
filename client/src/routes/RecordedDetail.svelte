<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { confirmDialog } from '../lib/stores/confirm.svelte';
    import { socketStore } from '../lib/stores/socket.svelte';
    import {
        formatDate,
        formatTime,
        formatTimeRange,
        formatDuration,
        formatSize,
        getGenreName,
        getGenreBadgeClass,
    } from '../lib/utils/format';
    import { isMp4VideoFile, getSmartWatchUrl, getWatchUrl, getTotalVideoFileSize } from '../lib/utils/video';
    import { openWithExternalPlayer, isMobileOrTabletDevice } from '../lib/utils/urlScheme';
    import StreamSelectModal from '../lib/components/video/StreamSelectModal.svelte';
    import Badge from '../lib/components/common/Badge.svelte';
    import Button from '../lib/components/common/Button.svelte';
    import IconButton from '../lib/components/common/IconButton.svelte';
    import Divider from '../lib/components/common/Divider.svelte';
    import Checkbox from '../lib/components/common/Checkbox.svelte';
    import Select from '../lib/components/common/Select.svelte';
    import Input from '../lib/components/common/Input.svelte';
    import { readOnlyStore } from '../lib/stores/readOnly.svelte';
    import { configStore, type EncodeMode } from '../lib/stores/config.svelte';
    import { getLastRecordedPath } from '../lib/navigationHistory';
    import api from '@/lib/apiClient';
    import type * as apid from '../../../api';
    import {
        ArrowLeft,
        Play,
        Lock,
        Unlock,
        Trash2,
        Download,
        ExternalLink,
        Clock,
        Tv,
        FileVideo,
        Sparkles,
        AlertTriangle,
        CheckCircle2,
        Layers,
        Info,
        HardDrive,
        FileText,
        ChevronLeft,
        ChevronRight,
        ChevronDown,
        Loader2,
        Video,
        Camera,
        CopyX,
        CopyCheck,
    } from '@lucide/svelte';
    import RecreateThumbnailModal from '../lib/components/recording/RecreateThumbnailModal.svelte';

    let recorded = $state<apid.RecordedItem | null>(null);
    let isLoading = $state(true);
    let isStreamModalOpen = $state(false);
    let streamModalVideoFileId = $state<number | undefined>(undefined);
    let isThumbnailModalOpen = $state(false);
    let thumbnailRefreshKey = $state(Date.now());
    const isMobileDevice = isMobileOrTabletDevice();

    // エンコード追加モーダル
    interface EncodePresetSelection {
        enabled: boolean;
        isSaveSameDirectory: boolean;
        parentDir: string;
        directory: string;
    }
    let isEncodeModalOpen = $state(false);
    let encodeModes = $state<EncodeMode[]>([]);
    let recordedDirs = $state<string[]>([]);
    let encodeSelections = $state<Record<string, EncodePresetSelection>>({});
    let isRemoveOriginal = $state(false);

    // ドロップログモーダル
    let isDropLogModalOpen = $state(false);
    let dropLogContent = $state<string | null>(null);
    let isLoadingDropLog = $state(false);

    let unsubscribeSocket: (() => void) | null = null;

    const query = $derived(router.current.query);
    const recordedId = $derived(query.recordedId ? parseInt(query.recordedId, 10) : null);

    // 同一ルールの録画一覧
    let sameRuleRecords = $state<apid.RecordedItem[]>([]);
    let sameRuleTotal = $state(0);
    let ruleKeyword = $state<string>('');
    let isLoadingSameRule = $state(false);
    let currentFetchedRuleId: number | null = null;
    let carouselEl = $state<HTMLElement | null>(null);

    function scrollCarousel(direction: 'left' | 'right') {
        if (!carouselEl) return;
        const scrollAmount = Math.max(240, carouselEl.clientWidth * 0.75);
        carouselEl.scrollBy({
            left: direction === 'left' ? -scrollAmount : scrollAmount,
            behavior: 'smooth',
        });
    }

    async function fetchSameRuleRecords(ruleId: number, isSilent = false) {
        if (!isSilent) isLoadingSameRule = true;
        try {
            const [recordsRes, ruleRes] = await Promise.allSettled([
                api.recorded.$get({
                    query: {
                        ruleId,
                        limit: 24,
                        isHalfWidth: true,
                    },
                }),
                api.rules[':ruleId'].$get({
                    param: { ruleId: String(ruleId) },
                    query: { isHalfWidth: true },
                }),
            ]);

            if (recordsRes.status === 'fulfilled' && recordsRes.value.ok) {
                const data = await recordsRes.value.json();
                sameRuleRecords = data.records || [];
                sameRuleTotal = data.total || 0;
            }

            if (ruleRes.status === 'fulfilled' && ruleRes.value.ok) {
                const ruleData = await ruleRes.value.json();
                ruleKeyword = ruleData.searchOption?.keyword || '';
            }
            currentFetchedRuleId = ruleId;
        } catch (e) {
            console.error('Failed to fetch same rule records', e);
        } finally {
            if (!isSilent) isLoadingSameRule = false;
        }
    }

    async function fetchRecordedDetail(isSilent = false) {
        if (!recordedId) return;
        if (!isSilent) isLoading = true;
        try {
            const [, res] = await Promise.all([
                channelStore.fetch(),
                api.recorded[':recordedId'].$get({
                    param: { recordedId: String(recordedId) },
                    query: { isHalfWidth: 'true' },
                }),
            ]);

            if (!res.ok) {
                if (res.status === 404) {
                    snackbar.open({ text: '番組情報が存在しないため、録画一覧に戻ります', color: 'warning' });
                    router.push('/recorded');
                    return;
                }
                throw new Error(`Failed to fetch recorded detail: ${res.status}`);
            }

            recorded = (await res.json()) as apid.RecordedItem;

            if (recorded?.ruleId) {
                const isSameRule = recorded.ruleId === currentFetchedRuleId;
                fetchSameRuleRecords(recorded.ruleId, isSameRule);
            } else {
                sameRuleRecords = [];
                sameRuleTotal = 0;
                ruleKeyword = '';
                currentFetchedRuleId = null;
            }

            configStore
                .fetch()
                .then(configData => {
                    if (!configData) return;
                    const encList = configData?.encode || [];
                    encodeModes = encList.map((e: string | EncodeMode) =>
                        typeof e === 'string' ? { name: e, suffix: '' } : e,
                    );
                    recordedDirs = configData?.recorded || [];

                    // 各プリセットの選択状態を初期化（既存があれば保持）
                    const defaultDir = recordedDirs[0] ?? '';
                    const next: Record<string, EncodePresetSelection> = {};
                    for (const mode of encodeModes) {
                        next[mode.name] = encodeSelections[mode.name] ?? {
                            enabled: false,
                            isSaveSameDirectory: true,
                            parentDir: defaultDir,
                            directory: '',
                        };
                    }
                    encodeSelections = next;
                })
                .catch(() => {});
        } catch (e: unknown) {
            console.error('Failed to fetch recorded detail', e);
            snackbar.open({ text: '録画詳細の取得に失敗しました', color: 'error' });
        } finally {
            if (!isSilent) isLoading = false;
        }
    }

    $effect(() => {
        if (recordedId) {
            fetchRecordedDetail();
        }
    });

    onMount(() => {
        unsubscribeSocket = socketStore.on('updateStatus', () => {
            fetchRecordedDetail(true);
            thumbnailRefreshKey = Date.now();
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
                const res = await api.recorded[':recordedId'].unprotect.$put({
                    param: { recordedId: String(recorded.id) },
                });
                if (!res.ok) throw new Error(`Status ${res.status}`);
                recorded.isProtected = false;
                snackbar.open({ text: '保護を解除しました', color: 'success' });
            } else {
                const res = await api.recorded[':recordedId'].protect.$put({
                    param: { recordedId: String(recorded.id) },
                });
                if (!res.ok) throw new Error(`Status ${res.status}`);
                recorded.isProtected = true;
                snackbar.open({ text: '番組を保護しました', color: 'success' });
            }
        } catch (e) {
            console.error('Failed to toggle protect', e);
            snackbar.open({ text: '保護状態の変更に失敗しました', color: 'error' });
        }
    }

    // 重複判定からの除外（履歴削除）
    async function excludeFromDuplicate() {
        if (!recorded) return;
        const ok = await confirmDialog({
            title: '重複判定からの除外',
            message: `「${recorded.name}」を二重録画防止（重複判定）の対象から除外しますか？\n\n除外すると、同一番組の再放送や振替放送が重複スキップされずに録画されるようになります。`,
            confirmText: '除外する',
            cancelText: 'キャンセル',
            isDestructive: false,
        });
        if (!ok) return;

        try {
            const res = await api.recorded[':recordedId'].history.$delete({
                param: { recordedId: String(recorded.id) },
            });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            recorded.hasDuplicateHistory = false;
            snackbar.open({ text: '重複判定から除外しました（予約を再評価中）', color: 'success' });
        } catch (e) {
            console.error('Failed to exclude from duplicate history', e);
            snackbar.open({ text: '重複判定からの除外に失敗しました', color: 'error' });
        }
    }

    // 重複判定への追加（履歴登録）
    async function includeInDuplicate() {
        if (!recorded) return;
        try {
            const res = await api.recorded[':recordedId'].history.$post({
                param: { recordedId: String(recorded.id) },
            });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            recorded.hasDuplicateHistory = true;
            snackbar.open({ text: '重複判定の対象に追加しました（予約を再評価中）', color: 'success' });
        } catch (e) {
            console.error('Failed to add to duplicate history', e);
            snackbar.open({ text: '重複判定への追加に失敗しました', color: 'error' });
        }
    }

    // 録画一覧（直前の絞り込み・ページング状態）へ戻る
    function goBackToRecordedList() {
        router.push(getLastRecordedPath());
    }

    // 録画削除
    async function deleteRecorded() {
        if (!recorded) return;
        const ok = await confirmDialog({
            title: '録画番組の削除',
            message: `「${recorded.name}」を削除しますか？\n関連する録画ファイルもすべて削除されます。`,
            confirmText: '削除',
            cancelText: 'キャンセル',
            isDestructive: true,
        });
        if (!ok) return;

        try {
            const res = await api.recorded[':recordedId'].$delete({
                param: { recordedId: String(recorded.id) },
                query: {},
            });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            snackbar.open({ text: '録画を削除しました', color: 'success' });
            goBackToRecordedList();
        } catch (e) {
            console.error('Failed to delete recorded', e);
            snackbar.open({ text: '削除に失敗しました', color: 'error' });
        }
    }

    // 個別動画ファイル削除
    async function deleteVideoFile(fileId: number, fileName: string) {
        const isLastVideoFile = (recorded?.videoFiles?.length ?? 0) <= 1;
        const ok = await confirmDialog({
            title: '動画ファイルの削除',
            message: isLastVideoFile
                ? `ファイル「${fileName}」を削除しますか？\n※この番組の最後の動画ファイルのため、番組情報も削除されます。`
                : `ファイル「${fileName}」を削除しますか？`,
            confirmText: '削除',
            cancelText: 'キャンセル',
            isDestructive: true,
        });
        if (!ok) return;

        try {
            const res = await api.videos[':videoFileId'].$delete({
                param: { videoFileId: String(fileId) },
            });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            if (isLastVideoFile) {
                snackbar.open({ text: '動画ファイルおよび番組を削除しました', color: 'success' });
                goBackToRecordedList();
                return;
            }
            snackbar.open({ text: '動画ファイルを削除しました', color: 'success' });
            await fetchRecordedDetail();
        } catch (e) {
            console.error('Failed to delete video file', e);
            snackbar.open({ text: 'ファイルの削除に失敗しました', color: 'error' });
        }
    }

    // 外部プレイヤー起動 (VLC / インテント等)
    function playWithExternalApp(fileId: number, filename?: string) {
        void openWithExternalPlayer({
            category: 'video',
            path: `/api/videos/${fileId}`,
            filename,
            token: readOnlyStore.token,
            config: readOnlyStore.serverConfig?.urlscheme,
            onClipboardCopied: () => {
                snackbar.open({
                    text: 'ストリームURLをクリップボードにコピーしました（VLC等で開けます）',
                    color: 'success',
                });
            },
        });
    }

    // Kodi 再生送信
    let sendingKodiFileId = $state<number | null>(null);
    let activeKodiMenuFileId = $state<number | null>(null);

    async function sendToKodi(videoFileId: number, kodiName: string) {
        activeKodiMenuFileId = null;
        if (sendingKodiFileId !== null) return;
        sendingKodiFileId = videoFileId;

        try {
            const res = await api.videos[':videoFileId'].kodi.$post({
                param: { videoFileId: String(videoFileId) },
                json: { kodiName },
            });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            snackbar.open({ text: `「${kodiName}」へ再生リクエストを送信しました`, color: 'success' });
        } catch (e: unknown) {
            console.error('Failed to send to Kodi', e);
            const msg = e instanceof Error ? e.message : '';
            snackbar.open({ text: `Kodi への送信に失敗しました: ${msg}`, color: 'error' });
        } finally {
            sendingKodiFileId = null;
        }
    }

    // ドロップログ表示
    async function openDropLog() {
        if (!recorded?.dropLogFile) return;
        isDropLogModalOpen = true;
        dropLogContent = null;

        const isZero =
            recorded.dropLogFile.dropCnt === 0 &&
            recorded.dropLogFile.errorCnt === 0 &&
            recorded.dropLogFile.scramblingCnt === 0;

        if (isZero) {
            // ドロップ0件の場合はログ実ファイルが生成/保持されないためAPIを取得しない
            return;
        }

        isLoadingDropLog = true;
        try {
            const res = await api.dropLogs[':dropLogFileId'].$get({
                param: { dropLogFileId: String(recorded.dropLogFile.id) },
                query: {},
            });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            dropLogContent = await res.text();
        } catch (e) {
            console.error('Failed to fetch drop log', e);
            dropLogContent = null;
        } finally {
            isLoadingDropLog = false;
        }
    }

    // エンコード追加
    async function addEncode() {
        if (!recorded) return;
        const targetFile =
            (recorded.videoFiles || []).find((f: apid.VideoFile) => f.type === 'ts') || recorded.videoFiles?.[0];
        if (!targetFile) {
            snackbar.open({ text: 'エンコード元の動画ファイルがありません', color: 'error' });
            return;
        }

        const targets = encodeModes.filter(mode => encodeSelections[mode.name]?.enabled);
        if (targets.length === 0) {
            snackbar.open({ text: 'エンコードするプリセットを1つ以上選択してください', color: 'error' });
            return;
        }

        // 保存先未設定チェック
        for (const mode of targets) {
            const sel = encodeSelections[mode.name];
            if (!sel.isSaveSameDirectory && !sel.parentDir) {
                snackbar.open({ text: `「${mode.name}」の保存先を選択してください`, color: 'error' });
                return;
            }
        }

        try {
            for (const mode of targets) {
                const sel = encodeSelections[mode.name];
                const body: Parameters<typeof api.encode.$post>[0]['json'] = {
                    recordedId: recorded.id,
                    sourceVideoFileId: targetFile.id,
                    mode: mode.name,
                    removeOriginal: isRemoveOriginal,
                };
                if (sel.isSaveSameDirectory) {
                    body.isSaveSameDirectory = true;
                } else {
                    body.parentDir = sel.parentDir;
                    if (sel.directory.trim()) {
                        body.directory = sel.directory.trim();
                    }
                }
                const res = await api.encode.$post({
                    json: body,
                });
                if (!res.ok) throw new Error(`Status ${res.status}`);
            }
            snackbar.open({ text: `${targets.length}件をエンコードキューに追加しました`, color: 'success' });
            isEncodeModalOpen = false;
        } catch (e) {
            console.error('Failed to add encode', e);
            snackbar.open({ text: 'エンコード追加に失敗しました', color: 'error' });
        }
    }

    // サムネイル再生: 最上位MP4があれば直接再生、なければ再生方法選択モーダル
    function handleThumbnailPlay() {
        if (!recorded) return;
        const watchUrl = getSmartWatchUrl(recorded.id, recorded.videoFiles);
        if (watchUrl) {
            router.push(watchUrl);
        } else {
            streamModalVideoFileId = undefined;
            isStreamModalOpen = true;
        }
    }

    // 詳細再生ボタン: 常に再生方法選択モーダルを開く
    function handleDetailPlay() {
        streamModalVideoFileId = undefined;
        isStreamModalOpen = true;
    }

    // 生成ファイル一覧の再生ボタン: MP4は直接再生、非MP4は対象ファイルを初期選択してモーダル表示
    function handleFilePlay(file: apid.VideoFile) {
        if (!recorded) return;
        if (isMp4VideoFile(file)) {
            router.push(getWatchUrl({ recordedId: recorded.id, videoId: file.id }));
        } else {
            streamModalVideoFileId = file.id;
            isStreamModalOpen = true;
        }
    }
</script>

<div class="w-full max-w-5xl min-w-0 space-y-5">
    <!-- ヘッダー & ナビゲーション -->
    <div class="flex items-center justify-between gap-2">
        <Button
            variant="secondary"
            size="compact"
            onclick={goBackToRecordedList}
            class="whitespace-nowrap shrink-0 px-3 sm:px-4"
        >
            <ArrowLeft size={16} />
            <span class="hidden sm:inline">録画一覧へ戻る</span>
            <span class="sm:hidden">戻る</span>
        </Button>

        {#if recorded}
            <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {#if !readOnlyStore.isReadOnly}
                    <!-- 重複判定除外 / 追加ボタン -->
                    {#if recorded.hasDuplicateHistory === false}
                        <Button
                            variant="secondary"
                            size="compact"
                            onclick={includeInDuplicate}
                            class="whitespace-nowrap shrink-0 px-2.5 sm:px-3.5"
                            title="重複判定履歴に登録し、二重録画防止の対象に戻します"
                        >
                            <CopyCheck size={15} class="text-slate-400 dark:text-slate-400" />
                            <span class="hidden sm:inline">重複判定に追加</span>
                            <span class="sm:hidden">+重複</span>
                        </Button>
                    {:else}
                        <Button
                            variant="secondary"
                            size="compact"
                            onclick={excludeFromDuplicate}
                            class="whitespace-nowrap shrink-0 px-2.5 sm:px-3.5"
                            title="二重録画防止（重複判定）の履歴から削除し、次回放送を録画できるようにします"
                        >
                            <CopyX size={15} class="text-slate-400 dark:text-slate-400" />
                            <span class="hidden sm:inline">重複判定から除外</span>
                            <span class="sm:hidden">重複除外</span>
                        </Button>
                    {/if}

                    <!-- 保護トグルボタン -->
                    <Button
                        variant="secondary"
                        size="compact"
                        onclick={toggleProtect}
                        class="whitespace-nowrap shrink-0 px-2.5 sm:px-3.5 {recorded.isProtected
                            ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : ''}"
                        title={recorded.isProtected ? '保護を解除' : '誤削除から保護'}
                    >
                        {#if recorded.isProtected}
                            <Lock size={15} class="text-amber-600 dark:text-amber-400" />
                            <span>保護中</span>
                        {:else}
                            <Unlock size={15} />
                            <span class="hidden sm:inline">保護する</span>
                            <span class="sm:hidden">保護</span>
                        {/if}
                    </Button>

                    <!-- 削除ボタン（パーティションで明確に分離し、押し間違いを防止する控えめなアウトライン） -->
                    {#if !recorded.isProtected}
                        <Divider orientation="vertical" />
                        <Button
                            variant="danger-outline"
                            size="compact"
                            onclick={deleteRecorded}
                            class="whitespace-nowrap shrink-0 px-3 sm:px-4"
                            title="録画を削除"
                            aria-label="録画を削除"
                        >
                            <Trash2 size={15} /> 削除
                        </Button>
                    {/if}
                {/if}
            </div>
        {/if}
    </div>

    {#if isLoading}
        <div
            class="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
            <p class="text-sm text-slate-400">録画詳細を読み込み中...</p>
        </div>
    {:else if !recorded}
        <div
            class="flex h-64 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900"
        >
            <AlertTriangle size={40} class="text-amber-500 mb-2" />
            <p class="text-base font-bold text-slate-800 dark:text-slate-200">録画情報が見つかりませんでした</p>
            <Button variant="primary" onclick={goBackToRecordedList} class="mt-4">録画一覧へ戻る</Button>
        </div>
    {:else}
        <!-- メイン詳細カード -->
        <div
            class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900"
        >
            <div class="grid grid-cols-1 md:grid-cols-3">
                <!-- 左側: サムネイル & クイック再生 -->
                <div class="relative aspect-video w-full bg-slate-900 md:aspect-auto">
                    {#if recorded.thumbnails?.[0]}
                        <img
                            src={`/api/thumbnails/${recorded.thumbnails[0]}?t=${thumbnailRefreshKey}`}
                            alt={recorded.name}
                            class="h-full w-full object-cover"
                        />
                    {:else}
                        <div class="flex h-full w-full items-center justify-center text-slate-600">
                            <Tv size={48} />
                        </div>
                    {/if}

                    {#if !readOnlyStore.isReadOnly && (recorded.videoFiles?.length ?? 0) > 0}
                        <div class="absolute top-3 right-3 z-10">
                            <button
                                type="button"
                                onclick={() => (isThumbnailModalOpen = true)}
                                class="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-xs transition hover:scale-110 hover:bg-black/80 cursor-pointer shadow-md"
                                aria-label="サムネイルを再作成"
                                title="サムネイルを再作成"
                            >
                                <Camera size={18} />
                            </button>
                        </div>
                    {/if}

                    <div
                        class="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-2xs transition hover:bg-black/20"
                    >
                        <button
                            type="button"
                            onclick={handleThumbnailPlay}
                            class="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-white shadow-2xl transition hover:scale-110 hover:bg-blue-500 cursor-pointer"
                            aria-label="動画を再生"
                            title="最上位の動画を再生"
                        >
                            <Play size={28} fill="currentColor" class="translate-x-0.5" />
                        </button>
                    </div>
                </div>

                <!-- 右側: 番組メタデータ -->
                <div class="p-6 md:col-span-2 space-y-4">
                    <div>
                        <div class="flex items-center gap-2 flex-wrap mb-2">
                            <Badge variant="channel" text={channelStore.getChannelName(recorded.channelId)} size="md" />
                            {#if typeof recorded.genre1 === 'number'}
                                <span
                                    class="rounded-lg border px-2.5 py-1 text-xs font-bold {getGenreBadgeClass(
                                        recorded.genre1,
                                    )}"
                                >
                                    {getGenreName(recorded.genre1)}
                                </span>
                            {/if}
                            {#if recorded.isProtected}
                                <Badge variant="protected" size="md" />
                            {/if}
                            {#if recorded.hasDuplicateHistory !== false}
                                <span
                                    class="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-400"
                                    title="二重録画防止（重複判定）の対象として履歴に記録されています"
                                >
                                    <CopyCheck size={12} class="text-slate-400" /> 重複判定対象
                                </span>
                            {/if}
                        </div>

                        <h1 class="program-title-hero">
                            {recorded.name}
                        </h1>

                        <div
                            class="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400"
                        >
                            <Clock size={16} />
                            <span>{formatTimeRange(recorded.startAt, recorded.endAt)}</span>
                            <span>
                                ({formatDuration(
                                    recorded.duration && recorded.duration > 0
                                        ? recorded.duration
                                        : recorded.endAt - recorded.startAt,
                                )})
                            </span>
                        </div>
                    </div>

                    <!-- 再生 & アクションボタン列 -->
                    <div class="flex items-center gap-2 sm:gap-3 flex-wrap pt-2">
                        {#if readOnlyStore.canPlayRecorded(recorded.videoFiles)}
                            <Button
                                variant="primary"
                                onclick={handleDetailPlay}
                                class="whitespace-nowrap shrink-0"
                                title="再生方法や画質を選択して再生"
                            >
                                <Play size={16} fill="currentColor" /> 詳細再生
                            </Button>
                        {/if}

                        {#if !readOnlyStore.isReadOnly}
                            <Button
                                variant="secondary"
                                onclick={() => (isEncodeModalOpen = true)}
                                class="whitespace-nowrap shrink-0"
                            >
                                <Sparkles size={16} class="text-amber-500" /> エンコード追加
                            </Button>
                        {/if}

                        {#if recorded.dropLogFile}
                            <Button variant="secondary" onclick={openDropLog} class="whitespace-nowrap shrink-0">
                                <FileText size={16} /> ドロップログ
                            </Button>
                        {/if}
                    </div>
                </div>
            </div>

            <!-- 番組概要 & 詳細テキスト -->
            <div class="border-t border-slate-100 p-6 dark:border-slate-800 space-y-4">
                {#if recorded.description}
                    <div>
                        <h2 class="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">番組概要</h2>
                        <p class="program-description">
                            {recorded.description}
                        </p>
                    </div>
                {/if}

                {#if recorded.extended}
                    <div>
                        <h2 class="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">詳細情報・出演者</h2>
                        <div class="program-extended">
                            {recorded.extended}
                        </div>
                    </div>
                {/if}
            </div>
        </div>

        <!-- 同じルールの録画カルーセル -->
        {#if recorded.ruleId && (sameRuleRecords.length > 0 || isLoadingSameRule)}
            <div
                class="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900"
            >
                <!-- ヘッダー -->
                <div class="flex items-center justify-between gap-3 mb-4">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2">
                            <Layers size={18} class="text-blue-500 shrink-0" />
                            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                                同じルールの録画
                                {#if ruleKeyword}
                                    <span class="ml-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        ({ruleKeyword})
                                    </span>
                                {/if}
                            </h2>
                        </div>
                        <p class="text-xs text-slate-400 mt-0.5">
                            全 {sameRuleTotal} 件中 {sameRuleRecords.length} 件を表示
                        </p>
                    </div>

                    <!-- 全検索のリンク -->
                    <button
                        type="button"
                        onclick={() => router.push(`/recorded?ruleId=${recorded?.ruleId}`)}
                        class="flex items-center gap-1 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-400 dark:hover:bg-blue-900 transition-colors cursor-pointer shrink-0"
                    >
                        <span>すべて見る</span>
                        <ChevronRight size={14} />
                    </button>
                </div>

                <!-- カルーセル本体 -->
                {#if isLoadingSameRule}
                    <div class="flex gap-3 overflow-x-hidden py-2">
                        {#each [1, 2, 3, 4] as _}
                            <div
                                class="w-48 sm:w-56 shrink-0 animate-pulse rounded-xl border border-slate-100 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/50"
                            >
                                <div class="aspect-video w-full rounded-lg bg-slate-200 dark:bg-slate-700"></div>
                                <div class="mt-2.5 h-3.5 w-3/4 rounded bg-slate-200 dark:bg-slate-700"></div>
                                <div class="mt-1.5 h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700"></div>
                            </div>
                        {/each}
                    </div>
                {:else}
                    <div class="relative group/carousel">
                        <!-- スクロールコンテナ -->
                        <div
                            bind:this={carouselEl}
                            class="flex gap-3.5 overflow-x-auto pb-2 pt-1 no-scrollbar scroll-smooth"
                        >
                            {#each sameRuleRecords as item}
                                {@const isCurrent = item.id === recorded.id}
                                <div
                                    class="w-48 sm:w-56 shrink-0 flex flex-col justify-between rounded-xl border bg-white shadow-2xs transition-all duration-200 dark:bg-slate-900 overflow-hidden cursor-pointer hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 {isCurrent
                                        ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50/20 dark:bg-blue-950/20'
                                        : 'border-slate-200 dark:border-slate-800'}"
                                    onclick={() => router.push(`/recorded/detail?recordedId=${item.id}`)}
                                    role="button"
                                    tabindex="0"
                                    onkeydown={e => {
                                        if (e.key === 'Enter') router.push(`/recorded/detail?recordedId=${item.id}`);
                                    }}
                                >
                                    <!-- サムネイル部 -->
                                    <div class="relative aspect-video w-full bg-slate-900 overflow-hidden">
                                        {#if isCurrent}
                                            <span
                                                class="absolute top-1.5 left-1.5 z-10 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-xs leading-none"
                                            >
                                                表示中
                                            </span>
                                        {/if}
                                        <span
                                            class="absolute bottom-1.5 right-1.5 z-10 rounded bg-black/75 px-1 py-0.5 text-[9px] font-bold text-white leading-none"
                                        >
                                            {formatDuration(
                                                item.duration && item.duration > 0
                                                    ? item.duration
                                                    : item.endAt - item.startAt,
                                            )}
                                        </span>
                                        {#if item.thumbnails?.[0]}
                                            <img
                                                src={`/api/thumbnails/${item.thumbnails[0]}`}
                                                alt={item.name}
                                                loading="lazy"
                                                class="h-full w-full object-cover transition duration-300 group-hover/carousel:scale-105"
                                            />
                                        {:else}
                                            <div class="flex h-full w-full items-center justify-center text-slate-600">
                                                <Video size={24} />
                                            </div>
                                        {/if}
                                    </div>

                                    <!-- 本文 -->
                                    <div class="p-3 flex flex-1 flex-col justify-between">
                                        <div>
                                            <div
                                                class="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400"
                                            >
                                                <span>{formatDate(item.startAt)}</span>
                                                <span>{formatTime(item.startAt)}</span>
                                            </div>
                                            <h3
                                                class="mt-1.5 text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                                title={item.name}
                                            >
                                                {item.name}
                                            </h3>
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>

                        <!-- 左右スクロールボタン (PCで表示) -->
                        {#if sameRuleRecords.length > 3}
                            <button
                                type="button"
                                onclick={() => scrollCarousel('left')}
                                class="hidden sm:flex absolute -left-3 top-1/2 -translate-y-1/2 z-20 h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-md border border-slate-200 text-slate-700 hover:bg-white hover:text-blue-600 dark:bg-slate-800/90 dark:border-slate-700 dark:text-slate-200 cursor-pointer transition opacity-0 group-hover/carousel:opacity-100"
                                title="前へ"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <button
                                type="button"
                                onclick={() => scrollCarousel('right')}
                                class="hidden sm:flex absolute -right-3 top-1/2 -translate-y-1/2 z-20 h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-md border border-slate-200 text-slate-700 hover:bg-white hover:text-blue-600 dark:bg-slate-800/90 dark:border-slate-700 dark:text-slate-200 cursor-pointer transition opacity-0 group-hover/carousel:opacity-100"
                                title="次へ"
                            >
                                <ChevronRight size={16} />
                            </button>
                        {/if}
                    </div>
                {/if}
            </div>
        {/if}

        <!-- 録画ファイル一覧カード -->
        <div
            class="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900"
        >
            <div class="mb-4 flex items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                    <h2 class="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
                        <HardDrive size={18} class="text-blue-500 shrink-0" />
                        生成ファイル一覧
                    </h2>
                    <span
                        class="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400"
                    >
                        {(recorded.videoFiles || []).length} 件
                    </span>
                </div>
            </div>

            {#if (recorded.videoFiles || []).length === 0}
                <p class="py-8 text-center text-sm text-slate-400">生成された動画ファイルはありません</p>
            {:else}
                <div class="space-y-3">
                    {#each recorded.videoFiles || [] as file}
                        <div
                            class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 sm:p-4 transition hover:border-slate-200 dark:border-slate-800 dark:bg-slate-800/40"
                        >
                            <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-2 flex-wrap mb-1">
                                    <span
                                        class="inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide shrink-0 whitespace-nowrap {file.type ===
                                        'encoded'
                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800'
                                            : 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}"
                                    >
                                        {file.name}
                                    </span>
                                    <span class="text-xs text-slate-500 dark:text-slate-400">
                                        容量: <strong class="text-slate-700 dark:text-slate-300 font-bold">
                                            {formatSize(file.size)}
                                        </strong>
                                    </span>
                                    {#if file.type === 'ts'}
                                        <span
                                            class="rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700/60 dark:text-slate-300"
                                        >
                                            MPEG-2 TS
                                        </span>
                                    {:else if file.type === 'encoded'}
                                        <span
                                            class="rounded bg-emerald-100/70 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                        >
                                            エンコード済み
                                        </span>
                                    {/if}
                                </div>
                                <div
                                    class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate"
                                    title={file.filename}
                                >
                                    {file.filename}
                                </div>
                            </div>

                            <!-- ファイルアクション -->
                            <div class="flex flex-wrap items-center gap-2 shrink-0">
                                <!-- 直接再生 / トランスコード再生 -->
                                {#if isMp4VideoFile(file) || readOnlyStore.canRecordedStream}
                                    <Button
                                        variant="primary"
                                        size="compact"
                                        onclick={() => handleFilePlay(file)}
                                        class="whitespace-nowrap shrink-0"
                                        title="再生"
                                    >
                                        <Play size={14} fill="currentColor" />
                                        <span>再生</span>
                                    </Button>
                                {/if}

                                <!-- Kodi で再生 -->
                                {#if (readOnlyStore.serverConfig?.kodiHosts?.length ?? 0) > 0 && readOnlyStore.canPlayRecorded( [file] )}
                                    {@const kodiHosts = readOnlyStore.serverConfig?.kodiHosts || []}
                                    {#if kodiHosts.length === 1}
                                        <Button
                                            variant="secondary"
                                            size="compact"
                                            disabled={sendingKodiFileId === file.id}
                                            onclick={() => sendToKodi(file.id, kodiHosts[0])}
                                            class="whitespace-nowrap shrink-0"
                                            title={`Kodi (${kodiHosts[0]}) で再生`}
                                        >
                                            {#if sendingKodiFileId === file.id}
                                                <Loader2 size={14} class="animate-spin text-blue-500" />
                                            {:else}
                                                <Tv size={14} class="text-blue-500" />
                                            {/if}
                                            <span>Kodi</span>
                                        </Button>
                                    {:else}
                                        <div class="relative">
                                            {#if activeKodiMenuFileId === file.id}
                                                <div
                                                    class="fixed inset-0 z-20 cursor-default"
                                                    onclick={() => (activeKodiMenuFileId = null)}
                                                    role="presentation"
                                                ></div>
                                            {/if}
                                            <Button
                                                variant="secondary"
                                                size="compact"
                                                disabled={sendingKodiFileId === file.id}
                                                onclick={() => {
                                                    activeKodiMenuFileId =
                                                        activeKodiMenuFileId === file.id ? null : file.id;
                                                }}
                                                class="whitespace-nowrap shrink-0"
                                                title="Kodi を選んで再生"
                                            >
                                                {#if sendingKodiFileId === file.id}
                                                    <Loader2 size={14} class="animate-spin text-blue-500" />
                                                {:else}
                                                    <Tv size={14} class="text-blue-500" />
                                                {/if}
                                                <span>Kodi</span>
                                                <ChevronDown size={13} />
                                            </Button>
                                            {#if activeKodiMenuFileId === file.id}
                                                <div
                                                    class="absolute right-0 top-full mt-1.5 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg z-30 dark:border-slate-700 dark:bg-slate-800"
                                                >
                                                    <div
                                                        class="px-2.5 py-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider"
                                                    >
                                                        送信先の Kodi を選択
                                                    </div>
                                                    {#each kodiHosts as hostName}
                                                        <button
                                                            type="button"
                                                            onclick={() => sendToKodi(file.id, hostName)}
                                                            class="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-700/60 dark:hover:text-blue-400 text-left cursor-pointer"
                                                        >
                                                            <Tv size={13} class="text-slate-400" />
                                                            <span class="truncate">{hostName}</span>
                                                        </button>
                                                    {/each}
                                                </div>
                                            {/if}
                                        </div>
                                    {/if}
                                {/if}

                                <!-- 外部プレーヤー起動 (スマホ・タブレットのみ) -->
                                {#if isMobileDevice && readOnlyStore.canPlayRecorded([file])}
                                    <Button
                                        variant="secondary"
                                        size="compact"
                                        onclick={() => playWithExternalApp(file.id, file.filename)}
                                        class="whitespace-nowrap shrink-0"
                                        title="外部プレーヤーで再生 (VLC等)"
                                    >
                                        <ExternalLink size={14} />
                                        <span>外部再生</span>
                                    </Button>
                                {/if}

                                <!-- ダウンロード -->
                                {#if readOnlyStore.canDownload}
                                    <Button
                                        variant="secondary"
                                        size="compact"
                                        href={`/api/videos/${file.id}?isDownload=true${readOnlyStore.token ? `&token=${readOnlyStore.token}` : ''}`}
                                        download
                                        class="whitespace-nowrap shrink-0 max-sm:px-2.5"
                                        title="ファイルをダウンロード"
                                    >
                                        <Download size={14} />
                                        <span class="hidden sm:inline">ダウンロード</span>
                                    </Button>
                                {/if}

                                <!-- ファイル削除（安全ディバイダーで分離） -->
                                {#if !readOnlyStore.isReadOnly && !recorded.isProtected}
                                    <Divider orientation="vertical" />
                                    <IconButton
                                        variant="danger-outline"
                                        size="compact"
                                        onclick={() => deleteVideoFile(file.id, file.filename)}
                                        title="この動画ファイルのみ削除"
                                        aria-label="この動画ファイルのみ削除"
                                    >
                                        <Trash2 size={15} />
                                    </IconButton>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
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
        defaultVideoFileId={streamModalVideoFileId}
        onClose={() => {
            isStreamModalOpen = false;
            streamModalVideoFileId = undefined;
        }}
    />
{/if}

<!-- エンコード追加モーダル -->
{#if isEncodeModalOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <button
            type="button"
            class="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onclick={() => (isEncodeModalOpen = false)}
            aria-label="閉じる"
        ></button>
        <div
            class="relative w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        >
            <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">エンコード追加</h3>

            <div class="space-y-3 text-xs">
                <p class="font-bold text-slate-700 dark:text-slate-300">エンコードプリセット</p>

                {#if encodeModes.length === 0}
                    <p class="text-slate-400 py-4 text-center">設定にエンコードプリセットがありません</p>
                {:else}
                    <div class="space-y-2">
                        {#each encodeModes as mode}
                            {@const sel = encodeSelections[mode.name]}
                            {#if sel}
                                <!-- プリセット行 -->
                                <div
                                    class="rounded-xl border transition {sel.enabled
                                        ? 'border-blue-400 bg-blue-50/40 dark:border-blue-600 dark:bg-blue-950/30'
                                        : 'border-slate-200 dark:border-slate-700'}"
                                >
                                    <!-- 先頭行: チェックボックス + プリセット名 + 設定フィールド群 (横並び) -->
                                    <div class="flex flex-wrap items-center gap-x-5 gap-y-3 p-3.5">
                                        <!-- チェックボックス + 名前 -->
                                        <div class="flex shrink-0 items-center gap-2.5 min-w-[140px] py-1">
                                            <Checkbox bind:checked={sel.enabled}>
                                                <span
                                                    class="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100"
                                                >
                                                    {mode.name}
                                                </span>
                                                {#if mode.suffix}
                                                    <span class="text-xs text-slate-400 font-mono">
                                                        ({mode.suffix})
                                                    </span>
                                                {/if}
                                            </Checkbox>
                                        </div>

                                        {#if sel.enabled}
                                            <!-- 元ファイルと同じ場所トグル -->
                                            <div class="flex shrink-0 items-center gap-2 py-1">
                                                <Checkbox
                                                    bind:checked={sel.isSaveSameDirectory}
                                                    label="元ファイルと同じ場所"
                                                />
                                            </div>

                                            {#if !sel.isSaveSameDirectory}
                                                <!-- 保存先ドロップダウン -->
                                                <div class="flex items-center gap-2 min-w-[160px]">
                                                    <span
                                                        class="text-sm font-bold text-slate-600 dark:text-slate-400 shrink-0"
                                                    >
                                                        保存先
                                                    </span>
                                                    <Select bind:value={sel.parentDir} class="flex-1">
                                                        {#each recordedDirs as dir}
                                                            <option value={dir}>{dir}</option>
                                                        {/each}
                                                    </Select>
                                                </div>

                                                <!-- サブディレクトリ入力 -->
                                                <div class="flex items-center gap-2 min-w-[180px]">
                                                    <span
                                                        class="text-sm font-bold text-slate-600 dark:text-slate-400 shrink-0"
                                                    >
                                                        ディレクトリ
                                                    </span>
                                                    <Input
                                                        type="text"
                                                        bind:value={sel.directory}
                                                        placeholder="省略可"
                                                        class="flex-1"
                                                    />
                                                </div>
                                            {/if}
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        {/each}
                    </div>
                {/if}

                <!-- 全体共通: 元ファイル削除 -->
                <div class="border-t border-slate-100 pt-3.5 dark:border-slate-800">
                    <Checkbox bind:checked={isRemoveOriginal}>
                        <span class="font-bold text-sm sm:text-base text-rose-700 dark:text-rose-400">
                            エンコード完了後に元ファイルを自動削除
                        </span>
                    </Checkbox>
                </div>
            </div>

            <div class="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                <Button variant="secondary" onclick={() => (isEncodeModalOpen = false)}>キャンセル</Button>
                <Button variant="primary" onclick={addEncode}>追加する</Button>
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
            onclick={() => (isDropLogModalOpen = false)}
            aria-label="閉じる"
        ></button>
        <div
            class="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        >
            <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">ドロップログ</h3>

            {#if recorded?.dropLogFile}
                <div class="space-y-4 text-xs">
                    <div class="grid grid-cols-3 gap-3 text-center">
                        <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                            <p class="text-slate-400 text-[11px]">ドロップ</p>
                            <p class="text-base font-black text-rose-600">{recorded.dropLogFile.dropCnt || 0}</p>
                        </div>
                        <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                            <p class="text-slate-400 text-[11px]">エラー</p>
                            <p class="text-base font-black text-amber-600">{recorded.dropLogFile.errorCnt || 0}</p>
                        </div>
                        <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                            <p class="text-slate-400 text-[11px]">スクランブル</p>
                            <p class="text-base font-black text-slate-700 dark:text-slate-300">
                                {recorded.dropLogFile.scramblingCnt || 0}
                            </p>
                        </div>
                    </div>

                    {#if recorded.dropLogFile.dropCnt === 0 && recorded.dropLogFile.errorCnt === 0 && recorded.dropLogFile.scramblingCnt === 0}
                        <div
                            class="rounded-xl bg-emerald-50/70 p-3 text-center text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                        >
                            ドロップ・エラーは検出されませんでした（正常）
                        </div>
                    {:else if isLoadingDropLog}
                        <p class="py-4 text-center text-xs text-slate-400">詳細ログを読み込み中...</p>
                    {:else if dropLogContent}
                        <div>
                            <p class="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">詳細ログ</p>
                            <pre
                                class="max-h-60 overflow-auto rounded-xl bg-slate-50 p-3 font-mono text-[11px] text-slate-700 dark:bg-slate-950 dark:text-slate-300 whitespace-pre-wrap border border-slate-100 dark:border-slate-800">{dropLogContent}</pre>
                        </div>
                    {:else}
                        <p class="py-2 text-center text-xs text-slate-400">詳細ログファイルは存在しません</p>
                    {/if}
                </div>
            {:else}
                <p class="py-8 text-center text-xs text-slate-400">ドロップログ情報がありません</p>
            {/if}

            <div class="mt-6 flex items-center justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
                <Button variant="secondary" onclick={() => (isDropLogModalOpen = false)}>閉じる</Button>
            </div>
        </div>
    </div>
{/if}

{#if recorded}
    <RecreateThumbnailModal
        isOpen={isThumbnailModalOpen}
        recordedId={recorded.id}
        videoFiles={recorded.videoFiles || []}
        onClose={() => (isThumbnailModalOpen = false)}
        onSuccess={() => {
            setTimeout(async () => {
                await fetchRecordedDetail(true);
                thumbnailRefreshKey = Date.now();
            }, 1000);
        }}
    />
{/if}
