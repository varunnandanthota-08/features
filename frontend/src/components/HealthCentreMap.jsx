import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

export default function HealthCentreMap({ healthCenters = [] }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [selectedCenter, setSelectedCenter] = useState(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Clean up existing instance if present
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    if (mapContainerRef.current._leaflet_id) {
      delete mapContainerRef.current._leaflet_id;
    }

    // Default center
    const defaultCenter = [17.3850, 78.4867]; // Central location
    
    // Initialize map
    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      scrollWheelZoom: false
    }).setView(defaultCenter, 6);
    mapInstanceRef.current = map;

    // Add clean CartoDB Voyager tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);
    
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Custom pulse marker icon
    const careIcon = L.divIcon({
      className: 'careos-marker',
      html: `<div style="width: 24px; height: 24px; background: var(--teal); border: 3px solid white; border-radius: 50%; box-shadow: var(--shadow); position: relative; overflow: visible; cursor: pointer;">
              <div style="position: absolute; inset: -10px; background: rgba(8, 127, 120, 0.25); border-radius: 50%; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
             </div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12]
    });

    const bounds = [];
    
    healthCenters.forEach(center => {
      const lat = center.location?.latitude || (17.0 + Math.random() * 2);
      const lng = center.location?.longitude || (78.0 + Math.random() * 2);
      
      bounds.push([lat, lng]);

      const marker = L.marker([lat, lng], { icon: careIcon }).addTo(map);
      
      // On click, display inline detail card without navigating away
      marker.on('click', () => {
        setSelectedCenter(center);
      });
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [healthCenters]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '450px' }}>
      <style>{`
        @keyframes ping {
          0% { transform: scale(1); opacity: 1; }
          75%, 100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes cardFadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="map-container" ref={mapContainerRef} style={{ width: '100%', height: '100%', minHeight: '450px', borderRadius: '16px' }}></div>

      {selectedCenter && (
        <div 
          className="hc-detail-card"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '320px',
            maxWidth: 'calc(100% - 32px)',
            background: '#ffffff',
            borderRadius: '16px',
            padding: '1.4rem',
            boxShadow: '0 16px 40px rgba(7, 22, 27, 0.28)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            zIndex: 1000,
            fontFamily: "'DM Sans', sans-serif",
            animation: 'cardFadeIn 0.2s ease-out'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#172b3a', fontFamily: "'Manrope', sans-serif", lineHeight: 1.25 }}>
              {selectedCenter.name}
            </h3>
            <button 
              onClick={() => setSelectedCenter(null)}
              style={{
                background: '#f0f5f7',
                border: 'none',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '0.9rem',
                color: '#6b7d8a',
                flexShrink: 0,
                marginLeft: '0.6rem',
                transition: 'background 0.2s'
              }}
              title="Close card"
              aria-label="Close details"
            >
              ✕
            </button>
          </div>

          <p style={{ margin: '0 0 0.8rem', fontSize: '0.85rem', color: '#6b7d8a' }}>
            {[selectedCenter.village || selectedCenter.location?.village, selectedCenter.district || selectedCenter.location?.district, selectedCenter.state].filter(Boolean).join(', ') || 'Rural Healthcare Network'}
          </p>

          <div style={{ display: 'inline-block', background: 'var(--teal-soft)', color: 'var(--teal-dark)', fontSize: '0.72rem', fontWeight: 800, padding: '3px 8px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1rem' }}>
            {selectedCenter.type || (selectedCenter.name.toLowerCase().includes('community') ? 'Community Health Centre' : 'Primary Health Centre')}
          </div>

          {/* Services */}
          {selectedCenter.services && selectedCenter.services.length > 0 && (
            <div style={{ marginBottom: '0.9rem' }}>
              <span style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7d8a', fontWeight: 800, marginBottom: '0.4rem' }}>
                Services
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {selectedCenter.services.map((srv, idx) => (
                  <span key={idx} style={{ background: '#f0f5f7', color: '#172b3a', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                    ✓ {srv}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Facilities / Equipment */}
          {(() => {
            let eqList = [];
            if (selectedCenter.equipment && typeof selectedCenter.equipment === 'object') {
              eqList = Object.entries(selectedCenter.equipment)
                .filter(([_, val]) => Boolean(val))
                .map(([key]) => key.toUpperCase());
            }
            if (eqList.length === 0) return null;
            return (
              <div style={{ marginBottom: '0.9rem' }}>
                <span style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7d8a', fontWeight: 800, marginBottom: '0.4rem' }}>
                  Facilities
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {eqList.map((eq, idx) => (
                    <span key={idx} style={{ background: '#eef8f7', color: 'var(--teal-dark)', padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, border: '1px solid rgba(8, 127, 120, 0.2)' }}>
                      {eq}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Capacity & Emergency */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', padding: '0.8rem', background: '#f8fafb', borderRadius: '10px', marginBottom: '0.8rem' }}>
            <div>
              <span style={{ display: 'block', fontSize: '0.7rem', color: '#6b7d8a', textTransform: 'uppercase', fontWeight: 800 }}>
                Capacity
              </span>
              <strong style={{ fontSize: '1rem', color: '#172b3a' }}>
                {selectedCenter.capacity !== undefined ? selectedCenter.capacity : (selectedCenter.totalBeds || 'Standard')}
              </strong>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '0.7rem', color: '#6b7d8a', textTransform: 'uppercase', fontWeight: 800 }}>
                Emergency
              </span>
              <strong style={{ fontSize: '0.95rem', color: selectedCenter.emergencyAvailable !== false ? '#087f78' : '#c24e4e' }}>
                {selectedCenter.emergencyAvailable !== false ? 'Available' : 'Unavailable'}
              </strong>
            </div>
          </div>

          {/* Doctors */}
          {(() => {
            let docCount = 0;
            if (selectedCenter.doctors && typeof selectedCenter.doctors === 'object') {
              docCount = Object.values(selectedCenter.doctors).reduce((acc, val) => acc + (Number(val) || 0), 0);
            }
            if (docCount > 0) {
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', paddingTop: '0.4rem', borderTop: '1px solid #eef2f4' }}>
                  <span style={{ color: '#6b7d8a', fontWeight: 700 }}>Medical Staff:</span>
                  <strong style={{ color: '#172b3a' }}>{docCount} doctors available</strong>
                </div>
              );
            }
            return null;
          })()}
        </div>
      )}
    </div>
  );
}
