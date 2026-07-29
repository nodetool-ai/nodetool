import type { Meta, StoryObj } from "@storybook/react-vite";
import { TruncatedText } from "../components/ui_primitives/TruncatedText";

const LONG =
  "This is a long piece of text that should be truncated with an ellipsis when it exceeds the available width of its container.";

const meta = {
  title: "Layout/TruncatedText",
  component: TruncatedText,
  args: {
    children: LONG,
    maxLines: 1,
    showTooltip: true
  },
  argTypes: {
    maxLines: { control: { type: "range", min: 1, max: 4, step: 1 } },
    showTooltip: { control: "boolean" }
  },
  decorators: [
    (Story) => (
      <div style={{ width: 240, border: "1px solid var(--palette-divider)", padding: 8 }}>
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof TruncatedText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleLine: Story = {};

export const TwoLines: Story = {
  args: { maxLines: 2 }
};
