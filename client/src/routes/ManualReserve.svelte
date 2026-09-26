<script lang="ts">
    import { onMount } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { readOnlyStore } from '../lib/stores/readOnly.svelte';
    import api from '@/lib/apiClient';
    import { Clock, Plus, ArrowLeft, Lock } from '@lucide/svelte';
    import RecordingOptionForm from '@/lib/components/recording/RecordingOptionForm.svelte';
    import { RecordingOptionFormState } from '@/lib/stores/recordingOptionForm.svelte';
    import Button from '../lib/components/common/Button.svelte';
    import Input from '../lib/components/common/Input.svelte';
    import Select from '../lib/components/common/Select.svelte';
    import Textarea from '../lib/components/common/Textarea.svelte';

    let selectedChannelId = $state<number | null>(null);
    let name = $state('');
    let description = $state('');
    let startAtStr = $state('');
    let endAtStr = $state('');
    let isSubmitting = $state(false);

    // 録画オプション状態
    const recOptions = new RecordingOptionFormState();

    function toLocalISOString(date: Date): string {
        const offset = date.getTimezoneOffset() * 60000;
        const localISOTime = new Date(date.getTime() - offset).toISOString().slice(0, 16);
        return localISOTime;
    }

    $effect(() => {
        if (readOnlyStore.isReadOnly) {
            router.replace('/recorded');
        }
    });

    onMount(async () => {
        if (readOnlyStore.isReadOnly) {
            router.replace('/recorded');
            return;
        }
        await channelStore.fetch();
        if (channelStore.channels.length > 0) {
            selectedChannelId = channelStore.channels[0].id;
        }

        const now = new Date();
        now.setMinutes(Math.ceil(now.getMinutes() / 10) * 10, 0, 0);
        const end = new Date(now.getTime() + 30 * 60000);

        startAtStr = toLocalISOString(now);
        endAtStr = toLocalISOString(end);
    });

    async function submitManualReserve() {
        if (!name.trim()) {
            snackbar.open({ text: '番組名を入力してください', color: 'warning' });
            return;
        }
        if (!selectedChannelId) {
            snackbar.open({ text: '放送局を選択してください', color: 'warning' });
            return;
        }

        const startAt = new Date(startAtStr).getTime();
        const endAt = new Date(endAtStr).getTime();

        if (isNaN(startAt) || isNaN(endAt) || startAt >= endAt) {
            snackbar.open({ text: '正しい開始・終了時刻を指定してください', color: 'warning' });
            return;
        }

        isSubmitting = true;
        try {
            await api.reserves.$post({
                json: {
                    allowEndLack: recOptions.allowEndLack,
                    timeSpecifiedOption: {
                        name: name.trim(),
                        channelId: selectedChannelId,
                        startAt,
                        endAt,
                    },
                    saveOption: recOptions.buildSaveOption(),
                    encodeOption: recOptions.buildEncodeOption(),
                },
            });
            snackbar.open({ text: '時間指定予約を作成しました', color: 'success' });
            router.push('/reserves');
        } catch (e: unknown) {
            console.error('Manual reserve error', e);
            const errorMsg = e instanceof Error ? e.message : '予約の作成に失敗しました';
            snackbar.open({ text: errorMsg, color: 'error' });
        } finally {
            isSubmitting = false;
        }
    }
    import ReadOnlyGuard from '../lib/components/common/ReadOnlyGuard.svelte';
</script>

{#if readOnlyStore.isReadOnly}
    <ReadOnlyGuard
        description="手動予約の作成は制限されています。録画一覧へリダイレクトします..."
        returnPath="/recorded"
        returnText="録画一覧へ"
    />
{:else}
    <div class="w-full max-w-3xl min-w-0 space-y-5">
        <div class="flex items-center gap-3">
            <button
                type="button"
                onclick={() => router.push('/reserves')}
                class="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer"
                aria-label="戻る"
            >
                <ArrowLeft size={18} />
            </button>
            <div>
                <h1 class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                    <Clock size={20} class="text-blue-600 dark:text-blue-400" />
                    時間指定手動予約
                </h1>
                <p class="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    日時・放送局を指定した録画予約
                </p>
            </div>
        </div>

        <form
            onsubmit={e => {
                e.preventDefault();
                submitManualReserve();
            }}
            class="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900"
        >
            <div>
                <label
                    for="manual-channel-select"
                    class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                    放送局
                </label>
                <Select id="manual-channel-select" bind:value={selectedChannelId}>
                    {#each channelStore.channels as ch}
                        <option value={ch.id}>[{ch.channelType}] {ch.name}</option>
                    {/each}
                </Select>
            </div>

            <div>
                <label
                    for="manual-program-name"
                    class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                    番組名 *
                </label>
                <Input
                    id="manual-program-name"
                    type="text"
                    bind:value={name}
                    placeholder="例: 深夜アニメ 第1話"
                    required
                />
            </div>

            <div>
                <label
                    for="manual-program-desc"
                    class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                    番組概要 (任意)
                </label>
                <Textarea id="manual-program-desc" bind:value={description} rows={3} placeholder="番組の詳細やメモ" />
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <label
                        for="manual-start-time"
                        class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                        開始日時 *
                    </label>
                    <Input id="manual-start-time" type="datetime-local" bind:value={startAtStr} required />
                </div>
                <div>
                    <label
                        for="manual-end-time"
                        class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                        終了日時 *
                    </label>
                    <Input id="manual-end-time" type="datetime-local" bind:value={endAtStr} required />
                </div>
            </div>

            <!-- 録画オプション (TS保存先・エンコード設定等) -->
            <div class="pt-2">
                <RecordingOptionForm
                    bind:saveParentDir={recOptions.saveParentDir}
                    bind:saveSubDir={recOptions.saveSubDir}
                    bind:encRows={recOptions.encRows}
                    bind:isDeleteOriginal={recOptions.isDeleteOriginal}
                    bind:allowEndLack={recOptions.allowEndLack}
                />
            </div>

            <div class="flex justify-end gap-3 pt-4">
                <Button variant="secondary" onclick={() => router.push('/reserves')}>キャンセル</Button>
                {#if !readOnlyStore.isReadOnly}
                    <Button type="submit" variant="primary" disabled={isSubmitting}>
                        <Plus size={16} /> 予約を追加
                    </Button>
                {:else}
                    <p class="text-xs text-amber-600 dark:text-amber-400 font-bold self-center">
                        ※閲覧専用モードのため予約は作成できません
                    </p>
                {/if}
            </div>
        </form>
    </div>
{/if}
