/**
 * Serving a mini app from a hidden URL, with no login.
 *
 * Two audiences, kept apart on purpose. The **owner** deploys and withdraws
 * the link through their authenticated session, and is the only one who ever
 * sees the token. The **visitor** presents the token and gets exactly two
 * things: the app's released snapshot, and a short-lived session token that
 * may run that release and nothing else.
 *
 * Every failure a visitor can reach answers the same way — 404, "This app is
 * not available" — whether the token was never minted, was revoked, names an
 * app that has since been deleted, or names one that has published nothing.
 * Distinguishing them would turn the hidden URL into an oracle for guessing
 * the rest of them.
 *
 * The whole surface is production-only (`isAppDeploymentEnabled`). A local
 * install already answers loopback as user "1" without credentials, so there
 * a "no login needed" link is a second door onto an open house; production is
 * where auth is enforced, where asset bytes come back as signed URLs a
 * logged-out browser can load, and where the app's spend budget is what
 * stands between a shared link and the owner's provider bill.
 */

import { operationTarget } from "@nodetool-ai/app-runtime";
import {
  Application,
  ApplicationDeployment,
  getApplicationBudget,
  hasFiniteBudgetLimit,
  releasedApplicationRelease
} from "@nodetool-ai/models";
import {
  APP_DEPLOYMENT_SESSION_TTL_SECONDS,
  isAppDeploymentEnabled
} from "@nodetool-ai/protocol";
import {
  applicationDeployment,
  applicationReleaseResponse,
  publicApplication,
  publicApplicationSession,
  type ApplicationDeploymentSchema,
  type ApplicationReleaseResponse,
  type PublicApplication,
  type PublicApplicationSession
} from "@nodetool-ai/protocol/api-schemas/applications.js";
import { mintAppSessionToken } from "@nodetool-ai/auth";
import { ZodError } from "zod";

import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";
import { loadOwnedApplication } from "./applications-service.js";
import { resolvePublicAppStaticAssetLocators } from "./public-app-assets.js";

/** Whether this server offers public app deployments at all. */
export function appDeploymentsEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return isAppDeploymentEnabled(env["NODETOOL_ENV"]);
}

/** The one answer a visitor gets for every way a link can fail. */
function notAvailable(): never {
  throwApiError(ApiErrorCode.NOT_FOUND, "This app is not available");
}

/** A corrupt release is unavailable to a visitor, not a validation oracle. */
function parsePublicRelease(
  release: NonNullable<Awaited<ReturnType<typeof releasedApplicationRelease>>>
): ApplicationReleaseResponse {
  try {
    return applicationReleaseResponse.parse(release);
  } catch (error) {
    if (error instanceof ZodError) notAvailable();
    throw error;
  }
}

/**
 * Refuse the whole surface outside production, for the owner as well as the
 * visitor. A deploy that silently succeeded locally would hand the owner a URL
 * that stops working the moment it matters.
 */
function requireEnabled(): void {
  if (!appDeploymentsEnabled()) {
    throwApiError(
      ApiErrorCode.FORBIDDEN,
      "Deploying an app to a public URL is only available on nodetool.ai"
    );
  }
}

const PUBLIC_BUDGET_REQUIRED =
  "Public app runs require a finite invocation or USD budget. Configure one before deploying.";

/**
 * Why a release cannot be served over a public link, or null when it can.
 *
 * A public visitor reaches exactly two things: the release payload and the
 * websocket. Everything else — the tRPC library, the script store, the asset
 * routes — is refused at the door, on purpose. A workflow operation is fine:
 * the release carries its pinned graph, so nothing has to be fetched. A script
 * operation is not: its body lives behind an authenticated call the visitor
 * cannot make, and a run that silently did nothing would be worse than a
 * refusal.
 */
export function releaseBlockedReason(
  release: ApplicationReleaseResponse
): string | null {
  const scripted = release.document.operations.filter(
    (operation) => operationTarget(operation).kind === "script"
  );
  if (scripted.length > 0) {
    return (
      `A public link cannot run a script operation (${scripted
        .map((operation) => operation.name || operation.id)
        .join(", ")}). Move the step into a workflow and publish again.`
    );
  }
  if (release.document.resources.length > 0) {
    // A resource binding reads the owner's own library — their assets,
    // timelines, storyboards, sketches. Serving that to whoever has the link
    // is not what deploying an app means, and the session cannot make the
    // call anyway, so the widget would sit empty.
    return (
      "A public link cannot open your asset library. Remove the resource " +
      "bindings and publish again."
    );
  }
  const unpinned = release.document.operations.filter((operation) => {
    const pinned = release.workflows.find(
      (entry) => entry.workflowId === operation.workflowId
    );
    return !pinned?.graph;
  });
  if (unpinned.length > 0) {
    // A snapshot published before releases pinned graphs. A draft run falls
    // back to the live workflow; a public run must not, because "the live
    // workflow" is the owner's editable graph and nobody chose to publish it.
    return "This released version predates pinned graphs. Publish it again to deploy it.";
  }
  return null;
}

const toResponse = (
  deployment: ApplicationDeployment,
  blockedReason: string | null
): ApplicationDeploymentSchema =>
  applicationDeployment.parse({
    applicationId: deployment.application_id,
    token: deployment.token,
    createdAt: deployment.created_at,
    revokedAt: deployment.revoked_at,
    blockedReason
  });

/** What the app's link would serve right now, and why it might serve nothing. */
async function currentBlockedReason(
  applicationId: string,
  userId: string
): Promise<string | null> {
  const release = await releasedApplicationRelease(applicationId, userId);
  if (!release) return "This app has no released version to serve.";
  const releaseBlocked = releaseBlockedReason(
    applicationReleaseResponse.parse(release)
  );
  if (releaseBlocked) return releaseBlocked;
  return hasFiniteBudgetLimit(await getApplicationBudget(applicationId))
    ? null
    : PUBLIC_BUDGET_REQUIRED;
}

/** The app's live deployment, or null when it has none. Owner only. */
export async function getApplicationDeployment(
  userId: string,
  applicationId: string
): Promise<ApplicationDeploymentSchema | null> {
  requireEnabled();
  await loadOwnedApplication(userId, applicationId);
  const deployment = await ApplicationDeployment.findLive(applicationId);
  if (!deployment) return null;
  return toResponse(
    deployment,
    await currentBlockedReason(applicationId, userId)
  );
}

/**
 * Deploy the app, returning the link — the one already out there when it has
 * one, so re-deploying never invalidates a URL somebody pasted somewhere.
 *
 * An app with nothing released is refused rather than deployed dark: the
 * public page serves the release, so a deployment without one is a link that
 * resolves to nothing, and the owner should hear that now instead of from
 * whoever they sent it to.
 */
export async function deployApplication(
  userId: string,
  applicationId: string
): Promise<ApplicationDeploymentSchema> {
  requireEnabled();
  const app = await loadOwnedApplication(userId, applicationId);
  const release = await releasedApplicationRelease(applicationId, userId);
  if (!release) {
    throwApiError(
      ApiErrorCode.INVALID_INPUT,
      "Publish a version of this app before deploying it"
    );
  }
  // A release the public runtime cannot execute is refused now rather than
  // deployed dark: the owner is here, and whoever they would have sent the
  // link to is not.
  const blocked = releaseBlockedReason(
    applicationReleaseResponse.parse(release)
  );
  if (blocked) throwApiError(ApiErrorCode.INVALID_INPUT, blocked);
  if (!hasFiniteBudgetLimit(await getApplicationBudget(applicationId))) {
    throwApiError(ApiErrorCode.INVALID_INPUT, PUBLIC_BUDGET_REQUIRED);
  }
  const deployment = await ApplicationDeployment.ensure({
    applicationId: app.id,
    userId
  });
  return toResponse(deployment, null);
}

/**
 * Withdraw the link. Sessions already minted keep running until they expire —
 * they are signed, not stored — so this stops new visitors rather than
 * interrupting one mid-run.
 */
export async function undeployApplication(
  userId: string,
  applicationId: string
): Promise<{ ok: true }> {
  requireEnabled();
  await loadOwnedApplication(userId, applicationId);
  await ApplicationDeployment.revokeAllLive(applicationId);
  return { ok: true };
}

/**
 * The deployment behind a token, with its app and current release, or the
 * single 404 every failure shares.
 *
 * The release is read fresh on every request rather than pinned to the
 * deployment: publishing a new version is how an owner updates a deployed app,
 * and a link that kept serving the version that was current when it was minted
 * would make publish a no-op for exactly the audience it was published for.
 */
async function resolveDeployment(token: string): Promise<{
  deployment: ApplicationDeployment;
  application: Application;
  release: NonNullable<Awaited<ReturnType<typeof releasedApplicationRelease>>>;
}> {
  // The visitor gets the same 404 for a server that does not offer
  // deployments as for a token that was never minted. `requireEnabled`'s
  // explanation is for the owner, who is asking about their own app; telling
  // a stranger which servers have the surface turned off tells them where to
  // go looking for links.
  if (!appDeploymentsEnabled()) notAvailable();
  const deployment = await ApplicationDeployment.findLiveByToken(token);
  if (!deployment) notAvailable();
  const application = await Application.findById(deployment.application_id);
  // The deployment cascades with its app, so a missing app here means a
  // database that lost the cascade rather than a normal state — either way the
  // link serves nothing.
  if (!application || application.user_id !== deployment.user_id) {
    notAvailable();
  }
  const release = await releasedApplicationRelease(
    deployment.application_id,
    deployment.user_id
  );
  if (!release) notAvailable();
  // A version published after the link was minted can be one the public
  // runtime cannot execute. The link stops serving rather than serving
  // something that half-works; the owner sees why in `blockedReason`, and the
  // visitor gets the same 404 every other failure gives them.
  if (
    releaseBlockedReason(parsePublicRelease(release)) ||
    !hasFiniteBudgetLimit(
      await getApplicationBudget(deployment.application_id)
    )
  ) {
    notAvailable();
  }
  return { deployment, application, release };
}

/** What the public page renders: the app's identity and the release to run. */
export async function getPublicApplication(
  token: string
): Promise<PublicApplication> {
  const { application, release } = await resolveDeployment(token);
  try {
    const publicRelease = parsePublicRelease(release);
    const document = {
      ...publicRelease.document,
      ui: await resolvePublicAppStaticAssetLocators(
        publicRelease.document.ui,
        application.user_id
      ),
      variables: await resolvePublicAppStaticAssetLocators(
        publicRelease.document.variables,
        application.user_id
      )
    };
    return publicApplication.parse({
      id: application.id,
      name: application.name,
      description: application.description,
      release: { ...publicRelease, document }
    });
  } catch (error) {
    if (error instanceof ZodError) notAvailable();
    throw error;
  }
}

/**
 * Mint the credential the public page runs on.
 *
 * It authenticates as the app's owner — their graphs, their keys, their
 * budget — and carries the application id, which is what every consumer
 * narrows on. Nothing about the visitor is recorded: a session is derived
 * from the deployment and the clock, so it needs no row and revoking the
 * deployment is the only state there is to change.
 */
export async function createPublicApplicationSession(
  token: string,
  signingKey: Buffer | string
): Promise<PublicApplicationSession> {
  const { deployment, release } = await resolveDeployment(token);
  const minted = mintAppSessionToken(
    signingKey,
    {
      userId: deployment.user_id,
      applicationId: deployment.application_id,
      version: release.version
    },
    APP_DEPLOYMENT_SESSION_TTL_SECONDS
  );
  return publicApplicationSession.parse({
    token: minted.token,
    expiresAt: minted.expiresAt,
    applicationId: deployment.application_id,
    version: release.version
  });
}
