const patient = {
  _id: '507f1f77bcf86cd799439011',
  location: { village: 'Rampur' }
};
const mockFindByPhone = jest.fn();
const mockPatientFindById = jest.fn();
const mockHealthCenterFind = jest.fn();
const mockHealthCenterFindById = jest.fn();
const mockEmergencyFind = jest.fn();
const mockEmergencyFindOne = jest.fn();
const mockEmergencyCreate = jest.fn();

jest.mock('../src/services/patient.service', () => ({
  findByPhone: mockFindByPhone
}));

jest.mock('../src/models/Patient', () => ({
  findById: mockPatientFindById
}));

jest.mock('../src/models/HealthCenter', () => ({
  find: mockHealthCenterFind,
  findById: mockHealthCenterFindById
}));

jest.mock('../src/models/EmergencyCase', () => ({
  create: mockEmergencyCreate,
  find: mockEmergencyFind,
  findOne: mockEmergencyFindOne
}));

const {
  createEmergencyCase,
  findEscalationTarget,
  getActiveEmergencies,
  acknowledgeEmergency
} = require('../src/services/emergency.service');

describe('emergency service', () => {
  beforeEach(() => {
    mockFindByPhone.mockReset();
    mockPatientFindById.mockReset();
    mockHealthCenterFind.mockReset();
    mockHealthCenterFindById.mockReset();
    mockEmergencyFind.mockReset();
    mockEmergencyFindOne.mockReset();
    mockEmergencyCreate.mockReset();
    mockFindByPhone.mockResolvedValue(patient);
    mockHealthCenterFind.mockResolvedValue([
      {
        _id: 'facility-near',
        healthCenterId: 'HC-NEAR',
        name: 'Nearby General Centre',
        address: 'Near Rampur',
        village: 'Rampur',
        capacity: 20,
        currentPatientLoad: 5,
        emergencyAvailable: false,
        location: { latitude: 17.4, longitude: 78.4 }
      },
      {
        _id: 'facility-emergency',
        healthCenterId: 'HC-EMERGENCY',
        name: 'Emergency Centre',
        address: 'District Road',
        village: 'Other Village',
        capacity: 10,
        currentPatientLoad: 2,
        emergencyAvailable: true,
        location: { latitude: 17.5, longitude: 78.5 }
      }
    ]);
    mockEmergencyCreate.mockImplementation(async data => ({ _id: 'case-id', ...data }));
  });

  test('creates a critical IVR emergency and selects an emergency-capable facility', async () => {
    const result = await createEmergencyCase({
      phone: '+919392123042',
      source: 'PHONE_IVR',
      reason: 'Emergency request via IVR',
      location: { latitude: 17.4, longitude: 78.4 },
      status: 'ALERTED'
    });

    expect(mockFindByPhone).toHaveBeenCalledWith('+919392123042');
    expect(mockEmergencyCreate).toHaveBeenCalledWith(expect.objectContaining({
      patientId: patient._id,
      type: 'EMERGENCY',
      priority: 'CRITICAL',
      source: 'PHONE_IVR',
      status: 'ALERTED',
      referredFacilityId: 'facility-emergency'
    }));
    expect(result.selectedFacility).toMatchObject({
      healthCenterId: 'HC-EMERGENCY',
      emergencyAvailable: true
    });
  });

  test('uses stored patient coordinates and persists the assigned health centre', async () => {
    mockFindByPhone.mockResolvedValueOnce({
      ...patient,
      location: { village: 'Rampur', latitude: 17.4, longitude: 78.4 }
    });

    await createEmergencyCase({
      phone: '+919392123042',
      source: 'PHONE_IVR',
      reason: 'Emergency request via IVR',
      status: 'ALERTED'
    });

    expect(mockEmergencyCreate).toHaveBeenCalledWith(expect.objectContaining({
      location: { latitude: 17.4, longitude: 78.4 },
      locationStatus: 'RESOLVED',
      assignedHealthCenterId: 'facility-emergency',
      assignmentStatus: 'ASSIGNED'
    }));
  });

  test('persists an assigned SMS emergency with real patient and health centre coordinates', async () => {
    const result = await createEmergencyCase({
      phone: '+919392123042',
      source: 'SMS',
      reason: 'Emergency request via SMS',
      location: { latitude: 17.4, longitude: 78.4 },
      locationLabel: 'Madhapur, Hyderabad, India',
      status: 'ALERTED'
    });

    expect(result.selectedFacility).toMatchObject({
      healthCenterId: 'HC-EMERGENCY',
      location: { latitude: 17.5, longitude: 78.5 }
    });
    expect(mockEmergencyCreate).toHaveBeenCalledWith(expect.objectContaining({
      source: 'SMS',
      location: { latitude: 17.4, longitude: 78.4 },
      locationStatus: 'RESOLVED',
      assignedHealthCenterId: 'facility-emergency',
      assignmentStatus: 'ASSIGNED',
      referredFacilityId: 'facility-emergency'
    }));
  });

  test('selects the nearest suitable alternative and excludes the current centre', async () => {
    const result = await findEscalationTarget({
      assignedHealthCenterId: 'facility-near',
      location: { latitude: 17.4, longitude: 78.4 }
    });

    expect(result.healthCenter).toMatchObject({
      _id: 'facility-emergency',
      healthCenterId: 'HC-EMERGENCY'
    });
    expect(result.healthCenter._id).not.toBe('facility-near');
  });

  test('does not assign a centre when patient coordinates are unavailable', async () => {
    await createEmergencyCase({
      phone: '+919392123042',
      source: 'PHONE_IVR',
      reason: 'Emergency request via IVR',
      status: 'ALERTED'
    });

    expect(mockHealthCenterFind).not.toHaveBeenCalled();
    expect(mockEmergencyCreate).toHaveBeenCalledWith(expect.objectContaining({
      location: {},
      locationStatus: 'UNRESOLVED',
      assignedHealthCenterId: null,
      assignmentStatus: 'PENDING',
      referredFacilityId: null
    }));
  });

  test('requires an existing patient', async () => {
    mockFindByPhone.mockResolvedValueOnce(null);

    await expect(createEmergencyCase({
      phone: '+919392123042',
      source: 'PHONE_IVR',
      reason: 'Emergency request via IVR'
    })).rejects.toMatchObject({ statusCode: 404 });
    expect(mockEmergencyCreate).not.toHaveBeenCalled();
  });

  test('returns active emergencies with patient, location, and facility data in urgency order', async () => {
    const newerEmergency = {
      caseId: 'EMG-NEW',
      patientId: patient._id,
      reason: 'Chest pain',
      source: 'PHONE_IVR',
      priority: 'CRITICAL',
      status: 'ALERTED',
      location: { latitude: 17.4, longitude: 78.4 },
      referredFacilityId: 'facility-emergency',
      createdAt: new Date('2026-09-10T10:00:00Z'),
      acknowledgedAt: null,
      escalationLevel: 0
    };
    const olderEmergency = { ...newerEmergency, caseId: 'EMG-OLD', createdAt: new Date('2026-09-10T09:00:00Z'), status: 'ACKNOWLEDGED' };
    const sortedEmergencies = [newerEmergency, olderEmergency];
    const sort = jest.fn().mockResolvedValue(sortedEmergencies);
    mockEmergencyFind.mockReturnValue({ sort });
    mockPatientFindById.mockResolvedValue(patient);
    mockHealthCenterFindById.mockResolvedValue({
      healthCenterId: 'HC-EMERGENCY',
      name: 'Emergency Centre'
    });

    const result = await getActiveEmergencies();

    expect(mockEmergencyFind).toHaveBeenCalledWith({
      status: { $in: ['ALERTED', 'ACKNOWLEDGED', 'RESPONDING', 'ESCALATED'] }
    });
    expect(sort).toHaveBeenCalledWith({ priority: -1, createdAt: -1 });
    expect(result.map(emergency => emergency.caseId)).toEqual(['EMG-NEW', 'EMG-OLD']);
    expect(result[0]).toMatchObject({
      patient,
      reason: 'Chest pain',
      location: newerEmergency.location,
      patientLocation: { latitude: 17.4, longitude: 78.4, village: 'Rampur' },
      assignedHealthCenter: { healthCenterId: 'HC-EMERGENCY' },
      selectedHealthCenter: { healthCenterId: 'HC-EMERGENCY' }
    });
  });

  test('rejects acknowledging a resolved emergency', async () => {
    const resolvedEmergency = {
      status: 'RESOLVED',
      save: jest.fn()
    };
    mockEmergencyFindOne.mockResolvedValueOnce(resolvedEmergency);

    await expect(acknowledgeEmergency('EMG-RESOLVED', 'worker-1'))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(resolvedEmergency.save).not.toHaveBeenCalled();
  });
});