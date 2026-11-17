#include "CloudTimelineSaver.h"

#include "model/TimelineModel.h"
#include "nodetool/account/account_session.h"
#include "nodetool/account/cloud_drafts.h"
#include "nodetool/account/qt/CloudDocument.h"
#include "nodetool/account/qt/QtHttpTransport.h"
#include "server/AutosaveController.h"

#include <QJsonDocument>
#include <QUndoStack>

#include <utility>
#include <vector>

namespace nt::account {

namespace accountlib = nodetool::account;

QJsonObject CloudTimelineSaver::withDraft(const QJsonObject& rawSequence, const QJsonObject& draft) {
    QJsonObject merged = draft;
    const QJsonObject document = server::documentForSave(rawSequence);
    for (auto it = rawSequence.begin(); it != rawSequence.end(); ++it) {
        if (!document.contains(it.key())) {
            merged.insert(it.key(), it.value());
        }
    }
    return merged;
}

CloudTimelineSaver::CloudTimelineSaver(TimelineModel& model, std::shared_ptr<accountlib::AccountSession> session,
                                       CloudTimelineOptions options, QObject* parent)
    : QObject(parent), m_model(model), m_options(std::move(options)) {
    std::vector<std::pair<std::string, std::string>> headers;
    if (!m_options.localToken.isEmpty()) {
        headers.emplace_back("Authorization", ("Bearer " + m_options.localToken).toStdString());
    }
    const QUrl local = m_options.localServer.adjusted(QUrl::RemovePath | QUrl::RemoveQuery | QUrl::RemoveFragment);
    accountlib::qt::CloudDocumentServices services;
    services.session = std::move(session);
    services.store = accountlib::makeLocalServerDraftStore(std::make_unique<accountlib::qt::QtHttpTransport>(),
                                                           local.toString(QUrl::StripTrailingSlash).toStdString(),
                                                           std::move(headers));
    services.kind = "timeline";
    services.documentId = m_options.timelineId.toStdString();
    services.role = m_options.role.toStdString();
    m_document = std::make_unique<accountlib::qt::CloudDocument>(std::move(services));
    connect(m_document.get(), &accountlib::qt::CloudDocument::opened, this,
            [this](const QString&, const QString& draft) { applyDraft(draft); });
    connect(m_document.get(), &accountlib::qt::CloudDocument::openFailed, this,
            [this](const QString& reason) { fail(tr("Cloud timeline not opened: %1").arg(reason)); });
    connect(&m_model, &TimelineModel::commandSettled, this, &CloudTimelineSaver::sendEdit);
    m_document->open();
}

CloudTimelineSaver::~CloudTimelineSaver() {
    if (m_worker) {
        m_worker->wait();
    }
}

QObject* CloudTimelineSaver::document() const { return m_document.get(); }

void CloudTimelineSaver::sendEdit() {
    const QJsonObject draft = server::documentForSave(m_model.timeline().raw);
    m_document->edit(QString::fromUtf8(QJsonDocument(draft).toJson(QJsonDocument::Compact)));
}

void CloudTimelineSaver::fail(const QString& error) {
    m_error = error;
    emit errorChanged();
}

void CloudTimelineSaver::applyDraft(const QString& text) {
    const QJsonObject draft = QJsonDocument::fromJson(text.toUtf8()).object();
    const QJsonObject current = m_model.timeline().raw;
    if (draft.isEmpty() || draft == server::documentForSave(current)) {
        return;
    }
    if (m_model.undoStack()->count() > 0) {
        // The person edited before the draft arrived. Their document replaces it.
        sendEdit();
        return;
    }
    const QJsonObject raw = withDraft(current, draft);
    const server::ServerOpenOptions options{m_options.origin, m_options.timelineId, m_options.cacheRoot,
                                            m_options.accessToken, true, {}};
    // Shared with the worker thread, which writes it, and with the finished
    // handler on the UI thread, which reads it after the worker ended.
    auto result = std::make_shared<server::ServerOpenResult>();
    auto* worker = QThread::create([options, raw, result] {
        *result = server::resolveTimelineDocumentMedia(options, raw);
    });
    // Parented to this object, which waits for it in its destructor.
    worker->setParent(this);
    m_worker = worker;
    connect(worker, &QThread::finished, this, [this, worker, result, draft] {
        worker->deleteLater();
        if (m_model.undoStack()->count() > 0) {
            sendEdit();
            return;
        }
        if (!result->timeline) {
            fail(tr("The edits kept on this computer could not be opened: %1").arg(result->error));
            return;
        }
        for (const auto& media : result->timeline->clips) {
            m_model.registerMedia(media);
        }
        const quint64 token = m_model.applyEdit(QStringLiteral("restoreDocument"),
                                                QJsonObject{{QStringLiteral("document"), draft}});
        if (token == 0) {
            fail(tr("The edits kept on this computer could not be applied."));
        }
    });
    worker->start();
}

}  // namespace nt::account
