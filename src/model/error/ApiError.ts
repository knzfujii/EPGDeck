/**
 * API Error hierarchy and error resolver
 */

export class ApiError extends Error {
    readonly code: number;
    readonly errors?: string;

    constructor(code: number, message: string, errors?: string) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.errors = errors;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class BadRequestError extends ApiError {
    constructor(message: string, errors?: string) {
        super(400, message, errors);
        this.name = 'BadRequestError';
    }
}

export class NotFoundError extends ApiError {
    constructor(message: string, errors?: string) {
        super(404, message, errors);
        this.name = 'NotFoundError';
    }
}

export class ConflictError extends ApiError {
    constructor(message: string, errors?: string) {
        super(409, message, errors);
        this.name = 'ConflictError';
    }
}

export class ServiceUnavailableError extends ApiError {
    constructor(message: string, errors?: string) {
        super(503, message, errors);
        this.name = 'ServiceUnavailableError';
    }
}

export interface ResolvedApiError {
    code: number;
    message: string;
    errors?: string;
}

/**
 * Resolves unknown/domain error to standardized API error structure
 */
export function resolveApiError(err: any): ResolvedApiError {
    if (err instanceof ApiError) {
        return {
            code: err.code,
            message: err.message,
            errors: err.errors,
        };
    }

    const msg = err?.message;
    if (typeof msg === 'string') {
        // 409 Conflict
        if (msg === 'ReservationManageModelReservedError') {
            return {
                code: 409,
                message: 'この番組はすでに予約されています',
                errors: 'ReservationManageModelReservedError',
            };
        }
        if (msg === 'RecordedIsProtected') {
            return {
                code: 409,
                message: 'Recorded is protected',
                errors: 'RecordedIsProtected',
            };
        }
        if (msg === 'ReservationManageModelAddReserveConflict' || msg === 'AddReservationConflictError') {
            return {
                code: 409,
                message: '予約が他の録画と重複・競合しています',
                errors: msg,
            };
        }

        // 404 Not Found
        if (
            msg === 'ProgramIsNotFound' ||
            msg === 'ReserveIsNotFound' ||
            msg === 'RuleIsNotFound' ||
            msg === 'RecordedIsNotFound' ||
            msg === 'FileIsNotFound' ||
            msg === 'ChannelLogoNotFound' ||
            msg === 'VideoFileIsUndefined' ||
            msg.includes('is not found')
        ) {
            return {
                code: 404,
                message:
                    msg === 'VideoFileIsUndefined' ? 'video file is not found' : '指定されたリソースが見つかりません',
                errors: msg,
            };
        }

        // 400 Bad Request
        if (
            msg === 'ProgramIsAlreadyEnded' ||
            msg === 'InvalidOption' ||
            msg === 'InvalidParam' ||
            msg === 'HostIsUndefined'
        ) {
            return {
                code: 400,
                message: '不正なリクエストパラメータです',
                errors: msg,
            };
        }

        // 416 File Too Large
        if (msg === 'FileIsTooLarge') {
            return {
                code: 416,
                message: 'log file is too large',
                errors: msg,
            };
        }

        // 503 Tuner unavailable
        if (
            msg.includes('Tuner') ||
            msg.includes('Cannot get tuner') ||
            msg.includes('tuner is not found') ||
            msg.includes('503')
        ) {
            return {
                code: 503,
                message: 'Tuner Resource Unavailable',
                errors: msg,
            };
        }
    }

    return {
        code: 500,
        message: 'Internal Server Error',
        errors: msg || 'Internal Server Error',
    };
}
