require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const generateRoutes = require('./routes/generate');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── SECURITY ─────────────────────────────────────────
app.use(helmet());

app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ─── RATE LIMITING ────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests. Please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many auth attempts. Please try again later.' }
});

const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { error: 'Generation limit reached. Upgrade to Pro for more.' }
});

app.use(globalLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── HEALTH CHECK ─────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    product: 'ContentCraft AI',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

// ─── ROUTES ───────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/generate', generateLimiter, generateRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);

// ─── ERROR HANDLER ────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// ─── 404 ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── START ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════╗
  ║   ContentCraft AI Backend v2.0    ║
  ║   Running on port ${PORT}            ║
  ║   Environment: ${process.env.NODE_ENV || 'development'}        ║
  ╚═══════════════════════════════════╝
  `);
});

module.exports = app;
