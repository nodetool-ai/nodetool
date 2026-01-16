import { create } from "zustand";
import { shallow } from "zustand/shallow";

export interface ProfilingSession {
  id: string;
  workflowId: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  nodeProfiles: Record<string, NodeProfile>;
  totalDuration: number;
  memoryEstimate: number;
}

export interface NodeProfile {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  memoryUsage: number;
  inputSize: number;
  outputSize: number;
  children?: string[];
  parentIds?: string[];
}

export interface WorkflowBottleneck {
  nodeId: string;
  nodeLabel: string;
  duration: number;
  percentageOfTotal: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  suggestion: string;
}

export interface ProfilerSummary {
  totalNodes: number;
  executedNodes: number;
  failedNodes: number;
  skippedNodes: number;
  totalDuration: number;
  avgNodeDuration: number;
  maxDuration: number;
  minDuration: number;
  bottlenecks: WorkflowBottleneck[];
  criticalPath: string[];
  parallelizableNodes: string[];
}

interface ProfilerStore {
  currentSession: ProfilingSession | null;
  sessions: ProfilingSession[];
  isProfiling: boolean;
  
  startProfiling: (workflowId: string) => void;
  endProfiling: (workflowId: string) => void;
  cancelProfiling: (workflowId: string) => void;
  
  startNodeExecution: (workflowId: string, nodeId: string, nodeType: string, nodeLabel: string, parentIds?: string[]) => void;
  endNodeExecution: (workflowId: string, nodeId: string, status: 'completed' | 'failed' | 'skipped', memoryUsage: number, inputSize: number, outputSize: number) => void;
  
  getCurrentSession: (workflowId: string) => ProfilingSession | null;
  getSessionById: (sessionId: string) => ProfilingSession | undefined;
  getAllSessions: () => ProfilingSession[];
  
  getProfilerSummary: (workflowId: string) => ProfilerSummary | null;
  getBottlenecks: (workflowId: string) => WorkflowBottleneck[];
  getCriticalPath: (workflowId: string) => string[];
  
  clearSession: (sessionId: string) => void;
  clearAllSessions: () => void;
}

const generateSessionId = () => `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const useProfilerStore = create<ProfilerStore>((set, get) => ({
  currentSession: null,
  sessions: [],
  isProfiling: false,

  startProfiling: (workflowId: string) => {
    const session: ProfilingSession = {
      id: generateSessionId(),
      workflowId,
      startTime: Date.now(),
      status: 'running',
      nodeProfiles: {},
      totalDuration: 0,
      memoryEstimate: 0,
    };
    set({
      currentSession: session,
      sessions: [...get().sessions, session],
      isProfiling: true,
    });
  },

  endProfiling: (workflowId: string) => {
    const session = get().currentSession;
    if (session && session.workflowId === workflowId) {
      const endTime = Date.now();
      const totalDuration = endTime - session.startTime;
      
      const updatedSession: ProfilingSession = {
        ...session,
        endTime,
        status: 'completed',
        totalDuration,
      };
      
      set({
        currentSession: null,
        isProfiling: false,
        sessions: get().sessions.map(s => s.id === session.id ? updatedSession : s),
      });
    }
  },

  cancelProfiling: (workflowId: string) => {
    const session = get().currentSession;
    if (session && session.workflowId === workflowId) {
      const updatedSession: ProfilingSession = {
        ...session,
        endTime: Date.now(),
        status: 'cancelled',
        totalDuration: Date.now() - session.startTime,
      };
      
      set({
        currentSession: null,
        isProfiling: false,
        sessions: get().sessions.map(s => s.id === session.id ? updatedSession : s),
      });
    }
  },

  startNodeExecution: (workflowId: string, nodeId: string, nodeType: string, nodeLabel: string, parentIds?: string[]) => {
    const session = get().currentSession;
    if (session && session.workflowId === workflowId) {
      const nodeProfile: NodeProfile = {
        nodeId,
        nodeType,
        nodeLabel,
        startTime: Date.now(),
        status: 'running',
        memoryUsage: 0,
        inputSize: 0,
        outputSize: 0,
        parentIds,
      };
      
      set({
        currentSession: {
          ...session,
          nodeProfiles: {
            ...session.nodeProfiles,
            [nodeId]: nodeProfile,
          },
        },
      });
    }
  },

  endNodeExecution: (workflowId: string, nodeId: string, status: 'completed' | 'failed' | 'skipped', memoryUsage: number, inputSize: number, outputSize: number) => {
    const session = get().currentSession;
    if (session && session.workflowId === workflowId) {
      const existingProfile = session.nodeProfiles[nodeId];
      if (existingProfile) {
        const endTime = Date.now();
        const duration = endTime - existingProfile.startTime;
        
        const updatedProfile: NodeProfile = {
          ...existingProfile,
          endTime,
          duration,
          status,
          memoryUsage,
          inputSize,
          outputSize,
        };
        
        const totalMemory = Object.values(session.nodeProfiles)
          .reduce((sum, p) => sum + p.memoryUsage, 0) + memoryUsage;
        
        set({
          currentSession: {
            ...session,
            nodeProfiles: {
              ...session.nodeProfiles,
              [nodeId]: updatedProfile,
            },
            memoryEstimate: totalMemory,
          },
        });
      }
    }
  },

  getCurrentSession: (workflowId: string) => {
    const session = get().currentSession;
    if (session && session.workflowId === workflowId) {
      return session;
    }
    return get().sessions.find(s => s.workflowId === workflowId && s.status === 'completed') || null;
  },

  getSessionById: (sessionId: string) => {
    return get().sessions.find(s => s.id === sessionId);
  },

  getAllSessions: () => {
    return get().sessions;
  },

  getProfilerSummary: (workflowId: string) => {
    const session = get().getCurrentSession(workflowId);
    if (!session) return null;

    const nodeProfiles = Object.values(session.nodeProfiles);
    const executedNodes = nodeProfiles.filter(p => p.status === 'completed');
    const failedNodes = nodeProfiles.filter(p => p.status === 'failed');
    const skippedNodes = nodeProfiles.filter(p => p.status === 'skipped');
    const durations = executedNodes.map(p => p.duration);
    
    const totalDuration = session.totalDuration;
    const bottlenecks = get().getBottlenecks(workflowId);
    const criticalPath = get().getCriticalPath(workflowId);
    
    const parallelizableNodes = identifyParallelizableNodes(nodeProfiles);
    
    return {
      totalNodes: nodeProfiles.length,
      executedNodes: executedNodes.length,
      failedNodes: failedNodes.length,
      skippedNodes: skippedNodes.length,
      totalDuration,
      avgNodeDuration: executedNodes.length > 0 
        ? (() => {
            let sum = 0;
            for (const d of durations) {
              sum += d ?? 0;
            }
            return sum / executedNodes.length;
          })()
        : 0,
      maxDuration: durations.length > 0 ? Math.max(...durations.map((d) => d ?? 0)) : 0,
      minDuration: durations.length > 0 ? Math.min(...durations.map((d) => d ?? 0)) : 0,
      bottlenecks,
      criticalPath,
      parallelizableNodes,
    };
  },

  getBottlenecks: (workflowId: string) => {
    const session = get().getCurrentSession(workflowId);
    if (!session) return [];

    const nodeProfiles = Object.values(session.nodeProfiles);
    const executedNodes = nodeProfiles.filter(p => p.status === 'completed');
    const totalDuration = session.totalDuration;
    
    const bottlenecks: WorkflowBottleneck[] = executedNodes
      .map(node => {
        const duration = node.duration ?? 0;
        const percentageOfTotal = (duration / totalDuration) * 100;
        let severity: WorkflowBottleneck['severity'] = 'low';
        if (percentageOfTotal > 50) severity = 'critical';
        else if (percentageOfTotal > 30) severity = 'high';
        else if (percentageOfTotal > 15) severity = 'medium';
        
        const suggestion = generateBottleneckSuggestion(node, percentageOfTotal);
        
        return {
          nodeId: node.nodeId,
          nodeLabel: node.nodeLabel,
          duration,
          percentageOfTotal,
          severity,
          suggestion,
        };
      })
      .filter(b => b.percentageOfTotal > 5)
      .sort((a, b) => b.percentageOfTotal - a.percentageOfTotal);

    return bottlenecks;
  },

  getCriticalPath: (workflowId: string) => {
    const session = get().getCurrentSession(workflowId);
    if (!session) return [];

    const nodeProfiles = Object.values(session.nodeProfiles);
    const profileById = session.nodeProfiles;
    
    const criticalPath: string[] = [];
    let currentPath: string[] = [];
    let maxPathDuration = 0;
    
    const findPath = (nodeId: string, path: string[], duration: number) => {
      const node = profileById[nodeId];
      if (!node) return;
      
      const newPath = [...path, nodeId];
      const newDuration = duration + (node.duration ?? 0);
      
      const children = nodeProfiles
        .filter(n => n.parentIds?.includes(nodeId))
        .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0));
      
      if (children.length === 0) {
        if (newDuration > maxPathDuration) {
          maxPathDuration = newDuration;
          criticalPath.length = 0;
          criticalPath.push(...newPath);
        }
        return;
      }
      
      for (const child of children) {
        findPath(child.nodeId, newPath, newDuration);
      }
    };
    
    const startNodes = nodeProfiles.filter(n => !n.parentIds || n.parentIds.length === 0);
    for (const node of startNodes) {
      findPath(node.nodeId, [], 0);
    }
    
    return criticalPath;
  },

  clearSession: (sessionId: string) => {
    set({
      sessions: get().sessions.filter(s => s.id !== sessionId),
    });
  },

  clearAllSessions: () => {
    set({
      sessions: [],
      currentSession: null,
      isProfiling: false,
    });
  },
}));

function identifyParallelizableNodes(nodeProfiles: NodeProfile[]): string[] {
  const parallelizable: string[] = [];
  const nodesByParent = new Map<string, string[]>();
  
  for (const node of nodeProfiles) {
    if (node.parentIds) {
      for (const parentId of node.parentIds) {
        const children = nodesByParent.get(parentId) || [];
        children.push(node.nodeId);
        nodesByParent.set(parentId, children);
      }
    }
  }
  
  for (const [parentId, children] of nodesByParent) {
    if (children.length > 1) {
      parallelizable.push(...children);
    }
  }
  
  return [...new Set(parallelizable)];
}

function generateBottleneckSuggestion(node: NodeProfile, percentageOfTotal: number): string {
  const suggestions: Record<string, string[]> = {
    'nodetool.llm': [
      'Consider using a smaller model for faster inference',
      'Enable model quantization if supported',
      'Check if prompt can be simplified',
    ],
    'nodetool.image': [
      'Consider reducing image resolution',
      'Use batch processing for multiple images',
      'Enable GPU acceleration if available',
    ],
    'nodetool.audio': [
      'Consider reducing audio quality/bitrate',
      'Process audio in chunks for streaming',
      'Use parallel processing for multiple files',
    ],
  };
  
  const nodeTypeSuggestions = Object.entries(suggestions)
    .filter(([type]) => node.nodeType.includes(type))
    .flatMap(([, list]) => list);
  
  if (nodeTypeSuggestions.length > 0) {
    return nodeTypeSuggestions[0];
  }
  
  if (percentageOfTotal > 50) {
    return 'This node dominates execution time. Consider optimizing or splitting into smaller operations.';
  }
  if (percentageOfTotal > 30) {
    return 'Significant time spent here. Look for caching opportunities or input reduction.';
  }
  return 'Minor performance impact. Monitor for changes in input size.';
}

export { useProfilerStore };
export default useProfilerStore;
