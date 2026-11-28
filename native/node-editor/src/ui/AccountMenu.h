// The account entries of the File menu. Cloud sign-in is opt-in: the editor
// works on this computer until the person signs in here, and no bar shows a
// sign-in control. UI thread only.
#pragma once

#include <QString>

#include <functional>

class QMenu;
class QWidget;

namespace nodetool::account::qt {
class AccountServers;
}

namespace nodetool::node_editor {

// Asks for the address of another server. An empty string cancels.
using AskServerAddress = std::function<QString()>;

// Appends the account entries to `menu`. With null `servers` it adds nothing.
// The entries follow the current account each time `menu` opens:
//   signed out  Sign In to NodeTool Cloud…
//   signing in  Cancel Sign-In
//   signed in   Signed in as <name> (disabled), Sign Out
// and a Cloud Server submenu that switches servers and offers Sign In to
// Another Server…. `ask` defaults to a text dialog parented to `parent`.
// `servers` must outlive `menu`.
void addAccountEntries(QMenu *menu, nodetool::account::qt::AccountServers *servers, QWidget *parent,
                       AskServerAddress ask = {});

// Shows and labels the entries for the current account. The menu calls it
// before it opens.
void syncAccountEntries(QMenu *menu, nodetool::account::qt::AccountServers *servers);

} // namespace nodetool::node_editor
