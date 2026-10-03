# arib-probe

日本のデジタル放送規格（ARIB STD-B10 / STD-B24 / STD-B32 / TR-B14 / TR-B15）に準拠した、ゼロ依存・Pure TypeScript・ESM ネイティブの MPEG-2 TS ストリーム解析・監視パッケージ。

## 主な機能

- **TS パケット同期・ヘッダー解析 (`TsPacket`)**: 188 バイト TS パケット同期、エラーフラグ (TEI)、スクランブル制御、連続性カウンタ (CC)、Adaptation Field、PCR (Program Clock Reference) 経過時間追跡。
- **セクションアセンブリ & CRC 検証 (`TsSectionAssembler`, `calcCrc32Mpeg2`)**: PUSI によるマルチパケットセクション組み立て、MPEG-2 CRC32 検証、境界値保護。
- **PSI/SI テーブルデコーダー**:
  - **PMT (`decodePmtSection`)**: ES 構成、PCR PID、音声記述子 (`audio_component_descriptor` 0xC4)。
  - **EIT (`decodeEitSection`)**: present/following 番組情報、番組名・概要、イベントリレー (`event_group_descriptor` 0xD6)、音声メタデータ。
  - **TOT/TDT (`decodeTotSection`)**: MJD + BCD による日本標準時 (JST) デコード。
- **ARIB STD-B24 文字列デコーダー (`decodeAribString`)**: 8単位符号（JIS X 0208 + ARIB 外字 `[字]`, `[解]`, `[二]` 等）の UTF-8 変換。
- **字幕 PES 解析 & ID3 Timed Metadata 生成 (`TsPesParser`, `TsSubtitleId3Muxer`)**: 33-bit 90kHz PTS デコード、ID3v2 PRIV (`aribb24.js`) フレーム生成、PMT 自動書き換え。
- **ストリームドロップ監視パイプライン (`TsProbe`)**: パケット連続性ドロップ検知、PID 別パケット統計、ストリーム種別（映像・音声・字幕・PSI・その他）自動分類。

## 技術仕様リファレンス

日本のデジタル放送における規格体系、テーブル再送周期、事業者別エッジケース（NHK デュアルモノラル、マルチ編成、イベントリレー等）の詳細については、以下をご参照ください：

👉 **[ARIB TR-B14 / TR-B15 実装仕様リファレンスガイド](./docs/arib-standards-reference.md)**

## ライセンス

MIT License
