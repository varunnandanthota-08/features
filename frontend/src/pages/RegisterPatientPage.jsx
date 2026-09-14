import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/api';

export default function RegisterPatientPage() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const docFileInputRef = useRef(null);

  // Camera state
  const [stream, setStream] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [cameraError, setCameraError] = useState('');

  // OCR document state
  const [docFile, setDocFile] = useState(null);
  const [docType, setDocType] = useState('MEDICAL_REPORT');
  const [extracting, setExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState(null);

  // Form data
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    age: '',
    gender: 'male',
    village: '',
    address: '',
    district: '',
    state: 'Telangana',
    language: 'te',
    emergencyContact: '',
    emergencyPhone: '',
    relationship: 'Family Member',
    identityDemo: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Generated Patient ID preview
  const generatedIdPreview = useRef(`PT-${Math.floor(100000 + Math.random() * 900000)}`).current;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Camera handling
  const startCamera = async () => {
    setCameraError('');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported in this browser. Please use file upload.');
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { width: 400, height: 300 } });
      setStream(mediaStream);
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setCameraError('Camera access denied or unavailable. You can upload a photo file instead.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg');
      setPhotoPreview(dataUrl);
      stopCamera();
    }
  };

  const handlePhotoUploadFallback = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stream]);

  // OCR document handling
  const handleDocFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setDocFile(file);
      setExtractedData(null);
    }
  };

  const handleRunOcr = async () => {
    if (!docFile) return;
    setExtracting(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', docFile);
      formDataUpload.append('documentType', docType);

      const res = await apiRequest('/api/documents/extract', {
        method: 'POST',
        body: formDataUpload
      });
      setExtractedData(res.extractedData || {});

      // If OCR extracted name or age, autofill empty fields!
      if (res.extractedData) {
        const d = res.extractedData;
        setFormData(prev => ({
          ...prev,
          name: prev.name || d.patientName || d.name || '',
          age: prev.age || d.age || '',
          gender: prev.gender || d.gender || 'male'
        }));
      }
    } catch (err) {
      alert(`OCR Extraction note: ${err.message || 'Unable to extract document'}. You can still complete registration manually.`);
    } finally {
      setExtracting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!formData.phone) throw new Error('Phone number is required');
      if (!formData.name) throw new Error('Full name is required');
      if (!formData.age) throw new Error('Age is required');
      if (!formData.village) throw new Error('Village / Location is required');

      const payload = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        age: Number(formData.age),
        gender: formData.gender,
        village: formData.village.trim(),
        language: formData.language,
        address: formData.address,
        district: formData.district,
        state: formData.state,
        emergencyContact: formData.emergencyContact,
        emergencyPhone: formData.emergencyPhone,
        relationship: formData.relationship
      };

      await apiRequest('/api/patients/register', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      navigate('/worker/patients');
    } catch (err) {
      setError(err.message || 'Failed to register patient');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-patient-page" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '4rem' }}>
      <header className="page-topline" style={{ marginBottom: '2rem' }}>
        <button 
          onClick={() => navigate('/worker/patients')} 
          style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: 0 }}
        >
          ← Back to Patient Directory
        </button>
        <div>
          <h1 style={{ fontSize: '2.2rem', margin: '0 0 0.5rem', color: 'var(--ink)' }}>Register New Patient</h1>
          <p className="intro" style={{ margin: 0, color: 'var(--muted)' }}>
            Complete the clinical intake profile to integrate the patient into the regional care network.
          </p>
        </div>
      </header>

      <div className="cc-section" style={{ background: '#fff', padding: '2.5rem', borderRadius: '16px', border: '1px solid var(--line)', boxShadow: 'var(--shadow-soft)' }}>
        {error && (
          <div style={{ color: 'var(--red)', background: 'var(--red-soft)', padding: '1rem', borderRadius: '10px', marginBottom: '2rem', fontSize: '0.9rem', fontWeight: 700 }}>
            {error}
          </div>
        )}

        {/* Patient ID Banner */}
        <div style={{ background: 'var(--paper)', padding: '1rem 1.5rem', borderRadius: '10px', marginBottom: '2.5rem', border: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, letterSpacing: '0.05em' }}>System Assigned ID</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--ink)' }}>{generatedIdPreview}</div>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--teal)', fontWeight: 700, background: 'var(--teal-soft)', padding: '0.3rem 0.8rem', borderRadius: '6px' }}>
            Auto-assigned upon registration
          </span>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* SECTION 11: Photo Capture Area */}
          <div style={{ padding: '1.5rem', background: 'var(--paper)', borderRadius: '12px', border: '1px solid var(--line)' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--ink)' }}>Patient Photo (Optional)</h3>
            <p style={{ margin: '0 0 1.25rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
              Capture via webcam or upload a portrait for clinical identification.
            </p>

            {cameraError && (
              <div style={{ color: 'var(--amber-dark)', background: 'var(--amber-soft)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                {cameraError}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
              {photoPreview ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  <img src={photoPreview} alt="Captured portrait" style={{ width: '120px', height: '120px', borderRadius: '12px', objectFit: 'cover', border: '2px solid var(--teal)' }} />
                  <div style={{ display: 'flex', gap: '0.8rem' }}>
                    <button type="button" onClick={startCamera} style={{ padding: '0.6rem 1rem', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>
                      Retake Photo
                    </button>
                    <button type="button" onClick={() => setPhotoPreview(null)} style={{ padding: '0.6rem 1rem', background: 'none', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>
                      Remove
                    </button>
                  </div>
                </div>
              ) : cameraActive ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <video ref={videoRef} autoPlay playsInline style={{ width: '320px', height: '240px', borderRadius: '10px', background: '#000' }} />
                  <div style={{ display: 'flex', gap: '0.8rem' }}>
                    <button type="button" onClick={capturePhoto} style={{ padding: '0.6rem 1.2rem', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 800, cursor: 'pointer' }}>
                      📸 Capture Now
                    </button>
                    <button type="button" onClick={stopCamera} style={{ padding: '0.6rem 1.2rem', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <button type="button" onClick={startCamera} style={{ padding: '0.75rem 1.4rem', background: 'var(--ink)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    📷 Capture Photo
                  </button>
                  <input type="file" ref={fileInputRef} onChange={handlePhotoUploadFallback} accept="image/*" style={{ display: 'none' }} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} style={{ padding: '0.75rem 1.4rem', background: '#fff', border: '1px solid var(--line)', color: 'var(--ink)', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
                    Upload File Instead
                  </button>
                </div>
              )}
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
          </div>

          {/* SECTION 10: Supported Core Clinical Fields (Wide Grid) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            
            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.9rem' }}>Full Name *</label>
              <input 
                type="text" 
                name="name" 
                value={formData.name} 
                onChange={handleChange}
                placeholder="e.g. Ramesh Kumar"
                required
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.9rem' }}>Phone Number *</label>
              <input 
                type="tel" 
                name="phone" 
                value={formData.phone} 
                onChange={handleChange}
                placeholder="+919876543210"
                required
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.9rem' }}>Age *</label>
              <input 
                type="number" 
                name="age" 
                value={formData.age} 
                onChange={handleChange}
                min="1" max="120"
                placeholder="e.g. 38"
                required
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.9rem' }}>Gender *</label>
              <select 
                name="gender" 
                value={formData.gender} 
                onChange={handleChange}
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff' }}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.9rem' }}>Village / Location *</label>
              <input 
                type="text" 
                name="village" 
                value={formData.village} 
                onChange={handleChange}
                placeholder="e.g. Rampur"
                required
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.9rem' }}>Preferred Language *</label>
              <select 
                name="language" 
                value={formData.language} 
                onChange={handleChange}
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff' }}
              >
                <option value="te">Telugu</option>
                <option value="hi">Hindi</option>
                <option value="en">English</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.9rem' }}>Address Line</label>
              <input 
                type="text" 
                name="address" 
                value={formData.address} 
                onChange={handleChange}
                placeholder="House no, Street name"
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.9rem' }}>District</label>
              <input 
                type="text" 
                name="district" 
                value={formData.district} 
                onChange={handleChange}
                placeholder="e.g. Ranga Reddy"
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.9rem' }}>Emergency Contact Name</label>
              <input 
                type="text" 
                name="emergencyContact" 
                value={formData.emergencyContact} 
                onChange={handleChange}
                placeholder="Relative or guardian name"
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.9rem' }}>Emergency Phone</label>
              <input 
                type="tel" 
                name="emergencyPhone" 
                value={formData.emergencyPhone} 
                onChange={handleChange}
                placeholder="+91..."
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.9rem' }}>Identity Document / Ref (Optional)</label>
              <input 
                type="text" 
                name="identityDemo" 
                value={formData.identityDemo} 
                onChange={handleChange}
                placeholder="Demo ID or Voter ID reference"
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)' }}
              />
            </div>

          </div>

          {/* SECTION 12: Optional OCR Document Area */}
          <div style={{ padding: '1.5rem', background: 'var(--paper)', borderRadius: '12px', border: '1px solid var(--line)', marginTop: '1rem' }}>
            <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.1rem', color: 'var(--ink)' }}>Upload Existing Medical Document (Optional)</h3>
            <p style={{ margin: '0 0 1.25rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
              Upload an existing prescription or medical report to extract patient history using Doc Intelligence.
            </p>

            <input 
              type="file" 
              ref={docFileInputRef} 
              onChange={handleDocFileSelect} 
              accept="image/*,.pdf" 
              style={{ display: 'none' }} 
            />

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select 
                value={docType} 
                onChange={e => setDocType(e.target.value)}
                style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff' }}
              >
                <option value="MEDICAL_REPORT">Medical Report</option>
                <option value="PRESCRIPTION">Prescription</option>
                <option value="LAB_REPORT">Lab Report</option>
                <option value="PATIENT_REGISTRATION">Old Patient Document</option>
              </select>

              <button 
                type="button" 
                onClick={() => docFileInputRef.current?.click()}
                style={{ padding: '0.75rem 1.2rem', background: '#fff', border: '1px solid var(--line)', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
              >
                {docFile ? `File: ${docFile.name}` : 'Select Document File'}
              </button>

              {docFile && (
                <button 
                  type="button" 
                  onClick={handleRunOcr}
                  disabled={extracting}
                  style={{ padding: '0.75rem 1.4rem', background: 'var(--ink)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: extracting ? 'wait' : 'pointer' }}
                >
                  {extracting ? 'Extracting OCR...' : 'Extract & Autofill'}
                </button>
              )}
            </div>

            {extractedData && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#fff', borderRadius: '8px', border: '1px solid var(--teal)' }}>
                <strong style={{ color: 'var(--teal-dark)', fontSize: '0.85rem' }}>✓ OCR Extraction Preview:</strong>
                <pre style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--ink)', maxHeight: '120px', overflowY: 'auto' }}>
                  {JSON.stringify(extractedData, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--line)' }}>
            <button 
              type="button" 
              onClick={() => navigate('/worker/patients')}
              style={{ flex: 1, padding: '1rem', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading}
              style={{ flex: 2, padding: '1rem', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: loading ? 'wait' : 'pointer', fontSize: '1rem', boxShadow: 'var(--shadow-soft)' }}
            >
              {loading ? 'Registering Patient...' : 'Complete Patient Registration'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
