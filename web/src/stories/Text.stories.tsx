import type { Meta, StoryObj } from "@storybook/react-vite";
import { Text } from "../components/ui_primitives/Text";

const meta = {
  title: "Primitives/Text",
  component: Text,
  args: {
    children: "The quick brown fox",
    size: "normal",
    color: "primary"
  },
  argTypes: {
    size: {
      control: "select",
      options: ["giant", "bigger", "big", "normal", "small", "smaller", "tiny", "tinyer"]
    },
    color: {
      control: "select",
      options: ["primary", "secondary", "error", "warning", "success", "inherit"]
    },
    weight: { control: "select", options: [400, 500, 600] },
    family: { control: "select", options: ["primary", "secondary"] },
    truncate: { control: "boolean" }
  }
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Body: Story = {};

export const Sizes: Story = {
  render: (args) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {(["big", "normal", "small", "smaller"] as const).map((s) => (
        <Text {...args} key={s} size={s}>
          {s} — The quick brown fox
        </Text>
      ))}
    </div>
  )
};

export const Mono: Story = {
  args: { family: "secondary", children: "const value = 42;" }
};
