<script lang="ts">
    import { onMount } from 'svelte';
    import { router } from '../lib/router.svelte';
    import { snackbar } from '../lib/stores/snackbar.svelte';
    import { channelStore } from '../lib/stores/channels.svelte';
    import axios from 'axios';
    import {
        SlidersHorizontal,
        Plus,
        Trash2,
        Folder,
        CheckCircle2,
        Edit3,
        Search,
        HardDrive,
        Sparkles,
        Power,
        Layers,
        AlertCircle,
        Tv
    } from '@lucide/svelte';

    let rules = $state<any[]>([]);
    let total = $state(0);
    let isLoading = $state(true);
    let ruleReservesMap = $state<Record<number, number>>({});

    async function fetchRules() {
        isLoading = true;
        try {
            await channelStore.fetch();
            const [rulesRes, reservesRes] = await Promise.all([
                axios.get('/api/rules?limit=100&isHalfWidth=true'),
                axios.get('/api/reserves?limit=1000&isHalfWidth=true').catch(() => ({ data: { reserves: [] } }))
            ]);

            rules = rulesRes.data.rules || [];
            total = rulesRes.data.total || 0;

            // ルールIDごとの予約数を集計
            const counts: Record<number, number> = {};
            for (const res of (reservesRes.data?.reserves || [])) {
                if (res.ruleId) {
                    counts[res.ruleId] = (counts[res.ruleId] || 0) + 1;
                }
            }
            ruleReservesMap = counts;
        } catch (e) {
            console.error('Fetch rules error', e);
            snackbar.open({ text: 'ルール一覧の取得に失敗しました', color: 'error' });
        } finally {
            isLoading = false;
        }
    }

    onMount(() => {
        fetchRules();
    });

    // 新規作成ページへ遷移
    function goCreateRule() {
        router.push('/rule/edit');
    }

    // 編集ページへ遷移
    function goEditRule(rule: any) {
        router.push(`/rule/edit?id=${rule.id}`);
    }

    // 有効 / 無効トグル
    async function toggleRuleEnable(rule: any, event: Event) {
        event.stopPropagation();
        const isEnable = !rule.reserveOption?.enable;
        try {
            if (isEnable) {
                await axios.put(`/api/rules/${rule.id}/enable`);
            } else {
                await axios.put(`/api/rules/${rule.id}/disable`);
            }
            rule.reserveOption.enable = isEnable;
            snackbar.open({ text: `ルールを${isEnable ? '有効' : '無効'}にしました`, color: 'success' });
        } catch (e) {
            console.error('Toggle rule error', e);
            snackbar.open({ text: 'ルールの更新に失敗しました', color: 'error' });
        }
    }

    // ルール削除
    async function deleteRule(rule: any, event: Event) {
        event.stopPropagation();
        const kw = rule.searchOption?.keyword || `#${rule.id}`;
        if (!confirm(`ルール「${kw}」を削除しますか？`)) return;

        try {
            await axios.delete(`/api/rules/${rule.id}`);
            snackbar.open({ text: 'ルールを削除しました', color: 'success' });
            fetchRules();
        } catch (e) {
            console.error('Delete rule error', e);
            snackbar.open({ text: 'ルールの削除に失敗しました', color: 'error' });
        }
    }

    function getGenreName(genreId?: number): string {
        switch (genreId) {
            case 0: return 'ニュース';
            case 1: return 'スポーツ';
            case 2: return '情報';
            case 3: return 'ドラマ';
            case 4: return '音楽';
            case 5: return 'バラエティ';
            case 6: return '映画';
            case 7: return 'アニメ';
            default: return 'すべて';
        }
    }
</script>

<div class="space-y-5 w-full max-w-full min-w-0">
    <!-- ヘッダーツールバー -->
    <div class="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div>
            <h1 class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                <SlidersHorizontal size={20} class="text-blue-600 dark:text-blue-400" />
                自動録画ルール管理
            </h1>
            <p class="text-xs text-slate-500 dark:text-slate-400">登録済みルール: <span class="font-bold text-slate-800 dark:text-slate-200">{total}</span> 件</p>
        </div>

        <button
            type="button"
            onclick={goCreateRule}
            class="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 hover:shadow-md cursor-pointer"
        >
            <Plus size={16} /> 新規ルール作成
        </button>
    </div>

    <!-- ルール一覧テーブル -->
    {#if isLoading}
        <div class="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <p class="text-sm font-medium text-slate-400">ルール一覧を取得中...</p>
        </div>
    {:else if rules.length === 0}
        <div class="flex h-64 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
            <SlidersHorizontal size={36} class="text-slate-300 dark:text-slate-600" />
            <p class="mt-2 text-sm font-bold text-slate-700 dark:text-slate-300">登録されたルールはありません</p>
            <button
                type="button"
                onclick={goCreateRule}
                class="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
            >
                最初のルールを作成する
            </button>
        </div>
    {:else}
        <div class="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead class="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                        <tr>
                            <th class="px-4 py-3.5 text-center w-16">状態</th>
                            <th class="px-4 py-3.5">検索キーワード / 条件</th>
                            <th class="px-4 py-3.5">対象局 / ジャンル</th>
                            <th class="px-4 py-3.5">保存先ストレージ / フォルダ</th>
                            <th class="px-4 py-3.5">エンコード</th>
                            <th class="px-4 py-3.5 text-center">予約数</th>
                            <th class="px-4 py-3.5 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                        {#each rules as r}
                            {@const isEnabled = r.reserveOption?.enable !== false}
                            {@const opt = r.searchOption || {}}
                            {@const save = r.saveOption || {}}
                            {@const enc = r.encodeOption || {}}
                            <tr
                                onclick={() => goEditRule(r)}
                                class="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer {isEnabled ? '' : 'opacity-60 bg-slate-50/50 dark:bg-slate-900/40'}"
                            >
                                <!-- 有効/無効スイッチ -->
                                <td class="px-4 py-3.5 text-center">
                                    <button
                                        type="button"
                                        onclick={(e) => toggleRuleEnable(r, e)}
                                        class="inline-flex items-center justify-center rounded-full p-1.5 transition {isEnabled
                                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                                            : 'bg-slate-200 text-slate-500 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400'}"
                                        title={isEnabled ? 'クリックして無効化' : 'クリックして有効化'}
                                    >
                                        <Power size={14} />
                                    </button>
                                </td>

                                <!-- キーワード / 検索条件 -->
                                <td class="px-4 py-3.5">
                                    <div class="flex items-center gap-1.5 flex-wrap">
                                        <span class="font-bold text-slate-900 dark:text-slate-100 text-sm">
                                            {opt.keyword || '(全番組)'}
                                        </span>
                                        {#if opt.keyRegExp}
                                            <span class="rounded bg-purple-100 px-1.5 py-0.2 text-[10px] font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                                                正規表現
                                            </span>
                                        {/if}
                                        {#if opt.keyCS}
                                            <span class="rounded bg-blue-100 px-1.5 py-0.2 text-[10px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                                大小区別
                                            </span>
                                        {/if}
                                    </div>

                                    {#if opt.ignoreKeyword}
                                        <p class="mt-0.5 text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1">
                                            除外: {opt.ignoreKeyword}
                                        </p>
                                    {/if}

                                    <div class="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                                        <span>対象:</span>
                                        {#if opt.name !== false}<span class="rounded bg-slate-100 px-1 dark:bg-slate-800">名</span>{/if}
                                        {#if opt.description !== false}<span class="rounded bg-slate-100 px-1 dark:bg-slate-800">概</span>{/if}
                                        {#if opt.extended}<span class="rounded bg-slate-100 px-1 dark:bg-slate-800">詳</span>{/if}
                                    </div>
                                </td>

                                <!-- 対象局 / ジャンル -->
                                <td class="px-4 py-3.5">
                                    {#if opt.channelIds && opt.channelIds.length > 0}
                                        <div class="flex items-center gap-1 flex-wrap">
                                            <span class="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 flex items-center gap-1">
                                                <Tv size={10} />
                                                {channelStore.getChannelName(opt.channelIds[0])}
                                                {#if opt.channelIds.length > 1}
                                                    <span class="text-[9px] font-normal opacity-80">(他{opt.channelIds.length - 1}局)</span>
                                                {/if}
                                            </span>
                                        </div>
                                    {:else}
                                        <div class="flex items-center gap-1 flex-wrap">
                                            {#if opt.GR !== false}<span class="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">地デジ</span>{/if}
                                            {#if opt.BS !== false}<span class="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-950 dark:text-teal-300">BS</span>{/if}
                                            {#if opt.CS !== false}<span class="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">CS</span>{/if}
                                        </div>
                                    {/if}
                                    <p class="mt-1 text-slate-600 dark:text-slate-400 font-medium">
                                        {getGenreName(opt.genres?.[0]?.lv1 ?? opt.genres?.[0]?.genre)}
                                    </p>
                                </td>

                                <!-- 保存先ストレージ / ディレクトリ -->
                                <td class="px-4 py-3.5">
                                    <div class="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                                        <HardDrive size={13} class="text-slate-400 shrink-0" />
                                        <span class="font-bold">{save.parentDirectoryName || 'デフォルト'}</span>
                                    </div>
                                    {#if save.directory}
                                        <p class="mt-0.5 text-[11px] text-slate-400 flex items-center gap-1 truncate max-w-xs">
                                            <Folder size={11} /> {save.directory}
                                        </p>
                                    {/if}
                                </td>

                                <!-- エンコード設定 -->
                                <td class="px-4 py-3.5">
                                    {#if enc.mode1 || enc.mode2 || enc.mode3}
                                        <div class="flex items-center gap-1 flex-wrap">
                                            {#if enc.mode1}
                                                <span class="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                                    {enc.mode1}
                                                </span>
                                            {/if}
                                            {#if enc.mode2}
                                                <span class="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                                    {enc.mode2}
                                                </span>
                                            {/if}
                                            {#if enc.isDeleteOriginalAfterEncode}
                                                <span class="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 dark:bg-rose-950 dark:text-rose-400">
                                                    TS削除
                                                </span>
                                            {/if}
                                        </div>
                                    {:else}
                                        <span class="text-slate-400 text-[11px]">TSのみ</span>
                                    {/if}
                                </td>

                                <!-- 予約数 -->
                                <td class="px-4 py-3.5 text-center font-bold">
                                    {#if (ruleReservesMap[r.id] || 0) > 0}
                                        <span class="inline-flex items-center justify-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                            {ruleReservesMap[r.id]} 件
                                        </span>
                                    {:else}
                                        <span class="text-xs text-slate-400 font-medium">0 件</span>
                                    {/if}
                                </td>

                                <!-- 操作ボタン -->
                                <td class="px-4 py-3.5 text-right">
                                    <div class="flex items-center justify-end gap-1.5">
                                        <!-- 検索リンク -->
                                        <button
                                            type="button"
                                            onclick={(e) => {
                                                e.stopPropagation();
                                                router.push(`/search?keyword=${encodeURIComponent(opt.keyword || '')}`);
                                            }}
                                            class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"
                                            title="この条件で番組検索"
                                        >
                                            <Search size={14} />
                                        </button>

                                        <!-- 編集ボタン -->
                                        <button
                                            type="button"
                                            onclick={(e) => { e.stopPropagation(); goEditRule(r); }}
                                            class="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-blue-600 shadow-2xs hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400"
                                            title="ルールを編集"
                                        >
                                            <Edit3 size={13} /> 編集
                                        </button>

                                        <!-- 削除ボタン -->
                                        <button
                                            type="button"
                                            onclick={(e) => deleteRule(r, e)}
                                            class="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
                                            title="削除"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}
</div>
