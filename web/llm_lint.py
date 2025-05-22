"""Helper for generating documentation suggestions using Anthropic."""

import sys
import anthropic
import os


def get_files(folder):
    """Return all TypeScript source files within *folder*."""
    files = []
    for file in os.listdir(folder):
        if file.endswith(".ts") or file.endswith(".tsx"):
            files.append(os.path.join(folder, file))
    return files


def get_content(*folders):
    """Concatenate the contents of all TypeScript files in *folders*."""
    content = ""
    for folder in folders:
        for file in get_files(folder):
            content += "\n\n"
            content += f"## {file}\n\n"
            with open(file, "r", encoding="utf-8") as f:
                content += f.read()
    return content


folder = sys.argv[1]
combined = get_content(folder)

print("Number of characters in the combined content:", len(combined))

client = anthropic.Anthropic()
message = client.messages.create(
    model="claude-3-haiku-20240307",
    max_tokens=4000,
    temperature=0.7,
    # system="""Analyze the source files and give recommendations on how to improve the code quality.""",
    system="""System Prompt for Documenting a Codebase

Objective: Provide concise, comprehensive documentation for each file.
Rule Set for Generating Code Comments:
Always start with a one-line summary of the file's purpose and functionality
Only if appropriate: follow up with JSDoc comments for functions and classes, providing a brief description, parameters, and return values.
Props and Parameters: Describe each prop and parameter's effect on behavior as short as possible.
State Description: Provide insights on state changes, reasons, and conditions for transitions.
Return Values: Detail return types and the conditions under which different values are returned, focus on edge cases.
Side Effects: Discuss side effects if any, and the conditions under which they occur.
Dependencies: Specify dependencies only if relevant, NEVER mention React, useState, Emotion, Mui, etc.

DONTS:
- Don't start with the file name or path
- Do not mention 'the component' or 'the file'
- Do not start with 'This file ...' or 'This component ...', instead, start with an appropriate variation of 'Contains ...' or 'Implements, Provides, Renders, etc. ...'.
- Avoid repeating the same information across multiple files.
- Never speculate, do not write 'likely' or 'seems to', if unsure just ignore the part.
- Do not repeat the same information in different words, if the first line says everything needed, go on to the next file.
DOS:
- divide long sentences into multiple short ones.
- Focus on explaining any significant patterns or architectural decisions.
- be clear, concise, and free of superfluous details!
- Keep sentences short and to the point, avoid long paragraphs!
- Write a text for each file (do not combine multile files into one text)

Examples:
bad: 'The component uses the `useState` hook to manage the current tab index, and the `helpStyles` function to apply custom styles to the help interface.'
good: 'Manages the current tab index'
---
bad: 'Contains the `AssetExplorer` component, which renders the main asset explorer interface with the `AssetGrid` component.'
good: 'Renders the main asset explorer interface with the `AssetGrid` component.'
---
bad: 'The component provides actions to download the asset and close the viewer.'
good: 'Provides actions to download the asset and close the viewer.'
---
bad: 'This file contains the `DataTypesList` component, which renders a list of available data types with their corresponding icons, names, and descriptions. The list can be filtered by entering a search term in the provided text field.
good: 'DataTypesList component - renders data types list: icons, names, descriptions. Filterable by search.'
---
REMEMBER: Always start with a one-line summary of the file's purpose and functionality,
the goal is to provide a concise, comprehensive documentation for each file.
- start with an appropriate variation of 'Contains ...' or 'Implements, Provides, Renders, etc. ...
- !!! NEVER EVER mention react, useState, Emotion, Mui, styles functions to apply custom styles, etc. !!!
- !!! wrap the comments in a JS comment block !!!

""",
    messages=[
        {
            "role": "user",
            "content": [{"type": "text", "text": combined}],
        },
    ],
)

for m in message.content:
    print(m.text)
