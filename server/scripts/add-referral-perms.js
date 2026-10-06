const mongoose = require('mongoose');
const config = require('../src/config');

async function run() {
  await mongoose.connect(config.mongoUri);
  const Role = mongoose.connection.collection('roles');

  const result = await Role.updateOne(
    { code: 'supervisor' },
    { $addToSet: { permissions: { $each: ['referral:read', 'referral:manage'] } } }
  );

  const role = await Role.findOne({ code: 'supervisor' });
  console.log('Modified:', result.modifiedCount);
  console.log('Supervisor permissions:', role.permissions);
  await mongoose.disconnect();
}

run().catch((e) => { console.error(e.message); process.exit(1); });
