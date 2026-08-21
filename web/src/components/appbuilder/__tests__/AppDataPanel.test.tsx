/**
 * The panel that makes operations, variables, and resources editable by hand
 * rather than only through the agent's `ui_app_*` tools.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EMPTY_DOC_META, type AppDocMeta } from "@nodetool-ai/app-runtime";

import mockTheme from "../../../__mocks__/themeMock";
import AppDataPanel from "../AppDataPanel";

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    workflows: {
      list: {
        query: jest.fn().mockResolvedValue({
          workflows: [
            { id: "wf1", name: "Summarize" },
            { id: "wf2", name: "Translate" }
          ]
        })
      }
    },
    jsScripts: {
      list: {
        query: jest.fn().mockResolvedValue([
          { id: "js1", name: "Running total" },
          { id: "js2", name: "Slugify" }
        ])
      }
    },
    resources: {
      list: {
        query: jest.fn().mockImplementation(async ({ kind }: { kind: string }) => {
          if (kind === "storyboard") {
            return [
              {
                ref: { kind: "storyboard", id: "board-1" },
                name: "Opening",
                projectId: "default",
                contentType: null,
                updatedAt: "2026-08-01T00:00:00.000Z"
              }
            ];
          }
          if (kind === "asset") {
            return [
              {
                ref: { kind: "asset", id: "asset-1" },
                name: "Hero",
                projectId: null,
                contentType: "image/png",
                updatedAt: "2026-08-01T00:00:00.000Z"
              }
            ];
          }
          return [];
        })
      }
    }
  }
}));

const renderPanel = (meta: AppDocMeta = EMPTY_DOC_META) => {
  const onChange = jest.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={mockTheme}>
        <AppDataPanel
          meta={meta}
          onChange={onChange}
          workflowId="wf1"
          workflowName="Summarize"
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
  return { onChange };
};

const withVariable = (
  overrides: Partial<AppDocMeta["variables"][number]> = {}
): AppDocMeta => ({
  ...EMPTY_DOC_META,
  variables: [
    {
      id: "tone",
      name: "tone",
      type: null,
      scope: "instance",
      persist: false,
      ...overrides
    }
  ]
});

describe("AppDataPanel", () => {
  it("adds an operation bound to the builder's workflow", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPanel();
    await user.click(screen.getByRole("button", { name: /add operation/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        operations: [expect.objectContaining({ workflowId: "wf1" })]
      })
    );
  });

  it("declares a variable", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPanel();
    await user.click(screen.getByRole("button", { name: /add variable/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: [expect.objectContaining({ id: "variable_1" })]
      })
    );
  });

  it("removes a variable", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPanel(withVariable());
    await user.click(
      screen.getByRole("button", { name: "Remove variable tone" })
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ variables: [] })
    );
  });

  it("changes an operation's run policy", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPanel({
      ...EMPTY_DOC_META,
      operations: [
        {
          id: "main",
          name: "Main",
          workflowId: "wf1",
          inputs: {},
          outputs: {},
          policy: "replace"
        }
      ]
    });
    await user.click(screen.getByRole("combobox", { name: /while one is running/i }));
    await user.click(screen.getByRole("option", { name: /queue behind/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        operations: [expect.objectContaining({ policy: "queue" })]
      })
    );
  });

  it("only offers persistence on a per-user variable", async () => {
    renderPanel(withVariable({ scope: "instance" }));
    expect(
      screen.getByRole("switch", { name: /remember between visits/i })
    ).toBeDisabled();
    expect(
      screen.getByText(/only per-user variables can be remembered/i)
    ).toBeInTheDocument();
  });

  it("keeps an operation's workflow selectable when the list does not carry it", async () => {
    renderPanel({
      ...EMPTY_DOC_META,
      operations: [
        {
          id: "main",
          name: "Main",
          workflowId: "wf-gone",
          inputs: {},
          outputs: {},
          policy: "replace"
        }
      ]
    });
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /workflow/i })).toHaveTextContent(
        "wf-gone"
      )
    );
  });

  it("binds an operation to a JS script", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPanel({
      ...EMPTY_DOC_META,
      operations: [
        {
          id: "main",
          name: "Main",
          workflowId: "wf1",
          // Mappings against the workflow's nodes, which the script cannot honour.
          inputs: { "node-1": { from: "widget" } },
          outputs: { "node-2": { to: "display" } },
          policy: "replace"
        }
      ]
    });

    await user.click(screen.getByRole("combobox", { name: /^runs$/i }));
    await user.click(screen.getByRole("option", { name: /js script/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            workflowId: "",
            target: { kind: "script", scriptId: "", scriptVersion: 0 },
            // The old target's mappings mean nothing against a script.
            inputs: {},
            outputs: {}
          })
        ]
      })
    );
  });

  it("picks from the user's scripts for a script operation", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPanel({
      ...EMPTY_DOC_META,
      operations: [
        {
          id: "main",
          name: "Main",
          workflowId: "",
          target: { kind: "script", scriptId: "", scriptVersion: 0 },
          inputs: {},
          outputs: {},
          policy: "replace"
        }
      ]
    });

    await user.click(await screen.findByRole("combobox", { name: /^script$/i }));
    await user.click(await screen.findByRole("option", { name: /slugify/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            target: { kind: "script", scriptId: "js2", scriptVersion: 0 }
          })
        ]
      })
    );
  });

  it("binds all documents of the selected kind without asking for a project id", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPanel();
    await user.click(screen.getByRole("button", { name: /^resources$/i }));

    expect(screen.queryByLabelText(/project id/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add resource/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        resources: [
          expect.objectContaining({
            name: "Assets",
            kind: "asset",
            scope: { projectId: "default" }
          })
        ]
      })
    );
  });

  it("pins a named document of the selected kind", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPanel();
    await user.click(screen.getByRole("button", { name: /^resources$/i }));

    await user.click(screen.getByRole("combobox", { name: /^kind$/i }));
    await user.click(screen.getByRole("option", { name: /^storyboard$/i }));

    await user.click(await screen.findByRole("combobox", { name: /^storyboard$/i }));
    await user.click(await screen.findByRole("option", { name: /opening/i }));
    await user.click(screen.getByRole("button", { name: /add resource/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        resources: [
          expect.objectContaining({
            name: "Opening",
            kind: "storyboard",
            scope: { fixedId: "board-1" }
          })
        ]
      })
    );
  });
});
