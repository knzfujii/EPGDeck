<script lang="ts">
    import { onMount } from 'svelte';
    import http from '@/lib/httpClient';
    import { SlidersHorizontal, Plus, Trash2 } from '@lucide/svelte';
    import type { EncodeRow } from '@/lib/utils/recordingOptions';

    let {
        saveParentDir = $bindable(''),
        saveSubDir = $bindable(''),
        encRows = $bindable<EncodeRow[]>([{ mode: '', parentDir: '', subDir: '' }]),
        isDeleteOriginal = $bindable(false),
        allowEndLack = $bindable(false),
        encodeModes: propEncodeModes,
        storageDirs: propStorageDirs,
    }: {
        saveParentDir?: string;
        saveSubDir?: string;
        encRows?: EncodeRow[];
        isDeleteOriginal?: boolean;
        allowEndLack?: boolean;
        encodeModes?: string[];
        storageDirs?: string[];
    } = $props();

    let internalEncodeModes = $state<string[]>([]);
    let internalStorageDirs = $state<string[]>([]);

    let effectiveEncodeModes = $derived(propEncodeModes ?? internalEncodeModes);
    let effectiveStorageDirs = $derived(propStorageDirs ?? internalStorageDirs);

    onMount(async () => {
        if (!propEncodeModes || !propStorageDirs) {
            try {
                const res = await http.get('/api/config');
                if (!propEncodeModes) {
                    internalEncodeModes = res.data.encode || [];
                }
                if (!propStorageDirs) {
                    internalStorageDirs = res.data.recorded || [];
                }
            } catch (e) {
                console.error('Failed to fetch config in RecordingOptionForm', e);
            }
        }
    });

    function addEncodeRow() {
        if (encRows.length < 3) {
            encRows = [...encRows, { mode: '', parentDir: '', subDir: '' }];
        }
    }

    function removeEncodeRow(index: number) {
        if (encRows.length > 1) {
            encRows = encRows.filter((_, i) => i !== index);
        } else {
            encRows = [{ mode: '', parentDir: '', subDir: '' }];
        }
    }
</script>

<div class="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-700 dark:bg-slate-800/30">
    <h4 class="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 mb-3">
        <SlidersHorizontal size={13} /> 録画オプション
    </h4>

    <!-- TS保存先 -->
    <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div>
            <label
                for="recording-option-save-parent"
                class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5"
            >
                TS保存先 (親)
            </label>
            <select
                id="recording-option-save-parent"
                bind:value={saveParentDir}
                class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-hidden dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
                <option value="">デフォルト</option>
                {#each effectiveStorageDirs as dir}
                    <option value={dir}>{dir}</option>
                {/each}
            </select>
        </div>
        <div>
            <label
                for="recording-option-save-sub"
                class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5"
            >
                TS保存先 (サブ)
            </label>
            <input
                id="recording-option-save-sub"
                type="text"
                bind:value={saveSubDir}
                placeholder="サブディレクトリ (任意)"
                class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
            />
        </div>
    </div>

    <!-- エンコード設定 -->
    <div class="mt-3.5 space-y-2.5">
        <div class="flex items-center justify-between">
            <span class="block text-sm font-bold text-slate-700 dark:text-slate-300">エンコード設定</span>
            {#if encRows.length < 3}
                <button
                    type="button"
                    onclick={addEncodeRow}
                    class="flex items-center gap-1.5 text-sm font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                >
                    <Plus size={16} /> 追加
                </button>
            {/if}
        </div>

        {#each encRows as row, i}
            <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-800">
                <div class="flex items-center gap-2">
                    <span class="text-sm font-bold text-slate-400">#{i + 1}</span>
                    <select
                        bind:value={row.mode}
                        aria-label={`エンコードモード #${i + 1}`}
                        class="h-9 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-hidden dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                    >
                        <option value="">エンコードなし</option>
                        {#each effectiveEncodeModes as mode}
                            <option value={mode}>{mode}</option>
                        {/each}
                    </select>
                    {#if encRows.length > 1}
                        <button
                            type="button"
                            onclick={() => removeEncodeRow(i)}
                            class="rounded-lg p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            title="削除"
                            aria-label="エンコード行を削除"
                        >
                            <Trash2 size={14} />
                        </button>
                    {/if}
                </div>
                <div class="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <select
                        bind:value={row.parentDir}
                        aria-label={`エンコード保存先(親) #${i + 1}`}
                        class="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-hidden dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                    >
                        <option value="">保存先: デフォルト</option>
                        {#each effectiveStorageDirs as dir}
                            <option value={dir}>{dir}</option>
                        {/each}
                    </select>
                    <input
                        type="text"
                        bind:value={row.subDir}
                        placeholder="サブディレクトリ (任意)"
                        aria-label={`エンコード保存先(サブ) #${i + 1}`}
                        class="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
                    />
                </div>
            </div>
        {/each}
    </div>

    <!-- TSファイル削除 & 末尾欠け許可 -->
    <div class="mt-3.5 space-y-2.5">
        <label class="flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" bind:checked={isDeleteOriginal} class="form-checkbox" />
            <span class="text-sm font-bold text-slate-700 dark:text-slate-300">
                エンコード完了後に元TSファイルを自動削除
            </span>
        </label>

        <label class="flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" bind:checked={allowEndLack} class="form-checkbox" />
            <span class="text-sm font-bold text-slate-700 dark:text-slate-300">チューナー競合時の末尾切れを許可</span>
        </label>
    </div>
</div>
