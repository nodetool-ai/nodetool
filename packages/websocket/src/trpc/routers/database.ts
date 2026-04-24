import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { getRawDb } from "@nodetool/models";
import {
  databaseStatsOutput,
  clearJobsInput,
  clearJobsOutput,
  clearVersionsInput,
  clearVersionsOutput
} from "@nodetool/protocol/api-schemas/database.js";

// Helper to get estimated table size in MB
function getTableStats(tableName: string) {
  const db = getRawDb();
  const countRow = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get() as { count: number };
  if (!countRow || countRow.count === 0) {
    return { count: 0, sizeMB: 0 };
  }

  try {
    const cols = db.pragma(`table_info("${tableName}")`) as { name: string }[];
    if (!cols || cols.length === 0) return { count: countRow.count, sizeMB: 0 };

    const sumExpr = cols
      .map((c) => `IFNULL(LENGTH(CAST("${c.name}" AS TEXT)), 0)`)
      .join(" + ");
    
    const sizeRow = db.prepare(`SELECT SUM(${sumExpr}) as size FROM "${tableName}"`).get() as { size: number };
    const sizeBytes = sizeRow?.size || 0;
    
    return {
      count: countRow.count,
      sizeMB: Number((sizeBytes / 1024 / 1024).toFixed(2))
    };
  } catch (e) {
    return { count: countRow.count, sizeMB: 0 };
  }
}

export const databaseRouter = router({
  stats: protectedProcedure
    .output(databaseStatsOutput)
    .query(() => {
      return {
        workflowVersions: getTableStats("nodetool_workflow_versions"),
        jobs: getTableStats("nodetool_jobs"),
        runEvents: getTableStats("run_events")
      };
    }),

  clearJobs: protectedProcedure
    .input(clearJobsInput)
    .output(clearJobsOutput)
    .mutation(({ input }) => {
      const db = getRawDb();
      
      // Calculate cutoff date
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - input.daysToKeep);
      const cutoffIso = cutoffDate.toISOString();

      // We wrap the deletes in a transaction
      const cleanup = db.transaction(() => {
        // 1. Delete run_events for these jobs
        const deletedRunEvents = db.prepare(`
          DELETE FROM run_events 
          WHERE run_id IN (
            SELECT id FROM nodetool_jobs 
            WHERE created_at < ?
          )
        `).run(cutoffIso).changes;

        // 2. Delete run_node_state for these jobs
        const deletedRunNodeStates = db.prepare(`
          DELETE FROM run_node_state 
          WHERE run_id IN (
            SELECT id FROM nodetool_jobs 
            WHERE created_at < ?
          )
        `).run(cutoffIso).changes;

        // 3. Delete the jobs themselves
        const deletedJobs = db.prepare(`
          DELETE FROM nodetool_jobs 
          WHERE created_at < ?
        `).run(cutoffIso).changes;

        return { deletedJobs, deletedRunEvents, deletedRunNodeStates };
      });

      return cleanup();
    }),

  clearWorkflowVersions: protectedProcedure
    .input(clearVersionsInput)
    .output(clearVersionsOutput)
    .mutation(({ input }) => {
      const db = getRawDb();
      
      // Delete workflow versions where there are newer `keepCount` versions for the same workflow
      // SQLite doesn't support DELETE with OFFSET/LIMIT easily, so we use a subquery to keep the latest N.
      
      // This query deletes versions whose id is NOT in the latest `keepCount` versions for their workflow
      const deletedVersions = db.prepare(`
        DELETE FROM nodetool_workflow_versions 
        WHERE id NOT IN (
          SELECT id FROM (
            SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY workflow_id ORDER BY version DESC) as rn
            FROM nodetool_workflow_versions
          )
          WHERE rn <= ?
        )
      `).run(input.keepCount).changes;

      return { deletedVersions };
    })
});
