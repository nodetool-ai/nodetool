/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, memo } from "react";
import { FlexRow, FlexColumn, ToolbarIconButton, Text, ScrollArea, SearchInput, NavButton, MOTION, BORDER_RADIUS, reducedMotion, Z_INDEX, SPACING, getSpacingPx } from "../../ui_primitives";
import { useTheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import AddIcon from "@mui/icons-material/Add";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ThreadList from "../thread/ThreadList";
import type { ThreadInfo } from "../types/thread.types";


export const SIDEBAR_WIDTH = 280;

interface ChatSidebarProps {
    threads: Record<string, ThreadInfo>;
    currentThreadId: string | null;
    onNewChat: () => void;
    onSelectThread: (id: string) => void;
    onDeleteThread: (id: string) => void;
    getThreadPreview: (id: string) => string;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
    threads,
    currentThreadId,
    onNewChat,
    onSelectThread,
    onDeleteThread,
    getThreadPreview,
    isOpen,
    onOpenChange
}) => {
    const theme = useTheme();
    const [searchQuery, setSearchQuery] = useState("");

    const handleSearchChange = useCallback((value: string) => {
        setSearchQuery(value);
    }, []);

    const handleOpen = useCallback(() => {
        onOpenChange(true);
    }, [onOpenChange]);

    const handleClose = useCallback(() => {
        onOpenChange(false);
    }, [onOpenChange]);

    const handleNewChat = useCallback(() => {
        onNewChat();
        // Keep sidebar open after creating new chat
    }, [onNewChat]);

    const handleSelectThread = useCallback(
        (id: string) => {
            onSelectThread(id);
            // Keep sidebar open after selecting thread
        },
        [onSelectThread]
    );

    // Filter threads based on search query
    const filteredThreads = React.useMemo(() => {
        if (!searchQuery.trim()) {
            return threads;
        }

        const query = searchQuery.toLowerCase();
        return Object.fromEntries(
            Object.entries(threads).filter(([id, thread]) => {
                const preview = getThreadPreview(id).toLowerCase();
                const title = (thread.title || "").toLowerCase();
                return preview.includes(query) || title.includes(query);
            })
        );
    }, [threads, searchQuery, getThreadPreview]);

    const threadCount = Object.keys(threads).length;

    return (
        <>
            {/* Collapsed toolbar - floating button group */}
            <FlexRow
                align="center"
                gap={0.5}
                sx={{
                    position: "absolute",
                    top: 18,
                    left: 18,
                    zIndex: Z_INDEX.overlay,
                    display: isOpen ? "none" : "flex",
                    p: 0.75,
                    borderRadius: BORDER_RADIUS.md,
                    backgroundColor: `rgb(${theme.vars.palette.background.paperChannel} / 0.86)`,
                    backdropFilter: "blur(16px)",
                    border: `1px solid rgb(${theme.vars.palette.common.whiteChannel} / 0.08)`,
                    boxShadow: "0 14px 30px rgb(0 0 0 / 0.18)",
                    transition: `all ${MOTION.slow}`
                }}
            >
                <ToolbarIconButton
                    onClick={handleOpen}
                    tooltip="Open sidebar"
                    icon={<MenuIcon />}
                    sx={{
                        color: theme.vars.palette.text.secondary,
                        "&:hover": {
                            color: theme.vars.palette.text.primary,
                            backgroundColor: theme.vars.palette.action.hover
                        }
                    }}
                />
                <ToolbarIconButton
                    onClick={handleNewChat}
                    tooltip="New chat"
                    icon={<AddIcon />}
                    sx={{
                        color: theme.vars.palette.text.secondary,
                        "&:hover": {
                            color: theme.vars.palette.text.primary,
                            backgroundColor: theme.vars.palette.action.hover
                        }
                    }}
                />
            </FlexRow>

            {/* Sidebar Panel */}
            <FlexColumn
                fullHeight
                sx={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: SIDEBAR_WIDTH,
                    zIndex: Z_INDEX.overlay,
                    backgroundColor: theme.vars.palette.grey[1000],
                    borderRight: "none",
                    boxShadow: "none",
                    transform: isOpen ? "translateX(0)" : `translateX(-${SIDEBAR_WIDTH}px)`,
                    transition: `transform ${MOTION.slow}`,
                    ...reducedMotion({ transition: MOTION.none }),
                    overflow: "hidden"
                }}
            >
                <div
                    aria-hidden="true"
                    style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                        background: "linear-gradient(180deg, rgb(255 255 255 / 0.025), transparent 22%)"
                    }}
                />
                {/* Header with collapse button */}
                <FlexRow
                    align="center"
                    justify="space-between"
                    sx={{
                        px: 1.5,
                        py: 1,
                        minHeight: 44,
                        borderBottom: "none"
                    }}
                >
                    <FlexRow align="baseline" gap={1} sx={{ pl: 0.5, minWidth: 0 }}>
                        <Text
                            size="tiny"
                            weight={500}
                            sx={{
                                color: theme.vars.palette.grey[400],
                                textTransform: "uppercase",
                                letterSpacing: "0.08em"
                            }}
                        >
                            Conversations
                        </Text>
                        {threadCount > 0 && (
                            <Text
                                size="tiny"
                                weight={500}
                                sx={{ color: theme.vars.palette.grey[600] }}
                            >
                                {threadCount}
                            </Text>
                        )}
                    </FlexRow>
                    <ToolbarIconButton
                        onClick={handleClose}
                        tooltip="Collapse sidebar"
                        icon={<ChevronLeftIcon />}
                        sx={{
                            color: theme.vars.palette.text.secondary,
                            "&:hover": {
                                color: theme.vars.palette.text.primary,
                                backgroundColor: theme.vars.palette.action.hover
                            }
                        }}
                    />
                </FlexRow>
                {/* Search + full-width New conversation button */}
                <FlexColumn gap={1} sx={{ px: 1.5, pb: 1 }}>
                    <FlexRow
                        align="center"
                        sx={{
                            position: "relative",
                            minWidth: 0,
                            pl: 0.5,
                            "& .search-input .MuiInputBase-root": {
                                fontSize: "var(--fontSizeSmall)",
                                paddingLeft: 0.5,
                                paddingRight: 0.5
                            },
                            "& .search-input .MuiInputBase-input": {
                                paddingTop: getSpacingPx(SPACING.xs),
                                paddingBottom: getSpacingPx(SPACING.xs),
                                paddingRight: 8,
                                height: "20px"
                            },
                            "& .search-input .MuiInputAdornment-root": {
                                marginRight: getSpacingPx(SPACING.xs)
                            },
                            "& .search-input .search-icon": {
                                fontSize: "var(--fontSizeNormal)"
                            }
                        }}
                    >
                        <SearchInput
                            placeholder="Search threads..."
                            value={searchQuery}
                            onChange={handleSearchChange}
                            fullWidth
                            showClear={false}
                        />
                        <Text
                            aria-hidden
                            size="tinyer"
                            sx={{
                                position: "absolute",
                                right: 8,
                                top: "50%",
                                transform: "translateY(-50%)",
                                pointerEvents: "none",
                                color: theme.vars.palette.grey[500],
                                border: `1px solid ${theme.vars.palette.grey[700]}`,
                                borderRadius: BORDER_RADIUS.xs,
                                px: 0.5,
                                lineHeight: 1.4
                            }}
                        >
                            ⌘K
                        </Text>
                    </FlexRow>
                    <NavButton
                        icon={<AddIcon sx={{ fontSize: "var(--fontSizeBig)" }} />}
                        label="New conversation"
                        onClick={handleNewChat}
                        tabIndex={0}
                        sx={{
                            width: "100%",
                            backgroundColor: theme.vars.palette.primary.main,
                            color: theme.vars.palette.primary.contrastText,
                            "&:hover": {
                                backgroundColor: theme.vars.palette.primary.dark,
                                color: theme.vars.palette.primary.contrastText
                            }
                        }}
                    />
                </FlexColumn>

                {/* Thread list */}
                <ScrollArea fullHeight>
                    <ThreadList
                        threads={filteredThreads}
                        currentThreadId={currentThreadId}
                        onNewThread={handleNewChat}
                        onSelectThread={handleSelectThread}
                        onDeleteThread={onDeleteThread}
                        getThreadPreview={getThreadPreview}
                    />
                </ScrollArea>
            </FlexColumn>
        </>
    );
};

export default memo(ChatSidebar);
