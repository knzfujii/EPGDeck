import { z } from 'zod';

/**
 * Boolean query parameter that defaults to true unless explicitly 'false' (e.g., isHalfWidth)
 */
export const booleanQuery = (defaultValue = true) =>
    z
        .union([z.string(), z.boolean()])
        .optional()
        .transform(val => {
            if (val === undefined) return defaultValue;
            if (typeof val === 'boolean') return val;
            return val !== 'false';
        });

/**
 * Strict boolean query parameter that defaults to false unless explicitly 'true'
 */
export const strictBooleanQuery = (defaultValue = false) =>
    z
        .union([z.string(), z.boolean()])
        .optional()
        .transform(val => {
            if (val === undefined) return defaultValue;
            if (typeof val === 'boolean') return val;
            return val === 'true';
        });

/**
 * Optional boolean query parameter: returns undefined if omitted, otherwise boolean (val === 'true')
 */
export const optionalBooleanQuery = () =>
    z
        .union([z.string(), z.boolean()])
        .optional()
        .transform(val => {
            if (val === undefined) return undefined;
            if (typeof val === 'boolean') return val;
            return val === 'true';
        });

/**
 * Integer query parameter that validates integer string or number and transforms to number
 */
export const integerQuery = () =>
    z
        .union([z.string(), z.number()])
        .optional()
        .refine(
            val =>
                val === undefined ||
                (typeof val === 'number' && Number.isInteger(val)) ||
                (typeof val === 'string' && /^-?\d+$/.test(val)),
            {
                message: 'Must be a valid integer',
            },
        )
        .transform(val => (val !== undefined ? (typeof val === 'number' ? val : parseInt(val, 10)) : undefined));

/**
 * Required integer route parameter (e.g., :id)
 */
export const integerParam = () =>
    z
        .union([z.string(), z.number()])
        .refine(
            val =>
                (typeof val === 'number' && Number.isInteger(val)) || (typeof val === 'string' && /^-?\d+$/.test(val)),
            {
                message: 'Must be a valid integer',
            },
        )
        .transform(val => (typeof val === 'number' ? val : parseInt(val, 10)));
