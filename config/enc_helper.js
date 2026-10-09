/**
 * @file config/enc_helper.js
 * Backward-compatibility wrapper for @epgdeck/enc-helper.
 *
 * For new scripts, please use:
 *   import { runEncode } from '@epgdeck/enc-helper';
 */

import {
    runEncode,
    buildFFmpegArgs,
    getMediaInfo,
    resolveResolution,
    verifyOutputFile,
    timeStrToSeconds,
    formatCommand,
    normalizeCodec,
    parseCliArgs,
    runCli,
} from '@epgdeck/enc-helper';
import { pathToFileURL } from 'node:url';

// CLI エントリポイント (node enc_helper.js [resolution/preset] [codec])
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runCli(process.argv.slice(2)).catch((err) => {
        console.error('[enc_helper] Top-level error:', err);
        process.exit(1);
    });
}

export * from '@epgdeck/enc-helper';
export {
    runEncode,
    buildFFmpegArgs,
    getMediaInfo,
    resolveResolution,
    verifyOutputFile,
    timeStrToSeconds,
    formatCommand,
    normalizeCodec,
    parseCliArgs,
};
