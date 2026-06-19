import * as React from "react";
import { TagInput, FlexColumn } from "nodetool";

export const Default = () => {
  const [tags, setTags] = React.useState(["nlp", "summarization", "gpt"]);
  return (
    <div style={{ width: 360 }}>
      <TagInput
        label="Workflow tags"
        tags={tags}
        onTagsChange={setTags}
        placeholder="Add a tag…"
      />
    </div>
  );
};

export const WithHelper = () => {
  const [tags, setTags] = React.useState(["image", "upscale"]);
  return (
    <div style={{ width: 360 }}>
      <TagInput
        label="Model categories"
        tags={tags}
        onTagsChange={setTags}
        helperText="Press Enter to add. Max 5 tags."
        maxTags={5}
      />
    </div>
  );
};

export const ErrorState = () => {
  const [tags, setTags] = React.useState(["duplicate", "duplicate"]);
  return (
    <div style={{ width: 360 }}>
      <TagInput
        label="Asset labels"
        tags={tags}
        onTagsChange={setTags}
        error
        helperText="Duplicate tags are not allowed."
      />
    </div>
  );
};

export const Disabled = () => {
  const [tags, setTags] = React.useState(["readonly", "system"]);
  return (
    <div style={{ width: 360 }}>
      <TagInput
        label="System tags"
        tags={tags}
        onTagsChange={setTags}
        disabled
      />
    </div>
  );
};
