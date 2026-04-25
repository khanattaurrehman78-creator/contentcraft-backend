const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

// ─── VERIFY JWT TOKEN ─────────────────────────────────
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get fresh user data from DB
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please login again.' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ─── ADMIN ONLY ───────────────────────────────────────
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ─── CHECK CREDITS ────────────────────────────────────
const checkCredits = (cost = 1) => {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    if (req.user.credits_used + cost > req.user.credits_limit) {
      return res.status(402).json({
        error: 'Insufficient credits',
        credits_used: req.user.credits_used,
        credits_limit: req.user.credits_limit,
        upgrade_url: '/upgrade'
      });
    }
    req.creditCost = cost;
    next();
  };
};

module.exports = { verifyToken, adminOnly, checkCredits };
