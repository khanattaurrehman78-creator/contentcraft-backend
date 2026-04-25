const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { generateWithModel, getAvailableModels, DEFAULT_MODELS } = require('../config/ai');
const { verifyToken, checkCredits } = require('../middleware/auth');

// Optional auth middleware - passes through if no token
const optionalAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) {
    req.user = { id: 'guest', role: 'user', plan: 'free', credits_used: 0, credits_limit: 999 };
    return next();
  }
  verifyToken(req, res, next);
};

const buildSystem = (persona = {}) => {
  const niche = persona.niche || 'general';
  const audience = persona.audience || 'general readers';
  const domain = persona.domain || 'mysite.com';
  const expert = persona.expert || '5 years experience';
  return `You are a senior SEO content strategist with 10+ years experience in ${niche}. Write for ${audience} on ${domain}. Expertise: ${expert}.
RULES: Zero AI phrases (ensure/leverage/dive into/moreover/furthermore/delve/utilize). No semicolons/hashtags/emojis. Active voice 80%+. Sentences under 20 words. Flesch 60-70. AI detection under 12%.`;
};

const deductCredits = async (userId, cost, tool, keyword = '') => {
  await supabase.rpc('deduct_credits', { user_id: userId, amount: cost });
  await supabase.from('content_history').insert({ user_id: userId, tool, keyword, credits_used: cost, created_at: new Date().toISOString() });
};

const getModelKey = (req, requestedModel) => {
  const plan = req.user.plan || 'free';
  return requestedModel || process.env.DEFAULT_MODEL || DEFAULT_MODELS[plan] || 'groq-llama-70b';
};

// GET /api/generate/models
router.get('/models', optionalAuth, (req, res) => {
  const models = getAvailableModels(req.user.plan);
  res.json({ models, default: DEFAULT_MODELS[req.user.plan] });
});

// POST /api/generate/article
router.post('/article', optionalAuth, checkCredits(2), async (req, res) => {
  try {
    const { keyword, niche, language='English', length=2500, tone='Informative', lsi='', gaps='', schema='both', persona={}, model } = req.body;
    if (!keyword) return res.status(400).json({ error: 'Keyword required' });

    const prompt = `Write a ${length}-word ${tone.toLowerCase()} ${language} SEO article: "${keyword}". Niche: ${niche||'general'}.
OPENING (400-500w): Real specific scenario with costs/dates. NOT "Are you looking for...". Personal story, surprising stat, value promise.
BODY: 12-15 H2s as search queries. Each H2: 50-70w direct answer + case study + examples + contrarian insight + steps + tools with pricing "as of 2025".
${gaps?`Competitor gaps to cover: ${gaps}`:''}${lsi?`LSI keywords: ${lsi}`:''}
Add INTERNAL_LINK_1 to INTERNAL_LINK_15 placeholders.
FAQ: 10 questions 80-100w each. CONCLUSION: 150-200w with callback + prediction.
FORMAT: ## H2, ### H3, **bold**
${schema!=='none'?'\n---SCHEMA---\n<script type="application/ld+json">[FAQPage+HowTo JSON-LD]</script>'  :''}`;

    const content = await generateWithModel(prompt, buildSystem(persona), getModelKey(req, model), req.user.plan);
    await deductCredits(req.user.id, 2, 'article', keyword);
    res.json({ content, credits_used: 2, model: getModelKey(req, model) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/generate/meta
router.post('/meta', optionalAuth, checkCredits(1), async (req, res) => {
  try {
    const { keyword, pageType='Blog Article', language='English', brand='', cta='Learn more', persona={}, model } = req.body;
    if (!keyword) return res.status(400).json({ error: 'Keyword required' });
    const prompt = `SEO meta tags for ${pageType} about "${keyword}" in ${language}. Brand:"${brand}". CTA:"${cta}". Return ONLY JSON (no markdown): {"title":"≤60 chars","description":"145-155 chars with CTA","og_title":"...","og_description":"...","char_count_title":0,"char_count_desc":0}`;
    const raw = await generateWithModel(prompt, buildSystem(persona), getModelKey(req, model), req.user.plan);
    const data = JSON.parse(raw.replace(/```json|```/g,'').trim());
    await deductCredits(req.user.id, 1, 'meta', keyword);
    res.json({ ...data, credits_used: 1 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/generate/faq
router.post('/faq', optionalAuth, checkCredits(2), async (req, res) => {
  try {
    const { content, topic, count=8, language='English', persona={}, model } = req.body;
    if (!content && !topic) return res.status(400).json({ error: 'Content or topic required' });
    const prompt = `${content?`Extract ${count} FAQs from:\n${content}`:`Write ${count} FAQs about "${topic}"`} in ${language}. Real PAA queries. Answers 40-60w direct.\n---FAQS---\nQ:[q]\nA:[a]\n---SCHEMA---\n<script type="application/ld+json">[FAQPage JSON-LD]</script>`;
    const text = await generateWithModel(prompt, buildSystem(persona), getModelKey(req, model), req.user.plan);
    const parts = text.split('---SCHEMA---');
    await deductCredits(req.user.id, 2, 'faq', topic||'content');
    res.json({ faqs: parts[0].replace('---FAQS---','').trim(), schema: parts[1]?.trim()||'', credits_used: 2 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/generate/humanize (Pro only)
router.post('/humanize', optionalAuth, async (req, res) => {
  try {
    if (req.user.plan==='free' && req.user.role!=='admin') return res.status(403).json({ error: 'Pro feature only. Please upgrade.' });
    const { text, style='Natural Blogger', persona={}, model } = req.body;
    if (!text) return res.status(400).json({ error: 'Text required' });
    const prompt = `Rewrite as real human ${style}. REMOVE: ensure/leverage/dive into/moreover/furthermore/delve/utilize/em dashes. USE: contractions, active voice, varied lengths, first-person. Flesch 65+, under 12% AI. Return ONLY humanized text:\n\n${text}`;
    const content = await generateWithModel(prompt, buildSystem(persona), getModelKey(req, model), req.user.plan);
    if (req.user.role!=='admin') await deductCredits(req.user.id, 2, 'humanizer');
    res.json({ content, credits_used: 2 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/generate/classify
router.post('/classify', optionalAuth, checkCredits(1), async (req, res) => {
  try {
    const { keywords, context='', persona={}, model } = req.body;
    if (!keywords) return res.status(400).json({ error: 'Keywords required' });
    const prompt = `Classify keywords. Context:${context}\n\n${keywords}\n\nFor each: Intent|Content Format|Buyer Stage|Priority|Word Count. Clean table with | separators.`;
    const content = await generateWithModel(prompt, buildSystem(persona), getModelKey(req, model), req.user.plan);
    await deductCredits(req.user.id, 1, 'classifier');
    res.json({ content, credits_used: 1 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/generate/gap
router.post('/gap', optionalAuth, checkCredits(1), async (req, res) => {
  try {
    const { myOutline, competitorOutline, persona={}, model } = req.body;
    if (!myOutline) return res.status(400).json({ error: 'Your outline required' });
    const prompt = `Compare outlines.\nMINE:\n${myOutline}\nCOMPETITOR:\n${competitorOutline||'typical'}\n1.Missing Topics 2.Missing Angles 3.Priority Additions 4.New H2s 5.Contrarian Angles. Be specific.`;
    const content = await generateWithModel(prompt, buildSystem(persona), getModelKey(req, model), req.user.plan);
    await deductCredits(req.user.id, 1, 'gap');
    res.json({ content, credits_used: 1 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/generate/cluster
router.post('/cluster', optionalAuth, checkCredits(2), async (req, res) => {
  try {
    const { niche, pillarKeyword, language='English', audience='', persona={}, model } = req.body;
    if (!niche) return res.status(400).json({ error: 'Niche required' });
    const prompt = `Build ${language} topic cluster for "${niche}" targeting ${audience}. ${pillarKeyword?`Pillar:"${pillarKeyword}"`:''}. 1 PILLAR + 8 SUPPORTING PAGES. Each: title, keyword, intent, word count, 2-3 links, monetization. Flag cannibalization. Publishing order.`;
    const content = await generateWithModel(prompt, buildSystem(persona), getModelKey(req, model), req.user.plan);
    await deductCredits(req.user.id, 2, 'cluster', niche);
    res.json({ content, credits_used: 2 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/generate/snippet
router.post('/snippet', optionalAuth, checkCredits(1), async (req, res) => {
  try {
    const { question, paragraph='', type='Paragraph', persona={}, model } = req.body;
    if (!question) return res.status(400).json({ error: 'Question required' });
    const prompt = `Featured snippet for:"${question}". Type:${type}. ${paragraph?`Original:${paragraph}`:''} Under 55 words STRICTLY. Direct answer. 1)Snippet 2)Word count 3)HTML`;
    const content = await generateWithModel(prompt, buildSystem(persona), getModelKey(req, model), req.user.plan);
    await deductCredits(req.user.id, 1, 'snippet', question);
    res.json({ content, credits_used: 1 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/generate/eeat
router.post('/eeat', optionalAuth, checkCredits(1), async (req, res) => {
  try {
    const { article, focus='All Signals', persona={}, model } = req.body;
    if (!article) return res.status(400).json({ error: 'Article required' });
    const prompt = `E-E-A-T audit. Focus:${focus}.\n${article}\n\n5 EDITS:\nEDIT #N—[Type]\nLOCATION:[section]\nBEFORE:[text]\nAFTER:[improved]\nWHY:[reason]\nSignals: experience, expert quotes, stats, tools, vulnerability.`;
    const content = await generateWithModel(prompt, buildSystem(persona), getModelKey(req, model), req.user.plan);
    await deductCredits(req.user.id, 1, 'eeat');
    res.json({ content, credits_used: 1 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
