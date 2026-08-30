import { Hono } from 'hono';
import container from '../../../ModelContainer';
import { LogCategory, LogEntryLevel, LogProcess } from '../../../ILogger';
import ILogManageModel from '../../log/ILogManageModel';
import * as api from '../HonoApiUtil';
import * as fs from 'fs';

const app = new Hono();

// GET /api/logs
app.get('/', async c => {
    const logManage = container.get<ILogManageModel>('ILogManageModel');

    const limitStr = c.req.query('limit');
    const levelStr = c.req.query('level') as LogEntryLevel | undefined;
    const processStr = c.req.query('process') as LogProcess | undefined;
    const categoryStr = c.req.query('category') as LogCategory | undefined;
    const searchStr = c.req.query('search');

    const limit = limitStr ? parseInt(limitStr, 10) : 500;

    const logs = logManage.getLogs({
        limit: isNaN(limit) ? 500 : limit,
        level: levelStr,
        process: processStr,
        category: categoryStr,
        search: searchStr,
    });

    return api.responseJSON(c, 200, {
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
        return api.responseError(c, {
            code: 404,
            message: 'Log file not found',
        });
    }

    return await api.responseFile(c, filePath, 'text/plain; charset=utf-8', true);
});

// POST /api/logs/clear
app.post('/clear', async c => {
    const logManage = container.get<ILogManageModel>('ILogManageModel');
    logManage.clear();
    return api.responseJSON(c, 200, { message: 'ok' });
});

export default app;
