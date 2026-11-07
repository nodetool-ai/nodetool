// --dump-menus prints the labels of the menu bar for scripts/menu-parity.mjs.
#include "app/CliModes.h"
#include "app/Menus/ShellMenus.h"

#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTextStream>

namespace {
QJsonArray dump(const std::vector<nt::app::ShellMenuItem>& items) {
    QJsonArray out;
    for (const auto& item : items) {
        if (item.separator) { continue; }
        QJsonObject entry{{"label", item.label}, {"action", item.action}};
        if (!item.children.empty()) { entry.insert("items", dump(item.children)); }
        out.append(entry);
    }
    return out;
}
const bool registered = nt::app::registerCliMode({"--dump-menus", [](int argc, char** argv) {
    // The standard shortcuts need a platform. This one opens no window.
    qputenv("QT_QPA_PLATFORM", "offscreen");
    QGuiApplication app(argc, argv);
    QJsonArray menus;
    for (const auto& menu : nt::app::shellMenuDescription("premiere")) {
        menus.append(QJsonObject{{"label", menu.label}, {"items", dump(menu.items)}});
    }
    QTextStream(stdout) << QJsonDocument(menus).toJson();
    return 0;
}, nt::app::CliStage::BeforeServerArgs});
}  // namespace
