import { TextDecoder } from 'node:util';

/**
 * ARIB STD-B24 Gaiji mapping for common TV program symbols (90-94 ku and symbols).
 */
const ARIB_GAIJI_MAP: Record<number, string> = {
    // 90 ku (0x7a): Enclosed program property symbols
    0x7a50: '[解]',
    0x7a51: '[手]',
    0x7a52: '[再]',
    0x7a53: '[新]',
    0x7a54: '[終]',
    0x7a55: '[初]',
    0x7a56: '[字]',
    0x7a57: '[双]',
    0x7a58: '[デ]',
    0x7a59: '[ペ]',
    0x7a5a: '[二]',
    0x7a5b: '[多]',
    0x7a5c: '[生]',
    0x7a5d: '[販]',
    0x7a5e: '[声]',
    0x7a5f: '[吹]',
    0x7a60: '[PPV]',
    0x7a61: '[教]',
    0x7a62: '[劇]',
    0x7a63: '[字]',
    0x7a64: '[双]',
    0x7a65: '[デ]',
    0x7a66: '[二]',
    0x7a67: '[多]',
    0x7a68: '[解]',
    0x7a69: '[天]',
    0x7a6a: '[交]',
    0x7a6b: '[映]',
    0x7a6c: '[無]',
    0x7a6d: '[料]',
    0x7a6e: '[前]',
    0x7a6f: '[後]',
    0x7a70: '[再]',
    0x7a71: '[新]',
    0x7a72: '[初]',
    0x7a73: '[終]',
    0x7a74: '[生]',
    0x7a75: '[販]',
    0x7a76: '[声]',
    0x7a77: '[吹]',
    0x7a78: '[PPV]',
    0x7a79: '[追]',
    0x7a7a: '[休]',
    0x7a7b: '[帯]',
    0x7a7c: '[HV]',
    0x7a7d: '[時]',
    0x7a7e: '[契]',

    // 84 ku (0x74) / 92 ku (0x7c): Resolution tags
    0x7c21: '[4K]',
    0x7c22: '[8K]',

    // 89 ku (0x79): Numbered circles
    0x7940: '①',
    0x7941: '②',
    0x7942: '③',
    0x7943: '④',
    0x7944: '⑤',
    0x7945: '⑥',
    0x7946: '⑦',
    0x7947: '⑧',
    0x7948: '⑨',
    0x7949: '⑩',
    0x794a: '⑪',
    0x794b: '⑫',
};

/**
 * Kana symbols defined in 0x77-0x7E of ARIB 1-byte Hiragana/Katakana character sets.
 * These code points do not map to standard 1-byte JIS X 0208 EUC-JP positions.
 */
const KANA_SYMBOLS: Record<number, string> = {
    0x77: 'ゝ',
    0x78: 'ゞ',
    0x79: 'ー',
    0x7a: 'ー',
    0x7b: '「',
    0x7c: '」',
    0x7d: '、',
    0x7e: '・',
};

type CharSet = 'kanji' | 'alphanumeric' | 'hiragana' | 'katakana';

/**
 * Robust, zero-dependency ARIB STD-B24 / ISO/IEC 2022 8-unit character string decoder.
 * Supports complete 4-slot G-table (G0..G3), locking shifts (GL/GR), single shifts (SS2/SS3),
 * escape sequences, C1 control parameter consumption, and ARIB gaiji / kana symbol mapping.
 */
export function decodeAribString(buf: Uint8Array): string {
    const eucDecoder = new TextDecoder('euc-jp');
    const out: string[] = [];

    // Default ARIB 8-unit character set mapping for SI / EIT descriptors (ARIB STD-B24 / STD-B10):
    // G0: 2-byte Kanji, G1: Alphanumeric, G2: Hiragana, G3: Katakana
    const g: [CharSet, CharSet, CharSet, CharSet] = ['kanji', 'alphanumeric', 'hiragana', 'katakana'];

    // Locking shifts: GL defaults to G0, GR defaults to G2
    let gl = 0; // index into g: 0..3
    let gr = 2; // index into g: 0..3

    // Single shift: applies only to the immediately following character
    let singleShift: CharSet | null = null;

    let i = 0;
    while (i < buf.length) {
        const b = buf[i];

        // 1. ESC Sequence (0x1B)
        if (b === 0x1b) {
            i++;
            if (i >= buf.length) break;
            const b1 = buf[i];

            // Invocation / Locking Shifts (LS)
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

            // 2-byte character set designation (ESC 0x24 ...)
            if (b1 === 0x24) {
                i++;
                if (i >= buf.length) break;
                const b2 = buf[i];

                if (b2 >= 0x28 && b2 <= 0x2b) {
                    // ESC 0x24 0x28..0x2B [F] -> designate 2-byte set to G0..G3
                    const target = b2 - 0x28; // 0=G0, 1=G1, 2=G2, 3=G3
                    i++;
                    if (i >= buf.length) break;
                    const finalByte = buf[i];
                    g[target] = get2ByteSet(finalByte);
                    i++;
                    continue;
                }

                // ESC 0x24 [F] -> designate 2-byte set to G0
                g[0] = get2ByteSet(b2);
                i++;
                continue;
            }

            // 1-byte character set designation (ESC 0x28..0x2B [F])
            if (b1 >= 0x28 && b1 <= 0x2b) {
                const target = b1 - 0x28; // 0=G0, 1=G1, 2=G2, 3=G3
                i++;
                if (i >= buf.length) break;
                const finalByte = buf[i];
                g[target] = get1ByteSet(finalByte);
                i++;
                continue;
            }

            i++;
            continue;
        }

        // 2. Locking Shifts in C0
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

        // 3. Single Shifts in C0
        if (b === 0x19) {
            // SS2: single shift to G2 for next character
            singleShift = g[2];
            i++;
            continue;
        }
        if (b === 0x1d) {
            // SS3: single shift to G3 for next character
            singleShift = g[3];
            i++;
            continue;
        }

        // 4. Space / Non-breaking space
        if (b === 0x20 || b === 0xa0) {
            out.push(' ');
            singleShift = null;
            i++;
            continue;
        }

        // 5. C0 Control Characters (0x00 - 0x1F)
        if (b < 0x20) {
            singleShift = null;
            i++;
            continue;
        }

        // 6. C1 Control Characters (0x80 - 0x9F)
        if (b >= 0x80 && b <= 0x9f) {
            singleShift = null;
            if (b === 0x9b) {
                // CSI: skip parameter bytes (0x30-0x3F), intermediate bytes (0x20-0x2F), and final byte (0x40-0x7E)
                i++;
                while (i < buf.length && buf[i] >= 0x20 && buf[i] <= 0x3f) {
                    i++;
                }
                if (i < buf.length && buf[i] >= 0x40 && buf[i] <= 0x7e) {
                    i++;
                }
                continue;
            }
            if (b === 0x8b || b === 0x90 || b === 0x91 || b === 0x98) {
                // SZX (0x8B), COL (0x90), FLC (0x91), POL (0x98): 1 parameter byte
                i += 2;
                continue;
            }
            // Other C1 codes (0x80-0x87 colors, 0x88 SSZ, 0x89 MSZ, 0x8A NSZ, etc.) have 0 parameter bytes
            i++;
            continue;
        }

        // 7. GL Area (0x21 - 0x7E)
        if (b >= 0x21 && b <= 0x7e) {
            const set = singleShift ?? g[gl];
            singleShift = null;
            i += decodeChar(buf, i, set, b, out, eucDecoder);
            continue;
        }

        // 8. GR Area (0xA1 - 0xFE)
        if (b >= 0xa1 && b <= 0xfe) {
            const set = singleShift ?? g[gr];
            singleShift = null;
            i += decodeChar(buf, i, set, b & 0x7f, out, eucDecoder);
            continue;
        }

        i++;
    }

    return out.join('');
}

function get2ByteSet(_f: number): CharSet {
    // 0x42: Kanji (JIS X 0208), 0x39: Additional symbols, 0x3B: Gaiji
    return 'kanji';
}

function get1ByteSet(f: number): CharSet {
    if (f === 0x30) return 'hiragana';
    if (f === 0x31) return 'katakana';
    return 'alphanumeric';
}

function decodeChar(
    buf: Uint8Array,
    offset: number,
    set: CharSet,
    b7: number,
    out: string[],
    eucDecoder: TextDecoder,
): number {
    if (set === 'kanji') {
        if (offset + 1 < buf.length) {
            const b2_7 = buf[offset + 1] & 0x7f;

            // Check ARIB gaiji (90-94 ku: 0x7a..0x7e, and custom symbol ku: 0x79)
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
                const char = eucDecoder.decode(new Uint8Array([euc1, euc2]));
                // If decoding resulted in replacement character, fallback
                if (char === '\uFFFD') {
                    out.push('?');
                } else {
                    out.push(char);
                }
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
        // Check ARIB kana symbols in 0x77-0x7E range
        const sym = KANA_SYMBOLS[b7];
        if (sym) {
            out.push(sym);
            return 1;
        }
        // JIS Hiragana (0x21-0x73) -> EUC-JP (0xa4, b7 | 0x80)
        try {
            const char = eucDecoder.decode(new Uint8Array([0xa4, b7 | 0x80]));
            out.push(char === '\uFFFD' ? String.fromCharCode(b7) : char);
        } catch {
            out.push(String.fromCharCode(b7));
        }
        return 1;
    }

    if (set === 'katakana') {
        // Check ARIB kana symbols in 0x77-0x7E range
        const sym = KANA_SYMBOLS[b7];
        if (sym) {
            out.push(sym);
            return 1;
        }
        // JIS Katakana (0x21-0x76) -> EUC-JP (0xa5, b7 | 0x80)
        try {
            const char = eucDecoder.decode(new Uint8Array([0xa5, b7 | 0x80]));
            out.push(char === '\uFFFD' ? String.fromCharCode(b7) : char);
        } catch {
            out.push(String.fromCharCode(b7));
        }
        return 1;
    }

    out.push(String.fromCharCode(b7));
    return 1;
}
