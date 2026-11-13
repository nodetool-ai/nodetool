#include "ComfyWorkflowLoader.h"
#include "document/ChildSources.h"
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QNetworkRequest>

namespace nodetool::node_editor {
ComfyWorkflowLoader::ComfyWorkflowLoader(QObject *parent) : QObject(parent), network_(this) {
    debounce_.setSingleShot(true);
    debounce_.setInterval(300);
    connect(&debounce_, &QTimer::timeout, this, [this] { resolve({{"workflow", text_}}); });
}

ComfyWorkflowLoader::~ComfyWorkflowLoader() {
    if (reply_) { reply_->abort(); }
}

void ComfyWorkflowLoader::configure(const QUrl &origin, const QString &token) {
    origin_ = origin;
    token_ = token;
}

QVariantList ComfyWorkflowLoader::parameters() const {
    QVariantList rows;
    for (const auto &value : schema_["available_params"].toArray()) {
        const auto param = value.toObject();
        rows.append(QVariantMap{{"handle", param["handle"].toString()},
                                {"label", QStringLiteral("%1 (%2)").arg(param["label"].toString(), param["type"].toString())}});
    }
    return rows;
}

void ComfyWorkflowLoader::setText(const QString &text) {
    text_ = text;
    if (reply_) { reply_->abort(); }
    if (text.trimmed().isEmpty()) {
        debounce_.stop();
        schema_ = {};
        summary_.clear();
        error_.clear();
        emit changed();
        return;
    }
    debounce_.start();
}

void ComfyWorkflowLoader::loadFile(const QUrl &file) {
    const auto path = file.isLocalFile() ? file.toLocalFile() : file.toString();
    QFile source(path);
    if (!source.open(QIODevice::ReadOnly)) {
        fail(tr("Failed to load file"));
        return;
    }
    const auto bytes = source.readAll();
    if (QFileInfo(path).suffix().compare(QStringLiteral("png"), Qt::CaseInsensitive) == 0) {
        text_.clear();
        debounce_.stop();
        emit textLoaded({});
        resolve({{"png_base64", QString::fromLatin1(bytes.toBase64())}});
        return;
    }
    const auto text = QString::fromUtf8(bytes);
    emit textLoaded(text);
    setText(text);
}

void ComfyWorkflowLoader::apply(const QStringList &exposedHandles) {
    if (!schema_.isEmpty()) { emit applied(schema_, exposedHandles); }
}

void ComfyWorkflowLoader::fail(const QString &message) {
    schema_ = {};
    summary_.clear();
    error_ = message;
    emit changed();
}

void ComfyWorkflowLoader::resolve(const QJsonObject &source) {
    if (reply_) { reply_->abort(); }
    if (origin_.isEmpty()) {
        fail(tr("Connect to a server to load a ComfyUI workflow."));
        return;
    }
    QNetworkRequest request(origin_.resolved(QUrl(QStringLiteral("/api/comfy/resolve-workflow"))));
    request.setTransferTimeout(30000);
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    request.setHeader(QNetworkRequest::ContentTypeHeader, QStringLiteral("application/json"));
    if (!token_.isEmpty()) { request.setRawHeader("Authorization", "Bearer " + token_.toUtf8()); }
    auto *reply = network_.post(request, QJsonDocument(source).toJson(QJsonDocument::Compact));
    reply_ = reply;
    emit changed();
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        reply->deleteLater();
        if (reply_ != reply) { return; }
        reply_ = nullptr;
        if (reply->error() == QNetworkReply::OperationCanceledError) {
            emit changed();
            return;
        }
        const auto bytes = reply->readAll();
        const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        const auto body = QJsonDocument::fromJson(bytes).object();
        if (status != 200 || !body["prompt"].isObject()) {
            // resolveComfyWorkflow reads the server's detail, then the text.
            auto message = body["detail"].toString();
            if (message.isEmpty()) { message = QString::fromUtf8(bytes).trimmed(); }
            fail(message.isEmpty() ? tr("Failed to parse") : message);
            return;
        }
        schema_ = body;
        summary_ = comfySchemaSummary(body);
        error_.clear();
        emit changed();
    });
}
} // namespace nodetool::node_editor
