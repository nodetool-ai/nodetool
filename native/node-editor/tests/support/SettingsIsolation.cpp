// Every test binary gets a private, empty config directory. QSettings state then
// never carries over between runs or into the user's own configuration.
#include <QTemporaryDir>

namespace {
const bool isolated = [] {
    static QTemporaryDir directory;
    qputenv("XDG_CONFIG_HOME", directory.path().toUtf8());
    return directory.isValid();
}();
}
