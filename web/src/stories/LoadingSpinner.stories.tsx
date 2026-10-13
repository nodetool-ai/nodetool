import type { Meta, StoryObj } from "@storybook/react-vite";
import { LoadingSpinner } from "../components/ui_primitives/LoadingSpinner";

const meta = {
  title: "Feedback/LoadingSpinner",
  component: LoadingSpinner,
  args: {
    size: "medium",
    color: "primary"
  },
  argTypes: {
    size: { control: "select", options: ["small", "medium", "large"] },
    color: { control: "select", options: ["primary", "secondary", "inherit"] }
  }
} satisfies Meta<typeof LoadingSpinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Circular: Story = {};

export const Inline: Story = {
  args: { inline: true, size: 16 }
};

export const WithText: Story = {
  args: { text: "Loading models" }
};
