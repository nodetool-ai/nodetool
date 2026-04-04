"""
Game Encounter Planner Agent Workflow Example

Coordinate a squad of AI agents to design, critique, and brief a Frostfang
Tundra combat encounter. Instead of hand-authored filters, agents negotiate the
wave structure, evaluate balance risks, and author the final designer briefing.

Game dev workflow:
- Designers trigger the graph from their editor, then import `encounter_waves`
  into Blueprint/DataTable assets (Unreal) or ScriptableObjects (Unity) to power
  encounter spawners, keeping the JSON schema stable across prototypes.
- QA or production dashboards ingest `qa_review_notes`, attaching flags to Jira
  tasks or internal playtest notes so tuning decisions stay linked to gameplay
  telemetry.
- Narrative and level designers paste `designer_briefing` into Confluence,
  Notion, or in-editor notes panels, ensuring combat intent ships with the map.

Game illustration:

    Frostfang Pass (players approach north → south)
        [Glacial Overlook]  Wave 1: Skirmish screens + Shaman wards
                ↓ choke of ice pillars
        [Frozen Causeway]   Wave 2: Flanker surge + Brute anchor
                ↓ shattered bridge drop
        [Matriarch Lair]    Wave 3: Frostwyrm + Howler control

Players advance through frozen trenches while blizzards pulse on timers; the
planner agent enforces these beats, QA exposes danger spikes, and the briefing
records intent for the whole strike team.

Workflow:
1. **Encounter inputs** – Target biome, difficulty profile, and reusable roster
2. **Planning agent** – Crafts a JSON encounter plan using only the allowed foes
3. **Balance reviewer** – Audits the plan for pacing, spikes, and mitigation
4. **Briefing author** – Produces the markdown packet for encounter designers
5. **Outputs** – Structured waves, QA review notes, and the final briefing
"""

from nodetool.dsl.graph import create_graph, run_graph_sync
from nodetool.dsl.nodetool.agents import Agent
from nodetool.dsl.nodetool.constant import List as ListConstant
from nodetool.dsl.nodetool.input import StringInput
from nodetool.dsl.nodetool.output import Output
from nodetool.dsl.nodetool.text import FormatText
from nodetool.dsl.lib.json import StringifyJSON, ParseDict, GetJSONPathList, GetJSONPathStr
from nodetool.metadata.types import LanguageModel, Provider


# --- Encounter context -------------------------------------------------------

target_biome = StringInput(
    name="target_biome",
    description="Target biome for the encounter",
    value="Frostfang Tundra",
)

difficulty_profile = StringInput(
    name="difficulty_profile",
    description="How demanding the encounter should feel",
    value="Veteran party, late Act II, expects layered mechanics and spike moments",
)

design_focus = StringInput(
    name="design_focus",
    description="Experience goals that should guide the waves",
    value="Blend attrition with decisive boss pressure while highlighting terrain control and frost-based status effects.",
)

enemy_roster = ListConstant(
    value=[
        {
            "wave": 1,
            "name": "Icefang Skirmisher",
            "role": "flanker",
            "biome": "Frostfang Tundra",
            "danger": 5,
            "hp": 120,
            "spawn_count": 6,
        },
        {
            "wave": 1,
            "name": "Frostborn Shaman",
            "role": "support",
            "biome": "Frostfang Tundra",
            "danger": 7,
            "hp": 180,
            "spawn_count": 2,
        },
        {
            "wave": 2,
            "name": "Glacier Brute",
            "role": "tank",
            "biome": "Frostfang Tundra",
            "danger": 8,
            "hp": 420,
            "spawn_count": 1,
        },
        {
            "wave": 2,
            "name": "Icefang Skirmisher",
            "role": "flanker",
            "biome": "Frostfang Tundra",
            "danger": 5,
            "hp": 120,
            "spawn_count": 8,
        },
        {
            "wave": 3,
            "name": "Frostwyrm Matriarch",
            "role": "boss",
            "biome": "Frostfang Tundra",
            "danger": 10,
            "hp": 950,
            "spawn_count": 1,
        },
        {
            "wave": 3,
            "name": "Runic Howler",
            "role": "controller",
            "biome": "Frostfang Tundra",
            "danger": 7,
            "hp": 260,
            "spawn_count": 2,
        },
        {
            "wave": 1,
            "name": "Ashen Marauder",
            "role": "flanker",
            "biome": "Volcanic Rift",
            "danger": 6,
            "hp": 140,
            "spawn_count": 5,
        },
        {
            "wave": 2,
            "name": "Cinder Titan",
            "role": "tank",
            "biome": "Volcanic Rift",
            "danger": 9,
            "hp": 600,
            "spawn_count": 1,
        },
    ]
)

roster_payload = StringifyJSON(data=enemy_roster.output)


# --- Encounter planning agent ------------------------------------------------

planner_prompt = FormatText(
    template="""You are the encounter architect for an action RPG.

Encounter context:
- Biome: {{ biome }}
- Difficulty profile: {{ difficulty }}
- Design focus: {{ focus }}

Enemy roster (JSON array). You must restrict selections to this data:
{{ roster }}

Responsibilities:
1. Build a three-wave encounter that escalates tension and difficulty.
2. Only use enemies that match the biome "Frostfang Tundra".
3. Track `danger_budget` by summing (danger * count) for each wave.
4. Keep counts as integers and make sure spawn totals are realistic for the roster.
5. Include tactical notes that explain positioning, synergies, or environmental hooks.

Output requirements:
- Respond with a single JSON object only.
- Keys: "macro_strategy" (string), "waves" (array), "balance_notes" (array of strings).
- Each wave object must contain: "wave" (int), "theme" (string), "danger_budget" (int),
  "spawn_total" (int), "tactics" (string), and "picks" (array of enemy dictionaries with
  keys "name", "role", "count", "rationale").
- Do not include code fences, comments, or extra narration.
""",
    biome=target_biome.output,
    difficulty=difficulty_profile.output,
    focus=design_focus.output,
    roster=roster_payload.output,
)

encounter_planner = Agent(
    system=(
        "You are a veteran encounter designer. Produce balanced, data-grounded plans, "
        "and respond with strict JSON that matches the requested schema. Validate your "
        "calculations before finalizing."
    ),
    prompt=planner_prompt.output,
    model=LanguageModel(
        type="language_model",
        id="gpt-4o-mini",
        provider=Provider.OpenAI,
    ),
    max_tokens=900,
)

encounter_plan = ParseDict(json_string=encounter_planner.out.text)
wave_plan = GetJSONPathList(data=encounter_plan.output, path="waves")
macro_strategy = GetJSONPathStr(
    data=encounter_plan.output, path="macro_strategy", default=""
)
balance_notes = GetJSONPathList(data=encounter_plan.output, path="balance_notes")
wave_plan_json = StringifyJSON(data=wave_plan.output)


# --- Balance review agent ----------------------------------------------------

review_prompt = FormatText(
    template="""You are the encounter QA lead. Stress test the encounter plan below.

Context:
- Biome: {{ biome }}
- Difficulty profile: {{ difficulty }}

Encounter plan (JSON):
{{ plan }}

Deliverables:
1. Start with a short paragraph summarizing pacing and risk spikes.
2. Provide a bullet list titled "Risk Flags" covering potential player pain points.
3. Provide a bullet list titled "Mitigations" with concrete tuning or encounter scripting fixes.
Keep the tone actionable and avoid markdown headers beyond the requested labels.
""",
    biome=target_biome.output,
    difficulty=difficulty_profile.output,
    plan=encounter_planner.out.text,
)

balance_reviewer = Agent(
    system=(
        "You are a sharp-eyed gameplay QA lead. Identify exploit risks, damage spikes, "
        "and tuning issues in encounter plans. Give concise, actionable feedback."
    ),
    prompt=review_prompt.output,
    model=LanguageModel(
        type="language_model",
        id="gpt-4o-mini",
        provider=Provider.OpenAI,
    ),
    max_tokens=600,
)


# --- Designer briefing agent -------------------------------------------------

briefing_prompt = FormatText(
    template="""You are the lead encounter designer preparing a briefing for cross-functional teammates.

Encounter context:
- Biome: {{ biome }}
- Difficulty profile: {{ difficulty }}
- Design focus: {{ focus }}

Macro strategy: {{ strategy }}

Wave plan (JSON):
{{ waves }}

QA review notes:
{{ qa_review }}

Compose markdown with sections:
1. Overview (summarize macro strategy and player beats in 2-3 sentences)
2. Wave Breakdown (subsections for each wave with theme, enemy list, danger budget, spawn total, and tactics)
3. QA Calls To Action (two bullet lists: "Risk Flags" and "Mitigation Actions" based on the QA notes)
End with a short reminder about next playtest goals.
""",
    biome=target_biome.output,
    difficulty=difficulty_profile.output,
    focus=design_focus.output,
    strategy=macro_strategy.output,
    waves=wave_plan_json.output,
    qa_review=balance_reviewer.out.text,
)

briefing_author = Agent(
    system=(
        "You assemble clear, production-ready briefs. Reformat supplied data, do not invent new enemies, "
        "and ensure markdown is clean and concise."
    ),
    prompt=briefing_prompt.output,
    model=LanguageModel(
        type="language_model",
        id="gpt-4o",
        provider=Provider.OpenAI,
    ),
    max_tokens=900,
)


# --- Outputs -----------------------------------------------------------------

wave_plan_output = Output(
    name="encounter_waves",
    description="Structured wave composition proposed by the planning agent",
    value=wave_plan.output,
)

qa_notes_output = Output(
    name="qa_review_notes",
    description="QA agent assessment of pacing risks and mitigation ideas",
    value=balance_reviewer.out.text,
)

briefing_output = Output(
    name="designer_briefing",
    description="Markdown briefing summarizing the encounter plan and QA guidance",
    value=briefing_author.out.text,
)


graph = create_graph(
    wave_plan_output,
    qa_notes_output,
    briefing_output,
)


if __name__ == "__main__":
    result = run_graph_sync(graph)
    print("Designer briefing:\n", result["designer_briefing"])
    print("\nQA review notes:\n", result["qa_review_notes"])
    print("\nTotal waves:", len(result["encounter_waves"]))
