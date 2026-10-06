const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const BRANCHES = {
  cheonan: {
    name: '천안점',
    passwordEnv: 'CHEONAN_PASSWORD',
    // 비밀번호 원문은 저장소에 두지 않고 scrypt 해시만 보관 (환경변수가 있으면 환경변수 우선)
    passwordHash: 'scrypt$f72a4740164f016b801d045841919860$d5924b2b6a5b93a504e73464eca888420bc45faf94c3431edab4c9b07e8cfa39',
    bizNo: '657-01-03945',
    address: '충청남도 천안시 서북구 불당21로 67-8, 2층 208,209호',
    // 방문 안내·리뷰 링크 (비어 있으면 지점명으로 지도 검색 링크를 자동 생성)
    phone: '',
    parking: '',
    naverPlaceUrl: '',
    kakaoPlaceUrl: '',
    googlePlaceUrl: '',
  },
  dongtan: {
    name: '동탄점',
    passwordEnv: 'DONGTAN_PASSWORD',
    // 비밀번호 원문은 저장소에 두지 않고 scrypt 해시만 보관 (환경변수가 있으면 환경변수 우선)
    passwordHash: 'scrypt$36c6c18d6693f6b66ceb1bde61013355$5a2b3dcbe5244cf13d2274f38b81643efff41b232ca2d183974062e912ae5f49',
    bizNo: '501-75-00684',
    address: '경기도 화성시 동탄오산로 86-10, 4층 405호',
    // 방문 안내·리뷰 링크 (비어 있으면 지점명으로 지도 검색 링크를 자동 생성)
    phone: '',
    parking: '',
    naverPlaceUrl: '',
    kakaoPlaceUrl: '',
    googlePlaceUrl: '',
  },
  gwanggyo: {
    name: '광교점',
    passwordEnv: 'GWANGGYO_PASSWORD',
    // 비밀번호 원문은 저장소에 두지 않고 scrypt 해시만 보관 (환경변수가 있으면 환경변수 우선)
    passwordHash: 'scrypt$adaf958f51f1f6935561994a568b89a4$68553de157b9630b41d409d7e727d05cb227abcd9f9298dc3f28595c841a6317',
    bizNo: '213-35-98664',
    address: '경기도 수원시 영통구 법조로 25(하동) 1114~1116호',
    // 방문 안내·리뷰 링크 (비어 있으면 지점명으로 지도 검색 링크를 자동 생성)
    phone: '',
    parking: '',
    naverPlaceUrl: '',
    kakaoPlaceUrl: '',
    googlePlaceUrl: '',
  },
  apgujeong: {
    name: '압구정로데오점',
    passwordEnv: 'APGUJEONG_PASSWORD',
    // 비밀번호 원문은 저장소에 두지 않고 scrypt 해시만 보관 (환경변수가 있으면 환경변수 우선)
    passwordHash: 'scrypt$984371ab84d61fb1a479e16a46dd4c3b$b073ec5d1c3bdb14a203118aeec4235a2c6e29bb2875d3f1cf7ebe6aaec51d63',
    bizNo: '407-11-65011',
    address: '서울특별시 강남구 신사동 644-3 세화빌딩 3층 (CU건물 3층)',
    // 방문 안내·리뷰 링크 (비어 있으면 지점명으로 지도 검색 링크를 자동 생성)
    phone: '',
    parking: '',
    naverPlaceUrl: '',
    kakaoPlaceUrl: '',
    googlePlaceUrl: '',
  },
};
// 브랜드 공통 링크 (비어 있으면 버튼을 숨김)
const BRAND = {
  kakaoChannelUrl: '',
  instagramUrl: '',
};

// 동의 문구가 바뀌면 버전을 올려서, 고객이 어떤 문구에 동의했는지 기록으로 남김
const CONSENT_VERSION = '2026-10-06';

// 본사 관리자 비밀번호는 환경변수로만 설정 (미설정 시 본사 관리자 로그인 불가)
const ROOT_PASSWORD = process.env.ADMIN_PASSWORD || '';
if (!ROOT_PASSWORD) console.warn('⚠️  ADMIN_PASSWORD 환경변수가 없어 본사 관리자 화면에 로그인할 수 없습니다.');

function getBranch(req) {
  // 1) query param ?b=slug  2) URL path prefix /slug/...  3) subdomain (legacy)
  const qb = req.query.b;
  if (typeof qb === 'string' && BRANCHES[qb]) return { slug: qb, ...BRANCHES[qb] };
  const pathSlug = req.path.split('/').filter(Boolean)[0];
  if (pathSlug && BRANCHES[pathSlug]) return { slug: pathSlug, ...BRANCHES[pathSlug] };
  const host = (req.headers.host || '').split(':')[0];
  const subdomain = host.split('.')[0];
  if (BRANCHES[subdomain]) return { slug: subdomain, ...BRANCHES[subdomain] };
  return null;
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyHash(given, stored) {
  const [, salt, hash] = String(stored).split('$');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(String(given), salt, 32, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(derived, Buffer.from(hash, 'hex'));
}

function authPassword(req) {
  const given = req.headers['x-admin-password'] || '';
  if (!given) return false;
  const branch = getBranch(req);
  if (!branch) return !!ROOT_PASSWORD && safeEqual(given, ROOT_PASSWORD);
  const envPw = process.env[branch.passwordEnv];
  return envPw ? safeEqual(given, envPw) : verifyHash(given, branch.passwordHash);
}

let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

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

async function initDB() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id BIGINT PRIMARY KEY,
      submitted_at TIMESTAMPTZ DEFAULT NOW(),
      data JSONB NOT NULL
    );
  `);
}

// pg는 BIGINT를 문자열로 돌려주므로 숫자로 맞추고, data 안의 값이 id를 덮어쓰지 못하게 순서 고정
const fromRow = r => ({ ...r.data, id: Number(r.id), submittedAt: r.submittedAt });

async function getSubmissions() {
  if (pool) {
    const res = await pool.query('SELECT id, submitted_at as "submittedAt", data FROM submissions ORDER BY id ASC');
    return res.rows.map(fromRow);
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
    writeJson(readJson().filter(s => Number(s.id) !== id));
  }
}

// 동시 제출 시에도 PK가 겹치지 않도록 ms 타임스탬프 × 1000 + 시퀀스 (Number.MAX_SAFE_INTEGER 이내)
let lastId = 0;
function nextId() {
  lastId = Math.max(Date.now() * 1000, lastId + 1);
  return lastId;
}

// ── 입력값 정리: 허용된 필드만, 길이 제한 ──
function pick(body, strings, arrays = {}) {
  const out = {};
  for (const [key, max] of Object.entries(strings)) {
    if (typeof body[key] === 'string') out[key] = body[key].trim().slice(0, max);
  }
  for (const [key, max] of Object.entries(arrays)) {
    if (Array.isArray(body[key])) {
      out[key] = body[key].filter(v => typeof v === 'string').slice(0, max).map(v => v.trim().slice(0, 120));
    }
  }
  return out;
}

const SUBMIT_STRINGS = {
  lang: 5, reservationType: 100, consultationType: 100,
  visitDate: 10, visitTime: 5,
  nameBirth: 80, name: 40, phone: 30, address: 100,
  visitSource: 60, permFrequency: 200, shampooFrequency: 120,
  hairLossGenetic: 20, pregnancyStatus: 30, videoConsent: 20,
};
const SUBMIT_ARRAYS = { treatmentHistory: 10, scalpConcerns: 15, cautions: 10, desiredServices: 10 };

// 두피 자가진단(/scalp-test) 결과: 유형 + 5개 영역 점수(각 0~12)
const SCALP_TYPES = ['OILY', 'DRY', 'SENSITIVE', 'SEBORRHEIC', 'HAIR_LOSS', 'BALANCED', 'PREGNANCY'];
const SCALP_AREAS = ['oil', 'dry', 'sensitive', 'seborrheic', 'hairloss'];
function pickScalpTest(v) {
  if (!v || typeof v !== 'object' || !SCALP_TYPES.includes(v.type)) return null;
  const scores = {};
  for (const k of SCALP_AREAS) {
    const n = Number(v.scores && v.scores[k]);
    if (Number.isInteger(n) && n >= 0 && n <= 12) scores[k] = n;
  }
  return { type: v.type, scores };
}

const TRACKING_STRINGS = { from: 40, utm_source: 80, utm_medium: 80, utm_campaign: 120, ref: 120 };


// ── 간단한 IP 기반 요청 제한 (외부 의존성 없이) ──
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, h] of hits) if (now - h.start > windowMs) hits.delete(ip);
  }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    const h = hits.get(req.ip);
    if (!h || now - h.start > windowMs) { hits.set(req.ip, { start: now, count: 1 }); return next(); }
    if (++h.count > max) return res.status(429).json({ success: false, message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
    next();
  };
}
const submitLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 15 });
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });

// 비동기 라우트 에러가 서버를 멈추지 않도록 감싸기
const wrap = fn => (req, res) => fn(req, res).catch(err => {
  console.error(`${req.method} ${req.path} 실패:`, err);
  if (!res.headersSent) res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
});

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (/admin/.test(req.path) || req.path.startsWith('/api/submissions'))
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.use(express.json({ limit: '50kb' }));

// 매장별 경로 라우팅
Object.keys(BRANCHES).forEach(slug => {
  app.get(`/${slug}`, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
  app.get(`/${slug}/global`, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html'))); // 외국 고객용(언어 선택부터)
  app.get(`/${slug}/admin`, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
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

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

function publicBranch(branch) {
  if (!branch) return { slug: 'root', name: '스칼프잇', bizNo: '', address: '', ...BRAND };
  const q = encodeURIComponent(`스칼프잇 ${branch.name}`);
  return {
    slug: branch.slug,
    name: branch.name,
    bizNo: branch.bizNo,
    address: branch.address,
    phone: branch.phone,
    parking: branch.parking,
    naverMapUrl: branch.naverPlaceUrl || `https://map.naver.com/p/search/${q}`,
    kakaoMapUrl: branch.kakaoPlaceUrl || `https://map.kakao.com/link/search/${q}`,
    googleMapUrl: branch.googlePlaceUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.address)}`,
    ...BRAND,
  };
}

app.get('/api/branch', (req, res) => res.json(publicBranch(getBranch(req))));
app.get('/api/branches', (req, res) => res.json(Object.entries(BRANCHES).map(([slug, b]) => ({ slug, name: b.name }))));

// 채널별 링크용 QR 코드 (이 사이트 주소만 허용)
app.get('/api/qr', wrap(async (req, res) => {
  const text = String(req.query.text || '');
  const origin = `${req.protocol}://${req.get('host')}/`;
  if (text.length > 300 || !(text.startsWith(origin) || text.startsWith('https://scalpitform.com/')))
    return res.status(400).json({ success: false });
  const QRCode = require('qrcode');
  const png = await QRCode.toBuffer(text, { width: 600, margin: 2, color: { dark: '#1E1214', light: '#FFFFFF' } });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(png);
}));

app.post('/api/submit', submitLimiter, wrap(async (req, res) => {
  const body = req.body || {};
  const data = pick(body, SUBMIT_STRINGS, SUBMIT_ARRAYS);
  if (!data.name && !data.nameBirth) return res.status(400).json({ success: false, message: '필수 항목을 입력해주세요.' });
  if (body.privacyConsent === false || body.sensitiveConsent === false)
    return res.status(400).json({ success: false, message: '필수 동의 항목에 동의해주세요.' });
  data.marketingConsent = body.marketingConsent === true;
  if (body.privacyConsent === true) {
    data.privacyConsent = true;
    // 동의 증빙: 어떤 버전의 문구에 언제 동의했는지 서버 시각으로 기록
    data.consents = {
      privacy: true,
      sensitive: body.sensitiveConsent === true,
      marketing: data.marketingConsent,
      version: CONSENT_VERSION,
      at: new Date().toISOString(),
    };
  }
  const scalpTest = pickScalpTest(body.scalpTest);
  if (scalpTest) data.scalpTest = scalpTest;
  if (body.tracking && typeof body.tracking === 'object') {
    const tracking = pick(body.tracking, TRACKING_STRINGS);
    if (Object.keys(tracking).length) data.tracking = tracking;
  }
  const branch = getBranch(req);
  await saveSubmission({ ...data, id: nextId(), submittedAt: new Date().toISOString(), branch: branch ? branch.name : '본사' });
  res.json({ success: true });
}));

app.get('/api/submissions', adminLimiter, wrap(async (req, res) => {
  if (!authPassword(req))
    return res.status(401).json({ success: false, message: '비밀번호가 올바르지 않습니다.' });
  let data = await getSubmissions();
  const branch = getBranch(req);
  if (branch) data = data.filter(d => d.branch === branch.name);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data, total: data.length, storage: pool ? 'postgres' : 'file' });
}));

app.delete('/api/submissions/:id', adminLimiter, wrap(async (req, res) => {
  if (!authPassword(req))
    return res.status(401).json({ success: false });
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id)) return res.status(400).json({ success: false });
  const branch = getBranch(req);
  if (branch) {
    const all = await getSubmissions();
    const entry = all.find(s => Number(s.id) === id);
    if (!entry || entry.branch !== branch.name) return res.status(403).json({ success: false });
  }
  await deleteSubmission(id);
  res.json({ success: true });
}));

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

app.post('/api/apply/submit', submitLimiter, wrap(async (req, res) => {
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
    const entry = { ...body, id: nextId(), submittedAt: new Date().toISOString(), branch: 'apply', lang: langCode };
    await saveSubmission(entry);
  } catch (e) {
    console.error('Local fallback save failed:', e.message);
  }

  res.status(200).json({ ok: true });
}));


initDB().then(() => {
  app.listen(PORT, () => console.log(`✅ scalpitform 서버 실행: http://localhost:${PORT} (${pool ? 'PostgreSQL' : 'JSON 파일'} 저장)`));
}).catch(err => {
  console.error('DB 초기화 실패, JSON 파일로 대체:', err.message);
  pool = null;
  app.listen(PORT, () => console.log(`✅ scalpitform 서버 실행 (JSON 모드): http://localhost:${PORT}`));
});
