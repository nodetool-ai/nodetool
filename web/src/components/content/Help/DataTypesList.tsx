/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  Typography,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from "@mui/material";
import { DataType, IconForType } from "../../../config/data_types";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

interface DataTypesListProps {
  title: string;
  dataTypes: DataType[];
  expanded: boolean;
  onChange: (event: React.SyntheticEvent, isExpanded: boolean) => void;
}

const DataTypesList = ({
  title,
  dataTypes,
  expanded,
  onChange
}: DataTypesListProps) => {
  const theme = useTheme();
  const types = dataTypes;

  const styles = (theme: Theme) =>
    css({
      "&": {
        padding: "0 .5em 0 0",
        backgroundColor: "transparent"
      },
      "& .MuiPaper-root": {
        background: "transparent"
      },
      "& .MuiAccordionSummary-root": {
        backgroundColor: "var(--palette-grey-800)",
        padding: "0 .5em"
      },
      ".help-item": {
        padding: ".5em 0",
        borderBottom: "1px solid var(--palette-grey-600)"
      },
      ".datatype-list": {
        padding: "1em",
        height: "500px",
        overflowY: "auto"
      },
      ".help-item.datatype": {
        alignItems: "flex-start"
      },
      ".help-item.datatype button": {
        color: theme.vars.palette.grey[0],
        borderRadius: "5px",
        minWidth: "180px",
        textAlign: "left",
        border: "0",
        marginTop: "0",
        wordBreak: "break-word",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start"
      },
      h5: {
        color: "var(--palette-grey-200)",
        fontSize: "1em",
        paddingLeft: "1em",
        "&:hover": {
          color: "var(--palette-grey-100)"
        }
      }
    });

  return (
    <div className="datatypes" css={styles(theme)}>
      <Accordion
        expanded={expanded}
        onChange={onChange}
        sx={{
          backgroundColor: "transparent",
          boxShadow: "none",
          margin: "0 !important",
          "&.Mui-expanded": {
            margin: "0 !important"
          },
          "&::before": {
            display: "none"
          }
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon sx={{ color: "text.primary" }} />}
          aria-controls="panel1bh-content"
          id="panel1bh-header"
          sx={{
            minHeight: "unset !important",
            padding: "0",
            ".MuiAccordionSummary-content": {
              margin: "12px 0 !important"
            }
          }}
        >
          <Typography variant="h5" color="text.secondary">
            {title}
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ padding: "0" }}>
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
                    width: "50px",
                    height: "50px"
                  }}
                  bgStyle={{
                    backgroundColor: type.color,
                    width: "50px",
                    height: "50px",
                    color: type.textColor,
                    padding: "8px"
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
                  <div
                    style={{
                      fontWeight: "normal",
                      width: "100%",
                      fontSize: "var(--fontSizeNormal)"
                    }}
                  >
                    {type.name}
                  </div>
                </Button>
                <Typography
                  key={`text-${type.value}`}
                  style={{ borderRight: "0" }}
                >
                  {type.description}
                </Typography>
              </div>
            ))}
          </div>
        </AccordionDetails>
      </Accordion>
    </div>
  );
};

export default DataTypesList;
