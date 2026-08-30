<script lang="ts">
    import { onMount, onDestroy, tick } from 'svelte';
    import axios from 'axios';
    import { socketStore, type LogEntry, type LogEntryLevel, type LogProcess, type LogCategory } from '../lib/stores/socket.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import {
        Terminal,
        Search,
        Download,
        Trash2,
        Copy,
        ArrowDown,
        RefreshCw,
        Check,
        Filter,
        Pause,
        Play
    } from '@lucide/svelte';
    let rawLogs = $state<LogEntry[]>([]);
    let isLoading = $state(true);
    let autoScroll = $state(true);
    let searchKeyword = $state('');
    let selectedLevel = $state<'all' | LogEntryLevel>('all');
    let selectedProcess = $state<'all' | LogProcess>('all');
    let selectedCategory = $state<'all' | LogCategory>('all');
    let isCopied = $state(false);

    let logContainer: HTMLDivElement | null = null;
    let unsubscribeSocket: (() => void) | null = null;

    const LEVEL_PRIORITY: Record<LogEntryLevel, number> = {
        debug: 1,
        info: 2,
        warn: 3,
        error: 4,
        fatal: 5,
    };

    // フィルタリングされたログ
    const filteredLogs = $derived.by(() => {
        return rawLogs.filter(log => {
            if (selectedLevel !== 'all') {
                const targetPriority = LEVEL_PRIORITY[selectedLevel];
                if ((LEVEL_PRIORITY[log.level] || 1) < targetPriority) {
                    return false;
                }
            }
            if (selectedProcess !== 'all' && log.process !== selectedProcess) {
                return false;
            }
            if (selectedCategory !== 'all' && log.category !== selectedCategory) {
                return false;
            }
            if (searchKeyword.trim()) {
                const q = searchKeyword.toLowerCase();
                const matchMsg = log.message.toLowerCase().includes(q);
                const matchProc = log.process.toLowerCase().includes(q);
                const matchCat = log.category.toLowerCase().includes(q);
                if (!matchMsg && !matchProc && !matchCat) {
                    return false;
                }
            }
            return true;
        });
    });

    // 過去ログ取得
    async function fetchLogs() {
        isLoading = true;
        try {
            const res = await axios.get('/api/logs?limit=1000');
            rawLogs = res.data.logs || [];
        } catch (e) {
            console.error('Failed to fetch logs:', e);
            snackbar.open({ text: 'ログの取得に失敗しました', color: 'error' });
        } finally {
            isLoading = false;
            await tick();
            requestAnimationFrame(() => {
                scrollToBottom(true);
            });
        }
    }

    function scrollToBottom(force = false) {
        if (!logContainer) return;
        if (autoScroll || force) {
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    }

    function handleScroll() {
        if (!logContainer) return;
        const { scrollTop, scrollHeight, clientHeight } = logContainer;
        // 末尾から 40px 以内なら自動スクロール有効
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 40;
        autoScroll = isNearBottom;
    }

    // 汎用クリップボードコピー関数（HTTPS / HTTP / IPアクセス完全対応）
    async function writeClipboardText(text: string): Promise<boolean> {
        let success = false;

        // 1. Clipboard API (navigator.clipboard) を試行
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
                await navigator.clipboard.writeText(text);
                success = true;
            } catch (e) {
                console.warn('navigator.clipboard failed, fallback to execCommand', e);
            }
        }

        // 2. HTTP / LAN IP アドレス環境用フォールバック (textarea + execCommand)
        if (!success) {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                textarea.style.top = '-9999px';
                textarea.setAttribute('readonly', '');
                document.body.appendChild(textarea);
                textarea.select();
                textarea.setSelectionRange(0, text.length);
                const successful = document.execCommand('copy');
                document.body.removeChild(textarea);
                if (successful) {
                    success = true;
                }
            } catch (e) {
                console.error('execCommand copy failed', e);
            }
        }

        return success;
    }

    // 表示中ログの一括コピー
    async function copyToClipboard() {
        if (filteredLogs.length === 0) {
            snackbar.open({ text: 'コピー対象のログがありません', color: 'info' });
            return;
        }

        const text = filteredLogs
            .map(l => `[${formatTime(l.timestamp)}] [${l.process}][${l.level.toUpperCase()}][${l.category}] ${l.message}`)
            .join('\n');

        const success = await writeClipboardText(text);
        if (success) {
            isCopied = true;
            snackbar.open({ text: `${filteredLogs.length} 件のログをコピーしました`, color: 'success' });
            setTimeout(() => {
                isCopied = false;
            }, 2000);
        } else {
            snackbar.open({ text: 'クリップボードへのコピーに失敗しました', color: 'error' });
        }
    }

    // 単一ログ行のコピー
    async function copySingleLog(log: LogEntry) {
        const text = `[${formatTime(log.timestamp)}] [${log.process}][${log.level.toUpperCase()}][${log.category}] ${log.message}`;
        const success = await writeClipboardText(text);
        if (success) {
            snackbar.open({ text: '1行コピーしました', color: 'success' });
        } else {
            snackbar.open({ text: 'コピーに失敗しました', color: 'error' });
        }
    }

    // ログファイルダウンロード
    function downloadLogFile() {
        window.open('/api/logs/download', '_blank');
    }

    // 画面上の一時クリア
    function clearScreen() {
        rawLogs = [];
        snackbar.open({ text: '画面上のログを消去しました', color: 'info' });
    }

    function formatTime(timestamp: number): string {
        const d = new Date(timestamp);
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        const s = String(d.getSeconds()).padStart(2, '0');
        const ms = String(d.getMilliseconds()).padStart(3, '0');
        return `${h}:${m}:${s}.${ms}`;
    }

    onMount(() => {
        fetchLogs();

        // リアルタイムログ受信リスナー
        unsubscribeSocket = socketStore.on('logs', (entry: LogEntry) => {
            rawLogs = [...rawLogs, entry];
            // メモリ肥大化防止（最新 2000 件保持）
            if (rawLogs.length > 2000) {
                rawLogs = rawLogs.slice(rawLogs.length - 2000);
            }
            if (autoScroll) {
                tick().then(() => scrollToBottom());
            }
        });
    });

    onDestroy(() => {
        unsubscribeSocket?.();
    });
</script>

<div class="space-y-4">
    <!-- ヘッダーエリア -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div class="flex items-center gap-2">
            <div class="p-2 rounded-lg bg-blue-500/10 text-blue-500 dark:bg-blue-400/10 dark:text-blue-400">
                <Terminal class="w-6 h-6" />
            </div>
            <div>
                <h1 class="text-xl font-bold tracking-tight">システムログ</h1>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                    リアルタイムログストリーミング・ログ確認
                    {#if socketStore.isConnected}
                        <span class="inline-flex items-center gap-1 text-emerald-500 ml-2">
                            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Live
                        </span>
                    {:else}
                        <span class="inline-flex items-center gap-1 text-amber-500 ml-2">
                            <span class="w-2 h-2 rounded-full bg-amber-500"></span>
                            Offline
                        </span>
                    {/if}
                </p>
            </div>
        </div>

        <!-- ツールボタン -->
        <div class="flex items-center gap-2 flex-wrap">
            <!-- 自動スクロールトグル -->
            <button
                type="button"
                class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors {autoScroll
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-white text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'}"
                onclick={() => {
                    autoScroll = !autoScroll;
                    if (autoScroll) scrollToBottom(true);
                }}
                title={autoScroll ? '自動スクロールON (最新ログに追尾中)' : '自動スクロールOFF'}
            >
                {#if autoScroll}
                    <Pause class="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                    <span>追尾中 (tail -f)</span>
                {:else}
                    <Play class="w-3.5 h-3.5" />
                    <span>追尾停止中</span>
                {/if}
            </button>

            <!-- 再取得 -->
            <button
                type="button"
                class="p-2 text-slate-600 hover:text-slate-900 bg-white dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                onclick={fetchLogs}
                title="ログを再取得"
                disabled={isLoading}
            >
                <RefreshCw class="w-4 h-4 {isLoading ? 'animate-spin' : ''}" />
            </button>

            <!-- コピー -->
            <button
                type="button"
                class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                onclick={copyToClipboard}
                title="表示中のログをコピー"
            >
                {#if isCopied}
                    <Check class="w-3.5 h-3.5 text-emerald-500" />
                    <span>コピー完了</span>
                {:else}
                    <Copy class="w-3.5 h-3.5" />
                    <span>コピー</span>
                {/if}
            </button>

            <!-- ファイルダウンロード -->
            <button
                type="button"
                class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                onclick={downloadLogFile}
                title="ログファイル全体をダウンロード"
            >
                <Download class="w-3.5 h-3.5" />
                <span>ログ保存</span>
            </button>

            <!-- 画面クリア -->
            <button
                type="button"
                class="p-2 text-rose-600 hover:text-rose-700 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                onclick={clearScreen}
                title="画面上のログを消去"
            >
                <Trash2 class="w-4 h-4" />
            </button>
        </div>
    </div>

    <!-- フィルタ・検索バー -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <!-- キーワード検索 -->
        <div class="relative">
            <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
                type="text"
                placeholder="ログを検索..."
                bind:value={searchKeyword}
                class="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 placeholder:text-slate-400"
            />
        </div>

        <!-- ログレベル -->
        <div class="flex items-center gap-1.5 text-xs">
            <span class="text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap">Level:</span>
            <select
                bind:value={selectedLevel}
                class="flex-1 py-1.5 px-2.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400"
            >
                <option value="all">すべて (All)</option>
                <option value="debug">DEBUG 以上</option>
                <option value="info">INFO 以上</option>
                <option value="warn">WARN 以上</option>
                <option value="error">ERROR / FATAL</option>
            </select>
        </div>

        <!-- プロセス -->
        <div class="flex items-center gap-1.5 text-xs">
            <span class="text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap">Process:</span>
            <select
                bind:value={selectedProcess}
                class="flex-1 py-1.5 px-2.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400"
            >
                <option value="all">全プロセス (All)</option>
                <option value="Operator">Operator</option>
                <option value="Service">Service</option>
                <option value="EPGUpdater">EPGUpdater</option>
            </select>
        </div>

        <!-- カテゴリ -->
        <div class="flex items-center gap-1.5 text-xs">
            <span class="text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap">Category:</span>
            <select
                bind:value={selectedCategory}
                class="flex-1 py-1.5 px-2.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400"
            >
                <option value="all">全カテゴリ (All)</option>
                <option value="system">system</option>
                <option value="access">access</option>
                <option value="stream">stream</option>
                <option value="encode">encode</option>
            </select>
        </div>
    </div>

    <!-- ログコンソールエリア -->
    <div class="relative rounded-xl border border-slate-800 bg-slate-950 shadow-xl overflow-hidden font-mono text-xs text-slate-200">
        <!-- 上部ステータスバー -->
        <div class="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-800/80 text-[11px] text-slate-400">
            <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                <span class="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                <span class="ml-2 text-slate-300 font-semibold">Console Output</span>
            </div>
            <div class="flex items-center gap-3">
                <span>表示件数: {filteredLogs.length} / 全体: {rawLogs.length}</span>
            </div>
        </div>

        <!-- ログリスト -->
        <div
            bind:this={logContainer}
            onscroll={handleScroll}
            class="h-[600px] overflow-y-auto p-3 sm:p-4 space-y-1 select-text scroll-smooth"
        >
            {#if isLoading}
                <div class="flex items-center justify-center h-full text-slate-500">
                    <RefreshCw class="w-6 h-6 animate-spin mr-2" />
                    <span>ログを読み込み中...</span>
                </div>
            {:else if filteredLogs.length === 0}
                <div class="flex flex-col items-center justify-center h-full text-slate-500">
                    <Terminal class="w-10 h-10 mb-2 opacity-40" />
                    <span>表示するログがありません</span>
                </div>
            {:else}
                {#each filteredLogs as log, i (`${log.process}-${log.id}-${log.timestamp}-${i}`)}
                    <div class="group flex items-start gap-2 py-0.5 px-1.5 rounded hover:bg-slate-900/70 transition-colors leading-relaxed break-all font-mono {log.level === 'error' || log.level === 'fatal' ? 'bg-rose-950/20 text-rose-300 border-l-2 border-rose-500 pl-2' : log.level === 'warn' ? 'bg-amber-950/20 text-amber-200 border-l-2 border-amber-500 pl-2' : ''}">
                        <!-- タイムスタンプ -->
                        <span class="text-slate-500 shrink-0 select-none text-[11px]">
                            {formatTime(log.timestamp)}
                        </span>

                        <!-- プロセスバッジ -->
                        <span class="shrink-0 text-[10px] font-semibold px-1.5 py-0.2 rounded border {log.process === 'Operator' ? 'bg-cyan-950/60 text-cyan-400 border-cyan-800/60' : log.process === 'Service' ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60' : 'bg-purple-950/60 text-purple-400 border-purple-800/60'}">
                            {log.process}
                        </span>

                        <!-- レベルバッジ -->
                        <span class="shrink-0 text-[10px] font-bold px-1.5 py-0.2 rounded {log.level === 'fatal' ? 'bg-rose-600 text-white' : log.level === 'error' ? 'bg-rose-950 text-rose-400' : log.level === 'warn' ? 'bg-amber-950 text-amber-300' : log.level === 'debug' ? 'bg-slate-800 text-slate-400' : 'bg-blue-950 text-blue-400'}">
                            {log.level.toUpperCase()}
                        </span>

                        <!-- カテゴリ -->
                        <span class="text-slate-400 shrink-0 text-[11px]">
                            [{log.category}]
                        </span>

                        <!-- メッセージ -->
                        <span class="flex-1 whitespace-pre-wrap {log.level === 'error' || log.level === 'fatal' ? 'text-rose-300 font-medium' : log.level === 'warn' ? 'text-amber-200 font-medium' : log.level === 'debug' ? 'text-slate-400' : 'text-slate-200'}">
                            {log.message}
                        </span>

                        <!-- ホバー時行コピーボタン -->
                        <button
                            type="button"
                            class="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-opacity cursor-pointer shrink-0"
                            onclick={() => copySingleLog(log)}
                            title="この行をコピー"
                        >
                            <Copy class="w-3 h-3" />
                        </button>
                    </div>
                {/each}
            {/if}
        </div>

        <!-- 下部スクロールボタン（自動追従がOFFのとき） -->
        {#if !autoScroll && filteredLogs.length > 0}
            <button
                type="button"
                class="absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/50 transition-transform active:scale-95"
                onclick={() => {
                    autoScroll = true;
                    scrollToBottom(true);
                }}
            >
                <ArrowDown class="w-3.5 h-3.5" />
                <span>最新ログへスクロール</span>
            </button>
        {/if}
    </div>
</div>
