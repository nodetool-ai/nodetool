import { renderHook, act } from '@testing-library/react-native';
import { useThemeStore } from './ThemeStore';
import { paletteDark, paletteLight } from '../utils/theme';
import { Appearance } from 'react-native';

// Mock Appearance
jest.mock('react-native/Libraries/Utilities/Appearance', () => ({
  getColorScheme: jest.fn(() => 'dark'),
  addChangeListener: jest.fn(),
}));

describe('ThemeStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store to initial state
    useThemeStore.setState({
      mode: 'system',
      colors: useThemeStore.getState().colors,
    });
  });

  it('initializes with system mode', () => {
    const { result } = renderHook(() => useThemeStore());
    expect(result.current.mode).toBe('system');
  });

  it('setTheme changes mode to light', () => {
    const { result } = renderHook(() => useThemeStore());
    
    act(() => {
      result.current.setTheme('light');
    });

    expect(result.current.mode).toBe('light');
  });

  it('setTheme changes mode to dark', () => {
    const { result } = renderHook(() => useThemeStore());
    
    act(() => {
      result.current.setTheme('dark');
    });

    expect(result.current.mode).toBe('dark');
  });

  it('setTheme changes mode to system', () => {
    const { result } = renderHook(() => useThemeStore());
    
    act(() => {
      result.current.setTheme('light');
    });
    
    act(() => {
      result.current.setTheme('system');
    });

    expect(result.current.mode).toBe('system');
  });

  it('setTheme swaps the palette along with the mode', () => {
    const { result } = renderHook(() => useThemeStore());

    act(() => {
      result.current.setTheme('light');
    });
    expect(result.current.colors).toBe(paletteLight);

    act(() => {
      result.current.setTheme('dark');
    });
    expect(result.current.colors).toBe(paletteDark);
  });

  it('toggleTheme switches from system to opposite of current system theme', () => {
    jest.mocked(Appearance.getColorScheme).mockReturnValue('dark');
    const { result } = renderHook(() => useThemeStore());
    
    // Should start with system
    expect(result.current.mode).toBe('system');
    
    act(() => {
      result.current.toggleTheme();
    });

    // Should switch to light (opposite of dark system theme)
    expect(result.current.mode).toBe('light');
  });

  it('toggleTheme switches from dark to light', () => {
    const { result } = renderHook(() => useThemeStore());
    
    act(() => {
      result.current.setTheme('dark');
    });
    
    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.mode).toBe('light');
  });

  it('toggleTheme switches from light to dark', () => {
    const { result } = renderHook(() => useThemeStore());
    
    act(() => {
      result.current.setTheme('light');
    });
    
    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.mode).toBe('dark');
  });

  it('updateSystemTheme picks up a changed system scheme', () => {
    jest.mocked(Appearance.getColorScheme).mockReturnValue('dark');
    const { result } = renderHook(() => useThemeStore());

    act(() => {
      result.current.setTheme('system');
    });
    expect(result.current.colors).toBe(paletteDark);

    jest.mocked(Appearance.getColorScheme).mockReturnValue('light');
    act(() => {
      result.current.updateSystemTheme();
    });
    expect(result.current.colors).toBe(paletteLight);
  });

  it('updateSystemTheme does not update colors when mode is not system', () => {
    const { result } = renderHook(() => useThemeStore());
    
    act(() => {
      result.current.setTheme('dark');
    });
    
    const colorsBefore = result.current.colors;
    
    act(() => {
      result.current.updateSystemTheme();
    });
    
    // Colors should remain the same when not in system mode
    expect(result.current.colors).toBe(colorsBefore);
  });

  it('uses dark colors when system is dark', () => {
    jest.mocked(Appearance.getColorScheme).mockReturnValue('dark');

    const { result } = renderHook(() => useThemeStore());

    act(() => {
      result.current.setTheme('system');
    });

    expect(result.current.colors).toBe(paletteDark);
  });

  it('uses light colors when system is light', () => {
    jest.mocked(Appearance.getColorScheme).mockReturnValue('light');

    const { result } = renderHook(() => useThemeStore());

    act(() => {
      result.current.setTheme('system');
    });

    expect(result.current.colors).toBe(paletteLight);
  });
});
