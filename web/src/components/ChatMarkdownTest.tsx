/** @jsxImportSource @emotion/react */
import React, { useState, memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Typography, Tabs, Tab } from "@mui/material";
import ChatMarkdown from "./chat/message/ChatMarkdown";
import { createStyles } from "./chat/thread/ChatThreadView.styles";

// ─── Sample Markdown Content ─────────────────────────────────────────────────

const WIDE_TABLE = `
Here is a table with many columns that might push the layout wide:

| Column 1 | Column 2 | Column 3 | Column 4 | Column 5 | Column 6 | Column 7 | Column 8 | Column 9 | Column 10 |
|----------|----------|----------|----------|----------|----------|----------|----------|----------|-----------|
| Data A1  | Data A2  | Data A3  | Data A4  | Data A5  | Data A6  | Data A7  | Data A8  | Data A9  | Data A10  |
| Data B1  | Data B2  | Data B3  | Data B4  | Data B5  | Data B6  | Data B7  | Data B8  | Data B9  | Data B10  |
| Data C1  | Data C2  | Data C3  | Data C4  | Data C5  | Data C6  | Data C7  | Data C8  | Data C9  | Data C10  |

Some text after the table that should be normal width.
`;

const WIDE_CELL_TABLE = `
Table with very long cell content:

| Feature | Description | Status |
|---------|-------------|--------|
| Authentication | This is a very long description that goes on and on to test how table cells handle overflow with lots of text content inside them | Active |
| Authorization | Another extremely verbose description meant to test the behavior of table cell text wrapping in our markdown rendering pipeline | Pending |
| Data Processing | Yet another lengthy description to simulate real-world API documentation tables that often contain detailed explanations | Complete |
`;

const SIMPLE_TABLE = `
A simple table:

| Name | Age | City |
|------|-----|------|
| Alice | 30 | NYC |
| Bob | 25 | LA |
`;

const CODE_BLOCK = `
Here is some code:

\`\`\`python
def hello_world():
    print("Hello, World!")
    # This is a very long comment that might also cause horizontal overflow if not properly contained within the code block boundaries
    return {"status": "ok", "message": "This is a long string value that tests wrapping behavior in code blocks"}
\`\`\`

And some inline code: \`const x = 42;\`
`;

const LONG_TEXT = `
This is a long paragraph of text that should wrap normally within the chat bubble. It contains enough words to fill multiple lines and test how the layout handles standard paragraph content. The text should flow naturally and not cause any horizontal overflow or layout issues. This is exactly the kind of content you'd see in a typical chat application like ChatGPT, Claude, or other AI assistants.

Here is a second paragraph with **bold text**, *italic text*, and \`inline code\` to test various inline formatting options. We want to make sure none of these cause layout problems.
`;

const NESTED_CONTENT = `
## Heading

Here's a mix of content types:

1. First item with a table inside:

| Key | Value |
|-----|-------|
| foo | bar |
| baz | qux |

2. Second item with code:

\`\`\`javascript
const result = await fetch('/api/data');
\`\`\`

3. Third item with a nested list:
   - Sub-item A
   - Sub-item B
   - Sub-item C

> This is a blockquote that should also be properly contained within the message bubble.

And a [link to somewhere](https://example.com) for good measure.
`;

const MULTIPLE_TABLES = `
Here are several tables in sequence:

### Users Table
| ID | Name | Email | Role | Department | Location | Start Date |
|----|------|-------|------|------------|----------|------------|
| 1 | Alice Johnson | alice@example.com | Admin | Engineering | San Francisco | 2020-01-15 |
| 2 | Bob Smith | bob@example.com | User | Marketing | New York | 2021-03-22 |
| 3 | Charlie Brown | charlie@example.com | Moderator | Design | London | 2019-11-08 |

### Products Table
| SKU | Product Name | Category | Price | Stock | Rating |
|-----|-------------|----------|-------|-------|--------|
| A001 | Widget Pro | Electronics | $299.99 | 150 | 4.5 |
| B002 | Gadget Plus | Accessories | $49.99 | 500 | 4.2 |
| C003 | SuperTool X | Tools | $149.99 | 75 | 4.8 |

Some text between tables to verify spacing.

### API Endpoints
| Method | Endpoint | Description | Auth Required | Rate Limit |
|--------|----------|-------------|---------------|------------|
| GET | /api/users | List all users | Yes | 100/min |
| POST | /api/users | Create user | Yes | 10/min |
| PUT | /api/users/:id | Update user | Yes | 50/min |
| DELETE | /api/users/:id | Delete user | Yes | 5/min |
`;

const EXTREME_TABLE = `
An extremely wide table to stress-test overflow handling:

| Column A Very Long Header | Column B Another Long Header | Column C Extended Header Name | Column D Descriptive | Column E Wide Column | Column F Extra Wide | Column G Maximum Width | Column H Extended | Column I Very Long | Column J Final Column | Column K Bonus | Column L Extra |
|---------------------------|------------------------------|-------------------------------|---------------------|---------------------|--------------------|-----------------------|------------------|-------------------|----------------------|---------------|---------------|
| Some reasonably long data | More data here that is long | Extended cell content data | Cell D1 data val | Cell E1 data val | Cell F1 data | Cell G1 with content | Cell H1 extra | Cell I1 long val | Cell J1 final | Cell K1 | Cell L1 |
| Row 2 A | Row 2 B | Row 2 C | Row 2 D | Row 2 E | Row 2 F | Row 2 G | Row 2 H | Row 2 I | Row 2 J | Row 2 K | Row 2 L |
`;

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <div role="tabpanel" hidden={value !== index}>
    {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
  </div>
);

const pageStyles = (theme: Theme) => css({
  minHeight: "100vh",
  background: theme.vars.palette.background.default,
  color: theme.vars.palette.text.primary,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "2rem"
});

const containerStyles = css({
  width: "100%",
  maxWidth: "900px",
  display: "flex",
  flexDirection: "column",
  gap: "1rem"
});

const ChatMarkdownTest: React.FC = () => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);
  const chatStyles = createStyles(theme);

  const renderChatMessage = (
    content: string,
    role: "user" | "assistant",
    label: string
  ) => (
    <Box sx={{ mb: 3 }}>
      <Typography
        variant="caption"
        sx={{ color: "text.secondary", mb: 0.5, display: "block" }}
      >
        {label}
      </Typography>
      {/* Simulate the chat message list container */}
      <div css={chatStyles.chatMessagesList} className="chat-messages-list">
        <div
          className={`chat-message ${role}`}
          style={{ border: "1px dashed rgba(255,255,255,0.1)" }}
        >
          <div className="message-content">
            <ChatMarkdown content={content} />
          </div>
        </div>
      </div>
    </Box>
  );

  const tabs = [
    { label: "Wide Table", content: WIDE_TABLE },
    { label: "Wide Cells", content: WIDE_CELL_TABLE },
    { label: "Extreme Table", content: EXTREME_TABLE },
    { label: "Multiple Tables", content: MULTIPLE_TABLES },
    { label: "Simple Table", content: SIMPLE_TABLE },
    { label: "Code Block", content: CODE_BLOCK },
    { label: "Long Text", content: LONG_TEXT },
    { label: "Nested", content: NESTED_CONTENT }
  ];

  return (
    <div css={pageStyles(theme)}>
      <div css={containerStyles}>
        <Typography variant="h4" sx={{ mb: 2 }}>
          Chat Markdown Test
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          This page tests how different markdown content types render inside the
          chat view. Tables should scroll horizontally and never push the chat
          container wider. The layout should stay consistent like ChatGPT.
        </Typography>

        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 1 }}
        >
          {tabs.map((tab, i) => (
            <Tab key={i} label={tab.label} />
          ))}
        </Tabs>

        {tabs.map((tab, i) => (
          <TabPanel key={i} value={activeTab} index={i}>
            {renderChatMessage(tab.content, "assistant", `Assistant — ${tab.label}`)}
            {renderChatMessage(
              `Please show me: ${tab.label.toLowerCase()}`,
              "user",
              "User message"
            )}
          </TabPanel>
        ))}
      </div>
    </div>
  );
};

export default memo(ChatMarkdownTest);
