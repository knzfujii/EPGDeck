import { z } from 'zod';
import { booleanQuery, integerParam } from './common.js';

export const encodeIdParamSchema = z.object({
    encodeId: integerParam(),
});

export const getEncodeQuerySchema = z.object({
    isHalfWidth: booleanQuery(true),
});

export const createEncodeJsonSchema = z.record(z.string(), z.any());
