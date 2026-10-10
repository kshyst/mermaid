export async function apiRequest(path, method = 'GET', data) {
  let response;
  try {
    response = await fetch(path, { method, credentials: 'same-origin', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  } catch { throw new Error('Cannot reach the server. Your draft is kept locally; try again.'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !['/api/auth/login','/api/auth/register','/api/auth/me'].includes(path)) window.dispatchEvent(new Event('mermaid:session-expired'));
    const error = new Error(result.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return result;
}
