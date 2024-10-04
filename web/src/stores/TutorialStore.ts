import { create } from "zustand";
import { useChatStore } from "./ChatStore";
import { uuidv4 } from "./uuidv4";
import { Edge, Node } from "@xyflow/react";
import { NodeData } from "./NodeData";
import { LlamaModel } from "./ApiTypes";
import { CachedModel } from "./ApiTypes";

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
  huggingfaceModels: CachedModel[];
  llamaModels: LlamaModel[];
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

const downloadHuggingFaceModelStep = (
  repo_id: string,
  stepDescription: string
): TutorialStep => ({
  step: stepDescription,
  isCompleted: (context: TutorialContext) =>
    context.huggingfaceModels.some((model) => model.repo_id === repo_id)
});

const downloadLlamaModelStep = (
  model_name: string,
  stepDescription: string
): TutorialStep => ({
  step: stepDescription,
  isCompleted: (context: TutorialContext) =>
    context.llamaModels.some((model) => model.repo_id === model_name)
});

// Updated tutorial definitions
export const tutorials: Record<string, TutorialStep[]> = {
  "Welcome to Nodetool": [
    addNodeStep(
      "nodetool.constant.Float",
      "Double-click on the canvas to open the Node menu. Add a 'Nodetool → Constant → Float' node."
    ),
    configureNodeStep(
      "nodetool.constant.Float",
      (properties) => properties.value !== 0.0,
      "Configure the Float node: Enter a non-zero value in the 'value' field."
    ),
    connectNodesStep(
      "nodetool.constant.Float",
      "nodetool.workflows.base_node.Preview",
      "Drag a connection from the Float node's output handle and release it on the canvas. Select 'Create Preview Node' from the menu that appears."
    ),
    {
      step: "Click the 'Run' button (▶️) in the top toolbar and wait for the workflow to complete.",
      isCompleted: (context: TutorialContext) =>
        context.workflowState === "running"
    },
    {
      step: "Congratulations! 🎉 You've completed the introductory tutorial.",
      isCompleted: () => false
    }
  ],
  "Create Your First AI Image": [
    {
      step: "Click the '📄 New' button on the toolbar to start with a clean canvas.",
      isCompleted: (context: TutorialContext) => context.nodes.length === 0
    },
    addNodeStep(
      "huggingface.text_to_image.StableDiffusion",
      "Double-click the canvas or click the '⭕️ Nodes' button. Search for 'StableDiffusion' in the 'Huggingface → Text To Image' category (not Comfy) and place the node on the canvas."
    ),
    downloadHuggingFaceModelStep(
      "Yntec/realistic-vision-v13",
      "Click on `Recommended Models` and download the 'Yntec/realistic-vision-v13' model."
    ),
    configureNodeStep(
      "huggingface.text_to_image.StableDiffusion",
      (properties) => properties.model.repo_id === "Yntec/realistic-vision-v13",
      "Change the model to 'Yntec/realistic-vision-v13' in the StableDiffusion node."
    ),
    configureNodeStep(
      "huggingface.text_to_image.StableDiffusion",
      (properties) => properties.prompt !== "",
      "Configure the StableDiffusion node: Enter a prompt describing your desired image and leave other settings at their defaults."
    ),
    connectNodesStep(
      "huggingface.text_to_image.StableDiffusion",
      "nodetool.workflows.base_node.Preview",
      "Drag the StableDiffusion node's blue output handle to the canvas and select 'Create Preview Node' from the menu that appears."
    ),
    {
      step: "Click the 'Run' button (▶️) in the top toolbar and wait for the workflow to complete.",
      isCompleted: (context: TutorialContext) =>
        context.workflowState === "running"
    },
    {
      step: "Check for the completion notification. Resize the Preview node as needed and double-click the image to enlarge. Congratulations! 🎉 You've created your first AI-generated image!",
      isCompleted: () => false
    }
  ],
  "Video Transformation Basics": [
    {
      step: "Click the '📄 New' button on the toolbar to start with a clean canvas.",
      isCompleted: (context: TutorialContext) => context.nodes.length === 0
    },
    addNodeStep(
      "nodetool.constant.Video",
      "Add a 'Nodetool → Constant → Video' node. Choose a short video file when prompted."
    ),
    addNodeStep(
      "nodetool.video.ExtractFrames",
      "Add an 'Nodetool → Video → Transform → ExtractFrames' node."
    ),
    connectNodesStep(
      "nodetool.constant.Video",
      "nodetool.video.ExtractFrames",
      "Connect the Video node's output to the ExtractFrames node's input."
    ),
    addNodeStep("nodetool.group.Loop", "Add a 'Nodetool → Group → Loop' node."),
    connectNodesStep(
      "nodetool.video.ExtractFrames",
      "nodetool.group.Loop",
      "Connect the ExtractFrames node's output to the Loop node's input."
    ),
    addNodeStep(
      "nodetool.image.transform.Posterize",
      "Inside the Loop: Add a 'Nodetool → Image → Transform → Posterize' node."
    ),
    configureNodeStep(
      "nodetool.image.transform.Posterize",
      (properties) => properties.bits === 2,
      "Set the 'bits' parameter to 2 in the Posterize node."
    ),
    connectNodesStep(
      "nodetool.group.Loop",
      "nodetool.image.transform.Posterize",
      "Connect the GroupInput to the Posterize node's input."
    ),
    connectNodesStep(
      "nodetool.image.transform.Posterize",
      "nodetool.group.Loop",
      "Connect the Posterize node's output to the GroupOutput."
    ),
    addNodeStep(
      "nodetool.video.transform.CreateVideo",
      "Add a 'Nodetool → Video → Transform → CreateVideo' node."
    ),
    configureNodeStep(
      "nodetool.video.transform.CreateVideo",
      (properties) => properties.fps === 5.0,
      "Set the 'FPS' parameter to 5.0 in the CreateVideo node."
    ),
    connectNodesStep(
      "nodetool.group.Loop",
      "nodetool.video.transform.CreateVideo",
      "Connect the Loop node's output to the CreateVideo node's input."
    ),
    connectNodesStep(
      "nodetool.video.transform.CreateVideo",
      "nodetool.workflows.base_node.Preview",
      "Add a 'Preview' node and connect it to the CreateVideo node's output."
    ),
    {
      step: "Click the 'Run' button (▶️) in the top toolbar to process the video. Wait for completion and check the Preview node for the result. Congratulations! 🎉 You've created your first video processing workflow!",
      isCompleted: (context: TutorialContext) => false
    }
  ],
  "Text-to-Speech Workflow": [
    {
      step: "Click the 'New' button (📄) on the toolbar to start with a clean canvas.",
      isCompleted: (context: TutorialContext) => context.nodes.length === 0
    },
    addNodeStep(
      "nodetool.constant.String",
      "Add a 'Nodetool → Constant → String' node (📝)."
    ),
    configureNodeStep(
      "nodetool.constant.String",
      (properties) => properties.value !== "",
      "Enter some text in the String node's 'value' field."
    ),
    addNodeStep(
      "huggingface.text_to_speech.TextToSpeech",
      "Add a 'Huggingface → Text To Speech → TextToSpeech' node (🗣️)."
    ),
    connectNodesStep(
      "nodetool.constant.String",
      "huggingface.text_to_speech.TextToSpeech",
      "Connect the String node's output to the TextToSpeech node's input."
    ),
    addNodeStep(
      "nodetool.audio.transform.RemoveSilence",
      "Add a 'Nodetool → Audio → Transform → RemoveSilence' node (🔇)."
    ),
    connectNodesStep(
      "huggingface.text_to_speech.TextToSpeech",
      "nodetool.audio.transform.RemoveSilence",
      "Connect the TextToSpeech node's output to the RemoveSilence node's input."
    ),
    connectNodesStep(
      "nodetool.audio.transform.RemoveSilence",
      "nodetool.workflows.base_node.Preview",
      "Add a 'Preview' node (👁️) and connect it to the RemoveSilence node's output."
    ),
    {
      step: "Click the 'Run' button (▶️) in the top toolbar to process the audio. Wait for completion and check the Preview node to listen to the result. Congratulations! 🎉 You've created your first text-to-speech and audio manipulation workflow!",
      isCompleted: () => false
    }
  ],
  "Image Editing with ControlNet": [
    {
      step: "Drop an image onto the Nodetool canvas to create an image node (🖼️).",
      isCompleted: (context: TutorialContext) =>
        hasNodeOfType(context.nodes, "nodetool.constant.Image")
    },
    addNodeStep(
      "nodetool.image.transform.Canny",
      "Add a 'Nodetool → Image → Analysis → Canny' node (🔍)."
    ),
    connectNodesStep(
      "nodetool.constant.Image",
      "nodetool.image.transform.Canny",
      "Connect the Constant Image node's output to the Canny node's input."
    ),
    addNodeStep(
      "huggingface.image_to_image.StableDiffusionControlNet",
      "Add a 'Huggingface → Text To Image → StableDiffusionControlNet' node (🎨)."
    ),
    connectNodesStep(
      "nodetool.image.transform.Canny",
      "huggingface.image_to_image.StableDiffusionControlNet",
      "Connect the Canny node's output to the StableDiffusionControlNet node's 'control_image' input."
    ),
    configureNodeStep(
      "huggingface.image_to_image.StableDiffusionControlNet",
      (properties) =>
        properties.controlnet_model === "lllyasviel/sd-controlnet-canny",
      "Set the Controlnet Model to 'lllyasviel/sd-controlnet-canny' in the StableDiffusionControlNet node."
    ),
    configureNodeStep(
      "huggingface.image_to_image.StableDiffusionControlNet",
      (properties) => properties.prompt !== "",
      "Enter a prompt describing the desired image transformation in the StableDiffusionControlNet node."
    ),
    connectNodesStep(
      "huggingface.image_to_image.StableDiffusionControlNet",
      "nodetool.workflows.base_node.Preview",
      "Add a 'Preview' node (👁️) and connect it to the StableDiffusionControlNet node's output."
    ),
    {
      step: "Click the 'Run' button (▶️) in the top toolbar to process the image. Wait for completion and check the Preview node for the result. Congratulations! 🎉 You've created your first image-to-image transformation with ControlNet!",
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
