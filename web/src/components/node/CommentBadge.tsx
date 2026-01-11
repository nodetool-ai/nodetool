/** @jsxImportSource @emotion/react */
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import ChatBubbleIcon from "@mui/icons-material/ChatBubble";
import { styled } from "@mui/material/styles";

interface CommentBadgeProps {
  comment: string;
  onClick?: () => void;
  isSelected?: boolean;
}

const StyledBadge = styled(Box, {
  shouldForwardProp: (prop) => prop !== "isSelected",
})<{ isSelected?: boolean }>(({ theme, isSelected }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "20px",
  height: "20px",
  borderRadius: "50%",
  backgroundColor: isSelected
    ? theme.palette.primary.main
    : theme.palette.warning.main,
  color: theme.palette.primary.contrastText,
  cursor: "pointer",
  transition: "all 0.2s ease",
  "&:hover": {
    transform: "scale(1.1)",
    backgroundColor: isSelected
      ? theme.palette.primary.dark
      : theme.palette.warning.dark,
  },
}));

const CommentBadge: React.FC<CommentBadgeProps> = ({
  comment,
  onClick,
  isSelected = false,
}) => {
  return (
    <Tooltip title={comment} arrow placement="top">
      <StyledBadge
        onClick={onClick}
        isSelected={isSelected}
        sx={{
          flexShrink: 0,
        }}
      >
        <ChatBubbleIcon
          sx={{
            fontSize: "12px",
            color: "inherit",
          }}
        />
      </StyledBadge>
    </Tooltip>
  );
};

export default CommentBadge;
