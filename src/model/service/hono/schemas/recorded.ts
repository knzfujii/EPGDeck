import { z } from 'zod';
import { booleanQuery, integerParam, integerQuery, optionalBooleanQuery } from './common.js';

export const getRecordedQuerySchema = z.object({
    isHalfWidth: booleanQuery(true),
    offset: integerQuery(),
    limit: integerQuery(),
    isReverse: optionalBooleanQuery(),
    reverse: optionalBooleanQuery(),
    ruleId: integerQuery(),
    channelId: integerQuery(),
    genre: integerQuery(),
    keyword: z.string().optional(),
    hasOriginalFile: optionalBooleanQuery(),
    startAt: integerQuery(),
    endAt: integerQuery(),
});

export const recordedIdParamSchema = z.object({
    recordedId: integerParam(),
});

export const getRecordedItemQuerySchema = z.object({
    isHalfWidth: optionalBooleanQuery(),
});

export const deleteRecordedQuerySchema = z.object({
    isDeleteFile: optionalBooleanQuery(),
});
