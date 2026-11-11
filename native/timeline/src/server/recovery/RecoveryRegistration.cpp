#include "app/EditRegistry.h"
#include "server/AutosaveController.h"

namespace {
const bool registered = nt::app::registerEdit(QStringLiteral("restoreDocument"),
    [](QJsonObject raw, const QJsonObject& payload) {
        if (!payload.value("document").isObject()) {
            return raw;
        }
        const auto recovered = nt::server::documentForSave(payload.value("document").toObject());
        if (!recovered.value("clips").isArray() || !recovered.value("tracks").isArray()) {
            return raw;
        }
        // Replace content, including unknown fields and absent optional
        // fields, while keeping this load's identity, settings and save base.
        const auto previous = nt::server::documentForSave(raw);
        for (auto it = previous.begin(); it != previous.end(); ++it) {
            raw.remove(it.key());
        }
        for (auto it = recovered.begin(); it != recovered.end(); ++it) {
            raw.insert(it.key(), it.value());
        }
        return raw;
    });
} // namespace
