import { z } from 'zod';
import { integerParam, integerQuery } from './common.js';

export const getTagsQuerySchema = z.object({
    offset: integerQuery(),
    limit: integerQuery(),
    name: z.string().optional(),
});

export const tagIdParamSchema = z.object({
    tagId: integerParam(),
});
