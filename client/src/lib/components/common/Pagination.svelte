<script lang="ts">
    import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from '@lucide/svelte';

    interface Props {
        currentPage: number;
        total: number;
        limit: number;
        onPageChange: (page: number) => void;
    }

    let { currentPage, total, limit, onPageChange }: Props = $props();

    const totalPages = $derived(Math.max(1, Math.ceil(total / limit)));

    let inputVal = $state('');
    let inputEl = $state<HTMLInputElement | null>(null);

    $effect(() => {
        inputVal = String(currentPage);
    });

    function submitPage() {
        const pageNum = parseInt(inputVal, 10);
        if (!isNaN(pageNum)) {
            const clamped = Math.max(1, Math.min(totalPages, pageNum));
            if (clamped !== currentPage) {
                onPageChange(clamped);
            } else {
                inputVal = String(clamped);
            }
        } else {
            inputVal = String(currentPage);
        }
        if (inputEl) {
            inputEl.blur();
        }
    }

    function handleFocus(e: FocusEvent) {
        const target = e.currentTarget as HTMLInputElement;
        target.select();
        // 仮想キーボードが開いた際に、入力欄がキーボードに隠れないよう中央へスクロール
        setTimeout(() => {
            target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 250);
    }

    function handleKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            inputVal = String(currentPage);
            if (inputEl) inputEl.blur();
        }
    }
</script>

{#if totalPages > 1}
    <nav class="flex items-center justify-center gap-1.5 select-none" aria-label="ページネーション">
        <!-- 最初のページへ -->
        <button
            type="button"
            disabled={currentPage <= 1}
            onclick={() => onPageChange(1)}
            class="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors shadow-2xs shrink-0"
            title="最初のページへ (1)"
            aria-label="最初のページへ"
        >
            <ChevronsLeft size={16} />
        </button>

        <!-- 前のページへ -->
        <button
            type="button"
            disabled={currentPage <= 1}
            onclick={() => onPageChange(currentPage - 1)}
            class="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors shadow-2xs shrink-0"
            title="前のページへ"
            aria-label="前のページへ"
        >
            <ChevronLeft size={16} />
        </button>

        <!-- 常時表示のページ番号入力フォーム -->
        <form
            onsubmit={e => {
                e.preventDefault();
                submitPage();
            }}
            class="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 px-2 h-9 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90"
        >
            <input
                bind:this={inputEl}
                type="number"
                inputmode="numeric"
                min="1"
                max={totalPages}
                bind:value={inputVal}
                onfocus={handleFocus}
                onkeydown={handleKeyDown}
                class="h-7 w-12 sm:w-14 rounded-lg border border-slate-300 bg-white px-1 text-center text-xs sm:text-sm font-bold text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="番号"
                aria-label="ページ番号を入力"
            />
            <span class="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                / {totalPages}
            </span>
            <button
                type="submit"
                class="flex h-7 px-2.5 items-center justify-center rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors shadow-2xs shrink-0 cursor-pointer"
                title="Go"
                aria-label="Go"
            >
                Go
            </button>
        </form>

        <!-- 次のページへ -->
        <button
            type="button"
            disabled={currentPage >= totalPages}
            onclick={() => onPageChange(currentPage + 1)}
            class="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors shadow-2xs shrink-0"
            title="次のページへ"
            aria-label="次のページへ"
        >
            <ChevronRight size={16} />
        </button>

        <!-- 最後のページへ -->
        <button
            type="button"
            disabled={currentPage >= totalPages}
            onclick={() => onPageChange(totalPages)}
            class="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors shadow-2xs shrink-0"
            title="最後のページへ ({totalPages})"
            aria-label="最後のページへ"
        >
            <ChevronsRight size={16} />
        </button>
    </nav>
{/if}
