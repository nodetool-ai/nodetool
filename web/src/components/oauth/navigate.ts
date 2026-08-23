/**
 * The one place `/oauth/consent` leaves the SPA. Approve/Deny both resolve
 * to a URL on the OAuth client's own redirect_uri — never a route this app
 * owns — so navigation is a full browser navigation, not `useNavigate`.
 * Isolated in its own module so tests can mock it instead of fighting
 * jsdom's non-configurable `window.location`.
 */
export function navigateToRedirect(url: string): void {
  window.location.assign(url);
}
