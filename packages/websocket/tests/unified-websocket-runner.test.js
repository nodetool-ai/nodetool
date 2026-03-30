"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const msgpackr_1 = require("msgpackr");
const unified_websocket_runner_js_1 = require("../src/unified-websocket-runner.js");
class MockWebSocket {
    clientState = "connected";
    applicationState = "connected";
    sentBytes = [];
    sentText = [];
    queue = [];
    async accept() {
        return;
    }
    async receive() {
        const next = this.queue.shift();
        if (!next) {
            return { type: "websocket.disconnect" };
        }
        return next;
    }
    async sendBytes(data) {
        this.sentBytes.push(data);
    }
    async sendText(data) {
        this.sentText.push(data);
    }
    async close() {
        this.clientState = "disconnected";
        this.applicationState = "disconnected";
    }
}
const resolveExecutor = () => ({
    async run() {
        return {};
    },
});
(0, vitest_1.describe)("UnifiedWebSocketRunner", () => {
    let ws;
    let runner;
    (0, vitest_1.beforeEach)(() => {
        ws = new MockWebSocket();
        runner = new unified_websocket_runner_js_1.UnifiedWebSocketRunner({ resolveExecutor });
    });
    (0, vitest_1.it)("connects and defaults user id", async () => {
        await runner.connect(ws);
        (0, vitest_1.expect)(runner.userId).toBe("1");
        (0, vitest_1.expect)(runner.websocket).toBe(ws);
        await runner.disconnect();
    });
    (0, vitest_1.it)("sends binary messages by default", async () => {
        await runner.connect(ws);
        await runner.sendMessage({ type: "test", value: "hello" });
        (0, vitest_1.expect)(ws.sentBytes).toHaveLength(1);
        const decoded = (0, msgpackr_1.unpack)(ws.sentBytes[0]);
        (0, vitest_1.expect)(decoded.type).toBe("test");
        await runner.disconnect();
    });
    (0, vitest_1.it)("switches to text mode", async () => {
        const res = await runner.handleCommand({ command: "set_mode", data: { mode: "text" } });
        (0, vitest_1.expect)(res.message).toBe("Mode set to text");
        (0, vitest_1.expect)(runner.mode).toBe("text");
    });
    (0, vitest_1.it)("validates chat_message thread id", async () => {
        const res = await runner.handleCommand({ command: "chat_message", data: { content: "hello" } });
        (0, vitest_1.expect)(res.error).toContain("thread_id is required");
    });
    (0, vitest_1.it)("validates stop command reference", async () => {
        const res = await runner.handleCommand({ command: "stop", data: {} });
        (0, vitest_1.expect)(res.error).toContain("job_id or thread_id is required");
    });
    (0, vitest_1.it)("replies pong for ping in receive loop", async () => {
        await runner.connect(ws);
        ws.queue.push({ type: "websocket.message", text: JSON.stringify({ type: "ping" }) });
        ws.queue.push({ type: "websocket.disconnect" });
        await runner.receiveMessages();
        (0, vitest_1.expect)(ws.sentBytes.length + ws.sentText.length).toBeGreaterThan(0);
        const first = ws.sentBytes.length > 0 ? (0, msgpackr_1.unpack)(ws.sentBytes[0]) : JSON.parse(ws.sentText[0]);
        (0, vitest_1.expect)(first.type).toBe("pong");
        await runner.disconnect();
    });
    (0, vitest_1.it)("processes get_status command envelope", async () => {
        await runner.connect(ws);
        ws.queue.push({ type: "websocket.message", text: JSON.stringify({ command: "get_status", data: {} }) });
        ws.queue.push({ type: "websocket.disconnect" });
        await runner.receiveMessages();
        const out = (0, msgpackr_1.unpack)(ws.sentBytes[0]);
        (0, vitest_1.expect)(Array.isArray(out.active_jobs)).toBe(true);
        await runner.disconnect();
    });
    (0, vitest_1.it)("stores client tools manifest", async () => {
        await runner.connect(ws);
        ws.queue.push({
            type: "websocket.message",
            text: JSON.stringify({ type: "client_tools_manifest", tools: [{ name: "tool_1", description: "x" }] }),
        });
        ws.queue.push({ type: "websocket.disconnect" });
        const sendSpy = vitest_1.vi.spyOn(runner, "sendMessage");
        await runner.receiveMessages();
        // manifest itself doesn't require response
        (0, vitest_1.expect)(sendSpy).not.toHaveBeenCalledWith(vitest_1.expect.objectContaining({ error: "invalid_message" }));
        await runner.disconnect();
    });
});
//# sourceMappingURL=unified-websocket-runner.test.js.map