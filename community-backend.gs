/**
 * BACKEND GOOGLE APPS SCRIPT CHO WEB BẢN ĐỒ MỞ KHẢO SÁT CỘNG ĐỒNG & CỔNG QUẢN TRỊ DUYỆT ĐIỂM
 * Hỗ trợ:
 *  - doGet(): Trả danh sách điểm công khai + tổng lượt +1 xác nhận; hỗ trợ `?action=admin_list&pass=...` cho trang admin.html
 *  - doPost(): Nhận báo cáo mới (có ảnh xóa EXIF), nhận +1 xác nhận, tự gộp điểm trùng trong 50m, và kiểm duyệt (`admin_moderate`)
 *
 * HƯỚNG DẪN CÀI ĐẶT TRONG 60 GIÂY:
 * 1. Mở https://script.google.com -> Dự án mới -> Dán toàn bộ tệp này.
 * 2. Chạy `setupCommunityDatabase` -> copy Spreadsheet ID dán vào `SPREADSHEET_ID` bên dưới.
 * 3. Đổi `ADMIN_PASSCODE` thành mật khẩu bí mật của nhóm 3 người trước khi Triển khai (Deploy -> Web app -> Anyone).
 */

const SPREADSHEET_ID = 'PASTE_YOUR_GOOGLE_SHEET_ID_HERE';
const ADMIN_PASSCODE = 'HUMG2026-DETAI08'; // Hãy đổi mật khẩu riêng của nhóm trước khi triển khai
const CENTER_LAT = 21.072514;
const CENTER_LNG = 105.77387;
const MAX_ALLOWED_DISTANCE_KM = 6.0;

function setupCommunityDatabase() {
  const ss = SpreadsheetApp.create('HUMG_BanDoCongDong_PhuongDongNgac_Database');
  const reportSheet = ss.getActiveSheet();
  reportSheet.setName('Community_Reports');
  reportSheet.appendRow([
    'id',
    'createdAt',
    'status', // 'pending' | 'approved' | 'hidden'
    'confidenceTier', // 'C' | 'B' | 'A'
    'confirmCount',
    'reporterRole',
    'layerGroup',
    'category',
    'name',
    'lat',
    'lng',
    'waterScale',
    'frequency',
    'drainDuration',
    'hazardFlags',
    'notes',
    'consentAcceptedAt',
    'photoDataUrl'
  ]);

  const confirmSheet = ss.insertSheet('Point_Confirmations');
  confirmSheet.appendRow([
    'confirmId',
    'createdAt',
    'pointId',
    'reporterRole',
    'waterScaleObserved',
    'comment',
    'consentAcceptedAt'
  ]);

  Logger.log('====================================================');
  Logger.log('ĐÃ TẠO CƠ SỞ DỮ LIỆU BẢN ĐỒ CỘNG ĐỒNG THÀNH CÔNG!');
  Logger.log('Link Google Sheet: ' + ss.getUrl());
  Logger.log('Dán ID sau vào SPREADSHEET_ID: ' + ss.getId());
  Logger.log('====================================================');
}

function getSpreadsheet_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === 'PASTE_YOUR_GOOGLE_SHEET_ID_HERE') {
    throw new Error('Chưa cấu hình SPREADSHEET_ID trong community-backend.gs');
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function haversineKm_(lat1, lon1, lat2, lon2) {
  const toRad = function (d) { return (d * Math.PI) / 180; };
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

function roundCoordForPrivacy_(val, round20m) {
  const num = Number(val);
  if (round20m) return Math.round(num * 5000) / 5000;
  return Math.round(num * 100000) / 100000;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const ss = getSpreadsheet_();
    const rSheet = ss.getSheetByName('Community_Reports');
    const cSheet = ss.getSheetByName('Point_Confirmations');
    const isAdminList = e && e.parameter && e.parameter.action === 'admin_list' && e.parameter.pass === ADMIN_PASSCODE;

    const rValues = rSheet.getDataRange().getValues();
    const cValues = cSheet.getDataRange().getValues();

    const confirmCounts = {};
    for (let i = 1; i < cValues.length; i++) {
      const pid = String(cValues[i][2] || '');
      if (pid) confirmCounts[pid] = (confirmCounts[pid] || 0) + 1;
    }

    const reports = [];
    for (let i = 1; i < rValues.length; i++) {
      const row = rValues[i];
      const status = String(row[2] || 'pending');
      if (!isAdminList && status === 'hidden') continue;
      const id = String(row[0]);
      const extraConfirms = confirmCounts[id] || 0;
      const baseConfirms = Number(row[4] || 1) + extraConfirms;
      let tier = String(row[3] || 'C');
      if (tier === 'C' && baseConfirms >= 3) tier = 'B';

      reports.push({
        id: id,
        createdAt: row[1],
        status: status,
        confidenceTier: status === 'approved' ? tier : isAdminList ? tier : 'C',
        confirmCount: baseConfirms,
        reporterRole: row[5],
        layerGroup: row[6],
        category: row[7],
        name: row[8],
        lat: Number(row[9]),
        lng: Number(row[10]),
        waterScale: row[11],
        frequency: row[12],
        drainDuration: row[13],
        hazardFlags: row[14] ? String(row[14]).split(',').filter(Boolean) : [],
        notes: row[15],
        photoDataUrl: row[17] ? String(row[17]) : '',
        sourceType: row[5] || 'Cộng đồng báo cáo trên Web',
        sourceCitation: (row[5] || 'Cư dân khu vực') + ' đóng góp trực tuyến'
      });
    }

    return jsonOut_({
      ok: true,
      isAdmin: isAdminList,
      reports: reports,
      confirmCounts: confirmCounts,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const ss = getSpreadsheet_();
    const nowIso = new Date().toISOString();

    // Hành động kiểm duyệt cho Quản trị viên (admin.html)
    if (body.action === 'admin_moderate') {
      if (body.pass !== ADMIN_PASSCODE) {
        return jsonOut_({ ok: false, error: 'Sai mật khẩu quản trị.' });
      }
      const targetId = String(body.id || '').trim();
      const rSheet = ss.getSheetByName('Community_Reports');
      const rows = rSheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === targetId) {
          if (['approved', 'pending', 'hidden'].includes(body.status)) {
            rSheet.getRange(i + 1, 3).setValue(body.status);
          }
          if (['A', 'B', 'C'].includes(body.confidenceTier)) {
            rSheet.getRange(i + 1, 4).setValue(body.confidenceTier);
          }
          return jsonOut_({ ok: true, id: targetId, status: body.status, confidenceTier: body.confidenceTier });
        }
      }
      return jsonOut_({ ok: false, error: 'Không tìm thấy mã điểm cần kiểm duyệt.' });
    }

    if (!body.consentAccepted) {
      return jsonOut_({ ok: false, error: 'Cần xác nhận đồng ý cung cấp dữ liệu khảo sát theo quy định.' });
    }

    if (body.action === 'confirm_point') {
      const pointId = String(body.pointId || '').trim();
      if (!pointId) return jsonOut_({ ok: false, error: 'Thiếu mã điểm cần xác nhận.' });
      const cSheet = ss.getSheetByName('Point_Confirmations');
      cSheet.appendRow([
        'CF-' + Date.now(),
        nowIso,
        pointId,
        String(body.reporterRole || 'Cư dân / Sinh viên').slice(0, 80),
        String(body.waterScale || '').slice(0, 40),
        String(body.comment || '').slice(0, 300),
        nowIso
      ]);
      return jsonOut_({ ok: true, action: 'confirm_point', pointId: pointId });
    }

    if (body.action === 'submit_report') {
      const rawLat = Number(body.lat);
      const rawLng = Number(body.lng);
      if (!isFinite(rawLat) || !isFinite(rawLng)) {
        return jsonOut_({ ok: false, error: 'Tọa độ không hợp lệ.' });
      }
      const distKm = haversineKm_(CENTER_LAT, CENTER_LNG, rawLat, rawLng);
      if (distKm > MAX_ALLOWED_DISTANCE_KM) {
        return jsonOut_({ ok: false, error: 'Điểm đánh dấu nằm ngoài bán kính khảo sát 6 km quanh ĐH Mỏ - Địa chất.' });
      }

      const lat = roundCoordForPrivacy_(rawLat, Boolean(body.roundPrivacy));
      const lng = roundCoordForPrivacy_(rawLng, Boolean(body.roundPrivacy));
      const rSheet = ss.getSheetByName('Community_Reports');

      const existing = rSheet.getDataRange().getValues();
      for (let i = 1; i < existing.length; i++) {
        const exLat = Number(existing[i][9]);
        const exLng = Number(existing[i][10]);
        const exCat = String(existing[i][7]);
        if (exCat === body.category && haversineKm_(lat, lng, exLat, exLng) <= 0.05) {
          const newCount = Number(existing[i][4] || 1) + 1;
          rSheet.getRange(i + 1, 5).setValue(newCount);
          if (newCount >= 3 && String(existing[i][3]) === 'C') {
            rSheet.getRange(i + 1, 4).setValue('B');
          }
          return jsonOut_({ ok: true, mergedIntoId: existing[i][0], confirmCount: newCount });
        }
      }

      const safePhoto =
        typeof body.photoDataUrl === 'string' && body.photoDataUrl.startsWith('data:image/jpeg;base64,') && body.photoDataUrl.length < 42000
          ? body.photoDataUrl
          : '';

      const newId = 'CD-' + Utilities.getUuid().slice(0, 6).toUpperCase();
      rSheet.appendRow([
        newId,
        nowIso,
        'pending',
        'C',
        1,
        String(body.reporterRole || 'Cư dân khu vực').slice(0, 80),
        body.layerGroup === 'safe' ? 'safe' : 'risk',
        String(body.category || 'flood').slice(0, 30),
        String(body.name || 'Điểm người dân báo').slice(0, 150),
        lat,
        lng,
        String(body.waterScale || 'ankle').slice(0, 40),
        String(body.frequency || '').slice(0, 100),
        String(body.drainDuration || '').slice(0, 80),
        Array.isArray(body.hazardFlags) ? body.hazardFlags.join(',') : '',
        String(body.notes || '').slice(0, 500),
        nowIso,
        safePhoto
      ]);

      return jsonOut_({ ok: true, id: newId, status: 'pending' });
    }

    return jsonOut_({ ok: false, error: 'Hành động không được hỗ trợ.' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err.message || err) });
  }
}
