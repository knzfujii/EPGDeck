import { z } from 'zod';
import { integerQuery } from './common.js';

export const getLogsQuerySchema = z.object({
    limit: integerQuery(),
    level: z.enum(['all', 'info', 'warn', 'error', 'debug']).optional(),
    process: z.enum(['all', 'system', 'stream', 'encode']).optional(),
    category: z.enum(['all', 'system', 'access', 'stream', 'encode']).optional(),
    search: z.string().optional(),
});
