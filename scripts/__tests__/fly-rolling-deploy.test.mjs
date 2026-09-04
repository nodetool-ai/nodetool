import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

const harness = fileURLToPath(
  new URL("./fly-rolling-deploy.test.sh", import.meta.url)
);

describe("fly rolling deploy", () => {
  it(
    "handles legacy and stopped machines",
    () => {
      execFileSync("bash", [harness], { stdio: "pipe" });
    },
    10_000
  );
});
