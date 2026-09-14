import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { useAuth } from '../components/AuthContext';

export default function PatientCaseRegistrationPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Who is this for?
  const [recipient, setRecipient] = useState('myself'); // 'myself' or 'family'

  const [formData, setFormData] = useState({
    // Family member info (if applicable)
    patientName: '',
    age: '',
    gender: 'male',
    phone: '',
    village: '',
    relationship: 'Parent',

    // Complaint
    complaint: '',
    symptoms: '',
    duration: 'today',
    priority: 'STANDARD',
    
    // Clinical context
    existingConditions: '',
    currentMedications: '',
    allergies: '',
    relevantHistory: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    async function loadProfile() {
      try {
        const res = await apiRequest('/api/patients/me');
        if (res?.data?.patient?.location?.village) {
          setFormData(prev => ({ ...prev, village: res.data.patient.location.village }));
        }
      } catch (_) {}
    }
    loadProfile();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!formData.complaint) throw new Error('Primary complaint is required');

      const isForFamily = recipient === 'family';
      const effectiveVillage = formData.village?.trim() || '';
      
      const payload = {
        source: 'DASHBOARD',
        complaint: formData.complaint.trim(),
        priority: formData.priority,
        location: effectiveVillage ? { village: effectiveVillage } : undefined,
        patientId: !isForFamily && user?.patientId ? user.patientId : undefined,
        phone: isForFamily ? (formData.phone || user?.phone) : (user?.phone || formData.phone),
        patientData: isForFamily ? {
          name: formData.patientName.trim(),
          age: Number(formData.age),
          gender: formData.gender,
          village: effectiveVillage,
          phone: formData.phone || user?.phone
        } : {
          name: user?.name || user?.username,
          phone: user?.phone,
          village: effectiveVillage
        }
      };

      await apiRequest('/api/cases', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      alert('Your health complaint has been successfully registered. Your local care team has been notified.');
      navigate('/patient');
    } catch (err) {
      setError(err.message || 'Failed to register care request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="patient-case-registration-page" style={{ maxWidth: '900px', margin: '0 auto', paddingBottom: '4rem' }}>
      <header className="page-topline" style={{ marginBottom: '2rem' }}>
        <button 
          onClick={() => navigate('/patient')} 
          style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: 0 }}
        >
          ← Back to Patient Portal
        </button>
        <div>
          <h1 style={{ fontSize: '2.2rem', margin: '0 0 0.5rem', color: 'var(--ink)' }}>Start a Care Request</h1>
          <p className="intro" style={{ margin: 0, color: 'var(--muted)' }}>
            Register a health complaint for yourself or a family member to connect with the nearest community health centre.
          </p>
        </div>
      </header>

      <div className="cc-section" style={{ background: '#fff', padding: '2.5rem', borderRadius: '16px', border: '1px solid var(--line)', boxShadow: 'var(--shadow-soft)' }}>
        {error && (
          <div style={{ color: 'var(--red)', background: 'var(--red-soft)', padding: '1rem', borderRadius: '10px', marginBottom: '2rem', fontSize: '0.9rem', fontWeight: 700 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          
          {/* SECTION 17: Choice - Who is this for? */}
          <div style={{ padding: '1.5rem', background: 'var(--paper)', borderRadius: '12px', border: '1px solid var(--line)' }}>
            <label style={{ display: 'block', fontWeight: 800, fontSize: '1.05rem', color: 'var(--ink)', marginBottom: '0.8rem' }}>
              Who is this care request for? *
            </label>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button 
                type="button" 
                onClick={() => setRecipient('myself')}
                style={{ 
                  flex: '1 1 200px', 
                  padding: '1rem', 
                  borderRadius: '10px', 
                  border: recipient === 'myself' ? '2px solid var(--teal)' : '1px solid var(--line)', 
                  background: recipient === 'myself' ? '#fff' : 'transparent', 
                  color: recipient === 'myself' ? 'var(--teal-dark)' : 'var(--ink)', 
                  fontWeight: 800, 
                  cursor: 'pointer',
                  boxShadow: recipient === 'myself' ? 'var(--shadow-soft)' : 'none'
                }}
              >
                🙋 Myself ({user?.name || user?.username || 'Account Holder'})
              </button>

              <button 
                type="button" 
                onClick={() => setRecipient('family')}
                style={{ 
                  flex: '1 1 200px', 
                  padding: '1rem', 
                  borderRadius: '10px', 
                  border: recipient === 'family' ? '2px solid var(--teal)' : '1px solid var(--line)', 
                  background: recipient === 'family' ? '#fff' : 'transparent', 
                  color: recipient === 'family' ? 'var(--teal-dark)' : 'var(--ink)', 
                  fontWeight: 800, 
                  cursor: 'pointer',
                  boxShadow: recipient === 'family' ? 'var(--shadow-soft)' : 'none'
                }}
              >
                👨‍👩‍👧 Family Member
              </button>
            </div>
          </div>

          {/* Myself Location Information */}
          {recipient === 'myself' && (
            <div style={{ padding: '1.5rem', background: '#fcfdfd', borderRadius: '12px', border: '1px solid var(--teal-soft)' }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.9rem' }}>Your Village / Location *</label>
              <input 
                type="text" 
                name="village" 
                value={formData.village} 
                onChange={handleChange} 
                placeholder="e.g. Bachupally, Kukatpally, Manikonda" 
                required
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff' }}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.35rem', display: 'block' }}>
                Used by CareOS to locate your community health centre and coordinate nearby referrals.
              </span>
            </div>
          )}

          {/* Family Member Information (only if Family is selected) */}
          {recipient === 'family' && (
            <div style={{ padding: '1.5rem', background: '#fcfdfd', borderRadius: '12px', border: '1px solid var(--teal-soft)' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', color: 'var(--ink)' }}>Family Member Information</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.85rem' }}>Patient's Full Name *</label>
                  <input 
                    type="text" 
                    name="patientName" 
                    value={formData.patientName} 
                    onChange={handleChange} 
                    placeholder="e.g. Kamala Devi" 
                    required={recipient === 'family'}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.85rem' }}>Relationship *</label>
                  <select 
                    name="relationship" 
                    value={formData.relationship} 
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff' }}
                  >
                    <option value="Child">Child / Dependent</option>
                    <option value="Parent">Parent</option>
                    <option value="Spouse">Spouse</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Other">Other Relative</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.85rem' }}>Age *</label>
                  <input 
                    type="number" 
                    name="age" 
                    value={formData.age} 
                    onChange={handleChange} 
                    min="1" max="120"
                    placeholder="Age in years"
                    required={recipient === 'family'}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.85rem' }}>Gender *</label>
                  <select 
                    name="gender" 
                    value={formData.gender} 
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff' }}
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.85rem' }}>Village / Location *</label>
                  <input 
                    type="text" 
                    name="village" 
                    value={formData.village} 
                    onChange={handleChange} 
                    placeholder="Village or settlement"
                    required={recipient === 'family'}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.85rem' }}>Contact Phone</label>
                  <input 
                    type="tel" 
                    name="phone" 
                    value={formData.phone} 
                    onChange={handleChange} 
                    placeholder={user?.phone || 'Optional phone'}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* COMPLAINT DETAILS */}
          <div>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.2rem', color: 'var(--ink)' }}>Complaint & Symptoms</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.9rem' }}>Primary Health Complaint *</label>
                <input 
                  type="text" 
                  name="complaint" 
                  value={formData.complaint} 
                  onChange={handleChange}
                  placeholder="e.g. High fever with severe headache and body pain"
                  required
                  style={{ width: '100%', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '0.95rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.9rem' }}>Symptoms (Comma separated)</label>
                <input 
                  type="text" 
                  name="symptoms" 
                  value={formData.symptoms} 
                  onChange={handleChange}
                  placeholder="e.g. Fever, Shivering, Nausea, Loss of appetite"
                  style={{ width: '100%', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--line)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.9rem' }}>Duration of Symptoms *</label>
                  <select 
                    name="duration" 
                    value={formData.duration} 
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff' }}
                  >
                    <option value="today">Started today</option>
                    <option value="few_days">1 to 3 days</option>
                    <option value="week">About a week</option>
                    <option value="chronic">More than 2 weeks</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.9rem' }}>Severity Level *</label>
                  <select 
                    name="priority" 
                    value={formData.priority} 
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff' }}
                  >
                    <option value="STANDARD">Standard — Can consult within regular clinic hours</option>
                    <option value="HIGH">High — Severe discomfort, needs priority attention</option>
                    <option value="CRITICAL">Critical — Emergency immediate response required</option>
                  </select>
                </div>
              </div>

              {formData.priority === 'CRITICAL' && (
                <div style={{ padding: '1rem', background: 'var(--red-soft)', color: 'var(--red)', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem' }}>
                  🚨 Warning: If the patient is experiencing chest pain, difficulty breathing, or severe trauma, please head directly to the nearest hospital or emergency center immediately.
                </div>
              )}
            </div>
          </div>

          {/* CLINICAL CONTEXT */}
          <div>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.2rem', color: 'var(--ink)' }}>Clinical Context (Optional)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.85rem' }}>Existing Conditions</label>
                <input 
                  type="text" 
                  name="existingConditions" 
                  value={formData.existingConditions} 
                  onChange={handleChange}
                  placeholder="e.g. Diabetes, Hypertension"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.85rem' }}>Current Medications</label>
                <input 
                  type="text" 
                  name="currentMedications" 
                  value={formData.currentMedications} 
                  onChange={handleChange}
                  placeholder="e.g. Metformin 500mg"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.85rem' }}>Known Allergies</label>
                <input 
                  type="text" 
                  name="allergies" 
                  value={formData.allergies} 
                  onChange={handleChange}
                  placeholder="e.g. Penicillin, Sulfa"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.85rem' }}>Additional History</label>
                <input 
                  type="text" 
                  name="relevantHistory" 
                  value={formData.relevantHistory} 
                  onChange={handleChange}
                  placeholder="Any prior surgeries or hospitalizations"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)' }}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '1rem', paddingTop: '1.5rem', borderTop: '1px solid var(--line)' }}>
            <button 
              type="button" 
              onClick={() => navigate('/patient')}
              style={{ flex: 1, padding: '1rem', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading}
              style={{ flex: 2, padding: '1rem', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: loading ? 'wait' : 'pointer', fontSize: '1rem' }}
            >
              {loading ? 'Submitting Care Request...' : 'Submit Health Complaint'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
