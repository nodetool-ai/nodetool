cat << 'PATCH_EOF' > find.patch
--- packages/websocket/src/unified-websocket-runner.ts
+++ packages/websocket/src/unified-websocket-runner.ts
@@ -2528,6 +2528,15 @@
     // first generation_complete, then reused for every later variant — so an
     // N-variant run does one query per node, not one per variant (RFC D8).
     const persistedIndexByNode = new Map<string, Set<number>>();
+    const graphNodes =
+      (
+        active.graph as {
+          nodes?: Array<{ id?: unknown; type?: unknown }>;
+        }
+      ).nodes ?? [];
+    const nodeMap = new Map<string, { id?: unknown; type?: unknown }>();
+    for (const node of graphNodes) {
+      if (typeof node.id === "string") nodeMap.set(node.id, node);
+    }
+
     await this.sendMessage({
       type: "job_update",
@@ -2594,11 +2603,7 @@
           outbound.type === "generation_complete"
         ) {
           const nodeId = String(outbound.node_id ?? "");
-          const graphNodes =
-            (
-              active.graph as {
-                nodes?: Array<{ id?: unknown; type?: unknown }>;
-              }
-            ).nodes ?? [];
-          const node = graphNodes.find((n) => n.id === nodeId);
+          const node = nodeMap.get(nodeId);
           const nodeType = typeof node?.type === "string" ? node.type : "";

           // Skip constant and input nodes entirely
PATCH_EOF
patch -p0 < find.patch
