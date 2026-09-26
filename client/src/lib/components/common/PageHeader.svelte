<script lang="ts">
    import type { Snippet, Component } from 'svelte';

    interface Props {
        title: string;
        icon?: Component<{ size?: number; class?: string }>;
        description?: string;
        badge?: Snippet;
        actions?: Snippet;
        children?: Snippet;
        class?: string;
    }

    let { title, icon: Icon, description, badge, actions, children, class: customClass = '' }: Props = $props();
</script>

<div
    class="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 mb-4 sm:mb-5 {customClass}"
>
    <!-- 上段: タイトル ＆ メインアクション -->
    <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
            <div class="flex items-center gap-2.5 flex-wrap">
                {#if Icon}
                    <Icon size={20} class="text-blue-600 dark:text-blue-400 shrink-0" />
                {/if}
                <h1 class="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
                    {title}
                </h1>
                {#if badge}
                    {@render badge()}
                {/if}
            </div>
            {#if description}
                <p class="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 break-words">
                    {description}
                </p>
            {/if}
        </div>

        {#if actions}
            <div class="flex items-center gap-2 sm:gap-2.5 flex-wrap shrink-0">
                {@render actions()}
            </div>
        {/if}
    </div>

    <!-- 下段: 検索バー・フィルタータブ等のスロット -->
    {#if children}
        <div class="pt-2 sm:pt-3 border-t border-slate-100 dark:border-slate-800/80">
            {@render children()}
        </div>
    {/if}
</div>
