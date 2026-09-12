const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

export async function apiRequest(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const token = localStorage.getItem('auth_token');
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: isFormData ? {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers
    } : {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers
    },
    ...options
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || 'Request failed');
  }
  return payload;
}

export { API_BASE_URL };
