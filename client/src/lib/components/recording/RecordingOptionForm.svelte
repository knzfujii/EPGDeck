<script lang="ts">
    import { onMount } from 'svelte';
    import { SlidersHorizontal, Plus, Trash2 } from '@lucide/svelte';
    import type { EncodeRow } from '@/lib/utils/recordingOptions';

    import { configStore } from '@/lib/stores/config.svelte';
    import Select from '../common/Select.svelte';
    import Input from '../common/Input.svelte';
    import Checkbox from '../common/Checkbox.svelte';
    import IconButton from '../common/IconButton.svelte';

    let {
        saveParentDir = $bindable(''),
        saveSubDir = $bindable(''),
        encRows = $bindable<EncodeRow[]>([{ mode: '', parentDir: '', subDir: '' }]),
        isDeleteOriginal = $bindable(false),
        allowEndLack = $bindable(false),
        showHeading = true,
        encodeModes: propEncodeModes,
        storageDirs: propStorageDirs,
    }: {
        saveParentDir?: string;
        saveSubDir?: string;
        encRows?: EncodeRow[];
        isDeleteOriginal?: boolean;
        allowEndLack?: boolean;
        showHeading?: boolean;
        encodeModes?: string[];
        storageDirs?: string[];
    } = $props();

    let effectiveEncodeModes = $derived(propEncodeModes ?? configStore.encodeModeNames);
    let effectiveStorageDirs = $derived(propStorageDirs ?? configStore.recordedDirs);

    onMount(() => {
        if (!propEncodeModes || !propStorageDirs) {
            void configStore.fetch();
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
    {#if showHeading}
        <h4 class="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 mb-3">
            <SlidersHorizontal size={13} /> 録画オプション
        </h4>
    {/if}

    <!-- TS保存先 -->
    <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div>
            <label
                for="recording-option-save-parent"
                class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5"
            >
                TS保存先 (親)
            </label>
            <Select id="recording-option-save-parent" bind:value={saveParentDir}>
                <option value="">デフォルト</option>
                {#each effectiveStorageDirs as dir}
                    <option value={dir}>{dir}</option>
                {/each}
            </Select>
        </div>
        <div>
            <label
                for="recording-option-save-sub"
                class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5"
            >
                TS保存先 (サブ)
            </label>
            <Input
                id="recording-option-save-sub"
                type="text"
                bind:value={saveSubDir}
                placeholder="サブディレクトリ (任意)"
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
                    <Select
                        bind:value={row.mode}
                        aria-label={`エンコードモード #${i + 1}`}
                        class="h-9 flex-1 text-xs sm:text-sm"
                    >
                        <option value="">エンコードなし</option>
                        {#each effectiveEncodeModes as mode}
                            <option value={mode}>{mode}</option>
                        {/each}
                    </Select>
                    {#if encRows.length > 1}
                        <IconButton
                            variant="danger-outline"
                            size="sm"
                            onclick={() => removeEncodeRow(i)}
                            title="削除"
                            aria-label="エンコード行を削除"
                        >
                            <Trash2 size={14} />
                        </IconButton>
                    {/if}
                </div>
                <div class="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <Select
                        bind:value={row.parentDir}
                        aria-label={`エンコード保存先(親) #${i + 1}`}
                        class="h-9 w-full text-xs sm:text-sm"
                    >
                        <option value="">保存先: デフォルト</option>
                        {#each effectiveStorageDirs as dir}
                            <option value={dir}>{dir}</option>
                        {/each}
                    </Select>
                    <Input
                        type="text"
                        bind:value={row.subDir}
                        placeholder="サブディレクトリ (任意)"
                        aria-label={`エンコード保存先(サブ) #${i + 1}`}
                        class="h-9 w-full text-xs sm:text-sm"
                    />
                </div>
            </div>
        {/each}
    </div>

    <!-- TSファイル削除 & 末尾欠け許可 -->
    <div class="mt-3.5 space-y-2.5">
        <Checkbox
            bind:checked={isDeleteOriginal}
            label="エンコード完了後に元TSファイルを自動削除"
            class="text-sm font-bold text-slate-700 dark:text-slate-300"
        />

        <Checkbox
            bind:checked={allowEndLack}
            label="チューナー競合時の末尾切れを許可"
            class="text-sm font-bold text-slate-700 dark:text-slate-300"
        />
    </div>
</div>
