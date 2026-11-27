/**
 * BỘ MÃ GOOGLE APPS SCRIPT TỰ ĐỘNG SINH 03 GOOGLE FORMS + 01 GOOGLE SHEET TỔNG HỢP
 * Dành cho Thành viên 2 (Content & Drill) — Đề tài 08: Thích ứng với nắng nóng & thời tiết cực đoan
 * Khu vực khảo sát: Trường Đại học Mỏ - Địa chất (Phường Đức Thắng, Bắc Từ Liêm, Hà Nội — Bán kính 1–2 km)
 *
 * HƯỚNG DẪN CHẠY TRONG 60 GIÂY:
 * 1. Mở https://script.google.com -> bấm "Dự án mới" (New project).
 * 2. Xóa đoạn mã mặc định, dán toàn bộ tệp này vào -> bấm Ctrl+S lưu lại.
 * 3. Trên thanh công cụ, chọn hàm `createAllHUMGCampaignForms` -> bấm nút "Chạy" (Run) và cấp quyền Google.
 * 4. Xem cửa sổ "Nhật ký thực thi" (Execution Log) bên dưới để lấy ngay 3 đường link Form gửi đi!
 */

function createAllHUMGCampaignForms() {
  const ss = SpreadsheetApp.create('HUMG_DeTai08_DuLieu_KhaoSat_Va_DienTap_2026');

  const preForm = createPreTestSurveyForm_(ss);
  const quizForm = createDigitalDrillQuizForm_(ss);
  const postForm = createPostTestEvaluationForm_(ss);

  Logger.log('====================================================');
  Logger.log('ĐÃ TẠO THÀNH CÔNG TRỌN BỘ 3 GOOGLE FORMS + SHEET!');
  Logger.log('1. Google Sheet tổng hợp dữ liệu: ' + ss.getUrl());
  Logger.log('----------------------------------------------------');
  Logger.log('2. FORM 1 - Khảo sát đầu vào (15 câu Pre-test):');
  Logger.log('   - Link gửi sinh viên điền: ' + preForm.getPublishedUrl());
  Logger.log('   - Link chỉnh sửa: ' + preForm.getEditUrl());
  Logger.log('----------------------------------------------------');
  Logger.log('3. FORM 2 - Mini-Quiz Diễn tập Cảnh báo số (5 câu có chấm điểm):');
  Logger.log('   - Link gửi sinh viên diễn tập: ' + quizForm.getPublishedUrl());
  Logger.log('   - Link chỉnh sửa: ' + quizForm.getEditUrl());
  Logger.log('----------------------------------------------------');
  Logger.log('4. FORM 3 - Đánh giá sau thử nghiệm (6 câu Post-test):');
  Logger.log('   - Link gửi sinh viên đánh giá: ' + postForm.getPublishedUrl());
  Logger.log('   - Link chỉnh sửa: ' + postForm.getEditUrl());
  Logger.log('====================================================');
}

/**
 * FORM 1: Mẫu phiếu khảo sát đầu vào đúng nguyên văn 15 câu Phụ lục Phần 5
 */
function createPreTestSurveyForm_(ss) {
  const form = FormApp.create('KHẢO SÁT THỰC TRẠNG VÀ NHU CẦU ỨNG PHÓ VỚI NẮNG NÓNG, MƯA LỚN VÀ NGẬP CỤC BỘ (KHU VỰC ĐH MỎ - ĐỊA CHẤT)');
  form.setDescription(
    'Chào bạn, chúng mình là nhóm sinh viên thực hiện dự án truyền thông cộng đồng về thích ứng với nắng nóng và thời tiết cực đoan tại khu vực Trường Đại học Mỏ - Địa chất (phường Đức Thắng – Cổ Nhuế, Bắc Từ Liêm, bán kính 1–2 km).\n\n' +
      'Khảo sát chỉ mất khoảng 3 phút, mọi thông tin hoàn toàn ẩn danh và chỉ phục vụ xây dựng Bản đồ điểm rủi ro – điểm an toàn cùng bộ tài liệu hướng dẫn ứng phó miễn phí cho sinh viên và người dân. Cảm ơn bạn đã đóng góp!'
  );
  form.setCollectEmail(false);
  form.setConfirmationMessage('Cảm ơn bạn rất nhiều! Dữ liệu của bạn giúp nhóm hoàn thiện Bản đồ số điểm an toàn quanh ĐH Mỏ - Địa chất.');

  // PHẦN 1
  form.addSectionHeaderItem()
    .setTitle('PHẦN 1: THÔNG TIN CHUNG & XÁC ĐỊNH NHÓM DỄ BỊ ẢNH HƯỞNG')
    .setHelpText('Phân loại các nhóm đối tượng có mức độ phơi nhiễm cao nhất để ưu tiên thiết kế thông điệp.');

  const q1 = form.addMultipleChoiceItem();
  q1.setTitle('Câu 1. Bạn hiện là đối tượng nào tại khu vực khảo sát?')
    .setChoices([
      q1.createChoice('Sinh viên'),
      q1.createChoice('Giảng viên / Cán bộ nhân viên'),
      q1.createChoice('Người dân sinh sống quanh khu vực'),
      q1.createChoice('Lao động ngoài trời (tài xế công nghệ, bảo vệ, người bán hàng...)')
    ])
    .showOtherOption(true)
    .setRequired(true);

  const q2 = form.addMultipleChoiceItem();
  q2.setTitle('Câu 2. Phương tiện di chuyển chính hằng ngày của bạn là gì?')
    .setChoiceValues([
      'Đi bộ',
      'Xe đạp / Xe đạp điện',
      'Xe buýt (có đi bộ ra trạm)',
      'Xe máy',
      'Ô tô'
    ])
    .setRequired(true);

  const q3 = form.addCheckboxItem();
  q3.setTitle('Câu 3. Đặc điểm nơi ở hiện tại của bạn thuộc nhóm nào sau đây?')
    .setChoiceValues([
      'Phòng trọ mái tôn / tầng áp mái / ít cửa sổ thông gió',
      'Phòng trọ khu vực nền thấp, dễ ngập khi mưa lớn',
      'Phòng trọ bình thường (có điều hòa hoặc tương đối mát)',
      'Ký túc xá (Khu A / Khu B)',
      'Nhà riêng / Chung cư'
    ])
    .setRequired(true);

  const q4 = form.addCheckboxItem();
  q4.setTitle('Câu 4. Bạn có thuộc nhóm dễ chịu tác động mạnh khi gặp thời tiết cực đoan không?')
    .setChoiceValues([
      'Thường xuyên phải di chuyển hoặc hoạt động ngoài trời trong khung giờ nắng gắt (11h00 – 15h00)',
      'Dễ bị say nắng, đau đầu, choáng váng khi đi nắng hoặc thay đổi nhiệt độ đột ngột',
      'Có bệnh nền liên quan đến hô hấp, tim mạch hoặc huyết áp',
      'Thường xuyên di chuyển một mình vào chiều tối khi hay có mưa dông',
      'Không thuộc các nhóm trên'
    ])
    .setRequired(true);

  // PHẦN 2
  form.addPageBreakItem()
    .setTitle('PHẦN 2: THỰC TRẠNG & KHOANH VÙNG ĐIỂM RỦI RO – ĐIỂM AN TOÀN')
    .setHelpText('Thu thập dữ liệu thực tế từ cộng đồng để đối chiếu khi đi thực địa quanh Phố Viên – Đức Thắng – Cổ Nhuế và đưa lên Bản đồ số.');

  const q5 = form.addCheckboxItem();
  q5.setTitle('Câu 5. Trong 1 năm qua, bạn từng gặp những tình huống nào dưới đây tại khu vực trường và xung quanh?')
    .setChoiceValues([
      'Đi qua đoạn đường nắng gắt, không có bóng cây hoặc điểm nghỉ mát',
      'Mưa lớn bất chợt không tìm được chỗ trú an toàn',
      'Gặp đường ngập cục bộ gây tắt máy, ngã xe hoặc tắc đường kéo dài',
      'Bị kẹt lại trường/nơi trọ, phải hủy lịch học hoặc làm việc',
      'Có dấu hiệu mệt lả, say nắng hoặc cảm lạnh sau khi dầm mưa',
      'Chưa từng gặp vấn đề đáng kể'
    ])
    .setRequired(true);

  form.addScaleItem()
    .setTitle('Câu 6. Mức độ ảnh hưởng của nắng nóng và mưa ngập cục bộ đến việc học tập, đi lại hằng ngày của bạn?')
    .setBounds(1, 5)
    .setLabels('Hoàn toàn không ảnh hưởng', 'Ảnh hưởng rất nghiêm trọng')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Câu 7. Hãy kể tên 1–3 tuyến đường, cổng trường hoặc điểm cụ thể quanh khu vực bạn thấy hay bị NGẬP SÂU nhất khi mưa lớn.')
    .setHelpText('Gợi ý: Chân Cầu Phố Viên, cuối Phố Viên, Cầu Noi, ngõ Chợ Cổ Nhuế...')
    .setRequired(false);

  form.addTextItem()
    .setTitle('Câu 8. Hãy kể tên 1–3 đoạn đường hoặc khu vực bạn thấy NẮNG GẮT, THIẾU BÓNG MÁT nhất khi di chuyển ban ngày.')
    .setHelpText('Gợi ý: Trục Phạm Văn Đồng, đường nối Khu A sang Khu B, dãy trọ mái tôn...')
    .setRequired(false);

  form.addTextItem()
    .setTitle('Câu 9. Khi gặp mưa lớn bất chợt hoặc quá nắng, bạn thường trú tạm / tránh nóng ở đâu quanh đây?')
    .setHelpText('Gợi ý: Sảnh Nhà C12, thư viện trường, nhà chờ xe buýt có mái che, cửa hàng tiện lợi, quán nước...')
    .setRequired(false);

  // PHẦN 3: PRE-TEST
  form.addPageBreakItem()
    .setTitle('PHẦN 3: ĐÁNH GIÁ NHẬN THỨC & KỸ NĂNG ỨNG PHÓ HIỆN TẠI (PRE-TEST)')
    .setHelpText('Làm dữ liệu đầu vào để tìm hiểu cách xử lý phổ biến hiện nay của sinh viên.');

  // Lưu ý: Đã ẩn dòng "[Đáp án chuẩn]" theo đúng hướng dẫn Phụ lục Phần 5!
  const q10 = form.addMultipleChoiceItem();
  q10.setTitle('Câu 10. Khi phát hiện một người đi nắng về có dấu hiệu sốc nhiệt (da nóng đỏ, hoa mắt, buồn nôn, lơ mơ), xử trí ban đầu ĐÚNG nhất là gì?')
    .setChoiceValues([
      'Đưa ngay vào phòng điều hòa lạnh sâu và cho uống thật nhiều nước đá lạnh',
      'Đưa vào chỗ râm mát, nới lỏng quần áo, chườm mát vùng cổ – nách – bẹn, cho uống từng ngụm nước mát/oresol (nếu còn tỉnh) và gọi hỗ trợ y tế nếu không đỡ',
      'Để người đó ngồi yên tại chỗ hít thở sâu và bôi dầu gió khắp người',
      'Không chắc chắn / Chưa biết cách xử lý'
    ])
    .setRequired(true);

  const q11 = form.addMultipleChoiceItem();
  q11.setTitle('Câu 11. Khi đang đi trên đường và gặp đoạn ngập sâu quá nửa bánh xe, bạn thường chọn cách nào?')
    .setChoiceValues([
      'Cố gắng đi sát mép vỉa hè hoặc giữ đều ga chạy nhanh qua cho kịp giờ',
      'Dừng lại tại vị trí cao ráo, theo dõi mực nước hoặc tìm tuyến đường vòng thay thế dù đi xa hơn',
      'Chờ xe khác đi qua trước rồi đi bám theo sau',
      'Tùy tình huống nhưng thường khá lúng túng, không rõ tuyến đường nào tránh ngập'
    ])
    .setRequired(true);

  form.addScaleItem()
    .setTitle('Câu 12. Bạn tự đánh giá mức độ tự tin về kỹ năng ứng phó nắng nóng, mưa dông và ngập cục bộ của bản thân ở mức nào?')
    .setBounds(1, 5)
    .setLabels('Rất thiếu tự tin', 'Rất tự tin')
    .setRequired(true);

  // PHẦN 4
  form.addPageBreakItem()
    .setTitle('PHẦN 4: NHU CẦU THÔNG TIN & ĐĂNG KÝ THAM GIA THỬ NGHIỆM SỐ')
    .setHelpText('Lựa chọn kênh phát tán tối ưu và lập danh sách người tham gia đợt Diễn tập cảnh báo số.');

  const q13 = form.addCheckboxItem();
  const q13Validation = FormApp.createCheckboxValidation()
    .requireSelectAtMost(2)
    .setHelpText('Vui lòng chọn tối đa 2 kênh chính.')
    .build();
  q13.setTitle('Câu 13. Bạn thường tiếp nhận thông tin cảnh báo thời tiết hoặc tình hình ngập lụt quanh khu vực nhanh nhất qua kênh nào? (Chọn tối đa 2 đáp án)')
    .setChoiceValues([
      'Group Facebook sinh viên / cộng đồng khu vực',
      'Nhóm Zalo lớp / xóm trọ',
      'TikTok / Reels ngắn',
      'Ứng dụng thời tiết trên điện thoại',
      'Tin nhắn từ bạn bè, người thân'
    ])
    .setValidation(q13Validation)
    .setRequired(true);

  const q14 = form.addCheckboxItem();
  q14.setTitle('Câu 14. Nếu nhóm xây dựng Bản đồ số điểm rủi ro – điểm an toàn và Cẩm nang ứng phó nhanh, nội dung nào bạn thấy hữu ích nhất?')
    .setChoiceValues([
      'Vị trí các điểm hay ngập kèm gợi ý tuyến đường thay thế',
      'Vị trí các điểm trú mưa, điểm tránh nóng có bóng mát và nước uống',
      'Hướng dẫn sơ cứu say nắng/sốc nhiệt ngắn gọn dễ lưu trong điện thoại',
      'Mẹo làm mát phòng trọ tiết kiệm và chuẩn bị đồ phòng mưa nắng',
      'Bản tin cảnh báo nhanh theo cấp độ trước khung giờ tan học có thời tiết xấu'
    ])
    .setRequired(true);

  const q15 = form.addMultipleChoiceItem();
  q15.setTitle('Câu 15. Bạn có sẵn sàng tham gia đợt thử nghiệm nhận 1 Bản tin cảnh báo số và trải nghiệm Bản đồ an toàn (mất 2 phút) trong tuần tới không?')
    .setChoices([
      q15.createChoice('Không, cảm ơn')
    ])
    .showOtherOption(true)
    .setHelpText('Nếu đồng ý tham gia, hãy chọn mục "Khác" và điền SĐT Zalo / Email / Link Facebook của bạn để nhận Bản tin diễn tập nhé!')
    .setRequired(true);

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  return form;
}

/**
 * FORM 2: Mini-Quiz 5 câu Diễn tập Cảnh báo số (Chấm điểm tự động 100 điểm + Giải thích ngay)
 */
function createDigitalDrillQuizForm_(ss) {
  const form = FormApp.create('DIỄN TẬP CẢNH BÁO SỐ & MINI-QUIZ ỨNG PHÓ THỜI TIẾT CỰC ĐOAN (ĐH MỎ - ĐỊA CHẤT)');
  form.setIsQuiz(true);
  form.setDescription(
    '🚨 BẢN TIN GIẢ ĐỊNH CẤP ĐỘ ĐỎ (17h00): Dự báo mưa dông cường độ lớn gây ngập sâu 40–45 cm tại chân Cầu Phố Viên, cuối Phố Viên và khu vực Cầu Noi – Cổ Nhuế.\n\n' +
      '👉 BƯỚC 1: Bấm mở Bản đồ số điểm rủi ro – điểm an toàn tại đây trước khi làm bài (thay bằng link Bitly của nhóm): https://bit.ly/bando-antoan-humg\n' +
      '👉 BƯỚC 2: Quan sát vị trí điểm trú mưa, trạm y tế gần cổng 18 Phố Viên nhất và hoàn thành 5 câu hỏi tình huống dưới đây (chỉ mất 2 phút, xem điểm và đáp án ngay sau khi nộp!).'
  );
  form.setConfirmationMessage(
    'Chúc mừng bạn đã hoàn thành đợt Diễn tập Cảnh báo số! Hãy xem lại phần giải thích chi tiết ở từng câu để nắm chắc quy tắc 30 giây an toàn nhé.'
  );

  const quizItems = [
    {
      title: 'Câu 1 (Diễn tập ngập 17h00): Vừa tan học tại Khu A ĐH Mỏ - Địa chất (18 Phố Viên) thì nhận cảnh báo đoạn Cầu Phố Viên và Cầu Noi ngập sâu 45 cm (quá nửa bánh xe). Lựa chọn nào AN TOÀN nhất?',
      options: [
        'Giữ đều tay ga, đi sát mép đường Cầu Phố Viên vượt nhanh về phòng trọ trước khi nước dâng thêm',
        'Tạm trú ngay tại Sảnh Nhà C12 / Thư viện trường chờ mưa ngớt, hoặc tra Bản đồ số chọn lộ trình cao ráo qua hướng BV Phương Đông – trục đường lớn',
        'Đứng trú mưa dưới tán cây xà cừ lớn ven sông Nhuệ để quan sát các xe khác đi qua trước',
        'Tắt máy dắt bộ băng qua dòng nước chảy xiết ven bờ sông Nhuệ'
      ],
      correct: 1,
      explain: 'Nước ngập >30–40 cm che khuất ổ gà ven sông Nhuệ rất dễ gây ngã xe, thủy kích; đứng dưới cây lớn khi mưa dông có nguy cơ sét đánh hoặc gãy cành.'
    },
    {
      title: 'Câu 2 (Sơ cứu sốc nhiệt): Lúc 13h30 nắng gắt, một bạn đi bộ từ trạm buýt Phạm Văn Đồng về trường có dấu hiệu da nóng đỏ, hoa mắt, buồn nôn, lơ mơ. Xử trí trong 3 phút đầu nào ĐÚNG chuẩn Bộ Y tế?',
      options: [
        'Đưa ngay vào phòng điều hòa 16°C và cho uống thật nhiều nước đá lạnh để hạ nhiệt tức thì',
        'Để bạn ngồi tại chỗ ngoài hiên, xoa dầu gió nóng và cạo gió',
        'Đưa vào nơi râm mát/thoáng gió, nới lỏng quần áo, chườm mát vùng cổ – nách – bẹn, cho uống từng ngụm nước mát/Oresol (nếu còn tỉnh) và gọi hỗ trợ y tế nếu không đỡ',
        'Cho uống thuốc hạ sốt Paracetamol ngay lập tức'
      ],
      correct: 2,
      explain: 'Chườm mát vùng cổ – nách – bẹn giúp tản nhiệt mạch máu lớn an toàn; nước đá lạnh gây co mạch sốc lạnh và Paracetamol không có tác dụng với sốc nhiệt môi trường.'
    },
    {
      title: 'Câu 3 (An toàn điện xóm trọ): Mưa lớn khiến nước từ ngõ Chợ Cổ Nhuế bắt đầu tràn vào sàn tầng 1 phòng trọ sinh viên. Việc ĐẦU TIÊN bạn cần làm ngay là gì?',
      options: [
        'Lội chân trần xuống sàn nước để nhặt ổ cắm kéo dài và rút sạc laptop',
        'Đứng ở vị trí khô ráo/trên bậc cao ngắt ngay aptomat (cầu dao điện) tổng của phòng/tầng trệt bằng vật cách điện khô trước khi kê dọn đồ đạc',
        'Bật quạt điện công suất lớn thổi cho sàn nhanh khô',
        'Chờ nước ngập quá mắt cá chân mới ngắt điện để khỏi mất Wi-Fi'
      ],
      correct: 1,
      explain: 'Tuyệt đối không chạm tay ướt hoặc đứng dưới sàn ngập nước rút ổ cắm khi chưa ngắt cầu dao tổng vì nguy cơ rò điện chết người rất cao.'
    },
    {
      title: 'Câu 4 (Tra cứu Bản đồ số): Khi đang ở Phố Viên gặp mưa dông sấm sét hoặc bạn đi cùng kiệt sức do nắng nóng nặng, hai điểm AN TOÀN gần cổng 18 Phố Viên nhất (dưới 300m) trên Bản đồ số là đâu?',
      options: [
        'Cầu Noi và Chợ Cổ Nhuế',
        'Sảnh Nhà C12 / Trạm Y tế ĐH Mỏ - Địa chất (trong khuôn viên 18 Phố Viên) và Bệnh viện Đa khoa Phương Đông (số 9 Phố Viên)',
        'Gầm cầu vượt Mai Dịch',
        'Bãi đất trống ven bờ Tây sông Nhuệ'
      ],
      correct: 1,
      explain: 'Sảnh Nhà C12 / Trạm Y tế trường (<100m) và BV Đa khoa Phương Đông (~300m tại số 9 Phố Viên) đều có cốt nền cao ráo và sẵn sàng sơ cấp cứu.'
    },
    {
      title: 'Câu 5 (Hạ nhiệt phòng trọ mái tôn): Với phòng trọ tầng áp mái/mái tôn quanh Đức Thắng – Cổ Nhuế những ngày nắng >38°C, giải pháp nào hạ nhiệt hiệu quả và tiết kiệm điện nhất?',
      options: [
        'Đóng kín mít cửa sổ suốt cả tối dù trời đã dịu và bật điều hòa 18°C liên tục',
        'Che nắng hướng Tây ban ngày, hạn chế đun nấu buổi trưa, mở đối lưu + quạt đuổi khí nóng tích tụ chiều tối và uống nước đều đặn từng ngụm',
        'Dội nước liên tục lên sàn nhà đóng kín cửa tạo độ ẩm bức bí',
        'Uống nước ngọt có gas thật lạnh thay nước lọc cả ngày'
      ],
      correct: 1,
      explain: 'Chắn bức xạ trực tiếp ban ngày kết hợp thoát khí nóng tích tụ dưới mái tôn chiều tối giúp giảm 3–5°C nhiệt cảm nhận mà rất tiết kiệm điện.'
    }
  ];

  quizItems.forEach(function (qData) {
    const item = form.addMultipleChoiceItem();
    item.setTitle(qData.title).setPoints(20).setRequired(true);
    const choices = qData.options.map(function (optText, idx) {
      return item.createChoice(optText, idx === qData.correct);
    });
    item.setChoices(choices);
    const feedback = FormApp.createFeedback().setText(qData.explain).build();
    item.setFeedbackForCorrect(feedback);
    item.setFeedbackForIncorrect(feedback);
  });

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  return form;
}

/**
 * FORM 3: Phiếu đánh giá sau thử nghiệm (Post-test — 6 câu)
 * Giữ nguyên cấu trúc Câu 10 & Câu 12 từ Pre-test để đối chiếu tăng trưởng ≥ 30% & ≥ +1.0 điểm tự tin!
 */
function createPostTestEvaluationForm_(ss) {
  const form = FormApp.create('ĐÁNH GIÁ SAU TRẢI NGHIỆM BẢN ĐỒ SỐ & DIỄN TẬP CẢNH BÁO (POST-TEST — ĐH MỎ - ĐỊA CHẤT)');
  form.setDescription(
    'Cảm ơn bạn đã trải nghiệm Bản đồ số Điểm rủi ro – Điểm an toàn, Cẩm nang 1 chạm và đợt Diễn tập cảnh báo số của nhóm! ' +
      'Phiếu đánh giá ngắn dưới đây (6 câu · 90 giây) giúp nhóm đo lường hiệu quả thực tế của bộ công cụ.'
  );
  form.setConfirmationMessage('Cảm ơn bạn đã đồng hành trọn vẹn cùng chiến dịch Thích ứng thời tiết cực đoan tại ĐH Mỏ - Địa chất!');

  const p1 = form.addCheckboxItem();
  p1.setTitle('Câu 1. Bạn đã tiếp cận hoặc sử dụng những sản phẩm nào của chiến dịch trong những ngày qua?')
    .setChoiceValues([
      'Bản đồ số 2 lớp Điểm rủi ro – Điểm an toàn quanh ĐH Mỏ - Địa chất',
      'Cẩm nang bỏ túi PDF / Infographic ứng phó nắng nóng & mưa ngập',
      'Video ngắn 45 giây hướng dẫn tra cứu bản đồ',
      'Bản tin cảnh báo nhanh (Vàng / Đỏ) & Mini-quiz diễn tập 5 câu'
    ])
    .setRequired(true);

  // Giữ nguyên y hệt Câu 10 từ Pre-test để so sánh tỷ lệ trả lời đúng trước - sau
  const p2 = form.addMultipleChoiceItem();
  p2.setTitle('Câu 2 (Đối chiếu kiến thức). Khi phát hiện một người đi nắng về có dấu hiệu sốc nhiệt (da nóng đỏ, hoa mắt, buồn nôn, lơ mơ), xử trí ban đầu ĐÚNG nhất là gì?')
    .setChoiceValues([
      'Đưa ngay vào phòng điều hòa lạnh sâu và cho uống thật nhiều nước đá lạnh',
      'Đưa vào chỗ râm mát, nới lỏng quần áo, chườm mát vùng cổ – nách – bẹn, cho uống từng ngụm nước mát/oresol (nếu còn tỉnh) và gọi hỗ trợ y tế nếu không đỡ',
      'Để người đó ngồi yên tại chỗ hít thở sâu và bôi dầu gió khắp người',
      'Không chắc chắn / Chưa biết cách xử lý'
    ])
    .setRequired(true);

  // Đối chiếu hành vi xử lý vùng ngập quá nửa bánh xe
  const p3 = form.addMultipleChoiceItem();
  p3.setTitle('Câu 3 (Đối chiếu hành vi). Sau khi xem Bản đồ số quanh ĐH Mỏ - Địa chất, nếu gặp cảnh báo đoạn Cầu Phố Viên / Cầu Noi ngập sâu quá nửa bánh xe, bạn sẽ làm gì?')
    .setChoiceValues([
      'Cố gắng đi sát mép vỉa hè hoặc giữ đều ga chạy nhanh qua cho kịp giờ',
      'Dừng lại tại điểm an toàn (Sảnh C12, Thư viện...) hoặc mở Bản đồ số chọn tuyến đường cao ráo thay thế',
      'Chờ xe khác đi qua trước rồi đi bám theo sau',
      'Vẫn chưa rõ tuyến đường nào tránh ngập'
    ])
    .setRequired(true);

  // Giữ nguyên y hệt thang đo 1-5 của Câu 12 từ Pre-test
  form.addScaleItem()
    .setTitle('Câu 4 (Đối chiếu độ tự tin). Hiện tại, bạn tự đánh giá mức độ tự tin về kỹ năng ứng phó nắng nóng, mưa dông và ngập cục bộ của bản thân ở mức nào?')
    .setBounds(1, 5)
    .setLabels('Rất thiếu tự tin', 'Rất tự tin')
    .setRequired(true);

  form.addScaleItem()
    .setTitle('Câu 5. Bạn đánh giá mức độ dễ tra cứu trên điện thoại và tính hữu ích của Bản đồ số 2 lớp quanh ĐH Mỏ - Địa chất ở mức nào?')
    .setBounds(1, 5)
    .setLabels('Chưa hữu ích / Khó xem', 'Rất trực quan & hữu ích')
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('Câu 6. Góp ý thêm của bạn (bổ sung điểm ngập/nắng mới quanh Phố Viên – Cổ Nhuế hoặc cải thiện bản đồ):')
    .setRequired(false);

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  return form;
}
