import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "../components/ui_primitives/Card";

const Content = () => (
  <div style={{ maxWidth: 260 }}>
    <div style={{ fontFamily: "var(--fontFamily1)", fontWeight: 600, marginBottom: 4 }}>
      Card title
    </div>
    <div
      style={{
        fontFamily: "var(--fontFamily1)",
        fontSize: "var(--fontSizeSmall)",
        opacity: 0.75
      }}
    >
      A surface primitive with padding, elevation, and border variants.
    </div>
  </div>
);

const meta = {
  title: "Surfaces/Card",
  component: Card,
  args: {
    variant: "default",
    padding: "normal",
    children: <Content />
  },
  argTypes: {
    variant: { control: "select", options: ["default", "outlined", "elevated"] },
    padding: {
      control: "select",
      options: ["none", "compact", "normal", "comfortable", "spacious"]
    },
    hoverable: { control: "boolean" },
    clickable: { control: "boolean" }
  }
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Outlined: Story = {
  args: { variant: "outlined" }
};

export const Elevated: Story = {
  args: { variant: "elevated" }
};

export const Hoverable: Story = {
  args: { hoverable: true, clickable: true }
};
