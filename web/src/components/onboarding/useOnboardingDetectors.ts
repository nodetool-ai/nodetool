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
 * Auto-advances when the tour is active and the matching step is current;
 * always records completion in the background so the launcher can show
 * progress.
 *
 * All subscriptions are event-driven: per-NodeStore and per-WorkflowRunner
 * listeners are attached on demand and torn down when the workflow id is
 * removed from `nodeStores`, so closing tabs reclaims memory.
 */
import { useEffect, useRef } from "react";
import useSecretsStore from "../../stores/SecretsStore";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import useMediaGenerationStore from "../../stores/MediaGenerationStore";
import { useWorkflowManagerStore } from "../../contexts/WorkflowManagerContext";
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

interface NodeStoreLike {
  getState: () => { nodes: unknown[]; edges: unknown[] };
  subscribe: (listener: (state: { nodes: unknown[]; edges: unknown[] }) => void) => () => void;
}

/**
 * Mounts all detector subscriptions for the lifetime of the onboarding tour.
 * Idempotent: safe to mount even when the tour is dismissed (subscriptions
 * are cheap and only update Zustand state on transitions).
 */
export const useOnboardingDetectors = (): void => {
  const advance = useOnboardingStore((s) => s.next);
  const currentIdx = useOnboardingStore((s) => s.currentStep);
  const completed = useOnboardingStore((s) => s.completed);
  const markComplete = useOnboardingStore((s) => s.markComplete);
  const active = useOnboardingStore((s) => s.active);

  const managerStore = useWorkflowManagerStore();

  // Hold the most recent values in refs so the long-lived subscribe
  // callbacks see fresh state without resubscribing on every render.
  const idxRef = useRef(currentIdx);
  const activeRef = useRef(active);
  const completedRef = useRef(completed);

  useEffect(() => {
    idxRef.current = currentIdx;
    activeRef.current = active;
    completedRef.current = completed;
  }, [currentIdx, active, completed]);

  const onCompleteRef = useRef<(id: OnboardingStepId) => void>(() => {});
  onCompleteRef.current = (id: OnboardingStepId): void => {
    if (completedRef.current[id]) return;
    markComplete(id);
    const activeId = ONBOARDING_STEP_ORDER[idxRef.current];
    if (activeRef.current && activeId === id) {
      // Slight delay so the user sees the action register before
      // we advance to the next step.
      setTimeout(() => advance(), 600);
    }
  };

  // ---- providers ---------------------------------------------------------
  useEffect(() => {
    const evaluate = (): void => {
      if (completedRef.current.providers) return;
      const secrets = useSecretsStore.getState().secrets;
      if (!secrets) return;
      const hasProvider = secrets.some(
        (s) => s.is_configured && PROVIDER_KEYS.has(s.key)
      );
      if (hasProvider) onCompleteRef.current("providers");
    };
    evaluate();
    return useSecretsStore.subscribe(evaluate);
  }, []);

  // ---- chat & image ------------------------------------------------------
  // GlobalChatStore updates very frequently during streaming. Track the last
  // message-length we saw per thread, so we only scan threads whose length
  // changed and only count messages added since the last check. Once both
  // chat and image are completed there's no reason to keep evaluating.
  useEffect(() => {
    const lastByThread = new Map<string, number>();
    const initial = useGlobalChatStore.getState().messageCache;
    for (const [threadId, messages] of Object.entries(initial)) {
      lastByThread.set(threadId, messages?.length ?? 0);
    }

    return useGlobalChatStore.subscribe((state) => {
      if (completedRef.current.chat && completedRef.current.image) return;

      let sawNewUserMessage = false;
      const cache = state.messageCache;

      for (const [threadId, messages] of Object.entries(cache)) {
        const len = messages?.length ?? 0;
        const prev = lastByThread.get(threadId) ?? 0;
        if (len === prev) continue;
        if (len > prev && !sawNewUserMessage) {
          for (let i = prev; i < len; i++) {
            const role = (messages[i] as { role?: string } | undefined)?.role;
            if (role === "user") {
              sawNewUserMessage = true;
              break;
            }
          }
        }
        lastByThread.set(threadId, len);
      }

      // Drop entries for deleted threads so the map doesn't grow unbounded.
      for (const threadId of lastByThread.keys()) {
        if (!(threadId in cache)) lastByThread.delete(threadId);
      }

      if (sawNewUserMessage) {
        onCompleteRef.current("chat");
        const mode = useMediaGenerationStore.getState().mode;
        if (IMAGE_MODES.has(mode)) onCompleteRef.current("image");
      }
    });
  }, []);

  // ---- nodes & connect ---------------------------------------------------
  // Subscribe directly to each NodeStore. Attach when a workflow opens,
  // detach when it's removed from `nodeStores`. No polling.
  useEffect(() => {
    const nodeSubs = new Map<string, () => void>();
    const lastCounts = new Map<string, { nodes: number; edges: number }>();

    const attachNodeStore = (workflowId: string, ns: NodeStoreLike): void => {
      if (nodeSubs.has(workflowId)) return;
      const initial = ns.getState();
      lastCounts.set(workflowId, {
        nodes: initial.nodes?.length ?? 0,
        edges: initial.edges?.length ?? 0
      });
      const unsub = ns.subscribe((s) => {
        const prev = lastCounts.get(workflowId);
        if (!prev) return;
        const n = s.nodes?.length ?? 0;
        const e = s.edges?.length ?? 0;
        if (n > prev.nodes) onCompleteRef.current("nodes");
        if (e > prev.edges) onCompleteRef.current("connect");
        lastCounts.set(workflowId, { nodes: n, edges: e });
      });
      nodeSubs.set(workflowId, unsub);
    };

    const reconcileNodeStores = (state: WorkflowManagerState): void => {
      const stores = (state.nodeStores ?? {}) as Record<string, NodeStoreLike>;
      for (const wfId of Object.keys(stores)) {
        if (stores[wfId]) attachNodeStore(wfId, stores[wfId]);
      }
      for (const wfId of Array.from(nodeSubs.keys())) {
        if (!stores[wfId]) {
          nodeSubs.get(wfId)?.();
          nodeSubs.delete(wfId);
          lastCounts.delete(wfId);
        }
      }
    };

    reconcileNodeStores(managerStore.getState());
    const unsubMgr = managerStore.subscribe(reconcileNodeStores);

    return () => {
      unsubMgr();
      for (const u of nodeSubs.values()) u();
      nodeSubs.clear();
      lastCounts.clear();
    };
  }, [managerStore]);

  // ---- run ---------------------------------------------------------------
  // One subscription per workflow runner store, attached/detached as
  // workflows open and close.
  useEffect(() => {
    const runnerSubs = new Map<string, () => void>();

    const attachRunner = (workflowId: string): void => {
      if (runnerSubs.has(workflowId)) return;
      try {
        const store = getWorkflowRunnerStore(workflowId);
        const unsub = store.subscribe((state) => {
          if (state.state !== "idle") onCompleteRef.current("run");
        });
        runnerSubs.set(workflowId, unsub);
      } catch {
        // Runner not yet ready — try again on the next manager update.
      }
    };

    const reconcileRunners = (state: WorkflowManagerState): void => {
      const stores = (state.nodeStores ?? {}) as Record<string, unknown>;
      for (const wfId of Object.keys(stores)) attachRunner(wfId);
      for (const wfId of Array.from(runnerSubs.keys())) {
        if (!(wfId in stores)) {
          runnerSubs.get(wfId)?.();
          runnerSubs.delete(wfId);
        }
      }
    };

    reconcileRunners(managerStore.getState());
    const unsubMgr = managerStore.subscribe(reconcileRunners);

    return () => {
      unsubMgr();
      for (const u of runnerSubs.values()) u();
      runnerSubs.clear();
    };
  }, [managerStore]);
};
