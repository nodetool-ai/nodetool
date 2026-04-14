import { act } from '@testing-library/react-native';

type AuthChangeCallback = (
  event: string,
  session: Record<string, unknown> | null
) => void;

const mockUnsubscribe = jest.fn();
const mockGetSession = jest.fn();
const mockSignOut = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockSignInWithIdToken = jest.fn();
const mockGoogleConfigure = jest.fn();
const mockGoogleHasPlayServices = jest.fn();
const mockGoogleSignIn = jest.fn();

jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signInWithIdToken: (...args: unknown[]) => mockSignInWithIdToken(...args),
    },
  },
  isSupabaseConfigured: true,
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'anon-test-key',
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: (...args: unknown[]) => mockGoogleConfigure(...args),
    hasPlayServices: (...args: unknown[]) => mockGoogleHasPlayServices(...args),
    signIn: (...args: unknown[]) => mockGoogleSignIn(...args),
  },
}));

import { useAuthStore } from './AuthStore';

describe('AuthStore', () => {
  let authChangeCallback: AuthChangeCallback | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    authChangeCallback = null;

    mockOnAuthStateChange.mockImplementation((callback: AuthChangeCallback) => {
      authChangeCallback = callback;
      return {
        data: {
          subscription: {
            unsubscribe: mockUnsubscribe,
          },
        },
      };
    });

    useAuthStore.setState({
      session: null,
      user: null,
      state: 'init',
      error: null,
      _authSubscription: null,
    });
  });

  it('initialize sets state to logged_out when no session exists', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    await act(async () => {
      await useAuthStore.getState().initialize();
    });

    expect(useAuthStore.getState().state).toBe('logged_out');
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('initialize sets state to logged_in when session exists', async () => {
    const session = { access_token: 'abc', user: { id: 'u1', email: 'x@y.z' } };
    mockGetSession.mockResolvedValue({ data: { session }, error: null });

    await act(async () => {
      await useAuthStore.getState().initialize();
    });

    expect(useAuthStore.getState().state).toBe('logged_in');
    expect(useAuthStore.getState().session).toEqual(session);
    expect(useAuthStore.getState().user).toEqual(session.user);
  });

  it('initialize handles getSession error', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'network failure' },
    });

    await act(async () => {
      await useAuthStore.getState().initialize();
    });

    expect(useAuthStore.getState().state).toBe('error');
    expect(useAuthStore.getState().error).toBe('network failure');
  });

  it('onAuthStateChange listener updates state on sign in', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    await act(async () => {
      await useAuthStore.getState().initialize();
    });

    expect(authChangeCallback).not.toBeNull();

    const session = { access_token: 'tok', user: { id: 'u2', email: 'a@b.c' } };
    act(() => {
      authChangeCallback!('SIGNED_IN', session);
    });

    expect(useAuthStore.getState().state).toBe('logged_in');
    expect(useAuthStore.getState().user).toEqual(session.user);
  });

  it('signOut clears session and sets logged_out', async () => {
    useAuthStore.setState({
      session: { access_token: 't' } as never,
      user: { id: 'u' } as never,
      state: 'logged_in',
    });
    mockSignOut.mockResolvedValue({ error: null });

    await act(async () => {
      await useAuthStore.getState().signOut();
    });

    expect(useAuthStore.getState().state).toBe('logged_out');
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('signOut sets error state if signOut fails', async () => {
    mockSignOut.mockResolvedValue({ error: { message: 'oops' } });

    await act(async () => {
      await useAuthStore.getState().signOut();
    });

    expect(useAuthStore.getState().state).toBe('error');
    expect(useAuthStore.getState().error).toBe('oops');
  });

  it('cleanup unsubscribes from auth changes', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    await act(async () => {
      await useAuthStore.getState().initialize();
    });

    expect(useAuthStore.getState()._authSubscription).not.toBeNull();

    act(() => {
      useAuthStore.getState().cleanup();
    });

    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(useAuthStore.getState()._authSubscription).toBeNull();
  });

  it('clearError resets the error to null', () => {
    useAuthStore.setState({ error: 'boom', state: 'error' });
    act(() => {
      useAuthStore.getState().clearError();
    });
    expect(useAuthStore.getState().error).toBeNull();
  });

  describe('signInWithGoogle', () => {
    it('exchanges Google ID token for a Supabase session on success', async () => {
      mockGoogleHasPlayServices.mockResolvedValue(true);
      mockGoogleSignIn.mockResolvedValue({
        data: { idToken: 'google-id-token-123' },
      });
      const session = { access_token: 'acc', user: { id: 'g1', email: 'g@u.com' } };
      mockSignInWithIdToken.mockResolvedValue({
        data: { session, user: session.user },
        error: null,
      });

      await act(async () => {
        await useAuthStore.getState().signInWithGoogle();
      });

      expect(mockGoogleHasPlayServices).toHaveBeenCalled();
      expect(mockGoogleSignIn).toHaveBeenCalled();
      expect(mockSignInWithIdToken).toHaveBeenCalledWith({
        provider: 'google',
        token: 'google-id-token-123',
        nonce: '',
      });
      expect(useAuthStore.getState().state).toBe('logged_in');
      expect(useAuthStore.getState().user).toEqual(session.user);
    });

    it('sets error when Google Sign-In returns no ID token', async () => {
      mockGoogleHasPlayServices.mockResolvedValue(true);
      mockGoogleSignIn.mockResolvedValue({ data: { idToken: null } });

      await act(async () => {
        await useAuthStore.getState().signInWithGoogle();
      });

      expect(useAuthStore.getState().state).toBe('error');
      expect(useAuthStore.getState().error).toMatch(/no id token/i);
    });

    it('sets error when Supabase rejects the ID token', async () => {
      mockGoogleHasPlayServices.mockResolvedValue(true);
      mockGoogleSignIn.mockResolvedValue({
        data: { idToken: 'bad-token' },
      });
      mockSignInWithIdToken.mockResolvedValue({
        data: { session: null, user: null },
        error: { message: 'Invalid token' },
      });

      await act(async () => {
        await useAuthStore.getState().signInWithGoogle();
      });

      expect(useAuthStore.getState().state).toBe('error');
      expect(useAuthStore.getState().error).toBe('Invalid token');
    });

    it('sets error when Google Sign-In throws', async () => {
      mockGoogleHasPlayServices.mockRejectedValue(new Error('No play services'));

      await act(async () => {
        await useAuthStore.getState().signInWithGoogle();
      });

      expect(useAuthStore.getState().state).toBe('error');
      expect(useAuthStore.getState().error).toBe('No play services');
    });
  });
});
