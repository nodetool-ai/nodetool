import React, { useMemo, useState } from "react";
import { Box, Flex, Text, IconButton, Input, HStack, VStack } from "@chakra-ui/react";
import { FaPlus, FaTrash, FaPen } from "react-icons/fa";
import useChatStore from "../../stores/ChatStore";

export const ThreadList: React.FC = () => {
  const {
    threads,
    currentThreadId,
    createThread,
    switchThread,
    deleteThread,
    renameThread,
  } = useChatStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState<string>("");

  const items = useMemo(() => {
    const list = Object.values(threads || {});
    // Sort by updated_at desc
    return list.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  }, [threads]);

  return (
    <VStack align="stretch" gap={2} p={2} bg="secondary" borderRadius="md">
      <HStack justify="space-between">
        <Text fontWeight="semibold" opacity={0.8}>Conversations</Text>
        <IconButton
          aria-label="New chat"
          size="sm"
          onClick={() => createThread()}
          variant="ghost"
        >
          <FaPlus />
        </IconButton>
      </HStack>
      <VStack align="stretch" gap={1} maxH="240px" overflowY="auto">
        {items.map((t) => (
          <Flex
            key={t.id}
            align="center"
            p={2}
            borderRadius="md"
            bg={t.id === currentThreadId ? "bg1" : "transparent"}
            _hover={{ bg: t.id === currentThreadId ? "bg1" : "buttonHover" }}
            onClick={() => switchThread(t.id)}
            gap={2}
          >
            {editingId === t.id ? (
              <Input
                size="sm"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onBlur={() => {
                  if (draftTitle.trim().length > 0) renameThread(t.id, draftTitle);
                  setEditingId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    (e.target as HTMLInputElement).blur();
                  }
                  if (e.key === "Escape") {
                    setEditingId(null);
                    setDraftTitle("");
                  }
                }}
                autoFocus
              />
            ) : (
              <Text flex={1} lineClamp={1} title={t.title}>
                {t.title}
              </Text>
            )}
            <HStack gap={1} onClick={(e) => e.stopPropagation()}>
              <IconButton
                aria-label="Rename"
                size="xs"
                variant="ghost"
                onClick={() => {
                  setEditingId(t.id);
                  setDraftTitle(t.title);
                }}
              >
                <FaPen />
              </IconButton>
              <IconButton
                aria-label="Delete"
                size="xs"
                variant="ghost"
                onClick={() => deleteThread(t.id)}
              >
                <FaTrash />
              </IconButton>
            </HStack>
          </Flex>
        ))}
        {items.length === 0 && (
          <Box p={2}><Text opacity={0.6}>No conversations yet.</Text></Box>
        )}
      </VStack>
    </VStack>
  );
};

export default ThreadList;
