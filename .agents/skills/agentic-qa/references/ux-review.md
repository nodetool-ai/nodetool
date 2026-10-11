# UX review of the screenshots

This page is for the coordinator. Never give it to a participant.

A participant chasing its goal reports what blocked it. It rarely reports a
defect it worked around or never needed. Round 4 found its most severe defect
this way: the participant retyped a garbled sentence in small pieces and called
it "possibly a tool-input-speed artifact". Run these checks on every session
before writing findings.

## Checks

| Check | How | Example it caught |
|---|---|---|
| Typed text arrived intact | List every `typed` receipt (`grep '"typed' steps.jsonl`) and crop the screenshot after each. Compare letter for letter. | "Hello, this is my test note." showed as "Hlo,ti smyetnt." in the text editor. |
| Labels are legible in both themes | When a session switches theme, crop every tooltip, menu, and toast in the new theme at full size. | Every tooltip in the light theme was dark text on a dark box (contrast 1.16). |
| Names survive a reload | Compare the tab bar, headings, and pickers on the screenshot before and after each Reload. | The home tab read "Personal" before a reload and "Home" after it. |
| Nothing points at a deleted thing | After a delete, check the open tabs, panels, and recent lists for an error where the item was. | A deleted text file's tab stayed open with "Failed to load text asset". |
| One event, one message | Count the toasts after each action. | Deleting one file showed "Asset deleted!" and "Deleted 1 file". |
| Empty states agree with saves | When a save succeeded, every panel that says "nothing here" is a finding unless it names where the item went. | Documents said "No documents yet" beside a saved text file. |
| The layout fits the viewport | In a `viewport` packet smaller than 1440 × 900, look for clipped dialogs, cut-off buttons, and content under docks. | Round 2's starter card cut off behind the Library panel. |
| The first viewport says it is loading | Read `S001`. A frame with chrome but no content and no spinner invites a click on the chrome. | In 3 of 4 sessions `S001` showed the top bar over an empty page, and one participant opened the New menu there. |

Crop at full size to read small text (`convert S012.png -crop 260x80+780+290
out.png`). A contact sheet is for finding the screenshot, not for quoting it.

## Reproduce before you classify

Reproduce each check failure with a scripted browser after the blind record is
frozen, under the participant's conditions and under a slower or more ordinary
one. Report both. The runner types one key every 15 ms, faster than most
people. The editor defect lost letters at 15 ms and not at 60 ms in this
environment, so the finding states both, and the severity follows from people
who type fast, hold a key down, or use a slow machine.

Separate a participant tool limit from a product defect. A blocked link that
opened a tab stranded one participant until the runner gained `close_tab`. That
was a runner gap, not a NodeTool finding.
