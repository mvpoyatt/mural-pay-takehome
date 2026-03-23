// In development, Vite proxies /api → localhost:3001 (see vite.config.ts).
// In production, set VITE_API_BASE_URL to the Railway backend URL
// (e.g. https://mural-backend.up.railway.app) so fetch calls reach the right host.
const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export function apiUrl(path: string): string {
  return `${BASE}${path}`;
}
