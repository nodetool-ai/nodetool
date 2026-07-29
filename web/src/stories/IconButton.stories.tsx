import type { Meta, StoryObj } from "@storybook/react-vite";
import { Settings as SettingsIcon } from "@mui/icons-material";
import { IconButton } from "../components/ui_primitives/muiReexports";

const meta = {
  title: "Primitives/IconButton",
  component: IconButton,
  args: {
    children: <SettingsIcon fontSize="small" />,
    color: "default",
    "aria-label": "Settings"
  },
  argTypes: {
    color: {
      control: "select",
      options: ["default", "primary", "secondary", "error", "inherit"]
    },
    size: { control: "select", options: ["small", "medium", "large"] },
    disabled: { control: "boolean" }
  }
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Primary: Story = {
  args: { color: "primary" }
};

export const Disabled: Story = {
  args: { disabled: true }
};

export const Sizes: Story = {
  render: (args) => (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <IconButton {...args} size="small" />
      <IconButton {...args} size="medium" />
      <IconButton {...args} size="large" />
    </div>
  )
};
