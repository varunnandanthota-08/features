import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/api';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

export default function HealthCenterProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [centre, setCentre] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!id || id === 'undefined') {
      setError('Invalid Health Centre ID');
      setLoading(false);
      return;
    }
    
    apiRequest(`/api/health-centers/${encodeURIComponent(id)}`)
      .then(res => {
        if (!res.data) throw new Error('Health centre not found');
        setCentre(res.data);
      })
      .catch(err => setError(err.message || 'Failed to load health centre profile'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!centre || !mapContainerRef.current) return;

    const lat = centre.location?.latitude || 17.3850;
    const lng = centre.location?.longitude || 78.4867;

    // Clean up previous map instance if any
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    if (mapContainerRef.current._leaflet_id) {
      mapContainerRef.current._leaflet_id = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: [lat, lng],
      zoom: 14,
      zoomControl: true,
      scrollWheelZoom: false
    });
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19
    }).addTo(map);

    const careIcon = L.divIcon({
      className: 'careos-marker',
      html: `<div style="width: 22px; height: 22px; background: #087f78; border: 3px solid white; border-radius: 50%; box-shadow: 0 4px 12px rgba(0,0,0,0.3);"></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });

    const marker = L.marker([lat, lng], { icon: careIcon }).addTo(map);
    marker.bindPopup(`<strong>${centre.name}</strong><br/>${centre.address || ''}`).openPopup();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [centre]);

  if (loading) return <div className="details-page"><p className="data-state">Loading health centre profile...</p></div>;
  if (error) return <div className="details-page"><p className="data-state data-state-error">{error}</p></div>;
  if (!centre) return <div className="details-page"><p className="data-state">Health centre not found.</p></div>;

  const doctorEntries = centre.doctors ? Object.entries(centre.doctors).filter(([_, count]) => count > 0) : [];

  return (
    <div className="details-page" style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '4rem' }}>
      <button 
        onClick={() => {
          if (window.history.length > 2) {
            navigate(-1);
          } else {
            navigate('/worker');
          }
        }} 
        style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: 0 }}
      >
        ← Back to Network
      </button>
      
      <div className="cc-section" style={{ padding: 0, overflow: 'hidden', borderRadius: '16px', border: '1px solid var(--line)', background: '#fff', boxShadow: 'var(--shadow-soft)' }}>
        {/* HERO: Earth video & Identity */}
        <div className="video-hero-container" style={{ height: '340px', background: '#07161b', position: 'relative', overflow: 'hidden' }}>
          <video 
            src="/careos-earth.mp4" 
            autoPlay 
            loop 
            muted 
            playsInline 
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} 
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(7,22,27,0.85) 0%, transparent 60%)' }}></div>
          <div style={{ position: 'absolute', bottom: '1.5rem', left: '2rem', right: '2rem', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <span style={{ background: 'var(--teal)', color: '#fff', fontSize: '0.75rem', fontWeight: 800, padding: '0.25rem 0.6rem', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {centre.healthCenterId}
              </span>
              <h1 style={{ margin: '0.5rem 0 0.25rem', fontSize: '2.4rem', color: '#fff' }}>{centre.name}</h1>
              <p style={{ margin: 0, color: '#aab7be', fontSize: '1rem' }}>
                {centre.village || centre.location?.village || 'Community'}, {centre.district || centre.location?.district || ''} {centre.state || ''}
              </p>
            </div>
            {centre.emergencyAvailable && (
              <span style={{ background: 'var(--red)', color: '#fff', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 800, fontSize: '0.85rem' }}>
                🚨 EMERGENCY READY
              </span>
            )}
          </div>
        </div>
        
        <div style={{ padding: '2.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2.5rem' }}>
            
            {/* Left Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <section>
                <h3 style={{ margin: '0 0 0.8rem', color: 'var(--ink)', fontSize: '1.2rem', borderBottom: '2px solid var(--teal-soft)', paddingBottom: '0.4rem', display: 'inline-block' }}>About This Health Centre</h3>
                <p style={{ margin: 0, color: 'var(--ink)', lineHeight: 1.6, fontSize: '0.95rem' }}>
                  {centre.description || `${centre.name} is an active public health node in the CareOS connected care network, providing primary and emergency triage support to ${centre.village || centre.location?.village || 'rural residents'}.`}
                </p>
              </section>

              <section>
                <h3 style={{ margin: '0 0 0.8rem', color: 'var(--ink)', fontSize: '1.2rem', borderBottom: '2px solid var(--teal-soft)', paddingBottom: '0.4rem', display: 'inline-block' }}>Capacity & Triage</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <li style={{ display: 'flex', justifyContent: 'space-between', padding: '0.8rem 1rem', background: 'var(--paper)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    <span style={{ color: 'var(--muted)', fontWeight: 700 }}>Total Beds / Capacity</span>
                    <strong style={{ color: 'var(--ink)' }}>{centre.capacity || 0}</strong>
                  </li>
                  <li style={{ display: 'flex', justifyContent: 'space-between', padding: '0.8rem 1rem', background: 'var(--paper)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    <span style={{ color: 'var(--muted)', fontWeight: 700 }}>Current Patient Load</span>
                    <strong style={{ color: 'var(--ink)' }}>{centre.currentPatientLoad || 0}</strong>
                  </li>
                  <li style={{ display: 'flex', justifyContent: 'space-between', padding: '0.8rem 1rem', background: 'var(--paper)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    <span style={{ color: 'var(--muted)', fontWeight: 700 }}>Emergency Triage</span>
                    <strong style={{ color: centre.emergencyAvailable ? 'var(--teal)' : 'var(--red)' }}>
                      {centre.emergencyAvailable ? 'Available (24/7)' : 'Not Equipped'}
                    </strong>
                  </li>
                </ul>
              </section>

              <section>
                <h3 style={{ margin: '0 0 0.8rem', color: 'var(--ink)', fontSize: '1.2rem', borderBottom: '2px solid var(--teal-soft)', paddingBottom: '0.4rem', display: 'inline-block' }}>Medical Staff</h3>
                {doctorEntries.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.8rem' }}>
                    {doctorEntries.map(([dept, count]) => (
                      <div key={dept} style={{ padding: '0.8rem', background: 'var(--paper)', borderRadius: '8px', border: '1px solid var(--line)', textAlign: 'center' }}>
                        <span style={{ display: 'block', fontSize: '1.2rem', fontWeight: 800, color: 'var(--teal)' }}>{count}</span>
                        <span style={{ fontSize: '0.75rem', textTransform: 'capitalize', color: 'var(--muted)', fontWeight: 700 }}>{dept}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0, fontStyle: 'italic', background: 'var(--paper)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    Medical staff information is not available yet.
                  </p>
                )}
              </section>
            </div>
            
            {/* Right Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <section>
                <h3 style={{ margin: '0 0 0.8rem', color: 'var(--ink)', fontSize: '1.2rem', borderBottom: '2px solid var(--teal-soft)', paddingBottom: '0.4rem', display: 'inline-block' }}>Services</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {centre.services && centre.services.length > 0 ? centre.services.map(service => (
                    <span key={service} style={{ background: 'var(--teal-soft)', color: 'var(--teal-dark)', padding: '0.5rem 0.9rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700 }}>
                      {service.replace(/_/g, ' ')}
                    </span>
                  )) : <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No specific services listed.</span>}
                </div>
              </section>

              <section>
                <h3 style={{ margin: '0 0 0.8rem', color: 'var(--ink)', fontSize: '1.2rem', borderBottom: '2px solid var(--teal-soft)', paddingBottom: '0.4rem', display: 'inline-block' }}>Equipment & Capabilities</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {centre.equipment && Object.keys(centre.equipment).filter(k => centre.equipment[k]).length > 0 ? 
                    Object.keys(centre.equipment).filter(k => centre.equipment[k]).map(eq => (
                    <span key={eq} style={{ background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)', padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 800 }}>
                      ✓ {eq.toUpperCase()}
                    </span>
                  )) : <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Equipment capabilities not specified.</span>}
                </div>
              </section>

              <section>
                <h3 style={{ margin: '0 0 0.8rem', color: 'var(--ink)', fontSize: '1.2rem', borderBottom: '2px solid var(--teal-soft)', paddingBottom: '0.4rem', display: 'inline-block' }}>Location & Map</h3>
                <p style={{ margin: '0 0 0.8rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
                  📍 {centre.address || `${centre.village || ''}, ${centre.district || ''}`}
                </p>
                <div 
                  ref={mapContainerRef} 
                  style={{ height: '220px', width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--line)' }}
                />
              </section>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}
