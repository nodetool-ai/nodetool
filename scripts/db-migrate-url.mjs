/**
 * Resolve the connection URL used by the release-phase migration runner.
 *
 * A running Supabase deployment uses the pooled DATABASE_URL. Migrations need
 * the dedicated DIRECT_URL connection so they are not rejected when the
 * session pool is full of live application connections.
 */
export function resolveMigrationDatabaseUrl(env = process.env) {
  const directUrl = env.DIRECT_URL?.trim();
  if (directUrl) {
    return directUrl;
  }

  return env.DATABASE_URL?.trim();
}
