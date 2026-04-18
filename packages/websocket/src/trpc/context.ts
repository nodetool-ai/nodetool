import type { FastifyRequest } from "fastify";
import type { NodeRegistry } from "@nodetool/node-sdk";
import type { PythonStdioBridge } from "@nodetool/runtime";
import type { HttpApiOptions } from "../http-api.js";

export interface Context {
  userId: string | null;
  registry: NodeRegistry;
  apiOptions: HttpApiOptions;
  pythonBridge: PythonStdioBridge;
  getPythonBridgeReady: () => boolean;
}

export interface ContextFactoryInput {
  registry: NodeRegistry;
  apiOptions: HttpApiOptions;
  pythonBridge: PythonStdioBridge;
  getPythonBridgeReady: () => boolean;
}

export function createContextFactory(
  deps: ContextFactoryInput
): (opts: { req: FastifyRequest }) => Context {
  return ({ req }) => ({
    userId: req.userId,
    registry: deps.registry,
    apiOptions: deps.apiOptions,
    pythonBridge: deps.pythonBridge,
    getPythonBridgeReady: deps.getPythonBridgeReady
  });
}
