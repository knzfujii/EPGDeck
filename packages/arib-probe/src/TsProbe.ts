import { Transform, TransformCallback } from 'stream';
import { decodePmtSection, type PmtInfo } from './section/pmt.js';
import { decodeTotSection } from './section/tot.js';
import { TsSectionAssembler } from './section/TsSectionParser.js';
import { TsPacket } from './TsPacket.js';

export interface PidStatistics {
    packet: number;
    error: number;
    drop: number;
    scrambling: number;
}

export interface DropResult {
    [pid: number]: PidStatistics;
}

interface PidState {
    counter: number;
    duplication: number;
    packet: number;
    error: number;
    drop: number;
    scrambling: number;
}

export interface TsProbeOptions {
    /** Whether to pass packets through in the Transform stream (default: false to save memory if only probing) */
    passthrough?: boolean;
}

export interface TsProbe {
    on(event: 'packetError', listener: (pid: number) => void): this;
    on(event: 'packetDrop', listener: (pid: number, counter: number, expected: number) => void): this;
    on(event: 'packetScrambling', listener: (pid: number) => void): this;
    on(event: 'time', listener: (time: Date) => void): this;
    on(event: 'pmt', listener: (pmt: PmtInfo) => void): this;
    on(event: 'finish', listener: () => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
}

/**
 * High-performance, zero-dependency MPEG-2 TS continuity and drop checker stream.
 */
export class TsProbe extends Transform {
    private readonly passthrough: boolean;
    private readonly pidStates: Map<number, PidState> = new Map();
    private readonly pmtPids: Set<number> = new Set();
    private readonly sectionAssemblers: Map<number, TsSectionAssembler> = new Map();

    private remainder: Uint8Array = new Uint8Array(0);

    constructor(options: TsProbeOptions = {}) {
        super({ objectMode: false });
        this.passthrough = options.passthrough ?? false;

        // Default monitored PSI/SI PIDs
        // 0x0000: PAT (Program Association Table)
        this.registerSectionAssembler(0x0000, (_tableId, section) => {
            this.handlePatSection(section);
        });

        // 0x0014: TDT/TOT (Time Date Table / Time Offset Table)
        this.registerSectionAssembler(0x0014, (tableId, section) => {
            if (tableId === 0x70 || tableId === 0x73) {
                const date = decodeTotSection(section);
                if (date) {
                    this.emit('time', date);
                }
            }
        });
    }

    private getOrCreatePidState(pid: number): PidState {
        let state = this.pidStates.get(pid);
        if (!state) {
            state = {
                counter: -1,
                duplication: 0,
                packet: 0,
                error: 0,
                drop: 0,
                scrambling: 0,
            };
            this.pidStates.set(pid, state);
        }
        return state;
    }

    private registerSectionAssembler(pid: number, onSection: (tableId: number, section: Uint8Array) => void): void {
        if (!this.sectionAssemblers.has(pid)) {
            this.sectionAssemblers.set(pid, new TsSectionAssembler(onSection));
        }
    }

    private handlePatSection(section: Uint8Array): void {
        // PAT (table_id: 0x00)
        if (section.length < 8 || section[0] !== 0x00) return;

        const sectionLength = ((section[1] & 0x0f) << 8) | section[2];
        const sectionEnd = 3 + sectionLength - 4; // exclude CRC32

        for (let offset = 8; offset + 4 <= sectionEnd; offset += 4) {
            const programNum = (section[offset] << 8) | section[offset + 1];
            const pmtPid = ((section[offset + 2] & 0x1f) << 8) | section[offset + 3];

            if (programNum !== 0 && !this.pmtPids.has(pmtPid)) {
                this.pmtPids.add(pmtPid);
                this.registerSectionAssembler(pmtPid, (_tableId, pmtSection) => {
                    const pmt = decodePmtSection(pmtSection);
                    if (pmt) {
                        this.emit('pmt', pmt);
                    }
                });
            }
        }
    }

    public _transform(chunk: Buffer | Uint8Array, _encoding: BufferEncoding, callback: TransformCallback): void {
        let buffer: Uint8Array;
        if (this.remainder.length > 0) {
            const merged = new Uint8Array(this.remainder.length + chunk.length);
            merged.set(this.remainder);
            merged.set(chunk, this.remainder.length);
            buffer = merged;
            this.remainder = new Uint8Array(0);
        } else {
            buffer = chunk;
        }

        let offset = 0;
        const len = buffer.length;

        while (offset + TsPacket.PACKET_SIZE <= len) {
            // Find sync byte
            if (buffer[offset] !== TsPacket.SYNC_BYTE) {
                const nextSync = buffer.indexOf(TsPacket.SYNC_BYTE, offset);
                if (nextSync === -1) {
                    offset = len;
                    break;
                }
                offset = nextSync;
                if (offset + TsPacket.PACKET_SIZE > len) {
                    break;
                }
            }

            const packetSlice = buffer.subarray(offset, offset + TsPacket.PACKET_SIZE);
            const packet = new TsPacket(packetSlice);
            this.processPacket(packet);

            if (this.passthrough) {
                this.push(packetSlice);
            }

            offset += TsPacket.PACKET_SIZE;
        }

        // Keep remaining unaligned bytes
        if (offset < len) {
            this.remainder = buffer.slice(offset);
        }

        callback();
    }

    public _flush(callback: TransformCallback): void {
        this.remainder = new Uint8Array(0);
        callback();
    }

    private processPacket(packet: TsPacket): void {
        const pid = packet.pid;
        const state = this.getOrCreatePidState(pid);

        state.packet++;

        // 1. Error check
        if (packet.transportErrorIndicator) {
            state.error++;
            this.emit('packetError', pid);
            return;
        }

        // 2. Continuity counter check
        if (packet.hasPayload) {
            const counter = packet.continuityCounter;

            // Discontinuity indicator resets counter state
            if (packet.discontinuityIndicator) {
                state.counter = -1;
            }

            // Exclude Null packet (0x1FFF) from drop checks
            if (state.counter !== -1 && pid !== 0x1fff) {
                const previous = state.counter;
                const expected = (previous + 1) & 0x0f;
                let isDrop = false;

                if (counter === previous) {
                    state.duplication++;
                    if (state.duplication > 1) {
                        isDrop = true;
                    }
                } else {
                    state.duplication = 0;
                    if (counter !== expected) {
                        isDrop = true;
                    }
                }

                if (isDrop) {
                    state.drop++;
                    this.emit('packetDrop', pid, counter, expected);
                }
            }

            state.counter = counter;

            // 3. Scrambling check
            if (packet.transportScramblingControl !== 0) {
                state.scrambling++;
                this.emit('packetScrambling', pid);
            }
        }

        // 4. Feed to section assembler if monitored
        const assembler = this.sectionAssemblers.get(pid);
        if (assembler) {
            assembler.pushPacket(packet);
        }
    }

    /**
     * Returns drop/error/scramble statistics for all observed PIDs.
     */
    public getResult(): DropResult {
        const result: DropResult = {};
        for (const [pid, state] of this.pidStates.entries()) {
            if (state.packet === 0) continue;
            result[pid] = {
                packet: state.packet,
                error: state.error,
                drop: state.drop,
                scrambling: state.scrambling,
            };
        }
        return result;
    }

    /**
     * Resets internal statistics.
     */
    public reset(): void {
        this.pidStates.clear();
        this.remainder = new Uint8Array(0);
    }
}
