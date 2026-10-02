/* eslint-disable no-undef */

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';

console.log('[Smoke] Starting Node.js native ESM interop checks...');

// 1. arib-probe (TsProbe & TsSubtitleTimedMetadater)
import { TsProbe, TsSubtitleTimedMetadater } from 'arib-probe';
const probe = new TsProbe();
assert.strictEqual(typeof probe.pipe, 'function', 'TsProbe.pipe must be a function');
assert.strictEqual(typeof probe.getResult, 'function', 'TsProbe.getResult must be a function');
const metadater = new TsSubtitleTimedMetadater();
assert.strictEqual(typeof metadater.pipe, 'function', 'TsSubtitleTimedMetadater.pipe must be a function');
assert.strictEqual(typeof metadater.destroy, 'function', 'TsSubtitleTimedMetadater.destroy must be a function');
console.log('  ✔ arib-probe TsProbe & TsSubtitleTimedMetadater verified');

// 3. mirakurun
import { Client as MirakurunClient } from 'mirakurun';
const miraClient = new MirakurunClient();
assert.strictEqual(typeof miraClient.getChannels, 'function', 'MirakurunClient.getChannels must be a function');
console.log('  ✔ mirakurun Client constructor verified');

// 4. rotating-file-stream
import * as rfs from 'rotating-file-stream';
assert.strictEqual(typeof rfs.createStream, 'function', 'rfs.createStream must be a function');
console.log('  ✔ rotating-file-stream createStream verified');


// 5. socket.io
import * as SocketIO from 'socket.io';
assert.strictEqual(typeof SocketIO.Server, 'function', 'SocketIO.Server constructor must exist');
console.log('  ✔ socket.io Server verified');

// 6. enc_helper.js CLI execution test
try {
    execFileSync(process.execPath, ['config/enc_helper.js', '--help'], {
        encoding: 'utf-8',
        stdio: 'pipe',
    });
    assert.fail('enc_helper without INPUT/OUTPUT should exit with non-zero');
} catch (err) {
    const stderr = err.stderr || '';
    const stdout = err.stdout || '';
    const combined = stdout + stderr;
    assert.ok(
        combined.includes('INPUT or OUTPUT environment variable is not defined'),
        `Unexpected enc_helper output: ${combined}`,
    );
    console.log('  ✔ config/enc_helper.js CLI argument validation verified');
}

// 7. enc templates and active enc scripts syntax check via node --check
const templates = [
    'config/enc.js.template',
    'config/enc_1080p.js.template',
    'config/enc_720p.js.template',
    'config/enc_nvenc.js.template',
    'config/enc_qsv.js.template',
    'config/enc_vaapi.js.template',
];
for (const tmpl of templates) {
    const code = fs.readFileSync(tmpl, 'utf-8');
    assert.ok(!code.includes('require('), `${tmpl} must not contain require()`);
    execFileSync(process.execPath, ['--input-type=module', '--check'], {
        input: code,
        stdio: ['pipe', 'inherit', 'inherit'],
    });
}
console.log('  ✔ All config/enc*.js.template files passed node syntax check');

// Check active config/enc*.js scripts if they exist
const configDirFiles = fs.readdirSync('config');
const activeEncFiles = configDirFiles.filter(
    f => f.startsWith('enc') && f.endsWith('.js') && f !== 'enc_helper.js',
);
for (const f of activeEncFiles) {
    const filePath = `config/${f}`;
    const code = fs.readFileSync(filePath, 'utf-8');
    assert.ok(!code.includes('require('), `${filePath} must not contain require()`);
    execFileSync(process.execPath, ['--check', filePath], {
        stdio: ['pipe', 'inherit', 'inherit'],
    });
}
if (activeEncFiles.length > 0) {
    console.log(`  ✔ Active encode scripts (${activeEncFiles.join(', ')}) passed syntax check`);
}

console.log('[Smoke] All ESM interop smoke tests PASSED!');
