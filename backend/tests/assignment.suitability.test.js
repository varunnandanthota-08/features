const { findSuitableHealthCenter } = require('../src/services/emergency.service');
const HealthCenter = require('../src/models/HealthCenter');

jest.mock('../src/models/HealthCenter');

describe('Health Centre Assignment and Suitability Logic', () => {
  // 10 mock health centres mimicking real network centres
  const mockCenters = [
    {
      _id: 'mongo-hc-001',
      healthCenterId: 'HC-001',
      name: 'Rural Health Centre A',
      village: 'Village A',
      capacity: 50,
      currentPatientLoad: 32,
      location: { latitude: 17.421, longitude: 78.381 },
      emergencyAvailable: true,
      services: ['GENERAL', 'ENT'],
      equipment: { ecg: true },
      doctors: { general: 2, ent: 1 }
    },
    {
      _id: 'mongo-hc-002',
      healthCenterId: 'HC-002',
      name: 'Rural Health Centre B',
      village: 'Village B',
      capacity: 40,
      currentPatientLoad: 20,
      location: { latitude: 17.470, longitude: 78.410 },
      emergencyAvailable: true,
      services: ['GENERAL', 'CARDIOLOGY'],
      equipment: { ecg: true, xray: true },
      doctors: { general: 2, cardiology: 1 }
    },
    {
      _id: 'mongo-hc-003',
      healthCenterId: 'HC-003',
      name: 'Rural Health Centre C',
      village: 'Bachupally',
      capacity: 40,
      currentPatientLoad: 18,
      location: { latitude: 17.493, longitude: 78.357 },
      emergencyAvailable: true,
      services: ['GENERAL', 'PEDIATRICS'],
      equipment: { ultrasound: true },
      doctors: { general: 2, pediatrics: 1 }
    },
    {
      _id: 'mongo-hc-004',
      healthCenterId: 'HC-004',
      name: 'Community Health Centre D',
      village: 'Kukatpally',
      capacity: 60,
      currentPatientLoad: 25,
      location: { latitude: 17.484, longitude: 78.413 },
      emergencyAvailable: true,
      services: ['GENERAL', 'ENT', 'GYNECOLOGY'],
      equipment: { xray: true, ecg: true },
      doctors: { general: 3, ent: 1, gynecology: 1 }
    },
    {
      _id: 'mongo-hc-006',
      healthCenterId: 'HC-006',
      name: 'Rural Health Centre F',
      village: 'Gachibowli',
      capacity: 50,
      currentPatientLoad: 15,
      location: { latitude: 17.440, longitude: 78.348 },
      emergencyAvailable: true,
      services: ['GENERAL', 'CARDIOLOGY'],
      equipment: { ecg: true, xray: true, ultrasound: true },
      doctors: { general: 2, cardiology: 2 }
    },
    {
      _id: 'mongo-hc-010',
      healthCenterId: 'HC-010',
      name: 'Community Health Centre J',
      village: 'Manikonda',
      // High capacity (38 available), which previously dominated all assignments
      capacity: 50,
      currentPatientLoad: 12,
      location: { latitude: 17.406, longitude: 78.384 },
      emergencyAvailable: true,
      services: ['GENERAL', 'CARDIOLOGY', 'GYNECOLOGY'],
      equipment: { ecg: true, xray: true },
      doctors: { general: 3, cardiology: 1, gynecology: 1 }
    }
  ];

  beforeEach(() => {
    HealthCenter.find.mockReset();
    HealthCenter.find.mockResolvedValue(mockCenters);
  });

  describe('Location and Proximity Routing (Dynamic Assignment)', () => {
    test('Location 1: Patient at Bachupally coordinates assigns to HC-003, NOT HC-010', async () => {
      // Very close to HC-003 (17.493, 78.357)
      const bachupallyPatientLocation = { latitude: 17.495, longitude: 78.358 };
      const result = await findSuitableHealthCenter({ location: bachupallyPatientLocation });

      expect(result.healthCenter).not.toBeNull();
      expect(result.healthCenter.healthCenterId).toBe('HC-003');
      expect(result.facility.distanceKm).toBeLessThan(1);
      expect(result.isFallback).toBe(false);
    });

    test('Location 2: Patient at Kukatpally coordinates assigns to HC-004, NOT HC-010', async () => {
      // Very close to HC-004 (17.484, 78.413)
      const kukatpallyPatientLocation = { latitude: 17.482, longitude: 78.415 };
      const result = await findSuitableHealthCenter({ location: kukatpallyPatientLocation });

      expect(result.healthCenter).not.toBeNull();
      expect(result.healthCenter.healthCenterId).toBe('HC-004');
      expect(result.facility.distanceKm).toBeLessThan(1);
      expect(result.isFallback).toBe(false);
    });

    test('Location 3: Patient at Gachibowli coordinates assigns to HC-006, NOT HC-010', async () => {
      // Very close to HC-006 (17.440, 78.348)
      const gachibowliPatientLocation = { latitude: 17.442, longitude: 78.350 };
      const result = await findSuitableHealthCenter({ location: gachibowliPatientLocation });

      expect(result.healthCenter).not.toBeNull();
      expect(result.healthCenter.healthCenterId).toBe('HC-006');
      expect(result.facility.distanceKm).toBeLessThan(1);
      expect(result.isFallback).toBe(false);
    });

    test('Location 4: Patient at Manikonda coordinates correctly assigns to HC-010', async () => {
      // Very close to HC-010 (17.406, 78.384)
      const manikondaPatientLocation = { latitude: 17.407, longitude: 78.385 };
      const result = await findSuitableHealthCenter({ location: manikondaPatientLocation });

      expect(result.healthCenter).not.toBeNull();
      expect(result.healthCenter.healthCenterId).toBe('HC-010');
      expect(result.facility.distanceKm).toBeLessThan(1);
      expect(result.isFallback).toBe(false);
    });
  });

  describe('Village Matching and Fallback Routing', () => {
    test('Village match takes precedence when distance cannot be computed', async () => {
      const result = await findSuitableHealthCenter({ village: 'Bachupally' });
      expect(result.healthCenter.healthCenterId).toBe('HC-003');
      expect(result.isFallback).toBe(false);
    });

    test('Unresolvable village with no coordinates triggers explicit fallback assignment', async () => {
      const result = await findSuitableHealthCenter({ village: 'Unknown Remote Hamlet' });
      expect(result.healthCenter).not.toBeNull();
      expect(result.isFallback).toBe(true);
      expect(result.facility.isFallback).toBe(true);
    });

    test('Invalid location (out of bounds) falls back gracefully', async () => {
      const result = await findSuitableHealthCenter({ location: { latitude: 999, longitude: 999 } });
      expect(result.healthCenter).not.toBeNull();
      expect(result.isFallback).toBe(true);
    });
  });

  describe('Service, Equipment, and Capacity Filtering', () => {
    test('Filters by service requirement (Cardiology)', async () => {
      // Patient at Kukatpally (closest to HC-004), but HC-004 does NOT have CARDIOLOGY!
      // HC-002 and HC-006 have CARDIOLOGY. HC-002 is closer to Kukatpally than HC-006.
      const kukatpallyLocation = { latitude: 17.484, longitude: 78.413 };
      const result = await findSuitableHealthCenter({
        location: kukatpallyLocation,
        service: 'CARDIOLOGY'
      });

      expect(result.healthCenter).not.toBeNull();
      expect(result.healthCenter.healthCenterId).toBe('HC-002');
      expect(result.healthCenter.services).toContain('CARDIOLOGY');
    });

    test('Filters by equipment requirement (Ultrasound)', async () => {
      // Patient at Gachibowli location, needing ultrasound
      const gachibowliLocation = { latitude: 17.440, longitude: 78.348 };
      const result = await findSuitableHealthCenter({
        location: gachibowliLocation,
        equipment: 'ultrasound'
      });

      expect(result.healthCenter).not.toBeNull();
      expect(result.healthCenter.equipment.ultrasound).toBe(true);
      expect(result.healthCenter.healthCenterId).toBe('HC-006');
    });

    test('Returns null when no centre meets service requirements', async () => {
      const result = await findSuitableHealthCenter({
        service: 'NEUROSURGERY'
      });

      expect(result.healthCenter).toBeNull();
      expect(result.facility).toBeNull();
      expect(result.isFallback).toBe(false);
    });

    test('Excludes source health centre when escalating', async () => {
      const manikondaLocation = { latitude: 17.406, longitude: 78.384 };
      const result = await findSuitableHealthCenter({
        location: manikondaLocation,
        excludeHealthCenterId: 'HC-010'
      });

      expect(result.healthCenter).not.toBeNull();
      expect(result.healthCenter.healthCenterId).not.toBe('HC-010');
    });
  });
});
