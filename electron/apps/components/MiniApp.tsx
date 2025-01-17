import React, { useState } from "react";
import {
  Box,
  VStack,
  Button,
  Text,
  Container,
  Spinner,
  HStack,
} from "@chakra-ui/react";
import { ProgressRoot, ProgressValueText, ProgressBar } from "./ui/progress";
import { useWorkflowRunner } from "../stores/WorkflowRunner";
import { JSONSchema } from "../types/workflow";
import { ImageDisplay } from "./ImageDisplay";
import { AudioPlayer } from "./AudioPlayer";
import { VideoPlayer } from "./VideoPlayer";
import { SchemaInput } from "./SchemaInput";
import { Alert } from "./ui/alert";

interface MiniAppProps {
  workflowId: string;
  schema: JSONSchema;
}

export const MiniApp: React.FC<MiniAppProps> = ({ workflowId, schema }) => {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const { run, state, results, progress, notifications, statusMessage } =
    useWorkflowRunner();

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
    return <pre>{JSON.stringify(result, null, 2)}</pre>;
  };

  return (
    <Box position="relative" h="100%">
      {state !== "idle" && (
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bg="white"
          _dark={{ bg: "gray.800" }}
          borderBottom="1px"
          borderColor="gray.200"
          zIndex={1}
          py={2}
        >
          <Container maxW="container.xl">
            <HStack justify="center">
              {(state === "connecting" || state === "running") && (
                <Spinner size="sm" color="blue.500" />
              )}
              <Text
                color={state === "error" ? "red.500" : "gray.600"}
                _dark={{ color: state === "error" ? "red.300" : "gray.400" }}
              >
                {state === "connecting" && (statusMessage || "Connecting...")}
                {state === "connected" && (statusMessage || "Connected")}
                {state === "running" &&
                  (statusMessage || "Running workflow...")}
                {state === "error" && (statusMessage || "An error occurred")}
              </Text>

              {progress && (
                <ProgressRoot
                  value={(progress.current * 100.0) / progress.total}
                  size="xs"
                  colorScheme="blue"
                >
                  <ProgressBar />
                  <ProgressValueText>
                    {progress.current} / {progress.total}
                  </ProgressValueText>
                </ProgressRoot>
              )}
            </HStack>
          </Container>
        </Box>
      )}

      <Container
        maxW="container.xl"
        h="100%"
        overflowY="auto"
        py={5}
        pt={state !== "idle" ? 16 : 5}
      >
        {state !== "running" && state !== "connecting" && (
          <VStack as="form" onSubmit={handleSubmit}>
            {Object.entries(schema.properties || {}).map(([name, propSchema]) =>
              renderInput(name, propSchema as JSONSchema)
            )}
            <Button
              type="submit"
              colorScheme="blue"
              w="full"
              size="lg"
              borderRadius="md"
              boxShadow="md"
              _hover={{
                transform: "translateY(-2px)",
                boxShadow: "lg",
              }}
              _active={{
                transform: "translateY(0)",
                boxShadow: "md",
              }}
            >
              Run
            </Button>
          </VStack>
        )}

        {notifications.length > 0 && (
          <VStack mt={4}>
            {notifications.map((notification, index) => (
              <Alert key={index} variant="subtle">
                {notification.content}
              </Alert>
            ))}
          </VStack>
        )}

        {results.length > 0 && (
          <VStack mt={4}>
            {results.map((result, index) => (
              <Box
                key={index}
                p={4}
                bg="gray.50"
                _dark={{ bg: "gray.700" }}
                borderRadius="md"
                w="full"
              >
                {renderResult(result)}
              </Box>
            ))}
          </VStack>
        )}
      </Container>
    </Box>
  );
};
