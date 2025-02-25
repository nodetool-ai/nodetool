/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useState } from "react";
import { Typography, Button, Divider } from "@mui/material";
import { DATA_TYPES, IconForType } from "../../../config/data_types";
import { useSettingsStore } from "../../../stores/SettingsStore";

const DataTypesList = () => {
  const isComfyEnabled = useSettingsStore(
    (state) => state.settings.enableComfy
  );
  const types = isComfyEnabled
    ? DATA_TYPES
    : DATA_TYPES.filter((type) => !type.value.startsWith("comfy."));

  const styles = (theme: any) =>
    css({
      "&": {
        // height: "100%"
        // overflow: "hidden"
      },
      ".datatype-list": {
        // height: "calc(100% - 190px)",
        height: "500px",
        overflowY: "auto"
      },
      ".help-item.datatype": {
        alignItems: "flex-start"
      },
      ".help-item.datatype button": {
        color: theme.palette.c_white,
        borderRadius: "5px",
        minWidth: "150px",
        textAlign: "left",
        border: "0",
        wordBreak: "break-word",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start"
      }
    });

  return (
    <div className="datatypes" css={styles}>
      <div
        className="datatype-list"
        style={{ height: "100%", overflowY: "auto" }}
      >
        {types.map((type) => (
          <div
            key={type.value}
            className="help-item datatype"
            style={{
              display: "flex",
              alignItems: "start"
            }}
          >
            <IconForType
              iconName={type.value}
              containerStyle={{
                fill: type.textColor,
                width: "24px",
                height: "24px"
              }}
              bgStyle={{
                backgroundColor: type.color,
                fontSize: "12px",
                padding: "5px"
              }}
            />
            <Button
              disabled={true}
              disableRipple={true}
              key={`button-${type.value}`}
            >
              {type.namespace && (
                <div style={{ fontWeight: "lighter", width: "100%" }}>
                  {type.namespace}
                </div>
              )}
              <div style={{ fontWeight: "bold", width: "100%" }}>
                {type.name}
              </div>
            </Button>
            <Typography key={`text-${type.value}`} style={{ borderRight: "0" }}>
              {type.description}
            </Typography>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DataTypesList;
