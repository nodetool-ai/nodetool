import { useEffect, useState } from "react";
import type { PropertyProps } from "../node/PropertyInput.types";
import { TextInput } from "../ui_primitives";

/** Compiler properties are plain JSON values, without the media JSON envelope. */
const TorchJSONProperty = ({
  property,
  value,
  onChange,
  onChangeComplete
}: PropertyProps<unknown>) => {
  const [text, setText] = useState(() => JSON.stringify(value ?? []));
  const [error, setError] = useState("");
  useEffect(() => {
    setText(JSON.stringify(value ?? []));
    setError("");
  }, [value]);

  return (
    <TextInput
      label={property.name}
      value={text}
      multiline
      minRows={2}
      monospace
      errorMessage={error}
      helperText={property.description}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        try {
          const parsed: unknown = JSON.parse(next);
          if (!Array.isArray(parsed)) {
            setError("Enter a JSON array.");
            return;
          }
          setError("");
          onChange(parsed);
        } catch {
          setError("Enter a valid JSON array.");
        }
      }}
      onBlur={() => onChangeComplete?.()}
    />
  );
};

export default TorchJSONProperty;
