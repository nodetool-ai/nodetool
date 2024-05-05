import { useState } from "react";
import { Typography, Button, Divider } from "@mui/material";
import { DATA_TYPES, iconForType } from "../../../config/data_types";
import SearchInput from "../../search/SearchInput";

const DataTypesList = () => {
  const [filterValue, setFilterValue] = useState("");

  const filteredDataTypes = DATA_TYPES.filter((type: any) =>
    type.value.toLowerCase().includes(filterValue.toLowerCase())
  );

  const handleSearchChange = (newSearchTerm: string) => {
    setFilterValue(newSearchTerm);
  };

  return (
    <>
      <Typography variant="h4" style={{ color: "#eee", marginBottom: "1em" }}>
        List of available DataTypes
      </Typography>
      <Divider />
      <div style={{ margin: "1em 0" }} className="tools">
        <SearchInput onSearchChange={handleSearchChange} focusOnTyping={true} />
      </div>

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
          {iconForType(
            type.value,
            {
              fill: type.textColor,
              bgStyle: { backgroundColor: type.color, padding: "6px" },
              width: "32px",
              height: "32px"
            },
            false
          )}
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
            <div style={{ fontWeight: "bold", width: "100%" }}>{type.name}</div>
          </Button>
          <Typography key={`text-${type.value}`} style={{ borderRight: "0" }}>
            {type.description}
          </Typography>
        </div>
      ))}
    </>
  );
};

export default DataTypesList;
