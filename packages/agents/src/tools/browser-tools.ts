/**
 * What survives of the two browser tools after the port to the `web`
 * capability module (`../capabilities/web.ts`): the HTML-to-text helper other
 * code calls directly. `browser` and `take_screenshot` reach a belt through
 * the registry now, by name.
 */

export { htmlToText } from "../capabilities/web.js";
