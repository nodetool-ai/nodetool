/**
 * MessageBus — In-process pub/sub for agent-to-agent communication.
 *
 * Each agent has an inbox. Messages can be sent to a specific agent
 * or broadcast to all. Subscribers get real-time notifications.
 */

import { randomUUID } from "node:crypto";
import type { AgentMessage, IMessageBus, MessageType } from "./types.js";

export type MessageHandler = (msg: AgentMessage) => void;

/** Maximum number of messages retained in the history log. */
const MAX_LOG_SIZE = 10_000;

export class MessageBus implements IMessageBus {
  /** Per-agent inbox queues. */
  private inboxes = new Map<string, AgentMessage[]>();
  /** Per-agent subscribers for real-time push. */
  private subscribers = new Map<string, Set<MessageHandler>>();
  /** Full message log for history/debugging (bounded). */
  private log: AgentMessage[] = [];

  /**
   * Register an agent so it has an inbox.
   */
  register(agentId: string): void {
    if (!this.inboxes.has(agentId)) {
      this.inboxes.set(agentId, []);
    }
  }

  /**
   * Send a message. Delivers to target inbox(es) and notifies subscribers.
   */
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
      // Broadcast to all registered agents except sender
      for (const [agentId, inbox] of this.inboxes) {
        if (agentId !== opts.from) {
          inbox.push(msg);
          this.notify(agentId, msg);
        }
      }
    } else {
      const inbox = this.inboxes.get(opts.to);
      if (inbox) {
        inbox.push(msg);
        this.notify(opts.to, msg);
      }
    }

    return msg;
  }

  /**
   * Pull all pending messages for an agent (drains the inbox).
   */
  receive(agentId: string): AgentMessage[] {
    const inbox = this.inboxes.get(agentId);
    if (!inbox || inbox.length === 0) return [];
    const messages = [...inbox];
    inbox.length = 0;
    return messages;
  }

  /**
   * Peek at pending messages without consuming them.
   */
  peek(agentId: string): AgentMessage[] {
    return [...(this.inboxes.get(agentId) ?? [])];
  }

  /**
   * Subscribe to real-time message delivery for an agent.
   */
  subscribe(agentId: string, handler: MessageHandler): () => void {
    let handlers = this.subscribers.get(agentId);
    if (!handlers) {
      handlers = new Set();
      this.subscribers.set(agentId, handlers);
    }
    handlers.add(handler);
    return () => handlers!.delete(handler);
  }

  /**
   * Get the full conversation thread starting from a message.
   */
  getThread(messageId: string): AgentMessage[] {
    // Find the root of the thread
    let rootId = messageId;
    const msgMap = new Map(this.log.map((m) => [m.id, m]));
    let current = msgMap.get(rootId);
    while (current?.replyTo) {
      rootId = current.replyTo;
      current = msgMap.get(rootId);
    }

    // Collect all messages in the thread
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
        // Find replies to this message
        for (const m of this.log) {
          if (m.replyTo === id && !visited.has(m.id)) {
            queue.push(m.id);
          }
        }
      }
    }

    return thread.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get full message history.
   */
  getHistory(): AgentMessage[] {
    return [...this.log];
  }

  /**
   * Get message count for an agent's inbox.
   */
  pendingCount(agentId: string): number {
    return this.inboxes.get(agentId)?.length ?? 0;
  }

  private notify(agentId: string, msg: AgentMessage): void {
    const handlers = this.subscribers.get(agentId);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(msg);
        } catch {
          // Don't let subscriber errors break delivery
        }
      }
    }
  }
}
