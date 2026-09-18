import { z } from 'zod';
import { integerParam, integerQuery } from './common.js';

export const dropLogParamSchema = z.object({
    dropLogFileId: integerParam(),
});

export const dropLogQuerySchema = z.object({
    maxsize: integerQuery(),
});
