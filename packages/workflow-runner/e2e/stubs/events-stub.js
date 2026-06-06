// Minimal `node:events` substitute. The real EventEmitter API used by
// the workspaces is small — emit / on / off / once.
export class EventEmitter {
  constructor() {
    this._listeners = new Map();
  }
  on(event, listener) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(listener);
    return this;
  }
  once(event, listener) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }
  off(event, listener) {
    const arr = this._listeners.get(event);
    if (!arr) return this;
    const i = arr.indexOf(listener);
    if (i !== -1) arr.splice(i, 1);
    return this;
  }
  emit(event, ...args) {
    const arr = this._listeners.get(event);
    if (!arr || arr.length === 0) return false;
    for (const fn of [...arr]) fn(...args);
    return true;
  }
  removeAllListeners(event) {
    if (event) this._listeners.delete(event);
    else this._listeners.clear();
    return this;
  }
  listenerCount(event) {
    return this._listeners.get(event)?.length ?? 0;
  }
}

export default EventEmitter;
export const defaultMaxListeners = 10;
