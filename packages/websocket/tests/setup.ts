import { randomBytes } from "node:crypto";

if (!process.env.SECRETS_MASTER_KEY) {
  process.env.SECRETS_MASTER_KEY = randomBytes(32).toString("base64");
}
