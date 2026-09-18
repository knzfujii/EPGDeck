import { z } from 'zod';
import { integerParam, integerQuery, optionalBooleanQuery } from './common.js';

export const getRulesQuerySchema = z.object({
    isHalfWidth: optionalBooleanQuery(),
    offset: integerQuery(),
    limit: integerQuery(),
    type: z.enum(['all', 'reserve', 'conflict']).optional(),
    keyword: z.string().optional(),
});

export const ruleIdParamSchema = z.object({
    ruleId: integerParam(),
});

export const editRuleJsonSchema = z.record(z.string(), z.any());
