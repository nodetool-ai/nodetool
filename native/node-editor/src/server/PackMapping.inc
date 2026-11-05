// Port of packages/protocol/src/builtin-packs.ts and web/src/utils/providerPacks.ts
// (using nodeProvider.ts). Keep namespace ownership and key gates in sync with those sources.
struct PackMapping {
    const char *id;
    QStringList namespaces;
    const char *key;
    bool required;
};
const QList<PackMapping> mappings = {
    {"whisper-cpp", {"whisper_cpp"}, "", false},
    {"base", {"anthropic", "claude_code", "codex", "gemini", "kie", "lib", "messaging", "mistral", "nodetool", "openai", "vector", "vertex", "xai"}, "ANTHROPIC_API_KEY", true},
    {"elevenlabs", {"elevenlabs"}, "ELEVENLABS_API_KEY", false},
    {"minimax", {"minimax"}, "MINIMAX_API_KEY", false},
    {"transformers-js", {"transformers"}, "", false},
    {"fal", {"fal"}, "FAL_API_KEY", false},
    {"kie", {"kie"}, "KIE_API_KEY", false},
    {"topaz", {"topaz"}, "TOPAZ_API_KEY", false},
    {"reve", {"reve"}, "REVE_API_KEY", false},
    {"atlascloud", {"atlascloud"}, "ATLASCLOUD_API_KEY", false},
    {"higgsfield", {"higgsfield"}, "HIGGSFIELD_API_KEY_ID", false},
    {"together", {"together"}, "TOGETHER_API_KEY", false},
    {"replicate", {"replicate"}, "REPLICATE_API_TOKEN", false},
    {"huggingface", {"huggingface"}, "", false},
};
