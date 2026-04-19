import type { SecretGetInput, SecretGetOutput } from "@nodetool/sandbox/schemas";
import { getSecret } from "../secret-map.js";

export async function secretGet(input: SecretGetInput): Promise<SecretGetOutput> {
  return {
    name: input.name,
    value: getSecret(input.name)
  };
}
