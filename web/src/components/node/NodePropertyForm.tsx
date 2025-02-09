/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Add } from "@mui/icons-material";
import { Box, TextField } from "@mui/material";
import { useState, useCallback, memo } from "react";
import ThemeNodes from "../themes/ThemeNodes";
import { isEqual } from "lodash";

interface NodePropertyFormProps {
  onAddProperty: (propertyName: string) => void;
}

const NodePropertyForm: React.FC<NodePropertyFormProps> = ({
  onAddProperty
}) => {
  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [newPropertyName, setNewPropertyName] = useState("");

  const handlePropertySubmit = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && newPropertyName.trim()) {
        onAddProperty(newPropertyName);
        setNewPropertyName("");
        setShowPropertyForm(false);
      }
    },
    [newPropertyName, onAddProperty]
  );

  return (
    <Box className="node-property-form">
      {!showPropertyForm ? (
        <button
          onClick={() => setShowPropertyForm(true)}
          css={css({
            width: "100%",
            padding: "8px",
            background: "transparent",
            border: `1px dashed ${ThemeNodes.palette.c_gray2}`,
            borderRadius: "4px",
            cursor: "pointer",
            color: ThemeNodes.palette.c_white,
            fontSize: "0.9em",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
            "&:hover": {
              background: ThemeNodes.palette.c_gray1,
              borderStyle: "solid"
            }
          })}
        >
          <Add style={{ fontSize: "1.2em" }} />
          Add Property
        </button>
      ) : (
        <TextField
          autoFocus
          size="small"
          placeholder="Property name..."
          value={newPropertyName}
          onChange={(e) => setNewPropertyName(e.target.value)}
          onKeyPress={handlePropertySubmit}
          onBlur={() => {
            setShowPropertyForm(false);
            setNewPropertyName("");
          }}
          css={css({
            width: "100%",
            "& .MuiOutlinedInput-root": {
              background: ThemeNodes.palette.c_gray0
            }
          })}
        />
      )}
    </Box>
  );
};

export default memo(NodePropertyForm, isEqual);
