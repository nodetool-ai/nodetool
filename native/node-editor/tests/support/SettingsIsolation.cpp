// Every test binary gets a private, empty config directory. QSettings state then
// never carries over between runs or into the user's own configuration.
#include <QSettings>
#include <QTemporaryDir>

namespace {
const bool isolated = [] {
    // native-rules #14: function-local static QTemporaryDir is global mutable state
    static QTemporaryDir directory;
    qputenv("XDG_CONFIG_HOME", directory.path().toUtf8());
    // The native format ignores XDG_CONFIG_HOME on macOS and writes to
    // ~/Library/Preferences. INI files go to the directory on every platform.
    QSettings::setDefaultFormat(QSettings::IniFormat);
    QSettings::setPath(QSettings::IniFormat, QSettings::UserScope, directory.path());
    return directory.isValid();
}();
}
