/**
 * EdgeMessageBus — IMessageBus implementation that routes agent messages
 * through the workflow kernel's edge system via ProcessingContext.
 *
 * Each agent is a node in the workflow graph. Messages are sent as control
 * events to target agent nodes. The target node receives the message in its
 * inbox and processes it as part of its execution loop.
 *
 * Falls back to in-memory buffering for agents that don't have a corresponding
 * workflow node (e.g. programmatic-only agents within a TeamNode).
 */

import { randomUUID } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { AgentMessage, IMessageBus, MessageType } from "./types.js";

const log = createLogger("agents:edge-message-bus");

/** Maximum number of messages retained in the history log. */
const MAX_LOG_SIZE = 10_000;

export class EdgeMessageBus implements IMessageBus {
  /** In-memory fallback inboxes for agents without workflow nodes. */
  private inboxes = new Map<string, AgentMessage[]>();
  /** Mapping from agent ID → workflow node ID for edge routing. */
  private nodeMap = new Map<string, string>();
  /** Real-time subscribers. */
  private subscribers = new Map<string, Set<(msg: AgentMessage) => void>>();
  /** Full message log (bounded). */
  private log: AgentMessage[] = [];
  /** Processing context for sending control events. */
  private context: ProcessingContext | null;

  constructor(context?: ProcessingContext) {
    this.context = context ?? null;
  }

  /**
   * Map an agent ID to a workflow node ID for edge-based routing.
   * When set, messages to this agent will be sent as control events
   * to the corresponding node.
   */
  mapAgentToNode(agentId: string, nodeId: string): void {
    this.nodeMap.set(agentId, nodeId);
  }

  register(agentId: string): void {
    if (!this.inboxes.has(agentId)) {
      this.inboxes.set(agentId, []);
    }
  }

  send(opts: {
    from: string;
    to: string | "all";
    type: MessageType;
    subject: string;
    body: string;
    replyTo?: string;
    taskId?: string;
  }): AgentMessage {
    const msg: AgentMessage = {
      id: randomUUID(),
      from: opts.from,
      to: opts.to,
      type: opts.type,
      subject: opts.subject,
      body: opts.body,
      replyTo: opts.replyTo,
      taskId: opts.taskId,
      timestamp: Date.now()
    };

    this.log.push(msg);
    if (this.log.length > MAX_LOG_SIZE) {
      this.log = this.log.slice(-Math.floor(MAX_LOG_SIZE * 0.75));
    }

    if (opts.to === "all") {
      for (const [agentId] of this.inboxes) {
        if (agentId !== opts.from) {
          this.deliver(agentId, msg);
        }
      }
    } else {
      this.deliver(opts.to, msg);
    }

    return msg;
  }

  receive(agentId: string): AgentMessage[] {
    const inbox = this.inboxes.get(agentId);
    if (!inbox || inbox.length === 0) return [];
    const messages = [...inbox];
    inbox.length = 0;
    return messages;
  }

  peek(agentId: string): AgentMessage[] {
    return [...(this.inboxes.get(agentId) ?? [])];
  }

  subscribe(agentId: string, handler: (msg: AgentMessage) => void): () => void {
    let handlers = this.subscribers.get(agentId);
    if (!handlers) {
      handlers = new Set();
      this.subscribers.set(agentId, handlers);
    }
    handlers.add(handler);
    return () => handlers!.delete(handler);
  }

  getThread(messageId: string): AgentMessage[] {
    let rootId = messageId;
    const msgMap = new Map(this.log.map((m) => [m.id, m]));
    let current = msgMap.get(rootId);
    while (current?.replyTo) {
      rootId = current.replyTo;
      current = msgMap.get(rootId);
    }
    const thread: AgentMessage[] = [];
    const visited = new Set<string>();
    const queue = [rootId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const msg = msgMap.get(id);
      if (msg) {
        thread.push(msg);
        for (const m of this.log) {
          if (m.replyTo === id && !visited.has(m.id)) {
            queue.push(m.id);
          }
        }
      }
    }
    return thread.sort((a, b) => a.timestamp - b.timestamp);
  }

  getHistory(): AgentMessage[] {
    return [...this.log];
  }

  pendingCount(agentId: string): number {
    return this.inboxes.get(agentId)?.length ?? 0;
  }

  // ─── Internal ───

  private deliver(agentId: string, msg: AgentMessage): void {
    const nodeId = this.nodeMap.get(agentId);

    // Try edge routing first: send as control event to the agent's node
    if (nodeId && this.context?.hasControlEventSupport) {
      // Fire-and-forget: the control event delivers the message payload
      // to the target node's __control__ inbox. The node picks it up
      // on its next iteration.
      this.context
        .sendControlEvent(nodeId, {
          __agent_message__: true,
          message: msg
        })
        .catch((err) => {
          // Intentional: if edge delivery fails, fall back to in-memory buffering
          log.warn(
            "Edge message delivery failed, falling back to in-memory buffer",
            { agentId, error: String(err) }
          );
          this.bufferMessage(agentId, msg);
        });
    } else {
      // In-memory fallback
      this.bufferMessage(agentId, msg);
    }
  }

  private bufferMessage(agentId: string, msg: AgentMessage): void {
    const inbox = this.inboxes.get(agentId);
    if (inbox) {
      inbox.push(msg);
    }
    // Notify subscribers
    const handlers = this.subscribers.get(agentId);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(msg);
        } catch {
          // ignore
        }
      }
    }
  }
}
