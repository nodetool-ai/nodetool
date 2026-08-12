/**
 * What survives of the two HTTP tools after the port to the `web` capability
 * module (`../capabilities/web.ts`): the request-signal helper other code
 * calls directly. `download_file` and `http_request` reach a belt through the
 * registry now, by name.
 */

export { requestSignal } from "../capabilities/web.js";
