import { z } from 'zod';
import { booleanQuery, integerParam, integerQuery, optionalBooleanQuery, strictBooleanQuery } from './common.js';

export const getSchedulesQuerySchema = z.object({
    startAt: integerQuery(),
    endAt: integerQuery(),
    isHalfWidth: booleanQuery(true),
    needsRawExtended: strictBooleanQuery(false),
    GR: strictBooleanQuery(false),
    BS: strictBooleanQuery(false),
    CS: strictBooleanQuery(false),
    SKY: strictBooleanQuery(false),
    isFree: optionalBooleanQuery(),
});

export const getBroadcastingQuerySchema = z.object({
    isHalfWidth: booleanQuery(true),
    time: integerQuery(),
});

export const programIdParamSchema = z.object({
    programId: integerParam(),
});

export const channelScheduleParamSchema = z.object({
    channelId: integerParam(),
});

export const getChannelScheduleQuerySchema = z.object({
    startAt: integerQuery(),
    days: integerQuery(),
    isHalfWidth: booleanQuery(true),
    needsRawExtended: strictBooleanQuery(false),
    isFree: optionalBooleanQuery(),
});
