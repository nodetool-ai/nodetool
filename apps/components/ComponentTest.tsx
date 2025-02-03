import React, { useEffect, useState } from "react";
import {
  VStack,
  Box,
  Text,
  Input,
  HStack,
  Container,
  createSystem,
} from "@chakra-ui/react";
import { useTheme } from "next-themes";

// Import all custom UI components
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { ColorModeButton } from "./ui/color-mode";
import { DialogContent, DialogRoot, DialogTrigger } from "./ui/dialog";
import { DrawerContent, DrawerRoot, DrawerTrigger } from "./ui/drawer";
import { Field } from "./ui/field";
import {
  FileUploadRoot,
  FileUploadDropzone,
  FileUploadList,
} from "./ui/file-upload";
import { InputGroup } from "./ui/input-group";
import { PopoverContent, PopoverRoot, PopoverTrigger } from "./ui/popover";
import { ProgressBar, ProgressRoot } from "./ui/progress";
import { Radio, RadioGroup } from "./ui/radio";
import { Slider } from "./ui/slider";
import { ToggleTip, InfoTip } from "./ui/toggle-tip";
import { Tooltip } from "./ui/tooltip";
// import { SelectRoot, SelectTrigger, SelectContent } from "./ui/select";

// Import media components
import AudioInput from "./AudioInput";
import { AudioPlayer } from "./AudioPlayer";
import { ImageDisplay } from "./ImageDisplay";
import ImageInput from "./ImageInput";
import VideoInput from "./VideoInput";
import { VideoPlayer } from "./VideoPlayer";
import DocumentInput from "./DocumentInput";
import { SchemaInput } from "./SchemaInput";
import { Composer } from "./Composer";
import { Provider } from "./ui/provider";
import apps_theme from "../styles/theme/apps_theme";
import ChatInterface from "./ChatInterface";

// Sample schema for SchemaInput
const sampleSchema = {
  type: "object",
  properties: {
    text: {
      type: "string",
      title: "Text Input",
      description: "Enter some text",
    },
    number: {
      type: "number",
      title: "Number Input",
      description: "Enter a number",
      minimum: 0,
      maximum: 100,
    },
    choice: {
      type: "string",
      title: "Select Input",
      description: "Choose an option",
      enum: ["option1", "option2", "option3"],
    },
    toggle: {
      type: "boolean",
      title: "Toggle Input",
      description: "Toggle this option",
    },
  },
};

interface ComponentTestProps {
  className?: string;
}

export function ComponentTest({ className }: ComponentTestProps) {
  const { theme, resolvedTheme } = useTheme();
  const displayTheme = resolvedTheme || theme || "light";
  console.log("theme", displayTheme);

  const [audioData, setAudioData] = useState<Uint8Array | null>(null);
  const [imageData, setImageData] = useState<Uint8Array | null>(null);
  const [videoData, setVideoData] = useState<Uint8Array | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }
  return (
    <Box
      className={
        className ? `component-test-root ${className}` : "component-test-root"
      }
      height="100vh"
      overflow="hidden"
      bg="bg"
      maxW="2xl"
    >
      <Container
        maxW="container.xl"
        py={8}
        height="100%"
        overflow="hidden"
        display="flex"
        flexDirection="column"
        color="text"
      >
        <HStack justify="space-between" align="center" mb={4}>
          <Text fontSize="2xl" fontWeight="normal">
            Custom Components Demo
          </Text>
          <ColorModeButton />
        </HStack>

        <Box mb={4}>
          <VStack align="start" gap={1} color="textGray">
            <Text>Current color mode: {displayTheme}</Text>
          </VStack>
        </Box>

        <Box
          flex="1"
          overflow="auto"
          paddingRight="4"
          css={{
            scrollbarWidth: "thin",
            scrollbarColor:
              "var(--chakra-colors-gray-400) var(--chakra-colors-gray-200)",
            "&::-webkit-scrollbar": {
              width: "8px",
            },
            "&::-webkit-scrollbar-track": {
              background: "var(--chakra-colors-gray-200)",
              borderRadius: "2px",
            },
            "&::-webkit-scrollbar-thumb": {
              background: "var(--chakra-colors-gray-400)",
              borderRadius: "2px",
            },
            "&::-webkit-scrollbar-thumb:hover": {
              background: "var(--chakra-colors-gray-500)",
            },
          }}
        >
          <VStack gap={8} align="stretch">
            <Section title="Basic Components">
              <VStack align="stretch" gap={4}>
                <Alert
                  status="info"
                  title="Alert Component"
                  bg="success"
                  color="bg"
                  borderColor="border"
                >
                  This is a custom alert component with a custom bg color
                </Alert>

                <Field label="Input Field">
                  <Input
                    placeholder="Enter text"
                    bg="inputBg"
                    color="gray800"
                    borderColor="border"
                    _hover={{ borderColor: "primary" }}
                    _focus={{
                      borderColor: "primary",
                      boxShadow: "0 0 0 2px var(--nt-colors-primary-alpha)",
                    }}
                  />
                </Field>

                <InputGroup>
                  <Input
                    placeholder="Input with group"
                    bg="inputBg"
                    borderColor="border"
                    _hover={{ borderColor: "primary" }}
                    _focus={{
                      borderColor: "primary",
                      boxShadow: "0 0 0 2px var(--nt-colors-primary-alpha)",
                    }}
                  />
                </InputGroup>

                <Checkbox>Checkbox Example</Checkbox>

                <RadioGroup>
                  <HStack gap={4}>
                    <Radio value="1">Option 1</Radio>
                    <Radio value="2">Option 2</Radio>
                  </HStack>
                </RadioGroup>

                <Slider
                  defaultValue={[50]}
                  min={0}
                  max={100}
                  label="Slider"
                  colorScheme="white"
                  showValue
                />

                <ProgressRoot value={75}>
                  <ProgressBar />
                </ProgressRoot>
              </VStack>
            </Section>

            <Section title="Interactive Components">
              <VStack align="stretch" gap={4}>
                <HStack gap={4}>
                  <DialogRoot>
                    <DialogTrigger asChild>
                      <Button>Open Dialog</Button>
                    </DialogTrigger>
                    <DialogContent>Dialog Content</DialogContent>
                  </DialogRoot>

                  <DrawerRoot>
                    <DrawerTrigger asChild>
                      <Button>Open Drawer</Button>
                    </DrawerTrigger>
                    <DrawerContent>Drawer Content</DrawerContent>
                  </DrawerRoot>

                  <PopoverRoot>
                    <PopoverTrigger asChild>
                      <Button>Open Popover</Button>
                    </PopoverTrigger>
                    <PopoverContent>Popover Content</PopoverContent>
                  </PopoverRoot>
                </HStack>

                <HStack gap={4}>
                  <Tooltip content="Regular tooltip">
                    <Button>Hover me</Button>
                  </Tooltip>
                  <ToggleTip content="Toggle tooltip">
                    <Button>Click me</Button>
                  </ToggleTip>
                  <InfoTip>Info tooltip</InfoTip>
                </HStack>
              </VStack>
            </Section>

            <Section title="File Upload">
              <Box p={4} borderRadius="md" borderWidth="1px" boxShadow="card">
                <FileUploadRoot>
                  <FileUploadDropzone
                    label="Drop files here"
                    description="or click to select"
                  />
                  <FileUploadList />
                </FileUploadRoot>
              </Box>
            </Section>

            <Section title="Media Components">
              <VStack align="stretch" gap={4}>
                <Box>
                  <Text mb={2}>Audio Input/Player</Text>
                  <AudioInput
                    onChange={(data) => setAudioData(data?.data || null)}
                  />
                  {audioData && <AudioPlayer data={audioData} />}
                </Box>

                <Box>
                  <Text mb={2}>Image Input/Display</Text>
                  <ImageInput
                    onChange={(data) => setImageData(data?.data || null)}
                  />
                  {imageData && <ImageDisplay data={imageData} />}
                </Box>

                <Box>
                  <Text mb={2}>Video Input/Player</Text>
                  <VideoInput
                    onChange={(data) => setVideoData(data?.data || null)}
                  />
                  {videoData && <VideoPlayer data={videoData} />}
                </Box>

                <Box>
                  <Text mb={2}>Document Input</Text>
                  <DocumentInput onChange={() => {}} />
                </Box>
              </VStack>
            </Section>

            <Section title="Form Components">
              <Box p={4} borderRadius="md" borderWidth="1px">
                <SchemaInput
                  name="demo-schema"
                  schema={sampleSchema}
                  value={{}}
                  onChange={console.log}
                />
              </Box>
            </Section>

            <Section title="Composer">
              <Box p={4} borderWidth="1px" borderRadius="md">
                <Composer
                  onSubmit={console.log}
                  disabled={false}
                  droppedFiles={[]}
                  setDroppedFiles={console.log}
                />
              </Box>
            </Section>
          </VStack>
        </Box>
      </Container>
    </Box>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <Text fontSize="lg" fontWeight="normal" mb={4} color="text">
        {title}
      </Text>
      {children}
    </Box>
  );
}
