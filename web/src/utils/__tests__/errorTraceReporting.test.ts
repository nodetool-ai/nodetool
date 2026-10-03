import { trpcClient } from "../../trpc/client";
import { reportClientError } from "../errorTraceReporting";

const capture = trpcClient.errorTraces.capture.mutate as jest.Mock;

describe("reportClientError", () => {
  beforeEach(() => capture.mockClear());

  it("sends one trace per distinct crash", () => {
    const error = new TypeError("x is undefined");
    reportClientError(error, "Inspector");
    reportClientError(error, "Inspector");
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "web",
        error_type: "TypeError",
        message: "x is undefined",
        context: expect.objectContaining({ component: "Inspector" })
      })
    );
  });

  it("never throws when the request fails", async () => {
    capture.mockRejectedValueOnce(new Error("offline"));
    expect(() => reportClientError(new Error("other"), "route")).not.toThrow();
    await Promise.resolve();
  });
});
