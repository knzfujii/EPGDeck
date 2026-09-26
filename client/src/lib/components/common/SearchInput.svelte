<script lang="ts">
    import { Search, X } from '@lucide/svelte';

    interface Props {
        value: string;
        placeholder?: string;
        ariaLabel?: string;
        size?: 'sm' | 'md' | 'lg';
        disabled?: boolean;
        class?: string;
        onsubmit?: () => void;
        onclear?: () => void;
        oninput?: (val: string) => void;
    }

    let {
        value = $bindable(''),
        placeholder = 'キーワードを検索...',
        ariaLabel = '検索キーワード',
        size = 'md',
        disabled = false,
        class: customClass = '',
        onsubmit,
        onclear,
        oninput,
    }: Props = $props();

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            handleClear();
        } else if (e.key === 'Enter') {
            onsubmit?.();
        }
    }

    function handleClear() {
        value = '';
        onclear?.();
    }

    function handleChange(e: Event & { currentTarget: HTMLInputElement }) {
        const val = e.currentTarget.value;
        value = val;
        oninput?.(val);
    }

    const heightClasses = {
        sm: 'h-9 text-xs pl-8 pr-8',
        md: 'h-10 text-xs sm:text-sm pl-9 pr-9',
        lg: 'h-11 text-sm sm:text-base pl-10 pr-10',
    };

    const iconSizes = {
        sm: 14,
        md: 16,
        lg: 18,
    };
</script>

<div class="relative flex-1 min-w-0 {customClass}">
    <Search
        size={iconSizes[size]}
        class="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
    />
    <input
        type="text"
        {value}
        oninput={handleChange}
        onkeydown={handleKeydown}
        {placeholder}
        aria-label={ariaLabel}
        {disabled}
        class="w-full rounded-xl border border-slate-200 bg-slate-50/50 font-medium text-slate-900 placeholder:text-slate-400 transition-colors focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:bg-slate-800 disabled:opacity-50 {heightClasses[
            size
        ]}"
    />
    {#if value}
        <button
            type="button"
            onclick={handleClear}
            {disabled}
            class="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center h-8 w-8 sm:h-7 sm:w-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="検索をクリア"
            aria-label="検索をクリア"
        >
            <X size={iconSizes[size]} />
        </button>
    {/if}
</div>
