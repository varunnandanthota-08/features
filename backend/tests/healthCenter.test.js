const request = require('supertest');

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next()
}));
const mockHealthCenter = {
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn()
};

jest.mock('../src/models/HealthCenter', () => mockHealthCenter);

const { app } = require('../src/app');

const validHealthCenter = {
  healthCenterId: 'HC-001',
  name: 'Rural Health Centre A',
  address: 'Main Road',
  village: 'Village A',
  district: 'Hyderabad',
  state: 'Telangana',
  location: { latitude: 17.385, longitude: 78.4867 },
  services: ['GENERAL', 'ENT'],
  doctors: { general: 2, ent: 1 },
  equipment: { ecg: true, xray: true },
  capacity: 50,
  currentPatientLoad: 32,
  emergencyAvailable: true
};

const nearbyHealthCenters = [
  {
    healthCenterId: 'HC-FAR',
    name: 'Far Centre',
    location: { latitude: 17.5, longitude: 78.5 }
  },
  {
    healthCenterId: 'HC-NEAR',
    name: 'Near Centre',
    location: { latitude: 17.421, longitude: 78.381 }
  },
  {
    healthCenterId: 'HC-OUT',
    name: 'Outside Centre',
    location: { latitude: 18, longitude: 79 }
  }
];

const recommendationHealthCenters = [
  {
    healthCenterId: 'HC-FAR',
    name: 'Far Centre',
    location: { latitude: 17.5, longitude: 78.5 },
    services: ['GENERAL', 'ENT'],
    doctors: { ent: 1 },
    equipment: { xray: true },
    capacity: 50,
    currentPatientLoad: 20,
    emergencyAvailable: true
  },
  {
    healthCenterId: 'HC-NEAR',
    name: 'Near Centre',
    location: { latitude: 17.421, longitude: 78.381 },
    services: ['GENERAL', 'ENT'],
    doctors: { ent: 1 },
    equipment: { xray: true, ecg: true },
    capacity: 40,
    currentPatientLoad: 10,
    emergencyAvailable: true
  },
  {
    healthCenterId: 'HC-NO-DOCTOR',
    name: 'No Doctor Centre',
    location: { latitude: 17.422, longitude: 78.382 },
    services: ['ENT'],
    doctors: { ent: 0 },
    equipment: { xray: true },
    capacity: 40,
    currentPatientLoad: 10,
    emergencyAvailable: false
  },
  {
    healthCenterId: 'HC-FULL',
    name: 'Full Centre',
    location: { latitude: 17.421, longitude: 78.381 },
    services: ['ENT'],
    doctors: { ent: 1 },
    equipment: { xray: true },
    capacity: 10,
    currentPatientLoad: 10,
    emergencyAvailable: true
  }
];

function editableHealthCenter(overrides = {}) {
  return {
    ...validHealthCenter,
    doctors: { general: 2, ent: 1, cardiology: 0, pediatrics: 0, gynecology: 0 },
    equipment: { ecg: true, xray: true, ultrasound: false },
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

describe('Health centre API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHealthCenter.create.mockResolvedValue({ ...validHealthCenter, _id: 'mongo-id' });
    mockHealthCenter.find.mockResolvedValue([validHealthCenter]);
    mockHealthCenter.findOne.mockResolvedValue(validHealthCenter);
  });

  test('POST creates a health centre', async () => {
    const response = await request(app).post('/api/health-centers').send(validHealthCenter);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ success: true, data: validHealthCenter });
    expect(mockHealthCenter.create).toHaveBeenCalledWith(validHealthCenter);
  });

  test('duplicate healthCenterId returns 409', async () => {
    const duplicateError = new Error('duplicate');
    duplicateError.code = 11000;
    mockHealthCenter.create.mockRejectedValue(duplicateError);

    const response = await request(app).post('/api/health-centers').send(validHealthCenter);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ success: false, message: 'healthCenterId already exists' });
  });

  test('GET all returns health centres', async () => {
    const response = await request(app).get('/api/health-centers');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [validHealthCenter] });
    expect(mockHealthCenter.find).toHaveBeenCalledWith({});
  });

  test('GET by healthCenterId returns the correct record', async () => {
    const response = await request(app).get('/api/health-centers/HC-001');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: validHealthCenter });
    expect(mockHealthCenter.findOne).toHaveBeenCalledWith({ healthCenterId: 'HC-001' });
  });

  test('missing healthCenterId returns 404', async () => {
    mockHealthCenter.findOne.mockResolvedValue(null);

    const response = await request(app).get('/api/health-centers/UNKNOWN');

    expect(response.status).toBe(404);
  });

  test.each([
    ['service', 'ENT'],
    ['district', 'Hyderabad'],
    ['state', 'Telangana']
  ])('supports case-insensitive %s search', async (filter, value) => {
    const response = await request(app).get(`/api/health-centers/search?${filter}=${value.toLowerCase()}`);

    expect(response.status).toBe(200);
    expect(mockHealthCenter.find).toHaveBeenCalledWith(expect.objectContaining({
      [filter === 'service' ? 'services' : filter]: expect.objectContaining({ $options: 'i' })
    }));
  });

  test('supports emergency filter', async () => {
    const response = await request(app).get('/api/health-centers/search?emergencyAvailable=true');

    expect(response.status).toBe(200);
    expect(mockHealthCenter.find).toHaveBeenCalledWith({ emergencyAvailable: true });
  });

  test('supports minimum available capacity search', async () => {
    const response = await request(app).get('/api/health-centers/search?minCapacityAvailable=10');

    expect(response.status).toBe(200);
    expect(mockHealthCenter.find).toHaveBeenCalledWith({
      $expr: { $gte: [{ $subtract: ['$capacity', '$currentPatientLoad'] }, 10] }
    });
  });

  test('returns nearby centres sorted by distance and excludes centres outside the radius', async () => {
    mockHealthCenter.find.mockResolvedValue(nearbyHealthCenters);

    const response = await request(app).get('/api/health-centers/nearby?latitude=17.421&longitude=78.381&radius=20');

    expect(response.status).toBe(200);
    expect(response.body.data.map(center => center.healthCenterId)).toEqual(['HC-NEAR', 'HC-FAR']);
    expect(response.body.data[0]).toEqual({
      healthCenterId: 'HC-NEAR',
      name: 'Near Centre',
      distanceKm: 0,
      location: { latitude: 17.421, longitude: 78.381 }
    });
    expect(response.body.data[1].distanceKm).toBeGreaterThan(0);
    expect(response.body.data[1]).not.toHaveProperty('_id');
  });

  test('calculates a known distance correctly', async () => {
    mockHealthCenter.find.mockResolvedValue([{
      healthCenterId: 'HC-KNOWN',
      name: 'Known Distance Centre',
      location: { latitude: 17.421, longitude: 78.391 }
    }]);

    const response = await request(app).get('/api/health-centers/nearby?latitude=17.421&longitude=78.381&radius=10');

    expect(response.status).toBe(200);
    expect(response.body.data[0].distanceKm).toBeCloseTo(1.06, 1);
  });

  test('recommends the highest-ranked suitable centre first', async () => {
    mockHealthCenter.find.mockResolvedValue(recommendationHealthCenters);

    const response = await request(app).get('/api/health-centers/recommend')
      .query({ latitude: 17.421, longitude: 78.381, service: 'ent', equipment: 'xray', emergency: 'true' });

    expect(response.status).toBe(200);
    expect(response.body.data.recommendation.healthCenterId).toBe('HC-NEAR');
    expect(response.body.data.facilities[0].healthCenterId).toBe('HC-NEAR');
    expect(response.body.data.facilities).toHaveLength(2);
    expect(response.body.data.facilities[0]).toMatchObject({
      availableCapacity: 30,
      services: ['GENERAL', 'ENT'],
      equipment: { xray: true },
      emergencyAvailable: true
    });
    expect(response.body.data.recommendation.reasons).toEqual(expect.arrayContaining([
      'ENT available', 'XRAY available', 'ENT doctor available', 'Emergency care available', 'Capacity available'
    ]));
  });

  test.each([
    ['service', 'cardiology', ['HC-NEAR']],
    ['equipment', 'ecg', ['HC-NEAR']],
    ['emergency', 'true', ['HC-NEAR', 'HC-FAR']]
  ])('applies recommendation %s filtering', async (filter, value, expectedIds) => {
    mockHealthCenter.find.mockResolvedValue(filter === 'service'
      ? [{ ...recommendationHealthCenters[1], services: ['CARDIOLOGY'], doctors: { cardiology: 1 } }]
      : recommendationHealthCenters);

    const response = await request(app).get('/api/health-centers/recommend')
      .query({ latitude: 17.421, longitude: 78.381, [filter]: value });

    expect(response.status).toBe(200);
    expect(response.body.data.facilities.map(facility => facility.healthCenterId)).toEqual(expectedIds);
  });

  test('filters by available capacity and maximum distance', async () => {
    mockHealthCenter.find.mockResolvedValue(recommendationHealthCenters);

    const response = await request(app).get('/api/health-centers/recommend')
      .query({ latitude: 17.421, longitude: 78.381, maxDistance: 1 });

    expect(response.status).toBe(200);
    expect(response.body.data.facilities.map(facility => facility.healthCenterId)).toEqual(['HC-NEAR', 'HC-NO-DOCTOR']);
  });

  test('returns no recommendation when no facility is suitable', async () => {
    mockHealthCenter.find.mockResolvedValue(recommendationHealthCenters);

    const response = await request(app).get('/api/health-centers/recommend')
      .query({ latitude: 17.421, longitude: 78.381, service: 'pediatrics' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ recommendation: null, facilities: [] });
  });

  test.each([
    ['latitude', '91'],
    ['longitude', '181'],
    ['maxDistance', '0'],
    ['maxDistance', 'invalid']
  ])('rejects invalid recommendation query %s=%s', async (field, value) => {
    const response = await request(app).get('/api/health-centers/recommend')
      .query({ latitude: '17.421', longitude: '78.381', [field]: value });

    expect(response.status).toBe(400);
    expect(mockHealthCenter.find).not.toHaveBeenCalled();
  });

  test.each([
    ['latitude', ''],
    ['longitude', ''],
    ['latitude', 'abc'],
    ['longitude', 'abc'],
    ['latitude', '91'],
    ['longitude', '181'],
    ['radius', '0'],
    ['radius', '-1'],
    ['radius', 'abc']
  ])('rejects invalid nearby query %s=%s', async (field, value) => {
    const query = { latitude: '17.421', longitude: '78.381', radius: '10', [field]: value };
    const response = await request(app).get('/api/health-centers/nearby').query(query);

    expect(response.status).toBe(400);
    expect(mockHealthCenter.find).not.toHaveBeenCalled();
  });

  test.each([
    ['location.latitude', -91],
    ['location.longitude', 181],
    ['capacity', -1],
    ['currentPatientLoad', -1],
    ['doctors.general', -1],
    ['doctors.ent', -1],
    ['doctors.cardiology', -1],
    ['doctors.pediatrics', -1],
    ['doctors.gynecology', -1]
  ])('rejects invalid %s', async (field, value) => {
    const body = JSON.parse(JSON.stringify(validHealthCenter));
    const [parent, child] = field.split('.');
    if (child) body[parent][child] = value;
    else body[field] = value;

    const response = await request(app).post('/api/health-centers').send(body);

    expect(response.status).toBe(400);
    expect(mockHealthCenter.create).not.toHaveBeenCalled();
  });

  test('updates doctor availability partially', async () => {
    const healthCenter = editableHealthCenter();
    mockHealthCenter.findOne.mockResolvedValue(healthCenter);

    const response = await request(app).patch('/api/health-centers/HC-001/availability')
      .send({ doctors: { ent: 2 } });

    expect(response.status).toBe(200);
    expect(healthCenter.doctors).toEqual({ general: 2, ent: 2, cardiology: 0, pediatrics: 0, gynecology: 0 });
    expect(response.body.data.availableCapacity).toBe(18);
    expect(healthCenter.save).toHaveBeenCalled();
  });

  test('updates equipment, patient load, and emergency availability together', async () => {
    const healthCenter = editableHealthCenter();
    mockHealthCenter.findOne.mockResolvedValue(healthCenter);

    const response = await request(app).patch('/api/health-centers/HC-001/availability').send({
      equipment: { xray: false, ultrasound: true },
      currentPatientLoad: 24,
      emergencyAvailable: false
    });

    expect(response.status).toBe(200);
    expect(healthCenter.equipment).toEqual({ ecg: true, xray: false, ultrasound: true });
    expect(healthCenter.currentPatientLoad).toBe(24);
    expect(healthCenter.emergencyAvailable).toBe(false);
    expect(response.body.data.availableCapacity).toBe(26);
  });

  test.each([
    [{ currentPatientLoad: 51 }],
    [{ doctors: { ent: -1 } }],
    [{ currentPatientLoad: -1 }],
    [{ equipment: { ecg: 'true' } }],
    [{ emergencyAvailable: 'true' }],
    [{ name: 'Changed' }]
  ])('rejects invalid availability input', async body => {
    const healthCenter = editableHealthCenter();
    mockHealthCenter.findOne.mockResolvedValue(healthCenter);

    const response = await request(app).patch('/api/health-centers/HC-001/availability').send(body);

    expect(response.status).toBe(400);
    expect(healthCenter.save).not.toHaveBeenCalled();
  });

  test('returns 404 for a nonexistent health centre availability update', async () => {
    mockHealthCenter.findOne.mockResolvedValue(null);

    const response = await request(app).patch('/api/health-centers/UNKNOWN/availability')
      .send({ doctors: { ent: 1 } });

    expect(response.status).toBe(404);
  });

  test('recommendations reflect updated doctor availability', async () => {
    const healthCenter = editableHealthCenter({
      services: ['ENT'],
      doctors: { general: 0, ent: 0, cardiology: 0, pediatrics: 0, gynecology: 0 }
    });
    mockHealthCenter.findOne.mockResolvedValue(healthCenter);
    mockHealthCenter.find.mockResolvedValue([healthCenter]);

    const updateResponse = await request(app).patch('/api/health-centers/HC-001/availability')
      .send({ doctors: { ent: 1 } });
    const recommendationResponse = await request(app).get('/api/health-centers/recommend')
      .query({ latitude: 17.385, longitude: 78.4867, service: 'ENT' });

    expect(updateResponse.status).toBe(200);
    expect(recommendationResponse.status).toBe(200);
    expect(recommendationResponse.body.data.facilities.map(facility => facility.healthCenterId)).toEqual(['HC-001']);
  });
});