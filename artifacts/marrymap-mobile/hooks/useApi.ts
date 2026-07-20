import { useAuth } from '@clerk/expo';

const domain = process.env.EXPO_PUBLIC_DOMAIN;
export const apiBase = domain ? `https://${domain}/api` : '';

// Discriminated union: check `result.ok` to narrow data/error
export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status: number };

export function useApi() {
  const { getToken } = useAuth();

  async function apiFetch<T = unknown>(
    path: string,
    options: RequestInit = {}
  ): Promise<ApiResult<T>> {
    const token = await getToken();
    const url = `${apiBase}${path}`;
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...((options.headers as Record<string, string>) ?? {}),
        },
      });
      const json = await res.json();
      if (!res.ok) {
        return { ok: false, error: json.error ?? 'Something went wrong', status: res.status };
      }
      return { ok: true, data: json as T, status: res.status };
    } catch {
      return { ok: false, error: 'Network error. Please check your connection.', status: 0 };
    }
  }

  return { apiFetch };
}
