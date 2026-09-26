<script lang="ts">
    import type { HTMLButtonAttributes, HTMLAnchorAttributes } from 'svelte/elements';
    import type { Snippet } from 'svelte';

    export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-outline' | 'ghost';
    export type ButtonSize = 'sm' | 'compact' | 'md';

    type BaseProps = {
        variant?: ButtonVariant;
        size?: ButtonSize;
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

    // 共通ベーススタイル
    const baseClasses =
        'inline-flex items-center justify-center gap-1.5 font-bold transition-all duration-150 cursor-pointer select-none disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-blue-500 shrink-0';

    // バリアント別スタイル
    const variantClasses: Record<ButtonVariant, string> = {
        primary:
            'bg-blue-600 text-white shadow-xs hover:bg-blue-700 active:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500',
        secondary:
            'border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-slate-100',
        danger: 'bg-rose-600 text-white shadow-xs hover:bg-rose-700 active:bg-rose-800 dark:bg-rose-600 dark:hover:bg-rose-500',
        'danger-outline':
            'border border-rose-200 bg-white text-rose-600 shadow-xs hover:border-rose-400 hover:bg-rose-50 hover:text-rose-700 active:bg-rose-100 dark:border-rose-900/60 dark:bg-slate-800/80 dark:text-rose-400 dark:hover:border-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300',
        ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
    };

    // サイズ別スタイル（高さ・パディング・フォント・角丸）
    const sizeClasses: Record<ButtonSize, string> = {
        sm: 'h-8 px-2.5 text-xs rounded-lg min-h-8',
        compact: 'h-9 px-3.5 text-sm rounded-xl min-h-9',
        md: 'h-10 px-4 text-sm rounded-xl min-h-10',
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
