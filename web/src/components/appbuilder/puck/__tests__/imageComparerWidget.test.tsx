/**
 * The `ImageCompare` widget: two read bindings under one wipe handle, each
 * resolved before it reaches an `<img>`.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import {
  DEFAULT_OPERATION_ID,
  type AppInstanceState
} from "@nodetool-ai/app-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import { makeTestRuntime } from "../../__tests__/testRuntime";
import { ImageComparerWidget } from "../ImageComparerWidget";

// Locators resolve through TanStack Query; this suite stands up no
// QueryClientProvider, so use the manual mock — an `asset://<id>` locator comes
// back as `https://assets.test/<id>` and everything else passes through.
// (Resolution itself is covered by hooks/__tests__/useResolvedMediaUri.test.tsx.)
jest.mock("../../../../hooks/useResolvedMediaUri");

const BEFORE = `op:${DEFAULT_OPERATION_ID}/out:out1`;
const AFTER = `op:${DEFAULT_OPERATION_ID}/out:out2`;
const BEFORE_KEY = `${DEFAULT_OPERATION_ID}:out1`;
const AFTER_KEY = `${DEFAULT_OPERATION_ID}:out2`;

const SCOPED = {
  scope: {
    defaultOperationId: DEFAULT_OPERATION_ID,
    operations: [
      {
        operationId: DEFAULT_OPERATION_ID,
        inputs: [],
        outputs: [
          { nodeId: "out1", name: "before" },
          { nodeId: "out2", name: "after" }
        ],
        nodeIds: ["out1", "out2"]
      }
    ],
    variables: []
  }
};

const cell = (value: unknown) => ({
  value,
  invocationId: "j1",
  status: "done" as const,
  revision: 1
});

const withOutputs = (
  before?: unknown,
  after?: unknown
): Partial<AppInstanceState> => {
  const outputs: Record<string, ReturnType<typeof cell>> = {};
  if (before !== undefined) outputs[BEFORE_KEY] = cell(before);
  if (after !== undefined) outputs[AFTER_KEY] = cell(after);
  return { outputs };
};

const renderWidget = (
  element: React.ReactElement,
  initial: Partial<AppInstanceState> = {}
) => {
  const { wrapper: Wrapper } = makeTestRuntime(initial, SCOPED);
  return render(
    <ThemeProvider theme={mockTheme}>
      <Wrapper>{element}</Wrapper>
    </ThemeProvider>
  );
};

const widget = (
  props: Partial<React.ComponentProps<typeof ImageComparerWidget>> = {}
) => (
  <ImageComparerWidget
    id="c1"
    binding={BEFORE}
    compareBinding={AFTER}
    {...props}
  />
);

describe("ImageComparerWidget", () => {
  it("renders the comparer with both bound sources", () => {
    const { container } = renderWidget(
      widget(),
      withOutputs(
        { type: "image", uri: "https://cdn/before.png" },
        { type: "image", uri: "https://cdn/after.png" }
      )
    );

    expect(container.querySelector(".image-comparer")).toBeInTheDocument();
    expect(screen.getByAltText("Before")).toHaveAttribute(
      "src",
      "https://cdn/before.png"
    );
    expect(screen.getByAltText("After")).toHaveAttribute(
      "src",
      "https://cdn/after.png"
    );
  });

  it("renders the one bound image alone rather than a broken wipe", () => {
    const { container } = renderWidget(
      widget(),
      withOutputs({ type: "image", uri: "https://cdn/only.png" }, undefined)
    );

    expect(container.querySelector(".image-comparer")).not.toBeInTheDocument();
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "https://cdn/only.png");
  });

  it("renders the placeholder when neither binding holds an image", () => {
    const { container } = renderWidget(
      widget({ placeholder: "Nothing to compare yet" })
    );

    expect(screen.getByText("Nothing to compare yet")).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("renders a label above the comparer", () => {
    renderWidget(
      widget({ label: "Retouch" }),
      withOutputs(
        { type: "image", uri: "https://cdn/before.png" },
        { type: "image", uri: "https://cdn/after.png" }
      )
    );
    expect(screen.getByText("Retouch")).toBeInTheDocument();
  });

  it("resolves an asset locator instead of passing it through raw", () => {
    const { container } = renderWidget(
      widget(),
      withOutputs(
        { type: "image", uri: "asset://abc123" },
        { type: "image", asset_id: "def456" }
      )
    );

    expect(screen.getByAltText("Before")).toHaveAttribute(
      "src",
      "https://assets.test/abc123"
    );
    expect(screen.getByAltText("After")).toHaveAttribute(
      "src",
      "https://assets.test/def456"
    );
    const raw = Array.from(container.querySelectorAll("img")).filter((img) =>
      (img.getAttribute("src") ?? "").startsWith("asset://")
    );
    expect(raw).toEqual([]);
  });

  it("resolves a bare locator string and the last item of a streamed list", () => {
    renderWidget(
      widget(),
      withOutputs("asset://abc123", [
        { type: "image", uri: "https://cdn/first.png" },
        { type: "image", uri: "https://cdn/last.png" }
      ])
    );

    expect(screen.getByAltText("Before")).toHaveAttribute(
      "src",
      "https://assets.test/abc123"
    );
    expect(screen.getByAltText("After")).toHaveAttribute(
      "src",
      "https://cdn/last.png"
    );
  });
});
