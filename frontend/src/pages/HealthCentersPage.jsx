import React, { useState, useEffect, useMemo } from 'react';
import { apiRequest } from '../services/api';
import { Link } from 'react-router-dom';

export default function HealthCentersPage() {
  const [centers, setCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filter controls
  const [searchTerm, setSearchTerm] = useState('');
  const [filterService, setFilterService] = useState('');
  const [filterEmergency, setFilterEmergency] = useState(false);
  const [filterCapacity, setFilterCapacity] = useState('');
  const [filterEquipment, setFilterEquipment] = useState('');
  const [sortBy, setSortBy] = useState('name'); // name, capacity_high, capacity_low
  const [visibleCount, setVisibleCount] = useState(9);

  useEffect(() => {
    apiRequest('/api/health-centers')
      .then(res => setCenters(res.data || []))
      .catch(err => setError(err.message || 'Failed to load health centres directory'))
      .finally(() => setLoading(false));
  }, []);

  // Unique services and equipment for filter dropdowns
  const allServices = useMemo(() => {
    return [...new Set(centers.flatMap(c => c.services || []))].sort();
  }, [centers]);

  const allEquipment = useMemo(() => {
    const eqSet = new Set();
    centers.forEach(c => {
      if (c.equipment) {
        Object.keys(c.equipment).forEach(k => {
          if (c.equipment[k]) eqSet.add(k);
        });
      }
    });
    return Array.from(eqSet).sort();
  }, [centers]);

  const clearFilters = () => {
    setSearchTerm('');
    setFilterService('');
    setFilterEmergency(false);
    setFilterCapacity('');
    setFilterEquipment('');
    setSortBy('name');
  };

  const hasActiveFilters = searchTerm || filterService || filterEmergency || filterCapacity || filterEquipment || sortBy !== 'name';

  const filteredCenters = useMemo(() => {
    return centers.filter(hc => {
      if (filterEmergency && !hc.emergencyAvailable) return false;
      if (filterService && !hc.services?.includes(filterService)) return false;
      if (filterEquipment && !hc.equipment?.[filterEquipment]) return false;
      
      if (filterCapacity) {
        const cap = hc.capacity || 0;
        if (filterCapacity === 'small' && cap >= 40) return false;
        if (filterCapacity === 'medium' && (cap < 40 || cap > 60)) return false;
        if (filterCapacity === 'large' && cap <= 60) return false;
      }

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesName = hc.name?.toLowerCase().includes(term);
        const matchesId = hc.healthCenterId?.toLowerCase().includes(term);
        const matchesDistrict = (hc.district || hc.location?.district)?.toLowerCase().includes(term);
        const matchesVillage = (hc.village || hc.location?.village)?.toLowerCase().includes(term);
        if (!matchesName && !matchesId && !matchesDistrict && !matchesVillage) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'capacity_high') return (b.capacity || 0) - (a.capacity || 0);
      if (sortBy === 'capacity_low') return (a.capacity || 0) - (b.capacity || 0);
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [centers, searchTerm, filterService, filterEmergency, filterCapacity, filterEquipment, sortBy]);

  const visibleCenters = filteredCenters.slice(0, visibleCount);

  return (
    <div className="health-centers-page" style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '4rem' }}>
      <header className="page-topline" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', margin: '0 0 0.5rem', color: 'var(--ink)' }}>Health Centres Directory</h1>
          <p className="intro" style={{ margin: 0, color: 'var(--muted)' }}>
            Search, filter, and inspect verified health centres across the connected regional network.
          </p>
        </div>
      </header>

      {/* TOP HORIZONTAL FILTER BAR */}
      <div className="cc-section" style={{ background: '#fff', padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--line)', marginBottom: '2rem', boxShadow: 'var(--shadow-soft)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          
          {/* Search */}
          <input 
            type="text" 
            placeholder="Search by name / ID / location..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ flex: '2 1 240px', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '0.9rem' }}
          />

          {/* All Services */}
          <select 
            value={filterService} 
            onChange={e => setFilterService(e.target.value)}
            style={{ flex: '1 1 140px', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff', fontSize: '0.85rem' }}
          >
            <option value="">All Services</option>
            {allServices.map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>

          {/* Emergency Checkbox */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 0.9rem', background: 'var(--paper)', borderRadius: '8px', border: '1px solid var(--line)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, color: 'var(--ink)' }}>
            <input 
              type="checkbox" 
              checked={filterEmergency} 
              onChange={e => setFilterEmergency(e.target.checked)} 
            />
            <span>🚨 Emergency</span>
          </label>

          {/* Capacity */}
          <select 
            value={filterCapacity} 
            onChange={e => setFilterCapacity(e.target.value)}
            style={{ flex: '1 1 130px', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff', fontSize: '0.85rem' }}
          >
            <option value="">All Capacity</option>
            <option value="small">&lt; 40 Beds</option>
            <option value="medium">40 - 60 Beds</option>
            <option value="large">&gt; 60 Beds</option>
          </select>

          {/* Equipment */}
          <select 
            value={filterEquipment} 
            onChange={e => setFilterEquipment(e.target.value)}
            style={{ flex: '1 1 130px', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff', fontSize: '0.85rem' }}
          >
            <option value="">All Equipment</option>
            {allEquipment.map(eq => (
              <option key={eq} value={eq}>{eq.toUpperCase()}</option>
            ))}
          </select>

          {/* Sort */}
          <select 
            value={sortBy} 
            onChange={e => setSortBy(e.target.value)}
            style={{ flex: '1 1 140px', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff', fontSize: '0.85rem' }}
          >
            <option value="name">Sort: Name (A-Z)</option>
            <option value="capacity_high">Sort: Capacity (High-Low)</option>
            <option value="capacity_low">Sort: Capacity (Low-High)</option>
          </select>

          {/* Clear Filters */}
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

      {/* Main Grid & Cards */}
      {loading ? (
        <p className="data-state">Loading health centres directory...</p>
      ) : error ? (
        <p className="data-state data-state-error">{error}</p>
      ) : filteredCenters.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--paper)', borderRadius: '16px', border: '1px solid var(--line)' }}>
          <p className="data-state" style={{ margin: 0 }}>No health centres found matching your search and filter criteria.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
            {visibleCenters.map(hc => {
              const activeDoctorsCount = hc.doctors ? Object.values(hc.doctors).reduce((acc, v) => acc + (typeof v === 'number' ? v : 0), 0) : 0;
              return (
                <div 
                  key={hc.healthCenterId}
                  style={{ 
                    background: '#fff', 
                    border: '1px solid var(--line)', 
                    borderRadius: '16px', 
                    overflow: 'hidden', 
                    boxShadow: 'var(--shadow-soft)', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    height: '100%',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-3px)';
                    e.currentTarget.style.boxShadow = '0 12px 24px rgba(31,57,71,0.1)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = 'var(--shadow-soft)';
                  }}
                >
                  {/* Photo / Demo Banner */}
                  <div style={{ height: '140px', background: 'var(--teal-soft)', position: 'relative', overflow: 'hidden' }}>
                    <img 
                      src="https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&q=80&w=600" 
                      alt={hc.name} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                    <span style={{ position: 'absolute', bottom: '6px', left: '8px', fontSize: '0.65rem', color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                      * Demo visual
                    </span>
                    {hc.emergencyAvailable && (
                      <span style={{ position: 'absolute', top: '10px', right: '10px', background: 'var(--red)', color: '#fff', fontSize: '0.7rem', padding: '0.25rem 0.6rem', borderRadius: '12px', fontWeight: 800 }}>
                        EMERGENCY READY
                      </span>
                    )}
                  </div>

                  <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--ink)' }}>{hc.name}</h3>
                    </div>

                    <p style={{ margin: '0 0 1rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                      📍 {hc.village || hc.location?.village || 'Village'}, {hc.district || hc.location?.district || ''} • <strong style={{ color: 'var(--ink)' }}>{hc.healthCenterId}</strong>
                    </p>

                    {/* Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', padding: '0.8rem', background: 'var(--paper)', borderRadius: '10px', marginBottom: '1rem' }}>
                      <div>
                        <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 800 }}>Capacity</span>
                        <strong style={{ fontSize: '0.95rem', color: 'var(--ink)' }}>{hc.capacity || 0} Beds</strong>
                      </div>
                      <div>
                        <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 800 }}>Medical Staff</span>
                        <strong style={{ fontSize: '0.95rem', color: 'var(--ink)' }}>
                          {activeDoctorsCount > 0 ? `${activeDoctorsCount} Doctors` : 'Available on call'}
                        </strong>
                      </div>
                    </div>

                    {/* Equipment & Capabilities */}
                    <div style={{ marginBottom: '1rem' }}>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.4rem' }}>Equipment</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {hc.equipment && Object.keys(hc.equipment).filter(k => hc.equipment[k]).length > 0 ? (
                          Object.keys(hc.equipment).filter(k => hc.equipment[k]).map(eq => (
                            <span key={eq} style={{ background: '#fff', border: '1px solid var(--line)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--ink)' }}>
                              ✓ {eq.toUpperCase()}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Standard clinic equipment</span>
                        )}
                      </div>
                    </div>

                    {/* Services */}
                    <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--line)' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '1rem' }}>
                        {hc.services?.slice(0, 3).map((service, i) => (
                          <span key={i} style={{ background: 'var(--teal-soft)', color: 'var(--teal-dark)', padding: '0.2rem 0.5rem', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700 }}>
                            {service.replace(/_/g, ' ')}
                          </span>
                        ))}
                        {hc.services?.length > 3 && (
                          <span style={{ color: 'var(--muted)', fontSize: '0.7rem', alignSelf: 'center' }}>
                            +{hc.services.length - 3} more
                          </span>
                        )}
                      </div>

                      <Link 
                        to={`/health-centres/${hc.healthCenterId}`}
                        style={{ display: 'block', width: '100%', textAlign: 'center', padding: '0.7rem', background: 'var(--ink)', color: '#fff', borderRadius: '8px', fontWeight: 800, textDecoration: 'none', fontSize: '0.85rem' }}
                      >
                        View Centre Profile →
                      </Link>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination / Controlled Loading */}
          {visibleCount < filteredCenters.length && (
            <div style={{ textAlign: 'center', marginTop: '3rem' }}>
              <button 
                onClick={() => setVisibleCount(prev => prev + 9)}
                style={{ padding: '0.85rem 2.2rem', background: '#fff', border: '2px solid var(--line)', borderRadius: '24px', fontWeight: 800, color: 'var(--ink)', cursor: 'pointer', boxShadow: 'var(--shadow-soft)' }}
              >
                Load More Centres ({filteredCenters.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
