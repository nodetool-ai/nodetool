import { z } from "zod";

export const SecretGetInput = z.object({
  name: z.string().min(1)
});
export type SecretGetInput = z.infer<typeof SecretGetInput>;

export const SecretGetOutput = z.object({
  name: z.string(),
  value: z.string().nullable()
});
export type SecretGetOutput = z.infer<typeof SecretGetOutput>;
