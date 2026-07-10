import type { Meta, StoryObj } from "@storybook/react-vite";
import { LoadingSpinner } from "../components/ui_primitives/LoadingSpinner";

const meta = {
  title: "Feedback/LoadingSpinner",
  component: LoadingSpinner,
  args: {
    variant: "circular",
    size: "medium",
    color: "primary"
  },
  argTypes: {
    variant: { control: "select", options: ["circular", "dots"] },
    size: { control: "select", options: ["small", "medium", "large"] },
    color: { control: "select", options: ["primary", "secondary", "inherit"] }
  }
} satisfies Meta<typeof LoadingSpinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Circular: Story = {};

export const Dots: Story = {
  args: { variant: "dots" }
};

export const WithText: Story = {
  args: { text: "Loading…" }
};
