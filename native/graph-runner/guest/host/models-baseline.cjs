// esbuild keeps this require inside the function, so the production baseline's
// TABLE_COLUMNS enumeration opens its memory database only for an explicit model
// database grant. Importing an image node/context needs no SQLite capability.
exports.applySqliteBaseline = (database) => {
  const { applySqliteBaseline } = require('guest-real:@nodetool-ai/models/migrations/sqlite-baseline.js');
  applySqliteBaseline(database);
};
