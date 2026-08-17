/* ============================================================
   Lịch sử Request gần đây (Recent Request Log) — Module Hướng dẫn sử dụng (Product Tour)
   ============================================================ */

/* [Mục lục các khối] (Theo thứ tự từ trên xuống dưới trong file)
   1. Tham số tùy chỉnh        Các hằng số cho tương tác hướng dẫn (độ trễ, lề, v.v.), chỉ cần chỉnh ở đây
   2. Biến trạng thái          Trạng thái bộ nhớ khi hướng dẫn đang chạy (bước hiện tại, tham chiếu UI, backup log...)
   3. Cấu hình bước hướng dẫn  Khai báo 11 bước: phần tử mục tiêu, nội dung text, tham chiếu hành động (thêm bước thì sửa ở đây)
   4. Hàm hỗ trợ hành động     Các hành động cụ thể được gọi trong cấu hình bước (mở/đóng ngăn kéo, xem trước, tìm kiếm)
   5. Kiểm tra phiên bản       Lấy version từ manifest, so sánh với "phiên bản đã xem" ở local để quyết định có hiện hướng dẫn không
   6. Vòng đời hướng dẫn       Bắt đầu / Kết thúc / Chuyển bước, bao gồm việc backup và khôi phục log thật
   7. Tạo và hiển thị UI       Tạo lớp phủ / khung highlight / bong bóng, render nội dung bong bóng và gắn sự kiện
   8. Định vị highlight        Tính toán vị trí hình học của khung highlight và bong bóng (positionElements)
   9. API ra bên ngoài         Lộ ra window.__RLogTour để index.js gọi
   ============================================================ */

(function () {
    /* ── Tham số tùy chỉnh ───────────────────────────────────────────── */
    /* Tương ứng với bảng biến CSS: Các thông số tương tác gom hết vào đây, muốn độ chế gì thì chỉ sửa khu này thôi. */
    const START_DELAY_MS = 100;          /* Độ trễ khởi động hướng dẫn: Chờ DOM và animation ổn định rồi mới hiện bước 1 */
    const TARGET_RETRY_DELAY_MS = 100;   /* Độ trễ thử lại tìm mục tiêu: Khoảng thời gian chờ nếu không tìm thấy phần tử (như ô tìm kiếm tạo động) */
    const TARGET_RETRY_MAX = 3;          /* Số lần thử lại tối đa: Quá số này thì skip luôn bước đó, tránh bị kẹt nếu DOM chưa sẵn sàng */
    const HIGHLIGHT_PADDING_DEFAULT = 4; /* Padding mặc định của khung highlight: Khung bự hơn phần tử mục tiêu bao nhiêu pixel (có thể ghi đè riêng từng bước) */
    const TOOLTIP_ARROW_GAP = 8;         /* Khoảng cách từ bong bóng đến mục tiêu: Từ mũi tên nhỏ đến mép phần tử (px) */
    const TOOLTIP_EDGE_MARGIN = 10;      /* Khoảng lề chống tràn của bong bóng: Lề tối thiểu khi bong bóng sát mép trái/phải bảng điều khiển (px) */
    const ARROW_EDGE_LIMIT = 24;         /* Giới hạn mũi tên sát mép bong bóng: Tránh mũi tên mọc chệch ra ngoài bo góc hoặc bay lơ lửng (px) */

    /* ⚠️ Phiên bản dự phòng (đáy): Chỉ dùng khi get manifest.json thất bại, ý nghĩa không dính dáng tới phiên bản plugin.
       Đừng có update số này theo phiên bản plugin nha! Nó là mốc "phiên bản hướng dẫn load thành công lần cuối":
       - Nếu lỡ tay sửa thành version mới (vd 1.8.0), lúc get manifest tịt ngòi nó sẽ tưởng "đã xem hướng dẫn mới" rồi skip luôn.
       - Giữ nguyên số cũ (1.6.0) là để phòng hờ get manifest xịt thì nó vẫn kích hoạt hướng dẫn, tránh việc user mù tịt tính năng mới. */
    let currentTourVersion = '1.6.0'; /* Phiên bản dự phòng (Đừng đổi theo version plugin, xem ghi chú ở trên) */
    const STORAGE_KEY = 'RecentRequestLog_tour_version';

    /* ── Biến trạng thái ───────────────────────────────────────────── */
    let currentStep = 0;
    let overlay = null;
    let tooltip = null;
    let highlightBox = null;
    let isActive = false;
    /* Danh sách log thật được backup trước khi chạy hướng dẫn (Dọn dẹp danh sách trong lúc hướng dẫn, xong thì hồi phục lại) */
    let savedRecords = null;
    /* Bộ đếm số lần tìm kiếm mục tiêu xịt (Để không bị skip vội nếu DOM chưa load xong) */
    let findTargetRetryCount = 0;

    /* ── Cấu hình bước hướng dẫn ───────────────────────────────────────── */
    /* Mỗi bước = Phần tử mục tiêu + Text hiển thị + Tùy chọn; Các bước cần làm trò (mở hộc/xem trước/tìm kiếm...)
       thì móc với mấy hàm ở khu "Hàm hỗ trợ hành động" bên dưới, muốn đẻ thêm bước thì copy một object là xong. */
    const steps = [
        {
            targetSelector: '.rlog-title-text',
            desc: 'Click vào đây để <strong>thu gọn/mở rộng</strong>'
        },
        {
            targetSelector: '.rlog-title-count',
            desc: '<strong>Nháy đúp</strong> vào số để cài đặt giới hạn log',
            padding: 0
        },
        {
            targetSelector: '.rlog-header-drag-space',
            desc: 'Nhấn giữ vùng trống để <strong>kéo cửa sổ</strong>'
        },
        {
            targetSelector: '.rlog-resize-grip',
            desc: 'Nhấn giữ&nbsp;<i class="fa-solid fa-caret-down" style="transform: rotate(-45deg);"></i>&nbsp;rồi kéo để <strong>điều chỉnh kích thước cửa sổ</strong>',
            placement: 'top',
            padding: 0
        },
        {
            targetSelector: '.rlog-header-actions',
            desc: '• Thêm tùy chọn<br>• Thu gọn tất cả<br>• Đóng bảng điều khiển'
        },
        {
            targetSelector: '#rlog-more-drawer',
            desc: 'Click vào <strong>Thêm tùy chọn</strong> để hiện:<br>• Công tắc xem trước nội dung<br>• Công tắc tổng plugin<br>• Hướng dẫn sử dụng<br>• Nút test tạm thời (sẽ xóa sau)<br>• Xóa sạch mọi log<br>• Đổi chế độ Sáng/Tối',
            onEnter: enterDrawerStep,
            onLeave: leaveDrawerStep
        },
        {
            targetSelector: '.rlog-record[data-record-index="0"] .rmsg-item .rmsg-preview-text',
            desc: 'Bật <strong>Xem trước nội dung</strong> để hiện một phần chữ đầu tin nhắn nha',
            onEnter: enterPreviewStep,
            onLeave: leavePreviewStep
        },
        {
            targetSelector: '.rlog-record[data-record-index="0"] .rlog-record-info',
            desc: '• Tên nhân vật<br>• Nguồn request<br>• Thời gian<br>• Tên model<br>• Số token [Số lượng tin nhắn] (Có dấu "~" phía trước là số ước tính nha)'
        },
        {
            targetSelector: '.rlog-record[data-record-index="0"] .rlog-record-actions-inner',
            desc: '<strong>Khi mở rộng sẽ hiện:</strong><br>• Tìm kiếm<br>• Mở/Thu gọn tất cả tin nhắn con<br>• <strong>New Bay nhanh xuống đáy</strong><br>• <strong>New Xem toàn văn</strong> (Nút <strong>Copy toàn bộ request</strong> cũ được dời vào trong này nè)<br>• Xóa log này'
        },
        {
            targetSelector: '.rlog-search-box',
            desc: '• Click 🔍︎ , nhập từ khóa để tìm kiếm<br>• Nhấn mũi tên hoặc Enter/Shift+Enter để nhảy giữa các kết quả<br>• Click 🔍︎ lần nữa để tắt tìm kiếm',
            /* Căn chỉnh khung highlight tự tạo: Mép trái dính sát mép trái nút kính lúp (Tự thích nghi nút 24px trên Desktop / 20px trên mobile),
               Xén bớt 8px trên dưới để chừa vùng bảo vệ chống click nhầm */
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
            desc: '<strong>Khi mở rộng sẽ hiện:</strong><br>• Copy tin nhắn lẻ<br><br>[Hướng dẫn xong rồi nè, click icon ❔ để xem lại nha]'
        }
    ];

    /* ── Hàm hỗ trợ hành động ───────────────────────────────────── */
    /* Bước hộc kéo: Bước vào thì mở hộc "Thêm tùy chọn", bước ra thì đóng lại.
       Xài chiêu cấm transition tạm thời + ép reflow để cái hộc chui tọt ra tức thì, khung highlight khỏi bị giật nhấp nhô. */
    function setDrawerState(open) {
        const drawer = document.getElementById('rlog-more-drawer');
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

    /* Bước xem trước: Bước vào thì mở banh chành log/tin nhắn demo ra và bật xem trước, bước ra thì tắt xem trước đi */
    function enterPreviewStep() {
        if (window.__RLogApi && window.__RLogApi.expandDemo) {
            window.__RLogApi.expandDemo(); /* Chắc chắn là log với tin nhắn đang há to */
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

    /* Bước tìm kiếm: Bước vào thì lôi ô tìm kiếm ra search chữ "示例" (demo), bước ra thì dẹp ô tìm kiếm */
    function enterSearchStep() {
        /* Đống demo đã được bơm vào từ startTour (Lúc nào cũng bơm), khỏi cần check danh sách trống hay không.
           Lôi ô tìm kiếm ra gõ "示例" (Bảo đảm có kết quả vì data demo có chữ này)
           Lưu ý: Đừng có gọi expandDemo/injectDemo trước hay sau openSearchForRecord,
           mấy cái đó sẽ gọi renderPanelContent() → resetSearchIfActive() quét sạch cái ô tìm kiếm vừa đẻ ra đó.
           Mấy hàm openSearchForRecord/performSearch/closeSearch nằm vất vưởng trong index.js không xài global được,
           phải móc qua __RLogApi. */
        if (window.__RLogApi && typeof window.__RLogApi.openSearchForRecord === 'function') {
            window.__RLogApi.openSearchForRecord(0);
        }
        /* Nhét chữ vào ô (performSearch chỉ cập nhật searchState chứ không dán vào input.value) */
        const searchBox = document.querySelector('#rlog-panel .rlog-search-box');
        const inputEl = searchBox ? searchBox.querySelector('.rlog-search-input') : null;
        if (inputEl) {
            inputEl.value = '示例';
        }
        if (window.__RLogApi && typeof window.__RLogApi.performSearch === 'function') {
            window.__RLogApi.performSearch(0, '示例');
        }
    }

    function leaveSearchStep() {
        if (window.__RLogApi && typeof window.__RLogApi.closeSearch === 'function') {
            window.__RLogApi.closeSearch();
        }
    }

    /* ── Kiểm tra phiên bản & Khởi động ─────────────────────────────────────── */
    /* Thó lén version của manifest.json, chép vào currentTourVersion.
       Thó xịt thì xài bản dự phòng (Đọc kỹ note "Phiên bản dự phòng" ở trên), cục gọi hàm sẽ tự quyết định có bung hướng dẫn ra không. */
    async function loadManifestVersion() {
        try {
            /* Lùng sục đường dẫn của manifest.json */
            let manifestUrl = '/scripts/extensions/third-party/RecentRequestLog/manifest.json';
            const scripts = document.getElementsByTagName('script');
            for (let i = 0; i < scripts.length; i++) {
                if (scripts[i].src && scripts[i].src.includes('RecentRequestLog/tour.js')) {
                    manifestUrl = scripts[i].src.replace('tour.js', 'manifest.json');
                    break;
                }
            }

            /* Nhét thêm timestamp để lừa cache */
            const response = await fetch(`${manifestUrl}?t=${Date.now()}`, { cache: 'no-cache' });
            if (response.ok) {
                const manifest = await response.json();
                if (manifest && manifest.version) {
                    currentTourVersion = manifest.version;
                }
            }
        } catch (e) {
            console.warn('[RecentRequestLog] Lấy version manifest.json tạch rồi, xài bản dự phòng vậy', e);
        }
    }

    /* Đọ "Version đã xem ở local" với "Version manifest hiện tại": Lệch pha (hoặc ép force) thì vác hướng dẫn ra. */
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

        /* Phải ngó thấy cái bảng điều khiển thì mới diễn hướng dẫn được */
        const panel = document.getElementById('rlog-panel');
        if (!panel || panel.style.display === 'none') return;

        /* Nếu đang cụp lại thì banh nó ra trước */
        if (panel.classList.contains('rlog-window-collapsed')) {
            const titleText = panel.querySelector('.rlog-title-text');
            if (titleText) titleText.click();
        }

        isActive = true;
        currentStep = 0;

        /* Lúc hướng dẫn chỉ mang hàng demo ra khoe, cất hàng real đi nha:
           1. Chép danh sách log thật hiện tại vào savedRecords để backup
           2. Cắm cờ báo đang hướng dẫn (Mấy log mới bay tới lúc này chỉ đưa vào tạm giam, không được ló mặt ra, index.js lo vụ này)
           3. Dọn sạch bách danh sách (setRecords([]))
           4. Bơm hàng demo vào (Nhét lên top, đám data-record-index="0" đều đánh thẳng vào con demo này)
           Làm thế này thì nguyên cái DOM nằm gọn trong lòng bàn tay, không sợ danh sách thật dài quá
           làm bước cuối "Copy tin nhắn lẻ" đè lộn chỗ do log thật không kiểm soát được.
           Lúc endTour sẽ quét sạch demo rồi bưng savedRecords trả về chỗ cũ. */
        if (window.__RLogApi) {
            const api = window.__RLogApi;
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

        /* Đợi một tẹo cho DOM với animation an tọa rồi mới quẩy */
        setTimeout(() => {
            executeStep(currentStep);
        }, START_DELAY_MS);
    }

    function endTour() {
        if (!isActive) return;

        /* Kích hoạt onLeave của bước cuối cùng */
        if (steps[currentStep] && typeof steps[currentStep].onLeave === 'function') {
            steps[currentStep].onLeave();
        }

        isActive = false;

        /* Lưu sổ version */
        localStorage.setItem(STORAGE_KEY, currentTourVersion);

        /* Tháo dỡ UI */
        if (overlay) overlay.remove();
        if (tooltip) tooltip.remove();
        if (highlightBox) highlightBox.remove();

        overlay = null;
        tooltip = null;
        highlightBox = null;

        /* Dọn đồ: Đem danh sách log thật lúc nãy + đám log mới ấp trong lúc hướng dẫn trả về:
           - Log mới tạt ngang trong lúc hướng dẫn bị index.js nhốt tạm (không cho hiện), giờ lôi ra,
             nhập chung với đống log backup (Mới đứng trước, cũ đứng sau, đúng chuẩn "Mới nhất trên top")
           - Nếu trước đó chả có log nào (savedRecords trống lốc) → Chỉ vác đám log mới ra thôi
           Mượn requestAnimationFrame hoãn binh tới frame sau mới phục hồi: Để mấy cái UI hướng dẫn bốc hơi ngay tắp lự (Phản hồi tức thì),
           rồi mới gánh cục tạ render lại danh sách (Chục log x Trăm tin nhắn thì gánh render lòi trĩ cả mấy trăm ms).
           Cứ bấm "Hoàn thành" là bóng dáng hướng dẫn bay lẹ, danh sách phọt ra ở frame sau, UI khỏi lo chết cứng. */
        if (savedRecords !== null && window.__RLogApi && typeof window.__RLogApi.setRecords === 'function') {
            const recordsBeforeTour = savedRecords;
            savedRecords = null;
            requestAnimationFrame(() => {
                const api = window.__RLogApi;
                if (api && typeof api.setRecords === 'function') {
                    /* Khui đám log tạm giam ra trước (Hoãn tới giây chót mới khui,
                       Kẻo lúc rAF kẽ hở có log mới bay vào lọt sổ không bị đè mất) */
                    let pendingRecords = [];
                    if (typeof api.drainTourPendingRecords === 'function') {
                        pendingRecords = api.drainTourPendingRecords();
                    }
                    /* Có log mới đến lúc đang hướng dẫn thì hành xử y như addRecord bình thường:
                       Log mới tới thì mấy log cũ tự động cụp đuôi lại (Chỉ gập log lại thôi, tin nhắn con kệ nó).
                       Không có log mới thì trả y nguyên trạng thái cũ, khỏi chọc ngoáy làm user bực mình. */
                    if (pendingRecords.length > 0) {
                        recordsBeforeTour.forEach(r => { r.collapsed = true; });
                    }
                    api.setRecords(pendingRecords.concat(recordsBeforeTour));
                }
                /* Hoàn hồn xong thì tắt cờ hướng dẫn, log mới bay tới cứ hiên ngang nhảy vào danh sách như thường */
                if (api && typeof api.setTourActive === 'function') {
                    api.setTourActive(false);
                }
            });
        } else {
            savedRecords = null;
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

        /* Chạy onLeave của bước vừa xong */
        if (steps[currentStep] && currentStep !== nextIndex && typeof steps[currentStep].onLeave === 'function') {
            steps[currentStep].onLeave();
        }

        currentStep = nextIndex;

        /* Chạy onEnter của bước hiện tại */
        if (steps[currentStep] && typeof steps[currentStep].onEnter === 'function') {
            steps[currentStep].onEnter();
        }

        /* Hiện nguyên hình text của bong bóng cái rụp, khỏi làm user thấy bị "khựng" lúc click */
        showStep(currentStep);
    }

    /* ── Tạo và hiển thị UI ──────────────────────────────────────── */
    function createUI() {
        /* Lớp phủ tàng hình */
        overlay = document.createElement('div');
        overlay.className = 'rlog-tour-overlay';

        /* Khung sáng */
        highlightBox = document.createElement('div');
        highlightBox.className = 'rlog-tour-highlight';

        /* Bong bóng chat */
        tooltip = document.createElement('div');
        tooltip.className = 'rlog-tour-tooltip';

        /* Nhét vào bụng bảng điều khiển, đi đâu nó cũng bám theo */
        const panel = document.getElementById('rlog-panel');
        if (panel) {
            panel.appendChild(overlay);
            panel.appendChild(highlightBox);
            panel.appendChild(tooltip);

            /* Chọt vào lớp phủ: Không trúng popup → Qua bước mới (Tới bến rồi thì dẹp) */
            overlay.addEventListener('click', (e) => {
                e.stopPropagation();
                /* Chọt vô bong bóng thì mặc xác (Nó tự có nút của nó rồi) */
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

    /* Đúc nội dung bong bóng: Nút X + Mô tả + Dàn chấm tròn + Nút Lui/Bỏ qua/Tới */
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
                    ${!isFirst ? `<button class="rlog-tour-btn rlog-tour-prev">Quay lại</button>` : `<button class="rlog-tour-btn rlog-tour-skip">Bỏ qua</button>`}
                    <button class="rlog-tour-btn rlog-tour-next rlog-tour-primary">${isLast ? 'Xong' : 'Tiếp tục'}</button>
                </div>
            </div>
        `;
    }

    /* Phù phép sự kiện cho mớ nút với chấm tròn trong bong bóng: Tới/Lui/Bỏ qua/Thoát/Nhảy cóc */
    function bindTooltipEvents() {
        const btnPrev = tooltip.querySelector('.rlog-tour-prev');
        const btnNext = tooltip.querySelector('.rlog-tour-next');
        const btnSkip = tooltip.querySelector('.rlog-tour-skip');
        const btnClose = tooltip.querySelector('.rlog-tour-close');

        if (btnPrev) btnPrev.addEventListener('click', (e) => { e.stopPropagation(); executeStep(currentStep - 1); });
        if (btnNext) btnNext.addEventListener('click', (e) => { e.stopPropagation(); executeStep(currentStep + 1); });
        if (btnSkip) btnSkip.addEventListener('click', (e) => { e.stopPropagation(); endTour(); });
        if (btnClose) btnClose.addEventListener('click', (e) => { e.stopPropagation(); endTour(); });

        /* Chọt chấm tròn để nhảy cóc */
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
        const panel = document.getElementById('rlog-panel');
        const targetEl = panel ? panel.querySelector(step.targetSelector) : null;

        if (!targetEl) {
            /* Quét không ra mục tiêu thì ngâm đấy chờ (Đợi DOM nở ra, vd ô tìm kiếm lòi ra) */
            if (findTargetRetryCount < TARGET_RETRY_MAX) {
                findTargetRetryCount++;
                setTimeout(() => {
                    if (isActive && currentStep === index) {
                        showStep(index);
                    }
                }, TARGET_RETRY_DELAY_MS);
            } else {
                findTargetRetryCount = 0;
                console.warn(`[Tour] Tìm mỏi mắt không thấy: ${step.targetSelector}`);
                executeStep(index + 1);
            }
            return;
        }
        findTargetRetryCount = 0;

        /* Cập nhật ruột bong bóng */
        tooltip.innerHTML = buildTooltipHtml(index);

        /* Kích hoạt sự kiện nút */
        bindTooltipEvents();

        /* Định vị cho cái khung sáng với bong bóng */
        positionElements(targetEl, step);
    }

    /* ── Tính toán định vị ─────────────────────────────────────── */
    function positionElements(targetEl, step) {
        const panel = document.getElementById('rlog-panel');
        if (!panel) return;

        const placement = step.placement;
        const padding = step.padding !== undefined ? step.padding : HIGHLIGHT_PADDING_DEFAULT;

        const panelRect = panel.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();

        /* Tính toán tọa độ so với ruột bảng điều khiển */
        const top = targetRect.top - panelRect.top;
        const left = targetRect.left - panelRect.left;
        const width = targetRect.width;
        const height = targetRect.height;

        let boxTop = top - padding;
        let boxLeft = left - padding;
        let boxWidth = width + padding * 2;
        let boxHeight = height + padding * 2;

        /* Nắn nót lại khung sáng (Dành cho việc soi đúng chuẩn cái ô tìm kiếm...)
           topExtra/bottomExtra dương là cắt bớt vào trong, âm là bành ra ngoài */
        if (step.highlightAdjust) {
            const adj = step.highlightAdjust;
            /* leftAlignTo: Ép cạnh trái thẳng tắp với mép trái của phần tử neo (như cái nút kính lúp).
               Đo tọa độ thực tế của mỏ neo, tự động thích ứng với chênh lệch nút bự 24px (Desktop) / nút nhỏ 20px (Mobile),
               tránh việc xài tọa độ chết (Di động mà xài số chết là lệch 4px ngay). */
            if (adj.leftAlignTo) {
                const anchorEl = targetEl.parentElement
                    ? targetEl.parentElement.querySelector(adj.leftAlignTo)
                    : null;
                if (anchorEl) {
                    const anchorRect = anchorEl.getBoundingClientRect();
                    const anchorLeft = anchorRect.left - panelRect.left;
                    /* Cạnh trái = Mép trái mỏ neo (Chuẩn xác, không thêm padding),
                       Cạnh phải giữ nguyên = Mép phải mục tiêu gốc + padding (Giống hệt ngữ nghĩa padding trên dưới) */
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

        /* Chốt vị trí khung sáng */
        highlightBox.style.boxSizing = ''; /* Trả lại mặc định, ngừa bệnh border-box ám quẻ */
        highlightBox.style.top = `${boxTop}px`;
        highlightBox.style.left = `${boxLeft}px`;
        highlightBox.style.width = `${boxWidth}px`;
        highlightBox.style.height = `${boxHeight}px`;

        /* Hiện bong bóng lên (Phải display:block mới đo đạc được kích thước nhé) */
        tooltip.style.display = 'block';
        tooltip.style.opacity = '1';

        /* Trì hoãn định vị bong bóng một xíu, chắc chắn húp được đúng offsetHeight */
        requestAnimationFrame(() => {
            const tooltipWidth = tooltip.offsetWidth;
            const tooltipHeight = tooltip.offsetHeight;

            let tooltipTop = 0;
            let tooltipLeft = 0;

            if (placement === 'top') {
                tooltipTop = top - tooltipHeight - padding - TOOLTIP_ARROW_GAP;
                tooltip.classList.add('rlog-tour-top');
            } else {
                /* placement mặc định là chui xuống dưới */
                tooltipTop = top + height + padding + TOOLTIP_ARROW_GAP; /* Độ hở của cái chóp mũi tên */
                tooltip.classList.remove('rlog-tour-top');
            }

            /* Căn bong bóng vô chính giữa mục tiêu theo chiều ngang */
            tooltipLeft = left + (width / 2) - (tooltipWidth / 2);
            let arrowLeft = tooltipWidth / 2;

            /* Chống tràn bên phải */
            if (tooltipLeft + tooltipWidth > panelRect.width - TOOLTIP_EDGE_MARGIN) {
                tooltipLeft = panelRect.width - tooltipWidth - TOOLTIP_EDGE_MARGIN;
                arrowLeft = targetRect.left - panelRect.left - tooltipLeft + targetRect.width / 2;
            } else if (tooltipLeft < TOOLTIP_EDGE_MARGIN) {
                /* Chống tràn bên trái */
                tooltipLeft = TOOLTIP_EDGE_MARGIN;
                arrowLeft = targetRect.left - panelRect.left - tooltipLeft + targetRect.width / 2;
            }

            /* Hãm cương mũi tên đừng để đâm lòi ra ngoài bong bóng (Chừa lại 24px cách mép, chống mũi tên mọc ngoài viền bo góc hoặc bay tự do) */
            if (arrowLeft > tooltipWidth - ARROW_EDGE_LIMIT) arrowLeft = tooltipWidth - ARROW_EDGE_LIMIT;
            if (arrowLeft < ARROW_EDGE_LIMIT) arrowLeft = ARROW_EDGE_LIMIT;

            tooltip.style.setProperty('--arrow-left', `${arrowLeft}px`);
            tooltip.style.top = `${tooltipTop}px`;
            tooltip.style.left = `${tooltipLeft}px`;
        });
    }

    /* ── API ra bên ngoài ────────────────────────────────────────────── */
    /* Lộ hàng API cho thế giới bên ngoài xài (index.js load động file này xong thì dùng) */
    window.__RLogTour = {
        check: checkAndStartTour,
        start: startTour,
        end: endTour
    };

})();