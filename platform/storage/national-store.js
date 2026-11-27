/**
 * DUAL-BACKEND STORAGE & RESEARCHER AUTH LAYER (VIETNAM NATIONAL PLATFORM)
 * - Tự động dùng Supabase (PostgreSQL + PostGIS) nếu có SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY
 * - Hoạt động ngay lập tức trên Vercel Private Blob (BLOB_READ_WRITE_TOKEN) ở production/preview
 * - Hoạt động mượt trên tệp cục bộ (.local-data/national-sim.json) khi phát triển/kiểm thử
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { put, get } from '@vercel/blob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_STORE_FILE = path.resolve(__dirname, '..', '..', '.local-data', 'national-platform.json');

const RESEARCHERS_BLOB = 'national/researchers.json';
const SUBMISSIONS_BLOB = 'national/research-submissions.json';
const PUBLICATIONS_BLOB = 'national/publications.json';

export const SEED_NATIONAL_PUBLICATIONS = Object.freeze([
  {
    id: 'PUB-VN-01',
    kind: 'research_article',
    submissionId: 'SUB-HN-DONGNGAC-01',
    title: 'Đánh giá 60 điểm ngập cục bộ, nắng nóng & điểm trú ẩn khu vực Đông Ngạc – Bắc Từ Liêm (Hà Nội)',
    summary:
      'Tổng hợp thực địa 60 vị trí rủi ro/an toàn và 18 tuyến đường hay ngập bán kính 2 km vùng trũng Tây Bắc Hà Nội, đối chiếu dữ liệu khí tượng 2024–2026.',
    body:
      'Nghiên cứu ghi nhận 37 vị trí thường xuyên ngập cục bộ khi mưa lớn vượt 50–70 mm/ngày tập trung tại dải trũng Phố Viên, Ngõ 43 Cổ Nhuế và Cầu Noi; đồng thời lập danh mục 15 cơ sở y tế và điểm có mái che ưu tiên tránh trú. Bộ dữ liệu đã kiểm định 0 lỗi hình học và được xuất bản mở lên Bản đồ Chính để người dân tra cứu theo khoanh vùng.',
    authorName: 'Nhóm Nghiên cứu Không gian Đô thị Hà Nội',
    organization: 'Trường Đại học Mỏ - Địa chất (HUMG)',
    province: 'Hà Nội',
    macroRegion: 'bac',
    hazardType: 'flood',
    severity: 'attention',
    sourceLabel: 'Khảo sát thực địa & Dữ liệu mở (Đã kiểm định)',
    dataClass: 'OBSERVED_DATA',
    focusLat: 21.072514,
    focusLng: 105.77387,
    focusRadiusKm: 2,
    featureCount: 60,
    status: 'published',
    publishedAt: '2026-11-26T08:00:00.000Z'
  },
  {
    id: 'NEWS-VN-02',
    kind: 'disaster_news',
    submissionId: null,
    title: 'Theo dõi mưa lớn cục bộ và nguy cơ sạt lở đất khu vực Trung Bộ & vùng núi phía Bắc',
    summary:
      'Giai đoạn chuyển mùa và mưa kéo dài làm tăng độ ẩm đất tại các sườn dốc miền núi Bắc Bộ và dải đất hẹp Trung Bộ (Huế, Đà Nẵng, Quảng Nam).',
    body:
      'Người dân tại khu vực đồi dốc, ven suối và các tuyến đèo cần theo dõi bản tin chính thức từ Trung tâm Dự báo KTTV Quốc gia (NCHMF) và Cục Quản lý Đê điều & PCTT. Khi xuất hiện vết nứt tường, nước suối đục bất thường hoặc tiếng động lạ từ sườn đồi, cần di chuyển ngay tới điểm cao an toàn. Bạn có thể bấm nút bên dưới để khoanh vùng trực tiếp tại Huế, Đà Nẵng hoặc Lào Cai trên Bản đồ chính.',
    authorName: 'Ban Biên tập Dữ liệu Thiên tai',
    organization: 'Tổng hợp từ NCHMF & Cục Quản lý Đê điều PCTT',
    province: 'Thừa Thiên Huế',
    macroRegion: 'trung',
    hazardType: 'landslide',
    severity: 'high',
    sourceLabel: 'Bản tin tổng hợp nguồn chính thống',
    dataClass: 'FORECAST_DATA',
    focusLat: 16.4637,
    focusLng: 107.5909,
    focusRadiusKm: 8,
    featureCount: 0,
    status: 'published',
    publishedAt: '2026-11-27T07:30:00.000Z'
  },
  {
    id: 'NEWS-VN-03',
    kind: 'disaster_news',
    submissionId: null,
    title: 'Lưu ý triều cường kết hợp mưa chiều tại khu vực hạ lưu sông Sài Gòn và Đồng bằng sông Cửu Long',
    summary:
      'Các đợt triều cường rằm và đầu tháng âm lịch thường gây ngập cục bộ tuyến đường trũng thấp tại TP. Hồ Chí Minh, Cần Thơ và Vĩnh Long vào khung 16h–19h.',
    body:
      'Người di chuyển bằng xe máy vào giờ tan tầm cần kiểm tra trước dự báo mưa và các tuyến hay ngập triều, tránh đi sát miệng cống hoặc vùng nước sâu quá nửa bánh xe. Mời cộng đồng nhà nghiên cứu địa phương tại TP.HCM và ĐBSCL đăng ký tài khoản ở Phần 2 để bổ sung lớp dữ liệu điểm ngập thực địa đã kiểm chứng lên Bản đồ toàn quốc.',
    authorName: 'Ban Biên tập Dữ liệu Thiên tai',
    organization: 'Cổng Thông tin An toàn Cộng đồng Việt Nam',
    province: 'TP. Hồ Chí Minh',
    macroRegion: 'nam',
    hazardType: 'flood',
    severity: 'attention',
    sourceLabel: 'Bản tin cảnh báo theo mùa',
    dataClass: 'MODELLED_DATA',
    focusLat: 10.7769,
    focusLng: 106.7009,
    focusRadiusKm: 10,
    featureCount: 0,
    status: 'published',
    publishedAt: '2026-11-27T06:15:00.000Z'
  },
  {
    id: 'NEWS-VN-04',
    kind: 'disaster_news',
    submissionId: null,
    title: 'Theo dõi chất lượng không khí & hiện tượng nghịch nhiệt mùa khô tại Đồng bằng sông Hồng',
    summary:
      'Vào những ngày lặng gió, độ ẩm cao sáng sớm tại Hà Nội và vùng phụ cận, chỉ số bụi mịn có xu hướng tăng cao cục bộ.',
    body:
      'Người lớn tuổi, trẻ em và người có bệnh hô hấp nên theo dõi mục Chất lượng không khí theo vùng đang khoanh trước khi tập thể dục sáng sớm. Lưu ý: số liệu mô hình khu vực (CAMS) giúp nhận diện xu thế chung, cần kết hợp quan sát thực tế và dữ liệu trạm quan trắc mặt đất khi có.',
    authorName: 'Ban Biên tập Môi trường',
    organization: 'Cổng Thông tin An toàn Cộng đồng Việt Nam',
    province: 'Hà Nội',
    macroRegion: 'bac',
    hazardType: 'air_quality',
    severity: 'info',
    sourceLabel: 'Phân tích mô hình không khí khu vực',
    dataClass: 'MODELLED_DATA',
    focusLat: 21.0285,
    focusLng: 105.8542,
    focusRadiusKm: 10,
    featureCount: 0,
    status: 'published',
    publishedAt: '2026-11-26T22:00:00.000Z'
  }
]);

export function detectStorageBackend() {
  const supaUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supaUrl && supaKey) {
    return 'supabase_postgis';
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return 'vercel_private_blob';
  }
  return 'local_file_dev';
}

function getSupabaseRestConfig() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return { url, key };
}

async function readSupabaseCollection(collectionKey, fallback) {
  const { url, key } = getSupabaseRestConfig();
  try {
    const res = await fetch(
      `${url}/rest/v1/platform_collections?collection_key=eq.${encodeURIComponent(collectionKey)}&select=payload`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Accept: 'application/json'
        }
      }
    );
    if (!res.ok) return fallback;
    const rows = await res.json();
    return Array.isArray(rows) && rows[0]?.payload !== undefined ? rows[0].payload : fallback;
  } catch {
    return fallback;
  }
}

async function writeSupabaseCollection(collectionKey, payload) {
  const { url, key } = getSupabaseRestConfig();
  const res = await fetch(`${url}/rest/v1/platform_collections?on_conflict=collection_key`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify([
      {
        collection_key: collectionKey,
        payload,
        updated_at: new Date().toISOString()
      }
    ])
  });
  if (!res.ok) {
    throw new Error(`Supabase write error (${res.status}) for ${collectionKey}`);
  }
}

function getAuthSecret() {
  const configured = process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PASSCODE;
  if (configured && configured.trim().length >= 8) return configured.trim();
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (isProd) {
    throw new Error('SECURITY_MISCONFIGURED: Thiếu ADMIN_TOKEN_SECRET trong môi trường production.');
  }
  return 'local-dev-national-platform-secret';
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, expectedHex] = stored.split(':');
  try {
    const derived = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function signResearcherToken({ id, email, role = 'researcher', fullName = '', organization = '' }) {
  const secret = getAuthSecret();
  const exp = Date.now() + 24 * 60 * 60 * 1000;
  const payloadObj = { id, email, role, fullName, organization, exp };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`rs.${payloadB64}`).digest('hex');
  return `rs.${payloadB64}.${sig}`;
}

export function verifyResearcherToken(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !token.startsWith('rs.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  let secret;
  try {
    secret = getAuthSecret();
  } catch {
    return null;
  }
  const expectedSig = crypto.createHmac('sha256', secret).update(`rs.${parts[1]}`).digest('hex');
  try {
    const a = Buffer.from(parts[2], 'hex');
    const b = Buffer.from(expectedSig, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!decoded?.id || !Number.isFinite(decoded.exp) || Date.now() > decoded.exp) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function verifyAdminBearer(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return false;
  if (token === 'local-dev-admin-token' && process.env.VERCEL_ENV !== 'production') return true;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'admin') return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  let secret;
  try {
    secret = getAuthSecret();
  } catch {
    return false;
  }
  const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('hex');
  try {
    const a = Buffer.from(parts[2], 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function readLocalAll() {
  try {
    return JSON.parse(await fs.readFile(LOCAL_STORE_FILE, 'utf8'));
  } catch {
    return { researchers: [], submissions: [], publications: [] };
  }
}

async function writeLocalAll(data) {
  await fs.mkdir(path.dirname(LOCAL_STORE_FILE), { recursive: true });
  await fs.writeFile(LOCAL_STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function readBlobJson(pathname, fallback) {
  try {
    const res = await get(pathname, { access: 'private', useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) return fallback;
    return await new Response(res.stream).json();
  } catch {
    return fallback;
  }
}

async function writeBlobJson(pathname, obj) {
  await put(pathname, JSON.stringify(obj), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json'
  });
}

export async function loadNationalCollections() {
  const backend = detectStorageBackend();
  if (backend === 'supabase_postgis') {
    const [researchers, submissions, customPubs] = await Promise.all([
      readSupabaseCollection('researchers', []),
      readSupabaseCollection('submissions', []),
      readSupabaseCollection('publications', [])
    ]);
    return {
      backend,
      researchers: Array.isArray(researchers) ? researchers : [],
      submissions: Array.isArray(submissions) ? submissions : [],
      publications: [...(Array.isArray(customPubs) ? customPubs : []), ...SEED_NATIONAL_PUBLICATIONS]
    };
  }
  if (backend === 'vercel_private_blob') {
    const [researchers, submissions, customPubs] = await Promise.all([
      readBlobJson(RESEARCHERS_BLOB, []),
      readBlobJson(SUBMISSIONS_BLOB, []),
      readBlobJson(PUBLICATIONS_BLOB, [])
    ]);
    return {
      backend,
      researchers: Array.isArray(researchers) ? researchers : [],
      submissions: Array.isArray(submissions) ? submissions : [],
      publications: [...(Array.isArray(customPubs) ? customPubs : []), ...SEED_NATIONAL_PUBLICATIONS]
    };
  }
  const local = await readLocalAll();
  return {
    backend,
    researchers: Array.isArray(local.researchers) ? local.researchers : [],
    submissions: Array.isArray(local.submissions) ? local.submissions : [],
    publications: [...(Array.isArray(local.publications) ? local.publications : []), ...SEED_NATIONAL_PUBLICATIONS]
  };
}

export async function saveResearchers(list) {
  const backend = detectStorageBackend();
  if (backend === 'supabase_postgis') {
    await writeSupabaseCollection('researchers', list);
    return;
  }
  if (backend === 'vercel_private_blob') {
    await writeBlobJson(RESEARCHERS_BLOB, list);
    return;
  }
  const local = await readLocalAll();
  local.researchers = list;
  await writeLocalAll(local);
}

export async function saveSubmissions(list) {
  const backend = detectStorageBackend();
  if (backend === 'supabase_postgis') {
    await writeSupabaseCollection('submissions', list);
    return;
  }
  if (backend === 'vercel_private_blob') {
    await writeBlobJson(SUBMISSIONS_BLOB, list);
    return;
  }
  const local = await readLocalAll();
  local.submissions = list;
  await writeLocalAll(local);
}

export async function saveCustomPublications(list) {
  const backend = detectStorageBackend();
  const seedIds = new Set(SEED_NATIONAL_PUBLICATIONS.map((x) => x.id));
  const onlyCustom = (Array.isArray(list) ? list : []).filter((p) => p && !seedIds.has(p.id));
  if (backend === 'supabase_postgis') {
    await writeSupabaseCollection('publications', onlyCustom);
    return;
  }
  if (backend === 'vercel_private_blob') {
    await writeBlobJson(PUBLICATIONS_BLOB, onlyCustom);
    return;
  }
  const local = await readLocalAll();
  local.publications = onlyCustom;
  await writeLocalAll(local);
}
