import { importOptionalModule } from "@nodetool-ai/config";
import { missingRuntimePackageError } from "@nodetool-ai/protocol";

/** Load a tracing peer from the installation or the managed runtime root. */
export async function loadTracingModule<T>(specifier: string): Promise<T> {
  try {
    return await importOptionalModule<T>(specifier);
  } catch (cause) {
    throw missingRuntimePackageError(specifier, "tracing", cause);
  }
}
