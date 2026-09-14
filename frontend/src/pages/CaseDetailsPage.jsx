import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiRequest } from '../services/api';
import ReferralSlaDisplay from '../components/ReferralSlaDisplay';
import EmergencyCountdown from '../components/EmergencyCountdown';
import { useAuth } from '../components/AuthContext';

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
  const location = record?.location || record?.patientLocation || record?.patient?.location;
  if (!location) return 'Not available';
  if (typeof location === 'string') return location;
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

function hasCoordinatesOrVillage(loc) {
  if (!loc || typeof loc !== 'object') return false;
  return (Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude))) || Boolean(loc.village);
}

function caseLocation(record) {
  if (hasCoordinatesOrVillage(record?.location)) return record.location;
  if (hasCoordinatesOrVillage(record?.patientLocation)) return record.patientLocation;
  if (hasCoordinatesOrVillage(record?.patient?.location)) return record.patient.location;
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

  const locationText = record?.locationLabel || location?.village || record?.patient?.location?.village;
  if (!locationText) return null;
  try {
    const payload = await apiRequest(`/api/health-centers/geocode?location=${encodeURIComponent(locationText)}`);
    return payload?.data || null;
  } catch (_) {
    return null;
  }
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
  const { user } = useAuth();
  const { caseId: paramCaseId, id: paramId, kind: paramKind } = useParams();
  const location = useLocation();
  const caseId = paramCaseId || paramId;
  const isEmergencyPath = location.pathname.includes('/emergencies') || paramKind === 'emergency';
  const kind = paramKind || (isEmergencyPath ? 'emergency' : 'case');
  const initialRecord = location.state?.record || null;
  const [record, setRecord] = useState(initialRecord);
  const [state, setState] = useState({ loading: !initialRecord, error: '' });
  const [acknowledgement, setAcknowledgement] = useState({ loading: false, error: '', success: '' });
  const [resolveAction, setResolveAction] = useState({ loading: false, error: '', success: '' });
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
  const [slaExpired, setSlaExpired] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadRecord() {
      try {
        const payload = kind === 'emergency'
          ? await apiRequest(`/api/emergency/${encodeURIComponent(caseId)}`)
          : await apiRequest(`/api/cases/${encodeURIComponent(caseId)}`);
        if (!active) return;

        if (kind === 'emergency') {
          const detail = payload?.data;
          if (!detail?.emergency) {
            setState({ loading: false, error: 'Emergency case details are unavailable.' });
            return;
          }
          setRecord(prev => ({
            ...(initialRecord || {}),
            ...(prev || {}),
            ...detail.emergency,
            patient: detail.patient || prev?.patient || initialRecord?.patient,
            selectedFacility: detail.selectedFacility || prev?.selectedFacility || initialRecord?.selectedFacility,
            escalation: detail.escalation || prev?.escalation || initialRecord?.escalation
          }));
        } else {
          const detail = payload?.data?.case || payload?.data;
          if (!detail || (!detail.caseId && !detail._id)) {
            setState({ loading: false, error: 'Case details are unavailable.' });
            return;
          }
          setRecord(prev => ({
            ...(initialRecord || {}),
            ...(prev || {}),
            ...detail,
            documents: payload?.data?.documents || detail.documents || prev?.documents || [],
            patient: detail.patient || prev?.patient || initialRecord?.patient,
            assignedHealthCenter: detail.assignedHealthCenter || prev?.assignedHealthCenter || initialRecord?.assignedHealthCenter
          }));
          if (payload?.data?.referral) {
            setCreatedReferral(payload.data.referral);
          } else if (detail.referralId) {
            try {
              const refRes = await apiRequest(`/api/referrals/${encodeURIComponent(detail.referralId)}`);
              if (refRes?.data && active) setCreatedReferral(refRes.data);
            } catch (_) {}
          }
        }
        setState({ loading: false, error: '' });
      } catch (error) {
        if (active) setState({ loading: false, error: error.message || 'Unable to load case details.' });
      }
    }

    loadRecord();
    return () => { active = false; };
  }, [caseId, kind]);

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
        if (!coordinates) throw new Error('Location could not be resolved for this case. Please verify the patient\'s village or location to find suitable referral facilities.');
        setReferralCoordinates(coordinates);
        const query = new URLSearchParams({
          latitude: String(coordinates.latitude),
          longitude: String(coordinates.longitude)
        });
        if (kind === 'emergency') query.set('emergency', 'true');

        const excludedIds = new Set();
        if (assignedHealthCentre?.healthCenterId) excludedIds.add(assignedHealthCentre.healthCenterId);
        if (record?.assignedHealthCenterId) excludedIds.add(String(record.assignedHealthCenterId));
        if (record?.assignedHealthCenter?.healthCenterId) excludedIds.add(record.assignedHealthCenter.healthCenterId);
        if (record?.sourceHealthCenterId) excludedIds.add(String(record.sourceHealthCenterId));
        if (record?.escalatedFromHealthCenterId) excludedIds.add(String(record.escalatedFromHealthCenterId));
        if (record?.escalatedFromHealthCenter?.healthCenterId) excludedIds.add(record.escalatedFromHealthCenter.healthCenterId);
        if (Array.isArray(record?.escalationHistory)) {
          record.escalationHistory.forEach(h => {
            if (h.escalatedFromHealthCenterId) excludedIds.add(String(h.escalatedFromHealthCenterId));
            if (h.escalatedToHealthCenterId) excludedIds.add(String(h.escalatedToHealthCenterId));
          });
        }
        if (user?.healthCenterId) excludedIds.add(user.healthCenterId);

        if (excludedIds.size > 0) {
          query.set('exclude', Array.from(excludedIds).join(','));
        }

        const payload = await apiRequest(`/api/health-centers/recommend?${query.toString()}`);
        if (!active) return;
        const sourceId = assignedHealthCentre?.healthCenterId;
        const rawRec = payload?.data?.recommendation || null;
        const recommendation = rawRec && !excludedIds.has(rawRec.healthCenterId) ? rawRec : null;
        setReferralRecommendation(recommendation);
        const facilities = Array.isArray(payload?.data?.facilities)
          ? payload.data.facilities.filter(facility => !excludedIds.has(facility.healthCenterId)
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
            ? { acknowledgedBy: user?.username || user?.name || 'Health Worker' }
            : {
              healthCenterId: user?.healthCenterId || assignedHealthCentre?.healthCenterId,
              healthWorkerId: user?.username || user?.name || 'Health Worker'
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

  async function resolve() {
    setResolveAction({ loading: true, error: '', success: '' });
    try {
      const payload = await apiRequest(
        `/api/${kind === 'emergency' ? 'emergency' : 'cases'}/${encodeURIComponent(caseId)}/resolve`,
        {
          method: 'POST',
          body: JSON.stringify({})
        }
      );
      const detail = payload?.data;
      if (!detail) throw new Error('Resolution response was incomplete.');
      setRecord(current => ({
        ...(current || {}),
        ...(kind === 'emergency' ? detail.emergency : detail.case),
        patient: detail.patient || current?.patient,
        selectedFacility: detail.selectedFacility || current?.selectedFacility,
        escalation: detail.escalation || current?.escalation
      }));
      setResolveAction({ loading: false, error: '', success: 'Case resolved successfully.' });
    } catch (error) {
      setResolveAction({ loading: false, error: error.message || 'Unable to resolve case.', success: '' });
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
      if (kind === 'emergency') {
        setRecord(current => ({
          ...(current || {}),
          status: 'ALERTED',
          assignedHealthCenterId: selectedDestination,
          referredFacilityId: selectedDestination,
          assignedHealthCenter: { healthCenterId: selectedDestination, name: selectedDestination },
          referralId: payload.data.referralId,
          referredToHealthCenterId: payload.data.toHealthCenterId,
          referredAt: payload.data.createdAt || current?.referredAt,
          emergencyEscalationDueAt: new Date(Date.now() + 5 * 60 * 1000)
        }));
        setSlaExpired(false);
        setReferralAction({ loading: false, error: '', success: 'Emergency referred successfully. Ownership transferred.' });
      } else {
        setRecord(current => ({
          ...(current || {}),
          status: 'REFERRED',
          referralId: payload.data.referralId,
          referredToHealthCenterId: payload.data.toHealthCenterId,
          referredAt: payload.data.createdAt || current?.referredAt
        }));
        setReferralAction({ loading: false, error: '', success: 'Referral created successfully.' });
      }
      setReferralStatusAction({ loading: false, error: '', success: '' });
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
      if (status === 'ACCEPTED') {
        setRecord(current => ({
          ...(current || {}),
          status: 'IN_PROGRESS',
          assignedHealthCenterId: payload.data.toHealthCenterId
        }));
      }
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
  const assignedHealthCenterCode = record?.assignedHealthCenter?.healthCenterId
    || assignedHealthCentre?.healthCenterId
    || centre?.healthCenterId
    || null;
  const isActionableForCentre = !user?.healthCenterId || !assignedHealthCenterCode || (user.healthCenterId === assignedHealthCenterCode);
  const isSlaExpired = slaExpired || Boolean(record?.emergencyEscalationDueAt && new Date(record.emergencyEscalationDueAt).getTime() <= Date.now());
  const canAcknowledgeEmergency = ['ALERTED', 'REGISTERED', 'ESCALATED', 'NEW', 'ASSIGNED'].includes(record?.status)
    && !record?.acknowledgedAt
    && isActionableForCentre
    && !isSlaExpired;
  const canAcknowledge = ['NEW', 'ASSIGNED'].includes(record?.status);
  const canEscalate = record?.escalationEligible === true;

  return (
    <section className="details-page" aria-labelledby="details-title">
      <Link className="back-link" to="/worker">Back to dashboard</Link>
      {state.loading && <p className="data-state">Loading case details...</p>}
      {!state.loading && state.error && <p className="data-state data-state-error">{state.error}</p>}
      {!state.loading && !state.error && !record && (
        <p className="data-state data-state-error">Case details are unavailable.</p>
      )}
      {!state.loading && !state.error && record && (
        <>
          {kind === 'emergency' ? (
            <div style={{
              position: 'relative',
              background: '#041014',
              borderRadius: '16px',
              overflow: 'hidden',
              marginBottom: '2.5rem',
              boxShadow: '0 20px 45px rgba(220, 38, 38, 0.28), 0 0 0 1px rgba(239, 68, 68, 0.35)',
              color: '#fff'
            }}>
              {/* Luminous Emergency Active Strip */}
              <div style={{
                height: '5px',
                width: '100%',
                background: 'linear-gradient(90deg, #ef4444 0%, #f97316 50%, #ef4444 100%)',
                boxShadow: '0 0 16px #ef4444'
              }} />

              <div style={{ padding: '2rem 2.25rem' }}>
                {/* Header Row: Incident Identification & Prominent Emergency Action */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1.5rem',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  paddingBottom: '1.75rem',
                  marginBottom: '1.75rem'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        background: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid rgba(239, 68, 68, 0.6)',
                        color: '#fca5a5',
                        padding: '0.3rem 0.75rem',
                        borderRadius: '999px',
                        fontSize: '0.78rem',
                        fontWeight: 900,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase'
                      }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444' }} />
                        CRITICAL EMERGENCY
                      </span>
                      <span style={{
                        background: '#dc2626',
                        color: '#ffffff',
                        padding: '0.3rem 0.8rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 900,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase'
                      }}>
                        {record.status || 'ALERTED'}
                      </span>
                    </div>

                    <h1 style={{
                      margin: 0,
                      fontSize: '2.15rem',
                      fontWeight: 900,
                      letterSpacing: '-0.02em',
                      color: '#ffffff'
                    }}>
                      Emergency Response
                    </h1>

                    <p style={{ margin: '0.4rem 0 0', color: 'var(--teal)', fontSize: '1.05rem', fontWeight: 700 }}>
                      Case {record.caseId} &middot; {centre?.name || record.assignedHealthCenter?.name || 'Assigned Centre'}
                    </p>
                  </div>

                  {/* PROMINENT EMERGENCY ACTION & COUNTDOWN HUD */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.25rem',
                    flexWrap: 'wrap',
                    background: 'rgba(255, 255, 255, 0.04)',
                    padding: '0.85rem 1.25rem',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.08)'
                  }}>
                    {['ALERTED', 'REGISTERED', 'NEW', 'ASSIGNED', 'ESCALATED'].includes(record.status) && !record.acknowledgedAt && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fca5a5', fontWeight: 800 }}>
                          5-Min SLA Remaining
                        </div>
                        <EmergencyCountdown
                          dueAt={record.emergencyEscalationDueAt}
                          createdAt={record.createdAt}
                          onExpire={() => setSlaExpired(true)}
                          style={{ fontSize: '1.75rem', color: '#ffffff' }}
                        />
                      </div>
                    )}

                    {canAcknowledgeEmergency ? (
                      <button
                        type="button"
                        onClick={acknowledge}
                        disabled={acknowledgement.loading}
                        style={{
                          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                          color: '#ffffff',
                          border: '2px solid rgba(255, 255, 255, 0.35)',
                          padding: '0.95rem 2.2rem',
                          borderRadius: '10px',
                          fontWeight: 900,
                          fontSize: '1.1rem',
                          letterSpacing: '0.02em',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.65rem',
                          boxShadow: '0 0 24px rgba(239, 68, 68, 0.65), 0 6px 16px rgba(0,0,0,0.3)',
                          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                          textTransform: 'uppercase'
                        }}
                      >
                        <span style={{ fontSize: '1.35rem' }}>🚨</span>
                        <span>{acknowledgement.loading ? 'Acknowledging...' : 'Acknowledge Emergency'}</span>
                      </button>
                    ) : (
                      ['ALERTED', 'REGISTERED', 'ESCALATED', 'NEW', 'ASSIGNED'].includes(record.status) && !record.acknowledgedAt && (
                        !isActionableForCentre ? (
                          <span style={{ color: '#94a3b8', fontWeight: 800, fontSize: '0.9rem', padding: '0.75rem 1.4rem', background: 'rgba(255,255,255,0.06)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)' }}>
                            Assigned to {assignedHealthCenterCode || 'another facility'}
                          </span>
                        ) : (
                          <span style={{ color: '#fca5a5', fontWeight: 800, fontSize: '0.9rem', padding: '0.75rem 1.4rem', background: 'rgba(239,68,68,0.15)', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.3)' }}>
                            SLA Expired — Escalated
                          </span>
                        )
                      )
                    )}

                    {['ACKNOWLEDGED', 'RESPONDING', 'UNDER_REVIEW', 'IN_PROGRESS'].includes(record.status) && record.status !== 'RESOLVED' && (
                      <button
                        type="button"
                        onClick={resolve}
                        disabled={resolveAction.loading}
                        style={{
                          background: 'linear-gradient(135deg, #24a77b 0%, #15803d 100%)',
                          color: '#ffffff',
                          border: '2px solid rgba(255, 255, 255, 0.3)',
                          padding: '0.95rem 2rem',
                          borderRadius: '10px',
                          fontWeight: 900,
                          fontSize: '1.05rem',
                          letterSpacing: '0.02em',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          boxShadow: '0 0 20px rgba(36, 167, 123, 0.5)',
                          textTransform: 'uppercase'
                        }}
                      >
                        <span style={{ fontSize: '1.25rem' }}>✓</span>
                        <span>{resolveAction.loading ? 'Resolving...' : 'Resolve Emergency'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Status banner if already acknowledged */}
                {record.acknowledgedAt && (
                  <div style={{
                    background: 'rgba(36, 167, 123, 0.12)',
                    border: '1px solid rgba(36, 167, 123, 0.45)',
                    borderRadius: '12px',
                    padding: '1.15rem 1.6rem',
                    marginBottom: '1.75rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem'
                  }}>
                    <div>
                      <h3 style={{ margin: '0 0 0.3rem', color: '#34d399', fontSize: '1.2rem', fontWeight: 800 }}>
                        ✓ Emergency Response Active
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.92rem', color: '#cbd5e1' }}>
                        Acknowledged by: <strong style={{ color: '#fff' }}>{record.acknowledgedBy || record.acknowledgedByWorkerId || 'Health Worker'}</strong> &middot; Time: <strong style={{ color: '#fff' }}>{formatDate(record.acknowledgedAt)}</strong>
                      </p>
                    </div>
                    {record.status === 'RESOLVED' && (
                      <span style={{ background: '#24a77b', color: '#fff', padding: '0.4rem 0.9rem', borderRadius: '6px', fontWeight: 900, fontSize: '0.85rem' }}>
                        RESOLVED
                      </span>
                    )}
                  </div>
                )}

                {/* Escalation Route Track if escalated */}
                {(record.escalationStatus === 'ESCALATED' || record.status === 'ESCALATED' || (record.escalationLevel && record.escalationLevel > 0)) && (
                  <div style={{
                    background: 'rgba(249, 115, 22, 0.12)',
                    border: '1px solid rgba(249, 115, 22, 0.45)',
                    borderRadius: '12px',
                    padding: '1.25rem 1.6rem',
                    marginBottom: '1.75rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '1.3rem' }}>⚠️</span>
                      <strong style={{ fontSize: '1.15rem', color: '#fb923c', letterSpacing: '-0.01em' }}>
                        Escalated Incident — Level {record.escalationLevel || 1}
                      </strong>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', fontSize: '0.92rem' }}>
                      <div>
                        <span style={{ opacity: 0.75, fontSize: '0.8rem', textTransform: 'uppercase', display: 'block', marginBottom: '0.2rem' }}>Origin Centre</span>
                        <strong style={{ color: '#fff' }}>{record.escalatedFromHealthCenter?.name || record.escalatedFromHealthCenterId || 'Original Health Centre'}</strong>
                      </div>
                      <div>
                        <span style={{ opacity: 0.75, fontSize: '0.8rem', textTransform: 'uppercase', display: 'block', marginBottom: '0.2rem' }}>Current Assignment</span>
                        <strong style={{ color: '#fff' }}>{centre?.name || record.assignedHealthCenter?.name || 'Current Centre'}</strong>
                      </div>
                      <div>
                        <span style={{ opacity: 0.75, fontSize: '0.8rem', textTransform: 'uppercase', display: 'block', marginBottom: '0.2rem' }}>Escalation Time</span>
                        <strong style={{ color: '#fff' }}>{record.escalatedAt ? formatDate(record.escalatedAt) : 'Recent'}</strong>
                      </div>
                      <div>
                        <span style={{ opacity: 0.75, fontSize: '0.8rem', textTransform: 'uppercase', display: 'block', marginBottom: '0.2rem' }}>Escalation Trigger</span>
                        <strong style={{ color: '#fca5a5' }}>{record.escalationReason || '5-minute SLA breach without worker acknowledgement'}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Telemetry Summary Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1.25rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  padding: '1.35rem',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.06)'
                }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Patient Profile</span>
                    <strong style={{ fontSize: '1.2rem', color: '#fff' }}>{record.patient?.name || 'Unknown Patient'}</strong>
                    <div style={{ fontSize: '0.88rem', color: '#cbd5e1', marginTop: '0.25rem' }}>
                      {record.patient?.phone} {record.patient?.age ? `• ${record.patient.age} yrs` : ''} {record.patient?.gender ? `• ${record.patient.gender}` : ''}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Location / Coordinates</span>
                    <strong style={{ fontSize: '1.1rem', color: '#fff' }}>{locationLabel(record)}</strong>
                    {record.location?.latitude !== undefined && (
                      <div style={{ fontSize: '0.82rem', color: 'var(--teal)', marginTop: '0.25rem', fontFamily: 'monospace' }}>
                        {Number(record.location.latitude).toFixed(4)}, {Number(record.location.longitude).toFixed(4)}
                      </div>
                    )}
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Clinical Reason</span>
                    <strong style={{ fontSize: '1.1rem', color: '#fca5a5' }}>{description || 'Emergency Medical Care'}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Ingestion Source</span>
                    <strong style={{ fontSize: '1.1rem', color: '#fff' }}>{record.source || 'Emergency Call'}</strong>
                  </div>
                </div>

                {/* Feedback notifications */}
                {acknowledgement.success && <p className="action-message action-message-success" style={{ marginTop: '1.25rem' }} role="status">{acknowledgement.success}</p>}
                {acknowledgement.error && <p className="action-message action-message-error" style={{ marginTop: '1.25rem' }} role="alert">{acknowledgement.error}</p>}
                {resolveAction.success && <p className="action-message action-message-success" style={{ marginTop: '1.25rem' }} role="status">{resolveAction.success}</p>}
                {resolveAction.error && <p className="action-message action-message-error" style={{ marginTop: '1.25rem' }} role="alert">{resolveAction.error}</p>}
              </div>
            </div>
          ) : (
            <div className="care-workspace-header">
              <p className="eyebrow">Normal case workspace</p>
              <div className="details-heading">
                <div>
                  <h1 id="details-title">{record.patient?.name || 'Unknown Patient'}</h1>
                  <p className="intro">
                    {valueOrFallback(record.caseId)} &middot; {record.status} &middot; {centre?.name || 'Unassigned'}
                  </p>
                </div>
                {record.priority && <span className="priority-badge critical">{record.priority}</span>}
              </div>
              
              {(canAcknowledge || canEscalate || ['ACKNOWLEDGED', 'UNDER_REVIEW', 'IN_PROGRESS', 'REFERRED'].includes(record.status)) && (
                <div className="action-bar">
                  {canAcknowledge && <button className="action-button" disabled={acknowledgement.loading} onClick={acknowledge} type="button">
                    {acknowledgement.loading ? 'Acknowledging...' : 'Acknowledge case'}
                  </button>}
                  {canEscalate && <button className="action-button action-button-secondary" disabled={escalationAction.loading} onClick={escalate} type="button">
                    {escalationAction.loading ? 'Escalating...' : 'Escalate case'}
                  </button>}
                  {['ACKNOWLEDGED', 'UNDER_REVIEW', 'IN_PROGRESS', 'REFERRED'].includes(record.status) && (
                    <button className="action-button" style={{ background: '#24a77b' }} disabled={resolveAction.loading} onClick={resolve} type="button">
                      {resolveAction.loading ? 'Resolving...' : 'Resolve case'}
                    </button>
                  )}
                </div>
              )}
              
              {acknowledgement.success && <p className="action-message action-message-success" role="status">{acknowledgement.success}</p>}
              {acknowledgement.error && <p className="action-message action-message-error" role="alert">{acknowledgement.error}</p>}
              {escalationAction.success && <p className="action-message action-message-success" role="status">{escalationAction.success}</p>}
              {escalationAction.error && <p className="action-message action-message-error" role="alert">{escalationAction.error}</p>}
              {resolveAction.success && <p className="action-message action-message-success" role="status">{resolveAction.success}</p>}
              {resolveAction.error && <p className="action-message action-message-error" role="alert">{resolveAction.error}</p>}
            </div>
          )}

          <div className="care-workspace-grid">
            <section className="details-panel" aria-labelledby="case-information-heading">
              <h2 id="case-information-heading">Patient & Case Info</h2>
              <dl className="details-grid">
                <DetailField label="Patient Name" value={record.patient?.name} />
                <DetailField label="Patient ID" value={record.patient?.patientId || (record.patient?._id ? `PT-${String(record.patient._id).slice(-6).toUpperCase()}` : undefined)} />
                <DetailField label="Age / Gender" value={record.patient?.age && record.patient?.gender ? `${record.patient.age} / ${record.patient.gender}` : (record.patient?.age || record.patient?.gender || 'Not available')} />
                <DetailField label="Phone" value={record.patient?.phone} />
                <DetailField label="Location" value={locationLabel(record)} />
                <DetailField label="Preferred Language" value={record.patient?.language} />
                <DetailField label={kind === 'emergency' ? 'Reason' : 'Complaint'} value={description || record.complaint} />
                <DetailField label="Symptoms" value={record.symptoms || record.patient?.symptomsDescription || record.complaint} />
                <DetailField label="Source" value={record.source} />
                <DetailField label="Assigned Health Centre" value={centre?.name ? `${centre.name} (${centre.healthCenterId || 'HC'})` : (assignedHealthCentre?.name || 'Not available')} />
                <DetailField label="Priority / Risk" value={record.priority || record.risk || 'NORMAL'} />
              </dl>
            </section>
            
            <section className="details-panel" aria-labelledby="care-timeline-heading">
              <h2 id="care-timeline-heading">Care Timeline</h2>
              <ul className="care-timeline">
                <li className="timeline-step completed">
                  <strong>Registered</strong>
                  <span>{formatDate(record.createdAt)}</span>
                </li>
                <li className={`timeline-step ${record.status !== 'NEW' ? 'completed' : 'pending'}`}>
                  <strong>Assigned</strong>
                  <span>{['NEW'].includes(record.status) ? 'Pending' : 'Completed'}</span>
                </li>
                <li className={`timeline-step ${['ACKNOWLEDGED', 'UNDER_REVIEW', 'IN_PROGRESS', 'REFERRED', 'RESOLVED'].includes(record.status) ? 'completed' : 'pending'}`}>
                  <strong>Acknowledged</strong>
                  <span>{record.acknowledgedAt ? formatDate(record.acknowledgedAt) : 'Pending'}</span>
                </li>
                <li className={`timeline-step ${record.status === 'RESOLVED' ? 'completed' : 'pending'}`}>
                  <strong>Resolved</strong>
                  <span>{record.resolvedAt ? formatDate(record.resolvedAt) : 'Pending'}</span>
                </li>
              </ul>
            </section>
          </div>

          <section className="details-panel care-notes-panel" aria-labelledby="care-notes-heading">
            <div className="clinical-review-heading">
              <div>
                <h2 id="care-notes-heading">Care / Consultation</h2>
                <p className="local-only-label">Consultation persistence not yet connected to backend API.</p>
              </div>
            </div>
            <div className="document-field" style={{ marginTop: '.85rem' }}>
              <span>Clinical notes (Local only)</span>
              <textarea placeholder="Record consultation notes, diagnosis, or care plan..." disabled />
            </div>
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
            <h2 id="document-intelligence-heading">Document Intelligence / Patient Documents</h2>
            {record?.documents && record.documents.length > 0 && (
              <div className="existing-documents" style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.75rem' }}>Existing Documents</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {record.documents.map((doc, idx) => {
                    const fileName = doc.originalFileName || doc.fileName || `document_${idx + 1}`;
                    const docType = doc.documentType === 'MEDICAL_REPORT'
                      ? 'Medical Report'
                      : doc.documentType === 'PATIENT_REGISTRATION'
                      ? 'Patient Registration'
                      : (doc.documentType || 'Patient Document');
                    const status = doc.extractionStatus === 'FAILED'
                      ? 'STORED (Extraction Failed)'
                      : (doc.extractionStatus || 'STORED');

                    const extractedEntries = doc.extractedData && typeof doc.extractedData === 'object'
                      ? Object.entries(doc.extractedData).filter(([k, v]) => {
                          if (v === null || v === undefined) return false;
                          if (typeof v === 'object' && (v.value === null || v.value === undefined || v.value === '')) return false;
                          return true;
                        })
                      : [];

                    return (
                      <div
                        key={doc._id || idx}
                        style={{
                          padding: '1rem',
                          border: '1px solid #e2e8f0',
                          borderRadius: '0.5rem',
                          background: '#f8fafc'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '1.25rem' }}>📄</span>
                          <strong style={{ fontSize: '1rem', color: '#1e293b' }}>{fileName}</strong>
                        </div>
                        <dl className="details-grid">
                          <DetailField label="Type" value={docType} />
                          <DetailField label="Status" value={status} />
                          <DetailField label="Uploaded" value={formatDate(doc.createdAt)} />
                        </dl>
                        {doc.extractionStatus === 'FAILED' && (
                          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#64748b' }}>
                            Document is stored. Automatic text extraction was not successful.
                          </p>
                        )}
                        {extractedEntries.length > 0 && doc.extractionStatus !== 'FAILED' && (
                          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
                            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569', marginBottom: '0.5rem' }}>
                              Extracted Information
                            </h4>
                            <dl className="details-grid">
                              {extractedEntries.map(([key, val]) => {
                                const renderedVal = typeof val === 'object' && val !== null ? val.value : val;
                                if (renderedVal === null || renderedVal === undefined || renderedVal === '') return null;
                                return (
                                  <DetailField key={key} label={key} value={String(renderedVal)} />
                                );
                              })}
                            </dl>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
                      if (!record?.referralId && record?.status !== 'REFERRED') {
                        setCreatedReferral(null);
                      }
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
                      if (!record?.referralId && record?.status !== 'REFERRED') {
                        setCreatedReferral(null);
                      }
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
                          {referralAction.loading ? (kind === 'emergency' ? 'Referring emergency...' : 'Creating referral...') : (kind === 'emergency' ? 'Refer emergency' : 'Create referral')}
                        </button>
                      </div>
                    )}
                    {referralAction.success && <p className="action-message action-message-success" role="status">{referralAction.success}</p>}
                    {referralAction.error && <p className="action-message action-message-error" role="alert">{referralAction.error}</p>}
                  </div>
                )}
                {createdReferral && (
                  <div className="created-referral" style={{ marginTop: '1.5rem' }}>
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
                    <ReferralSlaDisplay referral={createdReferral} />
                    {referralTransitions[createdReferral.status]?.length > 0 && (
                      <div className="referral-status-actions">
                        <p className="decision-label">Update referral status</p>
                        {referralTransitions[createdReferral.status].map(status => {
                          // Role-based logic for referral actions
                          // Source health centre should NOT be able to 'ACCEPT' a referral it created.
                          // Only Destination health centre can 'ACCEPT' or 'COMPLETE'.
                          const isSource = user?.healthCenterId === createdReferral.fromHealthCenterId;
                          const isDestination = user?.healthCenterId === createdReferral.toHealthCenterId;
                          
                          if (status === 'ACCEPTED' && !isDestination) return null;
                          if (status === 'COMPLETED' && !isDestination) return null;
                          
                          return (
                            <button
                              className="decision-button"
                              disabled={referralStatusAction.loading}
                              key={status}
                              onClick={() => updateReferralStatus(status)}
                              type="button"
                            >
                              {referralStatusAction.loading ? 'Updating...' : `Mark ${status}`}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {referralStatusAction.success && <p className="action-message action-message-success" role="status">{referralStatusAction.success}</p>}
                    {referralStatusAction.error && <p className="action-message action-message-error" role="alert">{referralStatusAction.error}</p>}
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