---
layout: page
title: "Podcast Repurposing Studio"
description: "Drop in one podcast episode and ship the whole content pack: titles and show notes, a newsletter edition, five social posts, and quote cards rendered as square images. Transcribed once, written four ways."
---

<p class="usecase-eyebrow">Use case · Creators</p>

Drop in one episode and ship the whole content pack: titles and show notes, a
newsletter edition, five social posts, and quote cards rendered as square
images. This is the work podcasters rent per-seat repurposing tools for, or
skip entirely — here it's one canvas that already knows your show's voice.

An episode's value doesn't stop at the RSS feed: the episode page, the email
list, and the social feeds each need their own version of it, every week. That
recurring rewrite is exactly what this graph automates — transcribe once, fan
out to every format.

## How it works

One transcription, four writer branches. Everything downstream of the
transcript runs in parallel.

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
   voice, call to action), and how many quote cards you want.
2. **Transcribe once.** A speech-recognition model turns the episode into a
   transcript that every branch reads from.
3. **Write the episode page.** An agent drafts three title options, a summary,
   chapter-style show notes, a resource list, and the closing CTA.
4. **Draft the newsletter.** A second agent writes the email edition in the
   host's voice — subject-line options and a body that teases instead of
   summarizes.
5. **Generate the posts.** A list generator writes five standalone social
   posts in mixed formats: a bold take, a question, a mini-story, a stat, a
   lesson.
6. **Render the quote cards.** Another list generator pulls the most quotable
   verbatim lines, and each one becomes a square typographic card via a
   text-to-image model.

## One recording, a week of content

Everything reads from the same transcript, so the pack is consistent: the
newsletter teases what the show notes explain, and the quote cards say it in
the host's own words. Run it as the last step of every edit session and
publishing day becomes an upload, not a writing shift.

## Make it yours

- **Tune each voice separately.** Show notes, newsletter, and posts each have
  their own prompt and system prompt — make the newsletter personal and the
  posts punchy without compromise.
- **Swap the transcription model.** Whisper variants, local or hosted — the
  branch prompts don't change.
- **Restyle the cards.** The quote-card prompt controls typography, palette,
  and format. Match your cover art, or go 9:16 for stories.
- **Add branches.** A YouTube description, a LinkedIn essay, a blog post —
  each is one more Prompt → Agent pair reading the same transcript.

## Models in this workflow

The template ships with no models selected — pick one per role when you open
it. Called with your own keys; the bill comes from the provider.

| Role | Node | Works well with |
| --- | --- | --- |
| Transcription | Automatic Speech Recognition | Whisper (hosted or local) |
| Show notes, newsletter | Agent | Any strong language model |
| Posts, quotes | List Generator | Any language model |
| Quote cards | Text To Image | A model with reliable text rendering (Nano Banana, GPT Image) |

See [Models &amp; Providers]({{ '/models-and-providers' | relative_url }}) to set up keys.

## Next steps

- Open the template: **Templates → Podcast Repurposing Studio** in the dashboard
- [Ad Creative Factory]({{ '/use-cases/ad-creative-factory' | relative_url }}) — the same fan-out, pointed at paid social
- [Transcribe Audio]({{ '/workflows/transcribe-audio' | relative_url }}) — the transcription building block on its own
- [All use cases]({{ '/use-cases' | relative_url }})
