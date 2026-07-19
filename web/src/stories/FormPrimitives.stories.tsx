import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FormSection } from "../components/ui_primitives/FormSection";
import { FormGrid } from "../components/ui_primitives/FormGrid";
import { Panel } from "../components/ui_primitives/Panel";
import { TextInput } from "../components/ui_primitives/TextInput";
import { SelectField } from "../components/ui_primitives/SelectField";

const aspectOptions = [
  { value: "16:9", label: "16:9 Landscape" },
  { value: "9:16", label: "9:16 Portrait" },
  { value: "1:1", label: "1:1 Square" }
];

const voiceOptions = [
  { value: "nova", label: "Nova" },
  { value: "echo", label: "Echo" },
  { value: "sage", label: "Sage" }
];

const meta = {
  title: "Primitives/Form Primitives",
  component: FormSection,
  parameters: { layout: "padded" },
  // Stories supply children via render; args feed the Section story's label/gap.
  args: { label: "Run settings", children: null },
  argTypes: {
    gap: { control: { type: "range", min: 0, max: 8, step: 1 } }
  }
} satisfies Meta<typeof FormSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Section: Story = {
  render: (args) => (
    <FormSection {...args} sx={{ maxWidth: 320 }}>
      <TextInput label="Model" defaultValue="claude-sonnet-4-6" size="small" />
      <TextInput label="Seed" defaultValue="42" size="small" />
      <TextInput label="Duration (s)" defaultValue="8" size="small" />
    </FormSection>
  )
};

const GridExample = () => {
  const [aspect, setAspect] = useState("16:9");
  return (
    <FormGrid sx={{ maxWidth: 900 }}>
      <TextInput
        label="Script"
        multiline
        rows={6}
        placeholder="Scene description…"
      />
      <FormSection label="Run settings">
        <SelectField
          label="Aspect ratio"
          value={aspect}
          onChange={setAspect}
          options={aspectOptions}
          size="small"
        />
        <TextInput label="Duration (s)" defaultValue="8" size="small" />
      </FormSection>
    </FormGrid>
  );
};

/** Content column plus a 260px settings rail; stacks below 860px. */
export const GridTwoColumn: Story = {
  render: () => <GridExample />
};

const SettingsFormExample = () => {
  const [aspect, setAspect] = useState("16:9");
  const [voice, setVoice] = useState("nova");
  return (
    <Panel
      title="Board settings"
      subtitle="Script and run configuration"
      sx={{ maxWidth: 960 }}
    >
      <FormGrid>
        <FormSection label="Script">
          <TextInput label="Title" defaultValue="Untitled board" />
          <TextInput
            label="Logline"
            multiline
            rows={3}
            placeholder="One-sentence summary"
          />
        </FormSection>
        <FormSection label="Run settings">
          <SelectField
            label="Aspect ratio"
            value={aspect}
            onChange={setAspect}
            options={aspectOptions}
            size="small"
          />
          <SelectField
            label="Voice"
            value={voice}
            onChange={setVoice}
            options={voiceOptions}
            size="small"
          />
          <TextInput label="Duration (s)" defaultValue="8" size="small" />
        </FormSection>
      </FormGrid>
    </Panel>
  );
};

/** The target look: Panel + FormGrid + FormSection composing real fields. */
export const SettingsForm: Story = {
  render: () => <SettingsFormExample />
};
