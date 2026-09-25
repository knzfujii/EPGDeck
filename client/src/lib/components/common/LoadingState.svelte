<script lang="ts">
    interface Props {
        message?: string;
    }

    let { message = '読み込み中...' }: Props = $props();
</script>

<div
    class="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
>
    <p class="text-sm font-medium text-slate-400">{message}</p>
</div>
