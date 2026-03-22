/**
 * URL Validation Utilities
 *
 * Provides secure URL validation to prevent:
 * - CSS injection via malicious URLs in backgroundImage
 * - SSRF (Server-Side Request Forgery) attacks
 * - XSS via javascript: and data: URLs
 */

/**
 * Validates if a URL is safe to use in sensitive contexts (CSS, image sources, etc.)
 * Only allows http:, https:, and blob: protocols
 *
 * @param url - The URL string to validate
 * @returns true if the URL is safe, false otherwise
 */
export function validateAssetUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    // Parse the URL to validate its structure and protocol
    // Use a base URL that works in both browser and Node environments
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(url, base);

    // Only allow specific protocols
    const allowedProtocols = ['http:', 'https:', 'blob:'];
    if (!allowedProtocols.includes(parsed.protocol)) {
      return false;
    }

    // Additional safety: reject URLs with obvious injection attempts
    // This catches things like javascript: even if they slip through protocol check
    if (url.includes('javascript:') || url.includes('data:') || url.includes('vbscript:')) {
      return false;
    }

    return true;
  } catch {
    // Invalid URL syntax
    return false;
  }
}

/**
 * Validates if a URL is safe to fetch (prevents SSRF)
 * Blocks internal/private network addresses and restricts protocols
 *
 * @param url - The URL string to validate
 * @returns true if the URL is safe to fetch, false otherwise
 */
export function validateFetchUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    // Use a base URL that works in both browser and Node environments
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(url, base);

    // Only allow http and https protocols for fetching
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    // Block private/internal IP addresses to prevent SSRF
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return false;
    }

    // Block private network ranges
    if (hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.16.')) {
      return false;
    }

    // Block link-local addresses
    if (hostname.startsWith('169.254.')) {
      return false;
    }

    // Block .local domains (multicast DNS)
    if (hostname.endsWith('.local')) {
      return false;
    }

    // Additional safety: reject obvious injection attempts
    if (url.includes('javascript:') || url.includes('data:') || url.includes('vbscript:')) {
      return false;
    }

    return true;
  } catch {
    // Invalid URL syntax
    return false;
  }
}

/**
 * Sanitizes a URL for use in CSS backgroundImage
 * Returns the URL if valid, or undefined otherwise
 *
 * @param url - The URL string to sanitize
 * @returns The URL if valid, undefined if invalid
 */
export function sanitizeImageUrl(url: string | undefined | null): string | undefined {
  if (!url || !validateAssetUrl(url)) {
    return undefined;
  }
  return url;
}
