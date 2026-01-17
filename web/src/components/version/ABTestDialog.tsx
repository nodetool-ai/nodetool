import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Tooltip
} from "@mui/material";
import { WorkflowVersion } from "../../stores/ApiTypes";
import { SaveType } from "../../stores/VersionHistoryStore";
import { formatDistanceToNow } from "date-fns";

const getSaveType = (version: WorkflowVersion): SaveType => {
  if (version.save_type && ["manual", "autosave", "checkpoint", "restore"].includes(version.save_type)) {
    return version.save_type;
  }
  if (!version.name) {return "autosave";}
  const lower = version.name.toLowerCase();
  if (lower.includes("manual")) {return "manual";}
  if (lower.includes("checkpoint")) {return "checkpoint";}
  if (lower.includes("restore")) {return "restore";}
  return "autosave";
};

interface ABTestDialogProps {
  open: boolean;
  onClose: () => void;
  versions: Array<WorkflowVersion & { save_type: SaveType; size_bytes: number }>;
  currentVersion?: number;
  onRunABTest: (baseVersion: number, testVersion: number) => void;
}

export const ABTestDialog: React.FC<ABTestDialogProps> = ({
  open,
  onClose,
  versions,
  currentVersion,
  onRunABTest
}) => {
  const [baseVersion, setBaseVersion] = useState<number | "">(currentVersion || "");
  const [testVersion, setTestVersion] = useState<number | "">("");

  const handleRun = () => {
    if (baseVersion && testVersion) {
      onRunABTest(Number(baseVersion), Number(testVersion));
    }
  };

  const handleBaseChange = (v: number | "") => {
    setBaseVersion(v);
    if (v === testVersion && v !== "") {
      setTestVersion("");
    }
  };

  const handleTestChange = (v: number | "") => {
    setTestVersion(v);
    if (v === baseVersion && v !== "") {
      setBaseVersion("");
    }
  };

  const canRun = baseVersion !== "" && testVersion !== "" && baseVersion !== testVersion;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Run A/B Test</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Compare two workflow versions side by side to see which performs better.
        </Typography>

        <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
          <FormControl fullWidth>
            <InputLabel>Base Version (Control)</InputLabel>
            <Select
              value={baseVersion}
              label="Base Version (Control)"
              onChange={(e) => handleBaseChange(e.target.value as number | "")}
              sx={{ mb: 2 }}
            >
              {versions.map((v) => (
                <MenuItem key={v.id} value={v.version} disabled={v.version === testVersion}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography>v{v.version}</Typography>
                    <Chip label={getSaveType(v)} size="small" sx={{ height: 20 }} />
                    <Typography variant="caption" color="text.secondary">
                      {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ display: "flex", gap: 2 }}>
          <FormControl fullWidth>
            <InputLabel>Test Version (Variant)</InputLabel>
            <Select
              value={testVersion}
              label="Test Version (Variant)"
              onChange={(e) => handleTestChange(e.target.value as number | "")}
            >
              {versions.map((v) => (
                <MenuItem key={v.id} value={v.version} disabled={v.version === baseVersion}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography>v{v.version}</Typography>
                    <Chip label={getSaveType(v)} size="small" sx={{ height: 20 }} />
                    <Typography variant="caption" color="text.secondary">
                      {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {baseVersion && testVersion && baseVersion === testVersion && (
          <Typography color="error" variant="caption">
            Please select different versions for the test.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Tooltip title={!canRun ? "Select two different versions" : ""}>
          <span>
            <Button
              onClick={handleRun}
              variant="contained"
              disabled={!canRun}
            >
              Run Test
            </Button>
          </span>
        </Tooltip>
      </DialogActions>
    </Dialog>
  );
};
