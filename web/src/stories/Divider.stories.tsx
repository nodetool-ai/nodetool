import type { Meta, StoryObj } from "@storybook/react-vite";
import { Divider } from "../components/ui_primitives/Divider";

const meta = {
  title: "Layout/Divider",
  component: Divider,
  args: {
    spacing: "normal",
    variant: "full",
    color: "default"
  },
  argTypes: {
    spacing: {
      control: "select",
      options: ["none", "compact", "normal", "comfortable", "spacious"]
    },
    variant: { control: "select", options: ["full", "inset", "middle"] },
    color: { control: "select", options: ["default", "subtle", "strong"] }
  },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <div style={{ fontFamily: "var(--fontFamily1)", fontSize: "var(--fontSizeSmall)" }}>
          Above
        </div>
        <Story />
        <div style={{ fontFamily: "var(--fontFamily1)", fontSize: "var(--fontSizeSmall)" }}>
          Below
        </div>
      </div>
    )
  ]
} satisfies Meta<typeof Divider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Subtle: Story = {
  args: { color: "subtle" }
};

export const Strong: Story = {
  args: { color: "strong" }
};
