// Captures the web editor in the whole-window parity states that
// tests/ui/WindowParityTest.cpp captures natively. See
// docs/native-node-editor-visual-comparison.md#whole-window-captures.
//
// node native/node-editor/scripts/capture-web-window-parity.mjs \
//     --web http://127.0.0.1:3091 --api http://127.0.0.1:7791 --out <directory>
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "../tests/ui/WindowParityFixture.json");
const { values } = parseArgs({
    options: {
        web: { type: "string" },
        api: { type: "string" },
        out: { type: "string" },
        only: { type: "string" }
    }
});
if (!values.web || !values.api || !values.out) {
    console.error("Usage: capture-web-window-parity.mjs --web <url> --api <url> --out <directory> [--only state,state]");
    process.exit(2);
}
const only = values.only ? values.only.split(",") : null;
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
mkdirSync(values.out, { recursive: true });

async function createWorkflow(body) {
    const response = await fetch(`${values.api}/api/workflows/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        throw new Error(`Creating a workflow failed with ${response.status}`);
    }
    return (await response.json()).id;
}

// The same messages WindowParityTest emits, applied through the web run reducer.
function runMessages(workflowId) {
    const job = "parity-job";
    const messages = [{ type: "job_update", job_id: job, workflow_id: workflowId, status: "running" }];
    for (const id of ["subject", "size", "reference", "prompt", "metadata", "width"]) {
        messages.push({ type: "node_update", job_id: job, workflow_id: workflowId, node_id: id, status: "completed" });
    }
    for (const id of ["generate", "agent"]) {
        messages.push({ type: "node_update", job_id: job, workflow_id: workflowId, node_id: id, status: "running" });
    }
    messages.push({ type: "node_progress", job_id: job, workflow_id: workflowId, node_id: "generate", progress: 12, total: 30 });
    return messages;
}

// Side panels start closed and the chat window starts collapsed, so each
// state opens only the panel it names.
function seedStorage(page, scheme, panels) {
    return page.addInitScript(({ scheme, panels }) => {
        localStorage.setItem("mui-mode", scheme);
        localStorage.setItem("nodetool-onboarding", JSON.stringify({ state: { completedSteps: [], dismissed: true }, version: 1 }));
        localStorage.setItem("canvas-chat-dock", JSON.stringify({
            state: { position: { x: 0, y: 0 }, windowWidth: 420, windowHeight: 2000, conversationCollapsed: true },
            version: 2
        }));
        const write = (key, size, view, version, options) => {
            const panel = { panelSize: size, isVisible: Boolean(options), activeView: (options && options.view) || view };
            localStorage.setItem(key, JSON.stringify({ state: { panel }, version }));
        };
        write("left-panel-storage", 360, "workflows", 3, panels.left);
        write("right-panel-storage", 350, "inspector", 3, panels.right);
        write("bottom-panel-storage", 320, "logs", 2, panels.bottom);
    }, { scheme, panels });
}

const states = [
    { name: "empty", graph: false, panels: {} },
    { name: "graph", graph: true, panels: {} },
    { name: "selected", graph: true, panels: { right: {} }, select: "agent" },
    { name: "catalog", graph: true, panels: { left: { view: "nodes" } } },
    { name: "running", graph: true, panels: {}, run: true },
    { name: "output", graph: true, panels: { bottom: { view: "logs" } }, run: true }
];
const emptyWorkflow = { name: fixture.workflow.name, access: "private", description: "", tags: [], graph: { nodes: [], edges: [] } };
const browser = await chromium.launch();
try {
    for (const scheme of ["dark", "light"]) {
        for (const [width, height] of [[1440, 900], [1024, 700]]) {
            for (const state of states) {
                if (only && !only.includes(state.name)) {
                    continue;
                }
                const id = await createWorkflow(state.graph ? fixture.workflow : emptyWorkflow);
                const page = await browser.newPage({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: 1 });
                await seedStorage(page, scheme, state.panels);
                await page.goto(`${values.web}/editor/${id}`, { waitUntil: "networkidle", timeout: 90000 });
                await page.waitForTimeout(2500);
                if (state.select) {
                    await page.locator(`.react-flow__node[data-id="${state.select}"]`).first().click({ position: { x: 60, y: 10 } });
                    await page.waitForTimeout(800);
                }
                if (state.run) {
                    // Vite serves each module once, so these imports reach the app's own stores.
                    await page.evaluate(async ({ id, messages }) => {
                        const { handleUpdate } = await import("/src/stores/workflowUpdates.ts");
                        const { getWorkflowRunnerStore } = await import("/src/stores/WorkflowRunner.ts");
                        const runner = getWorkflowRunnerStore(id);
                        runner.setState({ state: "running", job_id: "parity-job" });
                        for (const message of messages) {
                            handleUpdate({ id, name: "Window parity fixture" }, message, runner, () => undefined);
                        }
                    }, { id, messages: runMessages(id) });
                    await page.waitForTimeout(800);
                }
                await page.mouse.move(width - 2, Math.round(height / 2));
                await page.waitForTimeout(300);
                const file = join(values.out, `${state.name}-${scheme}-${width}x${height}.png`);
                await page.screenshot({ path: file });
                console.log(file);
                await page.close();
            }
        }
    }
} finally {
    await browser.close();
}
