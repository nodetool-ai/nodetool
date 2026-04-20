/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, memo } from "react";
import { FlexRow, FlexColumn, ToolbarIconButton, Text, ScrollArea, SearchInput } from "../../ui_primitives";
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
                    zIndex: 100,
                    display: isOpen ? "none" : "flex",
                    p: 0.75,
                    borderRadius: 3,
                    backgroundColor: `rgb(${theme.vars.palette.background.paperChannel} / 0.86)`,
                    backdropFilter: "blur(16px)",
                    border: `1px solid rgb(${theme.vars.palette.common.whiteChannel} / 0.08)`,
                    boxShadow: "0 14px 30px rgb(0 0 0 / 0.18)",
                    transition: "all 0.3s ease"
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
                    zIndex: 100,
                    backgroundColor: theme.vars.palette.grey[1000],
                    borderRight: "none",
                    boxShadow: "none",
                    transform: isOpen ? "translateX(0)" : `translateX(-${SIDEBAR_WIDTH}px)`,
                    transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
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
                    <Text
                        size="tiny"
                        weight={500}
                        sx={{
                            pl: 0.5,
                            color: theme.vars.palette.grey[400],
                            textTransform: "uppercase",
                            letterSpacing: "0.08em"
                        }}
                    >
                        Conversations
                    </Text>
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
                {/* Search with New Chat button */}
                <FlexRow gap={0.75} align="center" sx={{ px: 1.5, pb: 1 }}>
                    <FlexRow
                        align="center"
                        sx={{
                            flex: 1,
                            minWidth: 0,
                            pl: 0.25
                        }}
                    >
                        <SearchInput
                            placeholder="Search threads..."
                            value={searchQuery}
                            onChange={handleSearchChange}
                            fullWidth
                            showClear={false}
                        />
                    </FlexRow>
                    <ToolbarIconButton
                        onClick={handleNewChat}
                        tooltip="New chat"
                        icon={<AddIcon sx={{ fontSize: "1.1rem" }} />}
                        sx={{
                            backgroundColor: "transparent",
                            color: theme.vars.palette.grey[200],
                            border: "none",
                            borderRadius: 1.5,
                            width: 30,
                            height: 30,
                            transition: "background-color 0.15s ease",
                            "&:hover": {
                                backgroundColor: `rgb(${theme.vars.palette.common.whiteChannel} / 0.06)`,
                                color: theme.vars.palette.grey[0]
                            }
                        }}
                    />
                </FlexRow>

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
