import { Autocomplete, SxProps, TextField } from "@mui/material";
import { WorkflowList } from "../../stores/ApiTypes";
import { useQuery } from "@tanstack/react-query";
import { memo } from "react";
import { isEqual } from "lodash";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

interface WorkflowSelectProps {
  id?: string;
  value?: { id: string };
  label?: string;
  loading?: boolean;
  open?: boolean;
  onChange: (value: { type: "workflow"; id: string }) => void;
  onBlur?: () => void;
  sx?: SxProps;
}

const WorkflowSelect = (props: WorkflowSelectProps) => {
  const { load } = useWorkflowManager((state) => ({
    load: state.load
  }));

  const { data, error, isLoading } = useQuery<WorkflowList, Error>({
    queryKey: ["workflows"],
    queryFn: async () => {
      return await load();
    }
  });

  const selectedWorkflow = data?.workflows?.find(
    (w) => w.id === props.value?.id
  );

  return (
    <Autocomplete
      id={props.id}
      value={selectedWorkflow || null}
      options={data?.workflows || []}
      getOptionLabel={(option) => option.name}
      loading={props.loading || isLoading}
      sx={props.sx}
      open={props.open}
      onBlur={props.onBlur}
      onChange={(_, newValue) => {
        props.onChange({
          type: "workflow",
          id: newValue?.id || ""
        });
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          variant="outlined"
          label={selectedWorkflow ? selectedWorkflow.name : props.label}
        />
      )}
      className="mui-select"
    />
  );
};

export default memo(WorkflowSelect, isEqual);
