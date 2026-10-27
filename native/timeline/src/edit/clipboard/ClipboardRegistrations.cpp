#include "app/EditRegistry.h"
#include "edit/clipboard/ClipboardOps.h"
namespace {
const bool registered = [] {
    for (const auto &name :
         QStringList{"copy", "cut", "paste", "pasteInsert", "pasteClipAttributes", "pasteAttributes",
                     "duplicateSelected", "duplicate", "duplicateWithGap", "altDragCopy"}) {
        nt::app::registerEdit(name, [name](QJsonObject raw, const QJsonObject &payload) {
            return nt::edit::clipboard::applyClipboardEdit(name, std::move(raw), payload);
        });
    }
    return true;
}();
} // namespace
