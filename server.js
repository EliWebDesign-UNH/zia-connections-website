// Zia Connections — Lead capture + form API
// Stack: Node.js + Express
// Purpose: Receive contact form submissions, log to console (TBD: pipe to email/CRM)

const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const LEADS_FILE = process.env.LEADS_FILE || '/tmp/ziaconnections-leads.json';

// Don't advertise the framework
app.disable('x-powered-by');

// Trust Railway's reverse proxy for accurate req.ip
app.set('trust proxy', 1);

// ── Body parsing ────────────────────────────────────────────────────────────
// Only accept JSON. URL-encoded forms are rejected (we control the frontend).
app.use(express.json({ limit: '32kb' }));

// ── Security & cache headers (applied to all routes) ───────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Content Security Policy — allow only same-origin assets, no inline scripts,
  // no eval, no remote anything. Logo is same-origin; no Google Fonts CDN.
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data:",
      "style-src 'self'",
      "script-src 'self'",
      "font-src 'self'",
      "connect-src 'self' https://api.web3forms.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://api.web3forms.com",
    ].join('; ')
  );
  // No caching so content/logo changes show up immediately (matches UNH site)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// ── Static files ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ── Rate limiting (in-memory, per-IP) ───────────────────────────────────────
// 5 lead submissions per IP per hour. Cheap, no deps.
const rateBuckets = new Map();
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 5;
function isRateLimited(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || [];
  // Drop expired
  const recent = bucket.filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    rateBuckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateBuckets.set(ip, recent);
  return false;
}
// Periodically prune empty buckets so the map doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateBuckets) {
    const recent = bucket.filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length === 0) rateBuckets.delete(ip);
    else rateBuckets.set(ip, recent);
  }
}, 10 * 60 * 1000).unref();

// ── Health check (for Railway) ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ziaconnections-site', timestamp: new Date().toISOString() });
});

// ── Lead capture endpoint ───────────────────────────────────────────────────
app.post(
  '/api/lead',
  // CORS: only same-origin; the frontend is on the same site so no Access-Control-Allow-Origin needed.
  // We do set Vary: Origin so caches don't mix responses.
  (req, res, next) => {
    res.setHeader('Vary', 'Origin');
    next();
  },
  async (req, res) => {
    // Rate limit
    if (isRateLimited(req.ip)) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    const { name, business, email, phone, website } = req.body || {};

    // Validation
    if (!name || !business || !email) {
      return res.status(400).json({ error: 'Missing required fields: name, business, email' });
    }
    if (typeof name !== 'string' || typeof business !== 'string' || typeof email !== 'string') {
      return res.status(400).json({ error: 'Invalid field types' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Phone normalization (digits only, must be 7-15 if provided)
    let phoneClean = null;
    if (phone) {
      if (typeof phone !== 'string') {
        return res.status(400).json({ error: 'Invalid phone field' });
      }
      const digits = phone.replace(/\D/g, '');
      if (digits.length > 0) {
        if (digits.length < 7 || digits.length > 15) {
          return res.status(400).json({ error: 'Phone number must be 7-15 digits' });
        }
        phoneClean = digits;
      }
    }

    // URL validation (optional field)
    let websiteClean = null;
    if (website) {
      if (typeof website !== 'string') {
        return res.status(400).json({ error: 'Invalid website field' });
      }
      try {
        const u = new URL(website);
        if (!['http:', 'https:'].includes(u.protocol)) {
          return res.status(400).json({ error: 'Website must be http(s)' });
        }
        websiteClean = u.toString().slice(0, 500);
      } catch {
        return res.status(400).json({ error: 'Invalid website URL' });
      }
    }

    // Hash IP for storage (keep full IP only in console for debugging)
    const ipHash = crypto
      .createHash('sha256')
      .update((req.ip || '') + (process.env.IP_SALT || 'ziaconnections'))
      .digest('hex')
      .slice(0, 16);

    const lead = {
      id: `lead_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`,
      timestamp: new Date().toISOString(),
      name: name.slice(0, 200).trim(),
      business: business.slice(0, 200).trim(),
      email: email.slice(0, 200).trim().toLowerCase(),
      phone: phoneClean,
      website: websiteClean,
      source: 'ziaconnections.com',
      ipHash,
      userAgent: (req.get('user-agent') || 'unknown').slice(0, 300),
    };

    // Log full payload to console (Railway captures this; not persisted to disk
    // beyond the hashed-IP summary below)
    console.log('[NEW LEAD]', JSON.stringify(lead));

    // Persist to local JSON (atomic: write to temp, then rename)
    try {
      let leads = [];
      if (fs.existsSync(LEADS_FILE)) {
        const raw = await fsp.readFile(LEADS_FILE, 'utf8');
        try {
          leads = JSON.parse(raw);
          if (!Array.isArray(leads)) leads = [];
        } catch {
          leads = [];
        }
      }
      leads.push(lead);
      // Cap stored leads to most recent 1000 to bound disk usage
      if (leads.length > 1000) leads = leads.slice(-1000);
      const tmp = LEADS_FILE + '.tmp';
      await fsp.writeFile(tmp, JSON.stringify(leads, null, 2));
      await fsp.rename(tmp, LEADS_FILE);
    } catch (err) {
      console.error('[LEAD PERSIST ERROR]', err.message);
      // Don't fail the request — the console log is the primary signal
    }

    res.json({ ok: true, message: 'Lead received. We will be in touch.' });
  }
);

// ── 404 fallback ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Zia Connections] Listening on port ${PORT}`);
});
