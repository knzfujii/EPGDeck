import { z } from 'zod';

/**
 * Boolean query parameter that defaults to true unless explicitly 'false' (e.g., isHalfWidth)
 */
export const booleanQuery = (defaultValue = true) =>
    z
        .string()
        .optional()
        .transform(val => {
            if (val === undefined) return defaultValue;
            return val !== 'false';
        });

/**
 * Strict boolean query parameter that defaults to false unless explicitly 'true'
 */
export const strictBooleanQuery = (defaultValue = false) =>
    z
        .string()
        .optional()
        .transform(val => {
            if (val === undefined) return defaultValue;
            return val === 'true';
        });

/**
 * Optional boolean query parameter: returns undefined if omitted, otherwise boolean (val === 'true')
 */
export const optionalBooleanQuery = () =>
    z
        .string()
        .optional()
        .transform(val => {
            if (val === undefined) return undefined;
            return val === 'true';
        });

/**
 * Integer query parameter that validates integer string and transforms to number
 */
export const integerQuery = () =>
    z
        .string()
        .optional()
        .refine(val => val === undefined || /^-?\d+$/.test(val), {
            message: 'Must be a valid integer',
        })
        .transform(val => (val !== undefined ? parseInt(val, 10) : undefined));

/**
 * Required integer route parameter (e.g., :id)
 */
export const integerParam = () =>
    z
        .string()
        .refine(val => /^-?\d+$/.test(val), {
            message: 'Must be a valid integer',
        })
        .transform(val => parseInt(val, 10));
