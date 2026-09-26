<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { HTMLAttributes } from 'svelte/elements';

    interface Props extends HTMLAttributes<HTMLDivElement> {
        children?: Snippet;
    }

    let { class: className = '', children, ...restProps }: Props = $props();
</script>

<div
    class="rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 transition-colors {className}"
    {...restProps}
>
    {@render children?.()}
</div>
