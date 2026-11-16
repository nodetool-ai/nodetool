#include "nodetool/account/cloud_drafts.h"

#include <nlohmann/json.hpp>

#include <utility>

namespace nodetool::account {
namespace {

nlohmann::json keyJson(const CloudDocumentKey& key) {
  return {{"server_key", key.serverKey},
          {"account_id", key.accountId},
          {"kind", key.kind},
          {"document_id", key.documentId}};
}

nlohmann::json baseJson(const CloudBase& base) {
  return {{"updated_at", base.updatedAt}, {"content_hash", base.contentHash}};
}

} // namespace

LocalServerDraftStore::LocalServerDraftStore(HttpTransport& transport, std::string localOrigin,
                                             std::vector<std::pair<std::string, std::string>> headers)
    : transport_(transport), origin_(std::move(localOrigin)), headers_(std::move(headers)) {}

std::optional<std::string> LocalServerDraftStore::mutate(const std::string& procedure, const std::string& input) {
  HttpRequest request;
  request.method = "POST";
  request.url = origin_ + "/trpc/" + procedure;
  request.headers = headers_;
  request.headers.emplace_back("Content-Type", "application/json");
  request.body = input;
  const HttpResponse response = transport_.send(request);
  if (response.status != 200) {
    return std::nullopt;
  }
  const nlohmann::json body = nlohmann::json::parse(response.body, nullptr, false);
  if (!body.is_object() || !body.contains("result")) {
    return std::nullopt;
  }
  nlohmann::json data = body["result"].value("data", nlohmann::json());
  if (data.is_object() && data.contains("json")) {
    data = data["json"];
  }
  if (!data.is_object()) {
    return std::nullopt;
  }
  return data.dump();
}

std::optional<int64_t> LocalServerDraftStore::put(const CloudDocumentKey& key, const CloudBase& base,
                                                  const std::string& draft) {
  nlohmann::json input = keyJson(key);
  input["base"] = baseJson(base);
  input["draft"] = draft;
  const auto data = mutate("cloudLocal.drafts.put", input.dump());
  if (!data) {
    return std::nullopt;
  }
  const nlohmann::json parsed = nlohmann::json::parse(*data, nullptr, false);
  const auto revision = parsed.find("revision");
  if (revision == parsed.end() || !revision->is_number_integer()) {
    return std::nullopt;
  }
  return revision->get<int64_t>();
}

std::optional<AcceptOutcome> LocalServerDraftStore::accept(const CloudDocumentKey& key, int64_t revision,
                                                           const CloudBase& base, const std::string& role,
                                                           const CloudDocumentOptions& options) {
  nlohmann::json input = keyJson(key);
  input["revision"] = revision;
  input["base"] = baseJson(base);
  input["role"] = role;
  input["options"] = {{"allow_history", options.allowHistory},
                      {"allow_download", options.allowDownload},
                      {"allow_duplicate", options.allowDuplicate}};
  const auto data = mutate("cloudLocal.drafts.accept", input.dump());
  if (!data) {
    return std::nullopt;
  }
  const std::string outcome = nlohmann::json::parse(*data, nullptr, false).value("outcome", std::string());
  if (outcome == "deleted") {
    return AcceptOutcome::Deleted;
  }
  if (outcome == "rebased") {
    return AcceptOutcome::Rebased;
  }
  if (outcome == "no_draft") {
    return AcceptOutcome::NoDraft;
  }
  return std::nullopt;
}

bool LocalServerDraftStore::markUnsent(const CloudDocumentKey& key, int64_t revision, const std::string& reason) {
  nlohmann::json input = keyJson(key);
  input["revision"] = revision;
  input["reason"] = reason;
  return mutate("cloudLocal.drafts.markUnsent", input.dump()).has_value();
}

CloudDocumentSaver::CloudDocumentSaver(DraftStore& store, CloudSaver& cloud, CloudDocumentKey key, CloudBase base)
    : store_(store), cloud_(cloud), key_(std::move(key)), base_(std::move(base)) {}

void CloudDocumentSaver::edit(std::string document, int64_t nowMs) {
  const std::lock_guard lock(mutex_);
  if (!unstored_) {
    firstUnstoredMs_ = nowMs;
  }
  unstored_ = std::move(document);
  lastEditMs_ = nowMs;
  ++editCount_;
  state_.unstoredEdits = true;
  if (state_.status != DocumentStatus::Sending) {
    publishLocked(DocumentStatus::ChangesWaiting);
  }
  state_.refusal.clear();
}

void CloudDocumentSaver::publishLocked(DocumentStatus status) {
  // A failing local write is never hidden behind a cloud status (FR11).
  state_.status = writeFailing_ || acceptFailing_ ? DocumentStatus::NotSaving : status;
}

void CloudDocumentSaver::tick(int64_t nowMs) {
  // Step 2: write the latest in-memory document to the local store.
  std::optional<std::string> toWrite;
  uint64_t editsAtTake = 0;
  {
    const std::lock_guard lock(mutex_);
    const bool due = nowMs - lastEditMs_ >= kDraftIdleMs || nowMs - firstUnstoredMs_ >= kDraftForceMs;
    if (unstored_ && due && nowMs >= nextWriteMs_) {
      toWrite = *unstored_;
      editsAtTake = editCount_;
    }
  }
  if (toWrite) {
    const std::optional<int64_t> revision = store_.put(key_, base_, *toWrite);
    const std::lock_guard lock(mutex_);
    if (!revision) {
      // Step 4. The edits stay in memory and the write is tried again.
      writeFailing_ = true;
      publishLocked(DocumentStatus::NotSaving);
      nextWriteMs_ = nowMs + kDraftRetryMs;
    } else {
      writeFailing_ = false;
      storedRevision_ = revision;
      storedDraft_ = std::move(*toWrite);
      sendPending_ = true;
      nextSendMs_ = nowMs;
      nextWriteMs_ = 0;
      if (editCount_ == editsAtTake) {
        unstored_.reset();
        state_.unstoredEdits = false;
      } else {
        // Newer edits arrived during the write. They are due as soon as
        // they are idle, and at the latest one full delay from now.
        firstUnstoredMs_ = nowMs;
      }
      publishLocked(DocumentStatus::Sending);
    }
  }

  // Step 3: send the stored draft, and record the acceptance locally.
  if (!sendPending_ || nowMs < nextSendMs_ || !storedRevision_) {
    return;
  }
  const int64_t revision = *storedRevision_;
  const SaveResult result = cloud_.save(key_, base_, storedDraft_);
  switch (result.status) {
  case SaveStatus::Ok: {
    const std::optional<AcceptOutcome> outcome =
        store_.accept(key_, revision, result.base, result.role, result.options);
    // The server holds the new version whether or not the local record
    // committed, so the next save edits it.
    base_ = result.base;
    const std::lock_guard lock(mutex_);
    state_.lastContactMs = nowMs;
    if (!outcome) {
      // The draft row still names the old base. Send again, which records
      // the acceptance once the store works.
      acceptFailing_ = true;
      publishLocked(DocumentStatus::NotSaving);
      nextSendMs_ = nowMs + kDraftRetryMs;
      return;
    }
    acceptFailing_ = false;
    sendPending_ = false;
    publishLocked(unstored_ || *outcome == AcceptOutcome::Rebased ? DocumentStatus::ChangesWaiting
                                                                  : DocumentStatus::SavedToCloud);
    return;
  }
  case SaveStatus::Refused: {
    // The row stays as unsent edits. Nothing is deleted.
    store_.markUnsent(key_, revision, result.reason);
    const std::lock_guard lock(mutex_);
    state_.lastContactMs = nowMs;
    sendPending_ = false;
    if (unstored_) {
      publishLocked(DocumentStatus::ChangesWaiting);
    } else {
      publishLocked(DocumentStatus::Unsent);
      state_.refusal = result.reason;
    }
    return;
  }
  case SaveStatus::Offline: {
    nextSendMs_ = nowMs + kSendRetryMs;
    const std::lock_guard lock(mutex_);
    publishLocked(DocumentStatus::Offline);
    return;
  }
  case SaveStatus::SignedOut: {
    nextSendMs_ = nowMs + kSendRetryMs;
    const std::lock_guard lock(mutex_);
    publishLocked(DocumentStatus::SignedOut);
    return;
  }
  }
}

DocumentState CloudDocumentSaver::state() const {
  const std::lock_guard lock(mutex_);
  return state_;
}

} // namespace nodetool::account
