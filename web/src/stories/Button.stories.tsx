import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../components/ui_primitives/muiReexports";

const meta = {
  title: "Primitives/Button",
  component: Button,
  args: {
    children: "Button",
    variant: "contained",
    color: "primary"
  },
  argTypes: {
    variant: { control: "select", options: ["text", "outlined", "contained"] },
    color: {
      control: "select",
      options: ["primary", "secondary", "success", "error", "warning", "info", "inherit"]
    },
    size: { control: "select", options: ["small", "medium", "large"] },
    disabled: { control: "boolean" }
  }
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Contained: Story = {};

export const Outlined: Story = {
  args: { variant: "outlined" }
};

export const Text: Story = {
  args: { variant: "text" }
};

export const Secondary: Story = {
  args: { color: "secondary" }
};

export const Disabled: Story = {
  args: { disabled: true }
};

export const Sizes: Story = {
  render: (args) => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Button {...args} size="small">
        Small
      </Button>
      <Button {...args} size="medium">
        Medium
      </Button>
      <Button {...args} size="large">
        Large
      </Button>
    </div>
  )
};
