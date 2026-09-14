import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../services/api';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Upload modal state
  const [selectedFile, setSelectedFile] = useState(null);
  const [documentType, setDocumentType] = useState('MEDICAL_REPORT');
  const [patientIdInput, setPatientIdInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [extractionResult, setExtractionResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [activeModalDoc, setActiveModalDoc] = useState(null);
  const fileInputRef = useRef(null);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/api/documents');
      setDocuments(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setExtractionResult(null);
      setUploadError('');
    }
    e.target.value = null; // reset input
  };

  const handleExtract = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('documentType', documentType);
      if (patientIdInput) formData.append('patientId', patientIdInput.trim());

      const res = await apiRequest('/api/documents/extract', {
        method: 'POST',
        body: formData
      });
      setExtractionResult(res);
      fetchDocuments();
    } catch (err) {
      setUploadError(err.message || 'Document extraction failed');
    } finally {
      setUploading(false);
    }
  };

  const handleVerify = async (docId) => {
    setVerifying(true);
    try {
      await apiRequest('/api/documents/verify', {
        method: 'POST',
        body: JSON.stringify({
          documentId: docId || extractionResult?.documentId,
          fields: extractionResult?.extractedData || {},
          verifiedBy: 'HEALTH_WORKER'
        })
      });
      alert('Document verified successfully!');
      setSelectedFile(null);
      setExtractionResult(null);
      fetchDocuments();
    } catch (err) {
      alert(err.message || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="documents-page" style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '4rem' }}>
      <header className="page-topline" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', margin: '0 0 0.5rem', color: 'var(--ink)' }}>Documents & Doc Intelligence</h1>
          <p className="intro" style={{ margin: 0, color: 'var(--muted)' }}>
            Manage digitized prescriptions, medical reports, and AI OCR extractions.
          </p>
        </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileChange} 
          accept="image/*,.pdf"
        />
        <button 
          onClick={handleUploadClick}
          style={{ padding: '0.8rem 1.6rem', background: 'var(--teal)', color: '#fff', borderRadius: '8px', fontWeight: 800, border: 'none', cursor: 'pointer', boxShadow: 'var(--shadow-soft)' }}
        >
          + Upload Document
        </button>
      </header>

      {/* Upload / Extraction Modal */}
      {selectedFile && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '600px', width: '100%', padding: '2rem', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Document Intelligence Intake</h2>
              <button onClick={() => { setSelectedFile(null); setExtractionResult(null); }} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ padding: '1rem', background: 'var(--paper)', borderRadius: '10px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '2rem' }}>📄</span>
              <div>
                <strong>{selectedFile.name}</strong>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>{(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type}</p>
              </div>
            </div>

            {uploadError && (
              <div style={{ background: 'var(--red-soft)', color: 'var(--red)', padding: '0.8rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                {uploadError}
              </div>
            )}

            {!extractionResult ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Document Classification *</label>
                  <select 
                    value={documentType} 
                    onChange={e => setDocumentType(e.target.value)}
                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)' }}
                  >
                    <option value="MEDICAL_REPORT">Medical Report</option>
                    <option value="PRESCRIPTION">Prescription</option>
                    <option value="LAB_REPORT">Lab Report</option>
                    <option value="PATIENT_REGISTRATION">Patient Document</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Patient ID / Mongo ID (Optional)</label>
                  <input 
                    type="text" 
                    value={patientIdInput} 
                    onChange={e => setPatientIdInput(e.target.value)}
                    placeholder="e.g. 6a90... (leave blank if unknown)" 
                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <button 
                    type="button" 
                    onClick={() => setSelectedFile(null)} 
                    style={{ flex: 1, padding: '0.8rem', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    onClick={handleExtract}
                    disabled={uploading}
                    style={{ flex: 2, padding: '0.8rem', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: uploading ? 'wait' : 'pointer' }}
                  >
                    {uploading ? 'Extracting via AI...' : 'Upload & Extract OCR'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ padding: '1rem', background: 'var(--teal-soft)', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--teal)' }}>
                  <strong style={{ color: 'var(--teal-dark)' }}>Extraction Complete (Status: {extractionResult.status})</strong>
                  <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: 'var(--teal-dark)' }}>
                    Confidence: {JSON.stringify(extractionResult.confidence) || 'High'}
                  </p>
                </div>

                <h3 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>Extracted Fields (Review & Verify)</h3>
                <pre style={{ background: 'var(--paper)', padding: '1rem', borderRadius: '8px', fontSize: '0.8rem', overflowX: 'auto', maxHeight: '200px' }}>
                  {JSON.stringify(extractionResult.extractedData, null, 2)}
                </pre>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                  <button 
                    onClick={() => { setSelectedFile(null); setExtractionResult(null); }}
                    style={{ flex: 1, padding: '0.8rem', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Close
                  </button>
                  <button 
                    onClick={() => handleVerify(extractionResult.documentId)}
                    disabled={verifying}
                    style={{ flex: 2, padding: '0.8rem', background: 'var(--ink)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: verifying ? 'wait' : 'pointer' }}
                  >
                    {verifying ? 'Verifying...' : 'Verify Document ✓'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Details View Modal */}
      {activeModalDoc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '550px', width: '100%', padding: '2rem', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Document Details</h2>
              <button onClick={() => setActiveModalDoc(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
            </div>
            <p><strong>Type:</strong> {activeModalDoc.documentType?.replace(/_/g, ' ')}</p>
            <p><strong>File:</strong> {activeModalDoc.originalFileName || 'Scan'}</p>
            <p><strong>Status:</strong> {activeModalDoc.extractionStatus}</p>
            <p><strong>Uploaded:</strong> {new Date(activeModalDoc.createdAt).toLocaleString()}</p>
            <h4>Extracted Data:</h4>
            <pre style={{ background: 'var(--paper)', padding: '1rem', borderRadius: '8px', fontSize: '0.8rem', overflowX: 'auto', maxHeight: '200px' }}>
              {JSON.stringify(activeModalDoc.extractedData || {}, null, 2)}
            </pre>
            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button onClick={() => setActiveModalDoc(null)} style={{ padding: '0.6rem 1.5rem', background: 'var(--ink)', color: '#fff', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Document Table / Empty State */}
      <div className="cc-section" style={{ background: '#fff', borderRadius: '16px', border: '1px solid var(--line)', padding: '1.5rem', boxShadow: 'var(--shadow-soft)' }}>
        {loading ? (
          <p className="data-state">Loading documents repository...</p>
        ) : error ? (
          <p className="data-state data-state-error">{error}</p>
        ) : documents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--paper)', borderRadius: '14px', border: '1px dashed var(--line)' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem', color: 'var(--muted)' }}>📄</div>
            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--ink)', fontSize: '1.4rem' }}>No Documents Found</h3>
            <p style={{ margin: '0 0 1.5rem', color: 'var(--muted)', maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
              There are currently no digitized patient records, prescriptions, or lab reports in the repository. Click below to digitize your first record.
            </p>
            <button 
              onClick={handleUploadClick} 
              style={{ padding: '0.8rem 1.8rem', background: 'var(--teal)', color: '#fff', borderRadius: '8px', fontWeight: 800, border: 'none', cursor: 'pointer' }}
            >
              Upload First Document
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--line)' }}>
                  <th style={{ padding: '0.8rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)' }}>Doc ID</th>
                  <th style={{ padding: '0.8rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)' }}>Type</th>
                  <th style={{ padding: '0.8rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)' }}>Patient</th>
                  <th style={{ padding: '0.8rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)' }}>Related File</th>
                  <th style={{ padding: '0.8rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)' }}>Date</th>
                  <th style={{ padding: '0.8rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)' }}>Extraction</th>
                  <th style={{ padding: '0.8rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)' }}>Status</th>
                  <th style={{ padding: '0.8rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {documents.map(doc => {
                  const docIdShort = `DOC-${doc._id.slice(-6).toUpperCase()}`;
                  const patientDisplay = doc.patientId?.name || (doc.patientId?.phone ? doc.patientId.phone : 'Unassigned');
                  return (
                    <tr key={doc._id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '1rem 0.8rem', fontWeight: 700, fontSize: '0.85rem' }}>{docIdShort}</td>
                      <td style={{ padding: '1rem 0.8rem', fontSize: '0.85rem' }}>
                        <span style={{ background: 'var(--paper)', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid var(--line)', fontWeight: 700 }}>
                          {doc.documentType?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 0.8rem', fontSize: '0.85rem', color: 'var(--ink)' }}>{patientDisplay}</td>
                      <td style={{ padding: '1rem 0.8rem', fontSize: '0.85rem', color: 'var(--muted)' }}>{doc.originalFileName || 'Scan'}</td>
                      <td style={{ padding: '1rem 0.8rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '1rem 0.8rem', fontSize: '0.8rem' }}>
                        <span style={{ 
                          background: doc.extractionStatus === 'EXTRACTED' ? 'var(--teal-soft)' : doc.extractionStatus === 'VERIFIED' ? 'var(--blue-soft)' : 'var(--paper)',
                          color: doc.extractionStatus === 'EXTRACTED' ? 'var(--teal-dark)' : doc.extractionStatus === 'VERIFIED' ? 'var(--blue)' : 'var(--muted)',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          fontWeight: 800,
                          fontSize: '0.75rem'
                        }}>
                          {doc.extractionStatus}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 0.8rem', fontSize: '0.8rem' }}>
                        {doc.extractionStatus === 'VERIFIED' ? (
                          <span style={{ color: 'var(--teal)', fontWeight: 800 }}>Verified ✓</span>
                        ) : (
                          <button 
                            onClick={() => handleVerify(doc._id)} 
                            style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontWeight: 800, padding: 0 }}
                          >
                            Verify now
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '1rem 0.8rem', textAlign: 'right' }}>
                        <button 
                          onClick={() => setActiveModalDoc(doc)}
                          style={{ padding: '0.4rem 0.8rem', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
