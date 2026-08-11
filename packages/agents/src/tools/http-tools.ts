/**
 * HTTP tools for downloading files and making HTTP requests.
 *
 * @deprecated Ported to the `web` capability module
 * (`../capabilities/web.ts`). These survive as thin subclasses so existing
 * constructors keep working; there is one implementation behind both.
 * `requestSignal` moved with them and is re-exported here for its callers.
 */

import { CapabilityTool, ungatedCapabilityRun } from "../capabilities/index.js";
import { downloadFile, httpRequest } from "../capabilities/web.js";

export { requestSignal } from "../capabilities/web.js";

/**
 * @deprecated Ported to the `web` capability module. Kept as a thin subclass
 * so existing constructors keep working.
 */
export class DownloadFileTool extends CapabilityTool {
  constructor() {
    super(downloadFile.spec, downloadFile.impl, ungatedCapabilityRun);
  }
}

/**
 * @deprecated Ported to the `web` capability module. Kept as a thin subclass
 * so existing constructors keep working.
 */
export class HttpRequestTool extends CapabilityTool {
  constructor() {
    super(httpRequest.spec, httpRequest.impl, ungatedCapabilityRun);
  }
}
