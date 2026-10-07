const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const BRANCHES = {
  cheonan: {
    name: '천안점',
    password: process.env.CHEONAN_PASSWORD || 'cheonan2024',
    bizNo: '657-01-03945',
    address: '충청남도 천안시 서북구 불당21로 67-8, 2층 208,209호',
  },
  dongtan: {
    name: '동탄점',
    password: process.env.DONGTAN_PASSWORD || 'dongtan2024',
    bizNo: '501-75-00684',
    address: '경기도 화성시 동탄오산로 86-10, 4층 405호',
  },
  gwanggyo: {
    name: '광교점',
    password: process.env.GWANGGYO_PASSWORD || 'gwanggyo2024',
    bizNo: '213-35-98664',
    address: '경기도 수원시 영통구 법조로 25(하동) 1114~1116호',
  },
  apgujeong: {
    name: '압구정로데오점',
    password: process.env.APGUJEONG_PASSWORD || 'apgujeong2024',
    bizNo: '407-11-65011',
    address: '서울특별시 강남구 신사동 644-3 세화빌딩 3층 (CU건물 3층)',
  },
};
const ROOT_PASSWORD = process.env.ADMIN_PASSWORD || 'scalpit2024';

function getBranch(req) {
  // 1) query param ?b=slug  2) URL path prefix /slug/...  3) subdomain (legacy)
  const qb = req.query.b;
  if (qb && BRANCHES[qb]) return { slug: qb, ...BRANCHES[qb] };
  const pathSlug = req.path.split('/').filter(Boolean)[0];
  if (pathSlug && BRANCHES[pathSlug]) return { slug: pathSlug, ...BRANCHES[pathSlug] };
  const host = (req.headers.host || '').split(':')[0];
  const subdomain = host.split('.')[0];
  if (BRANCHES[subdomain]) return { slug: subdomain, ...BRANCHES[subdomain] };
  return null;
}

function authPassword(req) {
  const branch = getBranch(req);
  const expected = branch ? branch.password : ROOT_PASSWORD;
  return req.headers['x-admin-password'] === expected;
}

let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

const fs = require('fs');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return []; }
}
function writeJson(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

const REVIEW_FILE = path.join(DATA_DIR, 'reviews.json');
function readReviews() {
  if (!fs.existsSync(REVIEW_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf8')); } catch { return []; }
}
function writeReviews(data) { fs.writeFileSync(REVIEW_FILE, JSON.stringify(data, null, 2), 'utf8'); }

async function initDB() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id BIGINT PRIMARY KEY,
      submitted_at TIMESTAMPTZ DEFAULT NOW(),
      data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id BIGINT PRIMARY KEY,
      submitted_at TIMESTAMPTZ DEFAULT NOW(),
      data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS academy_leads (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      session TEXT NOT NULL DEFAULT 'both',
      purpose TEXT NOT NULL DEFAULT '',
      marketing BOOLEAN NOT NULL DEFAULT FALSE,
      consent_at TIMESTAMPTZ,
      origin TEXT NOT NULL DEFAULT '',
      variant TEXT NOT NULL DEFAULT 'a',
      attr JSONB NOT NULL DEFAULT '{}'::jsonb,
      landing TEXT NOT NULL DEFAULT '',
      ua TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new',
      note TEXT NOT NULL DEFAULT '',
      token TEXT NOT NULL DEFAULT '',
      dup BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE INDEX IF NOT EXISTS academy_leads_phone_idx ON academy_leads (phone);
  `);
}

async function getSubmissions() {
  if (pool) {
    const res = await pool.query('SELECT id, submitted_at as "submittedAt", data FROM submissions ORDER BY id ASC');
    return res.rows.map(r => ({ id: r.id, submittedAt: r.submittedAt, ...r.data }));
  }
  return readJson();
}

async function saveSubmission(entry) {
  if (pool) {
    const { id, submittedAt, ...data } = entry;
    await pool.query('INSERT INTO submissions (id, submitted_at, data) VALUES ($1, $2, $3)', [id, submittedAt, JSON.stringify(data)]);
  } else {
    const list = readJson();
    list.push(entry);
    writeJson(list);
  }
}

async function deleteSubmission(id) {
  if (pool) {
    await pool.query('DELETE FROM submissions WHERE id=$1', [id]);
  } else {
    writeJson(readJson().filter(s => s.id !== id));
  }
}

app.use(express.json());

// 매장별 경로 라우팅
Object.keys(BRANCHES).forEach(slug => {
  app.get(`/${slug}`, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
  app.get(`/${slug}/admin`, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
  app.get(`/${slug}/review`, (req, res) => res.sendFile(path.join(__dirname, 'public', 'review.html')));
  app.get(`/${slug}/review-admin`, (req, res) => res.sendFile(path.join(__dirname, 'public', 'review-admin.html')));
});

// 두피 자가진단 페이지
app.get('/scalp-test', (req, res) => res.sendFile(path.join(__dirname, 'public', 'scalp-test.html')));

// 크리에이터 체험단 신청 랜딩 (다국어)
app.get('/apply', (req, res) => res.sendFile(path.join(__dirname, 'public/apply/select.html')));
app.get('/apply/en', (req, res) => res.sendFile(path.join(__dirname, 'public/apply/en.html')));
app.get('/apply/ko', (req, res) => res.sendFile(path.join(__dirname, 'public/apply/ko.html')));
app.get('/apply/ja', (req, res) => res.sendFile(path.join(__dirname, 'public/apply/ja.html')));
app.get('/apply/zh', (req, res) => res.sendFile(path.join(__dirname, 'public/apply/zh.html')));
app.get('/apply/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/apply/admin.html')));


// ───────────────────────────────────────────────────────────────────────────
// 아카데미 원데이 클래스 랜딩 (/academy) — DB(리드) 수집
//   - 랜딩: GET /academy        (환경변수 GTM_ID, META_PIXEL_ID 가 있으면 추적 코드를 주입)
//   - 신청: POST /api/academy/lead, 접수 직후 목적 보완: PATCH /api/academy/lead/:id (토큰)
//   - 관리: GET /academy/admin, GET /api/academy/leads, PATCH /api/academy/leads/:id (x-admin-password)
// ───────────────────────────────────────────────────────────────────────────
const crypto = require('crypto');
const ACADEMY_FILE = path.join(DATA_DIR, 'academy_leads.json');
const LEAD_STATUS = ['new', 'contacted', 'paid', 'confirmed', 'cancelled'];
const LEAD_SESSIONS = ['1020', '1027', 'both'];
const LEAD_PURPOSES = ['', '기술 습득', '취업', '1인샵 창업', '헤드스파 창업', '아직 모르겠음'];

function readAcademyJson() {
  if (!fs.existsSync(ACADEMY_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(ACADEMY_FILE, 'utf8')); } catch { return []; }
}
function writeAcademyJson(list) { fs.writeFileSync(ACADEMY_FILE, JSON.stringify(list, null, 2), 'utf8'); }

function rowToLead(r) {
  return {
    id: Number(r.id), createdAt: r.created_at, name: r.name, phone: r.phone, session: r.session, purpose: r.purpose,
    marketing: r.marketing, consentAt: r.consent_at, origin: r.origin, variant: r.variant, attr: r.attr || {},
    landing: r.landing, status: r.status, note: r.note, dup: r.dup,
  };
}

async function academyFindByPhone(phone) {
  if (pool) { const r = await pool.query('SELECT id FROM academy_leads WHERE phone=$1 LIMIT 1', [phone]); return r.rows.length > 0; }
  return readAcademyJson().some(l => l.phone === phone);
}

async function academyInsert(lead) {
  if (pool) {
    const r = await pool.query(
      `INSERT INTO academy_leads (name, phone, session, purpose, marketing, consent_at, origin, variant, attr, landing, ua, token, dup)
       VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [lead.name, lead.phone, lead.session, lead.purpose, lead.marketing, lead.origin, lead.variant, JSON.stringify(lead.attr), lead.landing, lead.ua, lead.token, lead.dup]);
    return Number(r.rows[0].id);
  }
  const list = readAcademyJson();
  const id = list.reduce((m, l) => Math.max(m, l.id || 0), 0) + 1;
  list.push({ id, createdAt: new Date().toISOString(), consentAt: new Date().toISOString(), status: 'new', note: '', ...lead });
  writeAcademyJson(list);
  return id;
}

async function academyList() {
  if (pool) {
    const r = await pool.query('SELECT * FROM academy_leads ORDER BY id DESC');
    return r.rows.map(rowToLead);
  }
  return readAcademyJson().slice().reverse().map(({ token, ua, ...rest }) => rest);
}

async function academyGetToken(id) {
  if (pool) { const r = await pool.query('SELECT token FROM academy_leads WHERE id=$1', [id]); return r.rows[0] ? r.rows[0].token : null; }
  const l = readAcademyJson().find(x => x.id === id); return l ? l.token : null;
}

async function academyPatch(id, patch) {
  const allowed = ['purpose', 'status', 'note'];
  const keys = Object.keys(patch).filter(k => allowed.includes(k) && patch[k] !== undefined);
  if (!keys.length) return false;
  if (pool) {
    const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(', ');
    const r = await pool.query(`UPDATE academy_leads SET ${sets} WHERE id=$1`, [id, ...keys.map(k => patch[k])]);
    return r.rowCount > 0;
  }
  const list = readAcademyJson(); const l = list.find(x => x.id === id); if (!l) return false;
  keys.forEach(k => { l[k] = patch[k]; }); writeAcademyJson(list); return true;
}

// IP 단위 간단한 속도 제한(메모리): 10분에 8회
const leadHits = new Map();
function tooMany(ip) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const arr = (leadHits.get(ip) || []).filter(t => now - t < win);
  arr.push(now); leadHits.set(ip, arr);
  if (leadHits.size > 5000) { for (const [k, v] of leadHits) if (!v.some(t => now - t < win)) leadHits.delete(k); }
  return arr.length > 8;
}
function clientIp(req) { return ((req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || ''; }
function safeEq(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function adminOk(req) { return safeEq(req.headers['x-admin-password'], ROOT_PASSWORD); }
function clip(v, n) { return String(v == null ? '' : v).slice(0, n); }

function trackingHtml() {
  const gtm = (process.env.GTM_ID || '').replace(/[^A-Za-z0-9-]/g, '');
  const pixel = (process.env.META_PIXEL_ID || '').replace(/[^0-9]/g, '');
  let head = '', body = '';
  if (gtm) {
    head += `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');</script>`;
    body += `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${gtm}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;
  }
  if (pixel) {
    head += `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');</script>`;
  }
  return { head, body };
}

function sendAcademyPage(req, res) {
  fs.readFile(path.join(__dirname, 'public/academy/index.html'), 'utf8', (err, html) => {
    if (err) return res.status(500).send('landing not found');
    const t = trackingHtml();
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(html.replace('<!--@TRACKING_HEAD-->', t.head).replace('<!--@TRACKING_BODY-->', t.body));
  });
}
app.get(['/academy', '/academy/', '/academy/index.html'], sendAcademyPage);
app.get('/academy/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/academy/admin.html')));

app.post('/api/academy/lead', async (req, res) => {
  try {
    const b = req.body || {};
    // 허니팟: 봇은 성공한 것처럼 응답하고 저장하지 않음
    if (b.website) return res.json({ ok: true, id: 0, token: '' });
    if (tooMany(clientIp(req))) return res.status(429).json({ ok: false, message: '잠시 후 다시 시도해 주세요.' });

    const name = clip(b.name, 20).trim();
    const phone = String(b.phone || '').replace(/\D/g, '');
    if (name.length < 2) return res.status(400).json({ ok: false, message: '성함을 입력해 주세요.' });
    if (!/^01[016789]\d{7,8}$/.test(phone)) return res.status(400).json({ ok: false, message: '연락처를 확인해 주세요.' });
    if (b.consent !== true) return res.status(400).json({ ok: false, message: '개인정보 수집·이용에 동의해 주세요.' });

    const attrIn = b.attr && typeof b.attr === 'object' ? b.attr : {};
    const attr = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'n_media', 'n_query', 'n_ad', 'referrer'].forEach(k => {
      if (attrIn[k]) attr[k] = clip(attrIn[k], 300);
    });
    const lead = {
      name, phone,
      session: LEAD_SESSIONS.includes(b.session) ? b.session : 'both',
      purpose: LEAD_PURPOSES.includes(b.purpose) ? b.purpose : '',
      marketing: b.marketing === true,
      origin: ['hero', 'bottom'].includes(b.origin) ? b.origin : 'bottom',
      variant: b.variant === 'b' ? 'b' : 'a',
      attr, landing: clip(b.landing, 300), ua: clip(req.headers['user-agent'], 300),
      token: crypto.randomBytes(12).toString('hex'),
      dup: await academyFindByPhone(phone),
    };
    const id = await academyInsert(lead);
    res.json({ ok: true, id, token: lead.token });
  } catch (e) {
    console.error('academy lead save failed:', e.message);
    res.status(500).json({ ok: false, message: '일시적으로 접수가 어렵습니다. 잠시 후 다시 시도해 주세요.' });
  }
});

app.patch('/api/academy/lead/:id', async (req, res) => {
  try {
    const id = Number(req.params.id); const b = req.body || {};
    const token = await academyGetToken(id);
    if (!token || !safeEq(token, b.token)) return res.status(403).json({ ok: false });
    if (!LEAD_PURPOSES.includes(b.purpose)) return res.status(400).json({ ok: false });
    await academyPatch(id, { purpose: b.purpose });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false }); }
});

app.get('/api/academy/leads', async (req, res) => {
  if (!adminOk(req)) return res.status(401).json({ success: false, message: '비밀번호가 올바르지 않습니다.' });
  const data = await academyList();
  res.json({ success: true, data, total: data.length });
});

app.patch('/api/academy/leads/:id', async (req, res) => {
  if (!adminOk(req)) return res.status(401).json({ success: false });
  const b = req.body || {}; const patch = {};
  if (b.status !== undefined) { if (!LEAD_STATUS.includes(b.status)) return res.status(400).json({ success: false }); patch.status = b.status; }
  if (b.note !== undefined) patch.note = clip(b.note, 1000);
  const ok = await academyPatch(Number(req.params.id), patch);
  res.json({ success: ok });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/branch', (req, res) => {
  const branch = getBranch(req);
  res.json({
    slug: branch ? branch.slug : 'root',
    name: branch ? branch.name : '스칼프잇',
    bizNo: branch ? branch.bizNo : '',
    address: branch ? branch.address : '',
  });
});

app.post('/api/submit', async (req, res) => {
  const body = req.body;
  if (!body.name && !body.nameBirth) return res.status(400).json({ success: false, message: '필수 항목을 입력해주세요.' });
  const branch = getBranch(req);
  const entry = { id: Date.now(), submittedAt: new Date().toISOString(), branch: branch ? branch.name : '본사', ...body };
  await saveSubmission(entry);
  res.json({ success: true });
});

app.get('/api/submissions', async (req, res) => {
  if (!authPassword(req))
    return res.status(401).json({ success: false, message: '비밀번호가 올바르지 않습니다.' });
  let data = await getSubmissions();
  const branch = getBranch(req);
  if (branch) data = data.filter(d => d.branch === branch.name);
  res.json({ success: true, data, total: data.length });
});

app.delete('/api/submissions/:id', async (req, res) => {
  if (!authPassword(req))
    return res.status(401).json({ success: false });
  const branch = getBranch(req);
  if (branch) {
    const all = await getSubmissions();
    const entry = all.find(s => s.id === Number(req.params.id));
    if (!entry || entry.branch !== branch.name) return res.status(403).json({ success: false });
  }
  await deleteSubmission(Number(req.params.id));
  res.json({ success: true });
});

// 크리에이터 신청 API (Notion DB 저장)
const NOTION_APPLY_DS_ID = process.env.NOTION_APPLY_DS_ID || 'b475231c-18c2-4787-ae33-941fef157e95';
let notionClient = null;
if (process.env.NOTION_TOKEN) {
  try {
    const { Client } = require('@notionhq/client');
    notionClient = new Client({ auth: process.env.NOTION_TOKEN, notionVersion: '2025-09-03' });
  } catch (e) {
    console.error('Notion client init failed:', e.message);
  }
}

app.post('/api/apply/submit', async (req, res) => {
  const body = req.body || {};
  const { instagram, followers, gifted, visitDate, contact, category, country, upload, repost, health, lang } = body;
  const langCode = ['en', 'ko', 'ja', 'zh'].includes(lang) ? lang : 'unknown';
  const missing = [];
  if (!instagram) missing.push('instagram');
  if (!followers) missing.push('followers');
  if (!gifted) missing.push('gifted');
  if (!visitDate) missing.push('visitDate');
  if (!contact) missing.push('contact');
  if (!Array.isArray(category) || !category.length) missing.push('category');
  if (!country) missing.push('country');
  if (!upload) missing.push('upload');
  if (!repost) missing.push('repost');
  if (missing.length) return res.status(400).json({ message: 'Missing: ' + missing.join(', ') });

  // Notion 저장 시도
  if (notionClient) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const properties = {
        'Instagram / TikTok ID': { title: [{ text: { content: String(instagram).slice(0, 2000) } }] },
        'Follower Count': { rich_text: [{ text: { content: String(followers).slice(0, 2000) } }] },
        'Open to Gifted Collaboration': { select: { name: gifted === 'Yes' ? 'Yes' : 'No' } },
        'Planned Date of Visit': { rich_text: [{ text: { content: String(visitDate).slice(0, 2000) } }] },
        'Contact Information': { rich_text: [{ text: { content: String(contact).slice(0, 2000) } }] },
        'Primary Content Category': { multi_select: category.slice(0, 10).map((c) => ({ name: String(c) })) },
        'Country of Residence': { rich_text: [{ text: { content: String(country).slice(0, 2000) } }] },
        'Can Upload Reels/TikTok': { select: { name: upload === 'Yes' ? 'Yes' : 'No' } },
        'Can SCALPIT Repost': { select: { name: repost === 'Yes' ? 'Yes' : 'No' } },
        'Submitted At': { date: { start: today } },
      };
      if (health && String(health).trim()) {
        properties['Health Condition'] = { rich_text: [{ text: { content: String(health).slice(0, 2000) } }] };
      }
      await notionClient.pages.create({
        parent: { type: 'data_source_id', data_source_id: NOTION_APPLY_DS_ID },
        properties,
      });
    } catch (err) {
      console.error('Notion save failed, falling back to local:', err.message);
    }
  }

  // 로컬 fallback 저장 (Notion 실패 or NOTION_TOKEN 미설정 시)
  try {
    const entry = { id: Date.now(), submittedAt: new Date().toISOString(), branch: 'apply', lang: langCode, ...body };
    await saveSubmission(entry);
  } catch (e) {
    console.error('Local fallback save failed:', e.message);
  }

  res.status(200).json({ ok: true });
});

// 리뷰 API
app.post('/api/review', async (req, res) => {
  const body = req.body;
  if (!body.overallRating) return res.status(400).json({ success: false, message: '전체 만족도를 선택해주세요.' });
  const branch = getBranch(req);
  const entry = { id: Date.now(), submittedAt: new Date().toISOString(), branch: branch ? branch.name : '본사', ...body };
  if (pool) {
    const { id, submittedAt, ...data } = entry;
    await pool.query('INSERT INTO reviews (id, submitted_at, data) VALUES ($1, $2, $3)', [id, submittedAt, JSON.stringify(data)]);
  } else {
    const list = readReviews(); list.push(entry); writeReviews(list);
  }
  res.json({ success: true });
});

app.get('/api/reviews', async (req, res) => {
  if (!authPassword(req))
    return res.status(401).json({ success: false, message: '비밀번호가 올바르지 않습니다.' });
  let data;
  if (pool) {
    const result = await pool.query('SELECT id, submitted_at as "submittedAt", data FROM reviews ORDER BY id DESC');
    data = result.rows.map(r => ({ id: r.id, submittedAt: r.submittedAt, ...r.data }));
  } else { data = readReviews().reverse(); }
  const branch = getBranch(req);
  if (branch) data = data.filter(d => d.branch === branch.name);
  res.json({ success: true, data, total: data.length });
});

app.delete('/api/reviews/:id', async (req, res) => {
  if (!authPassword(req)) return res.status(401).json({ success: false });
  const branch = getBranch(req);
  if (branch) {
    let data;
    if (pool) {
      const result = await pool.query('SELECT id, submitted_at as "submittedAt", data FROM reviews WHERE id=$1', [Number(req.params.id)]);
      data = result.rows.map(r => ({ id: r.id, submittedAt: r.submittedAt, ...r.data }))[0];
    } else { data = readReviews().find(r => r.id === Number(req.params.id)); }
    if (!data || data.branch !== branch.name) return res.status(403).json({ success: false });
  }
  if (pool) { await pool.query('DELETE FROM reviews WHERE id=$1', [Number(req.params.id)]); }
  else { writeReviews(readReviews().filter(r => r.id !== Number(req.params.id))); }
  res.json({ success: true });
});

initDB().then(() => {
  app.listen(PORT, () => console.log(`✅ scalpitform 서버 실행: http://localhost:${PORT}`));
}).catch(err => {
  console.error('DB 초기화 실패, JSON 파일로 대체:', err.message);
  pool = null;
  app.listen(PORT, () => console.log(`✅ scalpitform 서버 실행 (JSON 모드): http://localhost:${PORT}`));
});
