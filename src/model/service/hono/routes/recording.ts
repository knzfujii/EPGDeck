import { Hono } from 'hono';
import { GetRecordedOption } from '../../../../../api';
import IRecordingApiModel from '../../../api/recording/IRecordingApiModel';
import container from '../../../ModelContainer';
import * as api from '../HonoApiUtil';

const app = new Hono();

// GET /api/recording
app.get('/', async c => {
    const recordingApiModel = container.get<IRecordingApiModel>('IRecordingApiModel');
    const query = c.req.query();

    try {
        const option: GetRecordedOption = {
            isHalfWidth: query.isHalfWidth === 'true',
        };
        if (typeof query.offset !== 'undefined') {
            option.offset = parseInt(query.offset, 10);
        }
        if (typeof query.limit !== 'undefined') {
            option.limit = parseInt(query.limit, 10);
        }
        if (typeof query.isReverse !== 'undefined') {
            option.isReverse = query.isReverse === 'true';
        }
        if (typeof query.ruleId !== 'undefined') {
            option.ruleId = parseInt(query.ruleId, 10);
        }
        if (typeof query.channelId !== 'undefined') {
            option.channelId = parseInt(query.channelId, 10);
        }
        if (typeof query.genre !== 'undefined') {
            option.genre = parseInt(query.genre, 10);
        }
        if (typeof query.keyword === 'string') {
            option.keyword = query.keyword;
        }

        const result = await recordingApiModel.gets(option);
        return api.responseJSON(c, 200, result);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// POST /api/recording/resettimer
app.post('/resettimer', async c => {
    const recordingApiModel = container.get<IRecordingApiModel>('IRecordingApiModel');

    try {
        await recordingApiModel.resetTimer();
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

export default app;
