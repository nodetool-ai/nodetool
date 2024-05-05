/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { iconForType, datatypeByName } from "../../config/data_types";
export interface NodeFooterProps {
  nodeNamespace: string;
  type: string;
}
export const footerStyles = (theme: any) =>
  css({
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    margin: "0.6em 0 0 0",
    padding: 0,
    background: theme.palette.c_node_header_bg,
    borderRadius: "0 0 0.3em 0.3em",
    overflow: "hidden",
    ".namespace": {
      display: "block",
      margin: 0,
      padding: "0.2em 0.5em 0.2em 0.5em",
      color: theme.palette.c_gray4,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeTinyer,
      textTransform: "uppercase",
      textAlign: "left",
      flexGrow: 1,
      overflow: "hidden"
    }
  });

export const NodeFooter: React.FC<NodeFooterProps> = ({
  nodeNamespace,
  type
}) => {
  const datatype = datatypeByName(type);
  return (
    <div css={footerStyles}>
      <span className="namespace"> {nodeNamespace} </span>
      {datatype &&
        iconForType(datatype.value, {
          fill: datatype.textColor,
          containerStyle: {
            borderRadius: "0 0 3px 0",
            marginLeft: "0.1em",
            marginTop: "0"
          },
          bgStyle: {
            backgroundColor: datatype.color,
            margin: "0",
            padding: "1px",
            borderRadius: "0 0 3px 0",
            boxShadow: "inset 1px 1px 2px #00000044",
            width: "15px",
            height: "15px"
          },
          width: "10px",
          height: "10px"
        })}
    </div>
  );
};
