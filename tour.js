/* ============================================================
   Nhật ký yêu cầu gần đây (Recent Request Log) — Module Hướng dẫn sử dụng (Product Tour)
   ============================================================ */

/* 【Chỉ mục khối】 (Theo thứ tự từ trên xuống dưới của file)
   1. Các tham số có thể điều chỉnh    Hằng số giá trị cho tương tác hướng dẫn (độ trễ, lề, v.v.), chỉ chỉnh thông số ở đây
   2. Biến trạng thái          Trạng thái bộ nhớ trong thời gian chạy hướng dẫn (bước hiện tại, tham chiếu phần tử UI, sao lưu bản ghi, v.v.)
   3. Trợ thủ truy cập bảng điều khiển      Lấy node bảng điều khiển thông qua shadow root qua __RLogApi / Query bên trong bảng điều khiển
   4. Cấu hình bước hướng dẫn      Khai báo 13 bước hướng dẫn: phần tử mục tiêu, văn bản, tham chiếu hành vi (thêm bước mới thì sửa ở đây)
   5. Hàm hỗ trợ hành vi bước  Các hành động có tên được tham chiếu bởi cấu hình bước (mở/đóng ngăn kéo, xem trước, tìm kiếm), tương ứng 1-1 với các bước
   6. Kiểm tra phiên bản và Khởi động    Lấy số phiên bản manifest, so sánh với "phiên bản đã xem" cục bộ để quyết định có hiển thị hướng dẫn hay không
   7. Vòng đời hướng dẫn      Bắt đầu / Kết thúc / Chuyển bước, bao gồm việc sao lưu và khôi phục các bản ghi thực tế trong quá trình hướng dẫn
   8. Tạo và hiển thị UI     Tạo lớp phủ / Hộp highlight / Tooltip, xây dựng nội dung tooltip và liên kết sự kiện
   9. Định vị Highlight và Tooltip    Tính toán vị trí hình học của hộp highlight và tooltip (positionElements)
   10. API Đối ngoại         Mở ra cho index.js gọi window.__RLogTour
   ============================================================ */

(function () {
    /* ── Các tham số có thể điều chỉnh ───────────────────────────────────────────── */
    /* Tương ứng với bảng biến CSS: Các giá trị số cho tương tác hướng dẫn được tập trung ở đây. */
    const START_DELAY_MS = 100;          /* Độ trễ chờ bắt đầu hướng dẫn: Chờ DOM và animation chuyển tiếp (transition) ổn định trước, sau đó mới hiển thị bước đầu tiên */
    const TARGET_RETRY_DELAY_MS = 100;   /* Độ trễ thử lại phần tử mục tiêu: Khoảng thời gian thử lại khi không tìm thấy phần tử mục tiêu (ví dụ: hộp tìm kiếm được tạo động) */
    const TARGET_RETRY_MAX = 3;          /* Số lần thử lại tối đa phần tử mục tiêu: Vượt quá sẽ bỏ qua bước này, tránh việc hướng dẫn bị kẹt khi DOM chưa sẵn sàng */
    const HIGHLIGHT_PADDING_DEFAULT = 4; /* Padding mặc định của hộp highlight: Số pixel mà hộp highlight mở rộng ra ngoài so với phần tử mục tiêu (có thể ghi đè riêng trong từng bước) */
    const TOOLTIP_ARROW_GAP = 8;         /* Khoảng cách giữa tooltip và phần tử mục tiêu: Khoảng cách từ tam giác nhỏ của tooltip đến mép mục tiêu (px) */
    const TOOLTIP_EDGE_MARGIN = 10;      /* Lề chống tràn của tooltip: Khoảng trống tối thiểu khi tooltip nằm sát mép trái/phải của bảng điều khiển (px) */
    const ARROW_EDGE_LIMIT = 24;         /* Giới hạn khoảng cách từ tam giác nhỏ đến mép tooltip: Ngăn chặn tam giác nhỏ mọc ra ngoài góc bo tròn hoặc lơ lửng (px) */

    /* ⚠️ Số phiên bản dự phòng (fallback): Chỉ sử dụng khi không lấy được manifest.json, ngữ nghĩa không liên quan đến số phiên bản của plugin.
       Đừng cập nhật giá trị này theo các bản phát hành plugin! Giá trị này đại diện cho sự dự phòng của "phiên bản hướng dẫn tải thành công lần cuối":
       - Nếu lỡ đổi thành số phiên bản mới (ví dụ: 1.8.0), khi lấy manifest thất bại sẽ bị đánh giá nhầm là "đã xem hướng dẫn mới" và bỏ qua việc hiển thị.
       - Giữ nguyên giá trị cũ (1.6.0) là để kích hoạt hiển thị hướng dẫn khi lấy manifest thất bại, tránh việc người dùng hoàn toàn không nhìn thấy hướng dẫn tính năng mới. */
    let currentTourVersion = '1.6.0'; /* Số phiên bản dự phòng (Đừng cập nhật theo phiên bản plugin, xem giải thích ở trên) */
    const STORAGE_KEY = 'RecentRequestLog_tour_version';

    /* ── Biến trạng thái ───────────────────────────────────────────── */
    let currentStep = 0;
    let overlay = null;
    let tooltip = null;
    let highlightBox = null;
    let isActive = false;
    /* Danh sách bản ghi thực tế được sao lưu trước khi hướng dẫn bắt đầu (Làm trống danh sách trong quá trình hướng dẫn, khôi phục sau khi kết thúc) */
    let savedRecords = null;
    /* Trạng thái bộ lọc được sao lưu trước khi hướng dẫn bắt đầu (Đặt lại thành mở toàn bộ trong quá trình hướng dẫn, khôi phục sau khi kết thúc) */
    let savedFilterState = null;
    /* Bộ đếm số lần thử lại khi tìm phần tử mục tiêu thất bại (Tránh bị bỏ qua khi DOM chưa sẵn sàng) */
    let findTargetRetryCount = 0;

    /* ── Trợ thủ truy cập bảng điều khiển ──────────────────────────────────────── */
    /* Bảng điều khiển đã được treo vào shadow root (open shadow root của #rlog-shadow-host), document toàn trang không thể tìm thấy,
       thống nhất lấy node bảng điều khiển / query bên trong shadow root thông qua __RLogApi do index.js mở ra. */
    function getPanel() {
        return window.__RLogApi && typeof window.__RLogApi.getPanelEl === 'function'
            ? window.__RLogApi.getPanelEl()
            : null;
    }
    function q(sel) {
        return window.__RLogApi && typeof window.__RLogApi.q === 'function'
            ? window.__RLogApi.q(sel)
            : null;
    }

    /* ── Cấu hình bước hướng dẫn ───────────────────────────────────────── */
    /* Mỗi bước = Phần tử mục tiêu + Văn bản + Tùy chọn; Các bước cần hành vi (mở ngăn kéo/xem trước/tìm kiếm, v.v.)
       tham chiếu đến hàm có tên ở khu vực "Hàm hỗ trợ hành vi bước" bên dưới. */
    const steps = [
        {
            targetSelector: '.rlog-title-text',
            desc: 'Nhấp vào đây để <strong>thu gọn/mở rộng</strong>'
        },
        {
            targetSelector: '.rlog-title-count',
            desc: '<strong>Bấm đúp</strong> vào số để cài đặt giới hạn bản ghi',
            padding: 0
        },
        {
            targetSelector: '.rlog-header-drag-space',
            desc: 'Nhấn giữ vào vùng trống để <strong>kéo cửa sổ</strong>'
        },
        {
            targetSelector: '.rlog-resize-grip',
            desc: 'Nhấn giữ&nbsp;<i class="fa-solid fa-caret-down" style="transform: rotate(-45deg);"></i>&nbsp;kéo để <strong>điều chỉnh kích thước cửa sổ</strong>',
            placement: 'top',
            padding: 0
        },
        {
            targetSelector: '.rlog-header-actions',
            desc: '• Tùy chọn khác<br>• Lọc bản ghi<br>• Tìm kiếm toàn cục (Placeholder)<br>• Thu gọn tất cả các mục<br>• Đóng bảng điều khiển'
        },
        {
            targetSelector: '#rlog-more-drawer',
            desc: 'Nhấp vào <strong>Tùy chọn khác</strong> để hiển thị:<br>• Công tắc tổng plugin<br>• Hướng dẫn sử dụng<br>• Cài đặt tùy chọn<br>• Công tắc xem trước nội dung<br>• Xóa tất cả bản ghi<br>• Chuyển đổi chế độ Ngày/Đêm<br>• <strong>Tạo bản ghi mô phỏng</strong> (Không gửi thực tế)',
            onEnter: enterDrawerStep,
            onLeave: leaveDrawerStep
        },
        {
            targetSelector: '#rlog-filter-drawer',
            desc: 'Nhấp vào nút <strong>Lọc</strong> để hiển thị:<br>• Native/Plugin: Ẩn toàn bộ bản ghi theo nguồn gốc<br>• Gemini/Claude/DeepSeek/Khác: Ẩn toàn bộ bản ghi theo mô hình<br>• System/AI/User/Khác: Ẩn các tin nhắn con trong bản ghi theo vai trò (role)<br>Nhấp để chuyển đổi Ẩn/Hiện, các điều kiện lọc có thể cộng dồn',
            onEnter: enterFilterDrawerStep,
            onLeave: leaveFilterDrawerStep
        },
        {
            targetSelector: '.rlog-record[data-record-index="0"] .rmsg-item .rmsg-preview-text',
            desc: 'Sau khi bật <strong>Xem trước nội dung</strong>, sẽ hiển thị một phần văn bản ở đầu tin nhắn',
            onEnter: enterPreviewStep,
            onLeave: leavePreviewStep
        },
        {
            targetSelector: '.rlog-record[data-record-index="0"] .rlog-record-info',
            desc: '• Tên nhân vật<br>• Nguồn yêu cầu<br>• Timestamp<br>• Tên mô hình<br>• Số token [Số tin nhắn] (Có "~" phía trước số có nghĩa là đã giáng cấp thành ước tính)'
        },
        {
            targetSelector: '.rlog-record[data-record-index="0"] .rlog-record-info',
            desc: '<strong>Nhấn giữ</strong> dòng này để <strong>ghim</strong> bản ghi này lên đầu hoặc <strong>bỏ ghim</strong><br>Bản ghi được ghim không chiếm giới hạn bản ghi thông thường'
        },
        {
            targetSelector: '.rlog-record[data-record-index="0"] .rlog-record-actions-inner',
            desc: '<strong>Khi mở rộng sẽ hiển thị:</strong><br>• Tìm kiếm<br>• Mở rộng/Thu gọn tất cả tin nhắn bên trong<br>• Nhanh chóng cuộn xuống đáy<br>• Xem toàn văn (Sao chép toàn bộ yêu cầu)<br>• Xóa bản ghi này'
        },
        {
            targetSelector: '.rlog-search-box',
            desc: '• Nhấp vào 🔍︎ , nhập từ khóa để tiến hành tìm kiếm<br>• Nhấp vào mũi tên hoặc nhấn Enter/Shift+Enter để chuyển giữa các kết quả<br>• Nhấp vào 🔍︎ lần nữa để thoát tìm kiếm',
            /* Tùy chỉnh hộp highlight: Mép trái căn chỉnh với mép trái của nút kính lúp, cắt xén (crop) trên dưới vùng bảo vệ click */
            highlightAdjust: {
                leftAlignTo: '.rlog-search-btn',
                topExtra: 8,
                bottomExtra: 8
            },
            onEnter: enterSearchStep,
            onLeave: leaveSearchStep
        },
        {
            targetSelector: '.rlog-record[data-record-index="0"] .rmsg-item .rmsg-copy-btn',
            desc: '<strong>Khi mở rộng sẽ hiển thị:</strong><br>• Sao chép một tin nhắn<br><br>【Hướng dẫn đã kết thúc, nhấp vào biểu tượng ❔ để xem lại】'
        }
    ];

    /* ── Hàm hỗ trợ hành vi bước ───────────────────────────────────── */
    /* Bước ngăn kéo: Mở ngăn kéo "Tùy chọn khác" khi vào, đóng khi rời đi.
       Bằng cách tạm thời vô hiệu hóa transition + bắt buộc reflow (hồi lưu), làm cho ngăn kéo vào vị trí ngay lập tức, tránh việc vị trí hộp highlight bị nhảy. */
    function setDrawerState(open) {
        const drawer = q('#rlog-more-drawer');
        if (drawer) drawer.style.transition = 'none';
        const api = window.__RLogApi;
        const action = api && (open ? api.openDrawer : api.closeDrawer);
        if (action) {
            action.call(api);
        }
        if (drawer) {
            void drawer.offsetWidth;
            drawer.style.transition = '';
        }
    }

    function enterDrawerStep() {
        setDrawerState(true);
    }

    function leaveDrawerStep() {
        setDrawerState(false);
    }

    /* Bước ngăn kéo bộ lọc: Mở ngăn kéo "Bộ lọc" khi vào, đóng khi rời đi */
    function setFilterDrawerState(open) {
        const drawer = q('#rlog-filter-drawer');
        if (drawer) drawer.style.transition = 'none';
        const api = window.__RLogApi;
        if (api && typeof api.setFilterDrawer === 'function') {
            api.setFilterDrawer(open);
        }
        if (drawer) {
            void drawer.offsetWidth;
            drawer.style.transition = '';
        }
    }

    function enterFilterDrawerStep() {
        setFilterDrawerState(true);
    }

    function leaveFilterDrawerStep() {
        setFilterDrawerState(false);
    }

    /* Bước xem trước nội dung: Khi vào thì mở rộng bản ghi/tin nhắn demo và bật xem trước nội dung, đóng xem trước khi rời đi */
    function enterPreviewStep() {
        if (window.__RLogApi && window.__RLogApi.expandDemo) {
            window.__RLogApi.expandDemo();
        }
        if (window.__RLogApi && window.__RLogApi.forcePreview) {
            window.__RLogApi.forcePreview(true);
        }
    }

    function leavePreviewStep() {
        if (window.__RLogApi && window.__RLogApi.forcePreview) {
            window.__RLogApi.forcePreview(false);
        }
    }

    /* Bước tìm kiếm: Khi vào thì mở hộp tìm kiếm và tìm "Ví dụ", đóng tìm kiếm khi rời đi */
    function enterSearchStep() {
        /* Lưu ý: Không gọi các phương thức như expandDemo/injectDemo trước hoặc sau openSearchForRecord,
           chúng sẽ kích hoạt renderPanelContent() → resetSearchIfActive() xóa bỏ hộp tìm kiếm vừa được tạo. */
        if (window.__RLogApi && typeof window.__RLogApi.openSearchForRecord === 'function') {
            window.__RLogApi.openSearchForRecord(0);
        }
        /* Cài đặt nội dung hộp nhập (performSearch chỉ cập nhật searchState, sẽ không ghi ngược lại vào input.value) */
        const searchBox = q('#rlog-panel .rlog-search-box');
        const inputEl = searchBox ? searchBox.querySelector('.rlog-search-input') : null;
        if (inputEl) {
            inputEl.value = 'Ví dụ';
        }
        if (window.__RLogApi && typeof window.__RLogApi.performSearch === 'function') {
            window.__RLogApi.performSearch(0, 'Ví dụ');
        }
    }

    function leaveSearchStep() {
        if (window.__RLogApi && typeof window.__RLogApi.closeSearch === 'function') {
            window.__RLogApi.closeSearch();
        }
    }

    /* ── Kiểm tra phiên bản và Khởi động ─────────────────────────────────────── */
    /* Lấy động số phiên bản của manifest.json và ghi vào currentTourVersion;
       Khi lấy thất bại thì giữ nguyên phiên bản dự phòng (xem giải thích "Số phiên bản dự phòng" ở trên). */
    async function loadManifestVersion() {
        try {
            let manifestUrl = '/scripts/extensions/third-party/RecentRequestLog/manifest.json';
            const scripts = document.getElementsByTagName('script');
            for (let i = 0; i < scripts.length; i++) {
                if (scripts[i].src && scripts[i].src.includes('RecentRequestLog/tour.js')) {
                    manifestUrl = scripts[i].src.replace('tour.js', 'manifest.json');
                    break;
                }
            }

            const response = await fetch(`${manifestUrl}?t=${Date.now()}`, { cache: 'no-cache' });
            if (response.ok) {
                const manifest = await response.json();
                if (manifest && manifest.version) {
                    currentTourVersion = manifest.version;
                }
            }
        } catch (e) {
            console.warn('[RecentRequestLog] Lấy số phiên bản manifest.json thất bại, sử dụng phiên bản dự phòng', e);
        }
    }

    /* So sánh "Phiên bản đã xem cục bộ" và "Phiên bản hiện tại của manifest": Bắt đầu hướng dẫn khi không khớp (hoặc force). */
    async function checkAndStartTour(force = false) {
        await loadManifestVersion();
        const savedVersion = localStorage.getItem(STORAGE_KEY);
        if (force || savedVersion !== currentTourVersion) {
            startTour();
        }
    }

    /* ── Vòng đời hướng dẫn ───────────────────────────────────────── */
    function startTour() {
        if (isActive) return;

        const panel = getPanel();
        if (!panel || panel.style.display === 'none') return;

        if (panel.classList.contains('rlog-window-collapsed')) {
            const titleText = panel.querySelector('.rlog-title-text');
            if (titleText) titleText.click();
        }

        /* Thu gọn hai ngăn kéo, tránh việc trạng thái mở rộng còn sót lại ảnh hưởng đến định vị bước */
        if (window.__RLogApi) {
            if (typeof window.__RLogApi.closeDrawer === 'function') {
                window.__RLogApi.closeDrawer();
            }
            if (typeof window.__RLogApi.setFilterDrawer === 'function') {
                window.__RLogApi.setFilterDrawer(false);
            }
        }

        isActive = true;
        currentStep = 0;

        /* Trong quá trình hướng dẫn chỉ hiển thị demo, không hiển thị bản ghi thực tế (demo được đặt ở mục thứ 0, các bước có data-record-index="0"
           đều tác động lên nó), bản ghi thực tế và trạng thái bộ lọc được sao lưu trước, sau khi kết thúc sẽ do endTour khôi phục.
           Làm như vậy thì DOM của từng bước hoàn toàn có thể kiểm soát được, tránh việc bước cuối cùng "Sao chép một tin nhắn" định vị nhầm vào bản ghi thực tế dẫn đến lệch vị trí. */
        if (window.__RLogApi) {
            const api = window.__RLogApi;
            /* Sao lưu trạng thái bộ lọc và đặt lại thành mở toàn bộ: Bản ghi demo phải hiển thị (visible), thì định vị các bước hướng dẫn mới đáng tin cậy */
            if (typeof api.getFilterState === 'function') {
                savedFilterState = api.getFilterState();
            }
            if (typeof api.resetFilters === 'function') {
                api.resetFilters();
            }
            if (typeof api.records === 'function') {
                savedRecords = api.records() || [];
            } else {
                savedRecords = [];
            }
            if (typeof api.setTourActive === 'function') {
                api.setTourActive(true);
            }
            if (typeof api.setRecords === 'function') {
                api.setRecords([]);
            }
            if (typeof api.injectDemo === 'function') {
                api.injectDemo();
            }
        }

        createUI();

        setTimeout(() => {
            executeStep(currentStep);
        }, START_DELAY_MS);
    }

    function endTour() {
        if (!isActive) return;

        if (steps[currentStep] && typeof steps[currentStep].onLeave === 'function') {
            steps[currentStep].onLeave();
        }

        isActive = false;

        localStorage.setItem(STORAGE_KEY, currentTourVersion);

        if (overlay) overlay.remove();
        if (tooltip) tooltip.remove();
        if (highlightBox) highlightBox.remove();

        overlay = null;
        tooltip = null;
        highlightBox = null;

        /* Khôi phục danh sách bản ghi trước khi hướng dẫn + các bản ghi mới được lưu tạm trong quá trình hướng dẫn (Bản ghi mới ở trước, bản ghi cũ ở sau, tuân thủ "Mới nhất ở trên").
           Dùng requestAnimationFrame để hoãn lại đến frame tiếp theo: Cho phép việc xóa UI hướng dẫn hoàn thành render trước (Phản hồi tức thì),
           sau đó mới thực hiện việc khôi phục danh sách nặng nề, tránh chặn đồng bộ UI sau khi nhấp vào "Hoàn thành". */
        if (savedRecords !== null && window.__RLogApi && typeof window.__RLogApi.setRecords === 'function') {
            const recordsBeforeTour = savedRecords;
            savedRecords = null;
            requestAnimationFrame(() => {
                const api = window.__RLogApi;
                if (api && typeof api.setRecords === 'function') {
                    /* Trì hoãn việc lấy dữ liệu cho đến ngay trước khi khôi phục, tránh việc các bản ghi mới đến trong khoảng hở rAF bị danh sách cũ ghi đè và mất đi */
                    let pendingRecords = [];
                    if (typeof api.drainTourPendingRecords === 'function') {
                        pendingRecords = api.drainTourPendingRecords();
                    }
                    /* Khi có bản ghi mới thì xử lý nhất quán với addRecord thông thường: Thu gọn tất cả các bản ghi đã có (Chỉ thu gọn bản thân bản ghi,
                       trạng thái mở rộng của các tin nhắn con không thay đổi); Khi không có bản ghi mới thì giữ nguyên trạng thái trước hướng dẫn và khôi phục như cũ. */
                    if (pendingRecords.length > 0) {
                        recordsBeforeTour.forEach(r => { r.collapsed = true; });
                    }
                    api.setRecords(pendingRecords.concat(recordsBeforeTour));
                    if (savedFilterState !== null && typeof api.setFilterState === 'function') {
                        api.setFilterState(savedFilterState);
                        savedFilterState = null;
                    }
                }
                /* Sau khi khôi phục hoàn tất thì mới gỡ bỏ trạng thái hướng dẫn, từ đó về sau các bản ghi mới sẽ được thêm trực tiếp vào danh sách theo logic thông thường */
                if (api && typeof api.setTourActive === 'function') {
                    api.setTourActive(false);
                }
            });
        } else {
            savedRecords = null;
            savedFilterState = null;
            if (window.__RLogApi && typeof window.__RLogApi.setTourActive === 'function') {
                window.__RLogApi.setTourActive(false);
            }
        }
    }

    function executeStep(nextIndex) {
        if (nextIndex < 0 || nextIndex >= steps.length) {
            endTour();
            return;
        }

        if (steps[currentStep] && currentStep !== nextIndex && typeof steps[currentStep].onLeave === 'function') {
            steps[currentStep].onLeave();
        }

        currentStep = nextIndex;

        if (steps[currentStep] && typeof steps[currentStep].onEnter === 'function') {
            steps[currentStep].onEnter();
        }

        /* Hiển thị ngay lập tức văn bản tooltip của bước, loại bỏ cảm giác "giật lag" sau khi nhấp */
        showStep(currentStep);
    }

    /* ── Tạo và hiển thị UI ──────────────────────────────────────── */
    function createUI() {
        overlay = document.createElement('div');
        overlay.className = 'rlog-tour-overlay';

        highlightBox = document.createElement('div');
        highlightBox.className = 'rlog-tour-highlight';

        tooltip = document.createElement('div');
        tooltip.className = 'rlog-tour-tooltip';

        /* Thêm vào bên trong bảng điều khiển, đảm bảo di chuyển theo bảng điều khiển */
        const panel = getPanel();
        if (panel) {
            panel.appendChild(overlay);
            panel.appendChild(highlightBox);
            panel.appendChild(tooltip);

            /* Nhấp vào lớp phủ (overlay): Khu vực không phải popup → Bước tiếp theo (Nếu là bước cuối cùng thì kết thúc hướng dẫn) */
            overlay.addEventListener('click', (e) => {
                e.stopPropagation();
                /* Nhấp vào bên trong popup thì không xử lý (Popup có sự kiện nút riêng) */
                if (tooltip && tooltip.contains(e.target)) return;
                if (currentStep >= steps.length - 1) {
                    endTour();
                } else {
                    executeStep(currentStep + 1);
                }
            });
            tooltip.addEventListener('click', e => e.stopPropagation());
        }
    }

    function buildTooltipHtml(index) {
        const step = steps[index];
        const isLast = index === steps.length - 1;
        const isFirst = index === 0;
        return `
            <button class="rlog-tour-close" title="Thoát hướng dẫn"><i class="fa-solid fa-xmark"></i></button>
            <div class="rlog-tour-body">${step.desc}</div>
            <div class="rlog-tour-footer">
                <div class="rlog-tour-dots">
                    ${steps.map((_, i) => `<span class="rlog-tour-dot ${i === index ? 'active' : ''}" data-index="${i}"></span>`).join('')}
                </div>
                <div class="rlog-tour-buttons">
                    ${!isFirst ? `<button class="rlog-tour-btn rlog-tour-prev">Bước trước</button>` : `<button class="rlog-tour-btn rlog-tour-skip">Bỏ qua</button>`}
                    <button class="rlog-tour-btn rlog-tour-next rlog-tour-primary">${isLast ? 'Hoàn thành' : 'Bước tiếp'}</button>
                </div>
            </div>
        `;
    }

    function bindTooltipEvents() {
        const btnPrev = tooltip.querySelector('.rlog-tour-prev');
        const btnNext = tooltip.querySelector('.rlog-tour-next');
        const btnSkip = tooltip.querySelector('.rlog-tour-skip');
        const btnClose = tooltip.querySelector('.rlog-tour-close');

        if (btnPrev) btnPrev.addEventListener('click', (e) => { e.stopPropagation(); executeStep(currentStep - 1); });
        if (btnNext) btnNext.addEventListener('click', (e) => { e.stopPropagation(); executeStep(currentStep + 1); });
        if (btnSkip) btnSkip.addEventListener('click', (e) => { e.stopPropagation(); endTour(); });
        if (btnClose) btnClose.addEventListener('click', (e) => { e.stopPropagation(); endTour(); });

        const dots = tooltip.querySelectorAll('.rlog-tour-dot');
        dots.forEach(dot => {
            dot.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetIndex = parseInt(dot.getAttribute('data-index'), 10);
                if (!isNaN(targetIndex) && targetIndex !== currentStep) {
                    executeStep(targetIndex);
                }
            });
        });
    }

    function showStep(index) {
        const step = steps[index];
        const panel = getPanel();
        const targetEl = panel ? panel.querySelector(step.targetSelector) : null;

        if (!targetEl) {
            /* Khi không tìm thấy phần tử mục tiêu thì trì hoãn thử lại (Chờ DOM ổn định, ví dụ hộp tìm kiếm tạo động) */
            if (findTargetRetryCount < TARGET_RETRY_MAX) {
                findTargetRetryCount++;
                setTimeout(() => {
                    if (isActive && currentStep === index) {
                        showStep(index);
                    }
                }, TARGET_RETRY_DELAY_MS);
            } else {
                findTargetRetryCount = 0;
                console.warn(`[Tour] Target not found: ${step.targetSelector}`);
                executeStep(index + 1);
            }
            return;
        }
        findTargetRetryCount = 0;

        tooltip.innerHTML = buildTooltipHtml(index);

        bindTooltipEvents();

        positionElements(targetEl, step);
    }

    /* ── Định vị Highlight và Tooltip ─────────────────────────────────────── */
    function positionElements(targetEl, step) {
        const panel = getPanel();
        if (!panel) return;

        const placement = step.placement;
        const padding = step.padding !== undefined ? step.padding : HIGHLIGHT_PADDING_DEFAULT;

        const panelRect = panel.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();

        /* Tính toán vị trí tương đối so với bên trong bảng điều khiển */
        const top = targetRect.top - panelRect.top;
        const left = targetRect.left - panelRect.left;
        const width = targetRect.width;
        const height = targetRect.height;

        let boxTop = top - padding;
        let boxLeft = left - padding;
        let boxWidth = width + padding * 2;
        let boxHeight = height + padding * 2;

        /* Điều chỉnh hộp highlight tùy chỉnh (Dùng để đóng khung chính xác khu vực tìm kiếm, v.v.)
           topExtra/bottomExtra dương nghĩa là co vào trong (cắt xén), âm nghĩa là mở rộng ra ngoài */
        if (step.highlightAdjust) {
            const adj = step.highlightAdjust;
            /* leftAlignTo: Mép trái căn chỉnh với mép trái của phần tử mỏ neo (ví dụ: nút kính lúp),
               đọc động vị trí thực tế để thích ứng với độ rộng nút khác nhau, tránh fix cứng offset (độ dời). */
            if (adj.leftAlignTo) {
                const anchorEl = targetEl.parentElement
                    ? targetEl.parentElement.querySelector(adj.leftAlignTo)
                    : null;
                if (anchorEl) {
                    const anchorRect = anchorEl.getBoundingClientRect();
                    const anchorLeft = anchorRect.left - panelRect.left;
                    /* Mép trái = Mép trái mỏ neo (Không có padding bổ sung);
                       Mép phải giữ nguyên mép phải mục tiêu ban đầu + padding (Ý nghĩa nhất quán với padding trên dưới) */
                    boxLeft = anchorLeft;
                    boxWidth = (left + width + padding) - anchorLeft;
                }
            }
            if (adj.topExtra !== undefined) {
                boxTop += adj.topExtra;
                boxHeight -= adj.topExtra;
            }
            if (adj.bottomExtra !== undefined) {
                boxHeight -= adj.bottomExtra;
            }
        }

        highlightBox.style.boxSizing = ''; /* Khôi phục mặc định, tránh bị ảnh hưởng bởi border-box còn sót lại */
        highlightBox.style.top = `${boxTop}px`;
        highlightBox.style.left = `${boxLeft}px`;
        highlightBox.style.width = `${boxWidth}px`;
        highlightBox.style.height = `${boxHeight}px`;

        /* Tooltip phải được thiết lập thành hiển thị (display) trước thì mới lấy được kích thước, do đó hoãn việc định vị lại một frame */
        tooltip.style.display = 'block';
        tooltip.style.opacity = '1';

        requestAnimationFrame(() => {
            const tooltipWidth = tooltip.offsetWidth;
            const tooltipHeight = tooltip.offsetHeight;

            let tooltipTop = 0;
            let tooltipLeft = 0;

            if (placement === 'top') {
                tooltipTop = top - tooltipHeight - padding - TOOLTIP_ARROW_GAP;
                tooltip.classList.add('rlog-tour-top');
            } else {
                /* Mặc định placement là bottom */
                tooltipTop = top + height + padding + TOOLTIP_ARROW_GAP;
                tooltip.classList.remove('rlog-tour-top');
            }

            /* Căn giữa theo chiều ngang với phần tử mục tiêu */
            tooltipLeft = left + (width / 2) - (tooltipWidth / 2);
            let arrowLeft = tooltipWidth / 2;

            /* Tránh tràn sang mép phải bảng điều khiển */
            if (tooltipLeft + tooltipWidth > panelRect.width - TOOLTIP_EDGE_MARGIN) {
                tooltipLeft = panelRect.width - tooltipWidth - TOOLTIP_EDGE_MARGIN;
                arrowLeft = targetRect.left - panelRect.left - tooltipLeft + targetRect.width / 2;
            } else if (tooltipLeft < TOOLTIP_EDGE_MARGIN) {
                /* Tránh tràn sang mép trái */
                tooltipLeft = TOOLTIP_EDGE_MARGIN;
                arrowLeft = targetRect.left - panelRect.left - tooltipLeft + targetRect.width / 2;
            }

            /* Giới hạn tam giác nhỏ không vượt ra ngoài ranh giới tooltip (Tránh việc mọc ra ngoài góc bo tròn hoặc lơ lửng) */
            if (arrowLeft > tooltipWidth - ARROW_EDGE_LIMIT) arrowLeft = tooltipWidth - ARROW_EDGE_LIMIT;
            if (arrowLeft < ARROW_EDGE_LIMIT) arrowLeft = ARROW_EDGE_LIMIT;

            tooltip.style.setProperty('--arrow-left', `${arrowLeft}px`);
            tooltip.style.top = `${tooltipTop}px`;
            tooltip.style.left = `${tooltipLeft}px`;
        });
    }

    /* ── API Đối ngoại ────────────────────────────────────────────── */
    /* Mở ra API cho bên ngoài gọi (Sử dụng sau khi index.js tải động file này) */
    window.__RLogTour = {
        check: checkAndStartTour,
        start: startTour,
        end: endTour
    };

})();