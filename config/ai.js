const Anthropic = require('@anthropic-ai/sdk');
const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─── MODEL CONFIGS ────────────────────────────────────
const MODELS = {
  // GROQ — Free, Fast
  'groq-llama-70b': {
    provider: 'groq',
    name: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B (Free)',
    plan: 'free',
    cost_per_gen: 0
  },
  'groq-llama-8b': {
    provider: 'groq',
    name: 'llama-3.1-8b-instant',
    label: 'Llama 3.1 8B Fast (Free)',
    plan: 'free',
    cost_per_gen: 0
  },
  'groq-mixtral': {
    provider: 'groq',
    name: 'mixtral-8x7b-32768',
    label: 'Mixtral 8x7B (Free)',
    plan: 'free',
    cost_per_gen: 0
  },

  // GEMINI — Free tier
  'gemini-flash': {
    provider: 'gemini',
    name: 'gemini-1.5-flash',
    label: 'Gemini 1.5 Flash (Free)',
    plan: 'free',
    cost_per_gen: 0
  },
  'gemini-pro': {
    provider: 'gemini',
    name: 'gemini-1.5-pro',
    label: 'Gemini 1.5 Pro (Free tier)',
    plan: 'free',
    cost_per_gen: 0
  },

  // ANTHROPIC — Paid, Best Quality
  'claude-sonnet': {
    provider: 'anthropic',
    name: 'claude-sonnet-4-20250514',
    label: 'Claude Sonnet 4 (Best)',
    plan: 'pro',
    cost_per_gen: 0.01
  },
  'claude-haiku': {
    provider: 'anthropic',
    name: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4 (Fast)',
    plan: 'pro',
    cost_per_gen: 0.003
  },
};

// ─── DEFAULT MODEL PER PLAN ───────────────────────────
const DEFAULT_MODELS = {
  free: 'groq-llama-70b',
  pro: 'claude-sonnet',
  admin: 'claude-sonnet'
};

// ─── MAIN GENERATE FUNCTION ───────────────────────────
async function generateWithModel(prompt, systemPrompt, modelKey, userPlan = 'free') {
  // Get model config
  const modelConfig = MODELS[modelKey] || MODELS[DEFAULT_MODELS[userPlan]];

  // Plan check — free users cant use pro models
  if (modelConfig.plan === 'pro' && userPlan === 'free') {
    // Fallback to best free model
    return generateWithModel(prompt, systemPrompt, 'groq-llama-70b', userPlan);
  }

  const { provider, name } = modelConfig;

  switch (provider) {
    case 'groq':
      return await generateGroq(prompt, systemPrompt, name);
    case 'gemini':
      return await generateGemini(prompt, systemPrompt, name);
    case 'anthropic':
      return await generateAnthropic(prompt, systemPrompt, name);
    default:
      return await generateGroq(prompt, systemPrompt, 'llama-3.3-70b-versatile');
  }
}

// ─── GROQ ─────────────────────────────────────────────
async function generateGroq(prompt, systemPrompt, model) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    model: model,
    max_tokens: 8000,
    temperature: 0.7,
  });

  return completion.choices[0]?.message?.content || '';
}

// ─── GEMINI ───────────────────────────────────────────
async function generateGemini(prompt, systemPrompt, model) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const geminiModel = genAI.getGenerativeModel({
    model: model,
    systemInstruction: systemPrompt,
  });

  const result = await geminiModel.generateContent(prompt);
  return result.response.text();
}

// ─── ANTHROPIC ────────────────────────────────────────
async function generateAnthropic(prompt, systemPrompt, model) {
  if (!process.env.ANTHROPIC_API_KEY) {
    // Fallback to Groq if no Anthropic key
    return await generateGroq(prompt, systemPrompt, 'llama-3.3-70b-versatile');
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await anthropic.messages.create({
    model: model,
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }]
  });

  return message.content[0]?.text || '';
}

// ─── GET AVAILABLE MODELS ─────────────────────────────
function getAvailableModels(userPlan) {
  return Object.entries(MODELS)
    .filter(([key, config]) => {
      if (userPlan === 'admin') return true;
      if (userPlan === 'pro') return true;
      return config.plan === 'free';
    })
    .map(([key, config]) => ({
      key,
      label: config.label,
      provider: config.provider,
      available: true
    }));
}

module.exports = {
  generateWithModel,
  getAvailableModels,
  MODELS,
  DEFAULT_MODELS
};
