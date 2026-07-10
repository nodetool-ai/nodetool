import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScrollArea } from "../components/ui_primitives/ScrollArea";

const rows = Array.from({ length: 30 }, (_, i) => i + 1);

const meta = {
  title: "Layout/ScrollArea",
  component: ScrollArea,
  args: {
    direction: "vertical",
    thin: true,
    maxHeight: 200,
    padding: 2
  },
  argTypes: {
    direction: { control: "select", options: ["vertical", "horizontal", "both"] },
    thin: { control: "boolean" },
    autoHide: { control: "boolean" }
  }
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Vertical: Story = {
  render: (args) => (
    <ScrollArea {...args} sx={{ width: 240, border: "1px solid var(--palette-divider)" }}>
      {rows.map((n) => (
        <div
          key={n}
          style={{
            padding: "6px 4px",
            fontFamily: "var(--fontFamily1)",
            fontSize: "var(--fontSizeSmall)",
            borderBottom: "1px solid var(--palette-divider)"
          }}
        >
          Row {n}
        </div>
      ))}
    </ScrollArea>
  )
};
