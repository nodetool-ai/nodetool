import React, { useEffect } from "react";
import { WindowControls } from "./WindowControls";
import { JSONSchema, Workflow } from "../types/workflow";
import { Box, Heading, Text, Flex } from "@chakra-ui/react";
import ChatInterface from "./ChatInterface";
import { MiniApp } from "./MiniApp";

declare global {
  interface Window {
    api: {
      onWorkflow: (listener: (workflow: Workflow) => void) => void;
    };
    windowControls: {
      close: () => void;
      minimize: () => void;
      maximize: () => void;
    };
    process: {
      type: string;
      platform: string;
      versions: {
        node: string;
        electron: string;
        chrome: string;
      };
    };
    electron: {
      ipcRenderer: {
        send: (channel: string, ...args: any[]) => void;
        on: (channel: string, listener: (...args: any[]) => void) => void;
        invoke: (channel: string, ...args: any[]) => Promise<any>;
      };
    };
  }
}
interface AppProps {
  initialWorkflowId?: string;
}

/**
 * Checks if the workflow is a chat-based workflow
 * @param {JSONSchema} schema - The input schema to check
 * @returns {boolean} Whether this is a chat workflow
 */
function isChatWorkflow(schema: JSONSchema) {
  const firstProperty = Object.entries(schema.properties || {})[0];
  return firstProperty && firstProperty[1].format === "chat";
}

export const App: React.FC<AppProps> = ({ initialWorkflowId }) => {
  const [workflow, setWorkflow] = React.useState<Workflow | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

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

    // Listen for workflow updates from the main process
    window.api?.onWorkflow((newWorkflow: Workflow) => {
      setWorkflow(newWorkflow);
      setError(null);
    });
  }, [initialWorkflowId]);

  return (
    <Flex
      h="100vh"
      direction="column"
      bg="var(--bg-color)"
      color="var(--text-color)"
      className="app"
    >
      <WindowControls />

      {workflow && (
        <Box
          p={4}
          bg="var(--secondary-color)"
          borderBottom="1px solid"
          borderColor="var(--border-color)"
        >
          <Heading as="h1" size="md" m={0}>
            {workflow.name}
          </Heading>
          {workflow.description && (
            <Text mt={2} fontSize="sm" opacity={0.5}>
              {workflow.description}
            </Text>
          )}
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
            <div className="futuristic-loader">Loading...</div>
          </Box>
        )}

        {error && (
          <Box
            color="#ff6b6b"
            p={4}
            m={4}
            bg="var(--secondary-color)"
            borderRadius="md"
          >
            Error: {error}
          </Box>
        )}

        {workflow &&
          !loading &&
          !error &&
          (isChatWorkflow(workflow.input_schema) ? (
            <ChatInterface workflowId={workflow.id} token="local_token" />
          ) : (
            <MiniApp workflowId={workflow.id} schema={workflow.input_schema} />
          ))}
      </Box>
    </Flex>
  );
};
