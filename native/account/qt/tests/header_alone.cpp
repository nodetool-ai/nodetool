// Compiles AccountController.h with nothing before it, as an app includes
// it: AccountServices must be destructible from the header alone.
#include "nodetool/account/qt/AccountController.h"

namespace {
[[maybe_unused]] void constructServices() { nodetool::account::qt::AccountServices services; }
} // namespace
