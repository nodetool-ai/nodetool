/**
 * The game page and the native screen meet at these functions, so they pin
 * what the page may load and say.
 */
import {
  gamePlayBaseUrl,
  isGamePlayUrl,
  parseGamePlayerMessage,
  unsupportedReason,
} from '../gamePlayerBridge';

const PATH = '/api/game-play/eyJ2IjoxfQ.c2ln/index.html';
const BASE = 'https://api.nodetool.ai/api/game-play/eyJ2IjoxfQ.c2ln/';

describe('gamePlayBaseUrl', () => {
  it('anchors the session directory at the configured host origin', () => {
    expect(gamePlayBaseUrl('https://api.nodetool.ai', PATH)).toBe(BASE);
    expect(gamePlayBaseUrl('https://api.nodetool.ai/some/prefix/', PATH)).toBe(BASE);
    expect(gamePlayBaseUrl('http://localhost:7777', PATH)).toBe(
      'http://localhost:7777/api/game-play/eyJ2IjoxfQ.c2ln/'
    );
  });

  it('refuses an answer that is not a play entry, or a host that is not http(s)', () => {
    for (const path of [
      'https://evil.example/index.html',
      '/api/game-play/eyJ2IjoxfQ.c2ln/../../index.html',
      '/api/game-play/token-without-signature/index.html',
      '/api/games/abc/export-zip',
      '//evil.example/api/game-play/a.b/index.html',
    ]) {
      expect(gamePlayBaseUrl('https://api.nodetool.ai', path)).toBeNull();
    }
    expect(gamePlayBaseUrl('file:///data', PATH)).toBeNull();
    expect(gamePlayBaseUrl('not a url', PATH)).toBeNull();
  });
});

describe('isGamePlayUrl', () => {
  it('allows the session files and the blank start page', () => {
    expect(isGamePlayUrl(`${BASE}index.html`, BASE)).toBe(true);
    expect(isGamePlayUrl(`${BASE}assets/ab.png`, BASE)).toBe(true);
    expect(isGamePlayUrl('about:blank', BASE)).toBe(true);
  });

  it('refuses other origins, other paths, escapes and embedded credentials', () => {
    for (const url of [
      'https://evil.example/api/game-play/eyJ2IjoxfQ.c2ln/index.html',
      'https://api.nodetool.ai/api/workflows',
      'https://api.nodetool.ai/api/game-play/other.token/index.html',
      `${BASE}../../workflows`,
      `${BASE}%2e%2e/%2e%2e/workflows`,
      'https://user:pass@api.nodetool.ai/api/game-play/eyJ2IjoxfQ.c2ln/index.html',
      'http://api.nodetool.ai/api/game-play/eyJ2IjoxfQ.c2ln/index.html',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'intent://scan',
    ]) {
      expect(isGamePlayUrl(url, BASE)).toBe(false);
    }
  });
});

describe('parseGamePlayerMessage', () => {
  it('reads each message the bridge script sends', () => {
    expect(parseGamePlayerMessage('{"type":"ready"}')).toEqual({ type: 'ready' });
    expect(parseGamePlayerMessage('{"type":"layout","landscape":true}')).toEqual({ type: 'layout', landscape: true });
    expect(parseGamePlayerMessage('{"type":"status","text":"Ready (canvas2d)"}')).toEqual({
      type: 'status',
      text: 'Ready (canvas2d)',
    });
    expect(
      parseGamePlayerMessage('{"type":"capabilities","webgl2":false,"webgpu":false,"secureContext":true}')
    ).toEqual({ type: 'capabilities', webgl2: false, webgpu: false, secureContext: true });
    expect(parseGamePlayerMessage(JSON.stringify({ type: 'error', message: 'x'.repeat(800) }))).toEqual({
      type: 'error',
      message: 'x'.repeat(500),
    });
  });

  it('drops anything outside the contract', () => {
    for (const data of [
      'not json',
      '{"type":"navigate","url":"https://evil.example"}',
      '{"type":"layout","landscape":"yes"}',
      '[]',
      JSON.stringify({ type: 'status', text: 'x'.repeat(5000) }),
    ]) {
      expect(parseGamePlayerMessage(data)).toBeNull();
    }
  });
});

describe('unsupportedReason', () => {
  it('names the missing capability', () => {
    expect(unsupportedReason('3d', { webgl2: false, secureContext: true })).toMatch(/WebGL2/);
    expect(unsupportedReason('2d', { webgl2: false, secureContext: true })).toBeNull();
    expect(unsupportedReason('2d', { webgl2: true, secureContext: false })).toMatch(/HTTPS/);
    expect(unsupportedReason('3d', { webgl2: true, secureContext: true })).toBeNull();
  });
});
