<script lang="ts">
    import { snackbar } from '../../stores/snackbar.svelte';
    import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from '@lucide/svelte';

    const icons = {
        success: CheckCircle2,
        error: AlertCircle,
        warning: AlertTriangle,
        info: Info,
    };

    const colorClasses = {
        success: 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-950/20',
        error: 'bg-rose-600 text-white border-rose-500 shadow-rose-950/20',
        warning: 'bg-amber-600 text-white border-amber-500 shadow-amber-950/20',
        info: 'bg-slate-900 text-white border-slate-800 shadow-slate-950/40 dark:bg-slate-800 dark:border-slate-700',
    };
</script>

{#if snackbar.isOpen}
    {@const Icon = icons[snackbar.color] || Info}
    <div
        class="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl transition-all duration-300 transform translate-y-0 text-sm font-medium animate-in fade-in slide-in-from-bottom-5 {colorClasses[snackbar.color]}"
        role="alert"
    >
        <Icon class="w-5 h-5 shrink-0" />
        <span class="leading-normal">{snackbar.text}</span>
        <button
            type="button"
            onclick={() => snackbar.close()}
            class="p-1 -mr-1 rounded-lg hover:bg-white/20 transition-colors cursor-pointer text-white/80 hover:text-white"
            title="閉じる"
        >
            <X class="w-4 h-4" />
        </button>
    </div>
{/if}
