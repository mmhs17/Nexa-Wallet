import axios from "axios";

const api = axios.create({
  // Same-origin by default so the Vite dev proxy (`/api` -> backend) is
  // used. This matches whatever host the page was loaded from
  // (localhost, 127.0.0.1, LAN IP) and avoids CORS host mismatches.
  // Set VITE_API_URL only when the API lives on a different origin.
  baseURL: import.meta.env.VITE_API_URL || "/api",
  withCredentials: true,
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("nexa_access");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;
    if (status === 401 && !original._retried && !original.url?.includes("/auth/refresh") && !original.url?.includes("/auth/login")) {
      original._retried = true;
      try {
        refreshing = refreshing || api.post("/auth/refresh", {});
        const { data } = await refreshing;
        refreshing = null;
        const token = data?.data?.accessToken;
        if (token) localStorage.setItem("nexa_access", token);
        if (token) original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch (e) {
        refreshing = null;
        localStorage.removeItem("nexa_access");
        if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
        return Promise.reject(e);
      }
    }
    return Promise.reject(error);
  }
);

export function apiError(err, fallback = "Something went wrong") {
  const data = err?.response?.data;
  if (data?.error?.details?.length) {
    return data.error.details.map((d) => `${d.field ? `${d.field}: ` : ""}${d.message}`).join("; ");
  }
  if (data?.error?.message) {
    if (data?.data?.riskScore !== undefined) return `${data.error.message} (risk ${data.data.riskScore}/100)`;
    if (data?.data?.factors?.length) {
      const top = data.data.factors.slice(0, 3).map((f) => f.code).join(", ");
      return `${data.error.message} — ${top}`;
    }
    return data.error.message;
  }
  return err?.message || fallback;
}

export function unwrap(res) {
  return res?.data?.data;
}

export default api;
