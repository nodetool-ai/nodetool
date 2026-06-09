import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import WorkerProfilesDialog from "../WorkerProfilesDialog";
import type { WorkerProfile, WorkerTarget } from "../../../hooks/useWorkers";

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
  apiKeyStatus?: Record<WorkerTarget, boolean>;
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
        apiKeyStatus={overrides.apiKeyStatus}
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

  it("warns when the selected provider's API key is unavailable", async () => {
    setup({ profiles: [], apiKeyStatus: { runpod: false, vast: false } });

    expect(screen.getByText(/No RUNPOD_API_KEY configured/i)).toBeInTheDocument();

    // Switching to Vast updates the warning to that provider's key.
    await userEvent.click(screen.getByRole("combobox", { name: /provider/i }));
    await userEvent.click(screen.getByRole("option", { name: /^Vast$/i }));
    expect(screen.getByText(/No VAST_API_KEY configured/i)).toBeInTheDocument();
  });

  it("does not warn when the provider key is available (e.g. via env)", () => {
    setup({ profiles: [], apiKeyStatus: { runpod: true, vast: true } });
    expect(screen.queryByText(/configured/i)).not.toBeInTheDocument();
  });

  it("disables Create until a name is given (image/GPU/idle are prefilled)", async () => {
    setup({ profiles: [] });

    const create = screen.getByRole("button", { name: /^create profile$/i });
    expect(create).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/^name$/i), "my-worker");
    expect(create).toBeEnabled();
  });

  it("creates a RunPod profile from the defaults (image, A40 GPU, 30m idle)", async () => {
    const { createProfile } = setup({ profiles: [] });

    await userEvent.type(screen.getByLabelText(/^name$/i), "my-worker");

    await userEvent.click(
      screen.getByRole("button", { name: /^create profile$/i })
    );

    await waitFor(() => {
      expect(createProfile).toHaveBeenCalledTimes(1);
    });
    // Image defaults to the canonical worker image; the RunPod GPU defaults to
    // the full gpuTypeId; disk defaults to 100 GB; idle timeout defaults to 30.
    expect(createProfile).toHaveBeenCalledWith({
      name: "my-worker",
      target: "runpod",
      image: "ghcr.io/nodetool-ai/nodetool-worker:latest",
      token_policy: "generate",
      spec: { gpu: "NVIDIA A40", disk: 100 },
      idle_timeout_minutes: 30
    });
  });

  it("maps a chosen GPU to its provider-native id", async () => {
    const { createProfile } = setup({ profiles: [] });

    await userEvent.type(screen.getByLabelText(/^name$/i), "big");
    await userEvent.click(screen.getByRole("combobox", { name: /gpu/i }));
    await userEvent.click(
      screen.getByRole("option", { name: /A100 · 80 GB/i })
    );

    await userEvent.click(
      screen.getByRole("button", { name: /^create profile$/i })
    );

    await waitFor(() => expect(createProfile).toHaveBeenCalledTimes(1));
    expect(createProfile.mock.calls[0][0].spec).toEqual({
      gpu: "NVIDIA A100 80GB PCIe",
      disk: 100
    });
  });

  it("forwards a custom disk size and a Vast 'Any' GPU (no gpu in spec)", async () => {
    const { createProfile } = setup({ profiles: [] });

    await userEvent.type(screen.getByLabelText(/^name$/i), "plain");

    // Switch provider to Vast — its GPU resets to "Any" (empty id → no gpu).
    await userEvent.click(screen.getByRole("combobox", { name: /provider/i }));
    await userEvent.click(screen.getByRole("option", { name: /^Vast$/i }));

    // Override the disk default.
    const diskField = screen.getByLabelText(/^disk/i);
    await userEvent.clear(diskField);
    await userEvent.type(diskField, "250");

    // Max lifetime lives under the collapsed Advanced section.
    await userEvent.click(screen.getByText(/^Advanced$/i));
    await userEvent.type(screen.getByLabelText(/max lifetime/i), "120");

    await userEvent.click(
      screen.getByRole("button", { name: /^create profile$/i })
    );

    await waitFor(() => expect(createProfile).toHaveBeenCalledTimes(1));
    expect(createProfile).toHaveBeenCalledWith({
      name: "plain",
      target: "vast",
      image: "ghcr.io/nodetool-ai/nodetool-worker:latest",
      token_policy: "generate",
      spec: { disk: 250 },
      idle_timeout_minutes: 30,
      max_lifetime_minutes: 120
    });
  });

  it("creates a CPU-only RunPod profile (no gpu, carries the vCPU count)", async () => {
    const { createProfile } = setup({ profiles: [] });

    await userEvent.type(screen.getByLabelText(/^name$/i), "cpu-box");

    // Pick the CPU-only machine type; a vCPU selector then appears.
    await userEvent.click(screen.getByRole("combobox", { name: /gpu/i }));
    await userEvent.click(screen.getByRole("option", { name: /CPU only/i }));
    await userEvent.click(screen.getByRole("combobox", { name: /vcpu/i }));
    await userEvent.click(screen.getByRole("option", { name: /^8 vCPU$/i }));

    await userEvent.click(
      screen.getByRole("button", { name: /^create profile$/i })
    );

    await waitFor(() => expect(createProfile).toHaveBeenCalledTimes(1));
    // No GPU id; the spec carries the vCPU count instead so the provider
    // provisions a CPU pod (computeType: "CPU").
    expect(createProfile).toHaveBeenCalledWith({
      name: "cpu-box",
      target: "runpod",
      image: "ghcr.io/nodetool-ai/nodetool-worker:latest",
      token_policy: "generate",
      spec: { vcpu: 8, disk: 100 },
      idle_timeout_minutes: 30
    });
  });
});
