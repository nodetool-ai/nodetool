/**
 * Tests for the three-way per-unit merge engine (`documentMerge.ts`).
 * Uses a generic storyboard-shaped adapter; every branch of the engine is
 * covered against it.
 */
import {
  mergeByUnits,
  type DocumentMergeAdapter,
  type MergeCollection,
  type MergeUnitField
} from "../documentMerge";
import type { DocumentOp } from "@nodetool-ai/protocol";

interface SubItem {
  id: string;
  v?: string;
  text?: string;
}

interface Unit {
  id: string;
  label: string;
  value?: string;
  items?: SubItem[];
}

interface Doc {
  name: string;
  units: Unit[];
}

const collection: MergeCollection<Doc> = {
  kind: "unit",
  read: (doc) => doc.units,
  write: (doc, units) => ({ ...doc, units: units as Unit[] }),
  unitId: (u) => (u as Unit).id,
  unitLabel: (u) => (u as Unit).label
};

const adapter = (
  opsAttribution = true
): DocumentMergeAdapter<Doc> => {
  const unitsTouchedByOp = (op: DocumentOp) => {
    if (op.tool === "update_unit") {
      return [{ kind: "unit", unitId: (op.input as { id: string }).id }];
    }
    if (op.tool === "add_unit") {
      return [
        { kind: "unit", unitId: (op.input as { unit: Unit }).unit.id }
      ];
    }
    if (op.tool === "set_name") {
      return [{ kind: "field" }];
    }
    // reorder touches everything but changes no content.
    return [];
  };
  const core: DocumentMergeAdapter<Doc> = {
    collections: [collection],
    scalars: [
      {
        name: "name",
        read: (doc) => doc.name,
        write: (doc, value) => ({ ...doc, name: value as string })
      }
    ]
  };
  if (opsAttribution) core.unitsTouchedByOp = unitsTouchedByOp;
  return core;
};

const base: Doc = {
  name: "board",
  units: [
    { id: "a", label: "Unit A", value: "1" },
    { id: "b", label: "Unit B", value: "2" }
  ]
};

describe("mergeByUnits", () => {
  describe("no ops → whole-document replacement", () => {
    it("keeps a dirty draft and emits one replaced conflict", () => {
      const draft: Doc = { ...base, units: [{ ...base.units[0], value: "draft" }, base.units[1]] };
      const server: Doc = { ...base, units: [{ ...base.units[0], value: "agent" }, { ...base.units[1], value: "agent-b" }] };

      const result = mergeByUnits(base, draft, server, adapter());

      expect(result.doc).toEqual(draft);
      expect(result.conflicts).toEqual([
        {
          unit: { kind: "document", id: "document", label: "document" },
          external: server,
          reason: "replaced"
        }
      ]);
    });
  });

  describe("per-unit merge", () => {
    const draft: Doc = { ...base, units: [{ ...base.units[0], value: "draft" }] };
    const serverWithA: Doc = {
      ...base,
      units: [{ ...base.units[0], value: "agent" }]
    };
    const ops: DocumentOp[] = [{ tool: "update_unit", input: { id: "a" } }];

    it("takes a server-only change into the draft", () => {
      const untouchedDraft: Doc = { ...base };
      const result = mergeByUnits(base, untouchedDraft, serverWithA, adapter(), { ops });

      expect(result.doc.units[0].value).toBe("agent");
      expect(result.conflicts).toEqual([]);
    });

    it("keeps the draft on a contested unit and lists the conflict", () => {
      const result = mergeByUnits(base, draft, serverWithA, adapter(), { ops });

      expect(result.doc.units[0]).toMatchObject({ id: "a", value: "draft" });
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({
        unit: { kind: "unit", id: "a", label: "Unit A" },
        external: { id: "a", value: "agent" },
        reason: "edited"
      });
    });

    it("does not contest both-changed units another write touched", () => {
      const serverB: Doc = {
        ...base,
        units: [base.units[0], { ...base.units[1], value: "agent-b" }]
      };
      const draftA: Doc = {
        ...base,
        units: [{ ...base.units[0], value: "draft" }, base.units[1]]
      };

      const result = mergeByUnits(base, draftA, serverB, adapter(), {
        ops: [{ tool: "update_unit", input: { id: "b" } }]
      });

      expect(result.doc.units[0].value).toBe("draft");
      expect(result.conflicts).toEqual([]);
    });

    it("falls back to diff-based touching when no op is attributed", () => {
      const server: Doc = {
        ...base,
        units: [{ ...base.units[0], value: "agent" }, base.units[1]]
      };
      const draft: Doc = {
        ...base,
        units: [{ ...base.units[0], value: "draft" }, base.units[1]]
      };

      const result = mergeByUnits(base, draft, server, adapter(), {
        ops: [{ tool: "unknown_op", input: {} }]
      });

      // The write touched nothing the adapter can name, so every slot where
      // base, draft and server genuinely disagree is a contest.
      expect(result.doc.units[0].value).toBe("draft");
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({
        unit: { kind: "unit", id: "a" },
        reason: "edited"
      });
    });

    it("keeps a draft edit over an external delete and lists the conflict", () => {
      const deletedServer: Doc = { ...base, units: [] };

      const result = mergeByUnits(base, draft, deletedServer, adapter(), { ops });

      expect(result.doc.units.map((u) => u.id)).toEqual(["a"]);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({
        unit: { kind: "unit", id: "a" },
        external: null,
        reason: "deleted"
      });
    });

    it("lets a draft delete stand when the server did not touch the unit", () => {
      const draftDeleted: Doc = { ...base, units: [base.units[0]] };
      const server: Doc = {
        ...base,
        units: [base.units[0], { ...base.units[1], value: "agent-b" }]
      };

      const result = mergeByUnits(base, draftDeleted, server, adapter(), {
        ops: [{ tool: "update_unit", input: { id: "b" } }]
      });

      expect(result.doc.units.map((u) => u.id)).toEqual(["a"]);
      expect(result.conflicts).toEqual([]);
    });

    it("inserts server-only units at their server index after draft units", () => {
      const draftNew: Doc = {
        ...base,
        units: [...base.units, { id: "d", label: "Unit D", value: "" }]
      };
      const serverNew: Doc = {
        ...base,
        units: [
          base.units[0],
          { id: "c", label: "Unit C", value: "new" },
          base.units[1],
          { id: "e", label: "Unit E", value: "new" }
        ]
      };

      const result = mergeByUnits(base, draftNew, serverNew, adapter(), {
        ops: [{ tool: "add_unit", input: { unit: { id: "c" } } }]
      });

      expect(result.doc.units.map((u) => u.id)).toEqual([
        "a",
        "c",
        "b",
        "e",
        "d"
      ]);
      expect(result.conflicts).toEqual([]);
    });
  });

  describe("scalars", () => {
    it("take the server value when the draft did not touch them", () => {
      const server: Doc = { ...base, name: "renamed" };
      const result = mergeByUnits(base, { ...base }, server, adapter(), {
        ops: [{ tool: "set_name", input: {} }]
      });
      expect(result.doc.name).toBe("renamed");
      expect(result.conflicts).toEqual([]);
    });

    it("keep the draft value and list a conflict when both changed", () => {
      const result = mergeByUnits(
        base,
        { ...base, name: "mine" },
        { ...base, name: "theirs" },
        adapter(),
        { ops: [{ tool: "set_name", input: {} }] }
      );
      expect(result.doc.name).toBe("mine");
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({
        unit: { kind: "field", id: "name" },
        external: "theirs",
        draft: "mine",
        reason: "edited"
      });
    });
  });

  describe("conflict draft values", () => {
    it("carries the draft unit on an edited collection conflict", () => {
      const draft = {
        ...base,
        units: [{ ...base.units[0], value: "mine" }, base.units[1]]
      };
      const server = {
        ...base,
        units: [{ ...base.units[0], value: "theirs" }, base.units[1]]
      };
      const result = mergeByUnits(base, draft, server, adapter(), {
        ops: [{ tool: "update_unit", input: { id: "a" } }]
      });
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({
        unit: { kind: "unit", id: "a" },
        reason: "edited",
        draft: { id: "a", value: "mine" },
        external: { id: "a", value: "theirs" }
      });
    });
  });

  describe("field-level merge inside a unit", () => {
    const withSubs: MergeCollection<Doc> = {
      ...collection,
      unitFields: [
        { field: "items", itemId: (item) => (item as { id: string }).id }
      ]
    };
    const subAdapter: DocumentMergeAdapter<Doc> = {
      collections: [withSubs],
      scalars: [],
      unitsTouchedByOp: (op) => {
        if (op.tool === "update_unit") {
          return [{ kind: "unit", unitId: (op.input as { id: string }).id }];
        }
        return [];
      }
    };

    it("merges a server-added sub-item into a dirty unit without conflict", () => {
      const b3: Doc = {
        ...base,
        units: [
          { id: "a", label: "Unit A", value: "1", items: [{ id: "t1", v: "old" }] },
          base.units[1]
        ]
      };
      const draftDirty: Doc = {
        ...b3,
        units: [
          { ...b3.units[0], value: "draft-edited" },
          b3.units[1]
        ]
      };
      const serverVoiced: Doc = {
        ...b3,
        units: [
          {
            ...b3.units[0],
            value: "1",
            items: [
              { id: "t1", v: "old" },
              { id: "t2", v: "new-take" }
            ]
          },
          b3.units[1]
        ]
      };

      const result = mergeByUnits(b3, draftDirty, serverVoiced, subAdapter, {
        ops: [{ tool: "update_unit", input: { id: "a" } }]
      });

      expect(result.doc.units[0]).toEqual({
        id: "a",
        label: "Unit A",
        value: "draft-edited",
        items: [
          { id: "t1", v: "old" },
          { id: "t2", v: "new-take" }
        ]
      });
      expect(result.conflicts).toEqual([]);
    });
  });

  describe("conflictKind sub-items report their own conflicts", () => {
    interface Line {
      id: string;
      text: string;
    }
    const lineFields: MergeUnitField[] = [
      {
        field: "items",
        itemId: (item) => (item as Line).id,
        conflictKind: "line",
        itemLabel: (item) => `Line ${(item as Line).text}`
      }
    ];
    const lineAdapter: DocumentMergeAdapter<Doc> = {
      collections: [
        {
          ...collection,
          unitFields: lineFields
        }
      ],
      scalars: [],
      unitsTouchedByOp: (op) => {
        if (op.tool === "update_unit") {
          return [{ kind: "unit", unitId: (op.input as { id: string }).id }];
        }
        // Sub-item contests are gated by their own path attribution.
        if (op.tool === "set_line_text") {
          return [
            {
              kind: "unit.items",
              unitId: (op.input as { line_id: string }).line_id
            }
          ];
        }
        return [];
      }
    };
    const mk = (id: string, items: Line[]): Unit => ({
      id,
      label: id,
      items
    });

    it("reports one contested sub-item without conflicting its section or siblings", () => {
      const baseDoc: Doc = {
        name: "s",
        units: [
          mk("sec", [
            { id: "l1", text: "one" },
            { id: "l2", text: "two" }
          ])
        ]
      };
      const draftDoc: Doc = {
        name: "s",
        units: [
          mk("sec", [
            { id: "l1", text: "draft-one" },
            { id: "l2", text: "two" }
          ])
        ]
      };
      const serverDoc: Doc = {
        name: "s",
        units: [
          mk("sec", [
            { id: "l1", text: "agent-one" },
            { id: "l2", text: "agent-two" }
          ])
        ]
      };

      const result = mergeByUnits(baseDoc, draftDoc, serverDoc, lineAdapter, {
        ops: [
          { tool: "update_unit", input: { id: "sec" } },
          { tool: "set_line_text", input: { line_id: "l1" } }
        ]
      });

      // l1 contested per line; l2 took the server's text silently; the
      // section itself is not listed.
      expect(result.doc.units[0].items).toEqual([
        { id: "l1", text: "draft-one" },
        { id: "l2", text: "agent-two" }
      ]);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({
        unit: { kind: "line", id: "l1", label: "Line draft-one" },
        external: { id: "l1", text: "agent-one" },
        reason: "edited"
      });
    });
  });

  describe("ops gate every contest", () => {
    it("keeps a scalar the draft changed without a conflict when the write did not touch it", () => {
      const result = mergeByUnits(
        base,
        { ...base, name: "mine" },
        { ...base, name: "theirs" },
        adapter(),
        { ops: [{ tool: "update_unit", input: { id: "a" } }] }
      );
      expect(result.doc.name).toBe("mine");
      expect(result.conflicts).toEqual([]);
    });

    it("contests both-created units the write touched", () => {
      const draftNew: Doc = {
        ...base,
        units: [...base.units, { id: "c", label: "Unit C", value: "mine" }]
      };
      const serverNew: Doc = {
        ...base,
        units: [...base.units, { id: "c", label: "Unit C", value: "theirs" }]
      };

      const result = mergeByUnits(base, draftNew, serverNew, adapter(), {
        ops: [{ tool: "add_unit", input: { unit: { id: "c" } } }]
      });

      expect(result.doc.units[2].value).toBe("mine");
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({
        unit: { kind: "unit", id: "c" },
        external: { id: "c", value: "theirs" },
        draft: { id: "c", value: "mine" },
        reason: "edited"
      });
    });

    it("keeps a both-created unit silently when the write did not touch it", () => {
      const draftNew: Doc = {
        ...base,
        units: [...base.units, { id: "c", label: "Unit C", value: "mine" }]
      };
      const serverNew: Doc = {
        ...base,
        units: [...base.units, { id: "c", label: "Unit C", value: "theirs" }]
      };

      const result = mergeByUnits(base, draftNew, serverNew, adapter(), {
        ops: [{ tool: "update_unit", input: { id: "a" } }]
      });

      expect(result.doc.units[2].value).toBe("mine");
      expect(result.conflicts).toEqual([]);
    });

    it("keeps a dirty unit over an external delete the write did not touch", () => {
      const draftDirty: Doc = {
        ...base,
        units: [{ ...base.units[0], value: "draft" }, base.units[1]]
      };
      const serverDeleted: Doc = { ...base, units: [base.units[1]] };

      const result = mergeByUnits(base, draftDirty, serverDeleted, adapter(), {
        ops: [{ tool: "update_unit", input: { id: "b" } }]
      });

      expect(result.doc.units.map((u) => u.id)).toEqual(["a", "b"]);
      expect(result.conflicts).toEqual([]);
    });
  });

  describe("sub-item branches", () => {
    interface Line {
      id: string;
      text: string;
    }
    const lineAdapter: DocumentMergeAdapter<Doc> = {
      collections: [
        {
          ...collection,
          unitFields: [
            {
              field: "items",
              itemId: (item) => (item as Line).id,
              conflictKind: "line",
              itemLabel: (item) => `Line ${(item as Line).text}`
            }
          ]
        }
      ],
      scalars: [],
      unitsTouchedByOp: (op) => {
        if (op.tool === "update_unit") {
          return [{ kind: "unit", unitId: (op.input as { id: string }).id }];
        }
        if (op.tool === "set_line_text") {
          return [
            {
              kind: "unit.items",
              unitId: (op.input as { line_id: string }).line_id
            }
          ];
        }
        return [];
      }
    };
    const sec = (items: Line[]): Unit => ({ id: "sec", label: "sec", items });
    const baseDoc: Doc = {
      name: "s",
      units: [sec([{ id: "l1", text: "one" }, { id: "l2", text: "two" }])]
    };
    const touchAll: DocumentOp[] = [
      { tool: "update_unit", input: { id: "sec" } },
      { tool: "set_line_text", input: { line_id: "l1" } },
      { tool: "set_line_text", input: { line_id: "l2" } }
    ];

    it("reports a server change to a sub-item the draft deleted", () => {
      const draftDoc: Doc = { name: "s", units: [sec([{ id: "l1", text: "one" }])] };
      const serverDoc: Doc = {
        name: "s",
        units: [sec([{ id: "l1", text: "one" }, { id: "l2", text: "agent-two" }])]
      };

      const result = mergeByUnits(baseDoc, draftDoc, serverDoc, lineAdapter, {
        ops: touchAll
      });

      expect(result.doc.units[0].items?.map((i) => i.id)).toEqual(["l1"]);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({
        unit: { kind: "line", id: "l2", label: "Line agent-two" },
        external: { id: "l2", text: "agent-two" },
        reason: "deleted"
      });
      expect(result.conflicts[0].draft).toBeUndefined();
    });

    it("keeps a dirty sub-item an external delete removed and carries the draft", () => {
      const draftDoc: Doc = {
        name: "s",
        units: [sec([{ id: "l1", text: "one" }, { id: "l2", text: "draft-two" }])]
      };
      const serverDoc: Doc = { name: "s", units: [sec([{ id: "l1", text: "one" }])] };

      const result = mergeByUnits(baseDoc, draftDoc, serverDoc, lineAdapter, {
        ops: touchAll
      });

      expect(result.doc.units[0].items?.map((i) => i.id)).toEqual(["l1", "l2"]);
      expect(result.conflicts).toEqual([
        {
          unit: { kind: "line", id: "l2", label: "Line draft-two" },
          external: null,
          draft: { id: "l2", text: "draft-two" },
          reason: "deleted"
        }
      ]);
    });

    it("drops an external sub-item delete the draft left untouched", () => {
      const draftDoc: Doc = {
        name: "s",
        units: [sec([{ id: "l1", text: "draft-one" }, { id: "l2", text: "two" }])]
      };
      const serverDoc: Doc = {
        name: "s",
        units: [sec([{ id: "l1", text: "one" }])]
      };

      const result = mergeByUnits(baseDoc, draftDoc, serverDoc, lineAdapter, {
        ops: touchAll
      });

      // l2 was untouched in the draft, so the external delete stands; l1 keeps
      // the draft text because the server never changed it.
      expect(result.doc.units[0].items).toEqual([
        { id: "l1", text: "draft-one" }
      ]);
      expect(result.conflicts).toEqual([]);
    });

    it("contests a sub-item both sides created with different values", () => {
      const draftDoc: Doc = {
        name: "s",
        units: [
          sec([
            { id: "l1", text: "one" },
            { id: "l2", text: "two" },
            { id: "l3", text: "mine" }
          ])
        ]
      };
      const serverDoc: Doc = {
        name: "s",
        units: [
          sec([
            { id: "l1", text: "one" },
            { id: "l2", text: "two" },
            { id: "l3", text: "theirs" }
          ])
        ]
      };

      const result = mergeByUnits(baseDoc, draftDoc, serverDoc, lineAdapter, {
        ops: [
          { tool: "update_unit", input: { id: "sec" } },
          { tool: "set_line_text", input: { line_id: "l3" } }
        ]
      });

      expect(result.doc.units[0].items?.[2]).toEqual({ id: "l3", text: "mine" });
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({
        unit: { kind: "line", id: "l3" },
        external: { id: "l3", text: "theirs" },
        draft: { id: "l3", text: "mine" },
        reason: "edited"
      });
    });

    it("recurses into nested fields: a take added to a dirty line is not a conflict", () => {
      interface Take {
        id: string;
        audio: string;
      }
      interface NestedLine {
        id: string;
        text: string;
        takes?: Take[];
      }
      interface NestedUnit {
        id: string;
        label: string;
        lines: NestedLine[];
      }
      interface NestedDoc {
        name: string;
        sections: NestedUnit[];
      }
      const nestedAdapter: DocumentMergeAdapter<NestedDoc> = {
        collections: [
          {
            kind: "section",
            read: (doc) => doc.sections,
            write: (doc, sections) => ({
              ...doc,
              sections: sections as NestedUnit[]
            }),
            unitId: (u) => (u as NestedUnit).id,
            unitLabel: (u) => (u as NestedUnit).label,
            unitFields: [
              {
                field: "lines",
                itemId: (item) => (item as NestedLine).id,
                conflictKind: "line",
                itemLabel: (item) => (item as NestedLine).id,
                fields: [
                  {
                    field: "takes",
                    itemId: (item) => (item as Take).id,
                    conflictKind: "take",
                    itemLabel: (item) => (item as Take).id
                  }
                ]
              }
            ]
          }
        ],
        unitsTouchedByOp: (op) => {
          if (op.tool === "append_take") {
            return [
              {
                kind: "section.lines",
                unitId: (op.input as { line_id: string }).line_id
              }
            ];
          }
          return [];
        }
      };

      const section = (lines: NestedLine[]): NestedUnit => ({
        id: "s1",
        label: "s1",
        lines
      });
      const nestedBase: NestedDoc = {
        name: "script",
        sections: [section([{ id: "l1", text: "hello", takes: [] }])]
      };
      const nestedDraft: NestedDoc = {
        name: "script",
        sections: [section([{ id: "l1", text: "draft text", takes: [] }])]
      };
      const nestedServer: NestedDoc = {
        name: "script",
        sections: [
          section([
            { id: "l1", text: "hello", takes: [{ id: "t1", audio: "a.wav" }] }
          ])
        ]
      };

      const result = mergeByUnits(
        nestedBase,
        nestedDraft,
        nestedServer,
        nestedAdapter,
        { ops: [{ tool: "append_take", input: { line_id: "l1" } }] }
      );

      expect(result.doc.sections[0].lines[0]).toEqual({
        id: "l1",
        text: "draft text",
        takes: [{ id: "t1", audio: "a.wav" }]
      });
      expect(result.conflicts).toEqual([]);
    });
  });

  it("never mutates its inputs", () => {
    const draft: Doc = { ...base, units: [{ ...base.units[0], value: "draft" }] };
    const server: Doc = {
      ...base,
      units: [{ ...base.units[0], value: "agent" }],
      name: "renamed"
    };
    const draftCopy = JSON.parse(JSON.stringify(draft));
    const serverCopy = JSON.parse(JSON.stringify(server));

    mergeByUnits(base, draft, server, adapter(), {
      ops: [
        { tool: "update_unit", input: { id: "a" } },
        { tool: "set_name", input: {} }
      ]
    });

    expect(draft).toEqual(draftCopy);
    expect(server).toEqual(serverCopy);
  });
});
