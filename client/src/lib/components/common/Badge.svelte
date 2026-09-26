<script lang="ts">
    import type { Snippet, Component } from 'svelte';
    import { Lock, AlertTriangle, Ban, Radio } from '@lucide/svelte';

    export type BadgeVariant =
        'default' | 'channel' | 'rule' | 'manual' | 'protected' | 'recording' | 'conflict' | 'skip' | 'overlap';

    export type BadgeSize = 'xs' | 'sm' | 'md';

    interface Props {
        variant?: BadgeVariant;
        size?: BadgeSize;
        icon?: Component<{ size?: number; class?: string }>;
        children?: Snippet;
        text?: string;
        title?: string;
        class?: string;
    }

    let {
        variant = 'default',
        size = 'sm',
        icon: CustomIcon,
        children,
        text,
        title,
        class: customClass = '',
    }: Props = $props();

    const sizeClasses: Record<BadgeSize, string> = {
        xs: 'px-1.5 py-0.5 text-[10px] leading-tight rounded',
        sm: 'px-2 py-0.5 text-xs leading-normal rounded-md',
        md: 'px-2.5 py-1 text-xs sm:text-sm leading-normal rounded-lg',
    };

    const variantClasses: Record<BadgeVariant, string> = {
        default: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-semibold',
        channel: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-bold',
        rule: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-bold',
        manual: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 font-bold',
        protected:
            'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300/60 dark:border-amber-900/60 font-bold',
        recording: 'bg-rose-600 text-white font-bold animate-pulse',
        conflict:
            'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 font-bold',
        skip: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-bold',
        overlap: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 font-medium',
    };

    const iconSizeMap: Record<BadgeSize, number> = {
        xs: 10,
        sm: 12,
        md: 14,
    };
</script>

<span
    class="inline-flex items-center gap-1 shrink-0 whitespace-nowrap {sizeClasses[size]} {variantClasses[
        variant
    ]} {customClass}"
    {title}
>
    {#if CustomIcon}
        <CustomIcon size={iconSizeMap[size]} />
    {:else if variant === 'protected'}
        <Lock size={iconSizeMap[size]} />
    {:else if variant === 'conflict'}
        <AlertTriangle size={iconSizeMap[size]} />
    {:else if variant === 'skip'}
        <Ban size={iconSizeMap[size]} />
    {/if}

    {#if children}
        {@render children()}
    {:else if text}
        <span class="truncate">{text}</span>
    {:else if variant === 'protected'}
        <span>保護中</span>
    {:else if variant === 'recording'}
        <span>● 録画中</span>
    {:else if variant === 'conflict'}
        <span>競合</span>
    {:else if variant === 'skip'}
        <span>スキップ</span>
    {:else if variant === 'overlap'}
        <span>重複</span>
    {/if}
</span>
