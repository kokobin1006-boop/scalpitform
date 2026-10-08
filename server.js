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
    // 외국어 화면에 보이는 지점명
    names: { en: 'Cheonan', zh: '天安店', ja: '天安店' },
    // 방문 안내 (설문 완료 화면 '오시는 길'·자주 묻는 질문). 지도 링크가 비어 있으면 지점명으로 검색 링크를 자동 생성
    phone: '070-4027-6788',
    visitAddress: '충남 천안시 서북구 불당21로 67-8 정석프라자 4차 2층 (롯데시네마 건물)',
    parking: {
      ko: '롯데시네마 건물 지하주차장을 이용해 주세요. 최대 2시간 무료예요. 혼잡할 수 있으니 20분 일찍 출발해 주세요.',
      en: 'Please use the underground parking of the Lotte Cinema building (free for up to 2 hours). It can get busy, so please leave 20 minutes early.',
      zh: '请使用乐天影院大楼的地下停车场（最多免费2小时）。可能比较拥挤，建议提前20分钟出发。',
      ja: 'ロッテシネマの建物の地下駐車場をご利用ください（最大2時間無料）。混雑する場合がありますので、20分ほど早めにお出かけください。',
    },
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
    names: { en: 'Dongtan', zh: '东滩店', ja: '東灘店' },
    phone: '031-372-7336',
    visitAddress: '경기 화성시 동탄오산로 86-10 동탄역 리코빌 4층 405호',
    transit: { ko: '동탄역 2번 출구에서 걸어서 5분', en: '5-minute walk from Dongtan Station Exit 2', zh: '东滩站2号出口步行5分钟', ja: '東灘駅2番出口から徒歩5分' },
    parking: {
      ko: "건물 지하주차장을 이용해 주세요. '제주 오니네집 냉동삼겹살' 간판 왼쪽 입구로 들어오시면 돼요. 최대 2시간 무료예요.",
      en: "Please use the building's underground parking. The entrance is to the left of the '제주 오니네집 냉동삼겹살' (pork BBQ restaurant) sign. Free for up to 2 hours.",
      zh: '请使用大楼地下停车场，入口在“제주 오니네집 냉동삼겹살”（烤五花肉店）招牌的左侧。最多免费2小时。',
      ja: '建物の地下駐車場をご利用ください。「제주 오니네집 냉동삼겹살」（サムギョプサル店）の看板の左側が入口です。最大2時間無料です。',
    },
    closed: { ko: '매주 화요일', en: 'Every Tuesday', zh: '每周二', ja: '毎週火曜日' },
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
    names: { en: 'Gwanggyo', zh: '光教店', ja: '光教店' },
    phone: '070-5066-2041',
    visitAddress: '경기 수원시 영통구 법조로 25, 광교 SK VIEW Lake A동 11층 1114~1116호',
    parking: {
      ko: '2시간 무료예요. 혼잡할 수 있으니 20분 일찍 출발해 주세요.',
      en: 'Free for 2 hours. It can get busy, so please leave 20 minutes early.',
      zh: '免费停车2小时。可能比较拥挤，建议提前20分钟出发。',
      ja: '2時間無料です。混雑する場合がありますので、20分ほど早めにお出かけください。',
    },
    directionsVideo: 'hkUj69Wk9T8', // 찾아오는 길 영상 (YouTube 영상 ID)
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
    names: { en: 'Apgujeong Rodeo', zh: '狎鸥亭罗德奥店', ja: '狎鴎亭ロデオ店' },
    phone: '070-4010-4428',
    visitAddress: '서울 강남구 언주로168길 15, 3층',
    parking: {
      ko: '압구정로42길 35 CU 옆 발렛부스를 이용해 주세요. 2시간 5,000원(유료)이에요. 붐빌 수 있으니 20분 일찍 출발해 주세요.',
      en: 'Please use the valet booth next to CU at 35 Apgujeong-ro 42-gil (paid, ₩5,000 for 2 hours). It can get busy, so please leave 20 minutes early.',
      zh: '请使用狎鸥亭路42街35号CU便利店旁的代客泊车亭（收费，2小时5,000韩元）。可能比较拥挤，建议提前20分钟出发。',
      ja: '狎鴎亭路42ギル35のCU横にあるバレーパーキングをご利用ください（有料・2時間5,000ウォン）。混雑する場合がありますので、20分ほど早めにお出かけください。',
    },
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
const CONSENT_VERSION = '2026-10-07b';

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
    ALTER TABLE academy_leads
      ADD COLUMN IF NOT EXISTS slot TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS updated_by TEXT NOT NULL DEFAULT '';
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

// 카톡·문자 링크 미리보기에 지점명이 보이도록 설문 페이지의 제목·OG 태그를 지점별로 바꿔서 응답
const FORM_HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const escAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function branchFormHtml(slug, global) {
  const b = BRANCHES[slug];
  const title = global ? `Scálpit ${(b.names && b.names.en) || b.name} | Pre-visit Form` : `Scálpit ${b.name} | 사전 상담 설문지`;
  const desc = global
    ? 'Please fill out this 3-minute form before your visit. English · 中文 · 日本語 · 한국어'
    : '방문 전 3분, 나에게 맞는 두피 케어를 위한 사전 설문을 작성해주세요.';
  const url = `https://scalpitform.com/${slug}${global ? '/global' : ''}`;
  return FORM_HTML
    .replace(/<title>[^<]*<\/title>/, `<title>${escAttr(title)}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${escAttr(title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${escAttr(desc)}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${url}`);
}

// 매장별 경로 라우팅
Object.keys(BRANCHES).forEach(slug => {
  const koHtml = branchFormHtml(slug, false), globalHtml = branchFormHtml(slug, true);
  app.get(`/${slug}`, (req, res) => res.type('html').send(koHtml));
  app.get(`/${slug}/global`, (req, res) => res.type('html').send(globalHtml)); // 외국 고객용(언어 선택부터)
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


// ───────────────────────────────────────────────────────────────────────────
// 아카데미 원데이 클래스 랜딩 (/academy) — DB(리드) 수집
//   - 랜딩: GET /academy        (환경변수 GTM_ID, META_PIXEL_ID 가 있으면 추적 코드를 주입)
//   - 신청: POST /api/academy/lead, 접수 직후 목적 보완: PATCH /api/academy/lead/:id (토큰)
//   - 관리: GET /academy/admin, GET /api/academy/leads, PATCH /api/academy/leads/:id (x-admin-password)
// ───────────────────────────────────────────────────────────────────────────
const ACADEMY_FILE = path.join(DATA_DIR, 'academy_leads.json');
const LEAD_STATUS = ['new', 'contacted', 'paid', 'confirmed', 'cancelled'];
const LEAD_SESSIONS = ['1020', '1027', 'both', 'waitlist'];
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
    slot: r.slot || '', updatedAt: r.updated_at || null, updatedBy: r.updated_by || '',
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

// patch 가능한 값만 반영합니다. by 가 있으면(관리자 수정) 마지막 수정 시각·수정자를 함께 기록하고,
// 수정된 신청을 돌려줍니다(없으면 null).
async function academyPatch(id, patch, by) {
  const allowed = ['purpose', 'status', 'note', 'slot'];
  const keys = Object.keys(patch).filter(k => allowed.includes(k) && patch[k] !== undefined);
  if (!keys.length) return null;
  if (pool) {
    const sets = keys.map((k, i) => `${k}=$${i + 2}`);
    const vals = keys.map(k => patch[k]);
    if (by !== undefined) { sets.push('updated_at=NOW()', `updated_by=$${keys.length + 2}`); vals.push(by); }
    const r = await pool.query(`UPDATE academy_leads SET ${sets.join(', ')} WHERE id=$1 RETURNING *`, [id, ...vals]);
    return r.rows[0] ? rowToLead(r.rows[0]) : null;
  }
  const list = readAcademyJson(); const l = list.find(x => x.id === id); if (!l) return null;
  keys.forEach(k => { l[k] = patch[k]; });
  if (by !== undefined) { l.updatedAt = new Date().toISOString(); l.updatedBy = by; }
  writeAcademyJson(list);
  const { token, ua, ...rest } = l; return rest;
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
function adminOk(req) {
  const given = req.headers['x-admin-password'] || '';
  return !!ROOT_PASSWORD && !!given && safeEqual(given, ROOT_PASSWORD);
}
function adminName(req) {
  try { return clip(decodeURIComponent(req.headers['x-admin-name'] || ''), 20).trim() || '관리자'; } catch { return '관리자'; }
}
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
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'n_media', 'n_query', 'n_ad', 'referrer', 'angle', 'lead'].forEach(k => {
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
  res.json({ success: true, data, total: data.length, serverTime: new Date().toISOString() });
});

app.patch('/api/academy/leads/:id', async (req, res) => {
  if (!adminOk(req)) return res.status(401).json({ success: false });
  const b = req.body || {}; const patch = {};
  if (b.status !== undefined) { if (!LEAD_STATUS.includes(b.status)) return res.status(400).json({ success: false }); patch.status = b.status; }
  if (b.note !== undefined) patch.note = clip(b.note, 1000);
  if (b.slot !== undefined) { if (!['', '1020', '1027'].includes(b.slot)) return res.status(400).json({ success: false }); patch.slot = b.slot; }
  const lead = await academyPatch(Number(req.params.id), patch, adminName(req));
  res.json({ success: !!lead, lead: lead || undefined });
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

function publicBranch(branch) {
  if (!branch) return { slug: 'root', name: '스칼프잇', bizNo: '', address: '', ...BRAND };
  const q = encodeURIComponent(`스칼프잇 ${branch.name}`);
  const visitAddress = branch.visitAddress || branch.address;
  return {
    slug: branch.slug,
    name: branch.name,
    names: branch.names || {},
    bizNo: branch.bizNo,
    address: branch.address,
    visitAddress,
    phone: branch.phone,
    parking: branch.parking || null,
    transit: branch.transit || null,
    closed: branch.closed || null,
    directionsVideo: branch.directionsVideo || '',
    naverMapUrl: branch.naverPlaceUrl || `https://map.naver.com/p/search/${q}`,
    kakaoMapUrl: branch.kakaoPlaceUrl || `https://map.kakao.com/link/search/${q}`,
    googleMapUrl: branch.googlePlaceUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visitAddress)}`,
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
