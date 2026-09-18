import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import * as apid from '../../../../../api.js';
import IScheduleApiModel from '../../../api/schedule/IScheduleApiModel.js';
import container from '../../../ModelContainer.js';
import { NotFoundError } from '../../../error/ApiError.js';
import {
    channelScheduleParamSchema,
    getBroadcastingQuerySchema,
    getChannelScheduleQuerySchema,
    getSchedulesQuerySchema,
    programIdParamSchema,
    searchScheduleJsonSchema,
} from '../schemas/schedules.js';

const app = new Hono()
    // GET /api/schedules
    .get('/', zValidator('query', getSchedulesQuerySchema), async c => {
        const scheduleApiModel = container.get<IScheduleApiModel>('IScheduleApiModel');
        const query = c.req.valid('query');
        const option: apid.ScheduleOption = {
            startAt: query.startAt!,
            endAt: query.endAt!,
            isHalfWidth: query.isHalfWidth,
            needsRawExtended: query.needsRawExtended,
            GR: query.GR,
            BS: query.BS,
            CS: query.CS,
            SKY: query.SKY,
        };
        if (typeof query.isFree !== 'undefined') {
            option.isFree = query.isFree;
        }
        const result = await scheduleApiModel.getSchedules(option);
        return c.json(result);
    })
    // GET /api/schedules/broadcasting
    .get('/broadcasting', zValidator('query', getBroadcastingQuerySchema), async c => {
        const scheduleApiModel = container.get<IScheduleApiModel>('IScheduleApiModel');
        const query = c.req.valid('query');
        const option: apid.BroadcastingScheduleOption = {
            isHalfWidth: query.isHalfWidth,
        };
        if (typeof query.time !== 'undefined') {
            option.time = query.time;
        }
        const result = await scheduleApiModel.getBroadcastingSchedule(option);
        return c.json(result);
    })
    // POST /api/schedules/search
    .post('/search', zValidator('json', searchScheduleJsonSchema), async c => {
        const scheduleApiModel = container.get<IScheduleApiModel>('IScheduleApiModel');
        const body = c.req.valid('json');
        const isHalfWidth = body.isHalfWidth !== false;
        const result = await scheduleApiModel.search(body.option, isHalfWidth, body.limit);
        return c.json(result);
    })
    // GET /api/schedules/detail/:programId
    .get('/detail/:programId', zValidator('param', programIdParamSchema), async c => {
        const scheduleApiModel = container.get<IScheduleApiModel>('IScheduleApiModel');
        const { programId } = c.req.valid('param');
        const isHalfWidth = c.req.query('isHalfWidth') !== 'false';
        const program = await scheduleApiModel.getSchedule(programId, isHalfWidth);
        if (program === null) {
            throw new NotFoundError('program is not found');
        }
        return c.json(program);
    })
    // GET /api/schedules/:channelId
    .get(
        '/:channelId',
        zValidator('param', channelScheduleParamSchema),
        zValidator('query', getChannelScheduleQuerySchema),
        async c => {
            const scheduleApiModel = container.get<IScheduleApiModel>('IScheduleApiModel');
            const { channelId } = c.req.valid('param');
            const query = c.req.valid('query');
            const option: apid.ChannelScheduleOption = {
                startAt: query.startAt!,
                days: query.days!,
                isHalfWidth: query.isHalfWidth,
                needsRawExtended: query.needsRawExtended,
                channelId,
            };
            if (typeof query.isFree !== 'undefined') {
                option.isFree = query.isFree;
            }
            const result = await scheduleApiModel.getChannelSchedule(option);
            return c.json(result);
        },
    );

export default app;
