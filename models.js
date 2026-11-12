const mongoose = require('mongoose');
const { isUsingInMemory, memoryStore } = require('./db');

const vetSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  specialisation: { type: String, required: true },
  village: { type: String, required: true },
  distanceKm: { type: Number, required: true },
  onDuty: { type: Boolean, default: true },
  lat: { type: Number },
  lng: { type: Number }
});

const sosRequestSchema = new mongoose.Schema({
  farmerName: { type: String, required: true },
  farmerPhone: { type: String, required: true },
  animal: { type: String, required: true },
  issue: { type: String, required: true },
  village: { type: String, required: true },
  description: { type: String, required: true },
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED'],
    default: 'PENDING'
  },
  radiusKm: { type: Number, default: 10 },
  acceptedBy: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

vetSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    return ret;
  }
});
vetSchema.set('toObject', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    return ret;
  }
});

sosRequestSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    return ret;
  }
});
sosRequestSchema.set('toObject', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    return ret;
  }
});

function formatDoc(doc) {
  if (!doc) return null;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  if (obj._id && !obj.id) {
    obj.id = obj._id.toString();
  }
  return obj;
}

function wrapMemoryDoc(doc) {
  if (!doc) return null;
  if (!doc.save) {
    Object.defineProperty(doc, 'save', {
      value: async function() {
        return this;
      },
      enumerable: false,
      writable: true,
      configurable: true
    });
  }
  return doc;
}

const MongoVet = mongoose.models.Vet || mongoose.model('Vet', vetSchema);
const MongoSOSRequest = mongoose.models.SOSRequest || mongoose.model('SOSRequest', sosRequestSchema);

const Vet = {
  async find(filter = {}) {
    if (!isUsingInMemory()) {
      const docs = await MongoVet.find(filter);
      return docs.map(d => formatDoc(d));
    }
    return memoryStore.vets.filter(v => {
      for (const key of Object.keys(filter)) {
        if (v[key] !== filter[key]) return false;
      }
      return true;
    }).map(v => formatDoc(v));
  },

  async countDocuments(filter = {}) {
    if (!isUsingInMemory()) {
      return await MongoVet.countDocuments(filter);
    }
    const found = await this.find(filter);
    return found.length;
  },

  async create(data) {
    if (!isUsingInMemory()) {
      const doc = await MongoVet.create(data);
      return formatDoc(doc);
    }
    const id = new mongoose.Types.ObjectId().toString();
    const doc = {
      _id: id,
      id: id,
      name: data.name,
      phone: data.phone,
      specialisation: data.specialisation,
      village: data.village,
      distanceKm: data.distanceKm,
      onDuty: data.onDuty !== undefined ? data.onDuty : true,
      lat: data.lat,
      lng: data.lng
    };
    wrapMemoryDoc(doc);
    memoryStore.vets.push(doc);
    return formatDoc(doc);
  }
};

const SOSRequest = {
  async create(data) {
    if (!isUsingInMemory()) {
      const doc = await MongoSOSRequest.create({
        farmerName: data.farmerName,
        farmerPhone: data.farmerPhone,
        animal: data.animal,
        issue: data.issue,
        village: data.village,
        description: data.description,
        status: data.status || 'PENDING',
        radiusKm: data.radiusKm !== undefined ? data.radiusKm : 10,
        acceptedBy: data.acceptedBy !== undefined ? data.acceptedBy : null,
        createdAt: data.createdAt || new Date()
      });
      return formatDoc(doc);
    }
    const id = new mongoose.Types.ObjectId().toString();
    const doc = {
      _id: id,
      id: id,
      farmerName: data.farmerName,
      farmerPhone: data.farmerPhone,
      animal: data.animal,
      issue: data.issue,
      village: data.village,
      description: data.description,
      status: data.status || 'PENDING',
      radiusKm: data.radiusKm !== undefined ? data.radiusKm : 10,
      acceptedBy: data.acceptedBy !== undefined ? data.acceptedBy : null,
      createdAt: data.createdAt || new Date()
    };
    wrapMemoryDoc(doc);
    memoryStore.sosRequests.push(doc);
    return formatDoc(doc);
  },

  async find(filter = {}) {
    if (!isUsingInMemory()) {
      const docs = await MongoSOSRequest.find(filter).sort({ createdAt: -1 });
      return docs.map(d => formatDoc(d));
    }
    let res = memoryStore.sosRequests.filter(item => {
      for (const key of Object.keys(filter)) {
        if (item[key] !== filter[key]) return false;
      }
      return true;
    });
    res.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.map(item => formatDoc(item));
  },

  async findById(id) {
    if (!isUsingInMemory()) {
      if (!mongoose.isValidObjectId(id)) return null;
      const doc = await MongoSOSRequest.findById(id);
      if (!doc) return null;
      return doc;
    }
    const doc = memoryStore.sosRequests.find(
      s => (s._id && s._id.toString() === id.toString()) || (s.id && s.id.toString() === id.toString())
    );
    if (!doc) return null;
    return wrapMemoryDoc(doc);
  }
};

module.exports = {
  Vet,
  SOSRequest,
  formatDoc
};

