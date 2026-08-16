import { createTimeOrderedUuid } from '@nodetool-ai/timeline';
import { v4 as uuidv4 } from 'uuid';

import { installRandomUuid } from '../randomUuid';

type CryptoHost = { crypto?: { randomUUID?: () => string } };

const host = globalThis as CryptoHost;

describe('installRandomUuid', () => {
  const original = host.crypto;

  afterEach(() => {
    host.crypto = original;
  });

  it('supplies randomUUID when the runtime has none (Hermes)', () => {
    host.crypto = {};

    installRandomUuid();

    expect(host.crypto.randomUUID).toEqual(expect.any(Function));
    // `uuid` is mocked in jest.setup.js, so this asserts the delegation rather
    // than the id format.
    expect(host.crypto.randomUUID?.()).toBe(uuidv4());
  });

  it('creates the crypto object when it is missing entirely', () => {
    delete host.crypto;

    installRandomUuid();

    // Read through a fresh reference: the `delete` above narrows `host.crypto`
    // to undefined, so TS would not admit that the install put it back.
    const patched = (globalThis as CryptoHost).crypto;
    expect(patched?.randomUUID).toEqual(expect.any(Function));
  });

  it('leaves an existing randomUUID alone', () => {
    const existing = () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    host.crypto = { randomUUID: existing };

    installRandomUuid();

    expect(host.crypto.randomUUID).toBe(existing);
  });

  it('is what makes the timeline engine able to mint ids', () => {
    host.crypto = {};
    installRandomUuid();

    // createTimeOrderedUuid strips the hyphens off whatever randomUUID returns.
    expect(createTimeOrderedUuid()).toBe(uuidv4().replace(/-/g, ''));
  });
});
