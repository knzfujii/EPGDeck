<script lang="ts">
    import { onMount } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import axios from 'axios';
    import { Clock, Plus, ArrowLeft } from '@lucide/svelte';

    let selectedChannelId = $state<number | null>(null);
    let name = $state('');
    let description = $state('');
    let startAtStr = $state('');
    let endAtStr = $state('');
    let isSubmitting = $state(false);

    function toLocalISOString(date: Date): string {
        const offset = date.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(date.getTime() - offset)).toISOString().slice(0, 16);
        return localISOTime;
    }

    onMount(async () => {
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
            await axios.post('/api/reserves', {
                channelId: selectedChannelId,
                name: name.trim(),
                description: description.trim(),
                startAt,
                endAt,
                isHalfWidth: true,
            });
            snackbar.open({ text: '時間指定予約を作成しました', color: 'success' });
            router.push('/reserves');
        } catch (e) {
            console.error('Manual reserve error', e);
            snackbar.open({ text: '予約の作成に失敗しました', color: 'error' });
        } finally {
            isSubmitting = false;
        }
    }
</script>

<div class="w-full max-w-3xl min-w-0 space-y-5">
    <div class="flex items-center gap-3">
        <button
            type="button"
            onclick={() => router.push('/reserves')}
            class="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
            aria-label="戻る"
        >
            <ArrowLeft size={18} />
        </button>
        <div>
            <h1 class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                <Clock size={20} class="text-blue-600 dark:text-blue-400" />
                時間指定手動予約
            </h1>
            <p class="text-xs text-slate-500 dark:text-slate-400">日時と放送局を指定して直接録画予約を作成します</p>
        </div>
    </div>

    <form onsubmit={(e) => { e.preventDefault(); submitManualReserve(); }} class="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div>
            <label for="manual-channel-select" class="block text-xs font-bold text-slate-700 dark:text-slate-300">放送局</label>
            <select
                id="manual-channel-select"
                bind:value={selectedChannelId}
                class="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:bg-slate-800"
            >
                {#each channelStore.channels as ch}
                    <option value={ch.id}>[{ch.channelType}] {ch.name}</option>
                {/each}
            </select>
        </div>

        <div>
            <label for="manual-program-name" class="block text-xs font-bold text-slate-700 dark:text-slate-300">番組名 *</label>
            <input
                id="manual-program-name"
                type="text"
                bind:value={name}
                placeholder="例: 深夜アニメ 第1話"
                required
                class="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-800"
            />
        </div>

        <div>
            <label for="manual-program-desc" class="block text-xs font-bold text-slate-700 dark:text-slate-300">番組概要 (任意)</label>
            <textarea
                id="manual-program-desc"
                bind:value={description}
                rows={3}
                placeholder="番組の詳細やメモ"
                class="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-800"
            ></textarea>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
                <label for="manual-start-time" class="block text-xs font-bold text-slate-700 dark:text-slate-300">開始日時 *</label>
                <input
                    id="manual-start-time"
                    type="datetime-local"
                    bind:value={startAtStr}
                    required
                    class="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:bg-slate-800"
                />
            </div>
            <div>
                <label for="manual-end-time" class="block text-xs font-bold text-slate-700 dark:text-slate-300">終了日時 *</label>
                <input
                    id="manual-end-time"
                    type="datetime-local"
                    bind:value={endAtStr}
                    required
                    class="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:bg-slate-800"
                />
            </div>
        </div>

        <div class="flex justify-end gap-3 pt-4">
            <button
                type="button"
                onclick={() => router.push('/reserves')}
                class="rounded-xl px-5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
                キャンセル
            </button>
            <button
                type="submit"
                disabled={isSubmitting}
                class="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 disabled:opacity-50"
            >
                <Plus size={16} /> 予約を追加
            </button>
        </div>
    </form>
</div>

