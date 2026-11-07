#include <QCoreApplication>
#include <QFile>
#include <QTextStream>
#include <QThread>
#include <csignal>

int main(int argc, char **argv) {
    QCoreApplication app(argc, argv);
    const auto args = app.arguments().mid(1);
    if (args == QStringList{"runtime", "list", "--json"}) {
        QString json = R"({"root":"/fake/optional-node","condaEnv":"/fake/conda_env","packages":[{"id":"python","name":"Python","installed":false,"version":"","description":"Python runtime"},{"id":"yt-dlp","name":"yt-dlp","installed":true,"version":"1.2.3","description":"Download tool"}]})";
        if (qEnvironmentVariableIsSet("NODETOOL_FAKE_ALL_MISSING")) {
            json.replace("true", "false");
        }
        QTextStream(stdout) << json << Qt::endl;
        return 0;
    }
    if (args.size() != 3 || args.mid(0, 2) != QStringList{"runtime", "add"}) {
        return 99;
    }
    QFile log(qEnvironmentVariable("NODETOOL_FAKE_LOG"));
    if (log.open(QIODevice::Append)) {
        log.write(args.join(' ').toUtf8() + '\n');
        log.flush();
    }
    QFile pid(qEnvironmentVariable("NODETOOL_FAKE_PID"));
    if (pid.open(QIODevice::WriteOnly)) {
        pid.write(QByteArray::number(QCoreApplication::applicationPid()));
        pid.flush();
    }
    if (qEnvironmentVariableIsSet("NODETOOL_FAKE_HANG")) {
        std::signal(SIGTERM, SIG_IGN);
    }
    QTextStream(stderr) << "Installing " << args.last() << "\nDownloading package…" << Qt::endl;
    if (qEnvironmentVariableIsSet("NODETOOL_FAKE_HANG")) {
        QThread::sleep(60);
    }
    QThread::msleep(150);
    if (qEnvironmentVariableIsSet("NODETOOL_FAKE_FAIL")) {
        QTextStream(stderr) << "Verification failed: fixture error" << Qt::endl;
        return 7;
    }
    QTextStream(stderr) << "Installed\nRestart nodetool serve." << Qt::endl;
    return 0;
}
