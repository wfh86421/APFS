import { apiBaseUrl } from './api';

export async function getPublicSiteConfig(key: string): Promise<unknown | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/v1/public/config/${key}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { config?: unknown };
    return body.config ?? null;
  } catch {
    return null;
  }
}

export async function getAdminSiteConfig(key: string, apiKey: string): Promise<unknown | null> {
  const response = await fetch(`${apiBaseUrl()}/v1/admin/configs/${key}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`讀取設定失敗：${response.status}`);
  const body = (await response.json()) as { config?: unknown };
  return body.config ?? null;
}

export async function putAdminSiteConfig(
  key: string,
  config: unknown,
  apiKey: string,
): Promise<void> {
  const response = await fetch(`${apiBaseUrl()}/v1/admin/configs/${key}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ config }),
  });
  if (!response.ok) throw new Error(`儲存設定失敗：${response.status}`);
}

