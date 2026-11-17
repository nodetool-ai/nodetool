// The Cloud and Shared with me groups of the document browser (PRD "Open
// and edit a cloud document", FR9): the account's own documents of one
// kind, and the documents of that kind other accounts shared with it.
#pragma once

#include "nodetool/account/cloud_client.h"

#include <string>
#include <vector>

namespace nodetool::account {

struct CloudListItem {
  // `workflow` or `timeline`.
  std::string kind;
  std::string id;
  std::string name;
  // The server's `updated_at`, empty when it sent none.
  std::string updatedAt;
  // `owner` for the account's own documents, otherwise the grant's role:
  // `editor` or `viewer`.
  std::string role;
  // The owner's user id. Empty for the account's own documents.
  std::string ownerId;
};

enum class CloudListStatus {
  Ok,
  // The session is signed out, or the server ended it.
  SignedOut,
  // The server did not answer, or answered that it is busy.
  Offline,
  // The server refused the request or sent an answer this client cannot
  // read. `reason` names the API code.
  Refused,
};

struct CloudListing {
  CloudListStatus status = CloudListStatus::Offline;
  std::vector<CloudListItem> items;
  std::string reason;
};

// The most pages of the account's own workflows one listing reads.
inline constexpr int kMaxListPages = 10;
inline constexpr int kListPageSize = 200;

// The account's own documents of `kind`, newest first. An unknown kind is
// refused without sending.
CloudListing listOwnDocuments(CloudClient& client, const std::string& kind);

// The documents of `kind` shared with the account, newest first, each with
// the highest role the account holds on it.
CloudListing listSharedDocuments(CloudClient& client, const std::string& kind);

} // namespace nodetool::account
