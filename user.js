const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { verifyToken, adminOnly } = require('../middleware/auth');

// All admin routes require auth + admin role
router.use(verifyToken, adminOnly);

// ─── GET ALL USERS ────────────────────────────────────
// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, fname, lname, email, role, plan, credits_used, credits_limit, joined')
      .order('joined', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADD USER ─────────────────────────────────────────
// POST /api/admin/users
router.post('/users', async (req, res) => {
  try {
    const { fname, lname, email, password, plan = 'free', credits_limit } = req.body;

    if (!fname || !email || !password) {
      return res.status(400).json({ error: 'Name, email, password required' });
    }

    // Create in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true
    });

    if (authError) return res.status(400).json({ error: authError.message });

    // Create profile
    const limit = credits_limit || (plan === 'pro' ? 100 : 10);
    const { data: user, error: dbError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        fname, lname: lname || '',
        email: email.toLowerCase(),
        role: 'user', plan,
        credits_used: 0,
        credits_limit: limit,
        joined: new Date().toISOString().slice(0, 10)
      })
      .select()
      .single();

    if (dbError) return res.status(500).json({ error: dbError.message });

    res.status(201).json({ message: 'User created', user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE USER PLAN ─────────────────────────────────
// PUT /api/admin/users/:id/plan
router.put('/users/:id/plan', async (req, res) => {
  try {
    const { plan } = req.body;
    const { id } = req.params;

    if (!['free', 'pro'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const credits_limit = plan === 'pro' ? 100 : 10;

    const { data: user, error } = await supabase
      .from('users')
      .update({ plan, credits_limit })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.json({ message: `Plan updated to ${plan}`, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GRANT CREDITS ────────────────────────────────────
// POST /api/admin/credits/grant
router.post('/credits/grant', async (req, res) => {
  try {
    const { userId, amount, note = 'Manual grant by admin' } = req.body;

    if (!userId || !amount || amount < 1) {
      return res.status(400).json({ error: 'User ID and valid amount required' });
    }

    // Add to credits_limit
    const { data: user, error } = await supabase
      .from('users')
      .select('credits_limit, fname')
      .eq('id', userId)
      .single();

    if (error || !user) return res.status(404).json({ error: 'User not found' });

    const { error: updateError } = await supabase
      .from('users')
      .update({ credits_limit: user.credits_limit + amount })
      .eq('id', userId);

    if (updateError) return res.status(500).json({ error: updateError.message });

    // Log grant
    await supabase.from('credit_grants').insert({
      user_id: userId,
      amount,
      note,
      granted_by: req.user.id,
      created_at: new Date().toISOString()
    });

    res.json({ message: `Granted ${amount} credits to ${user.fname}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE USER ──────────────────────────────────────
// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Delete from auth
    await supabase.auth.admin.deleteUser(id);

    // Delete profile (cascade will handle related records)
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ANALYTICS ────────────────────────────────────────
// GET /api/admin/analytics
router.get('/analytics', async (req, res) => {
  try {
    const { data: users } = await supabase
      .from('users')
      .select('plan, role, credits_used');

    const { data: history } = await supabase
      .from('content_history')
      .select('tool, credits_used')
      .order('created_at', { ascending: false })
      .limit(100);

    const totalUsers = users?.filter(u => u.role !== 'admin').length || 0;
    const proUsers = users?.filter(u => u.plan === 'pro').length || 0;
    const totalGenerations = history?.length || 0;
    const mrr = proUsers * parseInt(process.env.PRO_PRICE || 29);

    // Tool breakdown
    const toolBreakdown = {};
    history?.forEach(h => {
      toolBreakdown[h.tool] = (toolBreakdown[h.tool] || 0) + 1;
    });

    res.json({
      totalUsers,
      proUsers,
      freeUsers: totalUsers - proUsers,
      totalGenerations,
      mrr,
      toolBreakdown
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CREDIT GRANTS LOG ────────────────────────────────
// GET /api/admin/credits/grants
router.get('/credits/grants', async (req, res) => {
  try {
    const { data: grants, error } = await supabase
      .from('credit_grants')
      .select('*, users(fname, lname, email)')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ grants });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
