import { z } from 'zod';
import { booleanQuery, integerParam, integerQuery, optionalBooleanQuery } from './common.js';

export const getRecordingQuerySchema = z.object({
    isHalfWidth: booleanQuery(true),
    offset: integerQuery(),
    limit: integerQuery(),
    isReverse: optionalBooleanQuery(),
    ruleId: integerQuery(),
    channelId: integerQuery(),
    genre: integerQuery(),
    keyword: z.string().optional(),
});

export const recordingParamSchema = z.object({
    reserveId: integerParam(),
});
