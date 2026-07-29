import type { Meta, StoryObj } from "@storybook/react-vite";
import { Chip } from "../components/ui_primitives/Chip";

const meta = {
  title: "Feedback/Chip",
  component: Chip,
  args: {
    label: "Chip",
    color: "default"
  },
  argTypes: {
    color: {
      control: "select",
      options: ["default", "primary", "secondary", "success", "warning", "error", "info"]
    },
    active: { control: "boolean" },
    compact: { control: "boolean" }
  }
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Colors: Story = {
  render: (args) => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {(["default", "primary", "secondary", "success", "warning", "error", "info"] as const).map(
        (c) => (
          <Chip {...args} key={c} color={c} label={c} />
        )
      )}
    </div>
  )
};

export const Active: Story = {
  args: { active: true, color: "primary" }
};

export const Compact: Story = {
  args: { compact: true }
};
