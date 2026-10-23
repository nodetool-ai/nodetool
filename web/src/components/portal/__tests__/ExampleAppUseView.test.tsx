import { readFileSync } from "fs";
import { join } from "path";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { runJsScript } from "../../jsScript/runJsScript";
import { stub } from "../../../test-utils/doubles";
import ExampleAppUseView from "../ExampleAppUseView";

let capturedRunner: typeof runJsScript | undefined;

jest.mock("../../appbuilder/AppRuntimeView", () => ({
  __esModule: true,
  default: (props: { scriptRunner: typeof runJsScript }) => {
    capturedRunner = props.scriptRunner;
    return null;
  }
}));

const mockRestFetch = jest.fn();
jest.mock("../../../lib/rest-fetch", () => ({
  restFetch: (...args: unknown[]) => mockRestFetch(...args)
}));

const bundle = JSON.parse(
  readFileSync(
    join(
      __dirname,
      "../../../../../packages/base-nodes/nodetool/examples/apps/directed-campaign-kit.app.json"
    ),
    "utf8"
  )
);

describe("ExampleAppUseView", () => {
  beforeEach(() => {
    capturedRunner = undefined;
    mockRestFetch.mockReset();
  });

  it("shows the server's reason when an example's step fails", async () => {
    // Study 14: a failed step said only "Example app operation failed".
    mockRestFetch.mockImplementation(async (url: string) =>
      url.endsWith("/run")
        ? stub<Response>({
            ok: false,
            status: 400,
            json: async () => ({ detail: "No language model can read images" })
          })
        : stub<Response>({ ok: true, status: 200, json: async () => bundle })
    );
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <ExampleAppUseView slug="directed-campaign-kit" />
      </QueryClientProvider>
    );
    await waitFor(() => expect(capturedRunner).toBeDefined());
    await expect(
      capturedRunner!("analyze", {}, undefined, undefined, undefined, undefined)
    ).rejects.toThrow("No language model can read images");
  });
});
