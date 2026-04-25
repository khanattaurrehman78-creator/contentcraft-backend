const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const { verifyToken } = require('../middleware/auth');

// ─── GENERATE JWT ─────────────────────────────────────
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// ─── REGISTER ─────────────────────────────────────────
// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { fname, lname, email, password, plan = 'free' } = req.body;

    if (!fname || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if email exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // Create user profile in our users table
    const credits_limit = plan === 'pro' ? 100 : 10;
    const { data: user, error: dbError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        fname,
        lname: lname || '',
        email: email.toLowerCase(),
        role: 'user',
        plan,
        credits_used: 0,
        credits_limit,
        joined: new Date().toISOString().slice(0, 10)
      })
      .select()
      .single();

    if (dbError) {
      return res.status(500).json({ error: 'Failed to create user profile' });
    }

    const token = generateToken(user.id);

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id: user.id,
        fname: user.fname,
        lname: user.lname,
        email: user.email,
        role: user.role,
        plan: user.plan,
        credits_used: user.credits_used,
        credits_limit: user.credits_limit
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// ─── LOGIN ────────────────────────────────────────────
// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Authenticate with Supabase
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password
    });

    if (authError) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Get user profile
    const { data: user, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (dbError || !user) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const token = generateToken(user.id);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        fname: user.fname,
        lname: user.lname,
        email: user.email,
        role: user.role,
        plan: user.plan,
        credits_used: user.credits_used,
        credits_limit: user.credits_limit
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// ─── ME ───────────────────────────────────────────────
// GET /api/auth/me
router.get('/me', verifyToken, async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      fname: req.user.fname,
      lname: req.user.lname,
      email: req.user.email,
      role: req.user.role,
      plan: req.user.plan,
      credits_used: req.user.credits_used,
      credits_limit: req.user.credits_limit,
      joined: req.user.joined
    }
  });
});

// ─── LOGOUT ───────────────────────────────────────────
// POST /api/auth/logout
router.post('/logout', verifyToken, async (req, res) => {
  await supabase.auth.signOut();
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
