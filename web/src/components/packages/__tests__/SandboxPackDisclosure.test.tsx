import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import mockTheme from "../../../__mocks__/themeMock";
import { trpcClient } from "../../../trpc/client";
import SandboxPackDisclosure, {
  SANDBOX_PACK_CONSENT_TEXT
} from "../SandboxPackDisclosure";
import { asMock } from "../../../test-utils/doubles";

const modulesQuery = asMock(trpcClient.packs.sandboxModules
  .query);
const docsQuery = asMock(trpcClient.packs.sandboxPackageDocs
  .query);

function renderPanel(packName = "@acme/geo") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={mockTheme}>
        <SandboxPackDisclosure packName={packName} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe("SandboxPackDisclosure", () => {
  beforeEach(() => {
    modulesQuery.mockReset();
    modulesQuery.mockResolvedValue({
      modules: [
        {
          specifier: "@acme/geo",
          packName: "@acme/geo",
          kind: "js",
          description: "Great-circle distance helpers."
        },
        {
          specifier: "@other/pack",
          packName: "@other/pack",
          kind: "js"
        }
      ],
      diagnostics: []
    });
    docsQuery.mockReset();
    docsQuery.mockResolvedValue(null);
  });

  it("states the consent sentence and this pack's module one-liners", async () => {
    renderPanel();
    expect(
      await screen.findByText(SANDBOX_PACK_CONSENT_TEXT)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/run inside your workflows with the node's capabilities/)
    ).toBeInTheDocument();
    expect(
      screen.getByText("@acme/geo — Great-circle distance helpers.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/@other\/pack/)).not.toBeInTheDocument();
  });

  it("shows the SKILL.md on request", async () => {
    docsQuery.mockResolvedValue({
      trusted: true,
      name: "acme-geo",
      description: "Great-circle distance helpers.",
      body: "Call distance(a, b)."
    });
    renderPanel();
    await userEvent.click(
      await screen.findByRole("button", { name: "View documentation" })
    );
    expect(await screen.findByText("Call distance(a, b).")).toBeInTheDocument();
    expect(screen.queryByText(/not on your trusted list/)).not.toBeInTheDocument();
  });

  it("renders nothing for a pack with no sandbox modules", async () => {
    const { container } = renderPanel("@nobody/pack");
    expect(container).toBeEmptyDOMElement();
  });
});
