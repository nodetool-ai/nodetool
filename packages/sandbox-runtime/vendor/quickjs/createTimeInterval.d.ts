/**
 * Utilizes the standard setInterval to work properly with javascript `using` statement.
 * Because of this, the interval gets automatically cleared on dispose.
 */
export declare const createTimeInterval: (...params: Parameters<typeof setInterval>) => {
    id: ReturnType<typeof setInterval> | undefined;
    clear: () => void;
    [Symbol.dispose]: () => void;
};
