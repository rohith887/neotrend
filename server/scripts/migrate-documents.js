require('dotenv').config();
const mongoose = require('mongoose');
const Lead = require('../src/models/Lead');
const Document = require('../src/models/Document');

const STATUS_MAP = {
  'pending': 'missing',
  'in-progress': 'under-review',
  'complete': 'verified',
  'verified': 'verified',
  'rejected': 'rejected',
  'missing': 'missing',
  'received': 'received',
  'under-review': 'under-review',
};

const CATEGORY_MAP = {
  'general': 'other',
  'registration': 'identity',
  'documents': 'other',
  'application': 'application',
  'visa': 'visa',
};

async function migrate() {
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/tasa';
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const leads = await Lead.find({ 'documents.0': { $exists: true } });
  console.log(`Found ${leads.length} leads with embedded documents`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const lead of leads) {
    if (!lead.documents || lead.documents.length === 0) {
      skipped++;
      continue;
    }

    try {
      for (const doc of lead.documents) {
        const mappedStatus = STATUS_MAP[doc.status] || 'missing';
        const mappedCategory = CATEGORY_MAP[doc.category] || 'other';

        await Document.findOneAndUpdate(
          {
            lead: lead._id,
            documentType: doc.type || 'Other',
            documentName: doc.name || doc.type || 'Document',
          },
          {
            lead: lead._id,
            studentName: lead.studentName,
            referenceId: lead.referenceId,
            documentType: doc.type || 'Other',
            documentName: doc.name || doc.type || 'Document',
            category: mappedCategory,
            required: true,
            status: mappedStatus,
            remarks: doc.notes || '',
            uploadedAt: mappedStatus !== 'missing' ? lead.updatedAt : null,
          },
          { upsert: true, new: true }
        );
      }
      migrated++;
    } catch (err) {
      console.error(`Error migrating lead ${lead.referenceId}:`, err.message);
      errors++;
    }
  }

  console.log(`\nMigration complete:`);
  console.log(`  Migrated: ${migrated} leads`);
  console.log(`  Skipped (no docs): ${skipped} leads`);
  console.log(`  Errors: ${errors} leads`);

  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
