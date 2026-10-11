import { AI_API_URL, CORE_API_URL } from "./config";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function request<T>(base: string, method: Method, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    credentials: "include", // session cookie issued by the auth service
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(init?.headers ?? {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...init,
  });
  if (!res.ok) {
    let payload: { message?: string; code?: string } = {};
    try {
      payload = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(payload.message ?? `Request failed (${res.status})`, res.status, payload.code, payload);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function client(base: string) {
  return {
    get: <T>(path: string, init?: RequestInit) => request<T>(base, "GET", path, undefined, init),
    post: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>(base, "POST", path, body, init),
    put: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>(base, "PUT", path, body, init),
    patch: <T>(path: string, body?: unknown, init?: RequestInit) => request<T>(base, "PATCH", path, body, init),
    delete: <T>(path: string, init?: RequestInit) => request<T>(base, "DELETE", path, undefined, init),
  };
}

/** Spring Boot core services */
export const coreApi = client(CORE_API_URL);
/** FastAPI AI services */
export const aiApi = client(AI_API_URL);
