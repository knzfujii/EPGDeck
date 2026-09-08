import * as crypto from 'crypto';

const TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class AuthManager {
    /**
     * トークンを生成する
     * @param password 署名キーとして使用するパスワード
     */
    public static generateToken(password: string): string {
        const timestamp = Date.now().toString();
        const signature = this.createSignature(timestamp, password);
        return `${timestamp}.${signature}`;
    }

    /**
     * トークンを検証する
     * @param token 検証対象のトークン
     * @param password 正しいパスワード
     */
    public static verifyToken(token: string, password?: string): boolean {
        if (!token || !password) {
            return false;
        }

        const parts = token.split('.');
        if (parts.length !== 2) {
            return false;
        }

        const [timestampStr, signature] = parts;
        const timestamp = parseInt(timestampStr, 10);
        if (isNaN(timestamp)) {
            return false;
        }

        // 有効期限の確認
        if (Date.now() - timestamp > TOKEN_EXPIRY_MS || timestamp > Date.now() + 60000) {
            return false;
        }

        // 署名の確認 (タイミング攻撃耐性のある timingSafeEqual を使用)
        const expectedSignature = this.createSignature(timestampStr, password);
        try {
            const bufA = Buffer.from(signature, 'hex');
            const bufB = Buffer.from(expectedSignature, 'hex');
            if (bufA.length !== bufB.length) {
                return false;
            }
            return crypto.timingSafeEqual(bufA, bufB);
        } catch {
            return false;
        }
    }

    private static createSignature(data: string, secret: string): string {
        return crypto.createHmac('sha256', secret).update(data).digest('hex');
    }
}
