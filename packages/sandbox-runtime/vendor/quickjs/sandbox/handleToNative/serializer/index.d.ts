import type { Serializer } from '../../../types/Serializer.js';
export declare const serializer: Map<string, Serializer>;
/**
 * Add a new Serializer
 */
export declare const addSerializer: (name: string, fn: Serializer) => Map<string, Serializer>;
/**
 * Get a Serializer by constructor name
 */
export declare const getSerializer: (name: string) => Serializer | undefined;
