const { Workflow } = require('./packages/models/dist/workflow.js');
const { getDb, initDb } = require('./packages/models/dist/db.js');
const { performance } = require('node:perf_hooks');
const fs = require('fs');

async function run() {
  if (fs.existsSync('benchmark.db')) {
    fs.unlinkSync('benchmark.db');
  }

  await initDb('benchmark.db');
  const db = getDb();

  // Set up mock DB schema for workflows if necessary, or just run query test
  // Wait, I might need to run the actual db migrations to create tables
  console.log("DB initialized");
}
run().catch(console.error);
