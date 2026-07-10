import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertBanner } from "../components/ui_primitives/AlertBanner";

const meta = {
  title: "Feedback/AlertBanner",
  component: AlertBanner,
  args: {
    severity: "info",
    variant: "standard",
    title: "Heads up",
    children: "This is an informational message."
  },
  argTypes: {
    severity: { control: "select", options: ["success", "info", "warning", "error"] },
    variant: { control: "select", options: ["filled", "outlined", "standard"] },
    compact: { control: "boolean" }
  }
} satisfies Meta<typeof AlertBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};

export const Severities: Story = {
  render: (args) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 360 }}>
      {(["success", "info", "warning", "error"] as const).map((s) => (
        <AlertBanner {...args} key={s} severity={s} title={s}>
          {s} message
        </AlertBanner>
      ))}
    </div>
  )
};

export const Outlined: Story = {
  args: { variant: "outlined", severity: "warning" }
};
