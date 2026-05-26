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
