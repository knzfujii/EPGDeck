<script lang="ts">
    import type { Snippet, Component } from 'svelte';

    interface Props {
        icon?: Component<{ size?: number; class?: string }>;
        title: string;
        description?: string;
        action?: Snippet;
        children?: Snippet;
    }

    let { icon: Icon, title, description, action, children }: Props = $props();
</script>

<div
    class="flex h-64 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900"
>
    {#if Icon}
        <Icon size={36} class="text-slate-300 dark:text-slate-600" />
    {/if}
    <p class="mt-2 text-sm font-bold text-slate-700 dark:text-slate-300">{title}</p>
    {#if description}
        <p class="text-xs text-slate-400 mt-1 max-w-sm">{description}</p>
    {/if}
    {#if action}
        <div class="mt-4">
            {@render action()}
        </div>
    {/if}
    {#if children}
        {@render children()}
    {/if}
</div>
