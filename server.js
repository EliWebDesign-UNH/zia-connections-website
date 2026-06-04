// Zia Connections — Lead capture + form API
// Stack: Node.js + Express
// Purpose: Receive contact form submissions, log to console (TBD: pipe to email/CRM)

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const LEADS_FILE = process.env.LEADS_FILE || '/tmp/ziaconnections-leads.json';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // Disable caching so content/logo changes show up immediately (matches UNH site)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Health check (for Railway)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ziaconnections-site', timestamp: new Date().toISOString() });
});

// Lead capture endpoint
app.post('/api/lead', (req, res) => {
  const { name, business, email, phone, website } = req.body;

  // Basic validation
  if (!name || !business || !email) {
    return res.status(400).json({ error: 'Missing required fields: name, business, email' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  const lead = {
    id: `lead_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    name: String(name).slice(0, 200),
    business: String(business).slice(0, 200),
    email: String(email).slice(0, 200),
    phone: phone ? String(phone).slice(0, 50) : null,
    website: website ? String(website).slice(0, 500) : null,
    source: 'ziaconnections.com',
    ip: req.ip,
    userAgent: req.get('user-agent') || 'unknown'
  };

  // Log to console (Railway captures this)
  console.log('[NEW LEAD]', JSON.stringify(lead));

  // Persist to local JSON (replace with real DB / email pipeline later)
  try {
    let leads = [];
    if (fs.existsSync(LEADS_FILE)) {
      leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
    }
    leads.push(lead);
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
  } catch (err) {
    console.error('[LEAD PERSIST ERROR]', err.message);
    // Don't fail the request — the console log is the primary signal
  }

  res.json({ ok: true, message: 'Lead received. We will be in touch.' });
});

// 404 fallback
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Zia Connections] Listening on port ${PORT}`);
});
