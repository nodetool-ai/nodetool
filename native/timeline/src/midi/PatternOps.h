#pragma once

// Step Sequencer assistant operations (SQ49-SQ55) and factory pattern library (SQ44).
// Document transforms operating on raw sequence JSON so MusicAssistant can
// validate before committing one undo step through TimelineModel::applyEdit.
//
// Thread affinity: application thread only. Library configuration belongs to the
// application object. Operations reject worker-thread calls before accessing it.

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

// The folder that holds the user step pattern library (SQ44): one JSON file per
// pattern under <root>/<Patterns|Templates>/<folder>/. Empty (the default) means
// no user library: saves return the pattern only and folder ops fail. The app
// sets it once at startup. Application thread only. Worker-thread setters are ignored.
[[nodiscard]] QString stepPatternLibraryRootForAppData(const QString& appData);
void setUserStepPatternLibraryRoot(const QString& root);
[[nodiscard]] QString userStepPatternLibraryRoot();

// Runs one op without mutating `document`. Library operations also persist files.
[[nodiscard]] StepPatternOpOutcome runStepPatternOp(const QJsonObject& document, const QString& name,
                                                    const QJsonObject& args);

}  // namespace nt::midi
