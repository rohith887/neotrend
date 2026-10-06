require('dotenv').config();
const mongoose = require('mongoose');
const Lead = require('../src/models/Lead');
const Interaction = require('../src/models/Interaction');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const leads = await Lead.find({ studentName: /samrudh/i }).lean();
  console.log(`=== SAMRUDH LEADS: ${leads.length} ===`);
  for (const l of leads) {
    console.log(JSON.stringify({
      id: String(l._id),
      name: l.studentName,
      status: l.status,
      fetchedBy: l.fetchedBy && String(l.fetchedBy),
      assignedTo: l.assignedTo && String(l.assignedTo),
      fetchedAt: l.fetchedAt,
      updatedAt: l.updatedAt,
    }));
  }
  const recent = await Interaction.find({}).sort({ createdAt: -1 }).limit(5).select('lead agent disposition createdAt').lean();
  console.log('\n=== LAST 5 INTERACTIONS ===');
  for (const i of recent) console.log(`${i.createdAt?.toISOString?.() || i.createdAt} lead=${i.lead} agent=${i.agent} disp=${i.disposition}`);
  await mongoose.disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
