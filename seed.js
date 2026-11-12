const { connectDB } = require('./db');
const { Vet } = require('./models');

const seedVets = [
  {
    name: 'Dr. Ramesh Yadav',
    phone: '9810000001',
    specialisation: 'Cattle',
    village: 'Jaipur',
    distanceKm: 4,
    onDuty: true,
    lat: 26.9484,
    lng: 75.8013
  },
  {
    name: 'Dr. Sunita Sharma',
    phone: '9810000002',
    specialisation: 'Buffalo',
    village: 'Jaipur',
    distanceKm: 7,
    onDuty: true,
    lat: 26.8750,
    lng: 75.7480
  },
  {
    name: 'Dr. Amit Verma',
    phone: '9810000003',
    specialisation: 'Goat',
    village: 'Jaipur',
    distanceKm: 12,
    onDuty: true,
    lat: 26.9850,
    lng: 75.8450
  }
];

async function seed() {
  await connectDB();
  const count = await Vet.countDocuments();
  if (count === 0) {
    for (const vetData of seedVets) {
      await Vet.create(vetData);
    }
  }
}

if (require.main === module) {
  seed()
    .then(() => {
      console.log('Seed completed successfully');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}

module.exports = { seed, seedVets };

