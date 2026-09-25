<script lang="ts">
    import { ChevronLeft, ChevronRight } from '@lucide/svelte';

    interface Props {
        currentPage: number;
        total: number;
        limit: number;
        onPageChange: (page: number) => void;
    }

    let { currentPage, total, limit, onPageChange }: Props = $props();

    const totalPages = $derived(Math.ceil(total / limit));
</script>

{#if totalPages > 1}
    <div class="flex items-center justify-center gap-2 pt-2">
        <button
            type="button"
            disabled={currentPage <= 1}
            onclick={() => onPageChange(currentPage - 1)}
            class="flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 transition-colors"
        >
            <ChevronLeft size={14} /> 前へ
        </button>
        <span class="px-3 text-xs font-semibold text-slate-600 dark:text-slate-400">
            {currentPage} / {totalPages} ページ
        </span>
        <button
            type="button"
            disabled={currentPage >= totalPages}
            onclick={() => onPageChange(currentPage + 1)}
            class="flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 transition-colors"
        >
            次へ <ChevronRight size={14} />
        </button>
    </div>
{/if}
