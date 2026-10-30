import { StaleInstallAuthorizationError, type InstallAuthorization } from "./pack-install-authorization.js";

/** Renew a stale grant at most three times. Every renewal repeats command consent. */
export async function installWithCommandAuthorization(options: {
  readonly authorize: () => Promise<InstallAuthorization | null>;
  readonly install: (authorization: InstallAuthorization) => Promise<unknown>;
}): Promise<boolean> {
  for (let renewal = 0; ; renewal++) {
    const authorization = await options.authorize();
    if (!authorization) { return false; }
    try {
      await options.install(authorization);
      return true;
    } catch (error) {
      if (!(error instanceof StaleInstallAuthorizationError) || renewal >= 3) { throw error; }
    }
  }
}
