import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '../../client/src/lib/apiClient.js';
import {
    isReserveCurrentlyRecording,
    executeRecordingAction,
    type ReserveLike,
    type RecordingLike,
} from '../../client/src/lib/utils/recording.js';

vi.mock('../../client/src/lib/apiClient.js', () => ({
    default: {
        recording: {
            ':reserveId': {
                finish: { $post: vi.fn() },
                stop: { $post: vi.fn() },
                discard: { $post: vi.fn() },
            },
        },
    },
}));

describe('recording utility', () => {
    const baseReserve: ReserveLike = {
        programId: 1001,
        channelId: 10,
        startAt: 1000000,
        endAt: 2000000,
        isConflict: false,
        isOverlap: false,
        isSkip: false,
    };

    describe('when recordingList is provided', () => {
        it('returns true if programId matches', () => {
            const recordingList: RecordingLike[] = [
                {
                    programId: 1001,
                    channelId: 10,
                    startAt: 1000000,
                    endAt: 2000000,
                },
            ];
            expect(isReserveCurrentlyRecording(baseReserve, recordingList, 500000)).toBe(true);
        });

        it('returns true if channelId matches and startAt/endAt are within 60s tolerance', () => {
            const reserveWithoutProgramId: ReserveLike = {
                channelId: 10,
                startAt: 1000000,
                endAt: 2000000,
            };
            const recordingList: RecordingLike[] = [
                {
                    channelId: 10,
                    startAt: 1000000 + 30000, // +30s
                    endAt: 2000000 - 30000, // -30s
                },
            ];
            expect(isReserveCurrentlyRecording(reserveWithoutProgramId, recordingList, 500000)).toBe(true);
        });

        it('returns false if channelId matches but time difference is 60s or more and outside time window', () => {
            const reserveWithoutProgramId: ReserveLike = {
                channelId: 10,
                startAt: 1000000,
                endAt: 2000000,
            };
            const recordingList: RecordingLike[] = [
                {
                    channelId: 10,
                    startAt: 1000000 + 60000, // 60s difference
                    endAt: 2000000,
                },
            ];
            expect(isReserveCurrentlyRecording(reserveWithoutProgramId, recordingList, 500000)).toBe(false);
        });
    });

    describe('fallback to time-based detection', () => {
        const now = 1500000; // between startAt (1000000) and endAt (2000000)

        it('returns true during the broadcast window when not in conflict, overlap, or skip', () => {
            expect(isReserveCurrentlyRecording(baseReserve, [], now)).toBe(true);
            expect(isReserveCurrentlyRecording(baseReserve, null, now)).toBe(true);
        });

        it('returns false when isConflict is true even during broadcast window', () => {
            const conflictReserve: ReserveLike = {
                ...baseReserve,
                isConflict: true,
            };
            expect(isReserveCurrentlyRecording(conflictReserve, [], now)).toBe(false);
        });

        it('returns false when isOverlap is true even during broadcast window', () => {
            const overlapReserve: ReserveLike = {
                ...baseReserve,
                isOverlap: true,
            };
            expect(isReserveCurrentlyRecording(overlapReserve, [], now)).toBe(false);
        });

        it('returns false when isSkip is true even during broadcast window', () => {
            const skipReserve: ReserveLike = {
                ...baseReserve,
                isSkip: true,
            };
            expect(isReserveCurrentlyRecording(skipReserve, [], now)).toBe(false);
        });

        it('returns false before startAt', () => {
            expect(isReserveCurrentlyRecording(baseReserve, [], 999999)).toBe(false);
        });

        it('returns true exactly at startAt', () => {
            expect(isReserveCurrentlyRecording(baseReserve, [], 1000000)).toBe(true);
        });

        it('returns false exactly at endAt', () => {
            expect(isReserveCurrentlyRecording(baseReserve, [], 2000000)).toBe(false);
        });

        it('returns false after endAt', () => {
            expect(isReserveCurrentlyRecording(baseReserve, [], 2000001)).toBe(false);
        });
    });

    describe('executeRecordingAction', () => {
        const target = { id: 123, name: 'テスト番組' };
        const mockNotifier = { open: vi.fn() };

        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('executes finish action and opens success snackbar', async () => {
            (api.recording[':reserveId'].finish.$post as any).mockResolvedValueOnce({ ok: true });

            const result = await executeRecordingAction(target, 'finish', mockNotifier);

            expect(result).toBe(true);
            expect(api.recording[':reserveId'].finish.$post).toHaveBeenCalledWith({
                param: { reserveId: '123' },
            });
            expect(mockNotifier.open).toHaveBeenCalledWith({
                text: '「テスト番組」を完了として保存しました',
                color: 'success',
            });
        });

        it('executes stop action and opens info snackbar', async () => {
            (api.recording[':reserveId'].stop.$post as any).mockResolvedValueOnce({ ok: true });

            const result = await executeRecordingAction(target, 'stop', mockNotifier);

            expect(result).toBe(true);
            expect(api.recording[':reserveId'].stop.$post).toHaveBeenCalledWith({
                param: { reserveId: '123' },
            });
            expect(mockNotifier.open).toHaveBeenCalledWith({
                text: '「テスト番組」を中断して保存しました（未完了扱い）',
                color: 'info',
            });
        });

        it('executes discard action and opens warning snackbar', async () => {
            (api.recording[':reserveId'].discard.$post as any).mockResolvedValueOnce({ ok: true });

            const result = await executeRecordingAction(target, 'discard', mockNotifier);

            expect(result).toBe(true);
            expect(api.recording[':reserveId'].discard.$post).toHaveBeenCalledWith({
                param: { reserveId: '123' },
            });
            expect(mockNotifier.open).toHaveBeenCalledWith({
                text: '「テスト番組」の録画を取り消し、ファイルを破棄しました',
                color: 'warning',
            });
        });

        it('catches API error, opens error snackbar, and returns false', async () => {
            (api.recording[':reserveId'].finish.$post as any).mockRejectedValueOnce(new Error('Network error'));

            const result = await executeRecordingAction(target, 'finish', mockNotifier);

            expect(result).toBe(false);
            expect(mockNotifier.open).toHaveBeenCalledWith({
                text: 'Network error',
                color: 'error',
            });
        });

        it('handles non-Error rejection safely with fallback message', async () => {
            (api.recording[':reserveId'].finish.$post as any).mockRejectedValueOnce('Unexpected string rejection');

            const result = await executeRecordingAction(target, 'finish', mockNotifier);

            expect(result).toBe(false);
            expect(mockNotifier.open).toHaveBeenCalledWith({
                text: '録画操作の実行に失敗しました',
                color: 'error',
            });
        });
    });
});
