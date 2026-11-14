---
layout: page
title: "Podcast Repurposing Studio"
description: "Drop in one podcast episode and ship the whole content pack: titles and show notes, a newsletter edition, five social posts, and quote cards rendered as square images. Transcribed once, written four ways."
# This page mirrors the marketing site's version of the same use case, so the
# two competed for one query set across domains (docs/SEO_STRATEGY.md § 0.10,
# finding 4). The marketing page is the search destination — it carries the
# video, the shot gallery, and the HowTo schema — so it takes the canonical and
# this page stays for docs readers who browse the use-case index.
canonical_url: "https://nodetool.ai/templates/podcast-repurposing-studio"
---

<p class="usecase-eyebrow">Use case · Creators</p>

One episode in, a content pack out: titles and show notes, a newsletter
edition, five social posts, and quote cards rendered as square images.

## How it works

One transcription feeds four writer branches that run in parallel.

{% mermaid %}
graph LR
  audio["Episode audio (Audio)"]
  show["Show context (String)"]
  count["Quote count (Integer)"]
  asr["Transcribe (ASR)"]
  notes["Show notes (Agent)"]
  news["Newsletter (Agent)"]
  posts["Social posts (ListGenerator)"]
  quotes["Quotes (ListGenerator)"]
  cards["Quote cards (TextToImage)"]
  audio --> asr
  asr --> notes
  asr --> news
  asr --> posts
  asr --> quotes
  show --> notes
  show --> news
  show --> posts
  count --> quotes
  quotes --> cards
{% endmermaid %}

1. **Feed in the episode.** The recording, a line of show context (name, host,
   voice, call to action), and how many quote cards you want (2 to 8, default
   4). The shipped template is named *Podcast Repurposing Studio* (**Examples**
   in the sidebar, **Workflows** tab).
2. **Transcribe once.** A speech-recognition model turns the episode into a
   transcript that every branch reads from.
3. **Write the episode page.** An agent drafts three title options, a summary,
   chapter-style show notes, a resource list, and the closing CTA.
4. **Draft the newsletter.** A second agent writes the email edition in the
   host's voice: subject-line options and a body that teases instead of
   summarizing.
5. **Generate the posts.** A list generator writes five standalone social
   posts in mixed formats: a bold take, a question, a mini-story, a stat, a
   lesson.
6. **Render the quote cards.** Another list generator pulls the most quotable
   verbatim lines, and each one becomes a square typographic card via a
   text-to-image model.

## One recording, a week of content

Every branch reads the same transcript, so the newsletter teases what the show
notes explain and the quote cards quote the host verbatim.

## Make it yours

- Show notes, newsletter, and posts each have their own prompt and system
  prompt, so the newsletter can be personal and the posts punchy.
- Swap the transcription model for another Whisper variant, local or hosted.
  The branch prompts don't change.
- The quote-card prompt controls typography, palette, and format. Match your
  cover art, or use 9:16 for stories.
- A YouTube description, a LinkedIn essay, or a blog post is one more
  Prompt → Agent pair reading the same transcript.

## Models in this workflow

Calls use your own keys, so the provider bills you. The template ships with the
defaults below, each a dropdown.

| Role | Node | Shipped default | Also works with |
| --- | --- | --- | --- |
| Transcription | Automatic Speech Recognition | Whisper Large v3 on fal.ai | Other Whisper variants, hosted or local |
| Show notes, newsletter | Agent | GPT-5 mini | Any strong language model |
| Posts, quotes | List Generator | GPT-5 mini | Any language model |
| Quote cards | Text To Image | FLUX.1 Schnell (1:1, 1K) | A model with reliable text rendering (Nano Banana, GPT Image) |

See [Models &amp; Providers]({{ '/models-and-providers' | relative_url }}) to set up keys.

## Next steps

- Open the template: **Examples** in the sidebar, **Workflows** tab, *Podcast Repurposing Studio*
- [Ad Creative Factory]({{ '/use-cases/ad-creative-factory' | relative_url }}): the same fan-out, pointed at paid social
- [Transcribe Audio]({{ '/workflows/transcribe-audio' | relative_url }}): the transcription building block on its own
- [All use cases]({{ '/use-cases' | relative_url }})
