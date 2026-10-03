import http from 'http';
import { TsProbe } from '../packages/arib-probe/dist/index.js';

const MIRAKURUN_HOST = process.env.MIRAKURUN_HOST || '192.168.50.48';
const MIRAKURUN_PORT = parseInt(process.env.MIRAKURUN_PORT || '40773', 10);

const TARGET_SERVICES = [
    // 地デジ (GR)
    { id: 3273601024, name: 'NHK総合1・東京', serviceId: 1024, type: 'GR' },
    { id: 3273701032, name: 'NHKEテレ1東京', serviceId: 1032, type: 'GR' },
    { id: 3273801040, name: '日テレ1', serviceId: 1040, type: 'GR' },
    { id: 3274101064, name: 'テレビ朝日', serviceId: 1064, type: 'GR' },
    { id: 3273901048, name: 'TBS1', serviceId: 1048, type: 'GR' },
    { id: 3274201072, name: 'テレ東', serviceId: 1072, type: 'GR' },
    { id: 3274001056, name: 'フジテレビ', serviceId: 1056, type: 'GR' },
    { id: 3239123608, name: 'TOKYO MX1', serviceId: 23608, type: 'GR' },
    // BS (衛星)
    { id: 400101, name: 'NHK BS', serviceId: 101, type: 'BS' },
    { id: 400141, name: 'BS日テレ', serviceId: 141, type: 'BS' },
    { id: 400151, name: 'BS朝日1', serviceId: 151, type: 'BS' },
    { id: 400161, name: 'BS-TBS', serviceId: 161, type: 'BS' },
    { id: 400171, name: 'BSテレ東', serviceId: 171, type: 'BS' },
    { id: 400181, name: 'BSフジ', serviceId: 181, type: 'BS' },
    { id: 400211, name: 'BS11イレブン', serviceId: 211, type: 'BS' },
    { id: 400222, name: 'BS12トゥエルビ', serviceId: 222, type: 'BS' },
];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function probeService(service) {
    return new Promise((resolve) => {
        const probe = new TsProbe();
        let receivedPmt = null;
        let receivedEit = null;
        let receivedTime = null;
        let packetCount = 0;
        let isDone = false;

        const url = `/api/services/${service.id}/stream?decode=1`;
        const req = http.request(
            {
                hostname: MIRAKURUN_HOST,
                port: MIRAKURUN_PORT,
                path: url,
                method: 'GET',
                headers: {
                    'X-Mirakurun-Priority': '0', // 最低優先度 (録画を絶対に邪魔しない)
                },
            },
            (res) => {
                if (res.statusCode !== 200) {
                    cleanup({ ok: false, error: `HTTP ${res.statusCode}` });
                    return;
                }

                probe.on('pmt', (pmt) => {
                    receivedPmt = pmt;
                    checkComplete();
                });

                probe.on('time', (time) => {
                    receivedTime = time;
                });

                probe.on('eit', (eit) => {
                    // 自サービスの present 番組を取得
                    if (eit.serviceId === service.serviceId) {
                        const current = eit.events.find(e => e.isCurrent);
                        if (current) {
                            receivedEit = current;
                            checkComplete();
                        }
                    }
                });

                res.on('data', (chunk) => {
                    packetCount += Math.floor(chunk.length / 188);
                    probe.write(chunk);
                });

                res.on('end', () => cleanup(getResult()));
                res.on('error', (err) => cleanup({ ok: false, error: err.message }));
            }
        );

        req.on('error', (err) => cleanup({ ok: false, error: err.message }));
        req.end();

        // タイムアウト設定 (最大 5.0 秒受信)
        const timeoutTimer = setTimeout(() => {
            cleanup(getResult());
        }, 5000);

        function checkComplete() {
            // PMT と EIT の両方が取得できたら即終了
            if (receivedPmt && receivedEit) {
                cleanup(getResult());
            }
        }

        function getResult() {
            const ok = receivedPmt !== null && receivedEit !== null;
            return {
                ok,
                packets: packetCount,
                pcrPid: receivedPmt ? `0x${receivedPmt.PCR_PID.toString(16).padStart(4, '0')}` : 'none',
                programName: receivedEit ? receivedEit.name : '(EITなし)',
                duration: receivedEit ? `${receivedEit.duration}s` : '-',
                clock: receivedTime ? receivedTime.toLocaleTimeString() : '-',
            };
        }

        function cleanup(result) {
            if (isDone) return;
            isDone = true;
            clearTimeout(timeoutTimer);
            try {
                req.destroy();
            } catch {}
            try {
                probe.destroy();
            } catch {}
            resolve(result);
        }
    });
}

async function main() {
    console.log('================================================================================');
    console.log('📡 EPGDeck / arib-probe 全主要チャンネル受信・EIT 検証テスト');
    console.log(`Mirakurun: http://${MIRAKURUN_HOST}:${MIRAKURUN_PORT}`);
    console.log(`対象チャンネル数: ${TARGET_SERVICES.length} (地デジ + BS)`);
    console.log('チューナー保護ポリシー: Priority 0 / チャンネル間 1.0秒クールダウン');
    console.log('================================================================================\n');

    const results = [];

    for (let i = 0; i < TARGET_SERVICES.length; i++) {
        const service = TARGET_SERVICES[i];
        process.stdout.write(`[${i + 1}/${TARGET_SERVICES.length}] ${service.type.padEnd(2)} ${service.name.padEnd(16)} (SID: ${service.serviceId}) 受信中... `);

        const startTime = Date.now();
        const res = await probeService(service);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        if (res.ok) {
            console.log(`✔ PASS (${elapsed}s)`);
            console.log(`      └ 番組名: ${res.programName} [PCR: ${res.pcrPid}, 尺: ${res.duration}]`);
        } else {
            console.log(`✖ FAIL (${elapsed}s) - ${res.error || 'PMT/EIT未取得'}`);
        }

        results.push({ service, ...res, elapsed });

        // チューナー解放とMirakurun負荷低減のための 1.0 秒スリープ
        if (i < TARGET_SERVICES.length - 1) {
            await sleep(1000);
        }
    }

    console.log('\n================================================================================');
    console.log('📊 検証結果サマリー');
    console.log('================================================================================');
    const passCount = results.filter(r => r.ok).length;
    console.log(`合格率: ${passCount} / ${results.length} (${Math.round(passCount / results.length * 100)}%)`);

    if (passCount === results.length) {
        console.log('🎉 すべてのチャンネルで PAT/PMT/PCR/EIT/ARIB文字列デコードが正常に機能しています！');
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
