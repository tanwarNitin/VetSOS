const mongoose = require('mongoose');
require('dotenv').config();

const memoryStore = {
  vets: [],
  sosRequests: []
};

let inMemoryMode = false;
let connectionAttempted = false;

async function connectDB() {
  if (connectionAttempted) return;
  connectionAttempted = true;

  const uri = process.env.MONGO_URI;
  if (!uri || uri.trim() === '') {
    inMemoryMode = true;
    console.log('Using in-memory store (no MONGO_URI)');
    return;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 2000
    });
    inMemoryMode = false;
    console.log('MongoDB connected');
  } catch (err) {
    inMemoryMode = true;
    console.log('Using in-memory store (no MONGO_URI)');
  }
}

function isUsingInMemory() {
  return inMemoryMode;
}

module.exports = {
  connectDB,
  isUsingInMemory,
  memoryStore
};

