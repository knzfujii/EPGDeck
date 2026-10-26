import { describe, it, expect } from 'vitest';

describe('HeaderSearch Logic Tests', () => {
    describe('Search target generation and routing', () => {
        function getAvailableTargets(query: string, canViewSearch: boolean) {
            const trimmed = query.trim();
            const targets = [];

            // 1. 録画一覧から検索（最上位）
            targets.push({
                id: 'recorded',
                title: '録画一覧から検索',
                subText: '録画済みライブラリ',
                path: `/recorded?keyword=${encodeURIComponent(trimmed)}`,
            });

            // 2. 番組表から検索
            if (canViewSearch) {
                targets.push({
                    id: 'program',
                    title: '番組表から検索',
                    subText: 'これからの放送・予約',
                    path: `/search?keyword=${encodeURIComponent(trimmed)}`,
                });
            }

            return targets;
        }

        it('generates both recorded and program targets in order when canViewSearch is true', () => {
            const targets = getAvailableTargets('新幹線', true);
            expect(targets).toHaveLength(2);
            expect(targets[0].id).toBe('recorded');
            expect(targets[0].title).toBe('録画一覧から検索');
            expect(targets[0].path).toBe('/recorded?keyword=%E6%96%B0%E5%B9%B9%E7%B7%9A');

            expect(targets[1].id).toBe('program');
            expect(targets[1].title).toBe('番組表から検索');
            expect(targets[1].path).toBe('/search?keyword=%E6%96%B0%E5%B9%B9%E7%B7%9A');
        });

        it('omits program search target when canViewSearch is false (read-only mode)', () => {
            const targets = getAvailableTargets('アニメ', false);
            expect(targets).toHaveLength(1);
            expect(targets[0].id).toBe('recorded');
            expect(targets[0].title).toBe('録画一覧から検索');
            expect(targets[0].path).toBe('/recorded?keyword=%E3%82%A2%E3%83%8B%E3%83%A1');
        });

        it('properly encodes special URI characters in keyword', () => {
            const targets = getAvailableTargets('C++ & Python', true);
            expect(targets[0].path).toBe('/recorded?keyword=C%2B%2B%20%26%20Python');
            expect(targets[1].path).toBe('/search?keyword=C%2B%2B%20%26%20Python');
        });
    });

    describe('Context-aware default selection', () => {
        function getDefaultIndex(currentPath: string, targets: Array<{ id: string }>) {
            const isProgram = currentPath.startsWith('/guide') || currentPath.startsWith('/search');
            if (isProgram) {
                const programIdx = targets.findIndex(t => t.id === 'program');
                return programIdx >= 0 ? programIdx : 0;
            }
            return 0; // デフォルトは最上位の録画一覧
        }

        it('defaults to program search when on /guide or /search', () => {
            const targets = [{ id: 'recorded' }, { id: 'program' }];
            expect(getDefaultIndex('/guide', targets)).toBe(1);
            expect(getDefaultIndex('/search', targets)).toBe(1);
        });

        it('defaults to recorded search (top item) when on dashboard, recorded, or reserves', () => {
            const targets = [{ id: 'recorded' }, { id: 'program' }];
            expect(getDefaultIndex('/', targets)).toBe(0);
            expect(getDefaultIndex('/recorded', targets)).toBe(0);
            expect(getDefaultIndex('/recorded/detail', targets)).toBe(0);
            expect(getDefaultIndex('/reserves', targets)).toBe(0);
        });
    });

    describe('Keyboard shortcut filtering', () => {
        function shouldTriggerShortcut(key: string, isCtrlOrMeta: boolean, tagName: string, isEditable: boolean) {
            const isFormElement = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || isEditable;

            if (isCtrlOrMeta && key.toLowerCase() === 'k') {
                return true;
            }

            if (key === '/' && !isFormElement) {
                return true;
            }

            return false;
        }

        it('triggers search with "/" when not in a form element', () => {
            expect(shouldTriggerShortcut('/', false, 'BODY', false)).toBe(true);
            expect(shouldTriggerShortcut('/', false, 'DIV', false)).toBe(true);
        });

        it('ignores "/" when focused inside input, textarea, or contentEditable', () => {
            expect(shouldTriggerShortcut('/', false, 'INPUT', false)).toBe(false);
            expect(shouldTriggerShortcut('/', false, 'TEXTAREA', false)).toBe(false);
            expect(shouldTriggerShortcut('/', false, 'DIV', true)).toBe(false);
        });

        it('triggers search with Ctrl+K or Cmd+K even inside form elements', () => {
            expect(shouldTriggerShortcut('k', true, 'INPUT', false)).toBe(true);
            expect(shouldTriggerShortcut('K', true, 'BODY', false)).toBe(true);
        });
    });
});
