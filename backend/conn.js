const mongoose = require('mongoose');
const URL = process.env.MONGO_URI;

mongoose.connect(URL)
  .then(() => console.log('Connected to MongoDB Atlas successfully'))
  .catch(err => console.error('Mongoose connection error:', err));

mongoose.Promise = global.Promise;

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'DB ERROR: '));

module.exports = { db, mongoose };
