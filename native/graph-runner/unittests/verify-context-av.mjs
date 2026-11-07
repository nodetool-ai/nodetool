import { spawnSync } from "node:child_process";
const [binary, bundle] = process.argv.slice(2);
if (!binary || !bundle)
  throw new Error("Expected Code media driver and fixture");
for (const invalid of [false, true]) {
  const result = spawnSync(
    binary,
    [bundle, ...(invalid ? ["--drop-original"] : [])],
    { encoding: "utf8", timeout: 600000, maxBuffer: 4 * 1024 * 1024 }
  );
  process.stdout.write(result.stdout ?? "");
  if (result.error) throw result.error;
  if (invalid) {
    if (
      result.status !== 1 ||
      !result.stderr.includes(
        "Code keepOriginalAudio did not preserve two separate real audio tracks"
      )
    )
      throw new Error(
        `Invalid track fixture did not fail its independent verifier: exit=${result.status}\n${result.stderr}`
      );
    console.log(
      "Negative independent verifier rejected the intentionally omitted original audio track"
    );
  } else if (result.status !== 0)
    throw new Error(
      `Code media regression failed: exit=${result.status}\n${result.stderr}`
    );
}
