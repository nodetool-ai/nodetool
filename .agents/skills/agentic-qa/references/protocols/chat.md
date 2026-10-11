# Chat protocols

This page is for the coordinator. Never give it to a participant. See
[README.md](README.md) for how to use a protocol.

## `chat`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |
| Goal | The `chat` row in [journeys.md](../journeys.md#outcome-goals) |

**Pass.** A reply under the participant's own question, and the same thread
opened again after a reload through visible navigation.

**Checks.**

- Compare the question on screen with the typed receipt, letter for letter.
- After the reload, compare the thread's title in the tab and in the list.
- Count the messages in the thread before and after the reload.

**Routes.**

- Home composer, then a model pick ("Test Chat Model"), which opens a chat
  tab.
- "+ New", then "New chat".
- After the reload: the rail's "Chats" panel lists threads by date. Each
  opens as a tab.

**Fakes.** Every reply reads "deterministic e2e response", whatever the
question.

**Known behavior.** The Chats panel has no button that starts a chat. Its
empty state says "Start a chat from the workspace New menu."

**Regression.** `web/tests/journeys/chat.spec.ts`.

## `ask-file`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |
| Assets | One short `.txt` file with a few facts, for example `trip-notes.txt` |
| Goal | The `ask-file` row in [journeys.md](../journeys.md#outcome-goals) |

**Pass.** After a reload, the question in the thread still shows the attached
file.

**Checks.**

- Read the attachment chip at full size before sending and after the reload.
- Record whether the participant attached the file in the composer or
  uploaded it to the Library first.

**Routes.** The composer's attach control and the file chooser, or an upload
to the Library followed by a reference from the composer.

**Fakes.** The reply ignores the file. Judge only that the file reached the
conversation and stayed on it.

**Known behavior.** The composer's attachment chip truncates the file name to
a few letters ("trip-…"), so two similar files cannot be told apart.
