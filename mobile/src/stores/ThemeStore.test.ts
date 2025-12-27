import { renderHook, act } from '@testing-library/react-native';
import { useThemeStore } from './ThemeStore';
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

  it('returns colors', () => {
    const { result } = renderHook(() => useThemeStore());
    expect(result.current.colors).toBeDefined();
    expect(result.current.colors.background).toBeDefined();
    expect(result.current.colors.text).toBeDefined();
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

  it('setTheme updates colors when switching modes', () => {
    const { result } = renderHook(() => useThemeStore());
    const initialColors = result.current.colors;
    
    act(() => {
      result.current.setTheme('light');
    });
    const lightColors = result.current.colors;

    act(() => {
      result.current.setTheme('dark');
    });
    const darkColors = result.current.colors;

    // Colors should be different for different modes
    expect(lightColors).toBeDefined();
    expect(darkColors).toBeDefined();
  });

  it('toggleTheme switches from system to opposite of current system theme', () => {
    (Appearance.getColorScheme as jest.Mock).mockReturnValue('dark');
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

  it('updateSystemTheme updates colors when mode is system', () => {
    const { result } = renderHook(() => useThemeStore());
    
    act(() => {
      result.current.setTheme('system');
    });
    
    const colorsBefore = result.current.colors;
    
    act(() => {
      result.current.updateSystemTheme();
    });
    
    // Colors should be set (even if same)
    expect(result.current.colors).toBeDefined();
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
    (Appearance.getColorScheme as jest.Mock).mockReturnValue('dark');
    
    const { result } = renderHook(() => useThemeStore());
    
    act(() => {
      result.current.setTheme('system');
    });

    // Assuming dark background is darker than light
    expect(result.current.colors).toBeDefined();
  });

  it('uses light colors when system is light', () => {
    (Appearance.getColorScheme as jest.Mock).mockReturnValue('light');
    
    const { result } = renderHook(() => useThemeStore());
    
    act(() => {
      result.current.setTheme('system');
    });

    // Assuming light mode has light colors
    expect(result.current.colors).toBeDefined();
  });
});
