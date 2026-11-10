import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { stub } from "../../../test-utils/doubles";
import { useOllamaStatus } from "../../../serverState/useOllamaStatus";
import LocalModelsRow from "../LocalModelsRow";

jest.mock("../../../serverState/useOllamaStatus");
const refetch = jest.fn();
const show = (data: "connected" | "unreachable" | "unavailable") => {
  jest.mocked(useOllamaStatus).mockReturnValue(stub<ReturnType<typeof useOllamaStatus>>({
    data, isPending: false, isError: false, isFetching: false, refetch
  }));
  return render(<ThemeProvider theme={mockTheme}><LocalModelsRow /></ThemeProvider>);
};

it("does not suggest installing Ollama when it is connected", () => {
  show("connected");
  expect(screen.getByRole("status")).toHaveTextContent("Ollama is connected");
  expect(screen.queryByRole("link", { name: "Download Ollama" })).not.toBeInTheDocument();
});

it("offers a retry when Ollama cannot be reached without claiming it is missing", async () => {
  show("unreachable");
  expect(screen.getByRole("status")).toHaveTextContent("If it’s installed, open it");
  expect(screen.getByRole("link", { name: "Download Ollama" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Check again" }));
  expect(refetch).toHaveBeenCalled();
});

it("explains when the hosted server cannot connect to local Ollama", () => {
  show("unavailable");
  expect(screen.getByRole("status")).toHaveTextContent("desktop app");
  expect(screen.queryByRole("link", { name: "Download Ollama" })).not.toBeInTheDocument();
});
