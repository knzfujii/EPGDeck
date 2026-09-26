<script lang="ts">
    import { X, Camera, Clock, Film, AlertCircle, Loader2 } from '@lucide/svelte';
    import api from '@/lib/apiClient';
    import { snackbar } from '../../stores/snackbar.svelte';
    import { formatPlayerTime, parsePlayerTime } from '../../utils/format';
    import type * as apid from '../../../../../api';
    import Button from '../common/Button.svelte';
    import Input from '../common/Input.svelte';
    import Select from '../common/Select.svelte';
    import Checkbox from '../common/Checkbox.svelte';

    interface Props {
        isOpen: boolean;
        recordedId: number;
        videoFiles?: apid.VideoFile[];
        onClose: () => void;
        onSuccess: () => void;
    }

    let { isOpen, recordedId, videoFiles = [], onClose, onSuccess }: Props = $props();

    const STORAGE_KEY = 'epgdeck_thumbnail_recreate_time';

    function getStoredTime(): string {
        if (typeof window === 'undefined') return '00:00:10';
        try {
            return localStorage.getItem(STORAGE_KEY) || '00:00:10';
        } catch {
            return '00:00:10';
        }
    }

    function setStoredTime(time: string): void {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(STORAGE_KEY, time);
        } catch {
            // ignore
        }
    }

    let selectedVideoFileId = $state<number | undefined>(undefined);
    let timeInput = $state(getStoredTime());
    let isReplace = $state(true);
    let isSubmitting = $state(false);

    // モーダルが開かれた時の初期化処理
    $effect(() => {
        if (isOpen) {
            // 前回収集/指定した秒数を最新のStorageから反映
            timeInput = getStoredTime();

            // 初期動画ファイル選択: MP4優先、なければ先頭
            if (
                videoFiles.length > 0 &&
                (selectedVideoFileId === undefined || !videoFiles.some(f => f.id === selectedVideoFileId))
            ) {
                const mp4 = videoFiles.find(f => f.name.toLowerCase().endsWith('.mp4'));
                selectedVideoFileId = mp4 ? mp4.id : videoFiles[0].id;
            }

            isReplace = true;
            isSubmitting = false;
        }
    });

    // 入力時間のパース結果（秒数）
    const parsedSeconds = $derived(parsePlayerTime(timeInput));
    const isValidTime = $derived(parsedSeconds !== null);

    async function handleRecreate() {
        if (!selectedVideoFileId || !isValidTime || parsedSeconds === null || isSubmitting) return;

        isSubmitting = true;
        try {
            const res = await api.thumbnails.videos[':videoFileId'].$post({
                param: { videoFileId: String(selectedVideoFileId) },
                query: {
                    seconds: String(parsedSeconds),
                    replace: String(isReplace),
                },
            });

            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }

            setStoredTime(timeInput);
            snackbar.open({ text: 'サムネイルの再作成をリクエストしました', color: 'success' });
            onSuccess();
            onClose();
        } catch (e) {
            console.error('Failed to recreate thumbnail', e);
            snackbar.open({ text: 'サムネイル再作成のリクエストに失敗しました', color: 'error' });
        } finally {
            isSubmitting = false;
        }
    }
</script>

{#if isOpen}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        onkeydown={e => e.key === 'Escape' && onClose()}
    >
        <div
            class="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        >
            <!-- ヘッダー -->
            <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div class="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                    <div
                        class="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
                    >
                        <Camera size={20} />
                    </div>
                    <div>
                        <h2 class="text-base font-bold">サムネイル再作成</h2>
                        <p class="text-xs text-slate-500 dark:text-slate-400">任意の位置（時:分:秒）を指定して作成</p>
                    </div>
                </div>
                <button
                    type="button"
                    onclick={onClose}
                    class="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer transition"
                    aria-label="閉じる"
                >
                    <X size={20} />
                </button>
            </div>

            <!-- フォーム内容 -->
            <div class="space-y-4 py-4">
                <!-- 対象動画ファイル選択 -->
                {#if videoFiles.length > 1}
                    <div>
                        <label
                            for="thumbnail-video-select"
                            class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5"
                        >
                            <Film size={14} class="text-slate-400" />
                            対象動画ファイル
                        </label>
                        <Select id="thumbnail-video-select" bind:value={selectedVideoFileId}>
                            {#each videoFiles as file}
                                <option value={file.id}>{file.name} ({file.type.toUpperCase()})</option>
                            {/each}
                        </Select>
                    </div>
                {/if}

                <!-- 抽出位置（時:分:秒）入力 -->
                <div>
                    <label
                        for="thumbnail-time-input"
                        class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5"
                    >
                        <Clock size={14} class="text-slate-400" />
                        切り出し位置（時:分:秒）
                    </label>
                    <div class="relative">
                        <Input
                            id="thumbnail-time-input"
                            type="text"
                            bind:value={timeInput}
                            placeholder="00:01:30 または 90"
                            class="font-mono {isValidTime
                                ? ''
                                : '!border-rose-400 !bg-rose-50/50 dark:!bg-rose-950/40 text-rose-900 dark:text-rose-200'}"
                        />
                    </div>
                    {#if isValidTime && parsedSeconds !== null}
                        <p class="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                            開始から <span class="font-bold text-slate-700 dark:text-slate-200">{parsedSeconds}秒</span>
                            （{formatPlayerTime(parsedSeconds)}）の位置から抽出します
                        </p>
                    {:else}
                        <p class="mt-1.5 text-xs text-rose-500 dark:text-rose-400 flex items-center gap-1">
                            <AlertCircle size={12} />
                            「時:分:秒」（例: 01:30 や 01:15:00）または秒数を入力してください
                        </p>
                    {/if}
                </div>

                <!-- 既存サムネイル置き換えオプション -->
                <div class="pt-1">
                    <Checkbox
                        bind:checked={isReplace}
                        label="既存のサムネイルを削除して置き換える（推奨）"
                        class="text-xs text-slate-700 dark:text-slate-300"
                    />
                </div>
            </div>

            <!-- アクションボタン -->
            <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button variant="secondary" onclick={onClose} disabled={isSubmitting}>キャンセル</Button>
                <Button
                    variant="primary"
                    onclick={handleRecreate}
                    disabled={!isValidTime || !selectedVideoFileId || isSubmitting}
                >
                    {#if isSubmitting}
                        <Loader2 size={16} class="animate-spin" />
                        作成中...
                    {:else}
                        <Camera size={16} />
                        再作成を実行
                    {/if}
                </Button>
            </div>
        </div>
    </div>
{/if}
