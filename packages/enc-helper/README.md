# @epgdeck/enc-helper

Standardized FFmpeg transcoding helper and pipeline builder for EPGDeck encoding scripts.

## Overview
- **ARIB Subtitle Protection**: Automatic duration overflow (`-time_base:s 1/1000`) and unclosed duration (`-fix_sub_duration`) mitigation.
- **Audio Routing**: Automatic dual-mono extraction (`split`, `main`, `sub`) and multi-audio track mapping.
- **Aspect Ratio Normalization**: Auto SAR/DAR correction for Japanese ISDB-T (1440x1080 -> setsar 4:3 or 16:9 square pixel scaling).
- **Stream Verification**: Output duration probe check to prevent corrupted or truncated encodes from deleting source TS files.
