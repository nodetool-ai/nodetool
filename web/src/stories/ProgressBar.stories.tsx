import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProgressBar } from "../components/ui_primitives/ProgressBar";

const meta = {
  title: "Feedback/ProgressBar",
  component: ProgressBar,
  args: {
    value: 60,
    label: "Uploading",
    showValue: true,
    progressVariant: "determinate"
  },
  argTypes: {
    value: { control: { type: "range", min: 0, max: 100, step: 1 } },
    progressVariant: {
      control: "select",
      options: ["determinate", "indeterminate", "buffer"]
    },
    showValue: { control: "boolean" }
  },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof ProgressBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Determinate: Story = {};

export const Complete: Story = {
  args: { value: 100, label: "Done" }
};

export const NoLabel: Story = {
  args: { label: undefined, showValue: false }
};
