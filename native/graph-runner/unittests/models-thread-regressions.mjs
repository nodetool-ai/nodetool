import Database from 'better-sqlite3';

/** Thread relationships always store canonical IDs, even when callers use prefixes. */
export async function threadRegressions(models, foreignModels, databasePath) {
  const repository = models.repository;
  const api = models.interfaces;
  const foreign = foreignModels.interfaces;
  let checks = 0;
  const check = (ok, label) => { checks++; if (!ok) throw new Error(`thread regression: ${label}`); };
  const call = (name, args) => api[name]({ ...args, userId: 'alice' });
  const foreignCall = (name, args) => foreign[name]({ ...args, userId: 'bob' });
  async function rejects(fn, pattern, label) {
    let error;
    try { await fn(); } catch (caught) { error = caught; }
    check(error && pattern.test(error.message), label);
  }
  const full = '123456789abc00000000000000000000';
  const prefix = full.slice(0, 12);
  repository.put('threads', { id: full, title: 'Canonical' });
  const first = await call('createMessage', { req: { thread_id: full, role: 'user', content: 'full' } });
  check((await call('getMessages', { threadId: prefix })).messages[0]?.id === first.id, 'prefix reads existing full-ID history');
  const second = await call('createMessage', { req: { thread_id: prefix, role: 'assistant', content: 'prefix' } });
  check(second.thread_id === full, 'prefix write stores canonical relationship');
  const fullHistory = await call('getMessages', { threadId: full });
  const prefixHistory = await call('getMessages', { threadId: prefix });
  check(fullHistory.messages.length === 2 && prefixHistory.messages.length === 2, 'full and prefix share one history');
  check(fullHistory.messages.map((row) => row.id).join() === prefixHistory.messages.map((row) => row.id).join(), 'full and prefix histories contain identical rows');
  check(repository.list('messages').filter((row) => [first.id, second.id].includes(row.id)).every((row) => row.thread_id === full), 'persisted relationships contain full thread IDs');
  check(repository.get('threads', full).id === full && repository.list('threads').every((row) => row.id !== prefix), 'prefix use creates no shadow thread');
  const page = await call('getMessages', { threadId: full, limit: 1 });
  const next = await call('getMessages', { threadId: prefix, limit: 1, startKey: page.next });
  check(next.messages.length === 1 && next.messages[0].id !== page.messages[0].id && next.next === null, 'full-to-prefix pagination uses canonical cursor relationship');
  const prefixPage = await call('getMessages', { threadId: prefix, limit: 1, reverse: true });
  const reverseNext = await call('getMessages', { threadId: full, limit: 1, startKey: prefixPage.next.slice(0, 12), reverse: true });
  check(reverseNext.messages.length === 1 && reverseNext.messages[0].id !== prefixPage.messages[0].id, 'prefix-to-full reverse pagination accepts an owned short message cursor');
  check((await foreignCall('getMessages', { threadId: full })).messages.length === 0, 'foreign full thread history denied');
  check((await foreignCall('getMessages', { threadId: prefix })).messages.length === 0, 'foreign prefix history denied');
  await rejects(() => foreignCall('createMessage', { req: { thread_id: full, role: 'user', content: 'stolen' } }), /owned by another user/, 'foreign full thread write rejected');
  await rejects(() => foreignCall('createMessage', { req: { thread_id: prefix, role: 'user', content: 'stolen' } }), /prefix not found/, 'foreign prefix cannot create a relationship or shadow thread');
  await rejects(() => foreignCall('getMessages', { threadId: prefix, startKey: first.id }), /cursor not found/, 'foreign message cursor rejected for prefix history');
  const otherThread = 'other-thread';
  const otherMessage = await call('createMessage', { req: { thread_id: otherThread, role: 'user', content: 'other' } });
  await rejects(() => call('getMessages', { threadId: prefix, startKey: otherMessage.id }), /cursor not found/, 'owned cursor from another thread rejected after canonical resolution');
  const missing = 'fedcba98765400000000000000000000';
  check((await call('getMessages', { threadId: missing })).messages.length === 0 && repository.get('threads', missing) === null, 'missing full thread reads empty without reservation');
  const missingMessage = await call('createMessage', { req: { thread_id: missing, role: 'user', content: 'new' } });
  check(missingMessage.thread_id === missing && repository.get('threads', missing).id === missing, 'missing full thread is reserved on write');
  for (const named of ['legacy.thread-name', 'personal:alice']) {
    const message = await call('createMessage', { req: { thread_id: named, role: 'user', content: 'named' } });
    check(message.thread_id === named && (await call('getMessages', { threadId: named })).messages[0].id === message.id, 'exact named/legacy thread ID is preserved');
  }
  const unknownPrefix = '0987654321ab';
  check((await call('getMessages', { threadId: unknownPrefix })).messages.length === 0, 'unknown prefix retains empty-read behavior');
  await rejects(() => call('createMessage', { req: { thread_id: unknownPrefix, role: 'user' } }), /prefix not found/, 'unknown prefix is not minted as a persistent ID');
  // Seed a historical exact 12-hex ID through SQLite: new resource writes must
  // not mint prefixes, but preexisting legacy IDs must continue to work verbatim.
  const legacyHex = 'facefeedcafe';
  const legacyDb = new Database(databasePath);
  try {
    const now = new Date().toISOString();
    legacyDb.prepare('INSERT INTO nodetool_threads (id,user_id,title,created_at,updated_at) VALUES (?,?,?,?,?)')
      .run(legacyHex, 'alice', 'Legacy exact', now, now);
  } finally { legacyDb.close(); }
  const modernFull = legacyHex + '0'.repeat(20);
  repository.put('threads', { id: modernFull, title: 'Modern full' });
  const legacyMessage = await call('createMessage', { req: { thread_id: legacyHex, role: 'user', content: 'legacy exact' } });
  const modernMessage = await call('createMessage', { req: { thread_id: modernFull, role: 'user', content: 'modern full' } });
  check(legacyMessage.thread_id === legacyHex && modernMessage.thread_id === modernFull, 'exact historical short-shaped ID takes precedence without changing either relationship');
  check((await call('getMessages', { threadId: legacyHex })).messages[0].id === legacyMessage.id, 'legacy exact history is distinct from modern full history');
  check((await call('getMessages', { threadId: modernFull })).messages[0].id === modernMessage.id, 'modern full history does not absorb the exact legacy history');
  const ambiguousPrefix = 'abcdef654321';
  for (const suffix of ['1'.repeat(20), '2'.repeat(20)]) repository.put('threads', { id: ambiguousPrefix + suffix, title: 'Ambiguous' });
  const before = repository.list('messages').length;
  await rejects(() => call('getMessages', { threadId: ambiguousPrefix }), /ambiguous/, 'ambiguous thread prefix read rejected');
  await rejects(() => call('createMessage', { req: { thread_id: ambiguousPrefix, role: 'user' } }), /ambiguous/, 'ambiguous thread prefix write rejected');
  check(repository.list('messages').length === before, 'ambiguous write has no message side effect');
  // Foreign matches do not make an owned unique prefix ambiguous.
  for (const suffix of ['1'.repeat(20), '2'.repeat(20)]) foreignModels.repository.put('threads', { id: prefix + suffix, title: 'Foreign' });
  check((await call('getMessages', { threadId: prefix })).messages.length === 2, 'thread prefix uniqueness is scoped to owner');
  await rejects(() => foreignCall('getMessages', { threadId: prefix }), /ambiguous/, 'foreign owner sees ambiguity only among its own threads');
  return checks;
}
