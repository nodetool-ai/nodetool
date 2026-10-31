import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { exportNativeSchema, nativeFrame, nativeSaveRequest, nativeRuntimeRequestJsonSchema, nativeRuntimeResponseJsonSchema, nativeGameDocumentJsonSchema, nativeGameTransactionJsonSchema, nativeGameScriptCommandJsonSchema, nativeGame2dTransactionJsonSchema, nativeGame2dScriptCommandJsonSchema } from "../src/native-game.js";

import { nativeGameScriptDeclarations } from "../src/native-game-declarations.js";

const directory = fileURLToPath(new URL("../../../native/game/generated/", import.meta.url));
await mkdir(directory, { recursive: true });
const outputs: Record<string, string> = {};
for (const [name, schema] of Object.entries({ runtimeRequest: nativeRuntimeRequestJsonSchema(), runtimeResponse: nativeRuntimeResponseJsonSchema(), frame: exportNativeSchema(nativeFrame), saveRequest: exportNativeSchema(nativeSaveRequest), document: nativeGameDocumentJsonSchema(), transaction: nativeGameTransactionJsonSchema(), commands: nativeGameScriptCommandJsonSchema(), transaction2d: nativeGame2dTransactionJsonSchema(), commands2d: nativeGame2dScriptCommandJsonSchema() })) {
  outputs[`${name}.schema.json`] = `${JSON.stringify(schema, null, 2)}\n`;
}
outputs["script-contract.d.ts"] = nativeGameScriptDeclarations();
outputs["script-contract2d.d.ts"] = nativeGameScriptDeclarations("2d");
for (const [name, expected] of Object.entries(outputs)) {
  const path = `${directory}${name}`;
  if (process.argv.includes("--check")) {
    if (await readFile(path, "utf8") !== expected) { throw new Error(`Native game schema drift: ${path}`); }
  } else { await writeFile(path, expected); }
}
