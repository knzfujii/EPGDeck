/**
 * ID3v2 Timed Metadata Generator for ARIB Subtitle Streaming
 * Reference: ISO/IEC 13818-1 / ID3v2.4 / ARIB STD-B24
 */

export class ID3 {
    /**
     * Creates metadata_pointer_descriptor for PMT program_info.
     */
    public static metadata_pointer_descriptor(program_number: number): Uint8Array {
        const payload = new Uint8Array([
            0xff,
            0xff, // application_format: 0xFFFF
            0x49,
            0x44,
            0x33,
            0x20, // 'ID3 '
            0xff, // format: 0xFF
            0x49,
            0x44,
            0x33,
            0x20, // 'ID3 '
            0x00,
            0x1f, // metadata_service_id + flags
            (program_number >> 8) & 0xff,
            program_number & 0xff,
        ]);

        const desc = new Uint8Array(2 + payload.length);
        desc[0] = 0x25; // metadata_pointer_descriptor tag
        desc[1] = payload.length;
        desc.set(payload, 2);
        return desc;
    }

    /**
     * Creates metadata_descriptor for PMT elementary stream ES_info.
     */
    public static metadata_descriptor(): Uint8Array {
        const payload = new Uint8Array([
            0xff,
            0xff, // application_format
            0x49,
            0x44,
            0x33,
            0x20, // 'ID3 '
            0xff, // format
            0x49,
            0x44,
            0x33,
            0x20, // 'ID3 '
            0xff,
            0x0f, // metadata_service_id + flags
        ]);

        const desc = new Uint8Array(2 + payload.length);
        desc[0] = 0x26; // metadata_descriptor tag
        desc[1] = payload.length;
        desc.set(payload, 2);
        return desc;
    }

    /**
     * Creates PMT ES entry for ID3 timed metadata stream (stream_type: 0x15).
     */
    public static metadata_elementary_stream(pid: number): Uint8Array {
        const desc = this.metadata_descriptor();
        const es = new Uint8Array(5 + desc.length);
        es[0] = 0x15; // stream_type: Synchronized metadata
        es[1] = 0xe0 | ((pid >> 8) & 0x1f);
        es[2] = pid & 0xff;
        es[3] = 0xf0 | ((desc.length >> 8) & 0x0f);
        es[4] = desc.length & 0xff;
        es.set(desc, 5);
        return es;
    }

    /**
     * Encodes size as 7-bit synchsafe integer (4 bytes, 28 bits max).
     */
    private static encodeSynchsafeSize(size: number): Uint8Array {
        return new Uint8Array([
            (size >> 21) & 0x7f,
            (size >> 14) & 0x7f,
            (size >> 7) & 0x7f,
            size & 0x7f,
        ]);
    }

    /**
     * Creates an ID3v2.4 container with a PRIV frame.
     */
    public static ID3v2PRIV(owner: string, binary: Uint8Array): Uint8Array {
        const ownerBytes = new TextEncoder().encode(owner);
        // PRIV payload: owner + '\0' + binary
        const privPayload = new Uint8Array(ownerBytes.length + 1 + binary.length);
        privPayload.set(ownerBytes, 0);
        privPayload[ownerBytes.length] = 0x00; // null termination
        privPayload.set(binary, ownerBytes.length + 1);

        // PRIV frame: 'PRIV' (4B) + size (4B synchsafe) + flags (2B) + payload
        const privFrame = new Uint8Array(10 + privPayload.length);
        privFrame[0] = 0x50; // 'P'
        privFrame[1] = 0x52; // 'R'
        privFrame[2] = 0x49; // 'I'
        privFrame[3] = 0x56; // 'V'
        privFrame.set(this.encodeSynchsafeSize(privPayload.length), 4);
        privFrame[8] = 0x00; // flags
        privFrame[9] = 0x00;
        privFrame.set(privPayload, 10);

        // ID3 header: 'ID3' (3B) + version 2.4 (2B) + flags (1B) + size (4B synchsafe)
        const id3 = new Uint8Array(10 + privFrame.length);
        id3[0] = 0x49; // 'I'
        id3[1] = 0x44; // 'D'
        id3[2] = 0x33; // '3'
        id3[3] = 0x04; // version 2.4
        id3[4] = 0x00; // revision 0
        id3[5] = 0x00; // flags
        id3.set(this.encodeSynchsafeSize(privFrame.length), 6);
        id3.set(privFrame, 10);

        return id3;
    }

    /**
     * Packages ID3 container into a PES packet with PTS.
     * Includes 5-byte padding for FFmpeg metadata (0x15) compatibility.
     */
    public static timedmetadata(pts: number, id3: Uint8Array): Uint8Array {
        // PTS 33-bit encoding: '0010' prefix (PTS only)
        const ptsHigh = Math.floor(pts / 0x40000000) & 0x07;
        const ptsMid = (pts >>> 15) & 0x7fff;
        const ptsLow = pts & 0x7fff;

        const ptsBytes = new Uint8Array([
            0x21 | (ptsHigh << 1),
            (ptsMid >> 7) & 0xff,
            0x01 | ((ptsMid & 0x7f) << 1),
            (ptsLow >> 7) & 0xff,
            0x01 | ((ptsLow & 0x7f) << 1),
        ]);

        const header = new Uint8Array([0x00, 0x00, 0x01, 0xbd]); // stream_id: 0xbd (Private stream 1)
        const flags = new Uint8Array([0x84, 0x80]); // PES flags: copyright=1, PTS_flag=10

        // 5 bytes padding for FFmpeg 0x15 handling + id3
        const ffmpegPadding = new Uint8Array(5);
        const payloadLength = 2 + 1 + 5 + 5 + id3.length; // flags(2) + header_data_len(1) + PTS(5) + padding(5) + id3
        const packetPayloadSize = 184; // 188 - 4
        const totalPesWithoutStuffing = 6 + payloadLength;
        const stuffingLength = (packetPayloadSize - (totalPesWithoutStuffing % packetPayloadSize)) % packetPayloadSize;

        const totalPesLength = totalPesWithoutStuffing + stuffingLength;
        const result = new Uint8Array(totalPesLength);

        // Header
        result.set(header, 0);
        // PES packet length (16 bit)
        const pesLen = payloadLength + stuffingLength;
        result[4] = (pesLen >> 8) & 0xff;
        result[5] = pesLen & 0xff;

        // Flags + PTS
        result.set(flags, 6);
        result[8] = 5; // PES_header_data_length: 5 bytes PTS
        result.set(ptsBytes, 9);
        result.set(ffmpegPadding, 14);
        result.set(id3, 19);

        // Stuffing bytes (0xFF)
        if (stuffingLength > 0) {
            result.fill(0xff, 19 + id3.length);
        }

        return result;
    }
}
