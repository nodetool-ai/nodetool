// Guest side of unittests/node_context.cpp. Checks the guest context class
// against the NodeContext member list generated from
// packages/runtime-core/src/node-context.ts: every member is implemented or
// declared in guest/context-unavailable.mjs, with a reason from the fixed set.
import "./context-env.mjs";
import "../guest/env/index.mjs";
import memberList from "../../../packages/runtime-core/node-context-members.json";
import { GuestContext } from "../guest/host/context.mjs";
import { UNAVAILABLE_REASONS, contextUnavailable } from "../guest/context-unavailable.mjs";

const context = new GuestContext();
const implemented = (member) =>
  member.kind === "method" ? typeof context[member.name] === "function" : member.name in context;

const names = new Set(memberList.members.map((member) => member.name));
const problems = [];
const report = { implemented: [], unavailable: {} };
for (const member of memberList.members) {
  const reason = Object.hasOwn(contextUnavailable, member.name) ? contextUnavailable[member.name] : undefined;
  if (implemented(member)) {
    report.implemented.push(member.name);
    if (reason !== undefined) problems.push(`${member.name} is implemented but declared unavailable (${reason})`);
  } else if (reason === undefined) {
    problems.push(`${member.name} (${member.group}) is neither implemented nor declared in guest/context-unavailable.mjs`);
  } else {
    (report.unavailable[reason] ??= []).push(member.name);
  }
}
for (const [name, reason] of Object.entries(contextUnavailable)) {
  if (!names.has(name)) problems.push(`${name} is declared unavailable but is not a NodeContext member`);
  if (!UNAVAILABLE_REASONS.includes(reason)) problems.push(`${name} has unknown reason '${reason}'`);
}
if (memberList.members.length === 0) problems.push("node-context-members.json lists no members");

globalThis.__nodeContextResult = JSON.stringify({
  ok: problems.length === 0,
  problems,
  members: memberList.members.length,
  implemented: report.implemented.length,
  unavailable: report.unavailable
});
// Guest::load expects the guest protocol object. This bundle has no nodes.
globalThis.__nodetool = {};
