import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusIndicator } from "../components/ui_primitives/StatusIndicator";

const meta = {
  title: "Feedback/StatusIndicator",
  component: StatusIndicator,
  args: {
    status: "success",
    label: "Ready",
    showIcon: true,
    size: "small"
  },
  argTypes: {
    status: {
      control: "select",
      options: ["success", "error", "warning", "info", "pending", "default"]
    },
    size: { control: "select", options: ["small", "medium"] },
    showIcon: { control: "boolean" },
    pulse: { control: "boolean" }
  }
} satisfies Meta<typeof StatusIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {};

export const AllStatuses: Story = {
  render: (args) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {(["success", "error", "warning", "info", "pending", "default"] as const).map((s) => (
        <StatusIndicator {...args} key={s} status={s} label={s} />
      ))}
    </div>
  )
};
