import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecentWorkflow {
  id: string;
  name: string;
  lastOpened: number;
  nodeCount: number;
  lastRunStatus?: "success" | "error" | "cancelled" | "running";
  lastRunTime?: number;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  action: string;
  description?: string;
}

export interface WorkflowActivity {
  id: string;
  type: "created" | "opened" | "saved" | "run" | "deleted";
  workflowId: string;
  workflowName: string;
  timestamp: number;
  details?: string;
}

interface WorkflowDashboardState {
  recentWorkflows: RecentWorkflow[];
  quickActions: QuickAction[];
  recentActivity: WorkflowActivity[];
  isExpanded: boolean;
  
  addRecentWorkflow: (workflow: Omit<RecentWorkflow, "lastOpened">) => void;
  removeRecentWorkflow: (workflowId: string) => void;
  clearRecentWorkflows: () => void;
  updateRecentWorkflow: (workflowId: string, updates: Partial<RecentWorkflow>) => void;
  
  addActivity: (activity: Omit<WorkflowActivity, "id" | "timestamp">) => void;
  clearActivity: () => void;
  trimActivity: (maxItems: number) => void;
  
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;
  
  getRecentWorkflows: () => RecentWorkflow[];
  getActivityForWorkflow: (workflowId: string) => WorkflowActivity[];
}

const MAX_RECENT_WORKFLOWS = 10;
const MAX_ACTIVITY_ITEMS = 50;

export const useWorkflowDashboardStore = create<WorkflowDashboardState>()(
  persist(
    (set, get) => ({
      recentWorkflows: [],
      quickActions: [
        {
          id: "new-workflow",
          label: "New Workflow",
          icon: "add",
          action: "create",
          description: "Create a new blank workflow"
        },
        {
          id: "from-template",
          label: "From Template",
          icon: "description",
          action: "template",
          description: "Start from a template"
        },
        {
          id: "import-workflow",
          label: "Import",
          icon: "upload",
          action: "import",
          description: "Import a workflow file"
        },
        {
          id: "open-recent",
          label: "Recent",
          icon: "history",
          action: "recent",
          description: "View recent workflows"
        }
      ],
      recentActivity: [],
      isExpanded: false,

      addRecentWorkflow: (workflow) =>
        set((state) => {
          const existing = state.recentWorkflows.findIndex(
            (w) => w.id === workflow.id
          );
          
          let updatedWorkflows = [...state.recentWorkflows];
          
          if (existing >= 0) {
            updatedWorkflows[existing] = {
              ...updatedWorkflows[existing],
              ...workflow,
              lastOpened: Date.now()
            };
          } else {
            updatedWorkflows.unshift({
              ...workflow,
              lastOpened: Date.now()
            });
          }
          
          updatedWorkflows = updatedWorkflows
            .sort((a, b) => b.lastOpened - a.lastOpened)
            .slice(0, MAX_RECENT_WORKFLOWS);
          
          return { recentWorkflows: updatedWorkflows };
        }),

      removeRecentWorkflow: (workflowId) =>
        set((state) => ({
          recentWorkflows: state.recentWorkflows.filter(
            (w) => w.id !== workflowId
          )
        })),

      clearRecentWorkflows: () =>
        set({ recentWorkflows: [] }),

      updateRecentWorkflow: (workflowId, updates) =>
        set((state) => ({
          recentWorkflows: state.recentWorkflows.map((w) =>
            w.id === workflowId ? { ...w, ...updates } : w
          )
        })),

      addActivity: (activity) =>
        set((state) => {
          const newActivity: WorkflowActivity = {
            ...activity,
            id: `${activity.type}-${activity.workflowId}-${Date.now()}`,
            timestamp: Date.now()
          };
          
          return {
            recentActivity: [newActivity, ...state.recentActivity].slice(
              0,
              MAX_ACTIVITY_ITEMS
            )
          };
        }),

      clearActivity: () =>
        set({ recentActivity: [] }),

      trimActivity: (maxItems) =>
        set((state) => ({
          recentActivity: state.recentActivity.slice(0, maxItems)
        })),

      toggleExpanded: () =>
        set((state) => ({ isExpanded: !state.isExpanded })),

      setExpanded: (expanded) =>
        set({ isExpanded: expanded }),

      getRecentWorkflows: () => {
        const state = get();
        return state.recentWorkflows.sort(
          (a, b) => b.lastOpened - a.lastOpened
        );
      },

      getActivityForWorkflow: (workflowId) => {
        const state = get();
        return state.recentActivity.filter(
          (a) => a.workflowId === workflowId
        );
      }
    }),
    {
      name: "workflow-dashboard-storage",
      partialize: (state) => ({
        recentWorkflows: state.recentWorkflows,
        quickActions: state.quickActions,
        recentActivity: state.recentActivity,
        isExpanded: state.isExpanded
      })
    }
  )
);
