#!/usr/bin/env node

// Keep Jest output deterministic without relying on POSIX-only environment
// assignment syntax. Jest workers inherit this environment on every platform.
process.env.TZ = "UTC";

const { default: jest } = await import("jest");
await jest.run(process.argv.slice(2));
