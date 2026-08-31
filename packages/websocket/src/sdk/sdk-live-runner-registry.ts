import { randomUUID } from "node:crypto";
import type { SdkExecutionCapacitySnapshot } from "../websocket-client-session.js";

interface SdkLiveRunnerCapacitySource {
  getSdkExecutionCapacitySnapshot(input: {
    workflowId: string;
    concurrent?: boolean;
  }): Promise<SdkExecutionCapacitySnapshot>;
}

interface RegisteredRunner {
  userId: string;
  source: SdkLiveRunnerCapacitySource;
}

export class SdkLiveRunnerRegistry {
  private readonly runners = new Map<string, RegisteredRunner>();

  register(userId: string, source: SdkLiveRunnerCapacitySource): string {
    const id = randomUUID();
    this.runners.set(id, { userId, source });
    return id;
  }

  unregister(id: string): void {
    this.runners.delete(id);
  }

  has(id: string, userId: string): boolean {
    return this.runners.get(id)?.userId === userId;
  }

  async getCapacity(input: {
    runnerId: string;
    userId: string;
    workflowId: string;
    concurrent?: boolean;
  }): Promise<SdkExecutionCapacitySnapshot> {
    const registered = this.runners.get(input.runnerId);
    if (!registered || registered.userId !== input.userId) {
      throw new Error("Selected live runner is unavailable.");
    }
    return registered.source.getSdkExecutionCapacitySnapshot({
      workflowId: input.workflowId,
      concurrent: input.concurrent
    });
  }
}
