import React from 'react';

export default function PatientFeaturePage({ title, description }) {
  return (
    <div className="details-page" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '4rem' }}>
      <header className="page-topline" style={{ marginBottom: '2rem' }}>
        <div>
          <h1>{title}</h1>
          <p className="intro">Patient Portal</p>
        </div>
      </header>
      <div className="cc-section" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem', color: 'var(--teal)' }}>
          {title === 'My Cases' ? '📋' :
           title === 'My Referrals' ? '➡️' :
           title === 'Medical Records' ? '📁' :
           title === 'Prescriptions' ? '💊' :
           title === 'Lab Reports' ? '🧪' : '✨'}
        </div>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>No {title.toLowerCase()} to display</h2>
        <p style={{ color: 'var(--muted)', maxWidth: '400px', margin: '0 auto' }}>
          {description || `Your ${title.toLowerCase()} will appear here once they are available from your healthcare provider.`}
        </p>
      </div>
    </div>
  );
}
