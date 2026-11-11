#include <QCoreApplication>
#include <QDebug>

int main(int argc, char** argv) {
    if (QCoreApplication::instance() || argc != 3) {
        qCritical("FAIL: startup test must run before application construction with two expected values");
        return 1;
    }
    const auto folder = qgetenv("NODETOOL_TIMELINE_CACHE_DIR");
    const auto budget = qgetenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB");
    if (folder != argv[1] || budget != argv[2]) {
        qCritical() << "FAIL: cache preferences before QCoreApplication: folder" << folder
                    << "expected" << argv[1] << "budget" << budget << "expected" << argv[2];
        return 1;
    }
    qInfo("PASS: cache environment is correct before QCoreApplication construction");
    return 0;
}
