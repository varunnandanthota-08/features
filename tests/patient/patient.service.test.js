const mockPatients = new Map();

jest.mock('../../src/models/Patient', () => ({
  findOne: jest.fn(async ({ phone }) => mockPatients.get(phone) || null),
  findOneAndUpdate: jest.fn(async ({ phone }, updateOperation) => {
    const update = updateOperation.$set || updateOperation.$setOnInsert || {};
    const patient = { ...(mockPatients.get(phone) || {}), ...update };
    mockPatients.set(phone, patient);
    return patient;
  })
}));

const Patient = require('../../src/models/Patient');
const {
  createOrUpdatePatient,
  findByPhone,
  normalizePhone
  , ensureEmergencyPatient
} = require('../../src/services/patient.service');

const validPatient = {
  phone: '+919876543210',
  name: 'Ravi Kumar',
  age: 52,
  gender: 'male',
  village: 'Village A',
  language: 'en',
  symptomsDescription: 'I have fever'
};

describe('patient service', () => {
  beforeEach(() => {
    mockPatients.clear();
    jest.clearAllMocks();
  });

  test('creates exactly one patient with WhatsApp source', async () => {
    await createOrUpdatePatient(validPatient);

    expect(mockPatients.size).toBe(1);
    expect(await findByPhone(validPatient.phone)).toMatchObject({
      phone: '+919876543210',
      source: 'WHATSAPP'
    });
  });

  test('creates an IVR patient with IVR source', async () => {
    await createOrUpdatePatient({ ...validPatient, source: 'IVR' });

    expect(await findByPhone(validPatient.phone)).toMatchObject({
      phone: '+919876543210',
      source: 'IVR'
    });
  });

  test('creates an SMS patient with SMS source', async () => {
    await createOrUpdatePatient({ ...validPatient, source: 'SMS' });

    expect(await findByPhone(validPatient.phone)).toMatchObject({
      phone: '+919876543210',
      source: 'SMS'
    });
  });

  test('creates a Dashboard patient with DASHBOARD source', async () => {
    await createOrUpdatePatient({ ...validPatient, source: 'DASHBOARD' });

    expect(await findByPhone(validPatient.phone)).toMatchObject({
      phone: '+919876543210',
      source: 'DASHBOARD'
    });
  });

  test('ensures one minimal SMS emergency patient without profile data', async () => {
    await ensureEmergencyPatient('sms:+919876543210', 'SMS');
    await ensureEmergencyPatient('+919876543210', 'SMS');

    expect(mockPatients.size).toBe(1);
    expect(await findByPhone('+919876543210')).toMatchObject({
      phone: '+919876543210',
      source: 'SMS'
    });
  });

  test('updates an existing phone without creating a duplicate', async () => {
    await createOrUpdatePatient({ ...validPatient, age: 50 });
    await createOrUpdatePatient({ ...validPatient, age: 52 });

    expect(mockPatients.size).toBe(1);
    expect((await findByPhone(validPatient.phone)).age).toBe(52);
  });

  test('normalizes provider phone representations to one patient', async () => {
    await createOrUpdatePatient(validPatient);
    await createOrUpdatePatient({ ...validPatient, phone: 'whatsapp:+919876543210' });
    await createOrUpdatePatient({ ...validPatient, phone: 'sms:+919876543210' });

    expect(normalizePhone('whatsapp:+919876543210')).toBe('+919876543210');
    expect(normalizePhone('sms:+919876543210')).toBe('+919876543210');
    expect(mockPatients.size).toBe(1);
  });

  test('rejects invalid patient data before persistence', async () => {
    await expect(createOrUpdatePatient({ ...validPatient, age: 0 })).rejects.toThrow();
    expect(Patient.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('rejects whitespace-only required text before persistence', async () => {
    await expect(createOrUpdatePatient({ ...validPatient, name: '   ' })).rejects.toThrow();
    expect(Patient.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('rejects unsupported patient sources before persistence', async () => {
    await expect(createOrUpdatePatient({ ...validPatient, source: 'PORTAL' }))
      .rejects.toThrow('Patient source is invalid');
    expect(Patient.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
