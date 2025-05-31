/** @jsxImportSource @emotion/react */
import { Box, Button, Tooltip } from "@mui/material";
import { Workflow } from "../../stores/ApiTypes";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_LEAVE_DELAY
} from "../../config/constants";

interface TagFilterProps {
  tags: Record<string, Workflow[]>;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
}

const TagFilter: React.FC<TagFilterProps> = ({ tags, selectedTag, onSelectTag }) => {
  return (
    <Box className="tag-menu">
      <div className="button-row">
        <Tooltip
          title="Basic examples to get started"
          enterDelay={TOOLTIP_ENTER_DELAY}
          leaveDelay={TOOLTIP_LEAVE_DELAY}
        >
          <Button
            onClick={() => onSelectTag("getting-started")}
            variant="outlined"
            className={selectedTag === "getting-started" ? "selected" : ""}
          >
            Getting Started
          </Button>
        </Tooltip>
        {Object.keys(tags)
          .filter((tag) => tag !== "start")
          .sort((a, b) => a.localeCompare(b))
          .map((tag) => (
            <Tooltip
              key={tag}
              title={`Show ${tag} examples`}
              enterDelay={TOOLTIP_ENTER_DELAY}
              leaveDelay={TOOLTIP_LEAVE_DELAY}
            >
              <Button
                onClick={() => onSelectTag(tag)}
                variant="outlined"
                className={selectedTag === tag ? "selected" : ""}
              >
                {tag}
              </Button>
            </Tooltip>
          ))}
        <Tooltip
          title="Show all example workflows"
          enterDelay={TOOLTIP_ENTER_DELAY}
          leaveDelay={TOOLTIP_LEAVE_DELAY}
        >
          <Button
            onClick={() => onSelectTag(null)}
            className={selectedTag === null ? "selected" : ""}
          >
            SHOW ALL
          </Button>
        </Tooltip>
      </div>
    </Box>
  );
};

export default TagFilter;
