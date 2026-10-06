const Counter = require('../models/Counter');

const PREFIX = 'GR';

const nextReferenceId = async () => {
  const counter = await Counter.findOneAndUpdate(
    { _id: 'lead' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return `${PREFIX}-${String(counter.seq).padStart(6, '0')}`;
};

module.exports = { nextReferenceId };
