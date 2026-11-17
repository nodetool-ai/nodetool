// Registers the account types with NodeTool.Timeline, so the document bar
// and the shared account QML can name them. main creates them, so QML cannot.
#pragma once

#include "nodetool/account/qt/AccountController.h"
#include "nodetool/account/qt/AccountServers.h"
#include "nodetool/account/qt/CloudBrowser.h"
#include "nodetool/account/qt/CloudDocument.h"

#include <QtQml/qqmlregistration.h>

namespace nt::account {

struct AccountControllerForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::account::qt::AccountController)
    QML_NAMED_ELEMENT(AccountController)
    QML_UNCREATABLE("An AccountController comes from main.")
};

struct AccountServersForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::account::qt::AccountServers)
    QML_NAMED_ELEMENT(AccountServers)
    QML_UNCREATABLE("AccountServers comes from main.")
};

struct CloudBrowserForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::account::qt::CloudBrowser)
    QML_NAMED_ELEMENT(CloudBrowser)
    QML_UNCREATABLE("A CloudBrowser comes from its owner.")
};

struct CloudDocumentListForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::account::qt::CloudDocumentList)
    QML_NAMED_ELEMENT(CloudDocumentList)
    QML_UNCREATABLE("A CloudDocumentList comes from its CloudBrowser.")
};

struct CloudDocumentForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::account::qt::CloudDocument)
    QML_NAMED_ELEMENT(CloudDocument)
    QML_UNCREATABLE("A CloudDocument comes from its owner.")
};

} // namespace nt::account
