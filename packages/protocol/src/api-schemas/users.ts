import { z } from "zod";

// ── User response shapes ─────────────────────────────────────────
// Two distinct shapes depending on caller context:
//   • listResponse / getResponse — masked `token_hash` (first 16 chars + "...").
//   • createResponse / resetTokenResponse — plaintext `token` (shown once).

export const userListItem = z.object({
  username: z.string(),
  user_id: z.string(),
  role: z.string(),
  token_hash: z.string(),
  created_at: z.string()
});
export type UserListItem = z.infer<typeof userListItem>;

export const userCreateResponse = z.object({
  username: z.string(),
  user_id: z.string(),
  role: z.string(),
  token: z.string(),
  created_at: z.string()
});
export type UserCreateResponse = z.infer<typeof userCreateResponse>;

// ── list (GET /api/users) ────────────────────────────────────────
export const listOutput = z.object({
  users: z.array(userListItem)
});
export type ListOutput = z.infer<typeof listOutput>;

// ── get (GET /api/users/:username) ───────────────────────────────
export const getInput = z.object({
  username: z.string().min(1)
});
export type GetInput = z.infer<typeof getInput>;

// ── create (POST /api/users) ─────────────────────────────────────
export const createInput = z.object({
  username: z.string().min(1),
  role: z.string().default("user")
});
export type CreateInput = z.infer<typeof createInput>;

// ── remove (DELETE /api/users/:username) ─────────────────────────
export const removeInput = z.object({
  username: z.string().min(1)
});
export type RemoveInput = z.infer<typeof removeInput>;

export const removeOutput = z.object({
  message: z.string()
});
export type RemoveOutput = z.infer<typeof removeOutput>;

// ── resetToken (POST /api/users/reset-token) ─────────────────────
export const resetTokenInput = z.object({
  username: z.string().min(1)
});
export type ResetTokenInput = z.infer<typeof resetTokenInput>;
