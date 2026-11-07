/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

let mockStatus: "loading" | "admin" | "denied" = "denied";

jest.mock("../../../serverState/useAdminUsers", () => ({
  useIsAdminStatus: () => mockStatus
}));
jest.mock("../UsersAdmin", () => () => <div>users-tab</div>);

import AdminPage from "../AdminPage";

const renderPage = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <AdminPage />
    </ThemeProvider>
  );

describe("AdminPage", () => {
  it("tells a non-admin they need admin access", () => {
    mockStatus = "denied";
    renderPage();
    expect(screen.getByText("Admin access required")).toBeInTheDocument();
    expect(screen.queryByText("users-tab")).toBeNull();
  });

  it("shows the users tab to an admin", () => {
    mockStatus = "admin";
    renderPage();
    expect(screen.getByText("users-tab")).toBeInTheDocument();
  });
});
