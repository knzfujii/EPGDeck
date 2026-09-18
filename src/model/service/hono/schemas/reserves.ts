import { z } from 'zod';
import { booleanQuery, integerParam, integerQuery } from './common.js';

export const getReservesQuerySchema = z.object({
    isHalfWidth: booleanQuery(true),
    type: z.enum(['all', 'normal', 'conflict']).optional(),
    ruleId: integerQuery(),
    offset: integerQuery(),
    limit: integerQuery(),
});

export const getReserveListsQuerySchema = z.object({
    startAt: integerQuery(),
    endAt: integerQuery(),
});

export const reserveIdParamSchema = z.object({
    reserveId: integerParam(),
});
