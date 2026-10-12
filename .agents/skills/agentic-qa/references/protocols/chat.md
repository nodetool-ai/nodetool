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

## `chat-threads`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |
| Goal | The `chat-threads` row in [journeys.md](../journeys.md#outcome-goals) |

**Pass.** Two threads, each holding only its own questions, opened again
after a reload through visible navigation. The first thread holds the
follow-up message.

**Checks.**

- Count the replies under each question when the participant switches back
  to the first thread, after the follow-up, and after the reload. One reply
  per question each time.
- Compare each question on screen with its typed receipt, letter for letter.
- Record whether the participant switched threads through the tab strip or
  the rail's "Chats" panel.

**Routes.**

- The first chat starts from the Home composer and a model pick, or from
  "+ New", then "New chat". The second chat starts from "+ New" again.
- Switching back: the first chat's tab, or its row in the rail's "Chats"
  panel.

**Fakes.** Every reply reads "deterministic e2e response", so the two threads
differ only in their questions. Tell them apart by the questions.

**Known behavior.** Round 6 fixed a reply that showed twice after switching
back to a thread (the stream placeholder kept beside the stored row). A
doubled reply again is a regression of that fix, not a new finding.

**Regression.** `web/src/stores/__tests__/GlobalChatStore.test.ts`, the
`loadMessages` placeholder cases.
