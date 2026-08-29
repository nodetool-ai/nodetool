/**
 * ApplicationDeployment — an app served from a hidden URL, with no login.
 *
 * The token *is* the access control: 24 random bytes in the path, unguessable
 * and revocable, and nothing else about the owner's account travels with it.
 * A deployment says only "this app's released snapshot may be read and run by
 * whoever holds this link"; the runtime rules that keep it to exactly that
 * live on the server.
 *
 * One live deployment per application. Re-deploying returns the link already
 * out there rather than minting a second one, so a URL someone pasted into a
 * doc keeps working; revoking is the only way to invalidate it, and the row
 * stays behind marked `revoked_at` so a revoked link is answered as gone
 * rather than as never-existing.
 */

import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { applicationDeployments } from "./schema/applications.js";

export class ApplicationDeployment extends DBModel {
  static override table = applicationDeployments;

  declare id: string;
  declare application_id: string;
  declare user_id: string;
  declare token: string;
  declare created_at: string;
  declare revoked_at: string | null;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.token ??= ApplicationDeployment.generateToken();
    this.created_at ??= new Date().toISOString();
    this.revoked_at ??= null;
  }

  /**
   * URL-safe and unguessable. 24 bytes is the same width the workflow share
   * link uses, and the same reason applies: the token is the only thing
   * standing between the URL and the app.
   */
  static generateToken(): string {
    return randomBytes(24).toString("base64url");
  }

  get isRevoked(): boolean {
    return this.revoked_at != null;
  }

  /**
   * The deployment a public request presents, live ones only. A revoked token
   * resolves to null so the caller answers it exactly the way it answers a
   * token that was never minted.
   */
  static async findLiveByToken(
    token: string
  ): Promise<ApplicationDeployment | null> {
    if (!token) return null;
    const db = getDb();
    const [row] = await db
      .select()
      .from(applicationDeployments)
      .where(
        and(
          eq(applicationDeployments.token, token),
          isNull(applicationDeployments.revoked_at)
        )
      )
      .limit(1);
    return row ? new ApplicationDeployment(row) : null;
  }

  /** The app's live deployment, if it has one. */
  static async findLive(
    applicationId: string
  ): Promise<ApplicationDeployment | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(applicationDeployments)
      .where(
        and(
          eq(applicationDeployments.application_id, applicationId),
          isNull(applicationDeployments.revoked_at)
        )
      )
      .limit(1);
    return row ? new ApplicationDeployment(row) : null;
  }

  /**
   * The app's live deployment, minting one if it has none. Reusing the live
   * link is what keeps an already-shared URL valid across repeated deploys.
   */
  static async ensure(opts: {
    applicationId: string;
    userId: string;
  }): Promise<ApplicationDeployment> {
    const live = await ApplicationDeployment.findLive(opts.applicationId);
    if (live) return live;
    return await ApplicationDeployment.create<ApplicationDeployment>({
      application_id: opts.applicationId,
      user_id: opts.userId
    });
  }

  async revoke(): Promise<void> {
    if (this.revoked_at != null) return;
    this.revoked_at = new Date().toISOString();
    await this.save();
  }

  /** Every deployment of an app, live and revoked. */
  static async listForApplication(
    applicationId: string
  ): Promise<ApplicationDeployment[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(applicationDeployments)
      .where(eq(applicationDeployments.application_id, applicationId));
    return rows.map(
      (r: Record<string, unknown>) => new ApplicationDeployment(r)
    );
  }
}
