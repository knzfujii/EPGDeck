import { z } from 'zod';
import { booleanQuery, integerParam, integerQuery } from './common.js';

export const streamIdParamSchema = z.object({
    streamId: integerParam(),
});

export const liveStreamParamSchema = z.object({
    channelId: integerParam(),
});

export const recordedStreamParamSchema = z.object({
    recordedId: integerParam(),
});

export const getStreamsQuerySchema = z.object({
    isHalfWidth: booleanQuery(true),
});

export const streamModeQuerySchema = z.object({
    mode: integerQuery(),
});
