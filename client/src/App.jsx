import React, { useState, useEffect } from 'react';
import { socket } from './socket';

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

  // Fetch all SOS on mount or when switching to Vet
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

      // Update vet list
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

    socket.on('sos_created', handleSosCreated);
    socket.on('sos_updated', handleSosUpdated);

    return () => {
      socket.off('sos_created', handleSosCreated);
      socket.off('sos_updated', handleSosUpdated);
    };
  }, []);

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

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🐾 VetSOS Lite</h1>
        {user && (
          <div className="user-badge">
            <span>
              <strong>{user.name}</strong> ({user.role}) - {user.phone}
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
        )}
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
                  🌾 Farmer
                </button>
                <button
                  type="button"
                  className={`role-btn ${roleInput === 'Vet' ? 'active' : ''}`}
                  onClick={() => setRoleInput('Vet')}
                >
                  🩺 Vet
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
      ) : user.role === 'Farmer' ? (
        /* 2. Farmer View */
        <div className="farmer-view">
          {/* Nearby Vets Section */}
          <div className="card vets-card">
            <h3>Nearby Veterinarians</h3>
            <div className="vets-list">
              {vets.length === 0 ? (
                <p>Loading vets...</p>
              ) : (
                vets.map((v) => (
                  <div key={v.id || v._id} className="vet-item">
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
                🚨 Create SOS
              </button>
            </form>
          </div>

          {/* Tracking Card below the form */}
          {currentSos && (
            <div className="card tracking-card">
              <h3>🚨 Active SOS Tracking</h3>
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
                    📡 Searching within {currentSos.radiusKm} km
                  </p>
                )}
                {currentSos.status === 'ACCEPTED' && (
                  <p className="success-text">
                    ✅ Accepted by {currentSos.acceptedBy}! Vet will arrive soon.
                  </p>
                )}
                {currentSos.status === 'IN_PROGRESS' && (
                  <p className="info-text">
                    🩺 Treatment in progress by {currentSos.acceptedBy}.
                  </p>
                )}
                {currentSos.status === 'COMPLETED' && (
                  <p className="completed-text">
                    🎉 Case completed by {currentSos.acceptedBy}.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* 3. Vet View */
        <div className="vet-view">
          <div className="feed-header">
            <h2>Live SOS Emergency Feed</h2>
            <span className="live-indicator">● LIVE</span>
          </div>

          {sosList.length === 0 ? (
            <div className="card empty-card">
              <p>No active SOS emergency requests at the moment.</p>
            </div>
          ) : (
            <div className="sos-feed-grid">
              {sosList.map((sos) => {
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
                          className="btn btn-warning"
                          onClick={() => handleStart(sos)}
                        >
                          Start
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
        </div>
      )}
    </div>
  );
}

