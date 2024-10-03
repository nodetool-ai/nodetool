import { create } from "zustand";
import { useChatStore } from "./ChatStore";
import { uuidv4 } from "./uuidv4";
import { Edge, Node } from "@xyflow/react";
import { NodeData } from "./NodeData";

interface TutorialState {
  isInTutorial: boolean;
  currentTutorial: string | null;
  currentStepIndex: number;
  startTutorial: (tutorialName: string) => void;
  getStep: () => TutorialStep | null;
  nextStep: () => void;
  endTutorial: () => void;
}

interface TutorialContext {
  nodes: Node<NodeData>[];
  edges: Edge[];
  workflowState: string;
}

interface TutorialStep {
  step: string;
  isCompleted: (context: TutorialContext) => boolean | undefined;
}

// Helper functions
const hasNodeOfType = (nodes: Node<NodeData>[], type: string) =>
  nodes.some((node) => node.type === type);

const hasConnection = (
  edges: Edge[],
  sourceType: string,
  targetType: string,
  nodes: Node<NodeData>[]
) =>
  edges.some(
    (edge) =>
      nodes.find(
        (node) => node.type === sourceType && node.id === edge.source
      ) &&
      nodes.find((node) => node.type === targetType && node.id === edge.target)
  );

const getNodeByType = (nodes: Node<NodeData>[], type: string) =>
  nodes.find((node) => node.type === type);

// New helper functions for common tutorial steps
const addNodeStep = (
  nodeType: string,
  stepDescription: string
): TutorialStep => ({
  step: stepDescription,
  isCompleted: (context: TutorialContext) =>
    hasNodeOfType(context.nodes, nodeType)
});

const connectNodesStep = (
  sourceType: string,
  targetType: string,
  stepDescription: string
): TutorialStep => ({
  step: stepDescription,
  isCompleted: (context: TutorialContext) =>
    hasConnection(context.edges, sourceType, targetType, context.nodes)
});

const configureNodeStep = (
  nodeType: string,
  propertyCheck: (properties: any) => boolean,
  stepDescription: string
): TutorialStep => ({
  step: stepDescription,
  isCompleted: (context: TutorialContext) => {
    const node = getNodeByType(context.nodes, nodeType);
    return node ? propertyCheck(node.data?.properties) : false;
  }
});

// Updated tutorial definitions
export const tutorials: Record<string, TutorialStep[]> = {
  "Welcome to Nodetool": [
    addNodeStep(
      "nodetool.constant.Float",
      "Double click on the Node editor to open the Node menu. Add a 'nodetool.constant.Float' node."
    ),
    configureNodeStep(
      "nodetool.constant.Float",
      (properties) => properties.value !== 0.0,
      "Configure the Float node: Enter a value in the 'value' field."
    ),
    connectNodesStep(
      "nodetool.constant.Float",
      "nodetool.workflows.base_node.Preview",
      "Drag a connection from the float node and let it drop. Select PreviewNode in the menu."
    ),
    {
      step: "Click 'Run' at the top toolbar and wait for completion.",
      isCompleted: (context: TutorialContext) =>
        context.workflowState === "running"
    },
    {
      step: "Congratulations! You've completed the tutorial.",
      isCompleted: () => false
    }
  ],
  "Create Your First AI Image": [
    {
      step: "Click on 'New' on the toolbar.",
      isCompleted: (context: TutorialContext) => context.nodes.length === 0
    },
    addNodeStep(
      "huggingface.text_to_image.StableDiffusion",
      "Click 'Nodes' or double-click the canvas. Search for 'StableDiffusion' in the Huggingface / Text To Image (not Comfy) category and place the node on the canvas."
    ),
    configureNodeStep(
      "huggingface.text_to_image.StableDiffusion",
      (properties) => properties.prompt !== "",
      "Configure the StableDiffusion node: Enter a prompt describing the desired image, change the model to Yntec/realistic-vision-v13, and leave other settings at default."
    ),
    connectNodesStep(
      "huggingface.text_to_image.StableDiffusion",
      "nodetool.workflows.base_node.Preview",
      "Drag the StableDiffusion node's blue output handle to the canvas and select 'Create Preview Node' from the menu."
    ),
    {
      step: "Click 'Run' at the top toolbar and wait for completion.",
      isCompleted: (context: TutorialContext) =>
        context.workflowState === "running"
    },
    {
      step: "Check for the completion notification. Resize the Preview node as needed and double-click the image to enlarge. Congratulations, you've created your first image!",
      isCompleted: () => false
    }
  ],
  "Video Transformation Basics": [
    {
      step: "Click 'New' on the toolbar to start a fresh workflow.",
      isCompleted: (context: TutorialContext) => context.nodes.length === 0
    },
    addNodeStep(
      "nodetool.constant.Video",
      "Add a Video node from the Nodetool.Constant category. Choose a short video file."
    ),
    addNodeStep(
      "nodetool.video.ExtractFrames",
      "Add an ExtractFrames node from the Nodetool.Video.Transform category."
    ),
    connectNodesStep(
      "nodetool.constant.Video",
      "nodetool.video.ExtractFrames",
      "Connect the Video node to the ExtractFrames node."
    ),
    addNodeStep(
      "nodetool.group.Loop",
      "Add a Loop node from the Nodetool.Group category."
    ),
    connectNodesStep(
      "nodetool.video.ExtractFrames",
      "nodetool.group.Loop",
      "Connect the ExtractFrames node to the Loop node."
    ),
    addNodeStep(
      "nodetool.image.transform.Posterize",
      "Inside the Loop: Add a Posterize node from the Nodetool.Image category."
    ),
    configureNodeStep(
      "nodetool.image.transform.Posterize",
      (properties) => properties.bits === 2,
      "Set the 'bits' parameter to 2."
    ),
    connectNodesStep(
      "nodetool.group.Loop",
      "nodetool.image.transform.Posterize",
      "Connect the GroupInput to the Posterize node"
    ),
    connectNodesStep(
      "nodetool.image.transform.Posterize",
      "nodetool.group.Loop",
      "Connect the Posterize node to the GroupOutput"
    ),
    addNodeStep(
      "nodetool.video.transform.CreateVideo",
      "Add a CreateVideo node from the Nodetool.Video.Transform category."
    ),
    configureNodeStep(
      "nodetool.video.transform.CreateVideo",
      (properties) => properties.fps === 5.0,
      "Set the 'FPS' parameter to 5.0."
    ),
    connectNodesStep(
      "nodetool.group.Loop",
      "nodetool.video.transform.CreateVideo",
      "Connect the Loop node to the CreateVideo node."
    ),
    connectNodesStep(
      "nodetool.video.transform.CreateVideo",
      "nodetool.workflows.base_node.Preview",
      "Add a Preview node and connect it to the CreateVideo node."
    ),
    {
      step: "Click 'Run' at the top toolbar to process the video. Wait for completion and check the Preview node for the result. Congratulations, you've created your first video processing workflow!",
      isCompleted: (context: TutorialContext) => false
    }
  ],
  "Text-to-Speech Workflow": [
    {
      step: "Click 'New' on the toolbar to start a fresh workflow.",
      isCompleted: (context: TutorialContext) => context.nodes.length === 0
    },
    addNodeStep(
      "nodetool.constant.String",
      "Add a Constant String node from the Nodetool.Constant category."
    ),
    configureNodeStep(
      "nodetool.constant.String",
      (properties) => properties.value !== "",
      "Enter some text in the String node's 'value' field."
    ),
    addNodeStep(
      "huggingface.text_to_speech.TextToSpeech",
      "Add a TextToSpeech node from the Huggingface / Text To Speech category."
    ),
    connectNodesStep(
      "nodetool.constant.String",
      "huggingface.text_to_speech.TextToSpeech",
      "Connect the String node to the TextToSpeech node."
    ),
    addNodeStep(
      "nodetool.audio.transform.RemoveSilence",
      "Add a RemoveSilence node from the Nodetool.Audio.Transform category."
    ),
    connectNodesStep(
      "huggingface.text_to_speech.TextToSpeech",
      "nodetool.audio.transform.RemoveSilence",
      "Connect the TextToSpeech node to the RemoveSilence node."
    ),
    connectNodesStep(
      "nodetool.audio.transform.RemoveSilence",
      "nodetool.workflows.base_node.Preview",
      "Add a Preview node and connect it to the RemoveSilence node."
    ),
    {
      step: "Click 'Run' at the top toolbar to process the audio. Wait for completion and check the Preview node to listen to the result. Congratulations, you've created your first text-to-speech and audio manipulation workflow!",
      isCompleted: () => false
    }
  ],
  "Image Editing with ControlNet": [
    {
      step: "Drop an image onto the Nodetool canvas to create an image node.",
      isCompleted: (context: TutorialContext) =>
        hasNodeOfType(context.nodes, "nodetool.constant.Image")
    },
    addNodeStep(
      "nodetool.image.transform.Canny",
      "Add a Canny node from the Nodetool.Image.Analysis category."
    ),
    connectNodesStep(
      "nodetool.constant.Image",
      "nodetool.image.transform.Canny",
      "Connect the Constant Image node to the Canny node."
    ),
    addNodeStep(
      "huggingface.image_to_image.StableDiffusionControlNet",
      "Add a StableDiffusionControlNet node from the Huggingface / Text To Image category."
    ),
    connectNodesStep(
      "nodetool.image.transform.Canny",
      "huggingface.image_to_image.StableDiffusionControlNet",
      "Connect the Canny node's output to the StableDiffusionControlNet node's control_image input."
    ),
    configureNodeStep(
      "huggingface.image_to_image.StableDiffusionControlNet",
      (properties) =>
        properties.controlnet_model === "lllyasviel/sd-controlnet-canny",
      "Set the Controlnet Model to lllyasviel/sd-controlnet-canny in the StableDiffusionControlNet node."
    ),
    configureNodeStep(
      "huggingface.image_to_image.StableDiffusionControlNet",
      (properties) => properties.prompt !== "",
      "Enter a prompt describing the desired image transformation in the StableDiffusionControlNet node."
    ),
    connectNodesStep(
      "huggingface.image_to_image.StableDiffusionControlNet",
      "nodetool.workflows.base_node.Preview",
      "Add a Preview node and connect it to the StableDiffusionControlNet output."
    ),
    {
      step: "Click 'Run' at the top toolbar to process the image. Wait for completion and check the Preview node for the result. Congratulations, you've created your first image-to-image transformation with ControlNet!",
      isCompleted: () => false
    }
  ]
};

export const useTutorialStore = create<TutorialState>((set, get) => ({
  isInTutorial: false,
  currentTutorial: null,
  currentStepIndex: 0,
  getStep: () => {
    const { currentTutorial, currentStepIndex, isInTutorial } = get();
    if (!isInTutorial) return null;
    if (currentTutorial === null) return null;
    if (tutorials[currentTutorial] === undefined) return null;
    if (currentStepIndex >= tutorials[currentTutorial].length) return null;
    return tutorials[currentTutorial][currentStepIndex];
  },
  startTutorial: (tutorialName) => {
    set({
      isInTutorial: true,
      currentTutorial: tutorialName,
      currentStepIndex: 0
    });
    useChatStore.getState().addMessages([
      {
        id: uuidv4(),
        role: "assistant",
        content: tutorials[tutorialName][0].step,
        tool_calls: []
      }
    ]);
  },
  isCompleted: () => {
    const { currentTutorial } = get();
    if (currentTutorial === null) return false;
    return get().currentStepIndex >= tutorials[currentTutorial].length;
  },
  nextStep: () => {
    const currentStepIndex = get().currentStepIndex;
    set({ currentStepIndex: currentStepIndex + 1 });
    const tutorialName = get().currentTutorial;
    if (tutorialName === null) return;
    useChatStore.getState().addMessages([
      {
        id: uuidv4(),
        role: "assistant",
        content: tutorials[tutorialName][currentStepIndex + 1].step,
        tool_calls: []
      }
    ]);
  },
  endTutorial: () =>
    set({ isInTutorial: false, currentTutorial: null, currentStepIndex: 0 })
}));