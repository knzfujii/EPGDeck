import { z } from 'zod';
import { integerParam } from './common.js';

export const thumbnailParamSchema = z.object({
    thumbnailId: integerParam(),
});

export const videoFileParamSchema = z.object({
    videoFileId: integerParam(),
});

export const createThumbnailQuerySchema = z.object({
    seconds: z.coerce.number().min(0).optional(),
    replace: z
        .preprocess(val => {
            if (typeof val === 'string') {
                if (val === 'true' || val === '1') return true;
                if (val === 'false' || val === '0') return false;
            }
            return val;
        }, z.boolean().optional())
        .optional(),
});

export const createThumbnailBodySchema = z
    .object({
        seconds: z.number().min(0).optional(),
        replace: z.boolean().optional(),
    })
    .optional();
