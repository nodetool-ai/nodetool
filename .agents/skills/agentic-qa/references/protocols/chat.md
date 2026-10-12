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

## `chat-find`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 30 actions, 10 minutes |
| State | `--state seeded-demo` |
| Credentials | None. Every provider is connected in this state |

**Goal.** "You have used this app before and had several conversations with
its assistant. One of them was about choosing a database for a search
feature. Find that conversation and ask one more question in it."

**Pass.** The follow-up question and its reply sit in the seeded thread
"Compare vector databases for RAG", under its earlier messages, and no new
thread was started for it.

**Checks.**

- Record how the participant found the thread: a search box, scrolling a
  list, or opening threads one by one. Count the threads it opened before
  the right one.
- Count the threads in the list before and after the follow-up. One more
  thread means the question went to a new conversation.
- Compare the thread's title in the tab and in the list after the follow-up.

**Routes.** The rail's "Chats" panel lists threads by date and has a search
field. A thread opens as a tab, with its earlier messages above the
composer.

**Fakes.** The seeded threads are titles with stored messages. The reply to
the follow-up reads "deterministic e2e response". This state is a returning
user (`seeded-demo`), not a new account.

**Known behavior.** Round 8 fixed seeded threads missing from every
project's Chats panel until a reload. The thread list read them before they
were moved into Personal.

## `model-switch`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key and one Anthropic test key |

**Goal.** "You have accounts with two different AI companies. Connect both to
this app. Ask the app's assistant a question, then switch the assistant over
to the other company's AI and ask a second question. Check which AI answered
each question."

**Pass.** Both providers are connected, two replies are visible, and the
screen shows that each came from a different model.

**Checks.**

- Read the model picker's label before each question and quote it.
- Record whether a reply names the model that wrote it, and whether that
  label changes for earlier replies when the picker changes.
- Record whether the second provider was connected from the model picker,
  the onboarding checklist, or Settings, and how many actions it took.

**Routes.**

- The model picker in the composer lists models by provider. A provider with
  no key offers to connect it.
- Settings, then the provider list, where each key has its own field.

**Fakes.** OpenAI lists "Test Chat Model" and Anthropic lists "Test Assistant
Model". Both reply "deterministic e2e response", so the replies differ only
by their model labels.

## `chat-delete`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |

**Goal.** "Have two short conversations with the app's assistant, about two
different things. Then delete one of them. Leave the page, come back, and
check that only the conversation you kept is still there."

**Pass.** After a reload, the kept thread opens with its messages, and no
surface lists or shows the deleted one.

**Checks.**

- Record whether the delete asked for confirmation and quote the dialog.
- After the delete, check every open tab, the "Chats" panel, and the Home
  recent list for the deleted thread, before and after the reload.
- Record which thread is in front after the delete, and whether the
  composer still points at the deleted thread.

**Routes.** The rail's "Chats" panel has a "Delete conversation" control on
each row. A chat tab closes with its own close button, which does not
delete the thread.

**Fakes.** Both threads get the same reply, so tell them apart by their
questions.
