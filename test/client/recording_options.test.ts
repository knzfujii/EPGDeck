import { describe, it, expect } from 'vitest';
import {
    getDefaultRecordingOptionState,
    loadRecordingOptionState,
    buildSaveOption,
    buildEncodeOption,
} from '../../client/src/lib/utils/recordingOptions';

describe('recordingOptions utility', () => {
    it('returns correct default state', () => {
        const state = getDefaultRecordingOptionState();
        expect(state.saveParentDir).toBe('');
        expect(state.saveSubDir).toBe('');
        expect(state.encRows).toEqual([{ mode: '', parentDir: '', subDir: '' }]);
        expect(state.isDeleteOriginal).toBe(false);
        expect(state.allowEndLack).toBe(false);
    });

    it('loads state from reserve object correctly', () => {
        const reserve = {
            parentDirectoryName: 'recorded_ssd',
            directory: 'anime',
            allowEndLack: true,
            encodeMode1: 'H.264',
            encodeParentDirectoryName1: 'encoded_dir',
            encodeDirectory1: 'sub',
            encodeMode2: 'H.265',
            encodeParentDirectoryName2: '',
            encodeDirectory2: '',
            isDeleteOriginalAfterEncode: true,
        };

        const state = loadRecordingOptionState(reserve);
        expect(state.saveParentDir).toBe('recorded_ssd');
        expect(state.saveSubDir).toBe('anime');
        expect(state.allowEndLack).toBe(true);
        expect(state.isDeleteOriginal).toBe(true);
        expect(state.encRows).toEqual([
            { mode: 'H.264', parentDir: 'encoded_dir', subDir: 'sub' },
            { mode: 'H.265', parentDir: '', subDir: '' },
        ]);
    });

    it('returns default state when reserve object is null/undefined', () => {
        const state = loadRecordingOptionState(null);
        expect(state).toEqual(getDefaultRecordingOptionState());
    });

    it('builds saveOption correctly', () => {
        expect(buildSaveOption({ saveParentDir: 'storage1', saveSubDir: 'dir1' })).toEqual({
            parentDirectoryName: 'storage1',
            directory: 'dir1',
        });
        expect(buildSaveOption({ saveParentDir: '', saveSubDir: '' })).toEqual({
            parentDirectoryName: undefined,
            directory: undefined,
        });
    });

    it('builds encodeOption correctly filtering empty modes', () => {
        const encRows = [
            { mode: 'H.264', parentDir: 'parent1', subDir: 'dir1' },
            { mode: '', parentDir: '', subDir: '' },
            { mode: 'H.265', parentDir: 'parent2', subDir: '' },
        ];
        const option = buildEncodeOption({ encRows, isDeleteOriginal: true });
        expect(option).toEqual({
            mode1: 'H.264',
            encodeParentDirectoryName1: 'parent1',
            directory1: 'dir1',
            mode2: 'H.265',
            encodeParentDirectoryName2: 'parent2',
            directory2: undefined,
            mode3: undefined,
            encodeParentDirectoryName3: undefined,
            directory3: undefined,
            isDeleteOriginalAfterEncode: true,
        });
    });
});
