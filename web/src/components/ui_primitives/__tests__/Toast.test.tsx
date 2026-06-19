import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toast } from "../Toast";

describe("Toast", () => {
  describe("rendering", () => {
    it("renders message when open", () => {
      render(
        <Toast open message="File saved" onClose={jest.fn()} />
      );
      expect(screen.getByText("File saved")).toBeInTheDocument();
    });

    it("does not render message when closed", () => {
      render(
        <Toast open={false} message="File saved" onClose={jest.fn()} />
      );
      expect(screen.queryByText("File saved")).not.toBeInTheDocument();
    });

    it("renders with default success severity", () => {
      render(
        <Toast open message="Done" onClose={jest.fn()} />
      );
      const alert = screen.getByRole("alert");
      expect(alert).toHaveClass("MuiAlert-filledSuccess");
    });
  });

  describe("severity variants", () => {
    const severities = ["error", "warning", "info", "success"] as const;

    severities.forEach((severity) => {
      it(`renders ${severity} severity`, () => {
        render(
          <Toast
            open
            message={`${severity} message`}
            severity={severity}
            onClose={jest.fn()}
          />
        );
        const alert = screen.getByRole("alert");
        const capitalized = severity.charAt(0).toUpperCase() + severity.slice(1);
        expect(alert).toHaveClass(`MuiAlert-filled${capitalized}`);
      });
    });
  });

  describe("close behavior", () => {
    it("calls onClose when close button is clicked", async () => {
      const user = userEvent.setup();
      const handleClose = jest.fn();
      render(
        <Toast open message="Closeable" onClose={handleClose} />
      );

      const closeButton = screen.getByRole("button", { name: /close/i });
      await user.click(closeButton);

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("does not call onClose on clickaway", async () => {
      const handleClose = jest.fn();
      render(
        <Toast open message="Sticky" onClose={handleClose} />
      );

      await userEvent.click(document.body);

      expect(handleClose).not.toHaveBeenCalled();
    });
  });

  describe("positioning", () => {
    it("renders at bottom-center by default", () => {
      const { container } = render(
        <Toast open message="Default position" onClose={jest.fn()} />
      );
      const snackbar = container.querySelector(".MuiSnackbar-root");
      expect(snackbar).toHaveClass("MuiSnackbar-anchorOriginBottomCenter");
    });

    it("respects custom vertical and horizontal props", () => {
      const { container } = render(
        <Toast
          open
          message="Top right"
          vertical="top"
          horizontal="right"
          onClose={jest.fn()}
        />
      );
      const snackbar = container.querySelector(".MuiSnackbar-root");
      expect(snackbar).toHaveClass("MuiSnackbar-anchorOriginTopRight");
    });
  });

  describe("auto-dismiss", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("calls onClose after default duration", async () => {
      const handleClose = jest.fn();
      render(
        <Toast open message="Auto dismiss" onClose={handleClose} />
      );

      jest.advanceTimersByTime(4000);

      await waitFor(() => {
        expect(handleClose).toHaveBeenCalled();
      });
    });

    it("respects custom duration", async () => {
      const handleClose = jest.fn();
      render(
        <Toast
          open
          message="Custom duration"
          duration={2000}
          onClose={handleClose}
        />
      );

      jest.advanceTimersByTime(2000);

      await waitFor(() => {
        expect(handleClose).toHaveBeenCalled();
      });
    });

    it("does not auto-dismiss when duration is null", () => {
      const handleClose = jest.fn();
      render(
        <Toast
          open
          message="Persistent"
          duration={null}
          onClose={handleClose}
        />
      );

      jest.advanceTimersByTime(10000);

      expect(handleClose).not.toHaveBeenCalled();
    });
  });

  describe("variant prop", () => {
    it("uses filled variant by default", () => {
      render(
        <Toast open message="Filled" onClose={jest.fn()} />
      );
      const alert = screen.getByRole("alert");
      expect(alert).toHaveClass("MuiAlert-filled");
    });

    it("renders outlined variant", () => {
      render(
        <Toast open message="Outlined" variant="outlined" onClose={jest.fn()} />
      );
      const alert = screen.getByRole("alert");
      expect(alert).toHaveClass("MuiAlert-outlined");
    });

    it("renders standard variant", () => {
      render(
        <Toast open message="Standard" variant="standard" onClose={jest.fn()} />
      );
      const alert = screen.getByRole("alert");
      expect(alert).toHaveClass("MuiAlert-standard");
    });
  });

  describe("props forwarding", () => {
    it("forwards data-testid to snackbar", () => {
      render(
        <Toast
          open
          message="Forwarded"
          data-testid="custom-toast"
          onClose={jest.fn()}
        />
      );
      expect(screen.getByTestId("custom-toast")).toBeInTheDocument();
    });
  });
});
