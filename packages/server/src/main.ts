#!/usr/bin/env node
import { startServer } from "@nodetool-ai/websocket/server";
import { bundledPackSource } from "./index.js";

await startServer({ packSource: bundledPackSource });
