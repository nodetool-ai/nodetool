#include "AccountMenu.h"

#include "nodetool/account/qt/AccountController.h"
#include "nodetool/account/qt/AccountServers.h"

#include <QAction>
#include <QInputDialog>
#include <QMenu>
#include <QMessageBox>
#include <QPointer>

namespace nodetool::node_editor {
namespace {
using nodetool::account::qt::AccountController;
using nodetool::account::qt::AccountServers;

QAction *child(QMenu *menu, const char *name) { return menu->findChild<QAction *>(QLatin1String(name)); }

QString serverLabel(const AccountServers *servers, const QString &origin) {
    if (origin == servers->defaultServer()) { return QObject::tr("NodeTool Cloud"); }
    QString host = origin;
    return host.remove(QStringLiteral("https://"));
}

void fillServers(QMenu *submenu, AccountServers *servers, QAction *addServer) {
    for (auto *action : submenu->actions()) {
        if (action != addServer && !action->isSeparator()) { submenu->removeAction(action); action->deleteLater(); }
    }
    QAction *before = submenu->actions().value(0);
    for (const auto &origin : servers->servers()) {
        auto *action = new QAction(serverLabel(servers, origin), submenu);
        action->setObjectName(QStringLiteral("account-menu-server-") + origin);
        action->setCheckable(true);
        action->setChecked(origin == servers->currentServer());
        QObject::connect(action, &QAction::triggered, servers, [servers, origin] { servers->switchTo(origin); });
        submenu->insertAction(before, action);
    }
}
} // namespace

void addAccountEntries(QMenu *menu, AccountServers *servers, QWidget *parent, AskServerAddress ask) {
    if (!menu || !servers) { return; }
    QPointer<QWidget> owner(parent);
    if (!ask) {
        ask = [owner] {
            bool accepted = false;
            const auto text = QInputDialog::getText(owner, QObject::tr("Sign in to another server"),
                                                    QObject::tr("Server address"), QLineEdit::Normal, {}, &accepted);
            return accepted ? text : QString();
        };
    }
    QPointer<AccountServers> guard(servers);
    const auto current = [guard]() -> AccountController * { return guard ? guard->current() : nullptr; };

    auto *signIn = menu->addAction(QObject::tr("Sign In to NodeTool Cloud…"));
    signIn->setObjectName(QStringLiteral("account-menu-sign-in"));
    QObject::connect(signIn, &QAction::triggered, servers, [current] { if (auto *a = current()) { a->signIn(); } });

    auto *cancel = menu->addAction(QObject::tr("Cancel Sign-In"));
    cancel->setObjectName(QStringLiteral("account-menu-cancel"));
    QObject::connect(cancel, &QAction::triggered, servers, [current] { if (auto *a = current()) { a->cancelSignIn(); } });

    auto *name = menu->addAction(QString());
    name->setObjectName(QStringLiteral("account-menu-name"));
    name->setEnabled(false);

    auto *signOut = menu->addAction(QObject::tr("Sign Out"));
    signOut->setObjectName(QStringLiteral("account-menu-sign-out"));
    QObject::connect(signOut, &QAction::triggered, servers, [current] { if (auto *a = current()) { a->signOut(); } });

    auto *submenu = menu->addMenu(QObject::tr("Cloud Server"));
    submenu->setObjectName(QStringLiteral("account-menu-servers"));
    submenu->menuAction()->setObjectName(QStringLiteral("account-menu-servers-action"));
    submenu->addSeparator();
    auto *addServer = submenu->addAction(QObject::tr("Sign In to Another Server…"));
    addServer->setObjectName(QStringLiteral("account-menu-add-server"));
    QObject::connect(addServer, &QAction::triggered, servers, [guard, ask, owner] {
        const auto address = ask();
        if (!guard || address.trimmed().isEmpty()) { return; }
        const auto reason = guard->addServer(address);
        if (!reason.isEmpty()) {
            QMessageBox::warning(owner, QObject::tr("Sign in to another server"), reason);
            return;
        }
        guard->current()->signIn();
    });
    QObject::connect(submenu, &QMenu::aboutToShow, servers, [submenu, guard, addServer] {
        if (guard) { fillServers(submenu, guard, addServer); }
    });
    QObject::connect(menu, &QMenu::aboutToShow, servers, [menu, guard] { syncAccountEntries(menu, guard); });
    syncAccountEntries(menu, servers);
}

void syncAccountEntries(QMenu *menu, AccountServers *servers) {
    if (!menu || !servers) { return; }
    auto *account = servers->current();
    const auto state = account ? account->state() : AccountController::State::SignedOut;
    const bool signedIn = state == AccountController::State::SignedIn;
    const bool signingIn = state == AccountController::State::SigningIn;
    if (auto *signIn = child(menu, "account-menu-sign-in")) {
        signIn->setVisible(!signedIn && !signingIn);
        signIn->setEnabled(account && account->cloudAvailable());
        signIn->setText(QObject::tr("Sign In to %1…").arg(serverLabel(servers, servers->currentServer())));
    }
    if (auto *cancel = child(menu, "account-menu-cancel")) { cancel->setVisible(signingIn); }
    if (auto *name = child(menu, "account-menu-name")) {
        name->setVisible(signedIn);
        name->setText(signedIn ? QObject::tr("Signed in as %1").arg(account->displayName()) : QString());
    }
    if (auto *signOut = child(menu, "account-menu-sign-out")) { signOut->setVisible(signedIn); }
    if (auto *servers_ = menu->findChild<QMenu *>(QStringLiteral("account-menu-servers"))) {
        servers_->menuAction()->setVisible(!signingIn);
        fillServers(servers_, servers, child(servers_, "account-menu-add-server"));
    }
}

} // namespace nodetool::node_editor
