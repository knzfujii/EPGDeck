import * as aribb24 from 'aribb24.js';

export interface SubtitleManagerOptions {
    onSubtitleDetected?: () => void;
}

/**
 * ARIB STD-B24 字幕・文字スーパーのライフサイクルおよび描画を統括するマネージャー
 */
export class SubtitleManager {
    private videoElement: HTMLVideoElement | null = null;
    private containerElement: HTMLElement | null = null;

    // 通常字幕 (Caption: 0x80)
    private captionController: aribb24.Controller | null = null;
    private captionFeeder: aribb24.MPEGTSFeeder | null = null;
    private captionRenderer: aribb24.CanvasMainThreadRenderer | null = null;

    // 文字スーパー (Superimpose: 0x81 - ニュース速報・地震情報など)
    private superimposeController: aribb24.Controller | null = null;
    private superimposeFeeder: aribb24.MPEGTSFeeder | null = null;
    private superimposeRenderer: aribb24.CanvasMainThreadRenderer | null = null;

    private isEnabled: boolean = false;
    private options: SubtitleManagerOptions;

    constructor(options: SubtitleManagerOptions = {}) {
        this.options = options;
    }

    /**
     * 字幕レンダラーを video 要素およびコンテナにアタッチ
     */
    public attach(video: HTMLVideoElement, container: HTMLElement, enabled: boolean): void {
        this.detach();
        this.videoElement = video;
        this.containerElement = container;
        this.isEnabled = enabled;

        const fontConfig = {
            normal: '"Rounded M+ 1m for ARIB", "Windows TV 丸ゴシック", "Hiragino Maru Gothic ProN", "Yu Gothic", sans-serif',
            arib: '"Rounded M+ 1m for ARIB", "Windows TV 丸ゴシック", "Hiragino Maru Gothic ProN", "Yu Gothic", sans-serif',
        };

        try {
            // 1. 通常字幕 (Caption)
            this.captionController = new aribb24.Controller();
            this.captionFeeder = new aribb24.MPEGTSFeeder({
                recieve: { type: 'Caption' },
                tokenizer: {},
                offset: {},
            });
            this.captionRenderer = new aribb24.CanvasMainThreadRenderer({ font: fontConfig });
            this.captionController.attachFeeder(this.captionFeeder);
            this.captionController.attachRenderer(this.captionRenderer);
            this.captionController.attachMedia(this.videoElement, this.containerElement);

            // 2. 文字スーパー (Superimpose)
            this.superimposeController = new aribb24.Controller();
            this.superimposeFeeder = new aribb24.MPEGTSFeeder({
                recieve: { type: 'Superimpose' },
                tokenizer: {},
                offset: {},
            });
            this.superimposeRenderer = new aribb24.CanvasMainThreadRenderer({ font: fontConfig });
            this.superimposeController.attachFeeder(this.superimposeFeeder);
            this.superimposeController.attachRenderer(this.superimposeRenderer);
            this.superimposeController.attachMedia(this.videoElement, this.containerElement);

            // HLS ID3 配信では CaptionManagement が届かないため、標準の初期管理データを注入
            this.injectDefaultCaptionManagement();

            if (this.isEnabled) {
                this.captionController.show();
                this.superimposeController.show();
            } else {
                this.captionController.hide();
                this.superimposeController.hide();
            }
        } catch (e) {
            console.warn('Failed to initialize aribb24 SubtitleManager:', e);
        }
    }

    /**
     * ARIB STD-B24 のデフォルト字幕管理データ (CaptionManagement) を feeder に注入
     *
     * 背景:
     * aribb24.js v2 は、CaptionManagement（言語コード・文字コード体系情報）を受信していない場合、
     * すべての字幕本文（CaptionStatement）を破棄（スキップ）する設計になっています。
     * node-arib-subtitle-timedmetadater は HLS の ID3 Timed Metadata 生成時に
     * data_group_id != 1 (CaptionManagement) を破棄して CaptionStatement のみを流すため、
     * HLS 配信では管理データが届かず字幕が表示されません。
     * そこで、日本のデジタル放送標準（言語: jpn, 文字コード: JIS8）の CaptionManagement
     * (グループ0 / グループ1) を初期データとして注入することで、aribb24.js v2 のデコードを成立させます。
     */
    private injectDefaultCaptionManagement(): void {
        for (const grp of [0, 1]) {
            const dataGroupId = grp << 5;
            const dgByte0 = (dataGroupId << 2) & 0xfc;
            const dgPayload = new Uint8Array([
                dgByte0,
                0x00,
                0x00,
                0x00,
                0x0b,
                0x00,
                0x01,
                0x00,
                0x6a,
                0x70,
                0x6e, // "jpn"
                0x00,
                0x00,
                0x00,
                0x00,
                0x00,
                0x00,
            ]);

            // 通常字幕 (Caption: 0x80)
            const captionHeader = new Uint8Array([0x80, 0xff, 0xf0]);
            const captionPES = new Uint8Array(captionHeader.length + dgPayload.length);
            captionPES.set(captionHeader, 0);
            captionPES.set(dgPayload, captionHeader.length);
            this.captionFeeder?.feedB24(captionPES, 0, 0);

            // 文字スーパー (Superimpose: 0x81)
            const superHeader = new Uint8Array([0x81, 0xff, 0xf0]);
            const superPES = new Uint8Array(superHeader.length + dgPayload.length);
            superPES.set(superHeader, 0);
            superPES.set(dgPayload, superHeader.length);
            this.superimposeFeeder?.feedB24(superPES, 0, 0);
        }
    }

    /**
     * 字幕の表示・非表示の切り替え
     */
    public setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        if (this.isEnabled) {
            this.captionController?.show();
            this.superimposeController?.show();
        } else {
            this.captionController?.hide();
            this.superimposeController?.hide();
        }
    }

    public getIsEnabled(): boolean {
        return this.isEnabled;
    }

    /**
     * 字幕レンダラーの破棄とリソース解放
     */
    public detach(): void {
        if (this.captionRenderer) {
            try {
                this.captionController?.detachMedia();
                this.captionController?.detachFeeder();
                this.captionController?.detachRenderer(this.captionRenderer);
                this.captionFeeder?.destroy();
                this.captionRenderer.destroy();
            } catch (e) {
                // ignore
            }
            this.captionController = null;
            this.captionFeeder = null;
            this.captionRenderer = null;
        }

        if (this.superimposeRenderer) {
            try {
                this.superimposeController?.detachMedia();
                this.superimposeController?.detachFeeder();
                this.superimposeController?.detachRenderer(this.superimposeRenderer);
                this.superimposeFeeder?.destroy();
                this.superimposeRenderer.destroy();
            } catch (e) {
                // ignore
            }
            this.superimposeController = null;
            this.superimposeFeeder = null;
            this.superimposeRenderer = null;
        }

        this.videoElement = null;
        this.containerElement = null;
    }

    /**
     * HLS から届いた ID3 Timed Metadata サンプル群をフィード
     */
    public feedHlsMetadata(samples: Array<{ pts: number; dts?: number; data: Uint8Array }>): void {
        if (!samples || samples.length === 0) return;
        let detected = false;

        for (const sample of samples) {
            if (sample.data && sample.pts !== undefined) {
                detected = true;
                // 通常は秒(seconds)で渡されるが、90kHz(クロック値)で渡された場合の安全策
                let ptsSec = sample.pts;
                if (ptsSec > 100000) {
                    ptsSec = ptsSec / 90000;
                }
                const dtsSec = sample.dts !== undefined ? (sample.dts > 100000 ? sample.dts / 90000 : sample.dts) : ptsSec;

                this.captionFeeder?.feedID3(sample.data, ptsSec, dtsSec);
                this.superimposeFeeder?.feedID3(sample.data, ptsSec, dtsSec);
            }
        }

        if (detected) {
            this.options.onSubtitleDetected?.();
        }
    }

    /**
     * MPEG-TS (M2TS-LL) から届いた PES プライベートデータをフィード
     */
    public feedMpegtsPesData(data: { stream_id: number; pid: number; pts?: number; nearest_pts?: number; dts?: number; data: Uint8Array }): void {
        if (!data?.data || data.data.length === 0) return;

        const pts = data.pts ?? data.nearest_pts;
        if (pts === undefined) return;

        const dts = data.dts ?? pts;
        const ptsSec = pts / 1000;
        const dtsSec = dts / 1000;

        // private_stream_1 (0xbd): 通常字幕 (Caption)
        if (data.stream_id === 0xbd && data.data[0] === 0x80) {
            this.options.onSubtitleDetected?.();
            this.captionFeeder?.feedB24(data.data, ptsSec, dtsSec);
        }
        // private_stream_2 (0xbf): 文字スーパー (Superimpose)
        else if (data.stream_id === 0xbf) {
            let payload = data.data;
            if (payload[0] !== 0x81) {
                const parsed = this.parseMalformedPES(data.data);
                if (parsed) payload = parsed;
            }
            if (payload && payload[0] === 0x81) {
                this.options.onSubtitleDetected?.();
                this.superimposeFeeder?.feedB24(payload, ptsSec, dtsSec);
            }
        }
    }

    /**
     * MPEG-TS 経由で ID3 メタデータが届いた場合のフィード (tsreadex等)
     */
    public feedMpegtsId3Data(data: { pts?: number; nearest_pts?: number; dts?: number; data: Uint8Array }): void {
        if (!data?.data) return;
        const pts = data.pts ?? data.nearest_pts;
        if (pts === undefined) return;

        const dts = data.dts ?? pts;
        this.options.onSubtitleDetected?.();
        const ptsSec = pts / 1000;
        const dtsSec = dts / 1000;

        this.captionFeeder?.feedID3(data.data, ptsSec, dtsSec);
        this.superimposeFeeder?.feedID3(data.data, ptsSec, dtsSec);
    }

    /**
     * 不正な PES ヘッダー付きペイロードから ARIB データを抽出 (文字スーパー用)
     */
    private parseMalformedPES(data: Uint8Array): Uint8Array | null {
        if (data.length < 3) return null;
        const pesHeaderDataLength = data[2];
        const payloadStartIndex = 3 + pesHeaderDataLength;
        if (data.length < payloadStartIndex) return null;
        return data.subarray(payloadStartIndex);
    }
}
