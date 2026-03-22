export const useRecentNodesStore = () => ({
  addRecentNode: jest.fn(),
  getRecentNodes: jest.fn().mockReturnValue([]),
  clearRecentNodes: jest.fn(),
});

export interface RecentNode {
  nodeType: string;
  timestamp: number;
}
