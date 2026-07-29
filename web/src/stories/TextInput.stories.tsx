import type { Meta, StoryObj } from "@storybook/react-vite";
import { TextInput } from "../components/ui_primitives/TextInput";

const meta = {
  title: "Primitives/TextInput",
  component: TextInput,
  args: {
    label: "Label",
    placeholder: "Type here…",
    variant: "outlined",
    size: "small"
  },
  argTypes: {
    variant: { control: "select", options: ["outlined", "filled", "standard"] },
    size: { control: "select", options: ["small", "medium"] },
    compact: { control: "boolean" },
    disabled: { control: "boolean" },
    fullWidth: { control: "boolean" }
  }
} satisfies Meta<typeof TextInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = {
  args: { defaultValue: "Hello world" }
};

export const Compact: Story = {
  args: { compact: true }
};

export const Error: Story = {
  args: { errorMessage: "This field is required" }
};

export const Disabled: Story = {
  args: { defaultValue: "Read only", disabled: true }
};

export const Multiline: Story = {
  args: { multiline: true, minRows: 3, defaultValue: "Line one\nLine two" }
};
