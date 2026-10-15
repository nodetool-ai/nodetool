import { importOptionalModule } from "@nodetool-ai/config";
import { missingRuntimePackageError } from "@nodetool-ai/protocol";

/** Load the Canvas codec from the installation or the managed imaging runtime. */
export async function loadCanvas(): Promise<typeof import("@napi-rs/canvas")> {
  try {
    return await importOptionalModule<typeof import("@napi-rs/canvas")>(
      "@napi-rs/canvas",
      { commonJs: true }
    );
  } catch (cause) {
    throw missingRuntimePackageError("@napi-rs/canvas", "imaging", cause);
  }
}
