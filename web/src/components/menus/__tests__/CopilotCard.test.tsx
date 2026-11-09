import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, type Query } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import "@testing-library/jest-dom";
import mockTheme from "../../../__mocks__/themeMock";
import CopilotCard from "../CopilotCard";

function setup() {
  const client = new QueryClient();
  const invalidate = jest.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={mockTheme}>
        <CopilotCard />
      </ThemeProvider>
    </QueryClientProvider>
  );
  return { invalidate };
}

it("shows the install and sign-in commands and no API key field", () => {
  setup();
  expect(screen.getByRole("article", { name: "GitHub Copilot" })).toBeInTheDocument();
  expect(screen.getByText(/npm install -g @github\/copilot/)).toBeInTheDocument();
  expect(screen.getByText(/copilot login/)).toBeInTheDocument();
  expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("refreshes provider and model queries", async () => {
  const { invalidate } = setup();
  await userEvent.click(screen.getByRole("button", { name: /refresh models/i }));
  expect(invalidate).toHaveBeenCalledTimes(1);
  const predicate = invalidate.mock.calls[0][0]?.predicate;
  const matches = (key: string) =>
    predicate?.({ queryKey: [key] } as unknown as Query) ?? false;
  expect(matches("providers")).toBe(true);
  expect(matches("language-models")).toBe(true);
  expect(matches("workflows")).toBe(false);
});
