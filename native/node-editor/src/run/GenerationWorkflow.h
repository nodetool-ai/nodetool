#pragma once
#include <QJsonObject>
#include <QString>

namespace nodetool::node_editor {

// The editable graph a recorded media generation opens as: prompt input,
// template, generator and output nodes. Port of renderedWorkflow in
// packages/presets/src/eject.ts, which the web Generations panel's Open as
// workflow action uses for a workflow run's prediction.
//
// Pure functions, callable from any thread.
struct RecordedGeneration {
  QString provider;
  QString model;
  // The prediction's capability, such as text_to_image.
  QString capability;
  QString prompt;
  // The provider parameters the generation sent, merged into the generator.
  QJsonObject params;
};

// The preset mode a prediction capability renders as, or an empty string
// when the web has no generator for it.
QString generationMode(const QString &capability);

// A workflow document ({name, graph: {nodes, edges}}) for the generation, or
// an empty object when it lacks a provider, model, prompt or known mode.
QJsonObject recordedGenerationWorkflow(const RecordedGeneration &generation, const QString &name);

}  // namespace nodetool::node_editor
