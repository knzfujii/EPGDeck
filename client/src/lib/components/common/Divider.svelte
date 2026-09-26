<script lang="ts">
    interface Props {
        orientation?: 'vertical' | 'horizontal';
        class?: string;
    }

    let { orientation = 'vertical', class: className = '' }: Props = $props();

    const orientationClasses = $derived(
        orientation === 'vertical'
            ? 'inline-block h-[1.375rem] w-px bg-slate-300 dark:bg-slate-600 mx-1.5 self-center shrink-0'
            : 'block h-px w-full bg-slate-200 dark:bg-slate-800 my-2 shrink-0',
    );
</script>

<div class="{orientationClasses} {className}" aria-hidden="true"></div>
