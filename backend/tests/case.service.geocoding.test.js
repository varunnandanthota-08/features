const mockCaseCreate = jest.fn();
const mockPatientFindById = jest.fn();
const mockPatientCreate = jest.fn();
const mockFindByPhone = jest.fn();
const mockGeocodeLocation = jest.fn();
const mockFindSuitableHealthCenter = jest.fn();

jest.mock('../src/models/Case', () => ({
  create: mockCaseCreate
}));
jest.mock('../src/models/Patient', () => ({
  findById: mockPatientFindById,
  create: mockPatientCreate
}));
jest.mock('../src/services/patient.service', () => ({
  findByPhone: mockFindByPhone
}));
jest.mock('../src/services/geocoding.service', () => ({
  geocodeLocation: mockGeocodeLocation
}));
jest.mock('../src/services/emergency.service', () => ({
  findSuitableHealthCenter: mockFindSuitableHealthCenter
}));

const { createCase } = require('../src/services/case.service');

describe('Case Creation Geocoding and Assignment', () => {
  let mockPatient;

  beforeEach(() => {
    mockPatient = {
      _id: 'patient-123',
      phone: '+919876543210',
      location: { village: 'OriginalVillage' },
      save: jest.fn().mockResolvedValue(true)
    };
    
    mockCaseCreate.mockReset();
    mockPatientFindById.mockReset();
    mockPatientCreate.mockReset();
    mockFindByPhone.mockReset();
    mockGeocodeLocation.mockReset();
    mockFindSuitableHealthCenter.mockReset();

    mockFindByPhone.mockResolvedValue(mockPatient);
    
    // Default fallback to show HC-010 behaviour if coordinates are missing
    mockFindSuitableHealthCenter.mockImplementation(async ({ location, village }) => {
      if (!location) {
        return {
          healthCenter: { _id: 'hc-010', healthCenterId: 'HC-010' },
          facility: { healthCenterId: 'HC-010', distanceKm: null }
        };
      }
      return {
        healthCenter: { _id: 'hc-resolved', healthCenterId: 'HC-RESOLVED' },
        facility: { healthCenterId: 'HC-RESOLVED', distanceKm: 2.5 }
      };
    });
    
    mockCaseCreate.mockImplementation(async data => ({ _id: 'case-abc', ...data }));
  });

  test('1. WHATSAPP case with textual location (Habsiguda) goes through geocoding', async () => {
    mockGeocodeLocation.mockResolvedValue({ latitude: 17.41, longitude: 78.54 });
    mockFindSuitableHealthCenter.mockImplementation(async ({ location }) => {
      // Mocking proximity resolution when coordinates are provided
      if (location && location.latitude === 17.41) {
        return {
          healthCenter: { _id: 'hc-habsiguda-local', healthCenterId: 'HC-005' },
          facility: { healthCenterId: 'HC-005', distanceKm: 1.2 }
        };
      }
      return { healthCenter: null, facility: null };
    });

    const result = await createCase({
      phone: '+919876543210',
      source: 'WHATSAPP',
      complaint: 'Fever',
      location: { village: 'Habsiguda' }
    });

    expect(mockGeocodeLocation).toHaveBeenCalledWith('Habsiguda');
    expect(mockFindSuitableHealthCenter).toHaveBeenCalledWith({
      location: { latitude: 17.41, longitude: 78.54 },
      village: 'Habsiguda'
    });
    expect(result.selectedFacility.healthCenterId).toBe('HC-005');
  });

  test('2. SMS case with textual location goes through geocoding', async () => {
    mockGeocodeLocation.mockResolvedValue({ latitude: 17.38, longitude: 78.48 });

    await createCase({
      phone: '+919876543210',
      source: 'SMS',
      complaint: 'Headache',
      location: { village: 'Charminar' }
    });

    expect(mockGeocodeLocation).toHaveBeenCalledWith('Charminar');
    expect(mockFindSuitableHealthCenter).toHaveBeenCalledWith({
      location: { latitude: 17.38, longitude: 78.48 },
      village: 'Charminar'
    });
  });

  test('3. IVR case with textual location goes through geocoding', async () => {
    mockGeocodeLocation.mockResolvedValue({ latitude: 17.44, longitude: 78.38 });

    await createCase({
      phone: '+919876543210',
      source: 'PHONE_IVR',
      complaint: 'Cough',
      location: { village: 'Madhapur' }
    });

    expect(mockGeocodeLocation).toHaveBeenCalledWith('Madhapur');
  });

  test('4. DASHBOARD case continues to work with geocoding', async () => {
    mockGeocodeLocation.mockResolvedValue({ latitude: 17.44, longitude: 78.38 });

    await createCase({
      phone: '+919876543210',
      source: 'DASHBOARD',
      complaint: 'Checkup',
      location: { village: 'Madhapur' }
    });

    expect(mockGeocodeLocation).toHaveBeenCalledWith('Madhapur');
  });

  test('5. Existing coordinates bypass unnecessary geocoding', async () => {
    await createCase({
      phone: '+919876543210',
      source: 'WHATSAPP',
      complaint: 'Pain',
      location: { village: 'SomeVillage', latitude: 17.1, longitude: 78.1 }
    });

    expect(mockGeocodeLocation).not.toHaveBeenCalled();
    expect(mockFindSuitableHealthCenter).toHaveBeenCalledWith({
      location: { latitude: 17.1, longitude: 78.1 },
      village: 'SomeVillage'
    });
  });

  test('6. Failed/unresolvable geocoding preserves safe fallback behavior', async () => {
    mockGeocodeLocation.mockResolvedValue(null);

    const result = await createCase({
      phone: '+919876543210',
      source: 'WHATSAPP',
      complaint: 'Dizziness',
      location: { village: 'Nowhereville' }
    });

    expect(mockGeocodeLocation).toHaveBeenCalledWith('Nowhereville');
    expect(mockFindSuitableHealthCenter).toHaveBeenCalledWith({
      location: undefined,
      village: 'Nowhereville'
    });
    // Falls back to highest capacity mock logic
    expect(result.selectedFacility.healthCenterId).toBe('HC-010');
  });

  test('7. Different textual locations resolve to different coordinates and centres, not collapsing to HC-010 solely due to capacity', async () => {
    mockGeocodeLocation.mockResolvedValue({ latitude: 17.35, longitude: 78.50 });
    mockFindSuitableHealthCenter.mockImplementation(async ({ location }) => {
      if (location && location.latitude === 17.35) {
        return {
          healthCenter: { _id: 'hc-lbnagar', healthCenterId: 'HC-008' },
          facility: { healthCenterId: 'HC-008', distanceKm: 0.5 }
        };
      }
      return { healthCenter: null, facility: null };
    });

    const result = await createCase({
      phone: '+919876543210',
      source: 'SMS',
      complaint: 'Breathing issues',
      location: { village: 'LB Nagar' }
    });

    expect(mockGeocodeLocation).toHaveBeenCalledWith('LB Nagar');
    expect(result.selectedFacility.healthCenterId).toBe('HC-008'); // Not HC-010
  });
});
