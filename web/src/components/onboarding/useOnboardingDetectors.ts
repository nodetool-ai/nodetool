/**
 * Subscribes to existing Zustand stores and marks onboarding steps complete
 * when the user performs the corresponding action in the real UI.
 *
 * - providers : SecretsStore — any known provider key configured
 * - chat      : GlobalChatStore.messageCache — first user message in any thread
 * - image     : GlobalChatStore.messageCache + MediaGenerationStore.mode === "image*"
 * - nodes     : current workflow's NodeStore — node count increases
 * - connect   : current workflow's NodeStore — edge count increases
 * - run       : current workflow's WorkflowRunner.state — leaves "idle"
 *
 * The hook only auto-advances when the user is in the "action" phase of the
 * matching step; it still records completion in the background regardless,
 * so the launcher can show progress.
 */
import { useEffect, useRef } from "react";
import useSecretsStore from "../../stores/SecretsStore";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import useMediaGenerationStore from "../../stores/MediaGenerationStore";
import {
  useWorkflowManagerStore
} from "../../contexts/WorkflowManagerContext";
import type { WorkflowManagerState } from "../../stores/WorkflowManagerStore";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";
import {
  ONBOARDING_STEP_ORDER,
  useOnboardingStore,
  type OnboardingStepId
} from "../../stores/OnboardingStore";

const PROVIDER_KEYS = new Set([
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENROUTER_API_KEY",
  "HF_TOKEN",
  "HUGGINGFACE_API_KEY"
]);

const IMAGE_MODES = new Set(["image", "image_edit"]);

const totalUserMessages = (
  cache: Record<string, { role?: string }[]>
): number => {
  let total = 0;
  for (const messages of Object.values(cache)) {
    for (const m of messages) {
      if (m && (m as { role?: string }).role === "user") total += 1;
    }
  }
  return total;
};

const sumNodeCount = (state: WorkflowManagerState): number => {
  let total = 0;
  const stores = state.nodeStores as
    | Record<string, { getState: () => { nodes: unknown[] } }>
    | undefined;
  if (!stores) return 0;
  for (const id of Object.keys(stores)) {
    const s = stores[id];
    if (s && typeof s.getState === "function") {
      total += s.getState().nodes?.length ?? 0;
    }
  }
  return total;
};

const sumEdgeCount = (state: WorkflowManagerState): number => {
  let total = 0;
  const stores = state.nodeStores as
    | Record<string, { getState: () => { edges: unknown[] } }>
    | undefined;
  if (!stores) return 0;
  for (const id of Object.keys(stores)) {
    const s = stores[id];
    if (s && typeof s.getState === "function") {
      total += s.getState().edges?.length ?? 0;
    }
  }
  return total;
};

/**
 * Mounts all detector subscriptions for the lifetime of the onboarding tour.
 * Idempotent: safe to mount even when the tour is dismissed (subscriptions
 * are cheap and only update Zustand state on transitions).
 */
export const useOnboardingDetectors = (): void => {
  const advance = useOnboardingStore((s) => s.next);
  const phase = useOnboardingStore((s) => s.phase);
  const currentIdx = useOnboardingStore((s) => s.currentStep);
  const completed = useOnboardingStore((s) => s.completed);
  const markComplete = useOnboardingStore((s) => s.markComplete);
  const active = useOnboardingStore((s) => s.active);

  const managerStore = useWorkflowManagerStore();

  // Hold the most recent values in refs so the long-lived subscribe
  // callbacks see fresh state without resubscribing on every render.
  const phaseRef = useRef(phase);
  const idxRef = useRef(currentIdx);
  const activeRef = useRef(active);
  const completedRef = useRef(completed);

  useEffect(() => {
    phaseRef.current = phase;
    idxRef.current = currentIdx;
    activeRef.current = active;
    completedRef.current = completed;
  }, [phase, currentIdx, active, completed]);

  const onCompleteRef = useRef<(id: OnboardingStepId) => void>(() => {});
  onCompleteRef.current = (id: OnboardingStepId): void => {
    if (completedRef.current[id]) return;
    markComplete(id);
    const activeId = ONBOARDING_STEP_ORDER[idxRef.current];
    if (
      activeRef.current &&
      phaseRef.current === "action" &&
      activeId === id
    ) {
      // Slight delay so the user sees the action register before
      // we sweep them into the next intro screen.
      setTimeout(() => advance(), 600);
    }
  };

  // ---- providers ---------------------------------------------------------
  useEffect(() => {
    const evaluate = (): void => {
      const secrets = useSecretsStore.getState().secrets;
      if (!secrets) return;
      const hasProvider = secrets.some(
        (s) => s.is_configured && PROVIDER_KEYS.has(s.key)
      );
      if (hasProvider) onCompleteRef.current("providers");
    };
    evaluate();
    const unsub = useSecretsStore.subscribe(evaluate);
    return unsub;
  }, []);

  // ---- chat & image ------------------------------------------------------
  useEffect(() => {
    let lastTotal = totalUserMessages(
      useGlobalChatStore.getState().messageCache
    );
    const unsub = useGlobalChatStore.subscribe((state) => {
      const total = totalUserMessages(state.messageCache);
      if (total > lastTotal) {
        lastTotal = total;
        onCompleteRef.current("chat");
        const mode = useMediaGenerationStore.getState().mode;
        if (IMAGE_MODES.has(mode)) onCompleteRef.current("image");
      } else {
        lastTotal = total;
      }
    });
    return unsub;
  }, []);

  // ---- nodes & connect ---------------------------------------------------
  useEffect(() => {
    let lastNodes = sumNodeCount(managerStore.getState());
    let lastEdges = sumEdgeCount(managerStore.getState());

    const evaluate = (): void => {
      const nodes = sumNodeCount(managerStore.getState());
      const edges = sumEdgeCount(managerStore.getState());
      if (nodes > lastNodes) onCompleteRef.current("nodes");
      if (edges > lastEdges) onCompleteRef.current("connect");
      lastNodes = nodes;
      lastEdges = edges;
    };

    // Workflow manager mounts/unmounts node stores as workflows open and
    // close. Re-attach to all current node stores any time the manager
    // updates. A small interval picks up node/edge changes inside those
    // stores without us needing to subscribe to each one individually.
    const unsubMgr = managerStore.subscribe(evaluate);
    const id = window.setInterval(evaluate, 800);
    return () => {
      unsubMgr();
      window.clearInterval(id);
    };
  }, [managerStore]);

  // ---- run ---------------------------------------------------------------
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    const seen = new Set<string>();

    const attachRunner = (workflowId: string): void => {
      if (seen.has(workflowId)) return;
      seen.add(workflowId);
      try {
        const store = getWorkflowRunnerStore(workflowId);
        const unsub = store.subscribe((state) => {
          if (state.state !== "idle") onCompleteRef.current("run");
        });
        unsubs.push(unsub);
      } catch {
        // Runner not yet created for this workflow — fine, evaluate again
        // next time the manager updates.
      }
    };

    const sweep = (): void => {
      const stores = managerStore.getState().nodeStores;
      if (!stores) return;
      for (const wfId of Object.keys(stores)) attachRunner(wfId);
    };
    sweep();

    const unsubMgr = managerStore.subscribe(sweep);
    return () => {
      unsubMgr();
      for (const u of unsubs) u();
    };
  }, [managerStore]);
};
