import React, { useState } from "react";
import {
  Box,
  VStack,
  Button,
  Text,
  Container,
  Spinner,
  HStack,
  StackProps,
} from "@chakra-ui/react";
import { ProgressRoot, ProgressValueText, ProgressBar } from "./ui/progress";
import { useWorkflowRunner } from "../stores/WorkflowRunner";
import { JSONSchema } from "../types/workflow";
import { ImageDisplay } from "./ImageDisplay";
import { AudioPlayer } from "./AudioPlayer";
import { VideoPlayer } from "./VideoPlayer";
import { SchemaInput } from "./SchemaInput";
import { Alert } from "./ui/alert";
import Markdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";

interface MiniAppProps {
  workflowId: string;
  schema: JSONSchema;
  className?: string;
}

export const MiniApp: React.FC<MiniAppProps> = ({
  workflowId,
  schema,
  className,
}) => {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [showThoughts, setShowThoughts] = useState(false);
  const {
    run,
    state,
    results,
    progress,
    notifications,
    statusMessage,
    chunks,
  } = useWorkflowRunner();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(workflowId, formData);
  };

  const handleInputChange = (name: string, value: any) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const renderInput = (name: string, schema: JSONSchema) => {
    return (
      <SchemaInput
        name={name}
        schema={schema}
        value={formData[name]}
        onChange={(value) => handleInputChange(name, value)}
      />
    );
  };

  const renderResult = (result: any) => {
    if (typeof result === "object" && result !== null) {
      if (result.type === "image") {
        return <ImageDisplay data={result.uri || result.data} />;
      } else if (result.type === "audio") {
        return <AudioPlayer data={result.uri || result.data} />;
      } else if (result.type === "video") {
        return <VideoPlayer data={result.uri || result.data} />;
      }
    }
    if (typeof result === "string") {
      const hasThoughts = result.includes("<think>");

      // Remove think tags when hidden
      const processedText = showThoughts
        ? result
        : result.replace(/<think>.*?<\/think>/gs, "");

      return (
        <Box>
          {hasThoughts && (
            <Button
              size="sm"
              mb={2}
              onClick={() => setShowThoughts(!showThoughts)}
              variant="outline"
              colorScheme="blue"
            >
              {showThoughts ? "Hide Thoughts" : "Show Thoughts"}
            </Button>
          )}
          <div style={{ margin: 0 }}>
            <Markdown
              components={{
                ul: ({ children }) => (
                  <ul style={{ paddingLeft: "2em" }}>{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol style={{ paddingLeft: "2em" }}>{children}</ol>
                ),
              }}
            >
              {processedText}
            </Markdown>
          </div>
        </Box>
      );
    }
    return <pre>{JSON.stringify(result, null, 2)}</pre>;
  };

  return (
    <Box
      className={className ? `mini-app-root ${className}` : "mini-app-root"}
      bg="bg"
      color="text"
    >
      <Container maxW="800px" py={8}>
        {state === "connecting" || state === "running" ? (
          <VStack gap={4} align="center">
            <Spinner size="xl" color="primary" />
            <Text color="textGray">{statusMessage}</Text>
          </VStack>
        ) : (
          <VStack as="form" onSubmit={handleSubmit} gap={6}>
            <Box p={4} bg="secondary" borderRadius="md" w="full">
              <SchemaInput
                name="input"
                schema={schema}
                value={formData}
                onChange={setFormData}
              />
              <Button
                type="submit"
                colorScheme="primary"
                w="full"
                size="lg"
                borderRadius="md"
                boxShadow="md"
                _hover={{
                  boxShadow: "lg",
                }}
                _active={{
                  boxShadow: "md",
                }}
              >
                Run
              </Button>
            </Box>

            {notifications.length > 0 && (
              <VStack mt={4} gap={2}>
                <AnimatePresence>
                  {notifications.map((notification, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.2 }}
                      style={{ width: "100%" }}
                    >
                      <Alert bg="alertBg" borderColor="border">
                        {notification.content}
                      </Alert>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </VStack>
            )}

            <Box mt={4}>
              {chunks.length > 0 && (
                <Text fontSize="sm" color="textGray">
                  {chunks.join("\n")}
                </Text>
              )}
            </Box>

            {results.length > 0 && (
              <VStack mt={4} gap={4}>
                {results.map((result, index) => (
                  <Box
                    key={index}
                    p={4}
                    bg="secondary"
                    borderRadius="md"
                    w="full"
                  >
                    {renderResult(result)}
                  </Box>
                ))}
              </VStack>
            )}
          </VStack>
        )}
      </Container>
    </Box>
  );
};
