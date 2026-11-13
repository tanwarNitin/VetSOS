const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const { connectDB, isUsingInMemory, memoryStore } = require('./db');
const { Vet, SOSRequest, formatDoc } = require('./models');
const mongoose = require('mongoose');
const { seed } = require('./seed');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

io.on('connection', (socket) => {
  // socket client connected
});

// GET /api/health -> { ok: true }
app.get('/api/health', (req, res) => {
  res.status(200).json({ ok: true });
});

// GET /api/vets -> list of the 3 seed vets
app.get('/api/vets', async (req, res) => {
  try {
    const vets = await Vet.find();
    res.status(200).json(vets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vets/:id/toggle-duty -> find vet by id, flip onDuty true to false or false to true, emit Socket.io event vet_updated with the updated vet, return the updated vet as JSON. If vet not found, return 404 { error: "vet not found" }.
app.post('/api/vets/:id/toggle-duty', async (req, res) => {
  try {
    const { id } = req.params;
    let updatedVet = null;

    if (isUsingInMemory()) {
      const vet = memoryStore.vets.find(
        (v) => (v._id && v._id.toString() === id) || (v.id && v.id.toString() === id)
      );
      if (!vet) {
        return res.status(404).json({ error: 'vet not found' });
      }
      vet.onDuty = !vet.onDuty;
      updatedVet = formatDoc(vet);
    } else {
      if (!mongoose.isValidObjectId(id)) {
        return res.status(404).json({ error: 'vet not found' });
      }
      const vet = await mongoose.models.Vet.findById(id);
      if (!vet) {
        return res.status(404).json({ error: 'vet not found' });
      }
      vet.onDuty = !vet.onDuty;
      await vet.save();
      updatedVet = formatDoc(vet);
    }

    io.emit('vet_updated', updatedVet);
    return res.status(200).json(updatedVet);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/sos with body { farmerName, farmerPhone, animal, issue, village, description }
// -> create SOS with status PENDING, radiusKm 10, acceptedBy null. Return the created SOS with its id.
app.post('/api/sos', async (req, res) => {
  try {
    const { farmerName, farmerPhone, animal, issue, village, description } = req.body;
    const sos = await SOSRequest.create({
      farmerName,
      farmerPhone,
      animal,
      issue,
      village,
      description,
      status: 'PENDING',
      radiusKm: 10,
      acceptedBy: null,
      createdAt: new Date()
    });

    io.emit('sos_created', sos);
    res.status(201).json(sos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sos -> all SOS, newest first
app.get('/api/sos', async (req, res) => {
  try {
    const all = await SOSRequest.find();
    res.status(200).json(all);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sos/:id -> one SOS
app.get('/api/sos/:id', async (req, res) => {
  try {
    const sos = await SOSRequest.findById(req.params.id);
    if (!sos) {
      return res.status(404).json({ error: 'SOS not found' });
    }
    res.status(200).json(formatDoc(sos));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sos/:id/accept with body { vetName }
// -> ONLY if status is PENDING, set status ACCEPTED and acceptedBy to vetName, return 200.
// If status is not PENDING, return 409 { error: "already accepted" }.
app.post('/api/sos/:id/accept', async (req, res) => {
  try {
    const { vetName } = req.body;
    const sos = await SOSRequest.findById(req.params.id);
    if (!sos) {
      return res.status(404).json({ error: 'SOS not found' });
    }
    if (sos.status !== 'PENDING') {
      return res.status(409).json({ error: 'already accepted' });
    }

    sos.status = 'ACCEPTED';
    sos.acceptedBy = vetName;
    await sos.save();

    const formatted = formatDoc(sos);
    io.emit('sos_updated', formatted);
    res.status(200).json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sos/:id/start -> ONLY if ACCEPTED, set IN_PROGRESS, else 409.
app.post('/api/sos/:id/start', async (req, res) => {
  try {
    const sos = await SOSRequest.findById(req.params.id);
    if (!sos) {
      return res.status(404).json({ error: 'SOS not found' });
    }
    if (sos.status !== 'ACCEPTED') {
      return res.status(409).json({ error: 'cannot start SOS unless accepted' });
    }

    sos.status = 'IN_PROGRESS';
    await sos.save();

    const formatted = formatDoc(sos);
    io.emit('sos_updated', formatted);
    res.status(200).json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sos/:id/complete -> ONLY if IN_PROGRESS, set COMPLETED, else 409.
app.post('/api/sos/:id/complete', async (req, res) => {
  try {
    const sos = await SOSRequest.findById(req.params.id);
    if (!sos) {
      return res.status(404).json({ error: 'SOS not found' });
    }
    if (sos.status !== 'IN_PROGRESS') {
      return res.status(409).json({ error: 'cannot complete SOS unless in progress' });
    }

    sos.status = 'COMPLETED';
    await sos.save();

    const formatted = formatDoc(sos);
    io.emit('sos_updated', formatted);
    res.status(200).json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sos/:id/cancel
// - If not found, return 404 { "error": "sos not found" }
// - If status is IN_PROGRESS, COMPLETED or CANCELLED, return 409 { "error": "cannot cancel this SOS" }
// - Otherwise (PENDING or ACCEPTED only) set status CANCELLED, stop radius expansion, emit sos_updated, return updated SOS
app.post('/api/sos/:id/cancel', async (req, res) => {
  try {
    const sos = await SOSRequest.findById(req.params.id);
    if (!sos) {
      return res.status(404).json({ error: 'sos not found' });
    }
    if (
      sos.status === 'IN_PROGRESS' ||
      sos.status === 'COMPLETED' ||
      sos.status === 'CANCELLED'
    ) {
      return res.status(409).json({ error: 'cannot cancel this SOS' });
    }

    sos.status = 'CANCELLED';
    await sos.save();

    const formatted = formatDoc(sos);
    io.emit('sos_updated', formatted);
    res.status(200).json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Socket.io + radius:
// Every 10 seconds, for each SOS still PENDING, increase radiusKm by 10 and emit sos_updated.
setInterval(async () => {
  try {
    const pendingList = await SOSRequest.find({ status: 'PENDING' });
    const now = Date.now();
    for (const pending of pendingList) {
      const sos = await SOSRequest.findById(pending._id || pending.id);
      if (sos && sos.status === 'PENDING') {
        const elapsedMs = now - new Date(sos.createdAt).getTime();
        const intervalsPassed = Math.floor(elapsedMs / 10000);
        const expectedRadius = 10 + (intervalsPassed * 10);
        if (expectedRadius > sos.radiusKm) {
          sos.radiusKm = expectedRadius;
          await sos.save();
          io.emit('sos_updated', formatDoc(sos));
        }
      }
    }
  } catch (err) {
    console.error('Error expanding radius:', err.message);
  }
}, 1000);

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();
  await seed();
  server.listen(PORT, () => {
    console.log(`VetSOS server running on port ${PORT}`);
  });
}

start();

module.exports = { app, server, io };

