/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import Draggable from "react-draggable";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import ThemeNodetool from "../themes/ThemeNodetool";
import { IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

const styles = (theme: any) => css({
  '.node-description': {
    width: '500px',
    height: '500px',
    position: 'absolute',
    zIndex: 10000,
    boxShadow: '0px 0px 5px 1px rgba(0, 0, 0, 0.25)',
  },
  '.node-description-header': {
    height: '30px',
    color: 'var(--c_hl2)',
    borderRadius: '8px 8px 0 0',
  },
  '.node-description-content': {
    fontFamily: 'var(--font_family) !important',
    border: '1px solid #414141',
    boxShadow: '1px 1px 3px #0005',
    padding: '1em',
    backgroundColor: 'var(--c_gray1)',
    overflowY: 'auto',
    overflowX: 'hidden',
    height: '100%',
    paddingBottom: '5em',
    borderRadius: '0 0 8px 8px',
  },
  '.node-description-content ul li': {
    padding: '0.2em 0',
    margin: 0,
    color: theme.palette.c_gray3,
  },
  '.node-description-content h2': {
    margin: '0.5em 0',
    padding: 0,
    color: theme.palette.c_hl2,
  },
  '.node-description-content h3': {
    margin: '-0.5em 0 0 0',
    color: theme.palette.c_gray4,
  },
  '.node-description-content h5': {
    margin: '0 0 -1em 0',
    padding: 0,
    color: theme.palette.c_gray5,
  },
});

const NodeDescription: React.FC = () => {
  const { description, isDescriptionOpen, closeDescription } =
    useNodeMenuStore();

  return (
    <div css={styles}>
      {isDescriptionOpen && (
        <Draggable
          handle=".node-description-header"
          defaultPosition={{ x: 320, y: 55 }}
          bounds={{
            left: 10,
            right: window.innerWidth - 500,
            top: 0,
            bottom: window.innerHeight - 380
          }}
        >
          <div className="node-description">
            <div
              className="node-description-header"
              style={{
                cursor: "grab",
                backgroundColor: ThemeNodetool.palette.c_gray2,
                padding: ".5em 1em"
              }}
            >
              <IconButton
                edge="end"
                size="small"
                color="inherit"
                onClick={closeDescription}
                aria-label="close"
                style={{
                  zIndex: 150,
                  position: "absolute",
                  right: "5px",
                  top: "-2px",
                  color: ThemeNodetool.palette.c_gray3
                }}
              >
                <CloseIcon />
              </IconButton>
            </div>
            <div className="node-description-content">
              <MarkdownRenderer content={description || ""} />
            </div>
          </div>
        </Draggable>
      )}
    </div>
  );
};

export default NodeDescription;
