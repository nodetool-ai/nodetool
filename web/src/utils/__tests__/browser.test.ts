import { getIsElectronDetails } from '../browser';

describe('getIsElectronDetails', () => {
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    delete (window as any).process;
    Object.defineProperty(Object.getPrototypeOf(navigator), 'userAgent', {
      value: originalUserAgent,
      configurable: true,
      writable: true,
    });
  });

  it('returns false when no electron signals are present', () => {
    const details = getIsElectronDetails();
    expect(details).toEqual({
      isElectron: false,
      isRendererProcess: false,
      hasElectronVersionInWindowProcess: false,
      hasElectronInUserAgent: false,
    });
  });

  it('detects renderer process', () => {
    (window as any).process = { type: 'renderer' };
    const details = getIsElectronDetails();
    expect(details.isElectron).toBe(true);
    expect(details.isRendererProcess).toBe(true);
  });

  it('detects electron version in process', () => {
    (window as any).process = { versions: { electron: '1.0.0' } };
    const details = getIsElectronDetails();
    expect(details.isElectron).toBe(true);
    expect(details.hasElectronVersionInWindowProcess).toBe(true);
  });

  it('detects electron user agent', () => {
    Object.defineProperty(Object.getPrototypeOf(navigator), 'userAgent', {
      value: 'MyApp Electron/22.0',
      configurable: true,
      writable: true,
    });
    const details = getIsElectronDetails();
    expect(details.isElectron).toBe(true);
    expect(details.hasElectronInUserAgent).toBe(true);
  });
});
