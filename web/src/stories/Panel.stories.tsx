import type { Meta, StoryObj } from "@storybook/react-vite";
import { Panel } from "../components/ui_primitives/Panel";

const meta = {
  title: "Surfaces/Panel",
  component: Panel,
  args: {
    title: "Panel title",
    subtitle: "Supporting description text",
    bordered: true,
    padding: "normal",
    background: "paper",
    children: (
      <div style={{ fontFamily: "var(--fontFamily1)", fontSize: "var(--fontSizeSmall)" }}>
        Panel body content goes here.
      </div>
    ),
    sx: { width: 320 }
  },
  argTypes: {
    padding: {
      control: "select",
      options: ["none", "compact", "normal", "comfortable", "spacious"]
    },
    background: { control: "select", options: ["default", "paper", "transparent"] },
    bordered: { control: "boolean" },
    collapsible: { control: "boolean" }
  }
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithFooter: Story = {
  args: {
    footer: (
      <div style={{ fontFamily: "var(--fontFamily1)", fontSize: "var(--fontSizeSmaller)" }}>
        Footer content
      </div>
    )
  }
};

export const Collapsible: Story = {
  args: { collapsible: true }
};
