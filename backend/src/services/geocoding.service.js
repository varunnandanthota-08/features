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

function locationQueries(locationText) {
  const normalized = locationText.trim().replace(/\s+/g, ' ');
  const queries = [normalized];
  const withoutStreetPrefix = normalized.replace(
    /^(?:[\d\w\s.-]+?\b(?:road|rd|street|st|lane|ln|avenue|ave)\b)[\s,]*/i,
    ''
  ).trim();
  if (withoutStreetPrefix && withoutStreetPrefix !== normalized) queries.push(withoutStreetPrefix);
  return queries;
}

async function geocodeLocation(locationText, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (typeof locationText !== 'string' || !locationText.trim() || typeof fetchImpl !== 'function') return null;

  for (const queryText of locationQueries(locationText)) {
    const query = new URLSearchParams({
      q: queryText,
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
      if (response?.ok && response.status !== 429) {
        const results = await response.json();
        const parsed = Array.isArray(results) && results.length ? parseResult(results[0]) : null;
        if (parsed) return parsed;
      }
    } catch (_) {
      // Try the next normalized query when the provider cannot resolve this form.
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

module.exports = {
  geocodeLocation,
  locationQueries,
  parseResult,
  validCoordinate
};
