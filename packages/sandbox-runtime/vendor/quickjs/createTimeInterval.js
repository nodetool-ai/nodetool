/**
 * Utilizes the standard setInterval to work properly with javascript `using` statement.
 * Because of this, the interval gets automatically cleared on dispose.
 */
export const createTimeInterval = (...params) => {
    const interval = {
        id: setInterval(...params),
        clear: function () {
            if (this.id) {
                clearInterval(this.id);
            }
            this.id = undefined;
        },
        [Symbol.dispose]: function () {
            if (this.id) {
                clearInterval(this.id);
            }
            this.id = undefined;
        },
    };
    return interval;
};
