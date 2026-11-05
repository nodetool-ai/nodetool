import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearGoogleTokenCache,
  getGoogleAccessToken,
  parseGoogleCredentials,
  type GoogleCredentials
} from "../../src/providers/google-cloud-auth.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const SERVICE_ACCOUNT = {
  type: "service_account",
  client_email: "victim@example.iam.gserviceaccount.com",
  private_key_id: "public-key-id",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString()
};
const AUTHORIZED_USER: GoogleCredentials = {
  type: "authorized_user",
  client_id: "client-id",
  client_secret: "client-secret",
  refresh_token: "refresh-token"
};

function tokenResponse(token: string): Response {
  return Response.json({ access_token: token, expires_in: 3600 });
}

beforeEach(() => clearGoogleTokenCache());

describe("Google credential token isolation", () => {
  it.each(["public-key-id", undefined])(
    "rejects a copied service account identity with an invalid private key (key id: %s)",
    async (private_key_id) => {
      const credentials = parseGoogleCredentials(
        JSON.stringify({ ...SERVICE_ACCOUNT, private_key_id })
      );
      const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(tokenResponse("victim-token"));
      await expect(getGoogleAccessToken(credentials, { fetchFn })).resolves.toBe("victim-token");

      await expect(
        getGoogleAccessToken(
          parseGoogleCredentials(JSON.stringify({ ...credentials, private_key: "invalid" })),
          { fetchFn }
        )
      ).rejects.toThrow("private_key could not be read");
      expect(fetchFn).toHaveBeenCalledTimes(1);
    }
  );

  it("does not share an in-flight service account token with a copied public identity", async () => {
    const response = Promise.withResolvers<Response>();
    const started = Promise.withResolvers<void>();
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(() => {
      started.resolve();
      return response.promise;
    });
    const credentials = parseGoogleCredentials(JSON.stringify(SERVICE_ACCOUNT));
    const victim = getGoogleAccessToken(credentials, { fetchFn });
    await started.promise;
    const attacker = getGoogleAccessToken(
      parseGoogleCredentials(JSON.stringify({ ...SERVICE_ACCOUNT, private_key: "invalid" })),
      { fetchFn }
    );
    const rejected = expect(attacker).rejects.toThrow("private_key could not be read");
    response.resolve(tokenResponse("victim-token"));
    await rejected;
    await expect(victim).resolves.toBe("victim-token");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each(["client_id", "client_secret", "refresh_token"] as const)(
    "does not reuse authorized-user tokens after %s changes",
    async (field) => {
      const fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(tokenResponse("original-token"))
        .mockResolvedValueOnce(Response.json({ error: "invalid_grant" }, { status: 400 }));
      await getGoogleAccessToken(AUTHORIZED_USER, { fetchFn });
      await expect(
        getGoogleAccessToken({ ...AUTHORIZED_USER, [field]: "invalid" }, { fetchFn })
      ).rejects.toThrow("invalid_grant");
      expect(fetchFn).toHaveBeenCalledTimes(2);
    }
  );

  it("keeps delimiter-containing credential fields distinct", async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse("first-token"))
      .mockResolvedValueOnce(tokenResponse("second-token"));
    await getGoogleAccessToken(
      { ...AUTHORIZED_USER, client_id: "a:b", refresh_token: "c" }, { fetchFn }
    );
    await expect(getGoogleAccessToken(
      { ...AUTHORIZED_USER, client_id: "a", refresh_token: "b:c" }, { fetchFn }
    )).resolves.toBe("second-token");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("does not share an authorized-user mint after its client secret changes", async () => {
    const response = Promise.withResolvers<Response>();
    const started = Promise.withResolvers<void>();
    const fetchFn = vi.fn<typeof fetch>()
      .mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      })
      .mockResolvedValueOnce(Response.json({ error: "invalid_client" }, { status: 400 }));
    const original = getGoogleAccessToken(AUTHORIZED_USER, { fetchFn });
    await started.promise;
    const changed = getGoogleAccessToken(
      { ...AUTHORIZED_USER, client_secret: "invalid" }, { fetchFn }
    );
    const rejected = expect(changed).rejects.toThrow("invalid_client");
    response.resolve(tokenResponse("original-token"));
    await rejected;
    await expect(original).resolves.toBe("original-token");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("retries a failed mint and preserves its credential snapshot", async () => {
    const credentials = { ...AUTHORIZED_USER };
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: "invalid_grant" }, { status: 400 }))
      .mockResolvedValueOnce(tokenResponse("retried-token"));
    await expect(getGoogleAccessToken(credentials, { fetchFn })).rejects.toThrow("invalid_grant");
    const token = getGoogleAccessToken(credentials, { fetchFn });
    credentials.client_secret = "changed-after-call";
    await expect(token).resolves.toBe("retried-token");
    const form = new URLSearchParams(String(fetchFn.mock.calls[1][1]?.body));
    expect(form.get("client_secret")).toBe(AUTHORIZED_USER.client_secret);
    await expect(getGoogleAccessToken(AUTHORIZED_USER, { fetchFn })).resolves.toBe("retried-token");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it.each([
    parseGoogleCredentials(JSON.stringify(SERVICE_ACCOUNT)),
    AUTHORIZED_USER
  ])("reuses completed and concurrent tokens for matching $type credentials", async (credentials) => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => tokenResponse("shared-token"));
    await expect(Promise.all([
      getGoogleAccessToken(credentials, { fetchFn }),
      getGoogleAccessToken({ ...credentials }, { fetchFn })
    ])).resolves.toEqual(["shared-token", "shared-token"]);
    await expect(getGoogleAccessToken({ ...credentials }, { fetchFn })).resolves.toBe("shared-token");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("does not restore a cleared token when an older mint completes", async () => {
    const oldResponse = Promise.withResolvers<Response>();
    const started = Promise.withResolvers<void>();
    const fetchFn = vi.fn<typeof fetch>()
      .mockImplementationOnce(() => {
        started.resolve();
        return oldResponse.promise;
      })
      .mockResolvedValueOnce(tokenResponse("new-token"));
    const oldToken = getGoogleAccessToken(AUTHORIZED_USER, { fetchFn });
    await started.promise;
    clearGoogleTokenCache();
    await expect(getGoogleAccessToken(AUTHORIZED_USER, { fetchFn })).resolves.toBe("new-token");
    oldResponse.resolve(tokenResponse("old-token"));
    await expect(oldToken).resolves.toBe("old-token");
    await expect(getGoogleAccessToken(AUTHORIZED_USER, { fetchFn })).resolves.toBe("new-token");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
