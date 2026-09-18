import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { GetRecordedOption } from '../../../../../api.js';
import IRecordingApiModel from '../../../api/recording/IRecordingApiModel.js';
import container from '../../../ModelContainer.js';
import { getRecordingQuerySchema, recordingParamSchema } from '../schemas/recording.js';

const app = new Hono();

// GET /api/recording
app.get('/', zValidator('query', getRecordingQuerySchema), async c => {
    const recordingApiModel = container.get<IRecordingApiModel>('IRecordingApiModel');
    const query = c.req.valid('query');
    const result = await recordingApiModel.gets(query as GetRecordedOption);
    return c.json(result);
});

// POST /api/recording/resettimer
app.post('/resettimer', async c => {
    const recordingApiModel = container.get<IRecordingApiModel>('IRecordingApiModel');
    await recordingApiModel.resetTimer();
    return c.json({ code: 200 });
});

// POST /api/recording/:reserveId/finish
app.post('/:reserveId/finish', zValidator('param', recordingParamSchema), async c => {
    const recordingApiModel = container.get<IRecordingApiModel>('IRecordingApiModel');
    const { reserveId } = c.req.valid('param');
    await recordingApiModel.finish(reserveId);
    return c.json({ code: 200 });
});

// POST /api/recording/:reserveId/stop
app.post('/:reserveId/stop', zValidator('param', recordingParamSchema), async c => {
    const recordingApiModel = container.get<IRecordingApiModel>('IRecordingApiModel');
    const { reserveId } = c.req.valid('param');
    await recordingApiModel.stop(reserveId);
    return c.json({ code: 200 });
});

// POST /api/recording/:reserveId/discard
app.post('/:reserveId/discard', zValidator('param', recordingParamSchema), async c => {
    const recordingApiModel = container.get<IRecordingApiModel>('IRecordingApiModel');
    const { reserveId } = c.req.valid('param');
    await recordingApiModel.discard(reserveId);
    return c.json({ code: 200 });
});

// DELETE /api/recording/:reserveId
app.delete('/:reserveId', zValidator('param', recordingParamSchema), async c => {
    const recordingApiModel = container.get<IRecordingApiModel>('IRecordingApiModel');
    const { reserveId } = c.req.valid('param');
    await recordingApiModel.discard(reserveId);
    return c.json({ code: 200 });
});

export default app;
