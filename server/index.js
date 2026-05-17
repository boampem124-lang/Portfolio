require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripeLib = require('stripe');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const db = require('./db');
const nodemailer = require('nodemailer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4000;
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeLib(STRIPE_KEY);
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

const app = express();
app.use(cookieParser());
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json());

// Simple health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Public tasks
app.get('/api/tasks', (req, res) => {
  const rows = db.prepare('SELECT id, title, points, active FROM tasks WHERE active=1').all();
  res.json(rows);
});

function signToken(payload){
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next){
  try{
    let token = null;
    if (req.cookies && req.cookies.token) token = req.cookies.token;
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) token = req.headers.authorization.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'authentication required' });
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, email }
    next();
  }catch(e){
    return res.status(401).json({ error: 'invalid token' });
  }
}

let etherealTransporter = null;
let etherealAccount = null;
const devEmailPreviews = []; // in-memory store of {to,subject,previewUrl,html,timestamp}
const previewStateFile = path.join(__dirname, '.preview-state.json');

function loadPreviewState(){
  try{
    if (fs.existsSync(previewStateFile)){
      const raw = fs.readFileSync(previewStateFile, 'utf8');
      const parsed = JSON.parse(raw || '{}');
      return typeof parsed.autoOpenPreviews === 'boolean' ? parsed.autoOpenPreviews : undefined;
    }
  }catch(e){
    console.log('Unable to read preview state file:', e.message || e);
  }
  return undefined;
}

function savePreviewState(value){
  try{
    fs.writeFileSync(previewStateFile, JSON.stringify({ autoOpenPreviews: value }, null, 2), 'utf8');
  }catch(e){
    console.log('Unable to write preview state file:', e.message || e);
  }
}

const autoOpenPreviewsDefault = typeof process.env.AUTO_OPEN_PREVIEWS !== 'undefined'
  ? process.env.AUTO_OPEN_PREVIEWS === 'true'
  : (process.env.USE_ETHEREAL === 'true' || process.env.NODE_ENV !== 'production');
let autoOpenPreviews = loadPreviewState();
if (typeof autoOpenPreviews !== 'boolean') autoOpenPreviews = autoOpenPreviewsDefault;

async function getTransporter(){
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  // Use Ethereal in dev when requested
  if (process.env.USE_ETHEREAL === 'true' || (!process.env.SMTP_HOST && process.env.NODE_ENV !== 'production')) {
    if (etherealTransporter) return etherealTransporter;
    etherealAccount = await nodemailer.createTestAccount();
    etherealTransporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: { user: etherealAccount.user, pass: etherealAccount.pass }
    });
    console.log('Using Ethereal account for dev emails.');
    console.log('Ethereal user:', etherealAccount.user);
    return etherealTransporter;
  }

  // Fallback: log to console
  return null;
}

async function sendEmail(to, subject, html){
  const transporter = await getTransporter();
  if (!transporter) {
    console.log('No SMTP configured — email fallback:');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('HTML:', html);
    return;
  }
  const info = await transporter.sendMail({ from: process.env.EMAIL_FROM || 'noreply@example.com', to, subject, html });
  const previewUrl = nodemailer.getTestMessageUrl(info) || null;
  if (previewUrl) {
    devEmailPreviews.unshift({ to, subject, previewUrl, html, timestamp: Date.now() });
    if (devEmailPreviews.length > 50) devEmailPreviews.pop();
    console.log('Email preview URL:', previewUrl);
    if (autoOpenPreviews) {
      try{
        // Try to open the preview in the host browser. Uses $BROWSER if available in the shell environment,
        // or the BROWSER env var if set explicitly.
        if (process.env.BROWSER) {
          exec(`${process.env.BROWSER} '${previewUrl}'`, (err) => { if (err) console.log('Failed to open preview with BROWSER:', err); });
        } else {
          exec(`$BROWSER '${previewUrl}'`, (err) => { if (err) console.log('Failed to open preview with $BROWSER:', err); });
        }
      }catch(e){
        console.log('Error attempting to open preview URL:', e.message || e);
      }
    } else {
      console.log('Auto-open disabled for email previews.');
    }
  }
}

function createToken(userId, type, ttlMs = 24*3600*1000){
  const token = uuidv4();
  const expires = Date.now() + ttlMs;
  db.prepare('INSERT INTO tokens (id,user_id,token,type,expires_at) VALUES (?,?,?,?,?)').run(uuidv4(), userId, token, type, expires);
  return token;
}

function consumeToken(token, type){
  const row = db.prepare('SELECT id,user_id,expires_at FROM tokens WHERE token=? AND type=?').get(token, type);
  if (!row) return null;
  if (Date.now() > row.expires_at) {
    db.prepare('DELETE FROM tokens WHERE id=?').run(row.id);
    return null;
  }
  db.prepare('DELETE FROM tokens WHERE id=?').run(row.id);
  return row.user_id;
}

// Seed default tasks if none exist
(() => {
  const count = db.prepare('SELECT COUNT(*) as c FROM tasks').get().c;
  if (count === 0) {
    const insert = db.prepare('INSERT INTO tasks (id,title,points,active) VALUES (?,?,?,?)');
    insert.run(uuidv4(), 'Share affiliate link on social media', 50, 1);
    insert.run(uuidv4(), 'Watch a short partner video', 30, 1);
    insert.run(uuidv4(), 'Sign up to partner newsletter', 40, 1);
    console.log('Seeded default tasks');
  }
})();

// Mark task complete and credit user's balance (userId passed for prototype)

app.post('/api/complete', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { taskId } = req.body;
  if (!taskId) return res.status(400).json({ error: 'taskId required' });
  const task = db.prepare('SELECT points FROM tasks WHERE id=?').get(taskId);
  if (!task) return res.status(404).json({ error: 'task not found' });
  const completionId = uuidv4();
  const now = Date.now();
  db.prepare('INSERT INTO completions (id,user_id,task_id,created_at) VALUES (?,?,?,?)').run(completionId, userId, taskId, now);
  db.prepare('UPDATE users SET balance = balance + ? WHERE id=?').run(task.points, userId);
  res.json({ ok: true, awarded: task.points });
});

// User create (prototype, insecure: no real auth)

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (existing) return res.status(400).json({ error: 'email already registered' });
  const id = uuidv4();
  const hash = await bcrypt.hash(password, 10);
  db.prepare('INSERT INTO users (id,email,password_hash) VALUES (?,?,?)').run(id, email, hash);
  const token = signToken({ id, email });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.json({ id, email });
});

// Request email verification (must be logged in)
app.post('/api/request-verification', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const user = db.prepare('SELECT email,verified FROM users WHERE id=?').get(userId);
  if (!user) return res.status(404).json({ error: 'user not found' });
  if (user.verified) return res.json({ ok: true, message: 'already verified' });
  const token = createToken(userId, 'verify', 24*3600*1000);
  const link = `${FRONTEND_ORIGIN}/verify?token=${token}`;
  const html = `<p>Please verify your email by clicking <a href="${link}">this link</a>.</p>`;
  await sendEmail(user.email, 'Verify your email', html);
  res.json({ ok: true });
});

// Verify via token (link will hit this backend endpoint)
app.get('/api/verify', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).send('token required');
  const userId = consumeToken(token, 'verify');
  if (!userId) return res.status(400).send('invalid or expired token');
  db.prepare('UPDATE users SET verified=1 WHERE id=?').run(userId);
  res.send('Email verified — you can close this window.');
});

// Dev-only: list recent email previews (Ethereal). Enabled when USE_ETHEREAL=true or NODE_ENV!=production
app.get('/api/dev/emails', (req, res) => {
  if (!(process.env.USE_ETHEREAL === 'true' || process.env.NODE_ENV !== 'production')) return res.status(404).json({ error: 'not available' });
  res.json(devEmailPreviews.map(e => ({ to: e.to, subject: e.subject, previewUrl: e.previewUrl, timestamp: e.timestamp })));
});

// Dev-only: get/set runtime auto-open flag for previews
app.get('/api/dev/preview-toggle', (req, res) => {
  if (!(process.env.USE_ETHEREAL === 'true' || process.env.NODE_ENV !== 'production')) return res.status(404).json({ error: 'not available' });
  res.json({ enabled: !!autoOpenPreviews });
});

app.post('/api/dev/preview-toggle', (req, res) => {
  if (!(process.env.USE_ETHEREAL === 'true' || process.env.NODE_ENV !== 'production')) return res.status(404).json({ error: 'not available' });
  const { enabled } = req.body || {};
  autoOpenPreviews = !!enabled;
  savePreviewState(autoOpenPreviews);
  res.json({ enabled: autoOpenPreviews });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const user = db.prepare('SELECT id,email,password_hash FROM users WHERE email=?').get(email);
  if (!user) return res.status(400).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash || '');
  if (!ok) return res.status(400).json({ error: 'invalid credentials' });
  const token = signToken({ id: user.id, email: user.email });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.json({ id: user.id, email: user.email });
});

// Request password reset (public: supply email)
app.post('/api/request-reset', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  const user = db.prepare('SELECT id,email FROM users WHERE email=?').get(email);
  if (!user) return res.json({ ok: true }); // do not reveal
  const token = createToken(user.id, 'reset', 60*60*1000); // 1 hour
  const link = `${FRONTEND_ORIGIN}/reset?token=${token}`;
  const html = `<p>Reset your password by clicking <a href="${link}">this link</a>. The link expires in 1 hour.</p>`;
  await sendEmail(user.email, 'Reset your password', html);
  res.json({ ok: true });
});

// Reset password using token
app.post('/api/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'token and password required' });
  const userId = consumeToken(token, 'reset');
  if (!userId) return res.status(400).json({ error: 'invalid or expired token' });
  const hash = await bcrypt.hash(password, 10);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, userId);
  const user = db.prepare('SELECT id,email FROM users WHERE id=?').get(userId);
  const jwtTok = signToken({ id: user.id, email: user.email });
  res.cookie('token', jwtTok, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// Get user (balance)

app.get('/api/user/:id', authMiddleware, (req, res) => {
  const id = req.params.id;
  if (req.user.id !== id) return res.status(403).json({ error: 'forbidden' });
  const user = db.prepare('SELECT id,email,balance FROM users WHERE id=?').get(id);
  if (!user) return res.status(404).json({ error: 'not found' });
  res.json(user);
});

// Create a Stripe Checkout session to deposit funds

app.post('/api/deposit', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { amount } = req.body; // amount in cents
  if (!amount || amount <= 0) return res.status(400).json({ error: 'positive amount required' });
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [{ price_data: { currency: 'usd', product_data: { name: 'Account Deposit' }, unit_amount: amount }, quantity: 1 }],
    success_url: req.body.successUrl || 'https://example.com/success',
    cancel_url: req.body.cancelUrl || 'https://example.com/cancel'
  });
  const id = uuidv4();
  db.prepare('INSERT INTO deposits (id,user_id,amount,stripe_session,created_at) VALUES (?,?,?,?,?)').run(id, userId, amount, session.id, Date.now());
  res.json({ sessionId: session.id, checkoutUrl: session.url });
});

// Webhook to handle successful payments (set STRIPE_WEBHOOK_SECRET in env)
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  let event = null;
  try {
    if (secret) event = stripe.webhooks.constructEvent(req.body, sig, secret);
    else event = req.body; // in test mode without signing
  } catch (err) {
    console.error('Webhook signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    // find deposit record
    const rec = db.prepare('SELECT id,user_id,amount FROM deposits WHERE stripe_session=?').get(session.id);
    if (rec) {
      // credit user's balance with the amount
      db.prepare('UPDATE users SET balance = balance + ? WHERE id=?').run(rec.amount, rec.user_id);
      console.log('Credited user', rec.user_id, 'amount', rec.amount);
    }
  }

  res.json({ received: true });
});

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
