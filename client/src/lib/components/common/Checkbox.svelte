<script lang="ts">
    import type { HTMLInputAttributes } from 'svelte/elements';
    import type { Snippet } from 'svelte';

    interface Props extends HTMLInputAttributes {
        checked?: boolean;
        label?: string;
        children?: Snippet;
    }

    let { checked = $bindable(false), label = '', class: className = '', children, ...restProps }: Props = $props();
</script>

{#if label || children}
    <label class="inline-flex items-center gap-2.5 cursor-pointer select-none {className}">
        <input
            type="checkbox"
            bind:checked
            class="h-5 w-5 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-blue-600 focus:ring-2 focus:ring-blue-500/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            {...restProps}
        />
        {#if children}
            {@render children()}
        {:else if label}
            <span class="text-sm font-semibold text-slate-800 dark:text-slate-200">{label}</span>
        {/if}
    </label>
{:else}
    <input
        type="checkbox"
        bind:checked
        class="h-5 w-5 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-blue-600 focus:ring-2 focus:ring-blue-500/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed {className}"
        {...restProps}
    />
{/if}
