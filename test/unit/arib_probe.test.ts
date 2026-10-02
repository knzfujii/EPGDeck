import { describe, expect, it } from 'vitest';
import {
    calcCrc32Mpeg2,
    decodeMjdBcdTime,
    decodePmtSection,
    decodeTotSection,
    getStreamTypeName,
    getWellKnownPidName,
    resolvePidName,
    TsPacket,
    TsProbe,
} from '../../packages/arib-probe/src/index.js';

describe('arib-probe', () => {
    describe('calcCrc32Mpeg2', () => {
        it('should calculate valid MPEG-2 CRC32 and verify zero remainder on self-check', () => {
            // Test standard PAT section header (8 bytes)
            const data = new Uint8Array([0x00, 0xb0, 0x0d, 0x00, 0x01, 0xc1, 0x00, 0x00, 0x00, 0x01, 0xf0, 0x00]);
            const crc = calcCrc32Mpeg2(data);

            const withCrc = new Uint8Array(data.length + 4);
            withCrc.set(data);
            withCrc[data.length] = (crc >> 24) & 0xff;
            withCrc[data.length + 1] = (crc >> 16) & 0xff;
            withCrc[data.length + 2] = (crc >> 8) & 0xff;
            withCrc[data.length + 3] = crc & 0xff;

            // When appending CRC-32 to MPEG-2 data, the CRC-32 of data+crc is 0
            expect(calcCrc32Mpeg2(withCrc)).toBe(0);
        });
    });

    describe('TsPacket', () => {
        it('should parse TS packet header fields correctly', () => {
            const buf = new Uint8Array(188);
            buf[0] = 0x47; // sync_byte
            buf[1] = 0x5f; // TEI=0, PUSI=1, Priority=0, PID high=0x1F
            buf[2] = 0xff; // PID low=0xFF -> PID = 0x1FFF (Null packet)
            buf[3] = 0x1a; // Scramble=00, AFC=01 (payload only), CC=10
            buf.fill(0xaa, 4);

            const packet = new TsPacket(buf);
            expect(packet.syncByte).toBe(0x47);
            expect(packet.transportErrorIndicator).toBe(false);
            expect(packet.payloadUnitStartIndicator).toBe(true);
            expect(packet.transportPriority).toBe(false);
            expect(packet.pid).toBe(0x1fff);
            expect(packet.transportScramblingControl).toBe(0);
            expect(packet.adaptationFieldControl).toBe(1);
            expect(packet.continuityCounter).toBe(10);
            expect(packet.hasPayload).toBe(true);
            expect(packet.hasAdaptationField).toBe(false);
            expect(packet.getPayload()?.length).toBe(184);
        });

        it('should handle adaptation field and discontinuity indicator', () => {
            const buf = new Uint8Array(188);
            buf[0] = 0x47;
            buf[1] = 0x01; // PID = 0x0100
            buf[2] = 0x00;
            buf[3] = 0x35; // AFC=11 (AF + payload), CC=5
            buf[4] = 7; // AF length
            buf[5] = 0x80; // discontinuity_indicator = 1

            const packet = new TsPacket(buf);
            expect(packet.hasAdaptationField).toBe(true);
            expect(packet.hasPayload).toBe(true);
            expect(packet.adaptationFieldLength).toBe(7);
            expect(packet.discontinuityIndicator).toBe(true);
            expect(packet.getPayload()?.length).toBe(188 - 5 - 7);
        });

        it('should decode Program Clock Reference (PCR) correctly', () => {
            const buf = new Uint8Array(188);
            buf[0] = 0x47;
            buf[1] = 0x01; // PID = 0x0100
            buf[2] = 0x00;
            buf[3] = 0x30; // AFC=11 (AF + payload)
            buf[4] = 7; // AF length: 1 flag byte + 6 PCR bytes
            buf[5] = 0x10; // PCR_flag = 1

            // 1秒に相当する PCR:
            // 90,000 base ticks (= 1秒), extension = 0
            // base = 90,000 = 0x00015F90
            // 33-bit base encoded across byte 6..10:
            // base >> 1 = 45000 = 0x0000AFC8 -> b6=0, b7=0, b8=0xaf, b9=0xc8
            // base & 1 = 0 -> b10 top bit = 0
            // ext = 0 -> b10 bottom bit = 0, b11 = 0
            const base = 90000;
            buf[6] = (base >> 25) & 0xff;
            buf[7] = (base >> 17) & 0xff;
            buf[8] = (base >> 9) & 0xff;
            buf[9] = (base >> 1) & 0xff;
            buf[10] = ((base & 1) << 7) | 0x7e; // reserved bits 0x7E
            buf[11] = 0x00;

            const packet = new TsPacket(buf);
            expect(packet.hasPcr).toBe(true);
            expect(packet.pcrBase).toBe(90000);
            expect(packet.pcrExtension).toBe(0);
            expect(packet.pcr27MHz).toBe(27000000n);
            expect(packet.pcrSeconds).toBe(1.0);
        });
    });

    describe('PID & Stream Type Name Resolution', () => {
        it('should resolve well-known PIDs and stream types', () => {
            expect(getWellKnownPidName(0x0000)).toBe('PAT');
            expect(getWellKnownPidName(0x0014)).toBe('TDT/TOT');
            expect(getWellKnownPidName(0x0011)).toBe('SDT/BAT');
            expect(getWellKnownPidName(0x1fff)).toBe('NULL');

            expect(getStreamTypeName(0x02)).toBe('MPEG2 VIDEO');
            expect(getStreamTypeName(0x0f)).toBe('MPEG2 AAC');
            expect(getStreamTypeName(0x06)).toBe('字幕');
            expect(getStreamTypeName(0x1b)).toBe('MPEG4 VIDEO');
            expect(getStreamTypeName(0x24)).toBe('HEVC VIDEO');

            expect(resolvePidName(0x0000)).toBe('PAT');
            expect(resolvePidName(0x0111, 0x02)).toBe('MPEG2 VIDEO');
            expect(resolvePidName(0x0112, 0x0f)).toBe('MPEG2 AAC');
            expect(resolvePidName(0x0999)).toBe('-');
        });
    });

    describe('TOT / TDT Decoder', () => {
        it('should decode MJD + BCD into correct JST Date', () => {
            // MJD: 61315 -> 2026-10-02
            // 2026-10-02:
            // Y=2026, M=10, D=2
            // MJD calculation check
            const mjd = 61315;
            const bcdHour = 0x14; // 14:00:00
            const bcdMin = 0x30;
            const bcdSec = 0x45;

            const timeBytes = new Uint8Array([(mjd >> 8) & 0xff, mjd & 0xff, bcdHour, bcdMin, bcdSec]);

            const date = decodeMjdBcdTime(timeBytes);
            expect(date).not.toBeNull();
            expect(date?.getFullYear()).toBe(2026);
            expect(date?.getMonth()).toBe(9); // 10月 (0-indexed)
            expect(date?.getDate()).toBe(2);
            expect(date?.getHours()).toBe(14);
            expect(date?.getMinutes()).toBe(30);
            expect(date?.getSeconds()).toBe(45);
        });

        it('should decode TOT section payload', () => {
            const mjd = 61315;
            // table_id 0x73, section_syntax 0, length 5
            const totSection = new Uint8Array([0x73, 0x70, 0x05, (mjd >> 8) & 0xff, mjd & 0xff, 0x14, 0x30, 0x45]);
            const date = decodeTotSection(totSection);
            expect(date).not.toBeNull();
            expect(date?.getFullYear()).toBe(2026);
            expect(date?.getHours()).toBe(14);
        });
    });

    describe('PMT Decoder', () => {
        it('should decode PMT section streams and PCR PID', () => {
            // Synthesize minimal PMT section
            // table_id: 0x02, section_syntax_indicator=1, section_length=23
            const pmtBytes = new Uint8Array([
                0x02,
                0xb0,
                0x17, // table_id, syntax & len (23)
                0x00,
                0x01, // program_number = 1
                0xc1, // version_number = 0, current_next=1
                0x00,
                0x00, // section_number = 0, last_section = 0
                0xe1,
                0x00, // PCR_PID = 0x0100
                0xf0,
                0x00, // program_info_length = 0
                // Stream 1: Video (stream_type 0x02, elementary_PID 0x0111)
                0x02,
                0xe1,
                0x11,
                0xf0,
                0x00,
                // Stream 2: Audio (stream_type 0x0F, elementary_PID 0x0112)
                0x0f,
                0xe1,
                0x12,
                0xf0,
                0x00,
                // CRC32 placeholder (4 bytes)
                0x00,
                0x00,
                0x00,
                0x00,
            ]);

            const pmt = decodePmtSection(pmtBytes);
            expect(pmt).not.toBeNull();
            expect(pmt?.program_number).toBe(1);
            expect(pmt?.PCR_PID).toBe(0x0100);
            expect(pmt?.streams.length).toBe(2);
            expect(pmt?.streams[0].stream_type).toBe(0x02);
            expect(pmt?.streams[0].elementary_PID).toBe(0x0111);
            expect(pmt?.streams[1].stream_type).toBe(0x0f);
            expect(pmt?.streams[1].elementary_PID).toBe(0x0112);
        });
    });

    describe('TsProbe Stream Pipeline', () => {
        function createTsPacket(
            pid: number,
            cc: number,
            options: { tei?: boolean; scramble?: number } = {},
        ): Uint8Array {
            const buf = new Uint8Array(188);
            buf[0] = 0x47;
            buf[1] = (options.tei ? 0x80 : 0x00) | ((pid >> 8) & 0x1f);
            buf[2] = pid & 0xff;
            buf[3] = ((options.scramble ?? 0) << 6) | 0x10 | (cc & 0x0f); // payload only
            buf.fill(0x55, 4);
            return buf;
        }

        it('should detect packet continuity drops and count errors', async () => {
            const probe = new TsProbe();
            const drops: { pid: number; counter: number; expected: number }[] = [];
            const errors: number[] = [];
            const scrambles: number[] = [];

            probe.on('packetDrop', (pid, counter, expected) => drops.push({ pid, counter, expected }));
            probe.on('packetError', pid => errors.push(pid));
            probe.on('packetScrambling', pid => scrambles.push(pid));

            // Stream packets:
            // PID 0x0100: CC 0, 1, 2, 4 (drop 3!), 5
            // PID 0x0200: CC 0, error packet, CC 1
            // PID 0x0300: scrambled packet
            const chunks: Uint8Array[] = [
                createTsPacket(0x0100, 0),
                createTsPacket(0x0100, 1),
                createTsPacket(0x0100, 2),
                createTsPacket(0x0100, 4), // Drop! expected 3, got 4
                createTsPacket(0x0100, 5),

                createTsPacket(0x0200, 0),
                createTsPacket(0x0200, 1, { tei: true }), // Error!
                createTsPacket(0x0200, 1),

                createTsPacket(0x0300, 0, { scramble: 2 }), // Scramble!
            ];

            for (const chunk of chunks) {
                probe.write(chunk);
            }
            probe.end();

            await new Promise<void>(resolve => probe.on('finish', resolve));

            expect(drops.length).toBe(1);
            expect(drops[0]).toEqual({ pid: 0x0100, counter: 4, expected: 3 });

            expect(errors.length).toBe(1);
            expect(errors[0]).toBe(0x0200);

            expect(scrambles.length).toBe(1);
            expect(scrambles[0]).toBe(0x0300);

            const result = probe.getResult();
            expect(result[0x0100].packet).toBe(5);
            expect(result[0x0100].drop).toBe(1);
            expect(result[0x0100].error).toBe(0);

            expect(result[0x0200].packet).toBe(3);
            expect(result[0x0200].error).toBe(1);

            expect(result[0x0300].packet).toBe(1);
            expect(result[0x0300].scrambling).toBe(1);
        });

        it('should handle unaligned chunks across write boundaries', async () => {
            const probe = new TsProbe();
            const p1 = createTsPacket(0x0100, 0);
            const p2 = createTsPacket(0x0100, 1);
            const concatenated = new Uint8Array(188 * 2);
            concatenated.set(p1, 0);
            concatenated.set(p2, 188);

            // Split into unaligned 100-byte chunks
            const chunk1 = concatenated.subarray(0, 100);
            const chunk2 = concatenated.subarray(100, 250);
            const chunk3 = concatenated.subarray(250);

            probe.write(chunk1);
            probe.write(chunk2);
            probe.write(chunk3);
            probe.end();

            await new Promise<void>(resolve => probe.on('finish', resolve));

            const result = probe.getResult();
            expect(result[0x0100].packet).toBe(2);
            expect(result[0x0100].drop).toBe(0);
        });

        it('should track PCR elapsed time and format timecode on packet drop', async () => {
            const probe = new TsProbe();
            let capturedTimecode: string | null = null;

            probe.on('packetDrop', (_pid, _counter, _expected, timecode) => {
                capturedTimecode = timecode;
            });

            function createPcrPacket(pid: number, cc: number, pcrSec: number): Uint8Array {
                const buf = new Uint8Array(188);
                buf[0] = 0x47;
                buf[1] = (pid >> 8) & 0x1f;
                buf[2] = pid & 0xff;
                buf[3] = 0x30 | (cc & 0x0f); // AF + payload
                buf[4] = 7;
                buf[5] = 0x10; // PCR flag

                const base = Math.floor(pcrSec * 90000);
                buf[6] = (base >> 25) & 0xff;
                buf[7] = (base >> 17) & 0xff;
                buf[8] = (base >> 9) & 0xff;
                buf[9] = (base >> 1) & 0xff;
                buf[10] = ((base & 1) << 7) | 0x7e;
                buf[11] = 0x00;
                buf.fill(0x55, 12);
                return buf;
            }

            // Packet 1: PCR = 100.0s (start)
            probe.write(createPcrPacket(0x0100, 0, 100.0));
            // Packet 2: PCR = 165.5s (+65.5s = 00:01:05.500), but CC gap (0 -> 2, drop 1!)
            probe.write(createPcrPacket(0x0100, 2, 165.5));
            probe.end();

            await new Promise<void>(resolve => probe.on('finish', resolve));

            expect(capturedTimecode).toBe('00:01:05.500');
            expect(probe.getElapsedSeconds()).toBeCloseTo(65.5, 2);
            expect(probe.getTimecode()).toBe('00:01:05.500');

            const result = probe.getResult();
            expect(result[0x0100].name).toBe('-'); // PMT not registered, falls back to '-'
        });
    });
});
