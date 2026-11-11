import { FileUserManager } from "@nodetool-ai/auth";
import { getUserAccount } from "@nodetool-ai/models";

/** Split a comma- or space-separated environment list. */
function envList(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Check if a user ID has admin privileges: user "1" (the Local-mode user),
 * an id in the comma-separated `ADMIN_USER_IDS`, an API user created with the
 * admin role, or an active directory account that an admin promoted or whose
 * identity-provider groups include one of `OIDC_ADMIN_GROUPS`.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  if (userId === "1") return true;
  if (envList(process.env.ADMIN_USER_IDS).includes(userId)) return true;
  if ((await new FileUserManager().getUserById(userId))?.role === "admin") {
    return true;
  }
  const account = await getUserAccount(userId);
  if (account && account.status === "active") {
    if (account.role === "admin") return true;
    const adminGroups = envList(process.env.OIDC_ADMIN_GROUPS);
    return account.groups.some((group) => adminGroups.includes(group));
  }
  return false;
}
