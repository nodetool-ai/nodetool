import { useMetadata } from "../../serverState/useMetadata";
import { MenuItem, FormControl, InputLabel, Select } from "@mui/material";
import { NodeMetadata } from "../../stores/ApiTypes";

type NodeTypeSelectorProps = {
  label: string;
  value: string;
  onChange: (nodeType: string) => void;
};

const NodeTypeSelector = ({
  label,
  value,
  onChange
}: NodeTypeSelectorProps) => {
  const { data } = useMetadata();
  if (!data) return null;
  const availableNodes = data.metadata;

  return (
    <FormControl>
      <InputLabel>{label}</InputLabel>
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value as string)}
        MenuProps={{
          anchorOrigin: {
            vertical: "bottom",
            horizontal: "left"
          },
          transformOrigin: {
            vertical: "top",
            horizontal: "left"
          }
        }}
      >
        <MenuItem value="" disabled>
          Select a node type
        </MenuItem>
        {availableNodes.map((m: NodeMetadata) => (
          <MenuItem
            key={m.node_type}
            value={m.node_type}
            selected={m.node_type === value}
            onClick={() => onChange(m.node_type)}
          >
            {m.title}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

export default NodeTypeSelector;
