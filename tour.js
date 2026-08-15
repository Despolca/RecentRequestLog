/**
 * Nhật ký yêu cầu gần đây - Cẩm nang tân thủ (Product Tour) nè ✨
 */

(function () {
    // ⚠️ Phiên bản lót đường: Chỉ móc ra xài khi vớt manifest.json thất bại thôi nha, chả liên quan gì tới version của plugin đâu! 😤
    // Tuyệt đối hông được update cái này theo bản release của plugin! Nó là cái phao cứu sinh ghi nhớ "phiên bản hướng dẫn load thành công lần cuối": 🛑
    // - Lỡ tay sửa thành version mới (như 1.8.0), lúc lấy manifest xịt nó sẽ ảo tưởng là "đã coi hướng dẫn mới" rồi skip luôn đó. (￢_￢;)
    // - Cứ ôm khư khư đồ cổ (1.6.0) là để phòng hờ lúc manifest sập nguồn thì vẫn lôi hướng dẫn ra ép Editor coi, khỏi lo mù tịt tính năng mới! (๑•̀ㅂ•́)و✧
    let currentTourVersion = '1.6.0'; // Phiên bản lót đường (Cấm update theo plugin nha, ngó lên trên mà đọc giải thích! 👆)
    const STORAGE_KEY = 'RecentRequestLog_tour_version';

    const steps = [
        {
            targetSelector: '.rlog-title-text',
            desc: 'Click nhẹ vào đây để <strong>thu gọn/bung lụa</strong> nè (´• ω •)'
        },
        {
            targetSelector: '.rlog-title-count',
            desc: '<strong>Double click</strong> vô con số để set giới hạn dung lượng log nha 🔢',
            padding: 0
        },
        {
            targetSelector: '.rlog-header-drag-space',
            desc: 'Đè chặt chỗ trống rồi <strong>kéo lê cửa sổ</strong> đi dạo 🐾'
        },
        {
            targetSelector: '.rlog-resize-grip',
            desc: 'Nắm đầu cái&nbsp;<i class="fa-solid fa-caret-down" style="transform: rotate(-45deg);"></i>&nbsp;rồi kéo để <strong>bóp/kéo giãn cửa sổ</strong> nha 📐',
            placement: 'top',
            padding: 0
        },
        {
            targetSelector: '.rlog-header-actions',
            desc: '• 1001 tùy chọn khác<br>• Gập gọn hết đám log lại<br>• Đóng cửa nghỉ khỏe 🚪'
        },
        {
            targetSelector: '#rlog-more-drawer',
            desc: 'Chọt vô <strong>Tùy chọn khác</strong> để khui ra:<br>• Công tắc soi trước nội dung 👀<br>• Cầu dao tổng của plugin 🔌<br>• Gọi hồn cẩm nang tân thủ 📖<br>• Nút test dạo (Mốt Tawa đá đi sau)<br>• Tẩy não toàn bộ log 🗑️<br>• Đổi tông Sáng/Tối ☀️🌙',
            onEnter: () => {
                const drawer = document.getElementById('rlog-more-drawer');
                if (drawer) drawer.style.transition = 'none';
                if (window.__RLogApi && window.__RLogApi.openDrawer) {
                    window.__RLogApi.openDrawer();
                }
                if (drawer) {
                    void drawer.offsetWidth;
                    drawer.style.transition = '';
                }
            },
            onLeave: () => {
                const drawer = document.getElementById('rlog-more-drawer');
                if (drawer) drawer.style.transition = 'none';
                if (window.__RLogApi && window.__RLogApi.closeDrawer) {
                    window.__RLogApi.closeDrawer();
                }
                if (drawer) {
                    void drawer.offsetWidth;
                    drawer.style.transition = '';
                }
            }
        },
        {
            targetSelector: '.rlog-record[data-record-index="0"] .rmsg-item .rmsg-preview-text',
            desc: 'Bật <strong>Xem trước nội dung</strong> lên là sẽ soi được một khúc đầu của tin nhắn đó nha 🔍',
            onEnter: () => {
                if (window.__RLogApi && window.__RLogApi.expandDemo) {
                    window.__RLogApi.expandDemo(); // Ép uổng bắt log với tin nhắn phải phơi bày ra hết 😤
                }
                if (window.__RLogApi && window.__RLogApi.forcePreview) {
                    window.__RLogApi.forcePreview(true);
                }
            },
            onLeave: () => {
                if (window.__RLogApi && window.__RLogApi.forcePreview) {
                    window.__RLogApi.forcePreview(false);
                }
            }
        },
        {
            targetSelector: '.rlog-record[data-record-index="0"] .rlog-record-info',
            desc: '• Tên diễn viên<br>• Nguồn gọi hồn<br>• Dấu ấn thời gian ⏱️<br>• Tên model<br>• Lượng token/số lượng tin nhắn (Thấy có dấu "~" trước token là Tawa chỉ phỏng đoán thôi đó nha 🤷‍♀️)'
        },
        {
            targetSelector: '.rlog-record[data-record-index="0"] .rlog-record-actions-inner',
            desc: '<strong>Lúc bung lụa sẽ lòi ra:</strong><br>• Kính lúp tìm kiếm 🔍<br>• Bung/Gập hết tin nhắn trong ruột<br>• <strong>[MỚI] Soi Sạch Nội Y (Xem toàn văn)</strong> (Cái <strong>Copy nguyên cục</strong> bị nhét vô trong rồi nha)<br>• Trảm luôn bản ghi này 🔪'
        },
        {
            targetSelector: '.rlog-search-box',
            desc: '• Chọt nhẹ 🔍︎, gõ từ khóa vô rồi quẩy thôi<br>• Lấy mũi tên hoặc đập Enter/Shift+Enter để nhảy cóc giữa các mục 🎯<br>• Chọt 🔍︎ cái nữa để dẹp trò tìm kiếm 🛑',
            // Khung highlight tự chế nè: Ép mép trái dính sát mép trái của kính lúp (Tự uốn éo theo 24px PC / 20px mobile nha), 📏
            // Xén bớt 8px trên dưới làm lá chắn bảo vệ chống chọt nhầm 🛡️
            highlightAdjust: {
                leftAlignTo: '.rlog-search-btn',
                topExtra: 8,
                bottomExtra: 8
            },
            onEnter: () => {
                // Demo đã được Tawa chích vô từ lúc startTour rồi (Lúc nào cũng tiêm), khỏi mất công check list rỗng hay hông. 💉
                // Khui ô tìm kiếm rồi tra chữ "Ví dụ" (Demo có giấu chữ này, bao đảm bới ra kết quả) 🕵️‍♀️
                // Nhớ kỹ: Cấm tuyệt đối xài trò expandDemo/injectDemo trước hay sau khi gọi openSearchForRecord, 🛑
                // Tụi nó sẽ kích hoạt renderPanelContent() → resetSearchIfActive() làm bốc hơi cái ô tìm kiếm vừa nặn ra đó! 💨
                // Đám openSearchForRecord/performSearch/closeSearch giấu mặt trong index.js chứ hông lòi ra global đâu, 👻
                // Phải đi cửa sau qua __RLogApi mới mò ra được. 🚪
                if (window.__RLogApi && typeof window.__RLogApi.openSearchForRecord === 'function') {
                    window.__RLogApi.openSearchForRecord(0);
                }
                // Bơm chữ vô ô text (performSearch chỉ update searchState thôi, hông chịu tự điền vô input.value đâu) ⌨️
                const searchBox = document.querySelector('#rlog-panel .rlog-search-box');
                const inputEl = searchBox ? searchBox.querySelector('.rlog-search-input') : null;
                if (inputEl) {
                    inputEl.value = 'Ví dụ';
                }
                if (window.__RLogApi && typeof window.__RLogApi.performSearch === 'function') {
                    window.__RLogApi.performSearch(0, 'Ví dụ');
                }
            },
            onLeave: () => {
                if (window.__RLogApi && typeof window.__RLogApi.closeSearch === 'function') {
                    window.__RLogApi.closeSearch();
                }
            }
        },
        {
            targetSelector: '.rlog-record[data-record-index="0"] .rmsg-item .rmsg-copy-btn',
            desc: '<strong>Lúc bung lụa sẽ lòi ra:</strong><br>• Móc túi (Copy) lẻ tẻ từng tin nhắn ✂️<br><br>【Chương trình lùa gà tân thủ tới đây là hết, chọt vô cục ❔ để ôn lại bài nha】'
        }
    ];

    let currentStep = 0;
    let overlay = null;
    let tooltip = null;
    let highlightBox = null;
    let isActive = false;
    let isDemoInjected = false;
    /** Túi xách chứa hàng real trước khi lùa gà (Lúc diễn tour thì dọn sạch, diễn xong trả lại chỗ cũ) 👜 */
    let savedRecords = null;
    let stepTimer = null;
    /** Số mạng dự phòng khi kiếm hông ra mục tiêu (Để khỏi bị skip khi DOM còn đang ngái ngủ) 🎮 */
    let findTargetRetryCount = 0;

    async function checkAndStartTour(force = false) {
        try {
            // Moi đường link manifest.json bằng ma pháp động 🪄
            let manifestUrl = '/scripts/extensions/third-party/RecentRequestLog/manifest.json';
            const scripts = document.getElementsByTagName('script');
            for (let i = 0; i < scripts.length; i++) {
                if (scripts[i].src && scripts[i].src.includes('RecentRequestLog/tour.js')) {
                    manifestUrl = scripts[i].src.replace('tour.js', 'manifest.json');
                    break;
                }
            }

            // Đắp thêm bùa thời gian chống cache cùi bắp ⏰
            const response = await fetch(`${manifestUrl}?t=${Date.now()}`, { cache: 'no-cache' });
            if (response.ok) {
                const manifest = await response.json();
                if (manifest && manifest.version) {
                    currentTourVersion = manifest.version;
                }
            }
        } catch (e) {
            console.warn('[RecentRequestLog] Moi số version từ manifest.json xịt ngòi rồi, lôi hàng lót đường ra xài tạm', e);
        }

        const savedVersion = localStorage.getItem(STORAGE_KEY);
        if (force || savedVersion !== currentTourVersion) {
            startTour();
        }
    }

    function startTour() {
        if (isActive) return;
        
        // Cái bảng điều khiển phải hiện hồn ra mới dắt đi tour được chứ! 👻
        const panel = document.getElementById('rlog-panel');
        if (!panel || panel.style.display === 'none') return;

        // Đang bị cuộn tròn thì banh cái panel ra trước đã 🧻
        if (panel.classList.contains('rlog-window-collapsed')) {
            const titleText = panel.querySelector('.rlog-title-text');
            if (titleText) titleText.click();
        }

        isActive = true;
        currentStep = 0;
        isDemoInjected = false;

        // Trong lúc đi tour chỉ khoe hàng demo thôi, giấu nhẹm hàng real đi nha: 🙈
        // 1. Chép đống log real hiện tại cất vô savedRecords 🗄️
        // 2. Cắm cờ đang dẫn tour (Từ khúc này log mới tới thì quăng vô kho tạm, miễn hiện ra, để index.js lo) 🚩
        // 3. Dọn sạch bách cái list (setRecords([])) 🧹
        // 4. Tiêm demo vô (Nhét lên đỉnh đầu, mọi bước có data-record-index="0" đều trút lên đầu thằng demo này) 💉
        // Chơi chiêu này để thao túng hoàn toàn DOM lúc dẫn tour, đề phòng trong list có hàng real... 🎮
        // Xong rồi khúc cuối "Copy lẻ tẻ" nó chỉ điểm nhầm vô hàng real hông kiểm soát được làm lệch khung! (￢_￢;)
        // Vô endTour là Tawa sẽ sút bay demo rồi móc savedRecords ra lại. 🔄
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
                isDemoInjected = true;
            }
        }

        createUI();
        
        // Gồng thêm xíu chờ thằng DOM với animation lề mề múa xong ⏳
        setTimeout(() => {
            executeStep(currentStep);
        }, 100);
    }

    function endTour() {
        if (!isActive) return;

        // Dứt điểm đòn onLeave của bước cuối ⚔️
        if (steps[currentStep] && typeof steps[currentStep].onLeave === 'function') {
            steps[currentStep].onLeave();
        }

        isActive = false;

        // Khắc cốt ghi tâm cái version 🖋️
        localStorage.setItem(STORAGE_KEY, currentTourVersion);

        // Phá dỡ UI 💥
        if (overlay) overlay.remove();
        if (tooltip) tooltip.remove();
        if (highlightBox) highlightBox.remove();
        
        overlay = null;
        tooltip = null;
        highlightBox = null;

        // Phục hồi nhân phẩm cho đống log cũ + nhét thêm mớ log mới lụm lúc đi tour: 🧟‍♀️
        // - Hàng mới rớt xuống lúc đi tour bị index.js nhốt lại (hông cho lên sóng), giờ khui ra trước, 📦
        //   Rồi trộn chung với đống backup lúc nãy (Mới nằm trên, cũ đè dưới, chuẩn trend "Đồ mới nhất đội lên đầu") 👑
        // - Nếu trước đó nghèo rớt mồng tơi (savedRecords rỗng tuếch) → Thì xài đỡ mớ log mới nhặt được thôi 🤷‍♀️
        // Quăng requestAnimationFrame để câu giờ qua frame sau mới hồi phục: Cho cái giao diện tour nó bốc hơi trước đã (Tạo cảm giác mượt mà), 💨
        // Rồi mới lôi cái cục nợ render list ra xử (Cái thứ mà 100 log × 100+ tin nhắn có khi ngốn cả đống ms). 🐢
        // Làm trò này để lúc Editor chọt "Hoàn thành" là cái bong bóng nó lặn mất tăm liền, list hồi sinh ở nhịp sau, khỏi lo UI đứng hình chết lâm sàng! (๑•̀ㅂ•́)و✧
        if (savedRecords !== null && window.__RLogApi && typeof window.__RLogApi.setRecords === 'function') {
            const recordsBeforeTour = savedRecords;
            savedRecords = null;
            requestAnimationFrame(() => {
                const api = window.__RLogApi;
                if (api && typeof api.setRecords === 'function') {
                    // Móc đống log tạm giam lúc đi tour ra trước (Ngâm tới phút chót mới móc, 🎣
                    // Chứ hông mấy cái rAF nó lọt sổ log mới vô list cũ rồi bay màu luôn đó) 👻
                    let pendingRecords = [];
                    if (typeof api.drainTourPendingRecords === 'function') {
                        pendingRecords = api.drainTourPendingRecords();
                    }
                    // Lúc đi tour mà có lộc rớt xuống, thì cứ diễn y xì addRecord bình thường: 🎭
                    // Hàng mới tới là gập cổ hết đám cũ lại (Chỉ gập cái vỏ thôi, ruột gan tin nhắn vẫn giữ y nguyên). 📦
                    // Ế độ hông có log mới thì cứ trả về y boong lúc chưa đi tour, hông thèm đụng chạm tới trạng thái bung lụa của Editor. ✨
                    if (pendingRecords.length > 0) {
                        recordsBeforeTour.forEach(r => { r.collapsed = true; });
                    }
                    api.setRecords(pendingRecords.concat(recordsBeforeTour));
                }
                // Hồi sinh xong xuôi rồi mới lột mác đi tour, từ đó log mới tới cứ ném vô list như cơm bữa 🍚
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
        isDemoInjected = false;
    }

    function executeStep(nextIndex) {
        if (nextIndex < 0 || nextIndex >= steps.length) {
            endTour();
            return;
        }

        if (stepTimer) {
            clearTimeout(stepTimer);
            stepTimer = null;
        }

        // Xuất chiêu onLeave của bước trước 🥋
        if (steps[currentStep] && currentStep !== nextIndex && typeof steps[currentStep].onLeave === 'function') {
            steps[currentStep].onLeave();
        }

        currentStep = nextIndex;

        // Bơm onEnter của bước hiện tại 💉
        if (steps[currentStep] && typeof steps[currentStep].onEnter === 'function') {
            steps[currentStep].onEnter();
        }

        // Đập luôn cái chữ bong bóng ra mặt liền, cho Editor khỏi chê lag! 🎈
        showStep(currentStep);
    }

    function createUI() {
        // Tấm màng bọc 🛡️
        overlay = document.createElement('div');
        overlay.className = 'rlog-tour-overlay';
        
        // Vòng hào quang 🌟
        highlightBox = document.createElement('div');
        highlightBox.className = 'rlog-tour-highlight';

        // Bong bóng bà tám 💬
        tooltip = document.createElement('div');
        tooltip.className = 'rlog-tour-tooltip';
        
        // Nhét vô ruột panel, bắt nó lẽo đẽo đi theo panel 🐾
        const panel = document.getElementById('rlog-panel');
        if (panel) {
            panel.appendChild(overlay);
            panel.appendChild(highlightBox);
            panel.appendChild(tooltip);

            // Chọt trúng màng bọc: Lệch khỏi bong bóng → Nhảy bước tiếp (Tới đáy thì nghỉ khỏe) ⏭️
            overlay.addEventListener('click', (e) => {
                e.stopPropagation();
                // Chọt trúng bong bóng thì bơ đi (Nó có nút bấm của riêng nó rồi) 💅
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

    function showStep(index) {
        const step = steps[index];
        const panel = document.getElementById('rlog-panel');
        const targetEl = panel ? panel.querySelector(step.targetSelector) : null;

        if (!targetEl) {
            // Mò hông ra mục tiêu thì câu giờ thử lại (Đợi thằng DOM tỉnh ngủ, ví dụ như cái ô tìm kiếm tự đẻ ra chẳng hạn) 🐢
            if (findTargetRetryCount < 3) {
                findTargetRetryCount++;
                setTimeout(() => {
                    if (isActive && currentStep === index) {
                        showStep(index);
                    }
                }, 100);
            } else {
                findTargetRetryCount = 0;
                console.warn(`[Tour] Mù đường hông thấy mục tiêu: ${step.targetSelector}`);
                executeStep(index + 1);
            }
            return;
        }
        findTargetRetryCount = 0;

        // Bơm chữ vô bong bóng 🎈
        const isLast = index === steps.length - 1;
        const isFirst = index === 0;

        tooltip.innerHTML = `
            <button class="rlog-tour-close" title="Dẹp luôn cái tour này"><i class="fa-solid fa-xmark"></i></button>
            <div class="rlog-tour-body">${step.desc}</div>
            <div class="rlog-tour-footer">
                <div class="rlog-tour-dots">
                    ${steps.map((_, i) => `<span class="rlog-tour-dot ${i === index ? 'active' : ''}" data-index="${i}"></span>`).join('')}
                </div>
                <div class="rlog-tour-buttons">
                    ${!isFirst ? `<button class="rlog-tour-btn rlog-tour-prev">Quay xe</button>` : `<button class="rlog-tour-btn rlog-tour-skip">Skip lẹ</button>`}
                    <button class="rlog-tour-btn rlog-tour-next rlog-tour-primary">${isLast ? 'Chốt đơn' : 'Bước tới'}</button>
                </div>
            </div>
        `;

        // Trói cổ mấy cái sự kiện vô nút 🪢
        const btnPrev = tooltip.querySelector('.rlog-tour-prev');
        const btnNext = tooltip.querySelector('.rlog-tour-next');
        const btnSkip = tooltip.querySelector('.rlog-tour-skip');
        const btnClose = tooltip.querySelector('.rlog-tour-close');

        if (btnPrev) btnPrev.addEventListener('click', (e) => { e.stopPropagation(); executeStep(currentStep - 1); });
        if (btnNext) btnNext.addEventListener('click', (e) => { e.stopPropagation(); executeStep(currentStep + 1); });
        if (btnSkip) btnSkip.addEventListener('click', (e) => { e.stopPropagation(); endTour(); });
        if (btnClose) btnClose.addEventListener('click', (e) => { e.stopPropagation(); endTour(); });

        // Cột thêm sự kiện chọt mấy cái hột tròn để nhảy cóc 🔴
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

        // Chốt tọa độ cho vòng hào quang với bong bóng 📍
        positionElements(targetEl, step);

        // Lỡ có dính delay (Kiểu như tụi CSS nó đang múa múa), thì Tawa xài vòng lặp frame để bắt tụi hào quang chạy theo sát nút, 🔄
        // Đu bám sát sàn sạt hoàn hảo luôn, chứ ai rảnh mà đứng nghệt mặt ra đợi! (๑•̀ㅂ•́)و✧
        if (step.delay && step.delay > 0) {
            let start = Date.now();
            function trackAnimation() {
                const updatedTarget = panel.querySelector(step.targetSelector);
                if (updatedTarget) positionElements(updatedTarget, step);
                
                if (Date.now() - start < step.delay) {
                    requestAnimationFrame(trackAnimation);
                }
            }
            requestAnimationFrame(trackAnimation);
        }
    }

    function positionElements(targetEl, step) {
        const panel = document.getElementById('rlog-panel');
        if (!panel) return;

        const placement = step.placement;
        const padding = step.padding !== undefined ? step.padding : 4;

        const panelRect = panel.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();

        // Tính toán tọa độ ké trong ruột panel 🧮
        const top = targetRect.top - panelRect.top;
        const left = targetRect.left - panelRect.left;
        const width = targetRect.width;
        const height = targetRect.height;

        let boxTop = top - padding;
        let boxLeft = left - padding;
        let boxWidth = width + padding * 2;
        let boxHeight = height + padding * 2;

        // Độ lại cái vòng hào quang (Để trói đúng cổ mấy khu như ô tìm kiếm nè) 🔧
        // Đám leftExtra/topExtra/bottomExtra mà dương thì bóp vô (xẻo bớt), còn âm thì phình to ra 🎈
        if (step.highlightAdjust) {
            const adj = step.highlightAdjust;
            // leftAlignTo: Bắt mép trái dính rịt lề trái của một cái mỏ neo (Kiểu như cái kính lúp vậy á). ⚓
            // Soi tọa độ thật của mỏ neo, tự động uốn éo theo cái nút 24px của PC hay 20px của mobile, 📱
            // Đá bay cái trò hardcode leftExtra (Chết cứng kiểu đó xuống mobile nó lại lòi ra 4px sai số). 🛑
            if (adj.leftAlignTo) {
                const anchorEl = targetEl.parentElement
                    ? targetEl.parentElement.querySelector(adj.leftAlignTo)
                    : null;
                if (anchorEl) {
                    const anchorRect = anchorEl.getBoundingClientRect();
                    const anchorLeft = anchorRect.left - panelRect.left;
                    // Lề trái = Mép trái mỏ neo (Chuẩn không cần chỉnh, hông thèm bú miếng padding nào), 📏
                    // Lề phải giữ nguyên = Mép phải mục tiêu gốc + padding (Giống ý nghĩa của padding trên dưới) 🧱
                    boxLeft = anchorLeft;
                    boxWidth = (left + width + padding) - anchorLeft;
                }
            }
            if (adj.leftExtra !== undefined) {
                boxLeft += adj.leftExtra;
                boxWidth -= adj.leftExtra;
            }
            if (adj.topExtra !== undefined) {
                boxTop += adj.topExtra;
                boxHeight -= adj.topExtra;
            }
            if (adj.bottomExtra !== undefined) {
                boxHeight -= adj.bottomExtra;
            }
        }

        // Trò này chế riêng cho cái núm bóp méo ở góc dưới phải thôi, hông phá làng phá xóm mấy khung khác 📐
        if (step.targetSelector === '.rlog-resize-grip') {
            // Xài content-box mặc định thì cái viền 2px nó sẽ chòi ra ngoài. Do mục tiêu dính sát mép, nên viền hào quang góc phải dưới bị thằng overflow: hidden của panel nó chém cụt đầu! ⚔️
            boxLeft -= 0;
            boxTop -= 0;
        }

        // Ụp cái vòng hào quang vô 📍
        highlightBox.style.boxSizing = ''; // Reset về mặc định, cấm cái border-box ất ơ nào ăn ké 🛑
        highlightBox.style.top = `${boxTop}px`;
        highlightBox.style.left = `${boxLeft}px`;
        highlightBox.style.width = `${boxWidth}px`;
        highlightBox.style.height = `${boxHeight}px`;

        // Triệu hồi bong bóng (Phải đập cái display:block vô mặt nó mới đo được 3 vòng nha) 📏
        tooltip.style.display = 'block';
        tooltip.style.opacity = '1';

        // Câu giờ xíu rồi mới set tọa độ bong bóng, bao hốt trúng cái offsetHeight xịn ⏱️
        requestAnimationFrame(() => {
            const tooltipWidth = tooltip.offsetWidth;
            const tooltipHeight = tooltip.offsetHeight;
            
            let tooltipTop = 0;
            let tooltipLeft = 0;

            if (placement === 'top') {
                tooltipTop = top - tooltipHeight - padding - 8;
                tooltip.classList.add('rlog-tour-top');
            } else {
                // Chỗ đứng mặc định là dí xuống dưới đít 👇
                tooltipTop = top + height + padding + 8; // 8px là khoảng cách của cái tam giác nhú ra đó 🔺
                tooltip.classList.remove('rlog-tour-top');
            }
            
            // Dóng hàng ngay giữa tâm của con mồi 🎯
            tooltipLeft = left + (width / 2) - (tooltipWidth / 2);
            let arrowLeft = tooltipWidth / 2;
            
            // Chặn đầu hông cho lọt thỏm ra lề phải panel 🧱
            if (tooltipLeft + tooltipWidth > panelRect.width - 10) {
                tooltipLeft = panelRect.width - tooltipWidth - 10;
                arrowLeft = targetRect.left - panelRect.left - tooltipLeft + targetRect.width / 2;
            } else if (tooltipLeft < 10) {
                // Bít cửa hông cho tuột ra lề trái 🧱
                tooltipLeft = 10;
                arrowLeft = targetRect.left - panelRect.left - tooltipLeft + targetRect.width / 2;
            }

            // Khóa mõm cái tam giác hông cho nó mọc lố bong bóng (Chừa 24px cách mép, để nó khỏi chồi ra ngoài bo góc hay bồng bềnh lơ lửng) 🎈
            if (arrowLeft > tooltipWidth - 24) arrowLeft = tooltipWidth - 24;
            if (arrowLeft < 24) arrowLeft = 24;

            tooltip.style.setProperty('--arrow-left', `${arrowLeft}px`);
            tooltip.style.top = `${tooltipTop}px`;
            tooltip.style.left = `${tooltipLeft}px`;
        });
    }

    // Vạch mặt mấy cái API ra cho người ngoài xài ké 🔌
    window.__RLogTour = {
        check: checkAndStartTour,
        start: startTour,
        end: endTour
    };

})();
