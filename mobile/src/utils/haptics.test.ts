import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

import {
  hapticImpact,
  hapticNotification,
  hapticSelection,
  hapticsSupported,
} from './haptics';

const impactAsync = Haptics.impactAsync as jest.MockedFunction<typeof Haptics.impactAsync>;
const notificationAsync = Haptics.notificationAsync as jest.MockedFunction<
  typeof Haptics.notificationAsync
>;
const selectionAsync = Haptics.selectionAsync as jest.MockedFunction<
  typeof Haptics.selectionAsync
>;

function setPlatform(os: typeof Platform.OS): void {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

describe('haptics', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    setPlatform('ios');
  });

  afterAll(() => {
    setPlatform(originalOS);
  });

  it('maps impact styles onto expo feedback styles', () => {
    hapticImpact('heavy');
    expect(impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy);
  });

  it('defaults to a light impact', () => {
    hapticImpact();
    expect(impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('maps notification types onto expo feedback types', () => {
    hapticNotification('error');
    expect(notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Error
    );
  });

  it('forwards selection feedback', () => {
    hapticSelection();
    expect(selectionAsync).toHaveBeenCalled();
  });

  it('no-ops on platforms without taptic hardware', () => {
    setPlatform('web');
    expect(hapticsSupported()).toBe(false);

    hapticImpact('light');
    hapticNotification('success');
    hapticSelection();

    expect(impactAsync).not.toHaveBeenCalled();
    expect(notificationAsync).not.toHaveBeenCalled();
    expect(selectionAsync).not.toHaveBeenCalled();
  });

  it('swallows synchronous native failures', () => {
    impactAsync.mockImplementationOnce(() => {
      throw new Error('no taptic engine');
    });
    expect(() => hapticImpact('medium')).not.toThrow();
  });

  it('swallows rejected haptic promises', async () => {
    notificationAsync.mockRejectedValueOnce(new Error('native module missing'));
    expect(() => hapticNotification('warning')).not.toThrow();
    await Promise.resolve();
  });
});
