import { z } from 'zod';
import { integerParam, optionalBooleanQuery } from './common.js';

export const videoParamSchema = z.object({
    videoFileId: integerParam(),
});

export const videoGetQuerySchema = z.object({
    isDownload: optionalBooleanQuery(),
});
