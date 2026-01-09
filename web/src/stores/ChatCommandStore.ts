/**
 * ChatCommandStore
 *
 * Manages slash command state for the chat interface.
 * Handles command detection, selection, and execution.
 */

import { create } from "zustand";

export interface ChatCommand {
  id: string;
  name: string;
  description: string;
  usage: string;
  category: "workflow" | "node" | "system" | "help";
  icon?: string;
  execute: (args: string) => Promise<{ success: boolean; message?: string }>;
}

export interface ChatCommandCategory {
  id: ChatCommand["category"];
  name: string;
  icon: string;
}

export const COMMAND_CATEGORIES: Record<ChatCommand["category"], ChatCommandCategory> = {
  workflow: { id: "workflow", name: "Workflow", icon: "⚡" },
  node: { id: "node", name: "Nodes", icon: "🔧" },
  system: { id: "system", name: "System", icon: "⚙️" },
  help: { id: "help", name: "Help", icon: "❓" }
};

export type ChatCommandStore = {
  isOpen: boolean;
  searchTerm: string;
  selectedIndex: number;
  commands: ChatCommand[];
  filteredCommands: ChatCommand[];

  openPalette: () => void;
  closePalette: () => void;
  setSearchTerm: (term: string) => void;
  setSelectedIndex: (index: number) => void;
  moveSelectionUp: () => void;
  moveSelectionDown: () => void;
  getSelectedCommand: () => ChatCommand | null;
  registerCommand: (command: ChatCommand) => () => void;
  executeCommand: (commandId: string, args: string) => Promise<{ success: boolean; message?: string }>;
  reset: () => void;
};

const DEFAULT_COMMANDS: ChatCommand[] = [
  {
    id: "help",
    name: "help",
    description: "Show help for all available commands",
    usage: "/help [command]",
    category: "help",
    execute: async () => ({ success: true, message: "Use /help to see all commands" })
  },
  {
    id: "run",
    name: "run",
    description: "Run the current workflow",
    usage: "/run",
    category: "workflow",
    execute: async () => ({ success: true, message: "Workflow started" })
  },
  {
    id: "stop",
    name: "stop",
    description: "Stop the running workflow",
    usage: "/stop",
    category: "workflow",
    execute: async () => ({ success: true, message: "Workflow stopped" })
  },
  {
    id: "new",
    name: "new",
    description: "Create a new workflow",
    usage: "/new [template_name]",
    category: "workflow",
    execute: async () => ({ success: true, message: "New workflow created" })
  },
  {
    id: "save",
    name: "save",
    description: "Save the current workflow",
    usage: "/save",
    category: "workflow",
    execute: async () => ({ success: true, message: "Workflow saved" })
  },
  {
    id: "node",
    name: "node",
    description: "Search and add a node to the workflow",
    usage: "/node <node_type>",
    category: "node",
    execute: async (args) => ({ success: true, message: `Adding node: ${args}` })
  },
  {
    id: "template",
    name: "template",
    description: "Insert a workflow template",
    usage: "/template <template_name>",
    category: "workflow",
    execute: async (args) => ({ success: true, message: `Loading template: ${args}` })
  },
  {
    id: "clear",
    name: "clear",
    description: "Clear the chat messages",
    usage: "/clear",
    category: "system",
    execute: async () => ({ success: true, message: "Chat cleared" })
  },
  {
    id: "undo",
    name: "undo",
    description: "Undo the last action in the editor",
    usage: "/undo",
    category: "system",
    execute: async () => ({ success: true, message: "Undo" })
  },
  {
    id: "redo",
    name: "redo",
    description: "Redo the last action in the editor",
    usage: "/redo",
    category: "system",
    execute: async () => ({ success: true, message: "Redo" })
  },
  {
    id: "fit",
    name: "fit",
    description: "Fit all nodes to screen",
    usage: "/fit",
    category: "system",
    execute: async () => ({ success: true, message: "View fitted" })
  },
  {
    id: "align",
    name: "align",
    description: "Align selected nodes",
    usage: "/align [left|right|center|top|bottom]",
    category: "system",
    execute: async (args) => ({ success: true, message: `Aligning: ${args || "left"}` })
  }
];

let registeredCommands = [...DEFAULT_COMMANDS];

export const useChatCommandStore = create<ChatCommandStore>((set, get) => ({
  isOpen: false,
  searchTerm: "",
  selectedIndex: 0,
  commands: registeredCommands,
  filteredCommands: registeredCommands,

  openPalette: () => {
    set({
      isOpen: true,
      searchTerm: "",
      selectedIndex: 0,
      filteredCommands: registeredCommands
    });
  },

  closePalette: () => {
    set({ isOpen: false, searchTerm: "", selectedIndex: 0 });
  },

  setSearchTerm: (term: string) => {
    const commands = registeredCommands;
    const filtered = term
      ? commands.filter(
          (cmd) =>
            cmd.name.toLowerCase().includes(term.toLowerCase()) ||
            cmd.description.toLowerCase().includes(term.toLowerCase()) ||
            cmd.category.toLowerCase().includes(term.toLowerCase())
        )
      : commands;

    set({
      searchTerm: term,
      filteredCommands: filtered,
      selectedIndex: 0
    });
  },

  setSelectedIndex: (index: number) => {
    const { filteredCommands } = get();
    const maxIndex = Math.max(0, filteredCommands.length - 1);
    const clampedIndex = Math.max(0, Math.min(index, maxIndex));
    set({ selectedIndex: clampedIndex });
  },

  moveSelectionUp: () => {
    const { selectedIndex } = get();
    get().setSelectedIndex(selectedIndex - 1);
  },

  moveSelectionDown: () => {
    const { selectedIndex } = get();
    get().setSelectedIndex(selectedIndex + 1);
  },

  getSelectedCommand: () => {
    const { filteredCommands, selectedIndex } = get();
    if (selectedIndex >= 0 && selectedIndex < filteredCommands.length) {
      return filteredCommands[selectedIndex];
    }
    return null;
  },

  registerCommand: (command: ChatCommand) => {
    registeredCommands.push(command);
    set({ commands: [...registeredCommands], filteredCommands: [...registeredCommands] });
    return () => {
      registeredCommands = registeredCommands.filter((c) => c.id !== command.id);
      set({ commands: [...registeredCommands], filteredCommands: [...registeredCommands] });
    };
  },

  executeCommand: async (commandId: string, args: string) => {
    const command = registeredCommands.find((c) => c.id === commandId);
    if (!command) {
      return { success: false, message: `Unknown command: ${commandId}` };
    }
    return command.execute(args);
  },

  reset: () => {
    set({ isOpen: false, searchTerm: "", selectedIndex: 0 });
  }
}));

export const detectSlashCommand = (text: string): { command: string; args: string } | null => {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) {
    return { command: trimmed.slice(1).toLowerCase(), args: "" };
  }

  return {
    command: trimmed.slice(1, spaceIndex).toLowerCase(),
    args: trimmed.slice(spaceIndex + 1).trim()
  };
};

export const isCommandText = (text: string): boolean => {
  const detected = detectSlashCommand(text);
  if (!detected) {
    return false;
  }

  const command = registeredCommands.find((c) => c.name === detected.command);
  return !!command;
};
