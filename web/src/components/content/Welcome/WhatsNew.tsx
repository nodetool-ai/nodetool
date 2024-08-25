import React from "react";
import {
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

const whatsNewData = [
  {
    version: "v0.3.0",
    changes: [
      {
        category: "Performance",
        items: [
          "Improved performance in NodeEditor and BaseNode components",
          "Optimizations for large workflows",
        ],
      },
      {
        category: "New Features",
        items: [
          "Added support for Flux model",
          "New audio analysis and manipulation nodes",
          "Added randomize list node",
          "Improved chat experience",
        ],
      },
      {
        category: "Improvements",
        items: [
          "Improved asset handling and downloads",
          "Enhanced LoopNode functionality",
        ],
      },
    ],
  },
  {
    version: "v0.2.9",
    changes: [
      {
        category: "Search",
        items: [
          "Improved NodeMenu search functionality",
          "Added weights for title, node_type, and tags in search",
        ],
      },
      {
        category: "Backend",
        items: [
          "Improved exception handling and logging",
          "Consolidated run_prediction functionality",
        ],
      },
    ],
  },
  {
    version: "v0.2.8",
    changes: [
      {
        category: "Assets",
        items: [
          "Added support for text asset uploads",
          "Improved image/video drop handling",
        ],
      },
      {
        category: "UI",
        items: [
          "Updated node styling and footer highlighting",
          "Added new example workflows",
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
