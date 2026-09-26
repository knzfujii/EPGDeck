<script lang="ts" generics="T extends string">
    import type { Component } from 'svelte';

    export interface TabItem<T extends string = string> {
        id: T;
        label: string;
        count?: number;
        icon?: Component<{ size?: number; class?: string }>;
        badgeColor?: 'default' | 'danger' | 'warning' | 'purple';
    }

    interface Props<T extends string = string> {
        tabs: TabItem<T>[];
        activeTab: T;
        onselect: (id: T) => void;
        class?: string;
    }

    let { tabs, activeTab, onselect, class: customClass = '' }: Props<T> = $props();
</script>

<div
    class="flex items-center overflow-x-auto max-w-full rounded-xl border border-slate-200/80 bg-slate-100 p-1 dark:border-slate-700/80 dark:bg-slate-800 no-scrollbar shrink-0 {customClass}"
>
    {#each tabs as tab}
        {@const isActive = tab.id === activeTab}
        {@const Icon = tab.icon}
        <button
            type="button"
            onclick={() => onselect(tab.id)}
            aria-label={typeof tab.count === 'number' ? `${tab.label} (${tab.count})` : tab.label}
            class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 {isActive
                ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-950/5 dark:bg-slate-700 dark:text-slate-100 dark:ring-white/10 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700/50'}"
        >
            {#if Icon}
                <Icon
                    size={14}
                    class={isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 group-hover:text-slate-600'}
                />
            {/if}
            <span>{tab.label}</span>
            {#if typeof tab.count === 'number'}
                <span
                    class="rounded-full px-1.5 py-0.2 text-[10px] sm:text-xs font-bold {isActive
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}"
                >
                    ({tab.count})
                </span>
            {/if}
        </button>
    {/each}
</div>
