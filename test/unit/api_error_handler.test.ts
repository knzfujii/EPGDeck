import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import createHonoApp from '../../src/model/service/hono/createHonoApp.js';
import {
    BadRequestError,
    ConflictError,
    NotFoundError,
    ServiceUnavailableError,
    resolveApiError,
} from '../../src/model/error/ApiError.js';
import IConfigFile from '../../src/model/IConfigFile.js';
import ILogger from '../../src/model/ILogger.js';
import container from '../../src/model/ModelContainer.js';
import IReserveApiModel from '../../src/model/api/reserve/IReserveApiModel.js';

describe('API Error Handler & Domain Errors', () => {
    it('resolves ApiError instances correctly', () => {
        const notFound = new NotFoundError('item not found', 'ItemNotFound');
        expect(resolveApiError(notFound)).toEqual({
            code: 404,
            message: 'item not found',
            errors: 'ItemNotFound',
        });

        const badRequest = new BadRequestError('invalid input');
        expect(resolveApiError(badRequest)).toEqual({
            code: 400,
            message: 'invalid input',
            errors: undefined,
        });

        const conflict = new ConflictError('conflict detected');
        expect(resolveApiError(conflict)).toEqual({
            code: 409,
            message: 'conflict detected',
            errors: undefined,
        });

        const unavailable = new ServiceUnavailableError('tuner busy');
        expect(resolveApiError(unavailable)).toEqual({
            code: 503,
            message: 'tuner busy',
            errors: undefined,
        });
    });

    it('resolves legacy domain error messages to appropriate status codes', () => {
        const reservedErr = new Error('ReservationManageModelReservedError');
        expect(resolveApiError(reservedErr).code).toBe(409);

        const conflictErr = new Error('ReservationManageModelAddReserveConflict');
        expect(resolveApiError(conflictErr).code).toBe(409);

        const notFoundErr = new Error('ProgramIsNotFound');
        expect(resolveApiError(notFoundErr).code).toBe(404);

        const endedErr = new Error('ProgramIsAlreadyEnded');
        expect(resolveApiError(endedErr).code).toBe(400);

        const unknownErr = new Error('SomeUnknownFatalError');
        expect(resolveApiError(unknownErr).code).toBe(500);
    });

    it('handles thrown errors automatically in Hono app without try-catch boilerplates', async () => {
        const dummyConfig: IConfigFile = {
            server: { port: 8888, mirakurun: 'http://localhost:40772', apiServers: [], isAllowAllCORS: true },
            database: { type: 'sqlite' },
            log: { level: 'info', console: true, bufferSize: 1000 },
            epg: { intervalMinutes: 10, replaceEnclosingCharacters: true },
            recording: {
                filenameFormat: '%TITLE%',
                fileExtension: '.m2ts',
                directories: [{ name: 'recorded', path: '/tmp' }],
                historyRetentionDays: 90,
                storageCheckIntervalSeconds: 60,
                priority: { conflict: 1, recording: 2, streaming: 0 },
                timeSpecifiedStartMargin: 1,
                timeSpecifiedEndMargin: 2,
                thumbnail: { path: '/tmp', size: '480x270', positionSeconds: 5 },
                dropLog: { path: '/tmp', enabled: true },
                uploadTempDir: '/tmp',
            },
            encode: { binaries: { ffmpeg: '', ffprobe: '' }, maxProcesses: 1, concurrency: 1, presets: [] },
            streaming: { tempDir: '/tmp', live: {} as any, recorded: {} as any },
        } as any;

        const dummyLog: ILogger = {
            system: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
            access: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
            stream: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
            encode: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
        } as any;

        const mockReserveApi: Partial<IReserveApiModel> = {
            add: async () => {
                throw new Error('ReservationManageModelReservedError');
            },
        };

        if (container.isBound('IReserveApiModel')) {
            container.rebind('IReserveApiModel').toConstantValue(mockReserveApi as any);
        } else {
            container.bind('IReserveApiModel').toConstantValue(mockReserveApi as any);
        }

        const app = createHonoApp(dummyConfig, dummyLog);
        const res = await app.request('/api/reserves', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ programId: 123 }),
        });

        expect(res.status).toBe(409);
        const data = await res.json();
        expect(data.code).toBe(409);
        expect(data.errors).toBe('ReservationManageModelReservedError');
    });
});
