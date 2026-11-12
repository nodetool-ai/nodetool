import { toGuestBytesDeep } from '../../../../packages/sandbox-runtime/src/sandbox-bytes.ts';
import { fromJson } from '../values.mjs';
export const encodeSandboxValue=toGuestBytesDeep;
export function decodeSandboxValue(value) {
  return fromJson(JSON.stringify(value).replace(/"__nodetool_sandbox_bytes__":/g,'"__bytes__":'));
}
