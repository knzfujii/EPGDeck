import { z } from 'zod';
import { integerParam } from './common.js';

export const channelIdParamSchema = z.object({
    channelId: integerParam(),
});
