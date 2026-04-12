import { act } from '@testing-library/react-native';

type AuthChangeCallback = (
  event: string,
  session: Record<string, unknown> | null
) => void;

const mockUnsubscribe = jest.fn();
const mockGetSession = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();
const mockSignOut = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockSignInWithOAuth = jest.fn();
const mockSetSession = jest.fn();
const mockOpenAuthSession = jest.fn();
const mockMakeRedirectUri: jest.Mock = jest.fn(
  () => 'nodetool://auth-callback'
);
const mockGetQueryParams = jest.fn();

jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      setSession: (...args: unknown[]) => mockSetSession(...args),
    },
  },
  isSupabaseConfigured: true,
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'anon-test-key',
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSession(...args),
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: (...args: unknown[]) => mockMakeRedirectUri(...args),
}));

jest.mock('expo-auth-session/build/QueryParams', () => ({
  getQueryParams: (...args: unknown[]) => mockGetQueryParams(...args),
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

  it('signInWithPassword updates session on success', async () => {
    const session = { access_token: 'tok', user: { id: 'u', email: 'e@f.g' } };
    mockSignInWithPassword.mockResolvedValue({
      data: { session, user: session.user },
      error: null,
    });

    await act(async () => {
      await useAuthStore.getState().signInWithPassword('e@f.g', 'secret123');
    });

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'e@f.g',
      password: 'secret123',
    });
    expect(useAuthStore.getState().state).toBe('logged_in');
    expect(useAuthStore.getState().user).toEqual(session.user);
  });

  it('signInWithPassword trims the email', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: null,
    });

    await act(async () => {
      await useAuthStore.getState().signInWithPassword('  foo@bar.com  ', 'secret');
    });

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'foo@bar.com',
      password: 'secret',
    });
  });

  it('signInWithPassword sets error state on failure', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Invalid credentials' },
    });

    await act(async () => {
      await useAuthStore.getState().signInWithPassword('a@b.c', 'wrong');
    });

    expect(useAuthStore.getState().state).toBe('error');
    expect(useAuthStore.getState().error).toBe('Invalid credentials');
  });

  it('signUpWithPassword returns info message when confirmation required', async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null, user: { id: 'new' } },
      error: null,
    });

    await act(async () => {
      await useAuthStore.getState().signUpWithPassword('new@user.com', 'password');
    });

    expect(useAuthStore.getState().state).toBe('logged_out');
    expect(useAuthStore.getState().error).toMatch(/confirm your account/i);
  });

  it('signUpWithPassword logs in when session is returned immediately', async () => {
    const session = { access_token: 't', user: { id: 'new2' } };
    mockSignUp.mockResolvedValue({
      data: { session, user: session.user },
      error: null,
    });

    await act(async () => {
      await useAuthStore.getState().signUpWithPassword('n2@u.com', 'password');
    });

    expect(useAuthStore.getState().state).toBe('logged_in');
    expect(useAuthStore.getState().session).toEqual(session);
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

  describe('signInWithOAuth (google)', () => {
    const oauthUrl = 'https://supabase.example/authorize?provider=google';
    const callbackUrl =
      'nodetool://auth-callback#access_token=acc&refresh_token=ref';

    it('exchanges OAuth callback tokens for a session on success', async () => {
      mockSignInWithOAuth.mockResolvedValue({
        data: { url: oauthUrl },
        error: null,
      });
      mockOpenAuthSession.mockResolvedValue({
        type: 'success',
        url: callbackUrl,
      });
      mockGetQueryParams.mockReturnValue({
        params: { access_token: 'acc', refresh_token: 'ref' },
        errorCode: null,
      });
      const session = { access_token: 'acc', user: { id: 'g1', email: 'g@u.com' } };
      mockSetSession.mockResolvedValue({
        data: { session, user: session.user },
        error: null,
      });

      await act(async () => {
        await useAuthStore.getState().signInWithOAuth('google');
      });

      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: 'nodetool://auth-callback',
          skipBrowserRedirect: true,
        },
      });
      expect(mockOpenAuthSession).toHaveBeenCalledWith(
        oauthUrl,
        'nodetool://auth-callback'
      );
      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: 'acc',
        refresh_token: 'ref',
      });
      expect(useAuthStore.getState().state).toBe('logged_in');
      expect(useAuthStore.getState().user).toEqual(session.user);
    });

    it('returns to logged_out when the user cancels the browser', async () => {
      mockSignInWithOAuth.mockResolvedValue({
        data: { url: oauthUrl },
        error: null,
      });
      mockOpenAuthSession.mockResolvedValue({ type: 'cancel' });

      await act(async () => {
        await useAuthStore.getState().signInWithOAuth('google');
      });

      expect(mockSetSession).not.toHaveBeenCalled();
      expect(useAuthStore.getState().state).toBe('logged_out');
      expect(useAuthStore.getState().error).toBeNull();
    });

    it('sets error state when Supabase returns an error', async () => {
      mockSignInWithOAuth.mockResolvedValue({
        data: null,
        error: { message: 'provider disabled' },
      });

      await act(async () => {
        await useAuthStore.getState().signInWithOAuth('google');
      });

      expect(useAuthStore.getState().state).toBe('error');
      expect(useAuthStore.getState().error).toBe('provider disabled');
      expect(mockOpenAuthSession).not.toHaveBeenCalled();
    });

    it('sets error state when callback URL lacks tokens', async () => {
      mockSignInWithOAuth.mockResolvedValue({
        data: { url: oauthUrl },
        error: null,
      });
      mockOpenAuthSession.mockResolvedValue({
        type: 'success',
        url: 'nodetool://auth-callback',
      });
      mockGetQueryParams.mockReturnValue({ params: {}, errorCode: null });

      await act(async () => {
        await useAuthStore.getState().signInWithOAuth('google');
      });

      expect(useAuthStore.getState().state).toBe('error');
      expect(useAuthStore.getState().error).toMatch(/missing access or refresh token/i);
    });

    it('sets error state when callback URL includes an error code', async () => {
      mockSignInWithOAuth.mockResolvedValue({
        data: { url: oauthUrl },
        error: null,
      });
      mockOpenAuthSession.mockResolvedValue({
        type: 'success',
        url: 'nodetool://auth-callback?error=access_denied',
      });
      mockGetQueryParams.mockReturnValue({
        params: {},
        errorCode: 'access_denied',
      });

      await act(async () => {
        await useAuthStore.getState().signInWithOAuth('google');
      });

      expect(useAuthStore.getState().state).toBe('error');
      expect(useAuthStore.getState().error).toBe('access_denied');
    });
  });
});
