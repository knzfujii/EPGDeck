import { z } from 'zod';
import { integerParam, integerQuery } from './common.js';

export const getRulesQuerySchema = z.object({
    offset: integerQuery(),
    limit: integerQuery(),
    type: z.enum(['all', 'reserve', 'conflict']).optional(),
    keyword: z.string().optional(),
});

export const ruleIdParamSchema = z.object({
    ruleId: integerParam(),
});
