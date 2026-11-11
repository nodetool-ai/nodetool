// Guest half of the "timers" capability (src/host/timers.cpp): Node's
// setTimeout, setInterval and setImmediate with their clear functions,
// installed as globals by guest/env/index.mjs.
//
// Timers fire on the kernel loop as macrotasks: after every pending
// microtask, one callback per turn, in deadline order. The delay follows
// Node: anything that is not a number from 1 to 2^31 - 1 becomes 1 ms.
// setImmediate is a timer with no delay, so it runs before a setTimeout set
// at the same time. Timers do not outlive the run (or the bundle load) that
// set them: the runner drops the ones still pending when it ends.
//
// Differences from Node: ref() and unref() only record the flag, because a
// run waits for its own work rather than for timers, and refresh() gives the
// timer a new numeric id.
const TIMEOUT_MAX = 2 ** 31 - 1;

function host() {
  const timers = globalThis.__host?.timers;
  if (!timers) throw new Error("guest: the timers capability is unavailable in the native runner");
  return timers;
}

function checkCallback(callback) {
  if (typeof callback !== "function") {
    const error = new TypeError(`The "callback" argument must be of type function. Received ${describe(callback)}`);
    error.code = "ERR_INVALID_ARG_TYPE";
    throw error;
  }
}

function describe(value) {
  if (value === null || value === undefined) return String(value);
  return `type ${typeof value} (${String(value)})`;
}

function delayOf(after) {
  const ms = after * 1;
  return ms >= 1 && ms <= TIMEOUT_MAX ? ms : 1;
}

class Timeout {
  #id;
  #fire;
  #delay;
  #repeat;
  #ref = true;

  constructor(fire, delay, repeat) {
    this.#fire = fire;
    this.#delay = delay;
    this.#repeat = repeat;
    this.#id = host().set(fire, delay, repeat);
  }

  ref() {
    this.#ref = true;
    return this;
  }

  unref() {
    this.#ref = false;
    return this;
  }

  hasRef() {
    return this.#ref;
  }

  refresh() {
    if (host().clear(this.#id)) this.#id = host().set(this.#fire, this.#delay, this.#repeat);
    return this;
  }

  close() {
    host().clear(this.#id);
    return this;
  }

  [Symbol.toPrimitive]() {
    return this.#id;
  }
}

class Immediate {
  #id;
  #ref = true;

  constructor(fire) {
    this.#id = host().set(fire, 0, false);
  }

  ref() {
    this.#ref = true;
    return this;
  }

  unref() {
    this.#ref = false;
    return this;
  }

  hasRef() {
    return this.#ref;
  }

  [Symbol.toPrimitive]() {
    return this.#id;
  }
}

function bind(callback, args) {
  return args.length === 0 ? () => callback() : () => callback(...args);
}

export function setTimeout(callback, after, ...args) {
  checkCallback(callback);
  return new Timeout(bind(callback, args), delayOf(after), false);
}

export function setInterval(callback, repeat, ...args) {
  checkCallback(callback);
  return new Timeout(bind(callback, args), delayOf(repeat), true);
}

export function setImmediate(callback, ...args) {
  checkCallback(callback);
  return new Immediate(bind(callback, args));
}

/** Accepts a Timeout or Immediate, or the number or numeric string it converts to. */
export function clearTimeout(timer) {
  if (timer instanceof Timeout) {
    timer.close();
    return;
  }
  if (timer instanceof Immediate) {
    host().clear(timer[Symbol.toPrimitive]());
    return;
  }
  if (typeof timer === "number" || typeof timer === "string") {
    const id = Number(timer);
    if (Number.isInteger(id) && id > 0) host().clear(id);
  }
}

export const clearInterval = clearTimeout;
export const clearImmediate = clearTimeout;
