import { z } from 'zod';
import { integerParam } from './common.js';

export const thumbnailParamSchema = z.object({
    thumbnailId: integerParam(),
});

export const videoFileParamSchema = z.object({
    videoFileId: integerParam(),
});
