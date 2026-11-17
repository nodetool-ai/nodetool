// Registers AccountController with NodeTool.Timeline, so the document bar and
// AccountControl.qml can name it. main creates it, so QML cannot.
#pragma once

#include "nodetool/account/qt/AccountController.h"

#include <QtQml/qqmlregistration.h>

namespace nt::account {

struct AccountControllerForeign {
    Q_GADGET
    QML_FOREIGN(nodetool::account::qt::AccountController)
    QML_NAMED_ELEMENT(AccountController)
    QML_UNCREATABLE("An AccountController comes from main.")
};

} // namespace nt::account
