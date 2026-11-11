#!/usr/bin/env node
// Executes web chat code under Node and writes the fixtures the native chat
// tests compare against: the advertised ui_* tool manifest, ui_search_nodes
// results, and chat_message payloads from the web send path.
//
//   node native/node-editor/scripts/generate-chat-web-fixtures.mjs [--check]
//
// --check exits 1 when a checked-in fixture differs from the web output.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAT_FIXTURES } from "./chat-web-fixture-cases.mjs";

const editor = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(editor, "../..");
const web = join(root, "web/src");
const outputs = {
    manifest: join(editor, "resources/chat/tool-manifest.json"),
    search: join(editor, "tests/ui/ChatSearchFixture.json"),
    payloads: join(editor, "tests/ui/ChatPayloadFixture.json")
};

const entry = String.raw`
import "${web}/lib/tools/builtin/searchNodes.ts";
import "${web}/lib/tools/builtin/addNode.ts";
import "${web}/lib/tools/builtin/connectNodes.ts";
import "${web}/lib/tools/builtin/getGraph.ts";
import "${web}/lib/tools/builtin/updateNodeData.ts";
import "${web}/lib/tools/builtin/deleteNode.ts";
import "${web}/lib/tools/builtin/deleteEdge.ts";
import "${web}/lib/tools/builtin/moveNode.ts";
import "${web}/lib/tools/builtin/setNodeTitle.ts";
import "${web}/lib/tools/builtin/searchModels.ts";
import "${web}/lib/tools/builtin/uiActions.ts";
import "${web}/lib/tools/builtin/workflow.ts";
import "${web}/lib/tools/builtin/openDocument.ts";
import { FrontendToolRegistry } from "${web}/lib/tools/frontendTools.ts";
import useGlobalChatStore from "${web}/stores/GlobalChatStore.ts";
import useMediaGenerationStore from "${web}/stores/MediaGenerationStore.ts";
import { useWorkspaceTabsStore } from "${web}/stores/WorkspaceTabsStore.ts";
import { globalWebSocketManager } from "${web}/lib/websocket/GlobalWebSocketManager.ts";
import { buildMediaGenerationRequest } from "${web}/components/chat/composer/mediaGenerationRequest.ts";
import { buildUiContext } from "${web}/lib/chat/uiContext.ts";
import { assetToDroppedFile } from "${web}/components/chat/hooks/useDragAndDrop.ts";
import { DOC_TYPES_REGEX } from "${web}/components/chat/types/chat.types.ts";
import { CHAT_FIXTURES } from "${join(editor, "scripts/chat-web-fixture-cases.mjs")}";

// The native editor advertises these tools (EditorChatTools.cpp).
const NATIVE_TOOLS = CHAT_FIXTURES.nativeTools;

function generatedCatalog(count) {
    // web/src/utils/__tests__/nodeSearch.test.ts generateLargeDataset.
    const namespaces = ["math", "string", "image", "audio", "video", "data", "ai", "ml"];
    const operations = ["add", "subtract", "multiply", "divide", "process", "transform", "convert", "analyze"];
    const nodes = [];
    for (let i = 0; i < count; i++) {
        const namespace = namespaces[i % namespaces.length] + (i % 3 === 0 ? ".sub" + Math.floor(i / 10) : "");
        const operation = operations[i % operations.length];
        nodes.push({
            namespace,
            node_type: namespace + "." + operation + i,
            title: operation.charAt(0).toUpperCase() + operation.slice(1) + " " + i,
            description: "Description for " + operation + " operation number " + i,
            properties: [],
            outputs: []
        });
    }
    return nodes;
}

function catalog(name) {
    const match = /^generated-(\d+)$/.exec(name);
    return match ? generatedCatalog(Number(match[1])) : CHAT_FIXTURES.catalogs[name];
}

// components/chat/hooks/useFileHandling.ts makeMessageContent, lines 35-77.
function makeMessageContent(file) {
    const uri = file.assetUri ?? file.dataUri;
    if (file.type.startsWith("image/")) {
        return { type: "image_url", image: { type: "image", uri } };
    } else if (file.type.startsWith("audio/")) {
        return { type: "audio", audio: { type: "audio", uri } };
    } else if (file.type.startsWith("video/")) {
        return { type: "video", video: { type: "video", uri } };
    } else if (file.type.match(DOC_TYPES_REGEX)) {
        return { type: "document", document: { type: "document", uri } };
    }
    return { type: "text", text: file.name };
}

async function payload(spec) {
    const fixture = CHAT_FIXTURES.payloadContext;
    const frames = [];
    globalWebSocketManager.ensureConnection = async () => {};
    globalWebSocketManager.send = async (message) => {
        frames.push(message);
    };
    globalWebSocketManager.subscribe = () => () => {};
    const chatModel = spec.chatModel
        ? { type: "language_model", provider: spec.chatModel.provider, id: spec.chatModel.id, name: spec.chatModel.id }
        : { type: "language_model", provider: "empty", id: "", name: "" };
    useGlobalChatStore.setState({
        currentThreadId: fixture.threadId,
        workflowId: fixture.workflowId,
        threads: { [fixture.threadId]: { id: fixture.threadId, project_id: "default", workflow_id: fixture.workflowId } },
        selectedModel: chatModel,
        threadModel: {},
        forcedModel: null,
        reasoningEffort: spec.reasoning ?? null,
        permissionMode: {},
        lastPermissionMode: "default"
    });
    useWorkspaceTabsStore.setState({
        tabs: [{ id: "tab-workflow", type: "workflow", ref: fixture.workflowId, title: fixture.workflowTitle }],
        activeTabId: "tab-workflow"
    });
    const media = useMediaGenerationStore.getInitialState();
    const settings = { ...media, presetIds: {} };
    for (const [key, value] of Object.entries(spec.settings ?? {})) {
        settings[key] = { ...settings[key], ...value };
    }
    const mediaGeneration = buildMediaGenerationRequest(spec.mode, settings);
    // MediaChatComposer.tsx submitPrompt lines 735-740.
    const content = [];
    if (spec.prompt.trim().length > 0) {
        content.push({ type: "text", text: spec.prompt });
    }
    for (const asset of spec.attachments ?? []) {
        content.push(makeMessageContent(assetToDroppedFile(asset)));
    }
    // CanvasMediaComposer.tsx handleSendMessage lines 64-102.
    const isMedia = !!mediaGeneration && mediaGeneration.mode !== "chat";
    const selectedModel = useGlobalChatStore.getState().getSelectedModel(fixture.threadId);
    const selectedNodeIds = spec.selection ?? [];
    const uiContext = buildUiContext({
        source: "workflow_canvas",
        focused: { type: "workflow", id: fixture.workflowId, title: fixture.workflowTitle },
        selection: selectedNodeIds.length > 0 ? { node_ids: selectedNodeIds } : undefined
    });
    const outgoing = {
        type: "message",
        name: "",
        role: "user",
        provider: isMedia ? mediaGeneration?.provider ?? selectedModel?.provider : selectedModel?.provider,
        model: isMedia ? mediaGeneration?.model ?? selectedModel?.id : selectedModel?.id,
        content,
        ui_context: uiContext,
        media_generation: isMedia ? mediaGeneration : null
    };
    const outcome = await useGlobalChatStore.getState().trySendMessage(outgoing);
    if (!outcome.ok) {
        return { refused: outcome.reason };
    }
    const data = JSON.parse(JSON.stringify(frames[0].data));
    delete data.id;
    return { command: frames[0].command, data };
}

(async () => {
    const manifest = FrontendToolRegistry.getManifest()
        .filter((tool) => NATIVE_TOOLS.includes(tool.name))
        .sort((a, b) => a.name.localeCompare(b.name));
    const searchCases = [];
    for (const spec of CHAT_FIXTURES.searchCases) {
        const nodes = catalog(spec.catalog);
        const state = { nodeMetadata: Object.fromEntries(nodes.map((node) => [node.node_type, node])) };
        const result = await FrontendToolRegistry.call("ui_search_nodes", spec.args, "fixture", { getState: () => state });
        searchCases.push({ ...spec, result: JSON.parse(JSON.stringify(result)) });
    }
    const payloadCases = [];
    for (const spec of CHAT_FIXTURES.payloadCases) {
        payloadCases.push({ ...spec, expected: await payload(spec) });
    }
    // The send path leaves a five-minute safety timer behind, so exit explicitly.
    process.stdout.write(JSON.stringify({ manifest, searchCases, payloadCases }), () => process.exit(0));
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
`;

const work = mkdtempSync(join(tmpdir(), "chat-web-fixtures-"));
try {
    writeFileSync(join(work, "stub.mjs"), [
        "const handler = { get: (_t, key) => (key === Symbol.toPrimitive ? () => \"\" : proxy), apply: () => proxy, construct: () => proxy };",
        "const proxy = new Proxy(function stub() {}, handler);",
        "export default proxy;",
        ""
    ].join("\n"));
    writeFileSync(join(work, "entry.ts"), entry);
    const { build } = await import(join(root, "node_modules/esbuild/lib/main.js"));
    // Browser-only and generated-catalog modules are not reached by the fixture code paths.
    const stubbed = /^(wavesurfer\.js|monaco-editor|@nodetool\/(fal|kie)-)/;
    await build({
        entryPoints: [join(work, "entry.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: join(work, "bundle.mjs"),
        conditions: ["nodetool-dev"],
        logLevel: "error",
        absWorkingDir: join(root, "web"),
        loader: { ".svg": "empty", ".css": "empty", ".png": "empty", ".wasm": "empty" },
        define: { "import.meta.env": "{}" },
        banner: { js: "import { createRequire as fixtureRequire } from \"module\"; const require = fixtureRequire(import.meta.url);" },
        plugins: [{
            name: "stub",
            setup(builder) {
                builder.onResolve({ filter: stubbed }, () => ({ path: join(work, "stub.mjs") }));
            }
        }]
    });
    const output = JSON.parse(execFileSync(process.execPath, [join(work, "bundle.mjs")], {
        cwd: work,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"]
    }));
    const files = {
        manifest: output.manifest,
        search: { source: "web/src/lib/tools/builtin/searchNodes.ts", catalogs: CHAT_FIXTURES.catalogs, cases: output.searchCases },
        payloads: { source: "web/src/stores/GlobalChatStore.ts trySendMessage", cases: output.payloadCases }
    };
    let stale = false;
    for (const [key, value] of Object.entries(files)) {
        const text = JSON.stringify(value, null, 2) + "\n";
        if (process.argv.includes("--check")) {
            let current = "";
            try {
                current = readFileSync(outputs[key], "utf8");
            } catch {
                current = "";
            }
            if (current !== text) {
                console.error("Stale fixture: " + outputs[key]);
                stale = true;
            }
        } else {
            writeFileSync(outputs[key], text);
        }
    }
    process.exit(stale ? 1 : 0);
} finally {
    rmSync(work, { recursive: true, force: true });
}
