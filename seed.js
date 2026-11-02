// Run with: npm run seed
// Creates the admin account plus demo farmers, a buyer and sample listings.
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Product = require('./models/Product');

async function upsertUser(data) {
  let u = await User.findOne({ email: data.email });
  if (!u) u = await User.create(data);
  return u;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  await upsertUser({
    name: 'Mandi Admin',
    email: process.env.ADMIN_EMAIL || 'admin@digitalmandi.pk',
    password: process.env.ADMIN_PASSWORD || 'Admin@12345',
    phone: '03000000000',
    role: 'admin',
    status: 'approved',
  });

  const pw = 'Password123';
  const f1 = await upsertUser({
    name: 'Bashir Ahmad', email: 'bashir@farmer.pk', password: pw, phone: '03001112233', role: 'farmer',
    status: 'approved', city: 'Sahiwal', address: 'Chak 12/6-R, Sahiwal', coords: { lat: 30.6682, lng: 73.1114 },
    farm: { name: 'Bashir Green Farm', size: '18 acres', crops: ['Potato', 'Wheat', 'Maize'], description: 'Family farm growing seasonal crops for three generations.' },
  });
  const f2 = await upsertUser({
    name: 'Rukhsana Bibi', email: 'rukhsana@farmer.pk', password: pw, phone: '03214445566', role: 'farmer',
    status: 'approved', city: 'Multan', address: 'Shujabad Road, Multan', coords: { lat: 30.1575, lng: 71.5249 },
    farm: { name: 'Multan Mango Orchard', size: '9 acres', crops: ['Mango', 'Citrus'], description: 'Chaunsa and Sindhri mangoes, hand picked.' },
  });
  await upsertUser({
    name: 'Ali Raza', email: 'buyer@mandi.pk', password: pw, phone: '03331239876', role: 'buyer',
    status: 'approved', city: 'Lahore', address: 'Johar Town, Lahore', coords: { lat: 31.5204, lng: 74.3587 },
  });
  await upsertUser({
    name: 'Pending Farmer', email: 'pending@farmer.pk', password: pw, phone: '03451230000', role: 'farmer',
    status: 'pending', city: 'Okara',
  });

  if ((await Product.countDocuments()) === 0) {
    const pt = (lat, lng) => ({ type: 'Point', coordinates: [lng, lat] });
    const day = (n) => new Date(Date.now() - n * 864e5);
    await Product.insertMany([
      { farmer: f1._id, name: 'Fresh Potatoes', category: 'Vegetables', description: 'Washed, graded potatoes, ideal for chips and cooking.', price: 85, unit: 'kg', quantity: 1200, location: 'Sahiwal, Punjab', geo: pt(30.6682, 73.1114), harvestDate: day(2) },
      { farmer: f1._id, name: 'Wheat (Sona Punjab)', category: 'Grains', description: 'Clean, dry wheat. Moisture under 12%.', price: 3900, unit: 'maund (40 kg)', quantity: 300, location: 'Sahiwal, Punjab', geo: pt(30.6682, 73.1114), harvestDate: day(40) },
      { farmer: f1._id, name: 'Sweet Corn', category: 'Vegetables', description: 'Tender sweet corn cobs picked this morning.', price: 60, unit: 'dozen', quantity: 500, location: 'Pakpattan, Punjab', geo: pt(30.3434, 73.3894), harvestDate: day(1) },
      { farmer: f2._id, name: 'Chaunsa Mangoes', category: 'Fruits', description: 'Sweet, aromatic Chaunsa mangoes. Hand picked and boxed.', price: 320, unit: 'kg', quantity: 800, location: 'Multan, Punjab', geo: pt(30.1575, 71.5249), harvestDate: day(3) },
      { farmer: f2._id, name: 'Kinnow (Citrus)', category: 'Fruits', description: 'Juicy Kinnow from Sargodha belt.', price: 140, unit: 'kg', quantity: 2000, location: 'Sargodha, Punjab', geo: pt(32.0836, 72.6711), harvestDate: day(5) },
      { farmer: f2._id, name: 'Desi Red Chilli (dried)', category: 'Spices', description: 'Sun-dried whole red chillies.', price: 950, unit: 'kg', quantity: 150, location: 'Multan, Punjab', geo: pt(30.1575, 71.5249), harvestDate: day(30) },
    ]);
  }

  console.log('Seed complete.\n  Admin : %s / %s\n  Farmer: bashir@farmer.pk / %s\n  Buyer : buyer@mandi.pk / %s',
    process.env.ADMIN_EMAIL || 'admin@digitalmandi.pk', process.env.ADMIN_PASSWORD || 'Admin@12345', pw, pw);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
