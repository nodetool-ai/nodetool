#pragma once

// Step Sequencer assistant operations (SQ49-SQ55) and factory pattern library (SQ44).
// Pure document transforms operating on raw sequence JSON so MusicAssistant can
// validate before committing one undo step through TimelineModel::applyEdit.
//
// Thread affinity: pure functions with no mutable state; safe to call from the
// GUI thread or tests.

#include <QJsonArray>
#include <QJsonObject>
#include <QString>
#include <QVariantList>

namespace nt::midi {

struct StepPatternOpOutcome {
    bool ok = false;
    bool mutated = false;
    QJsonObject nextDocument;
    QJsonObject result;
    QString error;
};

// The 32 step sequencer tool schemas (SQ49-SQ55), each with `timeline_id`
// required and no other property allowed (TS strictParams).
[[nodiscard]] QVariantList stepPatternAssistantTools();

// True when the op's contract has argument `key` (for example `clipId`).
[[nodiscard]] bool stepPatternOpTakes(const QString& op, const QString& key);

// True for any of the 32 tools, with or without the `ui_timeline_` prefix.
[[nodiscard]] bool isStepPatternTool(const QString& name);

// Canonical op name ("get_pattern", "set_steps", ...) or empty if unknown.
[[nodiscard]] QString canonicalStepPatternOp(const QString& name);

// All 32 factory step patterns (24) and templates (8) exported from TS.
[[nodiscard]] QJsonArray factoryStepPatternLibrary();

// Runs one op purely against `document`. Does not mutate `document`.
[[nodiscard]] StepPatternOpOutcome runStepPatternOp(const QJsonObject& document, const QString& name,
                                                    const QJsonObject& args);

}  // namespace nt::midi
