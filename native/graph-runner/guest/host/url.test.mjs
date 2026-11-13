import assert from "node:assert/strict";
import { fileURLToPath as nodeFileURLToPath, pathToFileURL as nodePathToFileURL } from "node:url";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "./url.mjs";

test("Windows guest file URLs preserve drives, Unicode, and escaped delimiters", () => {
  const previous = globalThis.__host;
  globalThis.__host = { process: { platform: "win32" }, files: { cwd: () => "M:/workspace" } };
  try {
    for (const path of ["C:\\a b\\€.png", "M:/workspace/#x?y%z", "C:/", "C:\\folder\\"]) {
      const expected = nodePathToFileURL(path, { windows: true });
      assert.equal(pathToFileURL(path).href, expected.href);
      assert.equal(fileURLToPath(expected.href), nodeFileURLToPath(expected, { windows: true }));
    }
    assert.equal(pathToFileURL("image.png").href, "file:///M:/workspace/image.png");
    for (const url of ["file:///C:/a%2fb", "file:///C:/a%5cb", "file:///no-drive"]) {
      assert.throws(() => fileURLToPath(url), { code: "ERR_INVALID_FILE_URL_PATH" });
    }
  } finally {
    globalThis.__host = previous;
  }
});

test("POSIX guest file URLs retain POSIX conversion rules", () => {
  const previous = globalThis.__host;
  globalThis.__host = { process: { platform: "linux" }, files: { cwd: () => "/workspace" } };
  try {
    for (const path of ["/a b/€.png", "/#x?y%z", "/folder/", "/back\\slash"]) {
      const expected = nodePathToFileURL(path, { windows: false });
      assert.equal(pathToFileURL(path).href, expected.href);
      assert.equal(fileURLToPath(expected.href), nodeFileURLToPath(expected, { windows: false }));
    }
    assert.equal(pathToFileURL("/").href, "file:///");
  } finally {
    globalThis.__host = previous;
  }
});
