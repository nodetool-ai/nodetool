import type { Meta, StoryObj } from "@storybook/react-vite";
import { Slider } from "../components/ui_primitives/Slider";

const meta = {
  title: "Primitives/Slider",
  component: Slider,
  args: {
    defaultValue: 40,
    min: 0,
    max: 100,
    density: "normal"
  },
  argTypes: {
    density: { control: "select", options: ["normal", "compact"] },
    disabled: { control: "boolean" }
  },
  decorators: [
    (Story) => (
      <div style={{ width: 260 }}>
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Compact: Story = {
  args: { density: "compact" }
};

export const Range: Story = {
  args: { defaultValue: [20, 70] }
};
