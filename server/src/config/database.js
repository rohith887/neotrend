const mongoose = require('mongoose');
const config = require('./index');

const connectDB = async () => {
  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(config.mongoUri);
  // eslint-disable-next-line no-console
  console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  return conn;
};

module.exports = { connectDB };
