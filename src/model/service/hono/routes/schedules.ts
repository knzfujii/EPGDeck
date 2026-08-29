import { Hono } from 'hono';
import * as apid from '../../../../../api';
import IScheduleApiModel from '../../../api/schedule/IScheduleApiModel';
import container from '../../../ModelContainer';
import * as api from '../HonoApiUtil';

const app = new Hono();

// GET /api/schedules
app.get('/', async c => {
    const scheduleApiModel = container.get<IScheduleApiModel>('IScheduleApiModel');

    try {
        const query = c.req.query();
        const option: apid.ScheduleOption = {
            startAt: parseInt(query.startAt, 10),
            endAt: parseInt(query.endAt, 10),
            isHalfWidth: query.isHalfWidth === 'true',
            needsRawExtended: query.needsRawExtended === 'true',
            GR: query.GR === 'true',
            BS: query.BS === 'true',
            CS: query.CS === 'true',
            SKY: query.SKY === 'true',
        };
        if (typeof query.isFree !== 'undefined') {
            option.isFree = query.isFree === 'true';
        }
        const result = await scheduleApiModel.getSchedules(option);
        return api.responseJSON(c, 200, result);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// GET /api/schedules/broadcasting
app.get('/broadcasting', async c => {
    const scheduleApiModel = container.get<IScheduleApiModel>('IScheduleApiModel');

    try {
        const query = c.req.query();
        const option: apid.BroadcastingScheduleOption = {
            isHalfWidth: query.isHalfWidth === 'true',
        };
        if (typeof query.time !== 'undefined') {
            option.time = parseInt(query.time, 10);
        }

        const result = await scheduleApiModel.getBroadcastingSchedule(option);
        return api.responseJSON(c, 200, result);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// POST /api/schedules/search
app.post('/search', async c => {
    const scheduleApiModel = container.get<IScheduleApiModel>('IScheduleApiModel');

    try {
        const body = await c.req.json();
        const result = await scheduleApiModel.search(body.option, body.isHalfWidth, body.limit);
        return api.responseJSON(c, 200, result);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// GET /api/schedules/detail/:programId
app.get('/detail/:programId', async c => {
    const scheduleApiModel = container.get<IScheduleApiModel>('IScheduleApiModel');
    const programId = parseInt(c.req.param('programId'), 10);
    const isHalfWidth = c.req.query('isHalfWidth') === 'true';

    try {
        const program = await scheduleApiModel.getSchedule(programId, isHalfWidth);
        if (program === null) {
            return api.responseError(c, {
                code: 404,
                message: 'program is not found',
            });
        }
        return api.responseJSON(c, 200, program);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// GET /api/schedules/:channelId
app.get('/:channelId', async c => {
    const scheduleApiModel = container.get<IScheduleApiModel>('IScheduleApiModel');
    const channelId = parseInt(c.req.param('channelId'), 10);
    const query = c.req.query();

    try {
        const option: apid.ChannelScheduleOption = {
            startAt: parseInt(query.startAt, 10),
            days: parseInt(query.days, 10),
            isHalfWidth: query.isHalfWidth === 'true',
            needsRawExtended: query.needsRawExtended === 'true',
            channelId,
        };
        if (typeof query.isFree !== 'undefined') {
            option.isFree = query.isFree === 'true';
        }
        const result = await scheduleApiModel.getChannelSchedule(option);
        return api.responseJSON(c, 200, result);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

export default app;
