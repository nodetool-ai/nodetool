import { FileUserManager } from "@nodetool-ai/auth";

const manager = new FileUserManager();

/**
 * Check if a user ID has admin privileges: user "1" (the Local-mode user),
 * an id in the comma-separated `ADMIN_USER_IDS`, or an API user created with
 * the admin role.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  if (userId === "1") return true;
  const adminIds = process.env.ADMIN_USER_IDS;
  if (
    adminIds
      ?.split(",")
      .map((s) => s.trim())
      .includes(userId)
  ) {
    return true;
  }
  return (await manager.getUserById(userId))?.role === "admin";
}
