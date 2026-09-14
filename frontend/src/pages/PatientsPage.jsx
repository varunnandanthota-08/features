import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/api';

export default function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [ageRangeFilter, setAgeRangeFilter] = useState('');
  const [languageFilter, setLanguageFilter] = useState('');
  const [sortBy, setSortBy] = useState('recent'); // 'recent', 'name_asc', 'name_desc'
  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => {
    apiRequest('/api/patients')
      .then(res => setPatients(res.data || []))
      .catch(err => setError(err.message || 'Failed to load patients'))
      .finally(() => setLoading(false));
  }, []);

  const clearFilters = () => {
    setSearchTerm('');
    setGenderFilter('');
    setAgeRangeFilter('');
    setLanguageFilter('');
    setSortBy('recent');
  };

  const hasActiveFilters = searchTerm || genderFilter || ageRangeFilter || languageFilter || sortBy !== 'recent';

  const filteredPatients = useMemo(() => {
    return patients.filter(patient => {
      if (genderFilter && patient.gender !== genderFilter) return false;
      if (languageFilter && patient.language !== languageFilter) return false;

      if (ageRangeFilter) {
        const age = patient.age;
        if (age === null || age === undefined) return false;
        if (ageRangeFilter === 'pediatric' && age > 14) return false;
        if (ageRangeFilter === 'youth' && (age <= 14 || age > 30)) return false;
        if (ageRangeFilter === 'adult' && (age <= 30 || age > 60)) return false;
        if (ageRangeFilter === 'geriatric' && age <= 60) return false;
      }
      
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const patientCode = patient.patientId || `PT-${(patient._id || '').slice(-6).toUpperCase()}`;
        return (
          patient.name?.toLowerCase().includes(term) ||
          patient.phone?.toLowerCase().includes(term) ||
          patientCode.toLowerCase().includes(term) ||
          (patient.location?.village || '')?.toLowerCase().includes(term)
        );
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'name_asc') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'name_desc') {
        return (b.name || '').localeCompare(a.name || '');
      }
      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [patients, genderFilter, languageFilter, ageRangeFilter, searchTerm, sortBy]);

  const visiblePatients = filteredPatients.slice(0, visibleCount);

  return (
    <div className="patients-page" style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '4rem' }}>
      
      {/* SECTION 9: Header with Register Patient button beside the title outside filter box */}
      <header className="page-topline" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', margin: '0 0 0.5rem', color: 'var(--ink)' }}>Patient Directory</h1>
          <p className="intro" style={{ margin: 0, color: 'var(--muted)' }}>
            Clinical registry of patients receiving care across the regional health network.
          </p>
        </div>
        <Link 
          to="/worker/patients/register" 
          style={{ padding: '0.85rem 1.8rem', background: 'var(--teal)', color: '#fff', borderRadius: '8px', fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: 'var(--shadow-soft)' }}
        >
          + Register Patient
        </Link>
      </header>

      {/* SECTION 8: Horizontal filter bar */}
      <div className="cc-section" style={{ background: '#fff', padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--line)', marginBottom: '2rem', boxShadow: 'var(--shadow-soft)' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          
          <input 
            type="text" 
            placeholder="Search by name / phone / Patient ID / village..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ flex: '2 1 260px', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '0.9rem' }}
          />

          <select 
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
            style={{ flex: '1 1 130px', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff', fontSize: '0.85rem' }}
          >
            <option value="">All Genders</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>

          <select 
            value={ageRangeFilter}
            onChange={(e) => setAgeRangeFilter(e.target.value)}
            style={{ flex: '1 1 130px', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff', fontSize: '0.85rem' }}
          >
            <option value="">All Ages</option>
            <option value="pediatric">0 - 14 yrs</option>
            <option value="youth">15 - 30 yrs</option>
            <option value="adult">31 - 60 yrs</option>
            <option value="geriatric">&gt; 60 yrs</option>
          </select>

          <select 
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            style={{ flex: '1 1 120px', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff', fontSize: '0.85rem' }}
          >
            <option value="">All Languages</option>
            <option value="te">Telugu</option>
            <option value="hi">Hindi</option>
            <option value="en">English</option>
          </select>

          <select 
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ flex: '1 1 140px', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff', fontSize: '0.85rem' }}
          >
            <option value="recent">Sort: Recently Updated</option>
            <option value="name_asc">Sort: Name (A-Z)</option>
            <option value="name_desc">Sort: Name (Z-A)</option>
          </select>

          {hasActiveFilters && (
            <button 
              onClick={clearFilters} 
              style={{ padding: '0.75rem 1rem', background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 800, cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Clear Filters
            </button>
          )}

        </div>
      </div>

      {loading ? (
        <p className="data-state">Loading patient directory...</p>
      ) : error ? (
        <p className="data-state data-state-error">{error}</p>
      ) : filteredPatients.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--paper)', borderRadius: '16px', border: '1px solid var(--line)' }}>
          <p className="data-state" style={{ margin: 0 }}>No patients found matching your search and filter criteria.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
            {visiblePatients.map(patient => {
              const patientIdDisplay = patient.patientId || `PT-${(patient._id || '').slice(-6).toUpperCase()}`;
              const isVerified = Boolean(patient.phone && patient.name);
              
              return (
                <div 
                  key={patient._id || patient.phone} 
                  style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-soft)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ width: '3.2rem', height: '3.2rem', borderRadius: '50%', background: 'var(--teal-soft)', color: 'var(--teal-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', fontWeight: 800 }}>
                        {patient.name ? patient.name.charAt(0).toUpperCase() : 'P'}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--ink)' }}>{patient.name || 'Unnamed Patient'}</h3>
                          <span style={{ fontSize: '0.7rem', color: isVerified ? 'var(--teal)' : 'var(--muted)', fontWeight: 800 }}>
                            {isVerified ? '✓' : ''}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 700 }}>
                          ID: <strong style={{ color: 'var(--ink)' }}>{patientIdDisplay}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1.25rem', padding: '0.8rem', background: 'var(--paper)', borderRadius: '10px' }}>
                    <div>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 800 }}>Phone</span>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>{patient.phone}</strong>
                    </div>
                    <div>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 800 }}>Location</span>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>{patient.location?.village || 'Not specified'}</strong>
                    </div>
                    <div>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 800 }}>Age / Gender</span>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--ink)', textTransform: 'capitalize' }}>
                        {patient.age ? `${patient.age}y` : '-'} / {patient.gender === 'prefer_not_to_say' ? '-' : patient.gender || '-'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 800 }}>Language</span>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--ink)', textTransform: 'uppercase' }}>{patient.language || 'EN'}</strong>
                    </div>
                  </div>

                  {/* Section 13: View Patient button navigates to actual profile, never alert() */}
                  <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                      onClick={() => navigate(`/worker/patients/${patient._id || patient.phone}`)}
                      style={{ padding: '0.65rem 1.4rem', background: 'var(--ink)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                      View Patient Record →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          
          {visibleCount < filteredPatients.length && (
            <div style={{ textAlign: 'center', marginTop: '3rem' }}>
              <button 
                onClick={() => setVisibleCount(prev => prev + 12)}
                style={{ padding: '0.85rem 2.2rem', background: '#fff', border: '2px solid var(--line)', borderRadius: '24px', fontWeight: 800, color: 'var(--ink)', cursor: 'pointer', boxShadow: 'var(--shadow-soft)' }}
              >
                Load More Patients ({filteredPatients.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
