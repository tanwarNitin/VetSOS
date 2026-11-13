import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { socket } from './socket';

const farmerIcon = L.divIcon({
  className: 'custom-div-icon',
  html: '<div style="background-color: #dc2626; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 2px rgba(0,0,0,0.4);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  popupAnchor: [0, -7]
});

function getVetIcon(onDuty) {
  const color = onDuty ? '#16a34a' : '#6b7280';
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 2px rgba(0,0,0,0.4);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -7]
  });
}

export default function App() {
  const [user, setUser] = useState(null); // { role: 'Farmer' | 'Vet', name: '', phone: '' }
  const [roleInput, setRoleInput] = useState('Farmer');
  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');

  // Farmer state
  const [vets, setVets] = useState([]);
  const [farmerForm, setFarmerForm] = useState({
    animal: 'Cow',
    issue: 'Fever',
    village: 'Jaipur',
    description: ''
  });
  const [currentSos, setCurrentSos] = useState(null);
  const [farmerError, setFarmerError] = useState('');

  // Map refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const vetMarkersRef = useRef({});
  const circleRef = useRef(null);

  // Vet state
  const [sosList, setSosList] = useState([]);
  const [errorMap, setErrorMap] = useState({});

  // Fetch vets on mount
  useEffect(() => {
    fetch('/api/vets')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setVets(data);
      })
      .catch((err) => console.error('Error fetching vets:', err));
  }, []);

  // Fetch all SOS on mount and keep updated
  useEffect(() => {
    fetch('/api/sos')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setSosList(data);
      })
      .catch((err) => console.error('Error fetching SOS list:', err));
  }, [user]);

  // Socket.io listener for live updates
  useEffect(() => {
    function handleSosCreated(newSos) {
      setSosList((prev) => {
        const id = newSos.id || newSos._id;
        const exists = prev.some((item) => (item.id || item._id) === id);
        if (exists) return prev;
        return [newSos, ...prev];
      });
    }

    function handleSosUpdated(updatedSos) {
      const updatedId = updatedSos.id || updatedSos._id;

      // Update SOS list
      setSosList((prev) =>
        prev.map((item) => ((item.id || item._id) === updatedId ? updatedSos : item))
      );

      // Update farmer's active SOS
      setCurrentSos((prev) => {
        if (prev && (prev.id || prev._id) === updatedId) {
          return updatedSos;
        }
        return prev;
      });
    }

    function handleVetUpdated(updatedVet) {
      const id = updatedVet.id || updatedVet._id;
      setVets((prev) =>
        prev.map((v) => ((v.id || v._id) === id ? updatedVet : v))
      );
    }

    socket.on('sos_created', handleSosCreated);
    socket.on('sos_updated', handleSosUpdated);
    socket.on('vet_updated', handleVetUpdated);

    return () => {
      socket.off('sos_created', handleSosCreated);
      socket.off('sos_updated', handleSosUpdated);
      socket.off('vet_updated', handleVetUpdated);
    };
  }, []);

  // Leaflet Map Initialization and Vet Marker Updates
  useEffect(() => {
    if (user?.role !== 'Farmer') return;
    if (!mapContainerRef.current) return;

    let map = mapInstanceRef.current;
    if (!map) {
      map = L.map(mapContainerRef.current).setView([26.9124, 75.7873], 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      // Farmer marker (red dot)
      L.marker([26.9124, 75.7873], { icon: farmerIcon })
        .addTo(map)
        .bindPopup('<strong>You (Farmer - Jaipur)</strong>');

      mapInstanceRef.current = map;
    }

    // Clear and redraw vet markers
    Object.values(vetMarkersRef.current).forEach((m) => m.remove());
    vetMarkersRef.current = {};

    vets.forEach((vet) => {
      if (vet.lat && vet.lng) {
        const marker = L.marker([vet.lat, vet.lng], {
          icon: getVetIcon(vet.onDuty)
        })
          .addTo(map)
          .bindPopup(
            `<strong>${vet.name}</strong><br/>Specialisation: ${vet.specialisation}<br/>Distance: ${vet.distanceKm} km`
          );

        const id = vet.id || vet._id;
        vetMarkersRef.current[id] = marker;
      }
    });
  }, [user?.role, vets]);

  // Clean up map when switching away from farmer view or unmounting
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        circleRef.current = null;
        vetMarkersRef.current = {};
      }
    };
  }, [user?.role]);

  // Handle radius circle updates
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (currentSos && currentSos.status === 'PENDING') {
      const radiusMeters = (currentSos.radiusKm || 10) * 1000;
      if (circleRef.current) {
        circleRef.current.setRadius(radiusMeters);
        if (!map.hasLayer(circleRef.current)) {
          circleRef.current.addTo(map);
        }
      } else {
        circleRef.current = L.circle([26.9124, 75.7873], {
          radius: radiusMeters,
          color: 'blue',
          fillOpacity: 0.1
        }).addTo(map);
      }
    } else {
      if (circleRef.current) {
        circleRef.current.remove();
        circleRef.current = null;
      }
    }
  }, [currentSos?.status, currentSos?.radiusKm]);

  // Pan to vet marker and open popup when vet card is clicked
  const handleVetCardClick = (vet) => {
    const map = mapInstanceRef.current;
    const id = vet.id || vet._id;
    const marker = vetMarkersRef.current[id];
    if (map && vet.lat && vet.lng) {
      map.setView([vet.lat, vet.lng], 13);
      if (marker) {
        marker.openPopup();
      }
    }
  };

  // Toggle on-duty for logged in vet
  const handleToggleDuty = async (vet) => {
    const id = vet.id || vet._id;
    try {
      const res = await fetch(`/api/vets/${id}/toggle-duty`, {
        method: 'POST'
      });
      if (res.ok) {
        const updated = await res.json();
        setVets((prev) =>
          prev.map((v) => ((v.id || v._id) === id ? updated : v))
        );
      }
    } catch (err) {
      console.error('Toggle duty error:', err);
    }
  };

  // Handle Home login
  const handleHomeContinue = (e) => {
    e.preventDefault();
    if (!nameInput.trim() || !phoneInput.trim()) return;
    setUser({
      role: roleInput,
      name: nameInput.trim(),
      phone: phoneInput.trim()
    });
  };

  // Farmer: Create SOS
  const handleCreateSos = async (e) => {
    e.preventDefault();
    setFarmerError('');
    try {
      const res = await fetch('/api/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farmerName: user.name,
          farmerPhone: user.phone,
          animal: farmerForm.animal,
          issue: farmerForm.issue,
          village: farmerForm.village,
          description: farmerForm.description
        })
      });
      if (!res.ok) {
        throw new Error('Failed to create SOS');
      }
      const data = await res.json();
      setCurrentSos(data);
    } catch (err) {
      setFarmerError(err.message);
    }
  };

  // Vet: Accept SOS
  const handleAccept = async (sos) => {
    const id = sos.id || sos._id;
    try {
      const res = await fetch(`/api/sos/${id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vetName: user.name })
      });

      if (res.status === 409) {
        setErrorMap((prev) => ({
          ...prev,
          [id]: 'Already accepted by another vet'
        }));
        return;
      }

      if (!res.ok) {
        const errorData = await res.json();
        setErrorMap((prev) => ({
          ...prev,
          [id]: errorData.error || 'Failed to accept'
        }));
        return;
      }

      const updated = await res.json();
      setErrorMap((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setSosList((prev) =>
        prev.map((item) => ((item.id || item._id) === id ? updated : item))
      );
    } catch (err) {
      console.error('Accept error:', err);
    }
  };

  // Vet: Start SOS
  const handleStart = async (sos) => {
    const id = sos.id || sos._id;
    try {
      const res = await fetch(`/api/sos/${id}/start`, {
        method: 'POST'
      });
      if (res.ok) {
        const updated = await res.json();
        setSosList((prev) =>
          prev.map((item) => ((item.id || item._id) === id ? updated : item))
        );
      }
    } catch (err) {
      console.error('Start error:', err);
    }
  };

  // Vet: Complete SOS
  const handleComplete = async (sos) => {
    const id = sos.id || sos._id;
    try {
      const res = await fetch(`/api/sos/${id}/complete`, {
        method: 'POST'
      });
      if (res.ok) {
        const updated = await res.json();
        setSosList((prev) =>
          prev.map((item) => ((item.id || item._id) === id ? updated : item))
        );
      }
    } catch (err) {
      console.error('Complete error:', err);
    }
  };

  // Farmer or Vet: Cancel SOS
  const handleCancelSos = async (sos) => {
    const id = sos.id || sos._id;
    try {
      const res = await fetch(`/api/sos/${id}/cancel`, {
        method: 'POST'
      });
      if (res.ok) {
        const updated = await res.json();
        setSosList((prev) =>
          prev.map((item) => ((item.id || item._id) === id ? updated : item))
        );
        setCurrentSos((prev) => {
          if (prev && (prev.id || prev._id) === id) {
            return updated;
          }
          return prev;
        });
      } else {
        const errorData = await res.json();
        console.error('Cancel error:', errorData.error);
      }
    } catch (err) {
      console.error('Cancel error:', err);
    }
  };

  // Compute stats from sosList
  const stats = {
    total: sosList.length,
    pending: sosList.filter((s) => s.status === 'PENDING').length,
    accepted: sosList.filter((s) => s.status === 'ACCEPTED').length,
    inProgress: sosList.filter((s) => s.status === 'IN_PROGRESS').length,
    completed: sosList.filter((s) => s.status === 'COMPLETED').length
  };

  // Filter active and completed SOS for Vet view
  const activeSosList = sosList.filter(
    (s) => s.status !== 'COMPLETED' && s.status !== 'CANCELLED'
  );
  const completedSosList = sosList
    .filter((s) => s.status === 'COMPLETED')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Find logged in vet if role is Vet
  const myVet =
    user?.role === 'Vet'
      ? vets.find((v) => v.name.toLowerCase() === user.name.toLowerCase())
      : null;

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>VetSOS Lite</h1>
        {user ? (
          <div className="user-badge">
            <span>
              {user.role}: <strong>{user.name}</strong> ({user.phone})
            </span>
            <button
              className="btn-link"
              onClick={() => {
                setUser(null);
                setCurrentSos(null);
                setErrorMap({});
              }}
            >
              Switch Role
            </button>
          </div>
        ) : null}
      </header>

      {!user ? (
        /* 1. Home View: Role selection + name + phone */
        <div className="card home-card">
          <h2>Welcome to VetSOS Lite</h2>
          <p className="subtitle">Select your role to continue</p>
          <form onSubmit={handleHomeContinue}>
            <div className="form-group">
              <label>Role</label>
              <div className="role-selector">
                <button
                  type="button"
                  className={`role-btn ${roleInput === 'Farmer' ? 'active' : ''}`}
                  onClick={() => setRoleInput('Farmer')}
                >
                  Farmer
                </button>
                <button
                  type="button"
                  className={`role-btn ${roleInput === 'Vet' ? 'active' : ''}`}
                  onClick={() => setRoleInput('Vet')}
                >
                  Vet
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="name-input">Your Name</label>
              <input
                id="name-input"
                type="text"
                placeholder={roleInput === 'Farmer' ? 'e.g. Raju' : 'e.g. Dr. Ramesh Yadav'}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="phone-input">Phone Number</label>
              <input
                id="phone-input"
                type="tel"
                placeholder="e.g. 9810000010"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block">
              Continue
            </button>
          </form>
        </div>
      ) : (
        <>
          {/* New Feature 1: Stats Bar shown at top of both Farmer and Vet views */}
          <div className="card stats-card">
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-label">Total</div>
                <div className="stat-value">{stats.total}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Pending</div>
                <div className="stat-value stat-pending">{stats.pending}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Accepted</div>
                <div className="stat-value stat-accepted">{stats.accepted}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">In Progress</div>
                <div className="stat-value stat-inprogress">{stats.inProgress}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Completed</div>
                <div className="stat-value stat-completed">{stats.completed}</div>
              </div>
            </div>
          </div>

          {user.role === 'Farmer' ? (
            /* 2. Farmer View */
            <div className="farmer-view">
              {/* SOS Request Form */}
              <div className="card sos-form-card">
                <h3>Emergency Animal SOS</h3>
                {farmerError && <div className="error-banner">{farmerError}</div>}
                <form onSubmit={handleCreateSos}>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="farmer-name">Farmer Name</label>
                      <input
                        id="farmer-name"
                        type="text"
                        value={user.name}
                        readOnly
                        className="input-readonly"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="farmer-phone">Farmer Phone</label>
                      <input
                        id="farmer-phone"
                        type="text"
                        value={user.phone}
                        readOnly
                        className="input-readonly"
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="animal-select">Animal</label>
                      <select
                        id="animal-select"
                        value={farmerForm.animal}
                        onChange={(e) =>
                          setFarmerForm({ ...farmerForm, animal: e.target.value })
                        }
                      >
                        <option value="Cow">Cow</option>
                        <option value="Buffalo">Buffalo</option>
                        <option value="Goat">Goat</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="issue-select">Issue</label>
                      <select
                        id="issue-select"
                        value={farmerForm.issue}
                        onChange={(e) =>
                          setFarmerForm({ ...farmerForm, issue: e.target.value })
                        }
                      >
                        <option value="Fever">Fever</option>
                        <option value="Injury">Injury</option>
                        <option value="Delivery">Delivery</option>
                        <option value="Not eating">Not eating</option>
                        <option value="Bloat">Bloat</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="village-input">Village</label>
                    <input
                      id="village-input"
                      type="text"
                      value={farmerForm.village}
                      onChange={(e) =>
                        setFarmerForm({ ...farmerForm, village: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="desc-input">Description</label>
                    <textarea
                      id="desc-input"
                      rows="3"
                      placeholder="Describe the condition (e.g. Cow has fever since morning)"
                      value={farmerForm.description}
                      onChange={(e) =>
                        setFarmerForm({ ...farmerForm, description: e.target.value })
                      }
                      required
                    />
                  </div>

                  <button type="submit" className="btn btn-danger btn-block">
                    Create SOS
                  </button>
                </form>
              </div>

              {/* Active SOS Tracking Card (if an SOS has been created) */}
              {currentSos && (
                <>
                  <div className="card tracking-card">
                    <h3>Active SOS Tracking</h3>
                    <div className="tracking-grid">
                      <div>
                        <strong>Status:</strong>{' '}
                        <span className={`badge badge-${currentSos.status.toLowerCase()}`}>
                          {currentSos.status}
                        </span>
                      </div>
                      <div>
                        <strong>Search Radius:</strong> {currentSos.radiusKm} km
                      </div>
                      <div>
                        <strong>Accepted By:</strong>{' '}
                        {currentSos.acceptedBy ? currentSos.acceptedBy : 'None'}
                      </div>
                    </div>

                    <div className="tracking-live-box">
                      {currentSos.status === 'PENDING' && (
                        <p className="pulse-text">
                          Searching within {currentSos.radiusKm} km
                        </p>
                      )}
                      {currentSos.status === 'ACCEPTED' && (
                        <p className="success-text">
                          Accepted by {currentSos.acceptedBy}. Vet will arrive soon.
                        </p>
                      )}
                      {currentSos.status === 'IN_PROGRESS' && (
                        <p className="info-text">
                          Treatment in progress by {currentSos.acceptedBy}.
                        </p>
                      )}
                      {currentSos.status === 'COMPLETED' && (
                        <p className="completed-text">
                          Case completed by {currentSos.acceptedBy}.
                        </p>
                      )}
                      {currentSos.status === 'CANCELLED' && (
                        <p className="cancel-text">
                          SOS cancelled.
                        </p>
                      )}
                    </div>

                    {(currentSos.status === 'PENDING' || currentSos.status === 'ACCEPTED') && (
                      <div style={{ marginTop: '16px' }}>
                        <button
                          type="button"
                          className="btn btn-outline-danger"
                          onClick={() => handleCancelSos(currentSos)}
                        >
                          Cancel SOS
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Status Timeline */}
                  {currentSos.status !== 'CANCELLED' && (
                    <div className="card timeline-card">
                      <h3>Status Timeline</h3>
                      <div className="timeline-container">
                        {['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].map((step, idx) => {
                          const stepOrder = ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED'];
                          const currentIndex = stepOrder.indexOf(currentSos.status);
                          let stepClass = 'timeline-future';
                          if (currentSos.status === 'COMPLETED') {
                            stepClass = 'timeline-completed';
                          } else if (idx < currentIndex) {
                            stepClass = 'timeline-completed';
                          } else if (idx === currentIndex) {
                            stepClass = 'timeline-current';
                          }

                          return (
                            <React.Fragment key={step}>
                              <div className={`timeline-step ${stepClass}`}>
                                <span className="timeline-node"></span>
                                <span className="timeline-text">{step}</span>
                              </div>
                              {idx < 3 && <span className="timeline-arrow">→</span>}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Leaflet Map */}
              <div ref={mapContainerRef} className="farmer-map"></div>

              {/* Nearby Vets Section */}
              <div className="card vets-card">
                <h3>Nearby Veterinarians</h3>
                <div className="vets-list">
                  {vets.length === 0 ? (
                    <p>Loading vets...</p>
                  ) : (
                    vets.map((v) => (
                      <div
                        key={v.id || v._id}
                        className="vet-item vet-item-clickable"
                        onClick={() => handleVetCardClick(v)}
                        title="Click to view on map"
                      >
                        <div className="vet-name">{v.name}</div>
                        <div className="vet-details">
                          <span><strong>Specialisation:</strong> {v.specialisation}</span>
                          <span><strong>Village:</strong> {v.village}</span>
                          <span><strong>Distance:</strong> {v.distanceKm} km</span>
                          <span className={`status-pill ${v.onDuty ? 'on-duty' : 'off-duty'}`}>
                            {v.onDuty ? 'On Duty' : 'Off Duty'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* 3. Vet View */
            <div className="vet-view">
              {/* New Feature 3: On-duty toggle for the logged-in vet */}
              {myVet && (
                <div className="card vet-duty-card">
                  <div className="vet-duty-row">
                    <div>
                      <span className="duty-vet-name">{myVet.name}</span>
                      <span className="duty-vet-meta">
                        {myVet.specialisation} | {myVet.village}
                      </span>
                    </div>
                    <div className="duty-toggle-action">
                      <span className="duty-indicator-text">
                        Current Duty:{' '}
                        <strong className={myVet.onDuty ? 'text-green' : 'text-grey'}>
                          {myVet.onDuty ? 'On Duty' : 'Off Duty'}
                        </strong>
                      </span>
                      <button
                        className={`btn ${myVet.onDuty ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => handleToggleDuty(myVet)}
                      >
                        {myVet.onDuty ? 'On Duty' : 'Off Duty'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="feed-header">
                <h2>Live SOS Emergency Feed</h2>
                <span className="live-indicator">LIVE</span>
              </div>

              {activeSosList.length === 0 ? (
                <div className="card empty-card">
                  <p>No active SOS emergency requests at the moment.</p>
                </div>
              ) : (
                <div className="sos-feed-grid">
                  {activeSosList.map((sos) => {
                    const id = sos.id || sos._id;
                    const hasError = errorMap[id];
                    const isAcceptedByMe =
                      sos.acceptedBy && sos.acceptedBy === user.name;

                    return (
                      <div key={id} className="card sos-card">
                        <div className="sos-header">
                          <div className="sos-title">
                            <strong>{sos.animal}</strong> — {sos.issue}
                          </div>
                          <span className={`badge badge-${sos.status.toLowerCase()}`}>
                            {sos.status}
                          </span>
                        </div>

                        <div className="sos-details">
                          <p><strong>Farmer:</strong> {sos.farmerName} ({sos.farmerPhone})</p>
                          <p><strong>Village:</strong> {sos.village}</p>
                          <p><strong>Description:</strong> {sos.description}</p>
                          <p><strong>Radius:</strong> {sos.radiusKm} km</p>
                          {sos.acceptedBy && (
                            <p><strong>Accepted By:</strong> {sos.acceptedBy}</p>
                          )}
                        </div>

                        {/* Red error for 409 conflict */}
                        {hasError && (
                          <div
                            className="error-text"
                            style={{ color: 'red', fontWeight: 'bold', marginTop: '8px' }}
                          >
                            {hasError}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="sos-actions">
                          {(sos.status === 'PENDING' ||
                            (sos.status === 'ACCEPTED' && sos.acceptedBy !== user.name)) && (
                            <button
                              className="btn btn-primary"
                              onClick={() => handleAccept(sos)}
                            >
                              Accept
                            </button>
                          )}

                          {sos.status === 'ACCEPTED' && isAcceptedByMe && (
                            <button
                              className="btn btn-primary"
                              onClick={() => handleStart(sos)}
                            >
                              Start
                            </button>
                          )}

                          {sos.status === 'ACCEPTED' && isAcceptedByMe && (
                            <button
                              type="button"
                              className="btn btn-outline-danger"
                              onClick={() => handleCancelSos(sos)}
                            >
                              Cancel SOS
                            </button>
                          )}

                          {sos.status === 'IN_PROGRESS' && isAcceptedByMe && (
                            <button
                              className="btn btn-success"
                              onClick={() => handleComplete(sos)}
                            >
                              Complete
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* New Feature 4: History Section */}
              <div className="card history-card">
                <h3>History</h3>
                {completedSosList.length === 0 ? (
                  <p className="empty-text">No completed SOS records yet.</p>
                ) : (
                  <div className="history-table-container">
                    <table className="history-table">
                      <thead>
                        <tr>
                          <th>Farmer</th>
                          <th>Animal</th>
                          <th>Issue</th>
                          <th>Village</th>
                          <th>Accepted By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {completedSosList.map((sos) => (
                          <tr key={sos.id || sos._id}>
                            <td>{sos.farmerName}</td>
                            <td>{sos.animal}</td>
                            <td>{sos.issue}</td>
                            <td>{sos.village}</td>
                            <td>{sos.acceptedBy || 'None'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
