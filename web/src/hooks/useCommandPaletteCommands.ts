/**
 * useCommandPaletteCommands
 *
 * Hook that registers common commands for the command palette.
 * This includes navigation, workflow actions, and utility functions.
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCommandPaletteStore } from "../stores/CommandPaletteStore";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";

export const useCommandPaletteCommands = () => {
  const navigate = useNavigate();
  const registerCommand = useCommandPaletteStore((state) => state.registerCommand);
  const unregisterCommand = useCommandPaletteStore((state) => state.unregisterCommand);
  const createNewWorkflow = useWorkflowManager((state) => state.createNew);
  
  useEffect(() => {
    // Navigation commands
    registerCommand({
      id: "nav.dashboard",
      label: "Go to Dashboard",
      description: "Navigate to the main dashboard",
      keywords: ["home", "dashboard", "main"],
      category: "Navigation",
      action: () => navigate("/")
    });
    
    registerCommand({
      id: "nav.workflows",
      label: "Go to Workflows",
      description: "View all your workflows",
      keywords: ["workflows", "list"],
      category: "Navigation",
      action: () => navigate("/workflows")
    });
    
    registerCommand({
      id: "nav.assets",
      label: "Go to Assets",
      description: "Manage your assets and files",
      keywords: ["assets", "files", "media"],
      category: "Navigation",
      action: () => navigate("/assets")
    });
    
    registerCommand({
      id: "nav.templates",
      label: "Browse Templates",
      description: "Explore workflow templates",
      keywords: ["templates", "examples", "browse"],
      category: "Navigation",
      action: () => navigate("/templates")
    });
    
    registerCommand({
      id: "nav.chat",
      label: "Open Chat",
      description: "Start a new AI chat",
      keywords: ["chat", "ai", "assistant"],
      category: "Navigation",
      action: () => navigate("/chat")
    });
    
    // Workflow commands
    registerCommand({
      id: "workflow.new",
      label: "Create New Workflow",
      description: "Start a blank workflow",
      keywords: ["new", "create", "workflow", "blank"],
      category: "Workflow",
      shortcut: "⌘N",
      action: async () => {
        try {
          const workflow = await createNewWorkflow();
          navigate(`/editor/${workflow.id}`);
        } catch (error) {
          console.error("Failed to create new workflow:", error);
        }
      }
    });
    
    registerCommand({
      id: "workflow.save",
      label: "Save Current Workflow",
      description: "Save your current work",
      keywords: ["save", "workflow"],
      category: "Workflow",
      shortcut: "⌘S",
      action: () => {
        // Note: This delegates to the editor's existing save functionality
        // through keyboard event dispatching. In the future, this should
        // be replaced with a direct save function from the editor context.
        try {
          const event = new KeyboardEvent("keydown", {
            key: "s",
            metaKey: true,
            bubbles: true
          });
          document.dispatchEvent(event);
        } catch (error) {
          console.error("Failed to trigger save action:", error);
        }
      }
    });
    
    // Settings commands
    registerCommand({
      id: "settings.theme",
      label: "Toggle Theme",
      description: "Switch between light and dark mode",
      keywords: ["theme", "dark", "light", "appearance"],
      category: "Settings",
      action: () => {
        // Note: This delegates to the existing theme toggle button.
        // In the future, this should use a theme toggle function from
        // the theme context for more robust implementation.
        try {
          const themeButton = document.querySelector('[aria-label="Toggle theme"]') as HTMLElement;
          if (themeButton) {
            themeButton.click();
          } else {
            console.warn("Theme toggle button not found");
          }
        } catch (error) {
          console.error("Failed to toggle theme:", error);
        }
      }
    });
    
    // Help commands
    registerCommand({
      id: "help.docs",
      label: "Open Documentation",
      description: "View NodeTool documentation",
      keywords: ["help", "docs", "documentation"],
      category: "Help",
      action: () => {
        window.open("https://docs.nodetool.ai", "_blank");
      }
    });
    
    registerCommand({
      id: "help.shortcuts",
      label: "View Keyboard Shortcuts",
      description: "See all available keyboard shortcuts",
      keywords: ["help", "shortcuts", "keyboard", "hotkeys"],
      category: "Help",
      action: () => {
        // This will open a keyboard shortcuts dialog in the future
        // For now, we log to console instead of using alert
        console.log("Keyboard Shortcuts:\n\n" +
              "⌘/Ctrl + K - Open Command Palette\n" +
              "⌘/Ctrl + N - New Workflow\n" +
              "⌘/Ctrl + S - Save Workflow\n" +
              "⌘/Ctrl + Z - Undo\n" +
              "⌘/Ctrl + Shift + Z - Redo");
      }
    });
    
    // Cleanup function
    return () => {
      unregisterCommand("nav.dashboard");
      unregisterCommand("nav.workflows");
      unregisterCommand("nav.assets");
      unregisterCommand("nav.templates");
      unregisterCommand("nav.chat");
      unregisterCommand("workflow.new");
      unregisterCommand("workflow.save");
      unregisterCommand("settings.theme");
      unregisterCommand("help.docs");
      unregisterCommand("help.shortcuts");
    };
  }, [navigate, registerCommand, unregisterCommand, createNewWorkflow]);
};
