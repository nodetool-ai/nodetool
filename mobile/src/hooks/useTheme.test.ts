import { renderHook } from '@testing-library/react-native';
import { useTheme } from './useTheme';
import { useThemeStore } from '../stores/ThemeStore';
import { Appearance } from 'react-native';

// Mock the ThemeStore
jest.mock('../stores/ThemeStore');
jest.mock('react-native/Libraries/Utilities/Appearance', () => ({
  getColorScheme: jest.fn(() => 'dark'),
  addChangeListener: jest.fn(),
}));

describe('useTheme', () => {
  const mockSetTheme = jest.fn();
  const mockToggleTheme = jest.fn();
  const mockColors = {
    background: '#000000',
    text: '#FFFFFF',
    textSecondary: '#AAAAAA',
    primary: '#007AFF',
    border: '#444444',
    inputBg: '#1E1E1E',
    error: '#FF3B30',
    success: '#34C759',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useThemeStore as unknown as jest.Mock).mockReturnValue({
      mode: 'dark',
      colors: mockColors,
      setTheme: mockSetTheme,
      toggleTheme: mockToggleTheme,
    });
  });

  it('returns theme mode', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe('dark');
  });

  it('returns theme colors', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.colors).toEqual(mockColors);
  });

  it('returns setTheme function', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.setTheme).toBe(mockSetTheme);
  });

  it('returns toggleTheme function', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.toggleTheme).toBe(mockToggleTheme);
  });

  it('returns isDark as true when mode is dark', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.isDark).toBe(true);
  });

  it('returns isDark as false when mode is light', () => {
    (useThemeStore as unknown as jest.Mock).mockReturnValue({
      mode: 'light',
      colors: mockColors,
      setTheme: mockSetTheme,
      toggleTheme: mockToggleTheme,
    });

    const { result } = renderHook(() => useTheme());
    expect(result.current.isDark).toBe(false);
  });

  it('returns effectiveMode as dark when isDark is true', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.effectiveMode).toBe('dark');
  });

  it('returns effectiveMode as light when isDark is false', () => {
    (useThemeStore as unknown as jest.Mock).mockReturnValue({
      mode: 'light',
      colors: mockColors,
      setTheme: mockSetTheme,
      toggleTheme: mockToggleTheme,
    });

    const { result } = renderHook(() => useTheme());
    expect(result.current.effectiveMode).toBe('light');
  });

  it('uses system appearance when mode is system', () => {
    (useThemeStore as unknown as jest.Mock).mockReturnValue({
      mode: 'system',
      colors: mockColors,
      setTheme: mockSetTheme,
      toggleTheme: mockToggleTheme,
    });

    const { result } = renderHook(() => useTheme());
    expect(result.current.isDark).toBe(true);
    expect(Appearance.getColorScheme).toHaveBeenCalled();
  });

  it('uses system appearance as light when system is light', () => {
    (Appearance.getColorScheme as jest.Mock).mockReturnValue('light');
    (useThemeStore as unknown as jest.Mock).mockReturnValue({
      mode: 'system',
      colors: mockColors,
      setTheme: mockSetTheme,
      toggleTheme: mockToggleTheme,
    });

    const { result } = renderHook(() => useTheme());
    expect(result.current.isDark).toBe(false);
  });
});
