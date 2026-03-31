"""
Language Practice Coach DSL Example

Practice speaking a foreign language with AI-powered feedback and coaching.

Workflow:
1. **Audio Input** - Record your voice speaking in the target language
2. **Automatic Speech Recognition** - Transcribe spoken audio to text
3. **Language Coach** - AI analyzes pronunciation, grammar, and provides feedback
4. **Feedback Output** - Display comprehensive coaching feedback

Use cases:
- Practice pronunciation in a foreign language
- Get instant grammar and vocabulary feedback
- Improve fluency with structured coaching
- Learn idioms and natural expressions
"""

import os
from nodetool.dsl.graph import create_graph, run_graph
from nodetool.dsl.nodetool.input import AudioInput, StringInput
from nodetool.dsl.nodetool.text import AutomaticSpeechRecognition, FormatText
from nodetool.dsl.nodetool.agents import Agent
from nodetool.dsl.nodetool.output import Output
from nodetool.metadata.types import ASRModel, AudioRef, LanguageModel, Provider

# Sample audio file (can be replaced with user recording)
sample_audio_file = os.path.join(os.path.dirname(__file__), "harvard.mp3")

# Target language selection
target_language = StringInput(
    name="target_language",
    description="The language you are practicing (e.g., Spanish, French, German, Japanese)",
    value="English",
)

# Native language for explanations
native_language = StringInput(
    name="native_language",
    description="Your native language for explanations",
    value="English",
)

# Audio input - user's spoken practice
audio_input = AudioInput(
    name="audio",
    description="Record yourself speaking in the target language",
    value=AudioRef(
        uri=f"file://{sample_audio_file}",
        type="audio",
    ),
)

# Transcribe the audio using Automatic Speech Recognition
transcription = AutomaticSpeechRecognition(
    audio=audio_input.output,
    model=ASRModel(
        id="gpt-4o-mini-transcribe",
        provider=Provider.OpenAI,
        type="asr_model",
    ),
)

# Create coaching prompt with transcription and language context
coaching_prompt = FormatText(
    template="""Analyze this spoken {{ target_lang }} practice:

Transcription:
"{{ transcription }}"

Please provide feedback as a language coach:

1. **Pronunciation Assessment**
   - Identify any words that may have been mispronounced based on the transcription
   - Suggest correct pronunciation tips

2. **Grammar Check**
   - Point out any grammatical errors
   - Explain the correct grammar rules

3. **Vocabulary Enhancement**
   - Suggest alternative words or phrases that sound more natural
   - Introduce relevant idioms or expressions

4. **Fluency Tips**
   - Comment on sentence structure and flow
   - Suggest ways to sound more native

5. **Practice Exercise**
   - Provide a follow-up sentence or phrase to practice
   - Give a mini dialogue scenario to try

Provide explanations in {{ native_lang }} when helpful for understanding.""",
    target_lang=target_language.output,
    native_lang=native_language.output,
    transcription=transcription.out.text,
)

# AI Language Coach provides feedback
language_coach = Agent(
    prompt=coaching_prompt.output,
    model=LanguageModel(
        type="language_model",
        id="gpt-4o-mini",
        provider=Provider.OpenAI,
    ),
    system="""You are an expert language coach and tutor with years of experience teaching foreign languages.

Your approach:
- Be encouraging and supportive while providing honest feedback
- Focus on practical, actionable improvements
- Use examples to illustrate points
- Celebrate progress and effort
- Adapt explanations to the learner's native language
- Make learning fun and engaging

Remember: The goal is to help the learner improve their confidence and skills in speaking the target language.""",
    max_tokens=1500,
)

# Format the final coaching report
coaching_report = FormatText(
    template="""# 🎯 Language Practice Coaching Report

## Your Practice Session
**Target Language:** {{ target_lang }}
**Native Language:** {{ native_lang }}

## What You Said (Transcription):
> {{ transcription }}

---

## Coach's Feedback:
{{ feedback }}

---

## 💡 Remember:
Practice makes progress! Keep speaking and don't be afraid to make mistakes - that's how we learn! 🌟""",
    target_lang=target_language.output,
    native_lang=native_language.output,
    transcription=transcription.out.text,
    feedback=language_coach.out.text,
)

# Output the coaching feedback
output = Output(
    name="coaching_report",
    value=coaching_report.output,
)

# Create the graph
graph = create_graph(output)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Language Practice Coach DSL example")
    parser.add_argument(
        "--gradio",
        action="store_true",
        help="Launch a Gradio UI for this workflow",
    )
    args = parser.parse_args()

    if args.gradio:
        try:
            from nodetool.ui.gradio_auto import build_gradio_app
        except Exception:
            print(
                "Gradio UI requires the optional dependency 'gradio'.\n"
                "Install it with: pip install gradio",
            )
            raise

        app = build_gradio_app(
            graph,
            title="Language Practice Coach (DSL)",
            description=(
                "Record yourself speaking in a foreign language and get instant AI coaching feedback on pronunciation, grammar, and fluency."
            ),
        )
        app.launch()
    else:
        result = run_graph(graph)
        print(result["coaching_report"])
