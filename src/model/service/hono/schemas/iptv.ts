import { z } from 'zod';
import { booleanQuery, integerQuery } from './common.js';

export const iptvChannelQuerySchema = z.object({
    mode: integerQuery(),
    isHalfWidth: booleanQuery(true),
});

export const iptvEpgQuerySchema = z.object({
    days: integerQuery(),
    isHalfWidth: booleanQuery(true),
});
