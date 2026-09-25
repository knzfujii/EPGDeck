export const MAJOR_GENRES: Record<number, string> = {
    0x0: 'ニュース／報道',
    0x1: 'スポーツ',
    0x2: '情報／ワイドショー',
    0x3: 'ドラマ',
    0x4: '音楽',
    0x5: 'バラエティ',
    0x6: '映画',
    0x7: 'アニメ／特撮',
    0x8: 'ドキュメンタリー／教養',
    0x9: '劇場／公演',
    0xa: '趣味／教育',
    0xb: '福祉',
    0xf: 'その他',
};

export const MAJOR_GENRE_ITEMS = Object.entries(MAJOR_GENRES).map(([key, name]) => ({
    key: Number(key),
    name,
}));

export interface QuickGenreItem {
    id: number | null;
    name: string;
}

export const QUICK_GENRES: { id: number; name: string }[] = [
    { id: 7, name: 'アニメ' },
    { id: 6, name: '映画' },
    { id: 3, name: 'ドラマ' },
    { id: 0, name: 'ニュース' },
    { id: 5, name: 'バラエティ' },
    { id: 1, name: 'スポーツ' },
    { id: 4, name: '音楽' },
    { id: 2, name: '情報' },
];
