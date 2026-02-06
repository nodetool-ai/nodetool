/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, memo } from "react";
import {
    Box,
    IconButton,
    InputBase,
    Tooltip,
    Divider
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
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
            <Box
                sx={{
                    position: "absolute",
                    top: 16,
                    left: 16,
                    zIndex: 100,
                    display: isOpen ? "none" : "flex",
                    alignItems: "center",
                    gap: 0.5,
                    p: 1,
                    borderRadius: 3,
                    backgroundColor: theme.vars.palette.background.paper,
                    backdropFilter: "blur(12px)",
                    border: `1px solid ${theme.vars.palette.divider}`,
                    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
                    transition: "all 0.3s ease"
                }}
            >
                <Tooltip title="Open sidebar" placement="bottom">
                    <IconButton
                        onClick={handleOpen}
                        size="small"
                        sx={{
                            color: theme.vars.palette.text.secondary,
                            "&:hover": {
                                color: theme.vars.palette.text.primary,
                                backgroundColor: theme.vars.palette.action.hover
                            }
                        }}
                    >
                        <MenuIcon />
                    </IconButton>
                </Tooltip>
                <Tooltip title="New chat" placement="bottom">
                    <IconButton
                        onClick={handleNewChat}
                        size="small"
                        sx={{
                            color: theme.vars.palette.text.secondary,
                            "&:hover": {
                                color: theme.vars.palette.text.primary,
                                backgroundColor: theme.vars.palette.action.hover
                            }
                        }}
                    >
                        <AddIcon />
                    </IconButton>
                </Tooltip>
            </Box>

            {/* Sidebar Panel */}
            <Box
                sx={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: SIDEBAR_WIDTH,
                    height: "100%",
                    zIndex: 100,
                    display: "flex",
                    flexDirection: "column",
                    backgroundColor: theme.vars.palette.background.default,
                    borderRight: `1px solid ${theme.vars.palette.divider}`,
                    boxShadow: "4px 0 24px rgba(0, 0, 0, 0.05)",
                    transform: isOpen ? "translateX(0)" : `translateX(-${SIDEBAR_WIDTH}px)`,
                    transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    overflow: "hidden"
                }}
            >
                {/* Header with collapse button */}
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        p: 1,
                        minHeight: 48,
                        borderBottom: `1px solid ${theme.vars.palette.divider}`
                    }}
                >
                    <Box sx={{ fontSize: "0.875rem", fontWeight: 600, pl: 1, color: theme.vars.palette.text.secondary }}>
                        Conversations
                    </Box>
                    <Tooltip title="Collapse sidebar" placement="right">
                        <IconButton
                            onClick={handleClose}
                            size="small"
                            sx={{
                                color: theme.vars.palette.text.secondary,
                                "&:hover": {
                                    color: theme.vars.palette.text.primary,
                                    backgroundColor: theme.vars.palette.action.hover
                                }
                            }}
                        >
                            <ChevronLeftIcon />
                        </IconButton>
                    </Tooltip>
                </Box>
                {/* Search with New Chat button */}
                <Box sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
                    <Box
                        sx={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            px: 1.5,
                            py: 1,
                            borderRadius: 2,
                            backgroundColor: theme.vars.palette.action.hover,
                            border: `1px solid transparent`,
                            transition: "all 0.2s ease",
                            "&:focus-within": {
                                backgroundColor: theme.vars.palette.background.default,
                                borderColor: theme.vars.palette.primary.main,
                                boxShadow: `0 0 0 3px ${theme.vars.palette.primary.main}20`
                            }
                        }}
                    >
                        <SearchIcon
                            sx={{
                                color: theme.vars.palette.text.secondary,
                                fontSize: "1.1rem"
                            }}
                        />
                        <InputBase
                            placeholder="Search threads..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            fullWidth
                            sx={{
                                fontSize: "0.875rem",
                                "& input::placeholder": {
                                    color: theme.vars.palette.text.secondary,
                                    opacity: 1
                                }
                            }}
                        />
                    </Box>
                    <Tooltip title="New chat" placement="bottom">
                        <IconButton
                            onClick={handleNewChat}
                            size="small"
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
                        >
                            <AddIcon sx={{ fontSize: "1.2rem" }} />
                        </IconButton>
                    </Tooltip>
                </Box>

                <Divider />

                {/* Thread list */}
                <Box
                    sx={{
                        flex: 1,
                        overflow: "auto",
                        "&::-webkit-scrollbar": { width: 6 },
                        "&::-webkit-scrollbar-track": { background: "transparent" },
                        "&::-webkit-scrollbar-thumb": {
                            background: theme.vars.palette.grey[600],
                            borderRadius: 3
                        }
                    }}
                >
                    <ThreadList
                        threads={filteredThreads}
                        currentThreadId={currentThreadId}
                        onNewThread={handleNewChat}
                        onSelectThread={handleSelectThread}
                        onDeleteThread={onDeleteThread}
                        getThreadPreview={getThreadPreview}
                    />
                </Box>
            </Box>
        </>
    );
};

export default memo(ChatSidebar);
