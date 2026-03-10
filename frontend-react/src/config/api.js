/**
 * Bazowy URL API.
 * Dev: pusty (proxy w vite → localhost:8080)
 * Prod (Firebase): ustaw VITE_API_URL w .env.production
 */
export const API_BASE = import.meta.env.VITE_API_URL || "";

/** URL WebSocket — z API_BASE (https→wss, http→ws) */
export const WS_BASE = (() => {
  if (!API_BASE) return "";
  const u = API_BASE.replace(/^http/, "ws");
  return u.endsWith("/") ? u.slice(0, -1) : u;
})();
