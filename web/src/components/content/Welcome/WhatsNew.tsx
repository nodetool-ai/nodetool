import React from "react";
import {
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

const whatsNewData = [
  // {
  //   version: "v0.3.0",
  //   changes: [
  //     {
  //       category: "Performance",
  //       items: [
  //         "Improved performance in NodeEditor and BaseNode components",
  //         "Optimizations for large workflows",
  //       ],
  //     },
  //     {
  //       category: "New Features",
  //       items: [
  //         "Added support for Flux model",
  //         "New audio analysis and manipulation nodes",
  //         "Added randomize list node",
  //         "Improved chat experience",
  //       ],
  //     },
  //     {
  //       category: "Improvements",
  //       items: [
  //         "Improved asset handling and downloads",
  //         "Enhanced LoopNode functionality",
  //       ],
  //     },
  //   ],
  // },
  // {
  //   version: "v0.2.9",
  //   changes: [
  //     {
  //       category: "Search",
  //       items: [
  //         "Improved NodeMenu search functionality",
  //         "Added weights for title, node_type, and tags in search",
  //       ],
  //     },
  //     {
  //       category: "Backend",
  //       items: [
  //         "Improved exception handling and logging",
  //         "Consolidated run_prediction functionality",
  //       ],
  //     },
  //   ],
  // },
  // {
  //   version: "v0.2.8",
  //   changes: [
  //     {
  //       category: "Assets",
  //       items: [
  //         "Added support for text asset uploads",
  //         "Improved image/video drop handling",
  //       ],
  //     },
  //     {
  //       category: "UI",
  //       items: [
  //         "Updated node styling and footer highlighting",
  //         "Added new example workflows",
  //       ],
  //     },
  //   ],
  // },

  // 2024.3
  {
    version: "2024.3",
    changes: [
      {
        category: "User Interface and Experience",
        items: [
          "Introduced a new Welcome screen with searchable content and improved organization",
          "Enhanced AssetGrid and AssetViewer components for better asset management",
          "Improved LoopNode functionality and styling",
          "Redesigned AppHeader for better responsiveness",
          "Added a WhatsNew feature to keep users informed about updates",
          "Implemented HelpChat for improved user assistance",
        ],
      },
      {
        category: "AI and Machine Learning",
        items: [
          "Added support for Stable Video Diffusion",
          "Implemented SDXL Lightning and Turbo models",
          "Added Kandinsky nodes for image generation",
          "Added AnimateDiff node for short video generation",
          "Implemented various HuggingFace models (e.g., zero-shot classifiers, depth estimation)",
          "Enhanced Flux model support",
        ],
      },
      {
        category: "Backend and Performance",
        items: [
          "Implemented multi-process runner for improved performance",
          "Enhanced workflow execution with better threading and queueing",
          "Improved VRAM handling and cuda cache management",
          "Implemented node caching using memcached for faster operations",
          "Optimized performance in NodeEditor and BaseNode components",
        ],
      },
      {
        category: "Development and Integration",
        items: [
          "Started integration with Electron for desktop application development",
          "Improved Docker support and configuration",
          "Enhanced API client functionality and error handling",
          "Implemented better logging and exception handling",
          "Added support for raw SQL queries and joins",
        ],
      },
      {
        category: "Audio and Video Processing",
        items: [
          "Added new audio analysis nodes",
          "Implemented audio effects processing",
          "Enhanced video filtering capabilities",
          "Improved support for various audio and video formats",
        ],
      },
    ],
  },

  // 2024.2
  {
    version: "2024.2",
    changes: [
      {
        category: "User Interface and Experience",
        items: [
          "Enhanced WorkflowGrid with open and duplicate buttons, double-click to open",
          "Improved LoopNode functionality and styling",
          "Updated AppHeader with customizable button display options",
          "Implemented staging mode for frontend",
          "Enhanced asset handling and viewer interface",
        ],
      },
      {
        category: "Backend and Performance",
        items: [
          "Implemented PostgreSQL support, replacing DynamoDB",
          "Added Docker Compose setup for easier deployment",
          "Implemented Ollama support for function calling",
          "Enhanced workflow execution and job cancellation",
          "Improved exception handling and logging",
        ],
      },
      {
        category: "AI and Machine Learning",
        items: [
          "Added support for Claude in agentic workflows",
          "Implemented SD3 Explorer",
          "Enhanced Dataframe Agent functionality",
          "Added more AI models and tools for agents",
        ],
      },
      {
        category: "Development and Documentation",
        items: [
          "Refactored modules for better organization",
          "Improved node documentation and descriptions",
          "Added new example workflows",
          "Implemented Plausible analytics for better insights",
        ],
      },
    ],
  },

  // 2024.1
  {
    version: "2024.1",
    changes: [
      {
        category: "Core Functionality",
        items: [
          "Renamed project to NodeTool",
          "Implemented local authentication as default",
          "Added support for running the API with regular and local auth",
          "Introduced LLM tasks and simplified task nodes",
          "Implemented ability to run workflows without a graph parameter",
          "Added endpoint to fetch public workflows",
          "Introduced input/output schema to workflow API",
        ],
      },
      {
        category: "Nodes and Workflows",
        items: [
          "Updated documentation for various node types (loop, audio, image, text, etc.)",
          "Improved handling of dict, list, loop, math, and video nodes",
          "Introduced WorkflowNode for better workflow integration",
          "Enhanced support for agent workflows",
          "Added NodeRef for improved node referencing",
          "Introduced AssistantNode for AI assistance",
          "Improved workflow node processing",
        ],
      },
      {
        category: "AI and Machine Learning",
        items: [
          "Added more AI models and expanded model support",
          "Enhanced Chroma support for better vector search capabilities",
          "Improved Llama.cpp support",
          "Fixed Comfy loaders and workflows",
          "Implemented cost calculation for OpenAI and Replicate",
        ],
      },
      {
        category: "Development and Deployment",
        items: [
          "Added SQLite migrations for better database management",
          "Implemented a setup script for easier initial configuration",
          "Introduced an environment setup wizard",
          "Added a prediction API for more accurate model outputs",
          "Improved capability management system",
          "Added static file serving",
          "Implemented CLI and server functionality",
          "Introduced custom nodes feature",
          "Switched to Poetry for dependency management",
        ],
      },
    ],
  },
];

const WhatsNew = () => {
  return (
    <div>
      {whatsNewData.map((release, index) => (
        <Accordion key={index} defaultExpanded={index === 0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">{release.version}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {release.changes.map((category, catIndex) => (
              <div key={catIndex}>
                <Typography variant="subtitle1" gutterBottom>
                  <strong>{category.category}</strong>
                </Typography>
                <ul>
                  {category.items.map((item, itemIndex) => (
                    <li key={itemIndex}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </AccordionDetails>
        </Accordion>
      ))}
    </div>
  );
};

export default WhatsNew;
