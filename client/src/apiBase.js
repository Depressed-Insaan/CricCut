/** Base URL for the CricCut API (no trailing slash). */
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

/**
 * Build a full API URL from a path like `/api/upload`.
 * If VITE_API_URL is unset, returns the path (same-origin / Vite proxy).
 */
export function apiUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${normalized}` : normalized;
}
