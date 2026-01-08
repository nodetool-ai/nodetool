import {
  useRecentTemplatesStore,
  RecentTemplate,
} from "../RecentTemplatesStore";

describe("RecentTemplatesStore", () => {
  const initialState = useRecentTemplatesStore.getState();

  const sampleTemplate1: Omit<RecentTemplate, "lastUsed" | "useCount"> = {
    id: "template-1",
    name: "Image Generator",
    description: "Generate images from text",
    category: "image",
    tags: ["generation", "image"],
  };

  const sampleTemplate2: Omit<RecentTemplate, "lastUsed" | "useCount"> = {
    id: "template-2",
    name: "Text Analyzer",
    description: "Analyze text content",
    category: "text",
    tags: ["analysis", "text"],
  };

  const sampleTemplate3: Omit<RecentTemplate, "lastUsed" | "useCount"> = {
    id: "template-3",
    name: "Audio Processor",
    description: "Process audio files",
    category: "audio",
    tags: ["audio", "processing"],
  };

  afterEach(() => {
    useRecentTemplatesStore.setState(initialState, true);
    localStorage.clear();
  });

  test("initial state is empty", () => {
    expect(useRecentTemplatesStore.getState().recentTemplates).toEqual([]);
    expect(useRecentTemplatesStore.getState().pinnedTemplates).toEqual([]);
  });

  test("addTemplate adds a new template", () => {
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate1);
    const templates = useRecentTemplatesStore.getState().recentTemplates;
    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe("template-1");
    expect(templates[0].useCount).toBe(1);
    expect(templates[0].name).toBe("Image Generator");
  });

  test("addTemplate increments use count for existing template", () => {
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate1);
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate1);
    const templates = useRecentTemplatesStore.getState().recentTemplates;
    expect(templates).toHaveLength(1);
    expect(templates[0].useCount).toBe(2);
  });

  test("addTemplate updates lastUsed timestamp", () => {
    const beforeAdd = Date.now();
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate1);
    const template = useRecentTemplatesStore.getState().recentTemplates[0];
    expect(template.lastUsed).toBeGreaterThanOrEqual(beforeAdd);
  });

  test("removeTemplate removes template from list", () => {
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate1);
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate2);
    useRecentTemplatesStore.getState().removeTemplate("template-1");
    const templates = useRecentTemplatesStore.getState().recentTemplates;
    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe("template-2");
  });

  test("removeTemplate also unpins the template", () => {
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate1);
    useRecentTemplatesStore.getState().pinTemplate("template-1");
    useRecentTemplatesStore.getState().removeTemplate("template-1");
    expect(useRecentTemplatesStore.getState().pinnedTemplates).toEqual([]);
  });

  test("pinTemplate adds template to pinned list", () => {
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate1);
    useRecentTemplatesStore.getState().pinTemplate("template-1");
    expect(useRecentTemplatesStore.getState().pinnedTemplates).toContain("template-1");
  });

  test("pinTemplate does not add duplicate", () => {
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate1);
    useRecentTemplatesStore.getState().pinTemplate("template-1");
    useRecentTemplatesStore.getState().pinTemplate("template-1");
    const pinned = useRecentTemplatesStore.getState().pinnedTemplates;
    expect(pinned.filter((id) => id === "template-1")).toHaveLength(1);
  });

  test("unpinTemplate removes template from pinned list", () => {
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate1);
    useRecentTemplatesStore.getState().pinTemplate("template-1");
    useRecentTemplatesStore.getState().unpinTemplate("template-1");
    expect(useRecentTemplatesStore.getState().pinnedTemplates).not.toContain("template-1");
  });

  test("clearRecentTemplates clears all templates and pins", () => {
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate1);
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate2);
    useRecentTemplatesStore.getState().pinTemplate("template-1");
    useRecentTemplatesStore.getState().clearRecentTemplates();
    expect(useRecentTemplatesStore.getState().recentTemplates).toEqual([]);
    expect(useRecentTemplatesStore.getState().pinnedTemplates).toEqual([]);
  });

  test("getSortedTemplates returns pinned first, then by use count", () => {
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate1);
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate2);
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate3);
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate1);
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate1);
    useRecentTemplatesStore.getState().pinTemplate("template-2");

    const sorted = useRecentTemplatesStore.getState().getSortedTemplates();
    expect(sorted[0].id).toBe("template-2");
  });

  test("getTemplatesByCategory filters by category", () => {
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate1);
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate2);
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate3);

    const imageTemplates = useRecentTemplatesStore.getState().getTemplatesByCategory("image");
    expect(imageTemplates).toHaveLength(1);
    expect(imageTemplates[0].id).toBe("template-1");
  });

  test("templates are limited to maxRecentTemplates", () => {
    for (let i = 0; i < 25; i++) {
      useRecentTemplatesStore.getState().addTemplate({
        id: `template-${i}`,
        name: `Template ${i}`,
        description: `Description ${i}`,
        category: "test",
        tags: [],
      });
    }
    const templates = useRecentTemplatesStore.getState().recentTemplates;
    expect(templates.length).toBeLessThanOrEqual(
      useRecentTemplatesStore.getState().maxRecentTemplates
    );
  });

  test("state is persisted to localStorage", () => {
    useRecentTemplatesStore.getState().addTemplate(sampleTemplate1);
    useRecentTemplatesStore.getState().pinTemplate("template-1");

    const persisted = JSON.parse(
      localStorage.getItem("recent-templates-storage") || "{}"
    );
    expect(persisted.state.recentTemplates).toBeDefined();
    expect(persisted.state.pinnedTemplates).toContain("template-1");
  });
});
