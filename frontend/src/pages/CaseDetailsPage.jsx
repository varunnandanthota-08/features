import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiRequest } from '../services/api';

function formatDate(value) {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function valueOrFallback(value) {
  return value === null || value === undefined || value === '' ? 'Not available' : value;
}

function editableFieldValue(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function DetailField({ label, value }) {
  return (
    <div className="detail-field">
      <dt>{label}</dt>
      <dd>{valueOrFallback(value)}</dd>
    </div>
  );
}

function locationLabel(record) {
  const location = record.location || record.patientLocation || record.patient?.location;
  if (!location) return 'Not available';
  if (location.village) return location.village;
  if (location.latitude !== undefined && location.longitude !== undefined) {
    return `${location.latitude}, ${location.longitude}`;
  }
  return 'Not available';
}

function healthCentre(record) {
  return record.assignedHealthCenter
    || record.selectedHealthCenter
    || record.selectedFacility
    || null;
}

function caseLocation(record) {
  return record?.location || record?.patientLocation || record?.patient?.location || null;
}

const referralTransitions = {
  PENDING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: []
};

async function resolveCaseCoordinates(record) {
  const location = caseLocation(record);
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude };

  const locationText = record?.locationLabel || location?.village;
  if (!locationText) return null;
  const payload = await apiRequest(`/api/health-centers/geocode?location=${encodeURIComponent(locationText)}`);
  return payload?.data || null;
}

function coordinatePair(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : null;
}

function ReferralMap({ patientCoordinates, assignedCentre, recommendation, facilities, selectedDestination }) {
  const mapElement = useRef(null);
  const map = useRef(null);

  useEffect(() => {
    if (!mapElement.current || map.current) return undefined;
    map.current = L.map(mapElement.current, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    const markerLayer = L.layerGroup().addTo(map.current);
    const markers = [];
    const addMarker = (location, label, color, selected = false) => {
      const coordinates = coordinatePair(location);
      if (!coordinates) return;
      const marker = L.circleMarker(coordinates, {
        color,
        fillColor: color,
        fillOpacity: .85,
        radius: selected ? 11 : 8,
        weight: selected ? 4 : 2
      }).addTo(markerLayer).bindPopup(`<strong>${label}</strong>`);
      markers.push(marker);
    };

    addMarker(patientCoordinates, 'Patient / case location', '#176b5b');
    addMarker(assignedCentre?.location, `Assigned: ${assignedCentre?.name || 'Health centre'}`, '#9a3f24');
    addMarker(recommendation?.location, `Recommended: ${recommendation?.name || 'Referral facility'}`, '#765600', recommendation?.healthCenterId === selectedDestination);
    facilities.forEach(facility => addMarker(
      facility.location,
      facility.name || facility.healthCenterId,
      '#24527a',
      facility.healthCenterId === selectedDestination
    ));

    if (markers.length) {
      map.current.fitBounds(L.featureGroup(markers).getBounds().pad(.2), { maxZoom: 13 });
    }
    return () => markerLayer.remove();
  }, [assignedCentre, facilities, patientCoordinates, recommendation, selectedDestination]);

  if (!patientCoordinates && !assignedCentre?.location && !recommendation?.location && !facilities.some(facility => facility.location)) {
    return <p className="data-state">Map unavailable because no real coordinates were returned for this case or its facilities.</p>;
  }

  return (
    <>
      <div className="referral-map" ref={mapElement} aria-label="Case and referral facility map" />
      <div className="map-legend" aria-label="Map legend">
        <span><i className="legend-dot patient-dot" />Patient</span>
        <span><i className="legend-dot assigned-dot" />Assigned centre</span>
        <span><i className="legend-dot recommended-dot" />Recommended</span>
        <span><i className="legend-dot alternative-dot" />Suitable facility</span>
      </div>
    </>
  );
}

export default function CaseDetailsPage() {
  const { caseId, kind } = useParams();
  const location = useLocation();
  const initialRecord = location.state?.record || null;
  const [record, setRecord] = useState(initialRecord);
  const [state, setState] = useState({ loading: !initialRecord, error: '' });
  const [acknowledgement, setAcknowledgement] = useState({ loading: false, error: '', success: '' });
  const [escalationAction, setEscalationAction] = useState({ loading: false, error: '', success: '' });
  const [healthCentreDetails, setHealthCentreDetails] = useState(null);
  const [healthCentreState, setHealthCentreState] = useState({ loading: false, error: '' });
  const [capabilityDecision, setCapabilityDecision] = useState('');
  const [referralFacilities, setReferralFacilities] = useState([]);
  const [referralRecommendation, setReferralRecommendation] = useState(null);
  const [referralCoordinates, setReferralCoordinates] = useState(null);
  const [referralFacilityDetails, setReferralFacilityDetails] = useState([]);
  const [referralOptionsState, setReferralOptionsState] = useState({ loading: false, error: '' });
  const [selectedDestination, setSelectedDestination] = useState('');
  const [referralAction, setReferralAction] = useState({ loading: false, error: '', success: '' });
  const [createdReferral, setCreatedReferral] = useState(null);
  const [referralStatusAction, setReferralStatusAction] = useState({ loading: false, error: '', success: '' });
  const [triageLevel, setTriageLevel] = useState('');
  const [documentType, setDocumentType] = useState('MEDICAL_REPORT');
  const [selectedFile, setSelectedFile] = useState(null);
  const [documentFields, setDocumentFields] = useState({});
  const [originalDocumentFields, setOriginalDocumentFields] = useState({});
  const [documentConfidence, setDocumentConfidence] = useState({});
  const [documentState, setDocumentState] = useState({ loading: false, error: '', success: '' });
  const [documentId, setDocumentId] = useState('');
  const [documentResult, setDocumentResult] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadRecord() {
      if (initialRecord && kind === 'case') {
        setState({ loading: false, error: '' });
        return;
      }

      try {
        const payload = kind === 'emergency'
          ? await apiRequest(`/api/emergency/${encodeURIComponent(caseId)}`)
          : await apiRequest('/api/cases/active');
        if (!active) return;

        if (kind === 'emergency') {
          const detail = payload?.data;
          if (!detail?.emergency) {
            setState({ loading: false, error: 'Emergency case details are unavailable.' });
            return;
          }
          setRecord({
            ...(initialRecord || {}),
            ...detail.emergency,
            patient: detail.patient || initialRecord?.patient,
            selectedFacility: detail.selectedFacility || initialRecord?.selectedFacility,
            escalation: detail.escalation || initialRecord?.escalation
          });
        } else {
          const activeCase = Array.isArray(payload?.data)
            ? payload.data.find(item => item.caseId === caseId)
            : null;
          if (!activeCase) {
            setState({ loading: false, error: 'This case is no longer in the active queue.' });
            return;
          }
          setRecord(activeCase);
        }
        setState({ loading: false, error: '' });
      } catch (error) {
        if (active) setState({ loading: false, error: error.message || 'Unable to load case details.' });
      }
    }

    loadRecord();
    return () => { active = false; };
  }, [caseId, initialRecord, kind]);

  const assignedHealthCentre = record?.assignedHealthCenter
    || record?.selectedHealthCenter
    || record?.selectedFacility
    || null;

  useEffect(() => {
    let active = true;
    const healthCenterId = assignedHealthCentre?.healthCenterId;

    if (!healthCenterId) {
      setHealthCentreDetails(null);
      setHealthCentreState({ loading: false, error: '' });
      return () => { active = false; };
    }

    setHealthCentreState({ loading: true, error: '' });
    apiRequest(`/api/health-centers/${encodeURIComponent(healthCenterId)}`)
      .then(payload => {
        if (!active) return;
        setHealthCentreDetails(payload?.data || null);
        setHealthCentreState({ loading: false, error: payload?.data ? '' : 'Health centre details are unavailable.' });
      })
      .catch(error => {
        if (active) setHealthCentreState({ loading: false, error: error.message || 'Unable to load health centre details.' });
      });

    return () => { active = false; };
  }, [assignedHealthCentre?.healthCenterId]);

  useEffect(() => {
    let active = true;
    if (capabilityDecision !== 'needs-referral') {
      setReferralFacilities([]);
      setReferralRecommendation(null);
      setReferralCoordinates(null);
      setReferralFacilityDetails([]);
      setSelectedDestination('');
      setReferralOptionsState({ loading: false, error: '' });
      return () => { active = false; };
    }

    setReferralOptionsState({ loading: true, error: '' });
    async function loadReferralFacilities() {
      try {
        const coordinates = await resolveCaseCoordinates(record);
        if (!coordinates) throw new Error('A case location is required to find referral facilities.');
        setReferralCoordinates(coordinates);
        const query = new URLSearchParams({
          latitude: String(coordinates.latitude),
          longitude: String(coordinates.longitude)
        });
        if (kind === 'emergency') query.set('emergency', 'true');
        const payload = await apiRequest(`/api/health-centers/recommend?${query.toString()}`);
        if (!active) return;
        const sourceId = assignedHealthCentre?.healthCenterId;
        const recommendation = payload?.data?.recommendation || null;
        setReferralRecommendation(recommendation);
        const facilities = Array.isArray(payload?.data?.facilities)
          ? payload.data.facilities.filter(facility => facility.healthCenterId !== sourceId
            && facility.healthCenterId !== recommendation?.healthCenterId)
          : [];
        setReferralFacilities(facilities);
        const facilityIds = [recommendation?.healthCenterId, ...facilities.map(facility => facility.healthCenterId)].filter(Boolean);
        const details = await Promise.all(facilityIds.map(async healthCenterId => {
          try {
            const detailPayload = await apiRequest(`/api/health-centers/${encodeURIComponent(healthCenterId)}`);
            return detailPayload?.data || null;
          } catch (_) {
            return null;
          }
        }));
        if (!active) return;
        setReferralFacilityDetails(details.filter(Boolean));
        setReferralOptionsState({ loading: false, error: '' });
      } catch (error) {
        if (active) setReferralOptionsState({ loading: false, error: error.message || 'Unable to load referral facilities.' });
      }
    }

    loadReferralFacilities();

    return () => { active = false; };
  }, [assignedHealthCentre?.healthCenterId, capabilityDecision, kind, record]);

  async function acknowledge() {
    setAcknowledgement({ loading: true, error: '', success: '' });
    try {
      const payload = await apiRequest(
        `/api/${kind === 'emergency' ? 'emergency' : 'cases'}/${encodeURIComponent(caseId)}/acknowledge`,
        {
          method: 'POST',
          body: JSON.stringify(kind === 'emergency'
            ? { acknowledgedBy: 'Health Worker' }
            : {
              healthCenterId: assignedHealthCentre?.healthCenterId,
              healthWorkerId: 'Health Worker'
            })
        }
      );
      const detail = payload?.data;
      if (!detail) throw new Error('Acknowledgement response was incomplete.');
      setRecord(current => ({
        ...(current || {}),
        ...(kind === 'emergency' ? detail.emergency : detail.case),
        patient: detail.patient || current?.patient,
        selectedFacility: detail.selectedFacility || current?.selectedFacility,
        escalation: detail.escalation || current?.escalation
      }));
      setAcknowledgement({ loading: false, error: '', success: 'Case acknowledged successfully.' });
    } catch (error) {
      setAcknowledgement({ loading: false, error: error.message || 'Unable to acknowledge case.', success: '' });
    }
  }

  async function escalate() {
    setEscalationAction({ loading: true, error: '', success: '' });
    try {
      const payload = await apiRequest(
        `/api/${kind === 'emergency' ? 'emergency' : 'cases'}/${encodeURIComponent(caseId)}/escalate`,
        {
          method: 'POST',
          body: JSON.stringify({})
        }
      );
      const detail = payload?.data;
      if (!detail) throw new Error('Escalation response was incomplete.');
      setRecord(current => ({
        ...(current || {}),
        ...(kind === 'emergency' ? detail.emergency : detail.case),
        patient: detail.patient || current?.patient,
        selectedFacility: detail.selectedFacility || current?.selectedFacility,
        escalation: detail.escalation || current?.escalation
      }));
      setEscalationAction({ loading: false, error: '', success: 'Case escalated successfully.' });
    } catch (error) {
      setEscalationAction({ loading: false, error: error.message || 'Unable to escalate case.', success: '' });
    }
  }

  async function createReferral() {
    if (!selectedDestination || referralAction.loading) return;
    const patientId = record?.patient?._id || record?.patientId;
    const sourceId = assignedHealthCentre?.healthCenterId;
    if (!patientId || !sourceId) {
      setReferralAction({ loading: false, error: 'Patient and source health centre details are required.', success: '' });
      return;
    }

    setReferralAction({ loading: true, error: '', success: '' });
    try {
      const payload = await apiRequest('/api/referrals', {
        method: 'POST',
        body: JSON.stringify({
          referralId: `REF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          caseId,
          patientId: String(patientId),
          fromHealthCenterId: sourceId,
          toHealthCenterId: selectedDestination,
          reason: description || 'Referral requested by health worker'
        })
      });
      if (!payload?.data) throw new Error('Referral response was incomplete.');
      setCreatedReferral(payload.data);
      setRecord(current => ({
        ...(current || {}),
        status: 'REFERRED',
        referralId: payload.data.referralId,
        referredToHealthCenterId: payload.data.toHealthCenterId,
        referredAt: payload.data.createdAt || current?.referredAt
      }));
      setReferralStatusAction({ loading: false, error: '', success: '' });
      setReferralAction({ loading: false, error: '', success: 'Referral created successfully.' });
    } catch (error) {
      setReferralAction({ loading: false, error: error.message || 'Unable to create referral.', success: '' });
    }
  }

  async function updateReferralStatus(status) {
    if (!createdReferral || referralStatusAction.loading) return;
    setReferralStatusAction({ loading: true, error: '', success: '' });
    try {
      const payload = await apiRequest(`/api/referrals/${encodeURIComponent(createdReferral.referralId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      if (!payload?.data) throw new Error('Referral status response was incomplete.');
      setCreatedReferral(payload.data);
      setReferralStatusAction({ loading: false, error: '', success: `Referral marked ${payload.data.status}.` });
    } catch (error) {
      setReferralStatusAction({ loading: false, error: error.message || 'Unable to update referral status.', success: '' });
    }
  }

  async function extractDocument() {
    if (!selectedFile || documentState.loading) return;
    const patientId = record?.patient?._id || record?.patientId;
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('documentType', documentType);
    if (patientId) formData.append('patientId', String(patientId));

    setDocumentState({ loading: true, error: '', success: '' });
    setDocumentResult(null);
    try {
      const payload = await apiRequest('/api/documents/extract', { method: 'POST', body: formData });
      const fields = Object.fromEntries(
        Object.entries(payload?.extractedData || {}).map(([name, value]) => [name, editableFieldValue(value?.value ?? value)])
      );
      setDocumentId(payload?.documentId || '');
      setDocumentFields(fields);
      setOriginalDocumentFields(fields);
      setDocumentConfidence(payload?.confidence || {});
      setDocumentState({ loading: false, error: '', success: 'Document extracted. Review the fields before verification.' });
    } catch (error) {
      setDocumentState({ loading: false, error: error.message || 'Unable to extract document.', success: '' });
    }
  }

  async function verifyDocument() {
    if (!documentId || documentState.loading) return;
    const patientId = record?.patient?._id || record?.patientId;
    if (documentType === 'MEDICAL_REPORT' && !patientId) {
      setDocumentState({ loading: false, error: 'A patient ID is required to verify a medical report.', success: '' });
      return;
    }

    setDocumentState({ loading: true, error: '', success: '' });
    try {
      const payload = await apiRequest('/api/documents/verify', {
        method: 'POST',
        body: JSON.stringify({
          documentId,
          patientId: patientId ? String(patientId) : undefined,
          fields: documentFields,
          verifiedBy: 'Health Worker'
        })
      });
      setDocumentResult(payload);
      setDocumentState({ loading: false, error: '', success: 'Document verified successfully.' });
    } catch (error) {
      setDocumentState({ loading: false, error: error.message || 'Unable to verify document.', success: '' });
    }
  }

  const centre = healthCentreDetails || (record ? healthCentre(record) : null);
  const escalation = record?.escalation || record;
  const description = record?.complaint || record?.reason;
  const recommendationLocation = referralFacilityDetails.find(
    facility => facility.healthCenterId === referralRecommendation?.healthCenterId
  );
  const facilityLocations = referralFacilities.map(facility => ({
    ...facility,
    ...referralFacilityDetails.find(detail => detail.healthCenterId === facility.healthCenterId)
  }));
  const canAcknowledge = ['NEW', 'ASSIGNED'].includes(record?.status);
  const canEscalate = record?.escalationEligible === true;

  return (
    <section className="details-page" aria-labelledby="details-title">
      <Link className="back-link" to="/">Back to dashboard</Link>
      {state.loading && <p className="data-state">Loading case details...</p>}
      {!state.loading && state.error && <p className="data-state data-state-error">{state.error}</p>}
      {!state.loading && !state.error && !record && (
        <p className="data-state data-state-error">Case details are unavailable.</p>
      )}
      {!state.loading && !state.error && record && (
        <>
          <p className="eyebrow">{kind === 'emergency' ? 'Emergency case' : 'Normal case'}</p>
          <div className="details-heading">
            <div>
              <h1 id="details-title">{valueOrFallback(record.caseId)}</h1>
              <p className="intro">Complete case information from the operations system.</p>
            </div>
            {record.priority && <span className="priority-badge critical">{record.priority}</span>}
          </div>
          {(canAcknowledge || canEscalate) && (
            <div className="action-bar">
              {canAcknowledge && <button className="action-button" disabled={acknowledgement.loading} onClick={acknowledge} type="button">
                {acknowledgement.loading ? 'Acknowledging...' : 'Acknowledge case'}
              </button>}
              {canEscalate && <button className="action-button action-button-secondary" disabled={escalationAction.loading} onClick={escalate} type="button">
                {escalationAction.loading ? 'Escalating...' : 'Escalate case'}
              </button>}
            </div>
          )}
          {acknowledgement.success && <p className="action-message action-message-success" role="status">{acknowledgement.success}</p>}
          {acknowledgement.error && <p className="action-message action-message-error" role="alert">{acknowledgement.error}</p>}
          {escalationAction.success && <p className="action-message action-message-success" role="status">{escalationAction.success}</p>}
          {escalationAction.error && <p className="action-message action-message-error" role="alert">{escalationAction.error}</p>}
          <section className="details-panel" aria-labelledby="case-information-heading">
            <h2 id="case-information-heading">Case information</h2>
            <dl className="details-grid">
              <DetailField label={kind === 'emergency' ? 'Reason' : 'Complaint'} value={description} />
              <DetailField label="Status" value={record.status} />
              <DetailField label="Source" value={record.source} />
              <DetailField label="Location" value={locationLabel(record)} />
              <DetailField label="Created" value={formatDate(record.createdAt)} />
              <DetailField label="Updated" value={formatDate(record.updatedAt)} />
            </dl>
          </section>
          <section className="details-panel" aria-labelledby="patient-history-heading">
            <h2 id="patient-history-heading">Patient History</h2>
            <p className="history-intro">Patient details and history available through the current case response.</p>
            <dl className="details-grid">
              <DetailField label="Name" value={record.patient?.name} />
              <DetailField label="Phone" value={record.patient?.phone} />
              <DetailField label="Age" value={record.patient?.age} />
              <DetailField label="Gender" value={record.patient?.gender} />
              <DetailField label="Location" value={locationLabel(record.patient || {})} />
              <DetailField label="Symptoms / details" value={record.patient?.symptomsDescription} />
              <DetailField label="Current case reference" value={record.caseId} />
              <DetailField label="Current case status" value={record.status} />
              <DetailField label="Current complaint / reason" value={description} />
              <DetailField label="Case created" value={formatDate(record.createdAt)} />
            </dl>
            <p className="data-state history-unavailable">Medical records and previous reports are unavailable through the current backend APIs.</p>
          </section>
          <section className="details-panel" aria-labelledby="clinical-review-heading">
            <div className="clinical-review-heading">
              <div>
                <h2 id="clinical-review-heading">Clinical Review</h2>
                <p className="local-only-label">Triage selection is local/UI-only and is not saved to the backend.</p>
              </div>
            </div>
            <dl className="details-grid">
              <DetailField label={kind === 'emergency' ? 'Emergency reason' : 'Complaint'} value={description} />
              <DetailField label="Symptoms / details" value={record.patient?.symptomsDescription} />
              <DetailField label="Patient" value={record.patient?.name || record.patient?.phone} />
              <DetailField label="Patient age" value={record.patient?.age} />
              <DetailField label="Case status" value={record.status} />
              <DetailField label="Priority / risk" value={record.priority} />
              <DetailField label="Assigned health centre" value={centre?.name} />
              <DetailField label="Case location" value={locationLabel(record)} />
            </dl>
            <div className="triage-controls" aria-label="Local triage selection">
              <p className="decision-label">Local triage level</p>
              {['Low', 'Medium', 'High', 'Critical'].map(level => (
                <button
                  className={`decision-button${triageLevel === level ? ' selected' : ''}`}
                  key={level}
                  onClick={() => setTriageLevel(level)}
                  type="button"
                >
                  {level}
                </button>
              ))}
              {triageLevel && (
                <p className="decision-note" role="status">Local triage: {triageLevel}. No diagnosis or treatment decision was saved.</p>
              )}
            </div>
          </section>
          <section className="details-panel" aria-labelledby="document-intelligence-heading">
            <h2 id="document-intelligence-heading">Document Intelligence</h2>
            <p className="history-intro">Optional: upload an existing medical report, prescription, or patient document to extract information for review and verification.</p>
            <p className="document-purpose-note">Case creation does not require OCR. Use this when a physical or existing document is available.</p>
            <div className="document-upload">
              <label htmlFor="document-type">Document type</label>
              <select id="document-type" disabled={documentState.loading || Boolean(documentId)} onChange={event => setDocumentType(event.target.value)} value={documentType}>
                <option value="MEDICAL_REPORT">Medical report / prescription</option>
                <option value="PATIENT_REGISTRATION">Patient registration</option>
              </select>
              <label htmlFor="document-file">Select document</label>
              <input accept="image/jpeg,image/png,image/webp,application/pdf" disabled={documentState.loading || Boolean(documentId)} id="document-file" onChange={event => setSelectedFile(event.target.files?.[0] || null)} type="file" />
              <button className="action-button" disabled={!selectedFile || documentState.loading || Boolean(documentId)} onClick={extractDocument} type="button">
                {documentState.loading && !documentId ? 'Extracting...' : 'Extract document'}
              </button>
            </div>
            {documentState.error && <p className="action-message action-message-error" role="alert">{documentState.error}</p>}
            {documentState.success && <p className="action-message action-message-success" role="status">{documentState.success}</p>}
            {documentId && (
              <div className="document-review">
                <p className="document-status">Extraction status: EXTRACTED · Document ID: {documentId}</p>
                {!Object.keys(documentFields).length && <p className="data-state">No extracted fields were returned. No values have been invented.</p>}
                {!!Object.keys(documentFields).length && (
                  <div className="document-fields">
                    {Object.entries(documentFields).map(([name, value]) => {
                      const confidence = documentConfidence[name] ?? '';
                      const corrected = value !== originalDocumentFields[name];
                      return (
                        <label className="document-field" key={name}>
                          <span>{name}{confidence !== '' && ` · OCR confidence ${confidence}`}{corrected && ' · Manually corrected'}</span>
                          <textarea onChange={event => setDocumentFields(current => ({ ...current, [name]: event.target.value }))} value={value} />
                        </label>
                      );
                    })}
                  </div>
                )}
                <button className="action-button" disabled={documentState.loading || !documentId} onClick={verifyDocument} type="button">
                  {documentState.loading && documentId ? 'Verifying...' : 'Verify document'}
                </button>
                {documentResult && (
                  <div className="document-result">
                    <h3>Backend verification result</h3>
                    <dl className="details-grid">
                      <DetailField label="Document ID" value={documentResult.documentId} />
                      <DetailField label="Document type" value={documentResult.documentType} />
                      <DetailField label="Patient ID" value={documentResult.patientId} />
                      <DetailField label="Status" value={documentResult.status} />
                      <DetailField label="Verified by" value={documentResult.verifiedBy} />
                      <DetailField label="Verified at" value={formatDate(documentResult.verifiedAt)} />
                    </dl>
                  </div>
                )}
              </div>
            )}
          </section>
          <section className="details-panel" aria-labelledby="health-centre-review-heading">
            <h2 id="health-centre-review-heading">Health Centre Review</h2>
            {healthCentreState.loading && <p className="data-state">Loading health centre details...</p>}
            {!healthCentreState.loading && healthCentreState.error && (
              <p className="data-state data-state-error">{healthCentreState.error}</p>
            )}
            {!healthCentreState.loading && !healthCentreState.error && !centre && (
              <p className="data-state">No assigned health centre is available.</p>
            )}
            {!healthCentreState.loading && !healthCentreState.error && centre && (
              <>
                <dl className="details-grid">
                  <DetailField label="Name" value={centre.name} />
                  <DetailField label="Health centre ID" value={centre.healthCenterId} />
                  <DetailField label="Address" value={centre.address} />
                  <DetailField label="Location" value={centre.village || locationLabel(centre)} />
                  <DetailField label="Services" value={centre.services?.join(', ')} />
                  <DetailField label="Emergency care" value={centre.emergencyAvailable ? 'Available' : 'Not available'} />
                  <DetailField label="Available capacity" value={centre.availableCapacity ?? (centre.capacity - (centre.currentPatientLoad || 0))} />
                  <DetailField label="Patient load" value={centre.currentPatientLoad} />
                  <DetailField label="Doctors" value={centre.doctors && Object.entries(centre.doctors).filter(([, count]) => count > 0).map(([specialty, count]) => `${specialty}: ${count}`).join(', ')} />
                  <DetailField label="Equipment" value={centre.equipment && Object.entries(centre.equipment).filter(([, available]) => available).map(([name]) => name).join(', ')} />
                </dl>
                <div className="capability-decision" aria-label="Health centre capability decision">
                  <p className="decision-label">Can this health centre handle the case?</p>
                  <button
                    className={`decision-button${capabilityDecision === 'can-handle' ? ' selected' : ''}`}
                    onClick={() => {
                      setCapabilityDecision('can-handle');
                      setCreatedReferral(null);
                      setReferralAction({ loading: false, error: '', success: '' });
                    }}
                    type="button"
                  >
                    Can handle this case
                  </button>
                  <button
                    className={`decision-button${capabilityDecision === 'needs-referral' ? ' selected' : ''}`}
                    onClick={() => {
                      setCapabilityDecision('needs-referral');
                      setCreatedReferral(null);
                      setReferralAction({ loading: false, error: '', success: '' });
                    }}
                    type="button"
                  >
                    Needs referral
                  </button>
                  {capabilityDecision && (
                    <p className="decision-note" role="status">Decision recorded for this review only.</p>
                  )}
                </div>
                {capabilityDecision === 'needs-referral' && (
                  <div className="referral-section" aria-labelledby="referral-heading">
                    <h3 id="referral-heading">Referral destination</h3>
                    <ReferralMap
                      assignedCentre={centre}
                      facilities={facilityLocations}
                      patientCoordinates={referralCoordinates}
                      recommendation={recommendationLocation}
                      selectedDestination={selectedDestination}
                    />
                    {referralOptionsState.loading && <p className="data-state">Finding suitable health centres...</p>}
                    {!referralOptionsState.loading && referralOptionsState.error && (
                      <p className="data-state data-state-error">{referralOptionsState.error}</p>
                    )}
                    {!referralOptionsState.loading && !referralOptionsState.error
                      && !referralFacilities.length && !referralRecommendation && (
                      <p className="data-state">No suitable destination health centres are available.</p>
                    )}
                    {!referralOptionsState.loading && !referralOptionsState.error && referralRecommendation && (
                      <div className="recommended-facility">
                        <div className="facility-heading">
                          <div>
                            <span className="facility-label">Backend recommendation</span>
                            <h4>{referralRecommendation.name}</h4>
                          </div>
                          <span className="facility-score">Score {referralRecommendation.score}</span>
                        </div>
                        <p className="facility-meta">{referralRecommendation.healthCenterId} · {referralRecommendation.distanceKm} km away</p>
                        <p className="facility-meta">{referralRecommendation.reasons?.join(' · ') || 'Recommended by the health-centre ranking.'}</p>
                        <button
                          className={`referral-option recommendation-option${selectedDestination === referralRecommendation.healthCenterId ? ' selected' : ''}`}
                          disabled={referralRecommendation.healthCenterId === assignedHealthCentre?.healthCenterId}
                          onClick={() => setSelectedDestination(referralRecommendation.healthCenterId)}
                          type="button"
                        >
                          {referralRecommendation.healthCenterId === assignedHealthCentre?.healthCenterId
                            ? 'Assigned centre cannot be the referral destination'
                            : 'Select recommended facility'}
                        </button>
                      </div>
                    )}
                    {!referralOptionsState.loading && !referralOptionsState.error && referralFacilities.length > 0 && (
                      <p className="facility-label alternatives-label">Alternative suitable facilities</p>
                    )}
                    <div className="referral-options">
                      {referralFacilities.map(facility => (
                        <button
                          className={`referral-option${selectedDestination === facility.healthCenterId ? ' selected' : ''}`}
                          key={facility.healthCenterId}
                          onClick={() => setSelectedDestination(facility.healthCenterId)}
                          type="button"
                        >
                          <strong>{facility.name}</strong>
                          <span>{facility.healthCenterId}</span>
                          <span>{facility.distanceKm} km away</span>
                          <span>Capacity available: {facility.availableCapacity}</span>
                          <span>Services: {facility.services?.join(', ') || 'Not listed'}</span>
                          <span>Equipment: {Object.entries(facility.equipment || {}).filter(([, available]) => available).map(([name]) => name).join(', ') || 'Not listed'}</span>
                        </button>
                      ))}
                    </div>
                    {(referralFacilities.length > 0 || referralRecommendation) && (
                      <div className="referral-action-dock">
                        <div>
                          <span className="facility-label">Selected destination</span>
                          <strong>{selectedDestination || 'None selected'}</strong>
                        </div>
                        <button className="action-button referral-button" disabled={!selectedDestination || referralAction.loading || Boolean(createdReferral)} onClick={createReferral} type="button">
                          {referralAction.loading ? 'Creating referral...' : 'Create referral'}
                        </button>
                      </div>
                    )}
                    {referralAction.success && <p className="action-message action-message-success" role="status">{referralAction.success}</p>}
                    {referralAction.error && <p className="action-message action-message-error" role="alert">{referralAction.error}</p>}
                    {createdReferral && (
                      <div className="created-referral">
                        <h4>Referral management</h4>
                        <dl className="details-grid">
                          <DetailField label="Referral ID" value={createdReferral.referralId} />
                          <DetailField label="Source health centre" value={createdReferral.fromHealthCenterId} />
                          <DetailField label="Destination health centre" value={createdReferral.toHealthCenterId} />
                          <DetailField label="Patient reference" value={createdReferral.patientId} />
                          <DetailField label="Case reference" value={record.caseId} />
                          <DetailField label="Reason" value={createdReferral.reason} />
                          <DetailField label="Created" value={formatDate(createdReferral.createdAt)} />
                          <DetailField label="Current status" value={createdReferral.status} />
                        </dl>
                        {referralTransitions[createdReferral.status]?.length > 0 && (
                          <div className="referral-status-actions">
                            <p className="decision-label">Update referral status</p>
                            {referralTransitions[createdReferral.status].map(status => (
                              <button
                                className="decision-button"
                                disabled={referralStatusAction.loading}
                                key={status}
                                onClick={() => updateReferralStatus(status)}
                                type="button"
                              >
                                {referralStatusAction.loading ? 'Updating...' : `Mark ${status}`}
                              </button>
                            ))}
                          </div>
                        )}
                        {referralStatusAction.success && <p className="action-message action-message-success" role="status">{referralStatusAction.success}</p>}
                        {referralStatusAction.error && <p className="action-message action-message-error" role="alert">{referralStatusAction.error}</p>}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
          <section className="details-panel" aria-labelledby="assignment-heading">
            <h2 id="assignment-heading">Assignment and escalation</h2>
            <dl className="details-grid">
              <DetailField label="Health centre" value={centre?.name} />
              <DetailField label="Centre address" value={centre?.address} />
              <DetailField label="Escalation status" value={escalation.escalationStatus || escalation.status} />
              <DetailField label="Escalation level" value={escalation.escalationLevel ?? escalation.level} />
              <DetailField label="Escalation reason" value={escalation.escalationReason || escalation.reason} />
              <DetailField label="Escalated at" value={formatDate(escalation.escalatedAt)} />
            </dl>
          </section>
        </>
      )}
    </section>
  );
}