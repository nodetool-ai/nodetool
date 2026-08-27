import React, { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

import {
  findSkillTrigger,
  useTextareaSkillMention
} from "../useTextareaSkillMention";

const MOCK_SKILLS = [
  {
    id: "skill-a",
    name: "image-helper",
    description: "Create image prompts"
  },
  {
    id: "skill-b",
    name: "researcher",
    description: "Research a topic"
  },
  {
    id: "skill-c",
    name: "writer",
    description: "Draft clear copy"
  }
];

jest.mock("../../../../hooks/skills/useSkills", () => ({
  useSkills: () => ({ data: MOCK_SKILLS })
}));

describe("findSkillTrigger", () => {
  it("matches a slash at the start or after whitespace", () => {
    expect(findSkillTrigger("/", 1)).toEqual({ start: 0, end: 1, query: "" });
    expect(findSkillTrigger("hello /res", 10)).toEqual({
      start: 6,
      end: 10,
      query: "res"
    });
  });

  it("rejects slashes inside words and queries that cross whitespace", () => {
    expect(findSkillTrigger("https://example", 15)).toBeNull();
    expect(findSkillTrigger("hello /res topic", 16)).toBeNull();
  });

  it("uses the last trigger before the caret and caps the query", () => {
    expect(findSkillTrigger("/old /new", 9)).toEqual({
      start: 5,
      end: 9,
      query: "new"
    });
    expect(findSkillTrigger(`/${"x".repeat(65)}`, 66)).toBeNull();
  });
});

const Harness: React.FC = () => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const { skillMenu, handleKeyDown, isOpen, menuId } = useTextareaSkillMention({
    textareaRef,
    value,
    setValue
  });
  return (
    <>
      <textarea
        ref={textareaRef}
        aria-label="prompt"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {skillMenu}
    </>
  );
};

const renderHarness = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <Harness />
    </ThemeProvider>
  );

describe("useTextareaSkillMention", () => {
  it("opens and filters by skill name or description", async () => {
    const user = userEvent.setup();
    renderHarness();
    const textarea = screen.getByLabelText("prompt");

    await user.type(textarea, "/image");

    expect(await screen.findByTestId("skill-option-image-helper")).toBeInTheDocument();
    expect(screen.queryByTestId("skill-option-researcher")).not.toBeInTheDocument();
  });

  it("wraps arrow navigation and inserts the canonical name on Enter", async () => {
    const user = userEvent.setup();
    renderHarness();
    const textarea = screen.getByLabelText("prompt") as HTMLTextAreaElement;

    await user.type(textarea, "before /res after");
    textarea.setSelectionRange(11, 11);
    fireEvent(document, new Event("selectionchange"));
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());

    await user.keyboard("{ArrowUp}{Enter}");

    await waitFor(() => expect(textarea.value).toBe("before /researcher  after"));
    expect(textarea.selectionStart).toBe("before /researcher ".length);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("selects with Tab and keeps the textarea focused on mouse selection", async () => {
    const user = userEvent.setup();
    renderHarness();
    const textarea = screen.getByLabelText("prompt");

    await user.type(textarea, "/writer");
    const option = await screen.findByTestId("skill-option-writer");
    await user.click(option);

    expect(textarea).toHaveFocus();
    expect(textarea).toHaveValue("/writer ");

    await user.type(textarea, "/res");
    await user.keyboard("{Tab}");
    expect(textarea).toHaveValue("/writer /researcher ");
  });

  it("dismisses on Escape and outside click", async () => {
    const user = userEvent.setup();
    renderHarness();
    const textarea = screen.getByLabelText("prompt");

    await user.type(textarea, "/");
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(document.body);
    await user.type(textarea, "x");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(textarea);
    await user.keyboard("{End}{Enter}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
