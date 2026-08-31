/**
 * Drizzle ORM の SQLite / MySQL 方言差を吸収する共通ヘルパー
 */
export namespace DrizzleHelper {
    /**
     * INSERT 実行結果から auto-increment 生成された ID を取得する
     */
    export const getInsertId = (clientType: 'sqlite' | 'mysql', result: any): number => {
        if (clientType === 'sqlite') {
            return Number(result.lastInsertRowid);
        }
        if (Array.isArray(result)) {
            return Number(result[0]?.insertId);
        }
        return Number(result.insertId);
    };
}
