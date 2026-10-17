import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import container from '../../../ModelContainer.js';
import * as api from '../HonoApiUtil.js';
import { NotFoundError } from '../../../error/ApiError.js';
import { dropLogParamSchema, dropLogQuerySchema } from '../schemas/dropLogs.js';

const app = new Hono()
    // GET /api/dropLogs/:dropLogFileId
    .get(
        '/:dropLogFileId',
        zValidator('param', dropLogParamSchema),
        zValidator('query', dropLogQuerySchema),
        async c => {
            const dropLogApiModel = container.dropLogApiModel;
            const { dropLogFileId } = c.req.valid('param');
            const { maxsize } = c.req.valid('query');

            const filePath = await dropLogApiModel.getIdFilePath(dropLogFileId, maxsize || 0);
            if (filePath === null) {
                throw new NotFoundError('drop log file is not Found');
            }
            return await api.responseFile(c, filePath, 'text/plain', false);
        },
    );

export default app;
