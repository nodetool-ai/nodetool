import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from "../components/ui_primitives/EmptyState";

const meta = {
  title: "Feedback/EmptyState",
  component: EmptyState,
  args: {
    variant: "empty",
    title: "Nothing here yet",
    description: "Create your first item to get started.",
    actionText: "Create item",
    size: "medium"
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["empty", "no-results", "no-data", "offline", "error"]
    },
    size: { control: "select", options: ["small", "medium", "large"] }
  }
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const NoResults: Story = {
  args: {
    variant: "no-results",
    title: "No results found",
    description: "Try adjusting your search or filters.",
    actionText: undefined
  }
};

export const ErrorState: Story = {
  args: {
    variant: "error",
    title: "Something went wrong",
    description: "We couldn't load this content.",
    actionText: "Retry"
  }
};
