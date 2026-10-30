import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { z } from "zod";
import { nativeGameDocument, nativeGameDocumentJsonSchema, nativeGameTransactionForDimension, nativeGameTransactionJsonSchema, nativeGameScriptCommandJsonSchema, nativeGame2dTransactionJsonSchema, nativeGame2dScriptCommandJsonSchema, type NativeGameDocument } from "@nodetool-ai/protocol/native-game";
import { NativeGameWorker, NativeGameWorkerError, benchmarkNativeCppGame, captureNativeCppGame, exportNativeCppGame, nativeCppAssertion, nativeCppExecutable, nativeCppIdentity, createNativeCppCourse, createNativeCpp2dCourse, simulateNativeCppGame, nativeEditorRequest, requestNativeEditor } from "@nodetool-ai/game-runtime/native";
import { nativeGameScriptDeclarations } from "@nodetool-ai/protocol";
import { printCommandError } from "../command-errors.js";

interface RunOptions { readonly ticks: string; readonly seed: string; readonly inputs?: string; readonly assertions?: string; readonly verifyReplay?: boolean; readonly json?: boolean }
interface CaptureOptions { readonly ticks: string; readonly seed: string; readonly inputs?: string; readonly assetsDir?: string; readonly out: string; readonly json?: boolean }
async function jsonFile(path: string): Promise<unknown> {
  if ((await stat(path)).size > 16 * 1024 * 1024) { throw new Error("Native game JSON file exceeds 16 MiB"); }
  return JSON.parse(await readFile(path, "utf8"));
}
async function documentFile(path: string): Promise<NativeGameDocument> { return nativeGameDocument.parse(await jsonFile(path)); }
function print(value: unknown, json = false): void { process.stdout.write(`${JSON.stringify(value, null, json ? undefined : 2)}\n`); }
async function inputs(path?: string): Promise<Readonly<Record<string, unknown>>[]> { return path ? z.array(z.record(z.string(), z.unknown())).max(100_000).parse(await jsonFile(path)) : []; }
async function action(options: { readonly json?: boolean }, run: () => Promise<unknown>): Promise<void> {
  try { print(await run(), options.json); } catch (error) {
    if (error instanceof NativeGameWorkerError && options.json) {
      print({ status: "error", code: error.code, message: error.message, path: error.path, details: error.details, currentRevision: error.currentRevision }, true);
      process.exitCode = 1;
    } else { process.exitCode = printCommandError(error, options.json); }
  }
}
async function workerOperation(operation: string, document: NativeGameDocument): Promise<unknown> {
  const worker = new NativeGameWorker({ executable: nativeCppExecutable("worker") });
  try { return await worker.request(operation, { document }); } finally { worker.close(); }
}
/** The explicit native branch keeps legacy game documents on their existing implementation. */
export function registerNativeCppGameCommands(game: Command): void {
  const native = game.command("native").description("Create and verify native-cpp-1 games with the C++ worker");
  native.command("create <directory>").option("--dimension <dimension>", "Native game dimension (2d or 3d)", "3d").option("--title <name>", "Game title", "Relay Course").option("--json", "Print JSON").action(async (directory: string, options: { title: string; dimension: string; json?: boolean }) => action(options, async () => {
    const dimension = z.enum(["2d", "3d"]).parse(options.dimension);
    const output = resolve(directory), course = (dimension === "2d" ? createNativeCpp2dCourse : createNativeCppCourse)(randomUUID().replace(/-/g, ""), options.title);
    await workerOperation("validate", course.document);
    await mkdir(output, { recursive: true });
    for (const [path, bytes] of Object.entries(course.files)) { await writeFile(join(output, path), bytes, { flag: "wx" }); }
    await writeFile(join(output, "game.json"), `${JSON.stringify(course.document, null, 2)}\n`, { flag: "wx" });
    return { ...nativeCppIdentity(course.document), document: join(output, "game.json"), assetsDir: output };
  }));
  native.command("editor <request_file>").requiredOption("--socket <path>", "Live editor user-local socket").option("--json", "Print JSON").action(async (path: string, options: { socket: string; json?: boolean }) => action(options, async () => requestNativeEditor(options.socket, nativeEditorRequest.parse(await jsonFile(path)))));
  native.command("schema").description("Print native document and transaction schemas").option("--dimension <dimension>", "Script and transaction dimension", "3d").action((options: { dimension: string }) => { const dimension = z.enum(["2d", "3d"]).parse(options.dimension); print({ dimension, document: nativeGameDocumentJsonSchema(), transaction: dimension === "2d" ? nativeGame2dTransactionJsonSchema() : nativeGameTransactionJsonSchema(), commands: dimension === "2d" ? nativeGame2dScriptCommandJsonSchema() : nativeGameScriptCommandJsonSchema(), scriptDeclarations: nativeGameScriptDeclarations(dimension) }); });
  native.command("capabilities").description("Inspect installed worker capabilities").option("--json", "Print JSON").action(async (options: { json?: boolean }) => action(options, async () => {
    const worker = new NativeGameWorker({ executable: nativeCppExecutable("worker") });
    try { return await worker.request("hello"); } finally { worker.close(); }
  }));
  native.command("validate <game_file>").option("--json", "Print JSON").action(async (path: string, options: { json?: boolean }) => {
    await action(options, async () => workerOperation("validate", await documentFile(path)));
  });
  native.command("inspect <game_file>").option("--offset <integer>", "First entity", "0").option("--limit <integer>", "Maximum entities", "50").option("--scene <id>", "Scene to inspect").option("--fields <names>", "Comma-separated entity fields", "id,name,transform,behaviors").option("--json", "Print JSON")
    .action(async (path: string, options: { offset: string; limit: string; scene?: string; fields: string; json?: boolean }) => {
      await action(options, async () => {
        const document = await documentFile(path), offset = z.number().int().nonnegative().parse(Number(options.offset)), limit = z.number().int().min(1).max(256).parse(Number(options.limit));
        await workerOperation("validate", document);
        const scene = document.scenes.find((item) => item.id === (options.scene ?? document.initialSceneId));
        if (!scene) { throw new Error("Native scene not found"); }
        const fields = options.fields.split(",").filter(Boolean);
        const entities = scene.entities.slice(offset, offset + limit).map((entity) => Object.fromEntries(Object.entries(entity).filter(([name]) => fields.includes(name))));
        return { ...nativeCppIdentity(document), sceneId: scene.id, total: scene.entities.length, offset, nextOffset: offset + limit < scene.entities.length ? offset + limit : null, entities };
      });
    });
  native.command("transact <game_file> <transaction_file>").requiredOption("--out <file>", "Write accepted native document").option("--json", "Print JSON")
    .action(async (path: string, transactionPath: string, options: { out: string; json?: boolean }) => {
      await action(options, async () => {
        const document = await documentFile(path), transaction = nativeGameTransactionForDimension(document.dimension).parse(await jsonFile(transactionPath));
        const worker = new NativeGameWorker({ executable: nativeCppExecutable("worker") });
        try {
          await worker.request("open", { sessionId: "edit", document });
          const result = await worker.request("transaction", { sessionId: "edit", ...transaction });
          const accepted = z.object({ document: nativeGameDocument }).parse(await worker.request("inspect", { sessionId: "edit" }));
          await writeFile(resolve(options.out), `${JSON.stringify(accepted.document, null, 2)}\n`);
          return result;
        } finally { worker.close(); }
      });
    });
  native.command("simulate <game_file>").requiredOption("--ticks <integer>", "Exact tick count").option("--seed <integer>", "Seed", "1").option("--inputs <file>", "Recorded JSON inputs").option("--assertions <file>", "JSON array of {tick,path,equals} assertions").option("--verify-replay", "Verify same-session midpoint restore").option("--json", "Print JSON")
    .action(async (path: string, options: RunOptions) => {
      await action(options, async () => {
        const report = await simulateNativeCppGame(await documentFile(path), { ticks: Number(options.ticks), seed: Number(options.seed), inputs: await inputs(options.inputs), assertions: options.assertions ? z.array(nativeCppAssertion).parse(await jsonFile(options.assertions)) : [], verifyReplay: options.verifyReplay });
        if (report.valid === false) { process.exitCode = 1; }
        return report;
      });
    });
  native.command("bench <game_file>").option("--ticks <integer>", "Measured ticks", "120").option("--warmup <integer>", "Warmup ticks", "30").option("--seed <integer>", "Seed", "1").option("--inputs <file>", "Recorded inputs including warmup").option("--json", "Print JSON")
    .action(async (path: string, options: RunOptions & { warmup: string }) => action(options, async () => benchmarkNativeCppGame(await documentFile(path), { ticks: Number(options.ticks), warmup: Number(options.warmup), seed: Number(options.seed), inputs: await inputs(options.inputs) })));
  native.command("capture <game_file>").requiredOption("--out <file>", "PNG output").option("--ticks <integer>", "Committed tick", "0").option("--seed <integer>", "Seed", "1").option("--inputs <file>", "Recorded inputs").option("--assets-dir <directory>", "Prepared assets root").option("--json", "Print JSON")
    .action(async (path: string, options: CaptureOptions) => action(options, async () => captureNativeCppGame(await documentFile(path), { ticks: Number(options.ticks), seed: Number(options.seed), inputs: await inputs(options.inputs), assetsDir: options.assetsDir ?? dirname(resolve(path)), out: resolve(options.out) })));
  native.command("export <game_file>").option("--target <target>", "desktop or web", "desktop").requiredOption("--out <directory>", "Standalone bundle directory").option("--assets-dir <directory>", "Prepared assets root").option("--build-dir <directory>", "Native build containing game-player").option("--json", "Print JSON")
    .action(async (path: string, options: { out: string; target?: "web" | "desktop"; assetsDir?: string; buildDir?: string; json?: boolean }) => action(options, async () => exportNativeCppGame(await documentFile(path), { assetsDir: options.assetsDir ?? dirname(resolve(path)), buildDir: options.buildDir, target: options.target, out: resolve(options.out) })));
}
