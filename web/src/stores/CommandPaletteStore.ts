/**
 * CommandPaletteStore manages the state and actions for the command palette feature.
 *
 * Features:
 * - Toggle command palette visibility
 * - Register and unregister commands
 * - Search and filter commands
 * - Execute commands with keyboard shortcuts
 */

import { create } from "zustand";

export interface Command {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  icon?: string;
  category?: string;
  action: () => void;
  shortcut?: string;
}

interface CommandPaletteState {
  isOpen: boolean;
  commands: Command[];
  searchQuery: string;
  
  // Actions
  open: () => void;
  close: () => void;
  toggle: () => void;
  setSearchQuery: (query: string) => void;
  registerCommand: (command: Command) => void;
  unregisterCommand: (commandId: string) => void;
  getFilteredCommands: () => Command[];
  executeCommand: (commandId: string) => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>()((set, get) => ({
  isOpen: false,
  commands: [],
  searchQuery: "",
  
  open: () => set({ isOpen: true, searchQuery: "" }),
  
  close: () => set({ isOpen: false, searchQuery: "" }),
  
  toggle: () => set((state) => ({ isOpen: !state.isOpen, searchQuery: "" })),
  
  setSearchQuery: (query: string) => set({ searchQuery: query }),
  
  registerCommand: (command: Command) => set((state) => {
    // Check if command already exists
    const exists = state.commands.some(cmd => cmd.id === command.id);
    if (exists) {
      // Update existing command
      return {
        commands: state.commands.map(cmd => 
          cmd.id === command.id ? command : cmd
        )
      };
    }
    // Add new command
    return { commands: [...state.commands, command] };
  }),
  
  unregisterCommand: (commandId: string) => set((state) => ({
    commands: state.commands.filter(cmd => cmd.id !== commandId)
  })),
  
  getFilteredCommands: () => {
    const { commands, searchQuery } = get();
    
    if (!searchQuery.trim()) {
      return commands;
    }
    
    const query = searchQuery.toLowerCase();
    
    return commands.filter(command => {
      const labelMatch = command.label.toLowerCase().includes(query);
      const descriptionMatch = command.description?.toLowerCase().includes(query);
      const keywordsMatch = command.keywords?.some(kw => kw.toLowerCase().includes(query));
      const categoryMatch = command.category?.toLowerCase().includes(query);
      
      return labelMatch || descriptionMatch || keywordsMatch || categoryMatch;
    });
  },
  
  executeCommand: (commandId: string) => {
    const { commands, close } = get();
    const command = commands.find(cmd => cmd.id === commandId);
    
    if (command) {
      close();
      command.action();
    }
  }
}));
