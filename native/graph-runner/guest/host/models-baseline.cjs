// esbuild keeps this require inside the function, so the production baseline's
// TABLE_COLUMNS enumeration opens its memory database only for an explicit model
// database grant. Importing an image node/context needs no SQLite capability.
exports.applySqliteBaseline = (database) => {
  const { applySqliteBaseline } = require('guest-real:@nodetool-ai/models/migrations/sqlite-baseline.js');
  applySqliteBaseline(database);
};

// The 20261115_000000 add_message_branches migration. The frozen baseline
// stays unchanged, and a partially upgraded database keeps its existing data.
exports.migrateMessageBranches = (database) => {
  const columns = database.pragma('table_info("nodetool_messages")');
  for (const name of ['branch_id', 'branch_after']) {
    if (!columns.some((column) => column.name === name)) {
      database.exec(`ALTER TABLE nodetool_messages ADD COLUMN ${name} TEXT`);
    }
  }
};
