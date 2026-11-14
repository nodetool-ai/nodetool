#include "ComposerSession.h"

#include "runtime/ComposerRules.h"

namespace nodetool::parity {

namespace composer = nt::chat::composer;

void ComposerSession::setDraft(const QString &draft) {
    if (draft == draft_) {
        return;
    }
    draft_ = draft;
    emit stateChanged();
}

void ComposerSession::setMediaMode(const QString &mode) {
    mediaMode_ = mode;
    emit stateChanged();
}

QVariantList ComposerSession::mediaModes() const {
    return composer::mediaModes();
}

QVariantList ComposerSession::reasoningLevels() const {
    return composer::reasoningLevels();
}

void ComposerSession::setPermissionMode(const QString &mode) {
    if (composer::isPermissionMode(mode)) {
        permissionMode_ = mode;
        emit stateChanged();
    }
}

QVariantList ComposerSession::permissionModes() const {
    return composer::permissionModes();
}

// ChatSession::send clears the draft and starts the turn.
void ComposerSession::send() {
    const auto prompt = draft_;
    draft_.clear();
    turnStatus_ = QStringLiteral("streaming");
    emit sendRequested(prompt);
    emit stateChanged();
}

void ComposerSession::stop() {
    turnStatus_ = QStringLiteral("idle");
    emit stopRequested();
    emit stateChanged();
}

QVariantMap ComposerSession::mentionTrigger(const QString &text, int caret) const {
    return composer::mentionTrigger(text, caret);
}

QVariantMap ComposerSession::removeMention(const QString &text, int start, int end) const {
    return composer::removeMention(text, start, end);
}

}  // namespace nodetool::parity
