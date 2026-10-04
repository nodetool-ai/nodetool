/**
 * Bug reports router — the receiving end of the hosted app's Report a Bug
 * dialog.
 *
 * A local install hands the reporter a zip and a pre-filled GitHub issue. The
 * hosted app posts the same report here instead, so a reporter needs no
 * GitHub account. The row lands in `nodetool_bug_reports` and the zip in
 * asset storage under the caller's own prefix, which account erasure sweeps.
 */

import { createBugReport, createTimeOrderedUuid } from "@nodetool-ai/models";
import {
  MAX_BUG_REPORT_BUNDLE_BYTES,
  submitInput,
  submitOutput
} from "@nodetool-ai/protocol/api-schemas/bug-reports.js";
import { ApiErrorCode } from "../../error-codes.js";
import { getAssetAdapter } from "../../lib/storage.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";

/** Every zip, including an empty one, starts with a "PK" signature. */
function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function bugReportBundleKey(userId: string, reportId: string): string {
  return `${userId}/bug-report-${reportId}.zip`;
}

export const bugReportsRouter = router({
  submit: protectedProcedure
    .input(submitInput)
    .output(submitOutput)
    .mutation(async ({ ctx, input }) => {
      const id = createTimeOrderedUuid();
      let bundleKey: string | null = null;
      let bundleSize: number | null = null;

      if (input.bundle_base64) {
        const bytes = new Uint8Array(Buffer.from(input.bundle_base64, "base64"));
        if (bytes.length > MAX_BUG_REPORT_BUNDLE_BYTES) {
          throwApiError(
            ApiErrorCode.INVALID_INPUT,
            `Report bundle exceeds ${MAX_BUG_REPORT_BUNDLE_BYTES} bytes`
          );
        }
        if (!isZip(bytes)) {
          throwApiError(ApiErrorCode.INVALID_INPUT, "Report bundle is not a zip");
        }
        bundleKey = bugReportBundleKey(ctx.userId, id);
        bundleSize = bytes.length;
        await getAssetAdapter().store(bundleKey, bytes, "application/zip");
      }

      try {
        await createBugReport({
          id,
          userId: ctx.userId,
          source: input.source,
          title: input.title,
          description: input.description,
          steps: input.steps ?? null,
          expected: input.expected ?? null,
          body: input.body,
          bundleKey,
          bundleSize
        });
      } catch (error) {
        // A zip with no row is unreachable from triage; remove it.
        if (bundleKey) {
          const adapter = getAssetAdapter();
          await adapter.delete(adapter.uriForKey(bundleKey)).catch(() => false);
        }
        throw error;
      }
      return { id };
    })
});
