#!/usr/bin/env node
// First: libuv sizes its thread pool on the first job it queues.
import "@nodetool-ai/config/threadpool";
import { startServer } from "@nodetool-ai/websocket/server";
import { bundledPackSource } from "./index.js";

await startServer({ packSource: bundledPackSource });
