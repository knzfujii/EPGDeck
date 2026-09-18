import { z } from 'zod';

export const unlockJsonSchema = z.object({
    password: z.string(),
});
