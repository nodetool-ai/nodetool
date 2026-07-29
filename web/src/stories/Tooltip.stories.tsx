import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tooltip } from "../components/ui_primitives/Tooltip";
import { Button } from "../components/ui_primitives/muiReexports";

const meta = {
  title: "Feedback/Tooltip",
  component: Tooltip,
  args: {
    title: "Helpful hint",
    arrow: true,
    children: <Button variant="outlined">Hover me</Button>
  },
  argTypes: {
    arrow: { control: "boolean" },
    placement: {
      control: "select",
      options: ["top", "bottom", "left", "right"]
    }
  }
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Open: Story = {
  args: { open: true, placement: "top" }
};
