/**
 * HardwareProfileSelector — dropdown + detect button
 *
 * Lets the user pick a preset hardware profile or auto-detect.
 * Also exposes manual VRAM/RAM override inputs (v1 requirement).
 */

import React, { useCallback, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  type SelectChangeEvent,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import type { HardwareProfile } from "../../local_model_fit/types";
import { HARDWARE_PRESETS, buildCustomProfile } from "../../local_model_fit/hardwareProfiles";

interface HardwareProfileSelectorProps {
  profile: HardwareProfile;
  onChangeProfile: (profile: HardwareProfile) => void;
  onDetect: () => Promise<HardwareProfile>;
}

const HardwareProfileSelector: React.FC<HardwareProfileSelectorProps> = ({
  profile,
  onChangeProfile,
  onDetect,
}) => {
  const [detecting, setDetecting] = useState(false);
  const [showCustom, setShowCustom] = useState(profile.id === "custom");
  const [customVram, setCustomVram] = useState(String(profile.vramGb));
  const [customRam, setCustomRam] = useState(String(profile.ramGb));

  const handlePresetChange = useCallback(
    (e: SelectChangeEvent<string>) => {
      const id = e.target.value;
      if (id === "__custom__") {
        setShowCustom(true);
        return;
      }
      setShowCustom(false);
      const preset = HARDWARE_PRESETS.find((p) => p.id === id);
      if (preset) {
        onChangeProfile(preset as HardwareProfile);
      }
    },
    [onChangeProfile],
  );

  const handleDetect = useCallback(async () => {
    setDetecting(true);
    try {
      await onDetect();
      setShowCustom(false);
    } finally {
      setDetecting(false);
    }
  }, [onDetect]);

  const applyCustom = useCallback(() => {
    const v = parseFloat(customVram) || 0;
    const r = parseFloat(customRam) || 8;
    onChangeProfile(buildCustomProfile(v, r));
  }, [customVram, customRam, onChangeProfile]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        <FormControl size="small" sx={{ minWidth: 260 }}>
          <InputLabel id="hw-profile-label">Hardware Profile</InputLabel>
          <Select
            labelId="hw-profile-label"
            value={
              showCustom
                ? "__custom__"
                : HARDWARE_PRESETS.some((p) => p.id === profile.id)
                  ? profile.id
                  : "__custom__"
            }
            label="Hardware Profile"
            onChange={handlePresetChange}
          >
            {HARDWARE_PRESETS.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.label}
              </MenuItem>
            ))}
            <MenuItem value="__custom__">Custom…</MenuItem>
          </Select>
        </FormControl>

        <Button
          variant="outlined"
          size="small"
          startIcon={<SearchIcon />}
          onClick={handleDetect}
          disabled={detecting}
        >
          {detecting ? "Detecting…" : "Auto-detect"}
        </Button>
      </Box>

      {/* Current profile label */}
      <Typography variant="caption" sx={{ opacity: 0.6 }}>
        Active: {profile.label}
        {profile.vramGb > 0
          ? ` · ${profile.vramGb} GB VRAM · ${profile.ramGb} GB RAM`
          : ` · ${profile.ramGb} GB RAM (unified/CPU)`}
      </Typography>

      {/* Custom overrides */}
      {showCustom && (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <TextField
            label="VRAM (GB)"
            type="number"
            size="small"
            value={customVram}
            onChange={(e) => setCustomVram(e.target.value)}
            sx={{ width: 110 }}
            slotProps={{ htmlInput: { min: 0, step: 1 } }}
          />
          <TextField
            label="RAM (GB)"
            type="number"
            size="small"
            value={customRam}
            onChange={(e) => setCustomRam(e.target.value)}
            sx={{ width: 110 }}
            slotProps={{ htmlInput: { min: 1, step: 1 } }}
          />
          <Button variant="contained" size="small" onClick={applyCustom}>
            Apply
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default React.memo(HardwareProfileSelector);
