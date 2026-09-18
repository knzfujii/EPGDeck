import { z } from 'zod';
import { booleanQuery, integerParam, integerQuery } from './common.js';

export const streamIdParamSchema = z.object({
    streamId: integerParam(),
});

export const liveStreamParamSchema = z.object({
    channelId: integerParam(),
});

export const videoFileIdStreamParamSchema = z.object({
    videoFileId: integerParam(),
});

export const getStreamsQuerySchema = z.object({
    isHalfWidth: booleanQuery(true),
});

export const streamModeQuerySchema = z.object({
    mode: integerQuery(),
});

export const recordedStreamQuerySchema = z.object({
    mode: integerQuery(),
    ss: integerQuery(),
});
