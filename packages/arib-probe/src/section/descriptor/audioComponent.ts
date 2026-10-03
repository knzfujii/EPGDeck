import { decodeAribString } from '../../aribString.js';

export interface AudioComponentInfo {
    stream_content: number;
    component_type: number;
    component_type_name: string;
    component_tag: number;
    stream_type: number;
    simulcast_group_tag: number;
    es_multi_lingual_flag: boolean;
    main_component_flag: boolean;
    quality_indicator: number;
    sampling_rate: number;
    sampling_rate_hz: number;
    languages: string[];
    text: string;
    isDualMono: boolean;
    isSurround: boolean;
}

export function getAudioSamplingRateHz(samplingRate: number): number {
    switch (samplingRate) {
        case 1:
            return 16000;
        case 2:
            return 22050;
        case 3:
            return 24000;
        case 5:
            return 32000;
        case 6:
            return 44100;
        case 7:
            return 48000;
        default:
            return 0;
    }
}

export function getAudioComponentTypeName(componentType: number): string {
    switch (componentType) {
        case 0x01:
            return 'モノラル (1/0)';
        case 0x02:
            return 'デュアルモノラル (主/副)';
        case 0x03:
            return 'ステレオ (2/0)';
        case 0x04:
            return '2/1モード';
        case 0x05:
            return '3/0モード';
        case 0x06:
            return '2/2モード';
        case 0x07:
            return '3/1モード';
        case 0x08:
            return '3/2モード';
        case 0x09:
            return '5.1chサラウンド (3/2+LFE)';
        case 0x40:
            return '解説放送 (視覚障害者用)';
        case 0x41:
            return '副音声 (聴覚障害者用)';
        default:
            return `音声 0x${componentType.toString(16).padStart(2, '0')}`;
    }
}

/**
 * Decodes ARIB STD-B10 audio_component_descriptor payload (tag 0xC4)
 * @param descPayload - Payload buffer starting directly after descriptor_length byte
 */
export function decodeAudioComponentDescriptor(descPayload: Uint8Array): AudioComponentInfo | null {
    if (descPayload.length < 9) {
        return null;
    }

    const streamContent = descPayload[0] & 0x0f;
    const componentType = descPayload[1];
    const componentTag = descPayload[2];
    const streamType = descPayload[3];
    const simulcastGroupTag = descPayload[4];
    const flags = descPayload[5];
    const esMultiLingualFlag = (flags & 0x80) !== 0;
    const mainComponentFlag = (flags & 0x40) !== 0;
    const qualityIndicator = (flags & 0x30) >> 4;
    const samplingRate = (flags & 0x0e) >> 1;

    const lang1 = String.fromCharCode(descPayload[6], descPayload[7], descPayload[8]);
    const languages: string[] = [lang1];

    let payloadOffset = 9;
    if (esMultiLingualFlag && descPayload.length >= 12) {
        const lang2 = String.fromCharCode(descPayload[9], descPayload[10], descPayload[11]);
        languages.push(lang2);
        payloadOffset = 12;
    }

    let text = '';
    if (descPayload.length > payloadOffset) {
        const textBytes = descPayload.subarray(payloadOffset);
        if (textBytes.length > 0) {
            text = decodeAribString(textBytes);
        }
    }

    return {
        stream_content: streamContent,
        component_type: componentType,
        component_type_name: getAudioComponentTypeName(componentType),
        component_tag: componentTag,
        stream_type: streamType,
        simulcast_group_tag: simulcastGroupTag,
        es_multi_lingual_flag: esMultiLingualFlag,
        main_component_flag: mainComponentFlag,
        quality_indicator: qualityIndicator,
        sampling_rate: samplingRate,
        sampling_rate_hz: getAudioSamplingRateHz(samplingRate),
        languages,
        text,
        isDualMono: componentType === 0x02,
        isSurround: componentType === 0x09,
    };
}
