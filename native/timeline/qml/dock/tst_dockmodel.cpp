#include <QCoreApplication>
#include <QFile>
#include <QJSEngine>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTextStream>

// Single-request JSON bridge to the same JS engine used by the dock store.
int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QJSEngine engine;
    QFile script(QStringLiteral(NT_DOCK_SCRIPT));
    if (!script.open(QIODevice::ReadOnly)) { qCritical("Cannot read dock model"); return 1; }
    auto loaded = engine.evaluate(QString::fromUtf8(script.readAll()).replace(".pragma library", ""), script.fileName());
    if (loaded.isError()) { qCritical().noquote() << loaded.toString(); return 1; }
    QTextStream input(stdin), output(stdout);
    {
        auto request = QJsonDocument::fromJson(input.readLine().toUtf8()).object();
        auto callable = engine.globalObject().property(request.value("method").toString());
        auto args = engine.evaluate("(" + QString::fromUtf8(QJsonDocument(request.value("args").toArray()).toJson(QJsonDocument::Compact)) + ")");
        QJSValueList arguments;
        for (quint32 i = 0; i < args.property("length").toUInt(); ++i) { arguments.append(args.property(i)); }
        auto result = callable.call(arguments);
        if (!result.isError() && request.value("identity").toBool()) {
            result = QJSValue(result.strictlyEquals(arguments.first()));
        }
        const QJsonObject response = result.isError()
            ? QJsonObject{{"error", result.toString()}}
            : QJsonObject{{"value", QJsonValue::fromVariant(result.toVariant())}};
        output << QJsonDocument(response).toJson(QJsonDocument::Compact) << Qt::endl;
    }
}
