import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Dialog } from "../components/ui_primitives/Dialog";
import { Button } from "../components/ui_primitives/muiReexports";

/**
 * Dialogs render into a portal. The stories keep them open by default so the
 * modal surface is captured in snapshots without an interaction step.
 */
const meta = {
  title: "Surfaces/Dialog",
  component: Dialog,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    title: "Dialog title",
    children: (
      <div style={{ fontFamily: "var(--fontFamily1)", fontSize: "var(--fontSizeSmall)" }}>
        Dialog body content. Confirm or cancel to continue.
      </div>
    )
  }
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

export const WithActions: Story = {
  args: {
    showActions: true,
    confirmText: "Save",
    cancelText: "Cancel"
  }
};

export const Loading: Story = {
  args: { showActions: true, isLoading: true }
};

export const Interactive: Story = {
  render: (args) => {
    const InteractiveDialog = () => {
      const [open, setOpen] = useState(false);
      return (
        <div style={{ padding: 24 }}>
          <Button variant="contained" onClick={() => setOpen(true)}>
            Open dialog
          </Button>
          <Dialog
            {...args}
            open={open}
            showActions
            onClose={() => setOpen(false)}
            onConfirm={() => setOpen(false)}
          />
        </div>
      );
    };
    return <InteractiveDialog />;
  }
};
