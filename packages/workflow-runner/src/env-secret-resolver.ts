/**
 * envSecretResolver — adapt an env-vars dictionary to ProcessingContext's
 * `secretResolver` shape. Use this when there is no OS keychain (serverless,
 * Workers) and secrets arrive via platform-managed environment variables.
 */
export function envSecretResolver(
  env: Record<string, string | undefined>
): (key: string) => string | null {
  return (key) => env[key] ?? null;
}
