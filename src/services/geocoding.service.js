const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'RuralHealthEmergency/1.0';
const DEFAULT_TIMEOUT_MS = 3000;

function validCoordinate(value, minimum, maximum) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function parseResult(result) {
  const latitude = Number(result?.lat);
  const longitude = Number(result?.lon);
  if (!validCoordinate(latitude, -90, 90) || !validCoordinate(longitude, -180, 180)) return null;
  return {
    latitude,
    longitude,
    displayName: typeof result.display_name === 'string' && result.display_name.trim()
      ? result.display_name.trim()
      : null
  };
}

async function geocodeLocation(locationText, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (typeof locationText !== 'string' || !locationText.trim() || typeof fetchImpl !== 'function') return null;

  const query = new URLSearchParams({
    q: locationText.trim(),
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'in'
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${NOMINATIM_URL}?${query.toString()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT
      },
      signal: controller.signal
    });
    if (!response?.ok || response.status === 429) return null;
    const results = await response.json();
    return Array.isArray(results) && results.length ? parseResult(results[0]) : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  geocodeLocation,
  parseResult,
  validCoordinate
};
