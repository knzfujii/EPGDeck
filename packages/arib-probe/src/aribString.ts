import { TextDecoder } from 'node:util';

const ARIB_GAIJI_MAP: Record<number, string> = {
    0x7a50: '[解]',
    0x7a51: '[手]',
    0x7a52: '[再]',
    0x7a53: '[新]',
    0x7a54: '[終]',
    0x7a55: '[初]',
    0x7a56: '[字]',
    0x7a57: '[双]',
    0x7a58: '[多]',
    0x7a59: '[デ]',
    0x7a5a: '[二]',
    0x7a5b: '[生]',
    0x7a5c: '[無]',
    0x7a5d: '[天]',
    0x7a5e: '[交]',
    0x7a5f: '[映]',
    0x7a60: '[特]',
    0x7a61: '[時]',
    0x7a62: '[後]',
    0x7a63: '[手]',
    0x7a64: '[吹]',
    0x7a65: '[ペ]',
    0x7a66: '[契]',
    0x7a67: '[前]',
    0x7a68: '[替]',
    0x7a69: '[有料]',
    0x7a6a: '[PV]',
    0x7a6b: '[プロ]',
    0x7a6c: '[劇]',
    0x7a6d: '[総]',
    0x7a6e: '[帯]',
    0x7a6f: '[HV]',
    0x7a70: '[4K]',
    0x7a71: '[8K]',
};

type CharSet = 'kanji' | 'alphanumeric' | 'hiragana' | 'katakana';

/**
 * Lightweight, zero-dependency ARIB STD-B24 8-unit charcode string decoder.
 * Uses Node.js native TextDecoder('euc-jp') for JIS X 0208 and kana conversion.
 */
export function decodeAribString(buf: Uint8Array): string {
    const eucDecoder = new TextDecoder('euc-jp');
    const out: string[] = [];

    // Default ARIB 8-unit character set mapping for SI / EIT descriptors (ARIB STD-B24 / STD-B10):
    // G0: 2-byte Kanji, G1: Alphanumeric, G2: Hiragana, G3: Katakana
    let g0: CharSet = 'kanji';
    let g1: CharSet = 'alphanumeric';
    let g2: CharSet = 'hiragana';
    let g3: CharSet = 'katakana';

    // Locking shifts: GL defaults to G0, GR defaults to G2
    let gl = 0; // index into [g0, g1, g2, g3]
    let gr = 2; // index into [g0, g1, g2, g3]

    let i = 0;
    while (i < buf.length) {
        const b = buf[i];

        // ESC sequence
        if (b === 0x1b) {
            i++;
            if (i >= buf.length) break;
            const b1 = buf[i];

            // Invocation
            if (b1 === 0x6e) {
                gl = 2;
                i++;
                continue;
            } // LS2
            if (b1 === 0x6f) {
                gl = 3;
                i++;
                continue;
            } // LS3
            if (b1 === 0x7e) {
                gr = 1;
                i++;
                continue;
            } // LS1R
            if (b1 === 0x7d) {
                gr = 2;
                i++;
                continue;
            } // LS2R
            if (b1 === 0x7c) {
                gr = 3;
                i++;
                continue;
            } // LS3R

            // 2-byte character set designation
            if (b1 === 0x24) {
                i++;
                if (i >= buf.length) break;
                let b2 = buf[i];
                if (b2 === 0x29) {
                    i++;
                    if (i >= buf.length) break;
                    b2 = buf[i];
                    g1 = get2ByteSet(b2);
                } else {
                    g0 = get2ByteSet(b2);
                }
                i++;
                continue;
            }

            // 1-byte character set designation: ESC ( [F], ESC ) [F], etc.
            if (b1 >= 0x28 && b1 <= 0x2b) {
                const target = b1 - 0x28; // 0=G0, 1=G1, 2=G2, 3=G3
                i++;
                if (i >= buf.length) break;
                const b2 = buf[i];
                const set = get1ByteSet(b2);
                if (target === 0) g0 = set;
                else if (target === 1) g1 = set;
                else if (target === 2) g2 = set;
                else if (target === 3) g3 = set;
                i++;
                continue;
            }

            i++;
            continue;
        }

        // Control characters
        if (b === 0x0f) {
            gl = 0;
            i++;
            continue;
        } // LS0
        if (b === 0x0e) {
            gl = 1;
            i++;
            continue;
        } // LS1

        // Space
        if (b === 0x20 || b === 0xa0) {
            out.push(' ');
            i++;
            continue;
        }

        // Other non-printable control characters
        if (b < 0x20) {
            i++;
            continue;
        }

        // GL area (0x21 - 0x7E)
        if (b >= 0x21 && b <= 0x7e) {
            const set = [g0, g1, g2, g3][gl];
            i += decodeChar(buf, i, set, b, false, out, eucDecoder);
            continue;
        }

        // GR area (0xA1 - 0xFE)
        if (b >= 0xa1 && b <= 0xfe) {
            const set = [g0, g1, g2, g3][gr];
            i += decodeChar(buf, i, set, b & 0x7f, true, out, eucDecoder);
            continue;
        }

        i++;
    }

    return out.join('');
}

function get2ByteSet(f: number): CharSet {
    if (f === 0x42 || f === 0x39 || f === 0x3b) return 'kanji';
    return 'kanji';
}

function get1ByteSet(f: number): CharSet {
    if (f === 0x4a || f === 0x42) return 'alphanumeric';
    if (f === 0x30) return 'hiragana';
    if (f === 0x31) return 'katakana';
    return 'alphanumeric';
}

function decodeChar(
    buf: Uint8Array,
    offset: number,
    set: CharSet,
    b7: number,
    _isGr: boolean,
    out: string[],
    eucDecoder: TextDecoder,
): number {
    if (set === 'kanji') {
        if (offset + 1 < buf.length) {
            const b2 = buf[offset + 1];
            const b2_7 = b2 & 0x7f;

            // Check ARIB gaiji (90-94 ku: 0x7a..0x7e)
            const gaijiKey = (b7 << 8) | b2_7;
            const gaiji = ARIB_GAIJI_MAP[gaijiKey];
            if (gaiji) {
                out.push(gaiji);
                return 2;
            }

            // Standard JIS X 0208 -> EUC-JP decode
            const euc1 = b7 | 0x80;
            const euc2 = b2_7 | 0x80;
            try {
                out.push(eucDecoder.decode(new Uint8Array([euc1, euc2])));
            } catch {
                out.push('?');
            }
            return 2;
        }
        return 1;
    }

    if (set === 'alphanumeric') {
        out.push(String.fromCharCode(b7));
        return 1;
    }

    if (set === 'hiragana') {
        // JIS Hiragana (0x21-0x73) -> EUC-JP (0xa4, b7 | 0x80)
        try {
            out.push(eucDecoder.decode(new Uint8Array([0xa4, b7 | 0x80])));
        } catch {
            out.push(String.fromCharCode(b7));
        }
        return 1;
    }

    if (set === 'katakana') {
        // JIS Katakana (0x21-0x76) -> EUC-JP (0xa5, b7 | 0x80)
        try {
            out.push(eucDecoder.decode(new Uint8Array([0xa5, b7 | 0x80])));
        } catch {
            out.push(String.fromCharCode(b7));
        }
        return 1;
    }

    out.push(String.fromCharCode(b7));
    return 1;
}
