import { describe, expect, it, vi } from "vitest";
import { createLogger } from "@nodetool-ai/config";
import { logPythonWorkerStderr } from "../src/python-worker-stderr.js";

describe("logPythonWorkerStderr", () => {
  it("forwards Python INFO lines at info level", () => {
    const logger = createLogger("test.python-worker-stderr");
    const info = vi.spyOn(logger, "info");
    const debug = vi.spyOn(logger, "debug");

    logPythonWorkerStderr(
      "2026-05-25 01:37:06 | INFO | nodetool.nodes.huggingface.text_to_image | Flux preload: loading",
      logger
    );

    expect(info).toHaveBeenCalledTimes(1);
    expect(debug).not.toHaveBeenCalled();
  });

  it("forwards uncategorized lines at info level so nothing is dropped", () => {
    const logger = createLogger("test.python-worker-stderr");
    const info = vi.spyOn(logger, "info");
    const debug = vi.spyOn(logger, "debug");

    logPythonWorkerStderr("Loading pipeline components...:  14%", logger);

    expect(info).toHaveBeenCalledTimes(1);
    expect(debug).not.toHaveBeenCalled();
  });

  it("keeps explicit DEBUG lines at debug level", () => {
    const logger = createLogger("test.python-worker-stderr");
    const info = vi.spyOn(logger, "info");
    const debug = vi.spyOn(logger, "debug");

    logPythonWorkerStderr(
      "2026-05-25 01:37:06 | DEBUG | nodetool.worker | dispatching execute",
      logger
    );

    expect(debug).toHaveBeenCalledTimes(1);
    expect(info).not.toHaveBeenCalled();
  });
});
