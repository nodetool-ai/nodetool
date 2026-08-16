import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import mockTheme from "../../../__mocks__/themeMock";
import { trpcClient } from "../../../trpc/client";

jest.mock("../../../config/data_types", () => ({}));

import SandboxPackagesProperty, {
  SANDBOX_CONSENT_TEXT,
  type Declaration
} from "../SandboxPackagesProperty";
import { asMock } from "../../../test-utils/doubles";

const modulesQuery = asMock(trpcClient.packs.sandboxModules
  .query);
const docsQuery = asMock(trpcClient.packs.sandboxPackageDocs
  .query);

const MODULE = {
  specifier: "@acme/geo",
  packName: "@acme/geo",
  packVersion: "1.2.0",
  kind: "js" as const,
  description: "Great-circle distance helpers.",
  contentDigest: "a".repeat(64)
};

const defaultProps = {
  property: {
    name: "packages",
    description: "Sandbox packages this code may import.",
    type: { type: "list", optional: false, type_args: [] }
  } as any,
  propertyIndex: "0",
  value: [] as (string | Declaration)[],
  onChange: jest.fn(),
  nodeId: "node1",
  nodeType: "nodetool.code.Code"
};

function renderPicker(props: Partial<typeof defaultProps> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={mockTheme}>
        <SandboxPackagesProperty {...defaultProps} {...props} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe("SandboxPackagesProperty", () => {
  beforeEach(() => {
    modulesQuery.mockReset();
    modulesQuery.mockResolvedValue({ modules: [MODULE], diagnostics: [] });
    docsQuery.mockReset();
    docsQuery.mockResolvedValue(null);
    defaultProps.onChange.mockReset();
  });

  it("lists installed modules with their one-liners and the consent sentence", async () => {
    renderPicker();
    expect(
      screen.getByText(/run inside your workflows with the node's capabilities/)
    ).toBeInTheDocument();
    expect(screen.getByText(SANDBOX_CONSENT_TEXT)).toBeInTheDocument();
    expect(await screen.findByText("@acme/geo")).toBeInTheDocument();
    expect(
      screen.getByText("Great-circle distance helpers.")
    ).toBeInTheDocument();
  });

  it("writes a declaration stamped with the version and digest", async () => {
    const onChange = jest.fn();
    renderPicker({ onChange });
    const checkbox = await screen.findByLabelText("@acme/geo");
    await userEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith([
      {
        specifier: "@acme/geo",
        resolvedPackVersion: "1.2.0",
        contentDigest: MODULE.contentDigest
      }
    ]);
  });

  it("drops a declaration when the package is unchecked", async () => {
    const onChange = jest.fn();
    renderPicker({
      onChange,
      value: [{ specifier: "@acme/geo", contentDigest: MODULE.contentDigest }]
    });
    const checkbox = await screen.findByLabelText("@acme/geo");
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows the SKILL.md on request and marks an untrusted author", async () => {
    docsQuery.mockResolvedValue({
      packName: "@acme/geo",
      trusted: false,
      name: "acme-geo",
      description: "Great-circle distance helpers.",
      body: "Call distance(a, b)."
    });
    renderPicker();
    await userEvent.click(await screen.findByRole("button", { name: "Docs" }));
    expect(await screen.findByText("Call distance(a, b).")).toBeInTheDocument();
    expect(
      screen.getByText(/not on your trusted list/)
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(docsQuery).toHaveBeenCalledWith({ packName: "@acme/geo" })
    );
  });

  it("shows a saved declaration no installed pack answers", async () => {
    renderPicker({
      value: [
        { specifier: "@acme/geo", contentDigest: MODULE.contentDigest },
        { specifier: "@gone/pack", contentDigest: "b".repeat(64) }
      ]
    });
    expect(await screen.findByText("@gone/pack")).toBeInTheDocument();
    expect(screen.getByText("unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(/no installed pack declares it/)
    ).toBeInTheDocument();
    // The installed entry is untouched by its neighbour.
    expect(await screen.findByLabelText("@acme/geo")).toBeChecked();
  });

  it("removes a missing declaration and keeps the installed ones", async () => {
    const onChange = jest.fn();
    const stale = { specifier: "@gone/pack", contentDigest: "b".repeat(64) };
    const kept = { specifier: "@acme/geo", contentDigest: MODULE.contentDigest };
    renderPicker({ onChange, value: [kept, stale] });
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove" })
    );
    expect(onChange).toHaveBeenCalledWith([kept]);
  });

  it("removes a missing declaration by unchecking it", async () => {
    const onChange = jest.fn();
    const stale = { specifier: "@gone/pack", contentDigest: "b".repeat(64) };
    renderPicker({ onChange, value: [stale] });
    await userEvent.click(await screen.findByLabelText("@gone/pack"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("reports nothing missing until the module list actually loads", async () => {
    // A pending or failed query is not evidence a pack is gone, so nothing is
    // reported missing until the list actually arrives.
    modulesQuery.mockRejectedValue(new Error("nope"));
    renderPicker({ value: [{ specifier: "@gone/pack" }] });
    expect(
      await screen.findByText("Installed sandbox packages could not be read.")
    ).toBeInTheDocument();
    expect(screen.queryByText("unavailable")).not.toBeInTheDocument();
  });

  it("says so when no sandbox package is installed", async () => {
    modulesQuery.mockResolvedValue({ modules: [], diagnostics: [] });
    renderPicker();
    expect(
      await screen.findByText("No sandbox packages are installed.")
    ).toBeInTheDocument();
  });
});
