/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, memo } from "react";
import { FlexRow, FlexColumn, ToolbarIconButton, Divider, Text, ScrollArea, SearchInput } from "../../ui_primitives";
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
                    top: 16,
                    left: 16,
                    zIndex: 100,
                    display: isOpen ? "none" : "flex",
                    p: 1,
                    borderRadius: 3,
                    backgroundColor: theme.vars.palette.background.paper,
                    backdropFilter: "blur(12px)",
                    border: `1px solid ${theme.vars.palette.divider}`,
                    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
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
                    backgroundColor: theme.vars.palette.background.default,
                    borderRight: `1px solid ${theme.vars.palette.divider}`,
                    boxShadow: "4px 0 24px rgba(0, 0, 0, 0.05)",
                    transform: isOpen ? "translateX(0)" : `translateX(-${SIDEBAR_WIDTH}px)`,
                    transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    overflow: "hidden"
                }}
            >
                {/* Header with collapse button */}
                <FlexRow
                    align="center"
                    justify="space-between"
                    sx={{
                        p: 1,
                        minHeight: 48,
                        borderBottom: `1px solid ${theme.vars.palette.divider}`
                    }}
                >
                    <Text size="small" weight={600} sx={{ pl: 1, color: theme.vars.palette.text.secondary }}>
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
                <FlexRow gap={1} align="center" sx={{ px: 2, py: 1.5 }}>
                    <FlexRow
                        align="center"
                        sx={{
                            flex: 1,
                            minWidth: 0
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
                        icon={<AddIcon sx={{ fontSize: "1.2rem" }} />}
                        sx={{
                            backgroundColor: theme.vars.palette.grey[800],
                            color: theme.vars.palette.common.white,
                            border: `1px solid ${theme.vars.palette.grey[700]}`,
                            borderRadius: 2,
                            width: 36,
                            height: 36,
                            transition: "all 0.2s ease",
                            "&:hover": {
                                backgroundColor: theme.vars.palette.grey[700],
                                borderColor: theme.vars.palette.grey[600]
                            }
                        }}
                    />
                </FlexRow>

                <Divider />

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
