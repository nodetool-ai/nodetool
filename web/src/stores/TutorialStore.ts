import { create } from "zustand";
import { useChatStore } from "./ChatStore";
import { uuidv4 } from "./uuidv4";
import { Node } from "@xyflow/react";
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
}

interface TutorialStep {
  step: string;
  isCompleted: (context: TutorialContext) => boolean;
}
const tutorials: Record<string, TutorialStep[]> = {
  welcome: [
    {
      step: "Double click on the Node editor to open the Node menu. Add a 'nodetool.constant.Float' node.",
      isCompleted: (context: TutorialContext) => {
        return context.nodes.some(
          (node) => node.type === "nodetool.constant.Float"
        );
      }
    },
    {
      step: "Drag a connection from the float node and let it drop. Select PreviewNode in the menu.",
      isCompleted: (context: TutorialContext) => {
        return context.nodes.some(
          (node) => node.type === "nodetool.workflows.base_node.Preview"
        );
      }
    },
    {
      step: "Congratulations! You've completed the tutorial.",
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
