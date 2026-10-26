#include "app/startup/DecodeDefault.h"

namespace nt::app {
namespace {
struct DefaultProvider {
    QString name;
    DecodeModeProvider function;
};
DefaultProvider& provider() {
    static DefaultProvider value;
    return value;
}
}

void registerDecodeModeProvider(QString name, DecodeModeProvider function) {
    provider() = {std::move(name), std::move(function)};
}
void clearDecodeModeProvider() { provider() = {}; }
QString resolveDecodeMode(const std::optional<QString>& decode, const std::optional<QString>& decoder) {
    if (decoder) { return *decoder; }
    if (decode) { return *decode; }
    return provider().function ? provider().function() : QStringLiteral("sw");
}
QString decodeModeHelp() {
    return provider().function ? QStringLiteral("Default from %1").arg(provider().name) : QStringLiteral("Default sw");
}
}
