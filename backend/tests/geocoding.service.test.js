const { geocodeLocation } = require('../src/services/geocoding.service');

describe('geocoding service', () => {
  test('returns validated Nominatim coordinates and sends India/User-Agent parameters', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ lat: '17.05', lon: '79.27', display_name: 'Nalgonda, Telangana, India' }]
    });

    const result = await geocodeLocation('Nalgonda', { fetchImpl });

    expect(result).toEqual({
      latitude: 17.05,
      longitude: 79.27,
      displayName: 'Nalgonda, Telangana, India'
    });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain('https://nominatim.openstreetmap.org/search?');
    expect(url).toContain('q=Nalgonda');
    expect(url).toContain('countrycodes=in');
    expect(options.headers['User-Agent']).toContain('RuralHealthEmergency');
  });

  test('returns null for no result', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    await expect(geocodeLocation('Unknown place', { fetchImpl, timeoutMs: 50 })).resolves.toBeNull();
  });

  test('retries a street-prefixed locality with the normalized locality query', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ lat: '18.3145348', lon: '80.3458816', display_name: 'Mulugu, Telangana, India' }]
      });

    await expect(geocodeLocation('main road mulugu, telangana', { fetchImpl })).resolves.toEqual({
      latitude: 18.3145348,
      longitude: 80.3458816,
      displayName: 'Mulugu, Telangana, India'
    });
    expect(fetchImpl.mock.calls[1][0]).toContain('q=mulugu%2C+telangana');
  });

  test('returns null for invalid coordinates', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ lat: '95', lon: '79', display_name: 'Invalid' }]
    });
    await expect(geocodeLocation('Unknown place', { fetchImpl, timeoutMs: 50 })).resolves.toBeNull();
  });

  test('returns null for timeout/network failure and rate limiting', async () => {
    const timeoutFetch = jest.fn((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    await expect(geocodeLocation('Nalgonda', { fetchImpl: timeoutFetch, timeoutMs: 5 })).resolves.toBeNull();

    const failedFetch = jest.fn().mockRejectedValue(new Error('network failure'));
    await expect(geocodeLocation('Nalgonda', { fetchImpl: failedFetch })).resolves.toBeNull();

    const rateLimitedFetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(geocodeLocation('Nalgonda', { fetchImpl: rateLimitedFetch })).resolves.toBeNull();
  });
});