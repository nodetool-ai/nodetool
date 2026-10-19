/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Text,
  EditorButton,
  BORDER_RADIUS,
  Box,
  ListGroup,
  MOTION,
  SPACING,
  TYPOGRAPHY,
  getSpacingPx,
  selectedRowStyles,
  thinScrollbarStyles
} from "../ui_primitives";
import { NodeMetadata } from "../../stores/ApiTypes";
import NamespacePanel from "./NamespacePanel";
import RenderNodes from "./RenderNodes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useShallow } from "zustand/react/shallow";
import NodeInfo from "./NodeInfo";
import QuickActionTiles from "./QuickActionTiles";
import RecentNodesTiles from "./RecentNodesTiles";
import FavoritesTiles from "./FavoritesTiles";
import isEqual from "../../utils/isEqual";
import AddCircleOutline from "@mui/icons-material/AddCircleOutline";
import { NamespaceTree } from "../../hooks/useNamespaceTree";
import { useOpenPackageManager } from "../../hooks/useOpenPackageManager";
import { isCloudProfile } from "../../lib/runtimeConfig";

interface NamespaceListProps {
  namespaceTree: NamespaceTree;
}

const namespaceStyles = (theme: Theme) =>
  css({
    "&": {
      margin: `${getSpacingPx(SPACING.xl)} 0`,
      height: "60vh",
      display: "flex",
      flexDirection: "column",
      marginTop: getSpacingPx(SPACING.xxl), // was 20px
      overflow: "auto"
    },
    "& h4": {
      fontSize: theme.fontSizeSmall,
      color: "var(--palette-primary-main)"
    },
    ".info-box": {
      flex: "0 0 auto",
      alignSelf: "flex-end",
      margin: `0 ${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.md)}`
    },
    ".node-packs-info": {
      textAlign: "right",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      width: "100%"
    },
    ".list-box": {
      display: "flex",
      flexDirection: "row",
      alignItems: "stretch",
      margin: "0",
      width: "100%",
      flex: "1 1 auto",
      minHeight: 0,
      overflow: "hidden"
    },
    ".node-list": {
      height: "100%",
      maxHeight: "750px",
      flex: "1 1 0",
      minWidth: "320px",
      backgroundColor: "transparent",
      transition: `max-width ${MOTION.slow}, width ${MOTION.slow}`,
      overflowX: "hidden",
      overflowY: "auto",
      padding: `0 ${getSpacingPx(SPACING.sm)}`,
      ...thinScrollbarStyles(theme)
    },
    ".node-list.expanded": {
      width: "100%",
      maxWidth: "none"
    },
    ".no-selection": {
      maxWidth: "200px",
      flexDirection: "column",
      color: theme.vars.palette.grey[0],
      fontFamily: theme.fontFamily1,
      wordSpacing: "0",
      padding: `0 ${getSpacingPx(SPACING.xl)}`,
      margin: 0,
      alignItems: "stretch",
      gap: getSpacingPx(SPACING.xl),
      opacity: 0,
      animation: `fadeIn ${MOTION.slow} forwards`,
      animationDelay: `${500}ms`,
      visibility: "hidden",
      overflow: "hidden"
    },
    "&.home-layout .no-selection": {
      display: "none"
    },
    "&.home-layout .quick-action-tiles-container": {
      flex: "1 1 auto",
      minWidth: 0
    },
    "@keyframes fadeIn": {
      from: {
        visibility: "visible",
        display: "flex",
        maxWidth: "400px",
        opacity: 0
      },
      to: {
        visibility: "visible",
        display: "flex",
        maxWidth: "400px",
        opacity: 1
      }
    },
    ".explanation": {
      overflowY: "scroll",
      fontFamily: theme.fontFamily1,
      color: theme.vars.palette.grey[200],
      fontWeight: 400,
      margin: "0",
      padding: `0 ${getSpacingPx(SPACING.xxxl)} ${getSpacingPx(SPACING.xxxl)} 0`
    },
    ".explanation h5": {
      color: "var(--palette-primary-main)",
      margin: `0 0 ${getSpacingPx(SPACING.xs)}`,
      padding: "0",
      fontWeight: 400
    },
    ".explanation ul": {
      listStyleType: "square",
      paddingInlineStart: getSpacingPx(SPACING.xl),
      margin: 0,
      "& li": {
        margin: `${getSpacingPx(SPACING.xs)} 0`,
        padding: "0"
      }
    },
    ".result-info": {
      color: theme.vars.palette.text.primary,
      cursor: "default",
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.xs),
      fontSize: theme.fontSizeNormal,
      padding: theme.spacing(1, 1.5),
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: theme.vars.palette.action.hover,
      margin: `${getSpacingPx(SPACING.sm)} 0 0 0`,
      border: `1px solid ${theme.vars.palette.divider}`
    },
    ".result-info span": {
      color: "var(--palette-primary-main)",
      fontWeight: 500
    },
    ".result-label": {
      color: `${theme.vars.palette.text.secondary} !important`,
      ...TYPOGRAPHY.sans.caption,
      marginLeft: getSpacingPx(SPACING.md),
      userSelect: "none"
    },
    ".no-selection p": {
      margin: "0",
      padding: `0 0 ${getSpacingPx(SPACING.md)} 0`
    },
    ".no-results": {
      padding: `0 0 0 ${getSpacingPx(SPACING.xxxl)}`,
      margin: "0",
      ...TYPOGRAPHY.sans.caption,
      color: theme.vars.palette.text.secondary
    },
    h6: {
      color: theme.vars.palette.grey[400]
    },
    ".highlighted": {
      paddingLeft: getSpacingPx(SPACING.xs),
      marginLeft: getSpacingPx(SPACING.micro),
      borderLeft: `1px solid ${"var(--palette-primary-main)"}`
    },
    ".highlighted-text": {
      color: "var(--palette-primary-main)"
    },
    ".nodes": {
      display: "flex",
      flexDirection: "column",
      minWidth: "200px",
      backgroundColor: "transparent",
      padding: "0"
    },
    ".node": {
      display: "flex",
      alignItems: "center",
      margin: `${getSpacingPx(SPACING.micro)} 0`,
      padding: "0",
      borderRadius: BORDER_RADIUS.lg,
      cursor: "pointer",
      transition: MOTION.all,
      border: "1px solid transparent",
      ".node-button": {
        padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.xs)}`,
        flexGrow: 1,
        borderRadius: BORDER_RADIUS.md,
        minHeight: "24px",
        "&:hover": {
          backgroundColor: "transparent"
        },
        "& .MuiTypography-root": {
          fontSize: "var(--fontSizeNormal)",
          fontWeight: 500,
          lineHeight: 1.2,
          color: theme.vars.palette.text.primary
        }
      },
      ".icon-bg": {
        backgroundColor: "transparent !important"
      },
      ".icon-bg svg": {
        color: theme.vars.palette.text.secondary
      }
    },
    ".node:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      border: `1px solid ${theme.vars.palette.divider}`
    },
    ".node.focused": selectedRowStyles(theme),
    ".namespace-text": {
      color: "var(--palette-grey-500)",
      fontWeight: 400,
      fontSize: "var(--fontSizeSmall)",
      lineHeight: 1.15,
      padding: `${getSpacingPx(SPACING.sm)} 0 0 0`,
      margin: `${getSpacingPx(SPACING.md)} 0 0 0`,
      wordBreak: "break-word",
      userSelect: "none",
      pointerEvents: "none",
      textTransform: "uppercase"
    },
    ".info-button": {
      marginLeft: "auto"
    },
    ".node-info:hover": {
      color: "var(--palette-primary-main)"
    },
    ".node-info": {
      cursor: "pointer",
      marginLeft: "auto",
      display: "flex",
      alignItems: "center"
    },
    ".api-key-warning": {
      color: theme.vars.palette.grey[200],
      fontSize: theme.fontSizeSmall,
      margin: `${getSpacingPx(SPACING.md)} 0`
    },
    "&.has-search-results .namespace-list-enabled .no-highlight .namespace-item":
      {
        color: theme.vars.palette.text.disabled
      },
    "&.has-search-results .no-highlight": {
      pointerEvents: "none"
    },
    ".node-info-container": {
      flex: "0 0 36%",
      width: "36%",
      minWidth: "340px",
      maxWidth: "560px",
      backgroundColor: "transparent",
      borderLeft: `1px solid ${theme.vars.palette.divider}`,
      paddingLeft: getSpacingPx(SPACING.md),
      overflow: "hidden"
    },
    ".node-packs-info .MuiButton-root": {
      textTransform: "none",
      borderRadius: BORDER_RADIUS.lg,
      padding: `${theme.spacing(1.5)} ${theme.spacing(3)}`,
      borderColor: theme.vars.palette.divider,
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        borderColor: theme.vars.palette.text.secondary
      }
    },
    ".quick-action-tiles-container": {
      flex: "1 1 auto",
      minWidth: "300px",
      backgroundColor: "transparent",
      borderLeft: `1px solid ${theme.vars.palette.divider}`,
      marginLeft: getSpacingPx(SPACING.md),
      overflowY: "auto"
    }
  });

const NoSelectionContent = memo(function NoSelectionContent({
  searchTerm,
  selectedPathString,
  minSearchTermLength
}: {
  searchTerm: string;
  selectedPathString: string;
  minSearchTermLength: number;
}) {
  const { t } = useTranslation();
  const openPacksPanel = useOpenPackageManager();

  return (
    <div className="no-selection">
      {searchTerm.length > minSearchTermLength ? (
        <>
          <p>
            {selectedPathString ? (
              <>
                {t("i18n-next12.namespaceList.nothingInNamespace", { searchTerm })}
              </>
            ) : (
              <>
                {t("i18n-next12.namespaceList.nothingFound", { searchTerm })}
              </>
            )}
          </p>
          <ul className="no-results">
            {selectedPathString && (
              <li>
                {t("i18n-next12.namespaceList.clickHighlighted")}
              </li>
            )}
            <li>{t("i18n-next12.namespaceList.typeToSearch")}</li>
            <li>{t("i18n-next12.namespaceList.clearSearchHint")}</li>
          </ul>
        </>
      ) : null}
      {!isCloudProfile() && (
        <div className="node-packs-info">
          <EditorButton
            startIcon={<AddCircleOutline />}
            size="small"
            variant="outlined"
            onClick={openPacksPanel}
            style={{
              marginTop: getSpacingPx(SPACING.md),
              marginBottom: getSpacingPx(SPACING.md),
              textTransform: "none",
              lineHeight: "1.5",
              padding: getSpacingPx(SPACING.xl)
            }}
          >
            {t("i18n-next12.namespaceList.installPacks")}
          </EditorButton>
        </div>
      )}
    </div>
  );
});

const InfoBox = memo(function InfoBox({
  searchTerm,
  minSearchTermLength,
  selectedPathString,
  searchResults,
  allSearchMatches
}: {
  searchTerm: string;
  minSearchTermLength: number;
  selectedPathString: string;
  searchResults: NodeMetadata[];
  allSearchMatches: NodeMetadata[];
}) {
  const buildContextMessage = () => {
    if (searchTerm.length > minSearchTermLength) {
      const matchCount = searchResults.length;
      const totalMatches = allSearchMatches.length;
      if (selectedPathString) {
        return `${matchCount} results in ${selectedPathString} • ${totalMatches} total match '${searchTerm}'`;
      }
      return `${matchCount} results • Showing most relevant for '${searchTerm}'`;
    }
    if (selectedPathString) {
      return `${searchResults.length} nodes in ${selectedPathString}`;
    }
    const count = searchResults.length;
    return `${count} ${count === 1 ? "node matches" : "nodes match"} the filters`;
  };

  return (
    <Box className="info-box">
      <Text size="small" className="result-info">
        {buildContextMessage()}
      </Text>
    </Box>
  );
});

const NamespaceList: React.FC<NamespaceListProps> = ({
  namespaceTree
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => namespaceStyles(theme), [theme]);
  const {
    searchTerm,
    selectedPath,
    searchResults,
    allSearchMatches,
    hoveredNode,
    selectedInputType,
    selectedOutputType,
    selectedProviderType
  } = useNodeMenuStore(
    useShallow((state) => ({
      searchTerm: state.searchTerm,
      selectedPath: state.selectedPath,
      searchResults: state.searchResults,
      allSearchMatches: state.allSearchMatches,
      hoveredNode: state.hoveredNode,
      selectedInputType: state.selectedInputType,
      selectedOutputType: state.selectedOutputType,
      selectedProviderType: state.selectedProviderType
    }))
  );

  const selectedPathString = useMemo(
    () => selectedPath.join("."),
    [selectedPath]
  );

  const minSearchTermLength =
    searchTerm.includes("+") ||
    searchTerm.includes("-") ||
    searchTerm.includes("*") ||
    searchTerm.includes("/")
      ? 0
      : 1;

  const isHomeLayout = !(
    selectedPathString ||
    searchTerm ||
    selectedInputType ||
    selectedOutputType ||
    selectedProviderType !== "all"
  );

  return (
    <div
      css={cssStyles}
      className={`${
        (searchTerm.length > minSearchTermLength ||
          selectedInputType ||
          selectedOutputType ||
          selectedProviderType !== "all") &&
        searchResults.length > 0
          ? "has-search-results"
          : "no-search-results"
      } ${isHomeLayout ? "home-layout" : ""}`}
    >
      <Box className="list-box">
        <NamespacePanel namespaceTree={namespaceTree} />
        {selectedPathString ||
        searchTerm ||
        selectedInputType ||
        selectedOutputType ||
        selectedProviderType !== "all" ? (
          <>
            <ListGroup className={`node-list ${searchTerm ? "expanded" : ""}`}>
              <RenderNodes nodes={searchResults} />
            </ListGroup>
            {!searchTerm && (
              <div className="node-info-container">
                {hoveredNode && <NodeInfo nodeMetadata={hoveredNode} />}
              </div>
            )}
          </>
        ) : (
          <>
            <NoSelectionContent
              searchTerm={searchTerm}
              selectedPathString={selectedPathString}
              minSearchTermLength={minSearchTermLength}
            />
            <div className="quick-action-tiles-container">
              <FavoritesTiles />
              <RecentNodesTiles />
              <QuickActionTiles />
            </div>
          </>
        )}
      </Box>
      {/* The toolbar already shows the total node count on the home view. */}
      {!isHomeLayout && (
        <InfoBox
          searchTerm={searchTerm}
          minSearchTermLength={minSearchTermLength}
          selectedPathString={selectedPathString}
          searchResults={searchResults}
          allSearchMatches={allSearchMatches}
        />
      )}
    </div>
  );
};

export default memo(NamespaceList, isEqual);
