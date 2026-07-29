import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox } from "../components/ui_primitives/Checkbox";

const meta = {
  title: "Primitives/Checkbox",
  component: Checkbox,
  args: {
    label: "Enable feature",
    size: "small"
  },
  argTypes: {
    size: { control: "select", options: ["small", "medium"] },
    compact: { control: "boolean" },
    disabled: { control: "boolean" },
    checked: { control: "boolean" }
  }
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unchecked: Story = {};

export const Checked: Story = {
  args: { defaultChecked: true }
};

export const Indeterminate: Story = {
  args: { indeterminate: true }
};

export const Disabled: Story = {
  args: { disabled: true, defaultChecked: true }
};

export const WithoutLabel: Story = {
  args: { label: undefined, "aria-label": "toggle" }
};
