/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { 
  Breadcrumbs as MuiBreadcrumbs, 
  Link, 
  Typography,
  IconButton,
  Tooltip 
} from "@mui/material";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import HomeIcon from "@mui/icons-material/Home";
import FolderIcon from "@mui/icons-material/Folder";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

export interface BreadcrumbItem {
  /** Label to display */
  label: string;
  /** Path or identifier */
  path?: string;
  /** Optional icon */
  icon?: React.ReactNode;
  /** Tooltip text */
  tooltip?: string;
}

export interface BreadcrumbsProps {
  /** Array of breadcrumb items */
  items: BreadcrumbItem[];
  /** Callback when a breadcrumb is clicked */
  onNavigate?: (item: BreadcrumbItem, index: number) => void;
  /** Whether to show home icon for first item */
  showHomeIcon?: boolean;
  /** Whether to show folder icons */
  showFolderIcons?: boolean;
  /** Separator style */
  separator?: "arrow" | "chevron" | "slash";
  /** Max items to show before collapsing */
  maxItems?: number;
  /** Additional className */
  className?: string;
}

const styles = (theme: Theme) => css`
  .breadcrumb-link {
    display: flex;
    align-items: center;
    gap: 4px;
    color: ${theme.vars.palette.text.secondary};
    text-decoration: none;
    font-size: 14px;
    padding: 4px 8px;
    border-radius: 4px;
    transition: all 0.2s ease;
    cursor: pointer;
    
    &:hover {
      color: ${theme.vars.palette.primary.main};
      background-color: ${theme.vars.palette.action.hover};
    }
    
    .breadcrumb-icon {
      font-size: 18px;
    }
  }
  
  .breadcrumb-current {
    display: flex;
    align-items: center;
    gap: 4px;
    color: ${theme.vars.palette.text.primary};
    font-size: 14px;
    font-weight: 500;
    padding: 4px 8px;
    
    .breadcrumb-icon {
      font-size: 18px;
    }
  }
  
  .breadcrumb-separator {
    color: ${theme.vars.palette.text.disabled};
    font-size: 18px;
  }
  
  .home-button {
    padding: 4px;
    color: ${theme.vars.palette.text.secondary};
    
    &:hover {
      color: ${theme.vars.palette.primary.main};
      background-color: ${theme.vars.palette.action.hover};
    }
  }
`;

const getSeparator = (type: BreadcrumbsProps["separator"]) => {
  switch (type) {
    case "chevron":
      return <ChevronRightIcon className="breadcrumb-separator" fontSize="small" />;
    case "slash":
      return <Typography className="breadcrumb-separator">/</Typography>;
    case "arrow":
    default:
      return <NavigateNextIcon className="breadcrumb-separator" fontSize="small" />;
  }
};

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  items,
  onNavigate,
  showHomeIcon = false,
  showFolderIcons = false,
  separator = "arrow",
  maxItems,
  className
}) => {
  const theme = useTheme();
  
  const handleClick = (item: BreadcrumbItem, index: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    onNavigate?.(item, index);
  };
  
  const getIcon = (item: BreadcrumbItem, index: number) => {
    if (item.icon) return item.icon;
    if (showHomeIcon && index === 0) return <HomeIcon className="breadcrumb-icon" />;
    if (showFolderIcons && index > 0) return <FolderIcon className="breadcrumb-icon" />;
    return null;
  };
  
  return (
    <div className={`breadcrumbs-wrapper nodrag ${className || ""}`} css={styles(theme)}>
      <MuiBreadcrumbs
        separator={getSeparator(separator)}
        maxItems={maxItems}
        aria-label="breadcrumb"
      >
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const icon = getIcon(item, index);
          
          if (isLast) {
            return (
              <Typography key={item.path || index} className="breadcrumb-current">
                {icon}
                {item.label}
              </Typography>
            );
          }
          
          const linkContent = (
            <Link
              key={item.path || index}
              className="breadcrumb-link"
              href={item.path || "#"}
              onClick={handleClick(item, index)}
              underline="none"
            >
              {icon}
              {item.label}
            </Link>
          );
          
          if (item.tooltip) {
            return (
              <Tooltip 
                key={item.path || index}
                title={item.tooltip} 
                enterDelay={TOOLTIP_ENTER_DELAY}
              >
                {linkContent}
              </Tooltip>
            );
          }
          
          return linkContent;
        })}
      </MuiBreadcrumbs>
    </div>
  );
};

export default Breadcrumbs;
