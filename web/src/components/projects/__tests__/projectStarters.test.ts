/**
 * What a project is named, what its agent is first told, and when an estimate
 * may be shown at all.
 */

import {
  composeFirstTurn,
  estimateFromHistory,
  formatEstimate,
  invokedStarter,
  projectNameFromPrompt,
  rankStarters,
  starterLabel,
  toggleStarterInPrompt,
  type ProjectStarter
} from "../projectStarters";
import type { ProjectDetail } from "../projectStatus";

const launch: ProjectStarter = {
  name: "launch-commercial",
  description: "Turn a product page into a finished launch commercial.",
  system: true
};

const assembledCut = {
  type: "timeline",
  ref: "cut-1",
  name: "Cut",
  updatedAt: "",
  status: { kind: "timeline", clips: 3, durationMs: 30000 },
  spendUsd: 0,
  unpricedCount: 0,
  thumbnails: [],
  preview: null
};

const summary = (
  kind: string,
  totalUsd: number,
  unpricedCount = 0,
  documents: unknown[] = [assembledCut]
): ProjectDetail =>
  ({
    project: {
      id: `p-${kind}-${totalUsd}`,
      name: kind,
      kind,
      threadId: null,
      createdAt: "",
      updatedAt: ""
    },
    documents,
    spend: { totalUsd, unpricedCount, byCategory: [] }
  }) as ProjectDetail;

describe("projectNameFromPrompt", () => {
  it("names the project after the prompt's first line", () => {
    expect(
      projectNameFromPrompt("Aurora launch spot\nwarm and minimal", launch)
    ).toBe("Aurora launch spot");
  });

  it("cuts a long first line at a word boundary", () => {
    const name = projectNameFromPrompt("word ".repeat(30), launch);
    expect(name.length).toBeLessThanOrEqual(61);
    expect(name.endsWith("…")).toBe(true);
  });

  // The command is for the agent; a tab named "/launch-commercial A spot…"
  // would read as a mistake.
  it("leaves the starter's slash command out of the name", () => {
    expect(
      projectNameFromPrompt("/launch-commercial A spot for our desk lamp", launch)
    ).toBe("A spot for our desk lamp");
    expect(
      projectNameFromPrompt("A spot /launch-commercial for our lamp", launch)
    ).toBe("A spot for our lamp");
  });

  it("names a prompt that is only the command after the starter", () => {
    expect(projectNameFromPrompt("/launch-commercial ", launch)).toBe(
      "Launch commercial"
    );
  });

  it("falls back to the starter when the prompt says nothing", () => {
    expect(projectNameFromPrompt("   ", launch)).toBe("Launch commercial");
    expect(projectNameFromPrompt("", null)).toBe("New project");
  });
});

describe("starterLabel", () => {
  it("reads a skill name as a label", () => {
    expect(starterLabel("launch-commercial")).toBe("Launch commercial");
    expect(starterLabel("music_video_treatment")).toBe(
      "Music video treatment"
    );
  });
});

describe("composeFirstTurn", () => {
  it("invokes the starter as a slash command above the prompt", () => {
    const turn = composeFirstTurn({
      prompt: "A spot for our desk lamp",
      starter: launch,
      entityNames: ["Aurora lamp", "Night street"]
    });
    expect(turn).toBe(
      "/launch-commercial\n\nA spot for our desk lamp\n\n" +
        "Use these entities: Aurora lamp, Night street."
    );
  });

  // The prompt's own `/` menu writes the command inline; a second copy above
  // it would load the skill twice and read as a mistake.
  it("writes no second copy when the prompt already invokes the starter", () => {
    expect(
      composeFirstTurn({
        prompt: "/launch-commercial A spot for our desk lamp",
        starter: launch,
        entityNames: []
      })
    ).toBe("/launch-commercial A spot for our desk lamp");
  });

  // A different skill named in the prompt is not this project's starter.
  it("still leads with the starter when the prompt invokes another skill", () => {
    expect(
      composeFirstTurn({
        prompt: "/house-style A spot for our desk lamp",
        starter: launch,
        entityNames: []
      })
    ).toBe("/launch-commercial\n\n/house-style A spot for our desk lamp");
  });

  // The host matches `/name` at the start of the text or after whitespace, so
  // the command must lead its own line and the prompt must survive verbatim.
  it("leaves a prompt of its own alone when no starter is picked", () => {
    expect(
      composeFirstTurn({
        prompt: "Whatever I want",
        starter: null,
        entityNames: []
      })
    ).toBe("Whatever I want");
  });
});

const houseStyle: ProjectStarter = {
  name: "house-style",
  description: "Our house grade and typography.",
  system: false
};

describe("invokedStarter", () => {
  const starters = [launch, houseStyle];

  it("reads the starter off a `/name` anywhere in the prompt", () => {
    expect(invokedStarter("/launch-commercial A spot", starters)).toBe(launch);
    expect(invokedStarter("A spot, /house-style please", starters)).toBe(
      houseStyle
    );
  });

  it("is null when no skill is invoked, or only a prefix of one is", () => {
    expect(invokedStarter("A spot for our lamp", starters)).toBeNull();
    expect(invokedStarter("/launch A spot", starters)).toBeNull();
    expect(invokedStarter("/launch-commercial-v2 A spot", starters)).toBeNull();
    // A slash inside a word is a path or a fraction, not a command.
    expect(invokedStarter("see docs/launch-commercial", starters)).toBeNull();
  });

  it("takes the first command written when the prompt names two", () => {
    expect(
      invokedStarter("/house-style then /launch-commercial", starters)
    ).toBe(houseStyle);
  });
});

describe("toggleStarterInPrompt", () => {
  it("writes a picked starter in front of the ask", () => {
    expect(toggleStarterInPrompt("A spot", null, "launch-commercial")).toBe(
      "/launch-commercial A spot"
    );
    expect(toggleStarterInPrompt("", null, "launch-commercial")).toBe(
      "/launch-commercial "
    );
  });

  it("swaps the starter in place when the prompt already carries one", () => {
    expect(
      toggleStarterInPrompt(
        "A spot /house-style please",
        "house-style",
        "launch-commercial"
      )
    ).toBe("A spot /launch-commercial please");
  });

  it("takes the command out when the starter is let go", () => {
    expect(
      toggleStarterInPrompt("/launch-commercial A spot", "launch-commercial", null)
    ).toBe("A spot");
    expect(
      toggleStarterInPrompt("A spot /launch-commercial lit", "launch-commercial", null)
    ).toBe("A spot lit");
    expect(
      toggleStarterInPrompt("/launch-commercial ", "launch-commercial", null)
    ).toBe("");
  });

  it("leaves the prompt alone when there is nothing to let go", () => {
    expect(toggleStarterInPrompt("A spot", null, null)).toBe("A spot");
  });
});

describe("rankStarters", () => {
  const cut: ProjectStarter = {
    name: "beat-sync-editing",
    description: "Cut to music.",
    system: true
  };
  const at = (kind: string, updatedAt: string): ProjectDetail =>
    ({
      ...summary(kind, 3),
      project: { ...summary(kind, 3).project, updatedAt }
    }) as ProjectDetail;

  it("puts starters used before first, the most recent ahead", () => {
    expect(
      rankStarters(
        [houseStyle, cut, launch],
        [at("launch-commercial", "2026-01-01"), at("beat-sync-editing", "2026-03-01")]
      ).map((starter) => starter.name)
    ).toEqual(["beat-sync-editing", "launch-commercial", "house-style"]);
  });

  it("keeps the catalog's order when nothing was started before", () => {
    expect(
      rankStarters([houseStyle, cut, launch], [at("", "2026-03-01")]).map(
        (starter) => starter.name
      )
    ).toEqual(["house-style", "beat-sync-editing", "launch-commercial"]);
  });

  // A guide to prompting one model line is loaded by the agent mid-run, not
  // started from; it goes to the back unless this user did start from it.
  it("ranks the model-line prompting guides last", () => {
    const veo: ProjectStarter = {
      name: "veo-3-prompting",
      description: "Prompt Veo 3.",
      system: true
    };
    expect(
      rankStarters([veo, houseStyle, launch], []).map((starter) => starter.name)
    ).toEqual(["house-style", "launch-commercial", "veo-3-prompting"]);
    expect(
      rankStarters([veo, houseStyle, launch], [at("veo-3-prompting", "2026-03-01")]).map(
        (starter) => starter.name
      )
    ).toEqual(["veo-3-prompting", "house-style", "launch-commercial"]);
  });
});

describe("estimateFromHistory", () => {
  it("reads a range off past projects of the same kind", () => {
    const estimate = estimateFromHistory(
      [summary("spot", 3.1), summary("spot", 5.8), summary("trailer", 40)],
      "spot"
    );
    expect(estimate).toEqual({ minUsd: 3.1, maxUsd: 5.8, samples: 2 });
    expect(formatEstimate(estimate!)).toBe(
      "est. $3.10–$5.80 · from 2 past projects · provider rates, no markup"
    );
  });

  it("gives no estimate from fewer than two priced projects", () => {
    expect(estimateFromHistory([summary("spot", 3.1)], "spot")).toBeNull();
    expect(estimateFromHistory([], "spot")).toBeNull();
  });

  it("leaves out a project whose total is only a lower bound", () => {
    expect(
      estimateFromHistory([summary("spot", 3.1), summary("spot", 5.8, 2)], "spot")
    ).toBeNull();
  });

  it("has nothing to read for a project started with no starter", () => {
    expect(estimateFromHistory([summary("", 3.1), summary("", 5.8)], "")).toBeNull();
  });

  it("leaves out an abandoned project — cheap and no cut assembled", () => {
    const abandoned = summary("spot", 0.05, 0, []);
    expect(
      estimateFromHistory([abandoned, summary("spot", 0.06, 0, [])], "spot")
    ).toBeNull();
  });

  it("leaves out a priced project under the spend floor even with a cut", () => {
    const cheapButCut = summary("spot", 0.05);
    expect(
      estimateFromHistory([cheapButCut, summary("spot", 0.06)], "spot")
    ).toBeNull();
  });

  it("leaves out a project above the floor that never assembled a cut", () => {
    const noCut = summary("spot", 5, 0, []);
    expect(estimateFromHistory([noCut, summary("spot", 6, 0, [])], "spot")).toBeNull();
  });

  it("returns null when nothing in the sample qualifies as completed", () => {
    const partial = summary("spot", 0.05, 0, []);
    const alsoPartial = summary("spot", 0.02, 0, []);
    expect(estimateFromHistory([partial, alsoPartial], "spot")).toBeNull();
  });
});
