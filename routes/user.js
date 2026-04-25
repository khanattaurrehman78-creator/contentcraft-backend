const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// ─── GET PROFILE ──────────────────────────────────────
// GET /api/user/profile
router.get('/profile', async (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    fname: u.fname,
    lname: u.lname,
    email: u.email,
    role: u.role,
    plan: u.plan,
    credits_used: u.credits_used,
    credits_limit: u.credits_limit,
    joined: u.joined
  });
});

// ─── UPDATE PROFILE ───────────────────────────────────
// PUT /api/user/profile
router.put('/profile', async (req, res) => {
  try {
    const { fname, lname } = req.body;

    const { data: user, error } = await supabase
      .from('users')
      .update({ fname, lname })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.json({ message: 'Profile updated', user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CONTENT HISTORY ──────────────────────────────────
// GET /api/user/history
router.get('/history', async (req, res) => {
  try {
    const { data: history, error } = await supabase
      .from('content_history')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── USAGE STATS ──────────────────────────────────────
// GET /api/user/stats
router.get('/stats', async (req, res) => {
  try {
    const { data: history } = await supabase
      .from('content_history')
      .select('tool, credits_used')
      .eq('user_id', req.user.id);

    const stats = {
      total_generations: history?.length || 0,
      articles: history?.filter(h => h.tool === 'article').length || 0,
      metas: history?.filter(h => h.tool === 'meta').length || 0,
      faqs: history?.filter(h => h.tool === 'faq').length || 0,
      credits_used: req.user.credits_used,
      credits_limit: req.user.credits_limit,
      credits_remaining: req.user.credits_limit - req.user.credits_used
    };

    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
