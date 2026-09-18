import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import * as fs from 'fs';
import container from '../../../ModelContainer.js';
import { LogCategory, LogEntryLevel, LogProcess } from '../../../ILogger.js';
import ILogManageModel from '../../log/ILogManageModel.js';
import * as api from '../HonoApiUtil.js';
import { NotFoundError } from '../../../error/ApiError.js';
import { getLogsQuerySchema } from '../schemas/logs.js';

const app = new Hono();

// GET /api/logs
app.get('/', zValidator('query', getLogsQuerySchema), async c => {
    const logManage = container.get<ILogManageModel>('ILogManageModel');
    const { limit, level, process, category, search } = c.req.valid('query');

    const logs = logManage.getLogs({
        limit: limit ?? 500,
        level: level as LogEntryLevel | undefined,
        process: process as LogProcess | undefined,
        category: category as LogCategory | undefined,
        search,
    });

    return c.json({
        logs,
        total: logs.length,
        bufferSize: logManage.getBufferSize(),
    });
});

// GET /api/logs/download
app.get('/download', async c => {
    const logManage = container.get<ILogManageModel>('ILogManageModel');
    const filePath = logManage.getLogFilePath();

    if (!filePath || !fs.existsSync(filePath)) {
        throw new NotFoundError('Log file not found');
    }

    return await api.responseFile(c, filePath, 'text/plain; charset=utf-8', true);
});

// POST /api/logs/clear
app.post('/clear', async c => {
    const logManage = container.get<ILogManageModel>('ILogManageModel');
    logManage.clear();
    return c.json({ message: 'ok' });
});

export default app;
