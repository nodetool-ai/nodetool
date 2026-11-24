#pragma once
#include "audio/vst/VstHostClient.h"
#include <QJsonObject>
#include <QVariantList>

namespace nt::audio::vst {
// Value-only snapshots cross from the GUI thread to the assistant worker and back.
struct PluginToolResult {
    QJsonObject result;
    QJsonObject document;
};
bool isPluginTool(const QString &name);
bool pluginToolMutates(const QString &name);
QVariantList pluginAssistantTools();
// Worker thread only. Borrows the thread-safe client for the duration of the call.
PluginToolResult runPluginTool(const QString &name, const QJsonObject &args, const QJsonObject &document,
                               VstHostClient &client);
} // namespace nt::audio::vst
