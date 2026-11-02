require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const connectDB = require('./config/db');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // allow the React app to show /uploads images
const origins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim());
app.use(cors({ origin: origins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Digital Mandi API  running successfully!'
    });
});
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date() }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/admin', require('./routes/admin'));

app.use('/api', (req, res) => res.status(404).json({ message: 'Endpoint not found' }));

// Central error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message || 'Something went wrong';
  if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid id or value';
  } else if (err.code === 11000) {
    status = 409;
    message = 'Duplicate value already exists';
  } else if (err.name === 'MulterError') {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Each image must be 5 MB or smaller' : err.message;
  }
  if (status >= 500) console.error(err);
  res.status(status).json({ message });
});

const PORT = process.env.PORT || 5000;
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing. Copy .env.example to .env first.');
  process.exit(1);
}
connectDB()
  .then(() => app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`)))
  .catch((e) => {
    console.error('Failed to start:', e.message);
    process.exit(1);
  });
