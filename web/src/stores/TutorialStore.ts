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

// Tutorial definitions
export const tutorials: Record<string, TutorialStep[]> = {
  welcome: [
    addNodeStep(
      "nodetool.constant.Float",
      "Double click on the Node editor to open the Node menu. Add a 'nodetool.constant.Float' node."
    ),
    connectNodesStep(
      "nodetool.constant.Float",
      "nodetool.workflows.base_node.Preview",
      "Drag a connection from the float node and let it drop. Select PreviewNode in the menu."
    ),
    {
      step: "Congratulations! You've completed the tutorial.",
      isCompleted: () => false
    }
  ],
  image_generation: [
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
      step: "Click 'Run' at the bottom and wait for completion.",
      isCompleted: (context: TutorialContext) =>
        context.workflowState === "running"
    },
    {
      step: "Check for the completion notification. Resize the Preview node as needed and double-click the image to enlarge. Congratulations, you've created your first image!",
      isCompleted: () => false
    }
  ],
  video_processing: [
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
      step: "Click 'Run' at the bottom to process the video. Wait for completion and check the Preview node for the result. Congratulations, you've created your first video processing workflow!",
      isCompleted: (context: TutorialContext) => false
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
        content: tutorials[tutorialName][0].step
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
        content: tutorials[tutorialName][currentStepIndex + 1].step
      }
    ]);
  },
  endTutorial: () =>
    set({ isInTutorial: false, currentTutorial: null, currentStepIndex: 0 })
}));
