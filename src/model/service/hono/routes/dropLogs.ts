import { Hono } from 'hono';
import IDropLogApiModel, { DropLogApiErrors } from '../../../api/dropLog/IDropLogApiModel';
import container from '../../../ModelContainer';
import * as api from '../HonoApiUtil';

const app = new Hono();

// GET /api/dropLogs/:dropLogFileId
app.get('/:dropLogFileId', async c => {
    const dropLogApiModel = container.get<IDropLogApiModel>('IDropLogApiModel');
    const dropLogFileId = parseInt(c.req.param('dropLogFileId'), 10);
    const maxSize = parseInt(c.req.query('maxsize') || '0', 10);

    try {
        const filePath = await dropLogApiModel.getIdFilePath(dropLogFileId, maxSize);
        if (filePath === null) {
            return api.responseError(c, {
                code: 404,
                message: 'drop log file is not Found',
            });
        }
        return await api.responseFile(c, filePath, 'text/plain', false);
    } catch (err: any) {
        if (err.message === DropLogApiErrors.FILE_IS_TOO_LARGE) {
            return api.responseError(c, {
                code: 416,
                message: 'log file is too large',
            });
        }
        return api.responseServerError(c, err.message);
    }
});

export default app;
