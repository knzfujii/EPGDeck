import { decodeAribString } from '../aribString.js';
import { calcCrc32Mpeg2 } from '../crc32.js';
import { decodeMjdBcdTime } from './tot.js';
import { decodeAudioComponentDescriptor, type AudioComponentInfo } from './descriptor/audioComponent.js';

export interface EitRelatedItem {
    type: 'shared' | 'relay' | 'movement';
    networkId?: number;
    serviceId: number;
    eventId: number;
}

export interface EitEvent {
    eventId: number;
    startTime: Date | null;
    duration: number; // in seconds
    name: string;
    description: string;
    isCurrent: boolean; // true: present (section 0), false: following (section 1)
    relatedItems?: EitRelatedItem[];
    audio?: AudioComponentInfo;
    audios?: AudioComponentInfo[];
}

export interface EitInfo {
    serviceId: number;
    events: EitEvent[];
}

export function decodeBcdDuration(buffer: Uint8Array, offset: number = 0): number {
    if (buffer.length < offset + 3) return 0;
    const h = ((buffer[offset] >> 4) * 10) + (buffer[offset] & 0x0f);
    const m = ((buffer[offset + 1] >> 4) * 10) + (buffer[offset + 1] & 0x0f);
    const s = ((buffer[offset + 2] >> 4) * 10) + (buffer[offset + 2] & 0x0f);
    return h * 3600 + m * 60 + s;
}

/**
 * Decodes ARIB STD-B10 / EN 300 468 EIT (Event Information Table) present/following section.
 * Table ID 0x4E: actual TS p/f
 * Table ID 0x4F: other TS p/f
 */
export function decodeEitSection(sectionPayload: Uint8Array): EitInfo | null {
    // Basic length check (min header 14 bytes + 4 bytes CRC)
    if (sectionPayload.length < 18) {
        return null;
    }

    const tableId = sectionPayload[0];
    if (tableId !== 0x4e && tableId !== 0x4f) {
        return null;
    }

    // Verify CRC32
    if (calcCrc32Mpeg2(sectionPayload) !== 0) {
        return null;
    }

    const serviceId = (sectionPayload[3] << 8) | sectionPayload[4];
    const sectionNumber = sectionPayload[6]; // 0 = present, 1 = following
    const isCurrent = sectionNumber === 0;

    const events: EitEvent[] = [];
    const sectionEnd = sectionPayload.length - 4; // exclude CRC32

    let offset = 14;
    while (offset + 12 <= sectionEnd) {
        const eventId = (sectionPayload[offset] << 8) | sectionPayload[offset + 1];
        const startTime = decodeMjdBcdTime(sectionPayload, offset + 2);
        const duration = decodeBcdDuration(sectionPayload, offset + 7);
        const descLoopLen = ((sectionPayload[offset + 10] & 0x0f) << 8) | sectionPayload[offset + 11];

        let name = '';
        let description = '';
        let relatedItems: EitRelatedItem[] | undefined;
        const audios: AudioComponentInfo[] = [];

        let descOffset = offset + 12;
        const descEnd = descOffset + descLoopLen;

        while (descOffset + 2 <= descEnd && descOffset + 2 <= sectionEnd) {
            const tag = sectionPayload[descOffset];
            const len = sectionPayload[descOffset + 1];
            const descPayload = sectionPayload.subarray(descOffset + 2, descOffset + 2 + len);

            if (tag === 0x4d && descPayload.length >= 4) {
                // short_event_descriptor
                // [0..2]: ISO_639_language_code (3B)
                // [3]: event_name_length (1B)
                const eventNameLen = descPayload[3];
                if (descPayload.length >= 4 + eventNameLen + 1) {
                    const eventNameBytes = descPayload.subarray(4, 4 + eventNameLen);
                    name = decodeAribString(eventNameBytes);

                    const textLen = descPayload[4 + eventNameLen];
                    if (descPayload.length >= 4 + eventNameLen + 1 + textLen) {
                        const textBytes = descPayload.subarray(4 + eventNameLen + 1, 4 + eventNameLen + 1 + textLen);
                        description = decodeAribString(textBytes);
                    }
                }
            } else if (tag === 0xc4) {
                // audio_component_descriptor (ARIB STD-B10)
                const audio = decodeAudioComponentDescriptor(descPayload);
                if (audio) {
                    audios.push(audio);
                }
            } else if (tag === 0xd6 && descPayload.length >= 1) {
                // event_group_descriptor (ARIB STD-B10)
                const groupTypeNibble = (descPayload[0] >> 4) & 0x0f;
                const eventCount = descPayload[0] & 0x0f;
                let relType: 'shared' | 'relay' | 'movement' | null = null;
                if (groupTypeNibble === 1) relType = 'shared';
                else if (groupTypeNibble === 2) relType = 'relay';
                else if (groupTypeNibble === 4) relType = 'movement';

                if (relType !== null) {
                    relatedItems = relatedItems ?? [];
                    let itemOffset = 1;
                    for (let i = 0; i < eventCount && itemOffset + 4 <= descPayload.length; i++) {
                        const relServiceId = (descPayload[itemOffset] << 8) | descPayload[itemOffset + 1];
                        const relEventId = (descPayload[itemOffset + 2] << 8) | descPayload[itemOffset + 3];
                        relatedItems.push({
                            type: relType,
                            serviceId: relServiceId,
                            eventId: relEventId,
                        });
                        itemOffset += 4;
                    }

                    // Other network events (if present in remaining bytes)
                    while (itemOffset + 8 <= descPayload.length) {
                        const origNetId = (descPayload[itemOffset] << 8) | descPayload[itemOffset + 1];
                        const relServiceId = (descPayload[itemOffset + 4] << 8) | descPayload[itemOffset + 5];
                        const relEventId = (descPayload[itemOffset + 6] << 8) | descPayload[itemOffset + 7];
                        relatedItems.push({
                            type: relType,
                            networkId: origNetId,
                            serviceId: relServiceId,
                            eventId: relEventId,
                        });
                        itemOffset += 8;
                    }
                }
            }

            descOffset += 2 + len;
        }

        events.push({
            eventId,
            startTime,
            duration,
            name,
            description,
            isCurrent,
            ...(relatedItems && relatedItems.length > 0 ? { relatedItems } : {}),
            ...(audios.length > 0 ? { audio: audios[0], audios } : {}),
        });

        offset += 12 + descLoopLen;
    }

    return {
        serviceId,
        events,
    };
}
