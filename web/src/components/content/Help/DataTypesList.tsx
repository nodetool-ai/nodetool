/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useState } from "react";
import { Typography, Button, Divider } from "@mui/material";
import { DATA_TYPES, IconForType } from "../../../config/data_types";
import SearchInput from "../../search/SearchInput";

const DataTypesList = () => {
  const [filterValue, setFilterValue] = useState("");

  const filteredDataTypes = DATA_TYPES.filter((type: any) =>
    type.value.toLowerCase().includes(filterValue.toLowerCase())
  );

  const handleSearchChange = (newSearchTerm: string) => {
    setFilterValue(newSearchTerm);
  };

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
        padding: "0 .5em",
        borderRadius: "5px",
        minWidth: "200px",
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
      <Typography variant="h4" style={{ color: "#eee", marginBottom: "1em" }}>
        List of available DataTypes
      </Typography>
      <Divider />
      {/* <div style={{ margin: "1em 0" }} className="tools">
        <SearchInput onSearchChange={handleSearchChange} focusOnTyping={true} />
      </div> */}
      <div
        className="datatype-list"
        style={{ height: "100%", overflowY: "auto" }}
      >
        {filteredDataTypes.map((type) => (
          <div
            key={type.value}
            className="help-item datatype"
            style={{
              display: "flex",
              alignItems: "start",
              gap: "1rem",
              marginBottom: "1em",
              paddingBottom: "1em",
              borderBottom: "1px solid #333"
            }}
          >
            <IconForType
              iconName={type.value}
              containerStyle={{
                fill: type.textColor,
                width: "32px",
                height: "32px"
              }}
              bgStyle={{ backgroundColor: type.color, padding: "6px" }}
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
