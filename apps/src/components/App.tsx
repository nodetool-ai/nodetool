import React, { useEffect } from "react";
import { Workflow } from "../types/workflow";
import { Box, Heading, Text, Flex } from "@chakra-ui/react";
import ChatInterface from "./ChatInterface";
import { MiniApp } from "./MiniApp";
import { useTheme } from "next-themes";
import { ColorModeButton } from "./ui/color-mode";

interface AppProps {
  initialWorkflowId?: string;
}

export const App: React.FC<AppProps> = ({ initialWorkflowId }) => {
  const [workflow, setWorkflow] = React.useState<Workflow | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const { theme, resolvedTheme } = useTheme();
  const displayTheme = resolvedTheme || theme || "light";

  useEffect(() => {
    const fetchWorkflow = async (workflowId: string) => {
      setLoading(true);
      try {
        const response = await fetch(
          `http://localhost:8000/api/workflows/${workflowId}`
        );
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const workflowData = await response.json();
        setWorkflow(workflowData);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch workflow"
        );
        console.error("Error fetching workflow:", err);
      } finally {
        setLoading(false);
      }
    };

    if (initialWorkflowId) {
      fetchWorkflow(initialWorkflowId);
    }
  }, [initialWorkflowId]);

  return (
    <div data-theme={displayTheme} className="app-root">
      <Flex h="100vh" direction="column" color="text" className="app-container">
        {workflow && (
          <Box
            bg="secondary"
            borderBottom="1px"
            borderColor="border"
            className="app-header"
            padding={"4em 1em 2em 1em"}
            style={{
              width: "100%",
            }}
          >
            <Flex justify="space-between" align="center">
              <Box>
                <Heading as="h1" size="md" m={0}>
                  {workflow.name}
                </Heading>
                {workflow.description && (
                  <Text mt={2} fontSize="sm" opacity={0.5}>
                    {workflow.description}
                  </Text>
                )}
              </Box>
              <ColorModeButton />
            </Flex>
          </Box>
        )}

        <Box flex={1} overflow="hidden" position="relative">
          {loading && (
            <Box
              position="absolute"
              top="50%"
              left="50%"
              transform="translate(-50%, -50%)"
            >
              <Text>Loading...</Text>
            </Box>
          )}

          {error && (
            <Box color="error" p={4} m={4} bg="secondary" borderRadius="md">
              Error: {error}
            </Box>
          )}

          {workflow &&
            !loading &&
            !error &&
            (workflow.settings?.run_mode === "chat" ? (
              <Box h="100%" className="chat-interface-container">
                <ChatInterface workflowId={workflow.id} token="local_token" />
              </Box>
            ) : (
              <Box h="100%" className="mini-app-container">
                <MiniApp
                  workflowId={workflow.id}
                  schema={workflow.input_schema}
                />
              </Box>
            ))}
        </Box>
      </Flex>
    </div>
  );
};
