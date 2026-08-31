<script lang="ts">
    import { router } from '../lib/router.svelte';
    import { FileQuestion, Home, ArrowLeft } from '@lucide/svelte';
</script>

<div class="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
    <div class="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-inner dark:bg-slate-800 dark:text-blue-400">
        <FileQuestion size={40} />
    </div>

    <h1 class="mt-6 text-2xl font-black text-slate-900 dark:text-slate-100">
        404 - ページが見つかりません
    </h1>
    <p class="mt-2 max-w-md text-xs text-slate-500 dark:text-slate-400">
        アクセスしようとしたページ（<code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300">{router.pathname}</code>）は削除されたか、URLが変更された可能性があります。
    </p>

    <div class="mt-6 flex items-center gap-3">
        <button
            type="button"
            onclick={() => window.history.back()}
            class="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
        >
            <ArrowLeft size={14} /> 前の画面に戻る
        </button>
        <button
            type="button"
            onclick={() => router.push('/')}
            class="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 cursor-pointer"
        >
            <Home size={14} /> ダッシュボードへ
        </button>
    </div>
</div>
