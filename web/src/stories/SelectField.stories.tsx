import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SelectField } from "../components/ui_primitives/SelectField";

const options = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" }
];

const meta = {
  title: "Primitives/SelectField",
  component: SelectField,
  args: {
    label: "Size",
    options,
    value: "md",
    onChange: () => {},
    size: "small"
  },
  argTypes: {
    size: { control: "select", options: ["small", "medium"] },
    variant: { control: "select", options: ["standard", "outlined", "filled"] },
    disabled: { control: "boolean" }
  },
  render: (args) => {
    const Controlled = () => {
      const [value, setValue] = useState(String(args.value));
      return <SelectField {...args} value={value} onChange={setValue} />;
    };
    return <Controlled />;
  }
} satisfies Meta<typeof SelectField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithDescription: Story = {
  args: { description: "Choose the rendering size" }
};

export const Disabled: Story = {
  args: { disabled: true }
};
