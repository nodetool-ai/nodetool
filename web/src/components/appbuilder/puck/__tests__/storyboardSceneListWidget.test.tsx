import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { ResourceBinding } from "@nodetool-ai/app-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import { makeTestRuntime } from "../../__tests__/testRuntime";

interface Detail {
  ref: { kind: "storyboard"; id: string; revision: number };
  name: string;
  projectId: string | null;
  contentType: string | null;
  updatedAt: string;
  document: { brief: string; shots: Array<Record<string, unknown>> };
}

const shot = (id: string, slug: string, index: number) => ({
  type: "shot",
  id,
  index,
  slug,
  action: "",
  status: "draft"
});

const makeDetail = (revision: number, slugs: string[]): Detail => ({
  ref: { kind: "storyboard", id: "sb1", revision },
  name: "Trailer",
  projectId: "default",
  contentType: null,
  updatedAt: "2026-07-01T00:00:00.000Z",
  document: {
    brief: "a trailer",
    shots: slugs.map((slug, i) => shot(`s${i + 1}`, slug, i))
  }
});

let detail: Detail = makeDetail(3, ["Opening", "Chase", "Finale"]);
let outcome: "ok" | "conflict" = "ok";

const mutateSpy = jest.fn();
const invalidateSpy = jest.fn();
const setDataSpy = jest.fn();

interface MutationOptions {
  onSuccess: (detail: Detail) => void;
  onError: (error: unknown) => void;
}

interface UpdateInput {
  ref: { kind: string; id: string; revision?: number };
  document: { brief: string; shots: Array<Record<string, unknown>> };
}

jest.mock("../../../../trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      resources: {
        read: { setData: setDataSpy, invalidate: invalidateSpy }
      }
    }),
    resources: {
      list: { useQuery: () => ({ data: [], isLoading: false }) },
      read: { useQuery: () => ({ data: detail, isLoading: false }) },
      update: {
        useMutation: (options: MutationOptions) => ({
          isPending: false,
          error: null,
          mutate: (input: UpdateInput) => {
            mutateSpy(input);
            if (outcome === "conflict") {
              // The row moved on; a refetch would return this.
              detail = makeDetail(9, ["Finale", "Opening", "Chase"]);
              options.onError({ data: { code: "CONFLICT" } });
              return;
            }
            detail = {
              ...detail,
              ref: { ...detail.ref, revision: detail.ref.revision + 1 },
              document: input.document
            };
            options.onSuccess(detail);
          }
        })
      }
    },
    assets: { get: { useQuery: () => ({ data: null }) } }
  }
}));

import { StoryboardSceneListWidget } from "../StoryboardSceneListWidget";

const BINDING: ResourceBinding = {
  id: "rb1",
  name: "Storyboard",
  kind: "storyboard",
  scope: { fixedId: "sb1" },
  operations: ["read", "update"]
};

const renderList = () => {
  const { wrapper: Wrapper } = makeTestRuntime({}, { resources: [BINDING] });
  render(
    <ThemeProvider theme={mockTheme}>
      <Wrapper>
        <StoryboardSceneListWidget
          id="sl1"
          resourceBindingId="rb1"
          label="Scenes"
        />
      </Wrapper>
    </ThemeProvider>
  );
};

const sceneNames = () =>
  screen.getAllByRole("listitem").map((li) => li.textContent?.split("Up")[0]);

beforeEach(() => {
  jest.clearAllMocks();
  detail = makeDetail(3, ["Opening", "Chase", "Finale"]);
  outcome = "ok";
});

describe("StoryboardSceneListWidget", () => {
  it("lists the bound storyboard's scenes in document order", () => {
    renderList();

    expect(sceneNames()).toEqual(["Opening", "Chase", "Finale"]);
  });

  it("writes a reorder back with the revision it read", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: "Move Chase up" }));

    expect(mutateSpy).toHaveBeenCalledTimes(1);
    const input = mutateSpy.mock.calls[0][0] as UpdateInput;
    expect(input.ref).toEqual({ kind: "storyboard", id: "sb1", revision: 3 });
    expect(input.document.shots.map((s) => s.slug)).toEqual([
      "Chase",
      "Opening",
      "Finale"
    ]);
    // Shots carry their position, so it is renumbered with the new order.
    expect(input.document.shots.map((s) => s.index)).toEqual([0, 1, 2]);
    // The rest of the document travels untouched.
    expect(input.document.brief).toBe("a trailer");
  });

  it("drops a scene and keeps the remaining order", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: "Remove Chase" }));

    const input = mutateSpy.mock.calls[0][0] as UpdateInput;
    expect(input.document.shots.map((s) => s.slug)).toEqual([
      "Opening",
      "Finale"
    ]);
  });

  it("tells the user their view was behind and reloads on a stale revision", async () => {
    const user = userEvent.setup();
    outcome = "conflict";
    renderList();

    await user.click(screen.getByRole("button", { name: "Move Chase up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /changed since you opened it/i
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      ref: { kind: "storyboard", id: "sb1" }
    });
    // The rejected edit is gone; what is shown is what the server holds.
    expect(sceneNames()).toEqual(["Finale", "Opening", "Chase"]);
    // No blind retry — one attempt, then the user decides.
    expect(mutateSpy).toHaveBeenCalledTimes(1);
  });

  it("refuses a binding that is not a storyboard", () => {
    const { wrapper: Wrapper } = makeTestRuntime(
      {},
      { resources: [{ ...BINDING, kind: "asset" as const }] }
    );
    render(
      <ThemeProvider theme={mockTheme}>
        <Wrapper>
          <StoryboardSceneListWidget id="sl1" resourceBindingId="rb1" />
        </Wrapper>
      </ThemeProvider>
    );

    expect(screen.getByText(/need a storyboard binding/)).toBeInTheDocument();
  });
});
