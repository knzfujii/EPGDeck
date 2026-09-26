<script lang="ts">
    import type { HTMLInputAttributes } from 'svelte/elements';

    interface Props extends HTMLInputAttributes {
        value?: string | number | null;
    }

    let { value = $bindable(''), type = 'text', class: className = '', ...restProps }: Props = $props();
</script>

<input
    {type}
    bind:value
    class="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 transition-colors focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed {className}"
    {...restProps}
/>
