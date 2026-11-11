#pragma once
#include <QString>
#include <functional>
#include <optional>

namespace nt::app {
using DecodeModeProvider = std::function<QString()>;
void registerDecodeModeProvider(QString name, DecodeModeProvider provider);
void clearDecodeModeProvider();
QString resolveDecodeMode(const std::optional<QString>& decode = {}, const std::optional<QString>& decoder = {});
QString decodeModeHelp();
}
