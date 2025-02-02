import React, { useState } from "react";
import { VStack, Box, Text, Input, HStack } from "@chakra-ui/react";

// Import all custom UI components
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { CloseButton } from "./ui/close-button";
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
import { SelectRoot, SelectTrigger, SelectContent } from "./ui/select";
import { Slider } from "./ui/slider";
import { ToggleTip, InfoTip } from "./ui/toggle-tip";
import { Tooltip } from "./ui/tooltip";

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

export function ComponentTest() {
  const [audioData, setAudioData] = useState<Uint8Array | null>(null);
  const [imageData, setImageData] = useState<Uint8Array | null>(null);
  const [videoData, setVideoData] = useState<Uint8Array | null>(null);

  // Updated schema structure to match SchemaInput expectations
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
      // Add a boolean example
      toggle: {
        type: "boolean",
        title: "Toggle Input",
        description: "Toggle this option",
      },
    },
  };

  return (
    <VStack
      gap={8}
      p={8}
      align="stretch"
      maxW="1200px"
      mx="auto"
      height="100%"
      overflowY="scroll"
    >
      <HStack justify="space-between" align="center">
        <Text fontSize="2xl" fontWeight="bold">
          Custom Components Demo
        </Text>
        <ColorModeButton />
      </HStack>

      <Section title="Basic Components">
        <VStack align="stretch" gap={4}>
          <Alert status="info" title="Alert Component">
            This is a custom alert component
          </Alert>

          <Field label="Input Field">
            <Input placeholder="Enter text" />
          </Field>

          <InputGroup>
            <Input placeholder="Input with group" />
          </InputGroup>

          <Checkbox>Checkbox Example</Checkbox>

          <RadioGroup>
            <HStack>
              <Radio value="1">Option 1</Radio>
              <Radio value="2">Option 2</Radio>
            </HStack>
          </RadioGroup>

          <Slider
            defaultValue={[50]}
            min={0}
            max={100}
            label="Slider"
            showValue
          />

          <ProgressRoot value={75}>
            <ProgressBar />
          </ProgressRoot>
        </VStack>
      </Section>

      <Section title="Interactive Components">
        <VStack align="stretch" gap={4}>
          <HStack>
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

          <HStack>
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
        <FileUploadRoot>
          <FileUploadDropzone
            label="Drop files here"
            description="or click to select"
          />
          <FileUploadList showSize clearable />
        </FileUploadRoot>
      </Section>

      <Section title="Media Components">
        <VStack align="stretch" gap={4}>
          <Box>
            <Text mb={2}>Audio Input/Player</Text>
            <AudioInput onChange={(data) => setAudioData(data?.data || null)} />
            {audioData && <AudioPlayer data={audioData} />}
          </Box>

          <Box>
            <Text mb={2}>Image Input/Display</Text>
            <ImageInput onChange={(data) => setImageData(data?.data || null)} />
            {imageData && <ImageDisplay data={imageData} />}
          </Box>

          <Box>
            <Text mb={2}>Video Input/Player</Text>
            <VideoInput onChange={(data) => setVideoData(data?.data || null)} />
            {videoData && <VideoPlayer data={videoData} />}
          </Box>

          <Box>
            <Text mb={2}>Document Input</Text>
            <DocumentInput onChange={() => {}} />
          </Box>
        </VStack>
      </Section>

      <Section title="Form Components">
        <VStack align="stretch" gap={4}>
          <SchemaInput
            name="demo-schema"
            schema={sampleSchema}
            value={{}}
            onChange={console.log}
          />
        </VStack>
      </Section>

      <Section title="Chat Components">
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
      <Text fontSize="lg" fontWeight="semibold" mb={4}>
        {title}
      </Text>
      {children}
    </Box>
  );
}
