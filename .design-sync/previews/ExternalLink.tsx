import * as React from "react";
import { ExternalLink, FlexColumn } from "nodetool";

export const IconVariants = () => (
  <FlexColumn gap={1.5} align="flex-start">
    <ExternalLink href="https://nodetool.ai" iconVariant="arrow">
      NodeTool docs
    </ExternalLink>
    <ExternalLink href="https://huggingface.co" iconVariant="open">
      Browse on HuggingFace
    </ExternalLink>
    <ExternalLink href="https://github.com/nodetool-ai" iconVariant="launch">
      View source on GitHub
    </ExternalLink>
    <ExternalLink href="https://nodetool.ai" iconVariant="none">
      No icon link
    </ExternalLink>
  </FlexColumn>
);

export const Sizes = () => (
  <FlexColumn gap={1.5} align="flex-start">
    <ExternalLink href="https://nodetool.ai" size="small">
      Small link
    </ExternalLink>
    <ExternalLink href="https://nodetool.ai" size="medium">
      Medium link
    </ExternalLink>
    <ExternalLink href="https://nodetool.ai" size="large">
      Large link
    </ExternalLink>
  </FlexColumn>
);
