/* ============================================================
   Nhật ký yêu cầu gần đây (Recent Request Log) — Module hướng dẫn sử dụng (Product Tour)
   ============================================================ */

/* [Mục lục phân vùng] (Theo thứ tự từ trên xuống dưới của tệp)
   1. Tham số có thể điều chỉnh   Hằng số số trị tương tác của hướng dẫn (độ trễ, lề, v.v.), điều chỉnh thông số chỉ sửa ở đây
   2. Biến trạng thái            Trạng thái bộ nhớ trong thời gian hướng dẫn vận hành (bước hiện tại, tham chiếu phần tử UI, sao lưu bản ghi, v.v.)
   3. Trợ lý truy cập bảng điều khiển  Lấy node bảng điều khiển thông qua Shadow Root qua __RLogApi / truy vấn bên trong bảng điều khiển
   4. Cấu hình các bước hướng dẫn Khai báo 10 bước hướng dẫn: Phần tử mục tiêu, văn bản hiển thị, tham chiếu hành vi (thêm bước mới sửa ở đây)
   5. Hàm bổ trợ hành vi của bước Các hành động cụ thể được cấu hình bước tham chiếu (mở/đóng ngăn kéo, xem trước, tìm kiếm), tương ứng 1-1 với từng bước
   6. Kiểm tra phiên bản và khởi chạy Lấy số phiên bản manifest, đối chiếu với "phiên bản đã xem" trên máy chủ rồi quyết định có hiển thị hướng dẫn hay không
   7. Vòng đời hướng dẫn         Bắt đầu / Kết thúc / Chuyển bước, bao gồm sao lưu và khôi phục bản ghi thực tế trong thời gian hướng dẫn
   8. Khởi tạo và hiển thị UI     Tạo lớp phủ / khung tô sáng / bong bóng, xây dựng nội dung bong bóng và gắn kết sự kiện
   9. Định vị khung tô sáng và bong bóng  Tính toán vị trí hình học của khung tô sáng và bong bóng (positionElements)
   10. API đối ngoại             window.__RLogTour được cung cấp để index.js gọi
   ============================================================ */

(function () {
    /* ── Tham số có thể điều chỉnh ───────────────────────────── */
    /* Tương ứng với bảng biến CSS tổng: Các giá trị số tương tác hướng dẫn tập trung tại đây. */
    const START_DELAY_MS = 100;          /* Độ trễ chờ khi bắt đầu hướng dẫn: Chờ DOM và hiệu ứng chuyển cảnh ổn định trước khi hiển thị bước đầu tiên */
    const TARGET_RETRY_DELAY_MS = 100;   /* Độ trễ thử lại phần tử mục tiêu: Khoảng thời gian thử lại khi không tìm thấy phần tử mục tiêu (ví dụ ô tìm kiếm được tạo động) */
    const TARGET_RETRY_MAX = 3;          /* Số lần thử lại tối đa cho phần tử mục tiêu: Vượt quá số lần này sẽ bỏ qua bước đó, tránh treo hướng dẫn khi DOM mãi chưa sẵn sàng */
    const HIGHLIGHT_PADDING_DEFAULT = 4; /* Padding mặc định của khung tô sáng: Số pixel khung tô sáng mở rộng ra ngoài so với phần tử mục tiêu (có thể ghi đè riêng trong từng bước) */
    const TOOLTIP_ARROW_GAP = 8;         /* Khoảng cách giữa bong bóng và phần tử mục tiêu: Khoảng cách từ tam giác nhỏ của bong bóng đến mép mục tiêu (px) */
    const TOOLTIP_EDGE_MARGIN = 10;      /* Margin chống tràn bong bóng: Khoảng trống tối thiểu khi bong bóng nằm sát mép trái/phải bảng điều khiển (px) */
    const ARROW_EDGE_LIMIT = 24;         /* Giới hạn khoảng cách từ tam giác nhỏ đến mép bong bóng: Ngăn tam giác nhỏ nằm lệch ra ngoài góc bo tròn hoặc trôi lơ lửng (px) */
    const DIM_MASK_ID = 'rlog-tour-dim-mask';

    /* ⚠️ Phiên bản dự phòng: Chỉ sử dụng khi việc lấy manifest.json thất bại, ngữ nghĩa không liên quan đến phiên bản tiện ích mở rộng.
       Không cập nhật giá trị này theo phiên bản phát hành của tiện ích! Giá trị này biểu thị mức dự phòng cho "phiên bản hướng dẫn được tải thành công lần cuối":
       - Nếu đổi nhầm thành phiên bản mới (ví dụ 1.8.0), khi lấy manifest thất bại sẽ bị đánh giá nhầm là "đã xem hướng dẫn mới" và bỏ qua hiển thị.
       - Giữ nguyên giá trị cũ (1.6.0) là để kích hoạt hiển thị hướng dẫn khi lấy manifest thất bại, tránh việc người dùng hoàn toàn không xem được hướng dẫn tính năng mới. */
    let currentTourVersion = '1.6.0'; /* Phiên bản dự phòng (không cập nhật theo phiên bản tiện ích, xem giải thích phía trên) */
    /* ── Biến trạng thái ───────────────────────────────────────────── */
    let currentStep = 0;
    let overlay = null;
    let dimLayer = null;
    let tooltip = null;
    let highlightBox = null;
    let isActive = false;
    /* Danh sách bản ghi thực tế được sao lưu trước khi bắt đầu hướng dẫn (làm trống danh sách trong thời gian hướng dẫn, khôi phục sau khi kết thúc) */
    let savedRecords = null;
    /* Trạng thái bộ lọc được sao lưu trước khi bắt đầu hướng dẫn (đặt lại về mở toàn bộ trong thời gian hướng dẫn, khôi phục sau khi kết thúc) */
    let savedFilterState = null;
    /* Bộ đếm thử lại thất bại khi tìm kiếm phần tử mục tiêu (tránh việc bị bỏ qua khi DOM chưa sẵn sàng) */
    let findTargetRetryCount = 0;

    /* ── Trợ lý truy cập bảng điều khiển ──────────────────────────────────────── */
    /* Bảng điều khiển đã được gắn vào Shadow Root (open shadow root của #rlog-shadow-host), document tìm kiếm trên toàn trang sẽ không thấy,
       tất cả đều được lấy thống nhất tại đây thông qua __RLogApi được index.js cung cấp để lấy node bảng điều khiển / truy vấn bên trong Shadow Root. */
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

    /* ── Cấu hình các bước hướng dẫn ───────────────────────────────────────── */
    /* Mỗi bước = Phần tử mục tiêu + Nội dung văn bản + Các tùy chọn; các bước cần hành vi (mở ngăn kéo/xem trước/tìm kiếm, v.v.)
       sẽ tham chiếu đến các hàm có tên trong khu vực "Hàm bổ trợ hành vi của bước" bên dưới. */
    const steps = [
        {
            targetSelector: '.rlog-header-actions',
            desc: '<strong>Khu vực nút thanh tiêu đề chính:</strong><br>Tạo bản ghi mô phỏng｜Ngăn kéo chức năng｜Điều khiển cửa sổ'
        },
        {
            targetSelectors: ['#rlog-filter-btn', '.rlog-filter-controls'],
            tooltipTargetSelector: '.rlog-filter-controls',
            targetHighlightAdjustments: {
                1: { offsetY: 2 },
            },
            desc: '<strong>Lọc bản ghi:</strong><br>Theo nguồn｜Theo model｜Theo vai trò',
            onEnter: enterFilterDrawerStep,
            onLeave: leaveFilterDrawerStep
        },
        {
            targetSelectors: ['#rlog-global-search-btn', '.rlog-global-search-controls'],
            tooltipTargetSelector: '.rlog-global-search-controls',
            targetHighlightAdjustments: {
                1: { offsetY: 2 },
            },
            desc: '<strong>Tìm kiếm toàn cục:</strong><br>Nhập từ khóa, nhấp tìm kiếm thủ công để bắt đầu<br>Khi nút tìm kiếm chuyển thành Cập nhật, nhấp để làm mới kết quả<br>Nhấp vào số thứ tự và nhập số để chuyển nhanh',
            onEnter: enterGlobalSearchStep,
            onLeave: leaveGlobalSearchStep
        },
        {
            targetSelectors: ['#rlog-more-btn', '.rlog-more-controls'],
            tooltipTargetSelector: '.rlog-more-controls',
            targetHighlightAdjustments: {
                1: { offsetY: 2 },
            },
            desc: '<strong>Tùy chọn khác:</strong><br>Công tắc và hướng dẫn｜Cài đặt và hiển thị｜Thao tác hàng loạt',
            onEnter: enterDrawerStep,
            onLeave: leaveDrawerStep
        },
        {
            targetSelector: '.rlog-record[data-record-index="0"] .rlog-record-info',
            desc: '<strong>Thanh tiêu đề bản ghi:</strong><br>Tên nhân vật｜Nguồn｜Dấu thời gian｜Model｜Tổng số token [Số lượng tin nhắn]<br>Nhấn giữ để ghim / bỏ ghim'
        },
        {
            targetSelector: '.rlog-record[data-record-index="0"] .rlog-record-actions-inner',
            desc: '<strong>Hiển thị khi bản ghi mở rộng:</strong><br>Tìm kiếm｜Mở rộng / Thu gọn tất cả｜Chuyển nhanh xuống đáy｜<br>Xem toàn văn (JSON gốc, sao chép và xuất)<br>｜Xóa'
        },
        {
            targetSelector: '.rlog-search-box',
            desc: '<strong>Tìm kiếm trong bản ghi đơn lẻ:</strong><br>Nhấp 🔍︎ để vào chế độ tìm kiếm, nhấp lần nữa để thoát<br>Nhập từ khóa để tự động tìm kiếm<br>Nhấp vào số thứ tự và nhập số để chuyển nhanh',
            /* Tùy chỉnh khung tô sáng: Mép trái căn thẳng mép trái nút kính lúp, trên dưới cắt bớt vùng bảo vệ nhấp chuột */
            highlightAdjust: {
                leftAlignTo: '.rlog-search-btn',
                topExtra: 8,
                bottomExtra: 8
            },
            onEnter: enterSearchStep,
            onLeave: leaveSearchStep
        },
        {
            targetSelector: '.rlog-record[data-record-index="0"] .rmsg-item .rmsg-preview-text',
            desc: '<strong>Xem trước nội dung:</strong><br>Bật trong Tùy chọn khác, sẽ hiển thị phần văn bản mở đầu của tin nhắn',
            onEnter: enterPreviewStep,
            onLeave: leavePreviewStep
        },
        {
            targetSelectors: [
                '.rlog-record[data-record-index="0"] .rmsg-item.role-system .rmsg-read-btn',
                '.rlog-record[data-record-index="0"] .rmsg-item.role-system .rmsg-copy-btn',
            ],
            combineTargets: true,
            desc: '<strong>Hiển thị khi tin nhắn vai trò mở rộng:</strong><br>Đọc tin nhắn dài độc lập (xuất hiện khi ≥800 tokens)｜Sao chép tin nhắn đơn lẻ'
        },
        {
            targetSelector: '.rlog-record[data-record-index="0"] .rmsg-item.role-response .rmsg-response-meta',
            placement: 'top',
            desc: '<strong>Thông tin Response:</strong><br>Chữ đầu｜TPS｜Thời gian<br>Nhấp ⓘ để xem thêm chi tiết'
        }
    ];

    /* ── Hàm bổ trợ hành vi của bước ───────────────────────────────────── */
    /* Bước ngăn kéo: Mở ngăn kéo "Tùy chọn khác" khi vào, đóng khi rời khỏi.
       Bằng cách tạm thời vô hiệu hóa transition + buộc reflow, giúp ngăn kéo vào vị trí ngay tức khắc, tránh việc khung tô sáng bị nhảy vị trí. */
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

    /* Bước ngăn kéo lọc: Mở ngăn kéo "Lọc" khi vào, đóng khi rời khỏi */
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

    /* Bước ngăn kéo tìm kiếm toàn cục: Mở ngăn kéo khi vào và minh họa tìm kiếm từ khóa một lần, đóng và dọn dẹp kết quả khi rời khỏi */
    function setGlobalSearchDrawerState(open) {
        const drawer = q('#rlog-global-search-drawer');
        if (drawer) drawer.style.transition = 'none';
        const api = window.__RLogApi;
        if (api && typeof api.setGlobalSearchDrawer === 'function') {
            api.setGlobalSearchDrawer(open);
        }
        if (drawer) {
            void drawer.offsetWidth;
            drawer.style.transition = '';
        }
    }

    function enterGlobalSearchStep() {
        setGlobalSearchDrawerState(true);
        const inputEl = q('#rlog-global-search-input');
        if (inputEl) inputEl.value = 'Ví dụ';
        if (window.__RLogApi && typeof window.__RLogApi.performGlobalSearch === 'function') {
            window.__RLogApi.performGlobalSearch();
        }
    }

    function leaveGlobalSearchStep() {
        setGlobalSearchDrawerState(false);
    }

    /* Bước xem trước nội dung: Khi vào chỉ mở rộng tin nhắn demo dùng để xem trước và bật chế độ xem trước, các tin nhắn khác giữ nguyên trạng thái thu gọn ban đầu */
    function enterPreviewStep() {
        if (window.__RLogApi && window.__RLogApi.prepareDemoPreview) {
            window.__RLogApi.prepareDemoPreview();
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

    /* Bước tìm kiếm: Khi vào sẽ mở ô tìm kiếm và tìm "Ví dụ", khi rời khỏi sẽ đóng tìm kiếm */
    function enterSearchStep() {
        /* Lưu ý: Không gọi các phương thức như prepareDemoPreview/injectDemo trước hoặc sau openSearchForRecord,
           chúng sẽ kích hoạt renderPanelContent() → resetSearchIfActive() và xóa mất ô tìm kiếm vừa được tạo. */
        if (window.__RLogApi && typeof window.__RLogApi.openSearchForRecord === 'function') {
            window.__RLogApi.openSearchForRecord(0);
        }
        /* Thiết lập nội dung ô nhập (performSearch chỉ cập nhật searchState, không ghi ngược lại vào input.value) */
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

    /* ── Kiểm tra phiên bản và khởi chạy ─────────────────────────────────────── */
    /* Lấy động số phiên bản của manifest.json và ghi vào currentTourVersion;
       khi lấy thất bại giữ nguyên phiên bản dự phòng (xem giải thích "Phiên bản dự phòng" phía trên). */
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

    function getSavedTourVersion() {
        return window.__RLogApi && typeof window.__RLogApi.getTourVersion === 'function'
            ? window.__RLogApi.getTourVersion()
            : '';
    }

    function saveTourVersion(version) {
        if (window.__RLogApi && typeof window.__RLogApi.setTourVersion === 'function') {
            window.__RLogApi.setTourVersion(version);
        }
    }

    /* Đối chiếu "phiên bản đã xem" và "phiên bản hiện tại của manifest": Khi không khớp (hoặc force) sẽ bắt đầu hướng dẫn. */
    async function checkAndStartTour(force = false) {
        await loadManifestVersion();
        const savedVersion = getSavedTourVersion();
        if (force || savedVersion !== currentTourVersion) {
            startTour();
        }
    }

    /* ── Vòng đời hướng dẫn ───────────────────────────────────────── */
    function startTour() {
        if (isActive) return;

        const panel = getPanel();
        if (!panel || panel.style.display === 'none') return;

        /* Thu gọn cả ba ngăn kéo, tránh trạng thái mở rộng còn sót lại làm ảnh hưởng đến việc định vị bước */
        if (window.__RLogApi) {
            if (typeof window.__RLogApi.closeDrawer === 'function') {
                window.__RLogApi.closeDrawer();
            }
            if (typeof window.__RLogApi.setFilterDrawer === 'function') {
                window.__RLogApi.setFilterDrawer(false);
            }
            if (typeof window.__RLogApi.setGlobalSearchDrawer === 'function') {
                window.__RLogApi.setGlobalSearchDrawer(false);
            }
        }

        isActive = true;
        currentStep = 0;

        /* Trong thời gian hướng dẫn chỉ hiển thị demo, không hiển thị bản ghi thực tế (demo đặt ở mục thứ 0, các bước có data-record-index="0"
           đều tác động lên nó), bản ghi thực tế cùng trạng thái lọc được sao lưu trước và được endTour khôi phục sau khi kết thúc.
           Cách này giúp DOM của từng bước hoàn toàn có thể kiểm soát, tránh việc bước cuối cùng "Sao chép tin nhắn đơn lẻ" định vị nhầm vào bản ghi thực tế gây lệch vị trí. */
        if (window.__RLogApi) {
            const api = window.__RLogApi;
            /* Sao lưu trạng thái lọc và đặt lại thành mở toàn bộ: Bản ghi demo bắt buộc phải hiển thị thì định vị bước hướng dẫn mới đáng tin cậy */
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

        saveTourVersion(currentTourVersion);

        if (overlay) overlay.remove();
        if (dimLayer) dimLayer.remove();
        if (tooltip) tooltip.remove();
        if (highlightBox) highlightBox.remove();

        overlay = null;
        dimLayer = null;
        tooltip = null;
        highlightBox = null;

        /* Khôi phục danh sách bản ghi trước hướng dẫn + bản ghi mới được lưu tạm trong thời gian hướng dẫn (bản ghi mới ở trước, bản ghi cũ ở sau, đúng theo thứ tự "mới nhất ở trên cùng").
           Dùng requestAnimationFrame để hoãn sang khung hình tiếp theo: Giúp việc gỡ bỏ UI hướng dẫn hoàn tất render trước (phản hồi tức thì),
           sau đó mới tiến hành khôi phục danh sách nặng hơn, tránh việc chặn đứng đồng bộ UI sau khi nhấp "Hoàn tất". */
        if (savedRecords !== null && window.__RLogApi && typeof window.__RLogApi.setRecords === 'function') {
            const recordsBeforeTour = savedRecords;
            savedRecords = null;
            requestAnimationFrame(() => {
                const api = window.__RLogApi;
                if (api && typeof api.setRecords === 'function') {
                    /* Trì hoãn đến khoảnh khắc trước khi khôi phục mới lấy, tránh việc các bản ghi mới đến trong khoảng thời gian rAF bị danh sách cũ ghi đè làm mất */
                    let pendingRecords = [];
                    if (typeof api.drainTourPendingRecords === 'function') {
                        pendingRecords = api.drainTourPendingRecords();
                    }
                    /* Khi có bản ghi mới sẽ xử lý tương tự addRecord thông thường: Thu gọn toàn bộ bản ghi hiện có (chỉ thu gọn bản thân bản ghi,
                       trạng thái mở rộng của tin nhắn con giữ nguyên); khi không có bản ghi mới thì giữ nguyên trạng thái trước hướng dẫn để khôi phục. */
                    if (pendingRecords.length > 0) {
                        recordsBeforeTour.forEach(r => { r.collapsed = true; });
                    }
                    api.setRecords(pendingRecords.concat(recordsBeforeTour));
                    if (savedFilterState !== null && typeof api.setFilterState === 'function') {
                        api.setFilterState(savedFilterState);
                        savedFilterState = null;
                    }
                }
                /* Sau khi khôi phục hoàn tất mới hủy trạng thái hướng dẫn, từ đó về sau bản ghi mới sẽ được đưa trực tiếp vào danh sách theo logic thông thường */
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

        /* Hiển thị ngay văn bản bong bóng của bước để triệt tiêu "cảm giác khựng" sau khi nhấp */
        showStep(currentStep);
    }

    /* ── Khởi tạo và hiển thị UI ──────────────────────────────────────── */
    function createUI() {
        overlay = document.createElement('div');
        overlay.className = 'rlog-tour-overlay';

        const svgNs = 'http://www.w3.org/2000/svg';
        dimLayer = document.createElementNS(svgNs, 'svg');
        dimLayer.classList.add('rlog-tour-dim');
        dimLayer.setAttribute('aria-hidden', 'true');
        dimLayer.innerHTML = `
            <defs>
                <mask id="${DIM_MASK_ID}" maskUnits="userSpaceOnUse">
                    <rect data-rlog-tour-mask-base="1" x="0" y="0" width="100%" height="100%" fill="white"></rect>
                    <g data-rlog-tour-mask-holes="1"></g>
                </mask>
            </defs>
            <rect data-rlog-tour-dim-fill="1" x="0" y="0" width="100%" height="100%"
                  mask="url(#${DIM_MASK_ID})"></rect>
        `;

        highlightBox = document.createElement('div');
        highlightBox.className = 'rlog-tour-highlight-layer';

        tooltip = document.createElement('div');
        tooltip.className = 'rlog-tour-tooltip';

        /* Thêm vào bên trong bảng điều khiển, đảm bảo di chuyển bám theo bảng điều khiển */
        const panel = getPanel();
        if (panel) {
            panel.appendChild(overlay);
            panel.appendChild(dimLayer);
            panel.appendChild(highlightBox);
            panel.appendChild(tooltip);

            /* Nhấp vào lớp phủ màn hình: Khu vực ngoài popup → Bước tiếp theo (nếu là bước cuối sẽ kết thúc hướng dẫn) */
            overlay.addEventListener('click', (e) => {
                e.stopPropagation();
                /* Nhấp vào bên trong popup sẽ không xử lý (popup có sự kiện nút bấm riêng) */
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
        const formattedDesc = step.desc.replace(
            /｜/g,
            '<span class="rlog-tour-separator" aria-hidden="true">｜</span>',
        );
        return `
            <button class="rlog-tour-close" title="Thoát hướng dẫn"><i class="fa-solid fa-xmark"></i></button>
            <div class="rlog-tour-body">${formattedDesc}</div>
            <div class="rlog-tour-footer">
                <div class="rlog-tour-dots">
                    ${steps.map((_, i) => `<span class="rlog-tour-dot ${i === index ? 'active' : ''}" data-index="${i}"></span>`).join('')}
                </div>
                <div class="rlog-tour-buttons">
                    ${!isFirst ? `<button class="rlog-tour-btn rlog-tour-prev">Bước trước</button>` : `<button class="rlog-tour-btn rlog-tour-skip">Bỏ qua</button>`}
                    <button class="rlog-tour-btn rlog-tour-next rlog-tour-primary">${isLast ? 'Hoàn tất' : 'Bước tiếp theo'}</button>
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
        const selectors = step.targetSelectors || [step.targetSelector];
        const targetEls = selectors.map((selector) => q(selector));

        if (targetEls.some((targetEl) => !targetEl)) {
            /* Khi không tìm thấy phần tử mục tiêu sẽ hoãn để thử lại (chờ DOM ổn định, ví dụ ô tìm kiếm được tạo động) */
            if (findTargetRetryCount < TARGET_RETRY_MAX) {
                findTargetRetryCount++;
                setTimeout(() => {
                    if (isActive && currentStep === index) {
                        showStep(index);
                    }
                }, TARGET_RETRY_DELAY_MS);
            } else {
                findTargetRetryCount = 0;
                console.warn(`[Tour] Target not found: ${selectors.join(', ')}`);
                executeStep(index + 1);
            }
            return;
        }
        findTargetRetryCount = 0;

        tooltip.innerHTML = buildTooltipHtml(index);

        bindTooltipEvents();

        positionElements(targetEls, step);
    }

    /* ── Định vị khung tô sáng và bong bóng ─────────────────────────────────────── */
    function positionElements(targetEls, step) {
        const panel = getPanel();
        if (!panel) return;

        const placement = step.placement;
        const padding = step.padding !== undefined ? step.padding : HIGHLIGHT_PADDING_DEFAULT;

        const panelRect = panel.getBoundingClientRect();
        const targetRects = targetEls.map((targetEl) => {
            const rect = targetEl.getBoundingClientRect();
            return {
                top: rect.top - panelRect.top,
                left: rect.left - panelRect.left,
                width: rect.width,
                height: rect.height,
            };
        });

        let boxes = targetRects.map((targetRect, index) => {
            let boxTop = targetRect.top - padding;
            let boxLeft = targetRect.left - padding;
            let boxWidth = targetRect.width + padding * 2;
            let boxHeight = targetRect.height + padding * 2;

            /* Điều chỉnh khung tô sáng tùy chỉnh (dùng để đóng khung chuẩn xác khu vực tìm kiếm, v.v.)
               topExtra/bottomExtra dương nghĩa là co vào trong (cắt bớt), âm nghĩa là mở rộng ra ngoài */
            if (index === 0 && step.highlightAdjust) {
                const adj = step.highlightAdjust;
                /* leftAlignTo: Biên trái căn thẳng hàng với mép trái phần tử neo (như nút kính lúp),
                   đọc động vị trí thực tế để tương thích với các độ rộng nút khác nhau, tránh gán cứng độ lệch cố định. */
                if (adj.leftAlignTo) {
                    const anchorEl = targetEls[index].parentElement
                        ? targetEls[index].parentElement.querySelector(adj.leftAlignTo)
                        : null;
                    if (anchorEl) {
                        const anchorRect = anchorEl.getBoundingClientRect();
                        const anchorLeft = anchorRect.left - panelRect.left;
                        /* Biên trái = Mép trái điểm neo (không có padding bổ sung);
                           Biên phải giữ mép phải mục tiêu ban đầu + padding (đồng nhất ngữ nghĩa với padding trên dưới) */
                        boxLeft = anchorLeft;
                        boxWidth = (targetRect.left + targetRect.width + padding) - anchorLeft;
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
            const targetAdjust = step.targetHighlightAdjustments
                && step.targetHighlightAdjustments[index];
            if (targetAdjust) {
                if (targetAdjust.offsetX !== undefined) boxLeft += targetAdjust.offsetX;
                if (targetAdjust.offsetY !== undefined) boxTop += targetAdjust.offsetY;
            }

            return { top: boxTop, left: boxLeft, width: boxWidth, height: boxHeight };
        });

        /* Các nút liền kề được gộp thành một khung; lối vào ngăn kéo và điều khiển ngăn kéo giữ hai khung độc lập. */
        if (step.combineTargets && boxes.length > 1) {
            const right = Math.max(...boxes.map((box) => box.left + box.width));
            const bottom = Math.max(...boxes.map((box) => box.top + box.height));
            const left = Math.min(...boxes.map((box) => box.left));
            const top = Math.min(...boxes.map((box) => box.top));
            boxes = [{ top, left, width: right - left, height: bottom - top }];
        }

        highlightBox.replaceChildren(...boxes.map((box) => {
            const highlight = document.createElement('div');
            highlight.className = 'rlog-tour-highlight';
            highlight.style.top = `${box.top}px`;
            highlight.style.left = `${box.left}px`;
            highlight.style.width = `${box.width}px`;
            highlight.style.height = `${box.height}px`;
            return highlight;
        }));

        /* Lớp phủ đơn lẻ khoét rỗng toàn bộ mục tiêu thông qua SVG mask, tránh việc nhiều bóng đổ tô sáng đè lên nhau gây tối màu hai lần. */
        const maskBase = dimLayer.querySelector('[data-rlog-tour-mask-base="1"]');
        const maskHoles = dimLayer.querySelector('[data-rlog-tour-mask-holes="1"]');
        const dimFill = dimLayer.querySelector('[data-rlog-tour-dim-fill="1"]');
        const svgNs = 'http://www.w3.org/2000/svg';
        maskBase.setAttribute('width', panelRect.width);
        maskBase.setAttribute('height', panelRect.height);
        dimFill.setAttribute('width', panelRect.width);
        dimFill.setAttribute('height', panelRect.height);
        maskHoles.replaceChildren(...boxes.map((box) => {
            const hole = document.createElementNS(svgNs, 'rect');
            hole.setAttribute('x', box.left);
            hole.setAttribute('y', box.top);
            hole.setAttribute('width', box.width);
            hole.setAttribute('height', box.height);
            hole.setAttribute('rx', '4');
            hole.setAttribute('ry', '4');
            hole.setAttribute('fill', 'black');
            return hole;
        }));

        let anchorRect = targetRects[0];
        if (step.combineTargets) {
            const right = Math.max(...targetRects.map((rect) => rect.left + rect.width));
            const bottom = Math.max(...targetRects.map((rect) => rect.top + rect.height));
            const left = Math.min(...targetRects.map((rect) => rect.left));
            const top = Math.min(...targetRects.map((rect) => rect.top));
            anchorRect = { top, left, width: right - left, height: bottom - top };
        }
        if (step.tooltipTargetSelector) {
            const anchorEl = q(step.tooltipTargetSelector);
            if (anchorEl) {
                const rect = anchorEl.getBoundingClientRect();
                anchorRect = {
                    top: rect.top - panelRect.top,
                    left: rect.left - panelRect.left,
                    width: rect.width,
                    height: rect.height,
                };
            }
        }

        /* Bong bóng phải được đặt thành hiển thị trước mới lấy được kích thước, do đó hoãn một khung hình rồi mới định vị */
        tooltip.style.display = 'block';
        tooltip.style.opacity = '1';

        requestAnimationFrame(() => {
            const tooltipWidth = tooltip.offsetWidth;
            const tooltipHeight = tooltip.offsetHeight;

            let tooltipTop = 0;
            let tooltipLeft = 0;

            if (placement === 'top') {
                tooltipTop = anchorRect.top - tooltipHeight - padding - TOOLTIP_ARROW_GAP;
                tooltip.classList.add('rlog-tour-top');
            } else {
                /* placement mặc định là bottom */
                tooltipTop = anchorRect.top + anchorRect.height + padding + TOOLTIP_ARROW_GAP;
                tooltip.classList.remove('rlog-tour-top');
            }

            /* Căn giữa theo chiều ngang so với phần tử mục tiêu */
            tooltipLeft = anchorRect.left + (anchorRect.width / 2) - (tooltipWidth / 2);
            let arrowLeft = tooltipWidth / 2;

            /* Ngăn tràn ra ngoài mép phải bảng điều khiển */
            if (tooltipLeft + tooltipWidth > panelRect.width - TOOLTIP_EDGE_MARGIN) {
                tooltipLeft = panelRect.width - tooltipWidth - TOOLTIP_EDGE_MARGIN;
                arrowLeft = anchorRect.left - tooltipLeft + anchorRect.width / 2;
            } else if (tooltipLeft < TOOLTIP_EDGE_MARGIN) {
                /* Ngăn tràn ra mép trái */
                tooltipLeft = TOOLTIP_EDGE_MARGIN;
                arrowLeft = anchorRect.left - tooltipLeft + anchorRect.width / 2;
            }

            /* Giới hạn tam giác nhỏ không vượt quá biên bong bóng (ngăn việc mọc ra ngoài góc bo tròn hoặc trôi lơ lửng) */
            if (arrowLeft > tooltipWidth - ARROW_EDGE_LIMIT) arrowLeft = tooltipWidth - ARROW_EDGE_LIMIT;
            if (arrowLeft < ARROW_EDGE_LIMIT) arrowLeft = ARROW_EDGE_LIMIT;

            tooltip.style.setProperty('--arrow-left', `${arrowLeft}px`);
            tooltip.style.top = `${tooltipTop}px`;
            tooltip.style.left = `${tooltipLeft}px`;
        });
    }

    /* ── API đối ngoại ────────────────────────────────────────────── */
    /* Công khai API để bên ngoài gọi (index.js sử dụng sau khi tải động tệp này) */
    window.__RLogTour = {
        check: checkAndStartTour,
        start: startTour,
        end: endTour
    };

})();