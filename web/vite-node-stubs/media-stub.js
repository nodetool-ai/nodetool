// Browser replacement for @nodetool-ai/runtime/media. The real module runs
// libav through node-av, a native addon no browser bundle can load. The
// browser runner reaches it only through server paths it never calls, such as
// a provider's frame sampling.
export {};
