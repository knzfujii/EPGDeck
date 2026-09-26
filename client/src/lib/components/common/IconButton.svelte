<script lang="ts">
    import type { HTMLButtonAttributes, HTMLAnchorAttributes } from 'svelte/elements';
    import type { Snippet } from 'svelte';

    export type IconButtonVariant = 'secondary' | 'ghost' | 'danger-outline' | 'danger' | 'primary';
    export type IconButtonSize = 'sm' | 'compact' | 'md';

    type BaseProps = {
        variant?: IconButtonVariant;
        size?: IconButtonSize;
        href?: string;
        children?: Snippet;
        onclick?: (event: MouseEvent) => void;
    };

    type Props = BaseProps &
        (
            | ({ href: string } & Omit<HTMLAnchorAttributes, 'onclick' | 'size'>)
            | ({ href?: undefined } & Omit<HTMLButtonAttributes, 'onclick' | 'size'>)
        );

    let { variant = 'secondary', size = 'md', href, class: className = '', children, ...restProps }: Props = $props();

    // 共通ベーススタイル（正方形・パディングゼロ・センタリング）
    const baseClasses =
        'inline-flex items-center justify-center p-0 transition-all duration-150 cursor-pointer select-none disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-blue-500 shrink-0';

    // バリアント別スタイル
    const variantClasses: Record<IconButtonVariant, string> = {
        secondary:
            'border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-slate-100',
        ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
        'danger-outline':
            'border border-rose-200 bg-white text-rose-600 shadow-xs hover:border-rose-400 hover:bg-rose-50 hover:text-rose-700 active:bg-rose-100 dark:border-rose-900/60 dark:bg-slate-800/80 dark:text-rose-400 dark:hover:border-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300',
        danger: 'bg-rose-600 text-white shadow-xs hover:bg-rose-700 active:bg-rose-800 dark:bg-rose-600 dark:hover:bg-rose-500',
        primary:
            'bg-blue-600 text-white shadow-xs hover:bg-blue-700 active:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500',
    };

    // サイズ別スタイル（32px / 36px / 40px 正方形）
    const sizeClasses: Record<IconButtonSize, string> = {
        sm: 'w-8 h-8 min-w-8 min-h-8 rounded-lg',
        compact: 'w-9 h-9 min-w-9 min-h-9 rounded-xl',
        md: 'w-10 h-10 min-w-10 min-h-10 rounded-xl',
    };

    const combinedClasses = $derived(
        `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim(),
    );
</script>

{#if href}
    <a {href} class={combinedClasses} {...restProps as HTMLAnchorAttributes}>
        {@render children?.()}
    </a>
{:else}
    <button
        type={(restProps as HTMLButtonAttributes).type ?? 'button'}
        class={combinedClasses}
        {...restProps as HTMLButtonAttributes}
    >
        {@render children?.()}
    </button>
{/if}
