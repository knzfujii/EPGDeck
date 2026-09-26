<script lang="ts">
    import type { HTMLSelectAttributes } from 'svelte/elements';
    import type { Snippet } from 'svelte';

    interface Props extends HTMLSelectAttributes {
        value?: any;
        children?: Snippet;
    }

    let { value = $bindable(), class: className = '', children, ...restProps }: Props = $props();
</script>

<select
    bind:value
    class="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-3.5 pr-8 text-sm font-semibold text-slate-800 transition-colors cursor-pointer focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:focus:border-blue-400 dark:focus:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed {className}"
    {...restProps}
>
    {@render children?.()}
</select>
