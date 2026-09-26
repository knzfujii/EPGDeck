<script lang="ts">
    import { router } from '../../router.svelte';
    import { Lock } from '@lucide/svelte';
    import Button from './Button.svelte';

    interface Props {
        title?: string;
        description?: string;
        returnPath?: string;
        returnText?: string;
    }

    let {
        title = '閲覧専用モード',
        description = 'この機能の利用は管理者のみ許可されています。',
        returnPath = '/recorded',
        returnText = '録画一覧へ',
    }: Props = $props();
</script>

<div
    class="flex flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50/50 p-6 sm:p-8 text-center dark:border-amber-950/60 dark:bg-amber-950/20 my-4"
>
    <div
        class="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 mb-3"
    >
        <Lock size={24} />
    </div>
    <h3 class="text-base font-bold text-slate-800 dark:text-slate-200">{title}</h3>
    <p class="mt-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md">
        {description}
    </p>
    <Button variant="secondary" onclick={() => router.replace(returnPath)} class="mt-5">
        {returnText}
    </Button>
</div>
