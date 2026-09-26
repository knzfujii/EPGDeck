<script lang="ts">
    import type { HTMLTextareaAttributes } from 'svelte/elements';

    interface Props extends HTMLTextareaAttributes {
        value?: string | null;
    }

    let { value = $bindable(''), class: className = '', ...restProps }: Props = $props();
</script>

<textarea
    bind:value
    class="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 transition-colors focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed {className}"
    {...restProps}></textarea>
