export interface EncodeRow {
    mode: string;
    parentDir: string;
    subDir: string;
}

export interface RecordingOptionState {
    saveParentDir: string;
    saveSubDir: string;
    encRows: EncodeRow[];
    isDeleteOriginal: boolean;
    allowEndLack: boolean;
}

export function getDefaultRecordingOptionState(): RecordingOptionState {
    return {
        saveParentDir: '',
        saveSubDir: '',
        encRows: [{ mode: '', parentDir: '', subDir: '' }],
        isDeleteOriginal: false,
        allowEndLack: false,
    };
}

export function loadRecordingOptionState(reserve: any): RecordingOptionState {
    if (!reserve) {
        return getDefaultRecordingOptionState();
    }

    const encRows: EncodeRow[] = [
        {
            mode: reserve.encodeMode1 || '',
            parentDir: reserve.encodeParentDirectoryName1 || '',
            subDir: reserve.encodeDirectory1 || '',
        },
        {
            mode: reserve.encodeMode2 || '',
            parentDir: reserve.encodeParentDirectoryName2 || '',
            subDir: reserve.encodeDirectory2 || '',
        },
        {
            mode: reserve.encodeMode3 || '',
            parentDir: reserve.encodeParentDirectoryName3 || '',
            subDir: reserve.encodeDirectory3 || '',
        },
    ].filter(r => r.mode || r.parentDir || r.subDir);

    return {
        saveParentDir: reserve.parentDirectoryName || '',
        saveSubDir: reserve.directory || '',
        encRows: encRows.length > 0 ? encRows : [{ mode: '', parentDir: '', subDir: '' }],
        isDeleteOriginal: reserve.isDeleteOriginalAfterEncode || false,
        allowEndLack: reserve.allowEndLack || false,
    };
}

export function buildSaveOption(state: { saveParentDir?: string; saveSubDir?: string }) {
    return {
        parentDirectoryName: state.saveParentDir || undefined,
        directory: state.saveSubDir || undefined,
    };
}

export function buildEncodeOption(state: { encRows?: EncodeRow[]; isDeleteOriginal?: boolean }) {
    const encRows = state.encRows || [];
    const filled = encRows.filter(r => r.mode);
    return {
        mode1: filled[0]?.mode || undefined,
        encodeParentDirectoryName1: filled[0]?.parentDir || undefined,
        directory1: filled[0]?.subDir || undefined,
        mode2: filled[1]?.mode || undefined,
        encodeParentDirectoryName2: filled[1]?.parentDir || undefined,
        directory2: filled[1]?.subDir || undefined,
        mode3: filled[2]?.mode || undefined,
        encodeParentDirectoryName3: filled[2]?.parentDir || undefined,
        directory3: filled[2]?.subDir || undefined,
        isDeleteOriginalAfterEncode: state.isDeleteOriginal || false,
    };
}
