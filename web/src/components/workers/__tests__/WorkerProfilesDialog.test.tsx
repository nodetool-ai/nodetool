import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import WorkerProfilesDialog from "../WorkerProfilesDialog";
import type { WorkerProfile } from "../../../hooks/useWorkers";

const makeProfile = (overrides: Partial<WorkerProfile> = {}): WorkerProfile => ({
  id: "p-1",
  name: "hf-a40",
  target: "runpod",
  image: "ghcr.io/nodetool/worker:0.7.3",
  spec: {},
  token_policy: "generate",
  idle_timeout_minutes: 15,
  max_lifetime_minutes: null,
  created_at: "2026-06-08T00:00:00Z",
  updated_at: "2026-06-08T00:00:00Z",
  ...overrides
});

interface SetupOverrides {
  profiles?: WorkerProfile[];
  createProfile?: jest.Mock;
  deleteProfile?: jest.Mock;
}

const setup = (overrides: SetupOverrides = {}) => {
  const createProfile = overrides.createProfile ?? jest.fn(async () => makeProfile());
  const deleteProfile = overrides.deleteProfile ?? jest.fn(async () => undefined);
  const onClose = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <WorkerProfilesDialog
        open
        onClose={onClose}
        profiles={overrides.profiles ?? [makeProfile()]}
        createProfile={createProfile}
        deleteProfile={deleteProfile}
      />
    </ThemeProvider>
  );
  return { createProfile, deleteProfile, onClose };
};

describe("WorkerProfilesDialog", () => {
  it("lists existing profiles with a delete button", () => {
    const { deleteProfile } = setup({ profiles: [makeProfile({ name: "hf-a40" })] });

    expect(screen.getByText("hf-a40")).toBeInTheDocument();
    const del = screen.getByRole("button", { name: /delete profile hf-a40/i });
    expect(del).toBeInTheDocument();
    expect(deleteProfile).not.toHaveBeenCalled();
  });

  it("delete button calls deleteProfile with the profile name", async () => {
    const { deleteProfile } = setup({ profiles: [makeProfile({ name: "hf-a40" })] });

    await userEvent.click(
      screen.getByRole("button", { name: /delete profile hf-a40/i })
    );

    expect(deleteProfile).toHaveBeenCalledWith("hf-a40");
  });

  it("disables Create until name and image are both filled", async () => {
    setup({ profiles: [] });

    const create = screen.getByRole("button", { name: /^create profile$/i });
    expect(create).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/^name$/i), "my-worker");
    expect(create).toBeDisabled();

    await userEvent.type(
      screen.getByLabelText(/^image$/i),
      "ghcr.io/nodetool/worker:latest"
    );
    expect(create).toBeEnabled();
  });

  it("create calls createProfile with the right shape including spec.gpu", async () => {
    const { createProfile } = setup({ profiles: [] });

    await userEvent.type(screen.getByLabelText(/^name$/i), "my-worker");
    await userEvent.type(
      screen.getByLabelText(/^image$/i),
      "ghcr.io/nodetool/worker:latest"
    );
    await userEvent.type(screen.getByLabelText(/^gpu$/i), "A40");

    await userEvent.click(
      screen.getByRole("button", { name: /^create profile$/i })
    );

    await waitFor(() => {
      expect(createProfile).toHaveBeenCalledTimes(1);
    });
    expect(createProfile).toHaveBeenCalledWith({
      name: "my-worker",
      target: "runpod",
      image: "ghcr.io/nodetool/worker:latest",
      spec: { gpu: "A40" },
      token_policy: "generate"
    });
  });

  it("omits spec when no gpu is given and forwards optional timeouts", async () => {
    const { createProfile } = setup({ profiles: [] });

    await userEvent.type(screen.getByLabelText(/^name$/i), "plain");
    await userEvent.type(screen.getByLabelText(/^image$/i), "img");
    await userEvent.type(screen.getByLabelText(/idle timeout/i), "30");
    await userEvent.type(screen.getByLabelText(/max lifetime/i), "120");

    await userEvent.click(
      screen.getByRole("button", { name: /^create profile$/i })
    );

    await waitFor(() => {
      expect(createProfile).toHaveBeenCalledTimes(1);
    });
    expect(createProfile).toHaveBeenCalledWith({
      name: "plain",
      target: "runpod",
      image: "img",
      token_policy: "generate",
      idle_timeout_minutes: 30,
      max_lifetime_minutes: 120
    });
  });
});
