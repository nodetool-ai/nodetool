// File > the account entries. Cloud sign-in is opt-in: a fresh install works
// on this computer, and no bar shows a sign-in control. The entries read and
// drive the document bar's `documentAccount` item, which holds the account,
// the server menu and the server dialog. UI thread only: the menu reads and
// runs the entries on the window's thread.
#include "app/MenuRegistry.h"
#include "wiring/w/SceneItems.h"

#include <QQuickItem>

namespace {
QQuickItem* host(const QVariantMap& context) {
    auto* gestures = qobject_cast<QQuickItem*>(context.value(QStringLiteral("gestures")).value<QObject*>());
    return nt::wiring::w::windowItem(gestures, QStringLiteral("documentAccount"));
}
bool flag(const QVariantMap& context, const char* name) {
    auto* item = host(context);
    return item && item->property(name).toBool();
}
bool call(const QVariantMap& context, const char* method) {
    auto* item = host(context);
    QVariant done;
    return item && QMetaObject::invokeMethod(item, method, Q_RETURN_ARG(QVariant, done)) && done.toBool();
}
const QString signInReason = QStringLiteral("Cloud sign-in is not available in this window.");

const bool signIn = nt::app::registerShellMenuItem([] {
    nt::app::ShellMenuEntry entry{QStringLiteral("File"), QStringLiteral("accountSignIn"),
        QStringLiteral("Sign In to NodeTool Cloud…"), {}, {}, QStringLiteral("account"), 45,
        [](const QVariantMap& c) {
            return flag(c, "signedIn") || flag(c, "signingIn") || flag(c, "cloudAvailable");
        },
        {},
        [](const QVariantMap& c) {
            if (flag(c, "signedIn")) return call(c, "signOut");
            if (flag(c, "signingIn")) return call(c, "cancelSignIn");
            return call(c, "signIn");
        },
        signInReason};
    entry.labelFor = [](const QVariantMap& c) -> QString {
        auto* item = host(c);
        if (!item) return {};
        if (item->property("signedIn").toBool())
            return QStringLiteral("Sign Out %1").arg(item->property("displayName").toString());
        if (item->property("signingIn").toBool()) return QStringLiteral("Cancel Sign-In");
        return {};
    };
    return entry;
}());
const bool otherServer = nt::app::registerShellMenuItem({QStringLiteral("File"), QStringLiteral("accountOtherServer"),
    QStringLiteral("Sign In to Another Server…"), {}, {}, QStringLiteral("account"), 46,
    [](const QVariantMap& c) { return flag(c, "available") && !flag(c, "signingIn"); }, {},
    [](const QVariantMap& c) { return call(c, "openServerDialog"); }, signInReason});
const bool switchServer = nt::app::registerShellMenuItem({QStringLiteral("File"), QStringLiteral("accountSwitchServer"),
    QStringLiteral("Switch Cloud Server…"), {}, {}, QStringLiteral("account"), 47,
    [](const QVariantMap& c) { return flag(c, "canSwitchServer") && !flag(c, "signingIn"); }, {},
    [](const QVariantMap& c) { return call(c, "openServerMenu"); },
    QStringLiteral("Sign in to a second server first.")});
const bool share = nt::app::registerShellMenuItem({QStringLiteral("File"), QStringLiteral("shareTimeline"),
    QStringLiteral("Share…"), {}, {}, QStringLiteral("account"), 48,
    [](const QVariantMap& c) { return flag(c, "canShare"); }, {},
    [](const QVariantMap& c) { return call(c, "share"); },
    QStringLiteral("Open a cloud timeline you own first.")});
}  // namespace
