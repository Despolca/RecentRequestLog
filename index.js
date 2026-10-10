/* ============================================================
   Nhật ký Request gần đây (Recent Request Log) — Module logic chính (index.js)
   ============================================================ */

/* [Chỉ mục khu vực] (Theo thứ tự từ trên xuống dưới của tệp)
   1. Load động tour.js          Load module hướng dẫn sử dụng khi plugin khởi động (giữ ở trên cùng)
   2. Tham số và hằng số         Toàn bộ giá trị/key lưu trữ/pattern đường dẫn có thể điều chỉnh, chỉnh tham số chỉ sửa ở đây
   3. Biến trạng thái            Trạng thái bộ nhớ runtime của panel/dữ liệu/tìm kiếm/theo dõi phản hồi, v.v.
   4. Hàm tiện ích               Các pure function không có side effect (Escape/tên model/token/map vai trò, v.v.)
   5. Xác thực cấu trúc body AI  Xác định xem body request có phải là request do AI generate hay không
   6. Nhận diện nguồn request    Theo dõi lượt (pass) generate chính + Phán đoán phân tầng bằng chứng (Phong bì -> E1 -> E2 -> X2-X5 -> E3 -> Fallback -> Mặc định Plugin)
                                 + Sửa chữa nâng cấp có giới hạn sau khi response định hình; Lối vào native cũ được giữ lại làm fallback mức ưu tiên thấp nhất
   7. Đánh chặn request (fetch + XHR) Bắt nội dung request ở tầng mạng (parse/process/install + bọc XHR, bao gồm cả mở rộng iframe cùng nguồn)
   8. Theo dõi và parse phản hồi Bắt phản hồi/Parse SSE/Trích xuất lỗi/Gắn trạng thái cuối cùng
   9. Quản lý dữ liệu            Thêm xóa bản ghi, fingerprint chống trùng lặp, giới hạn số lượng
   10. Cài đặt lưu trữ lâu dài   Công tắc tổng/Xem trước nội dung/Theme/Giới hạn bản ghi/Đọc ghi cài đặt ưu tiên (Preferences)
   11. Dialog chung              Cài đặt giới hạn bản ghi + Dialog xác nhận chung
   12. Tìm kiếm                  Trạng thái tìm kiếm/Khớp/Highlight/Điều hướng
   13. Lọc                       Trạng thái lọc/Khớp/Drawer và nút phân đoạn/Chỉ báo
   14. Render và Build HTML      HTML bản ghi/tin nhắn, renderPanelContent, bind event
   15. Gập mở và Nháy cuộn       Gập/mở, scroll anchoring, cuộn xuống đáy/lên đỉnh, nháy báo hiệu
   16. Xóa và copy bản ghi       Xóa dòng đơn, copy cả nhóm/tin nhắn đơn lẻ, phản hồi copy
   17. Overlay xem toàn văn      Đóng mở overlay, chuyển đổi định dạng, cuộn, nhấn Esc để đóng
   18. Thanh cuộn tùy chỉnh      Shared observer, tạo/cập nhật/kéo thanh cuộn, chỉ báo cuộn
   19. Unload & Restore nội dung Xóa nội dung ngoài viewport thành block giữ chỗ cùng chiều cao, khôi phục khi vào lại tầm nhìn (Bao gồm bảo trì dải cuộn)
   20. Điều khiển panel          Lối vào menu, buildUI, đóng mở/gập (↔floating badge)/Nút đổi theme
   21. Kéo thả và thu phóng      Kéo panel/Thu phóng góc phải dưới/Kéo floating badge
   22. Khởi tạo                  Đợi ST ready và build UI
   23. API xuất ra ngoài         window.__RLogApi là interface dành cho tour.js
   24. Chức năng test tạm thời   Chỉ còn lại các hàm debug console (Test inject / Mô phỏng timeout, sẽ xóa sau)
   25. Prompt mô phỏng (Không gửi) Lắp ráp thật + Cắt ngang trước khi gửi, tạo ra một bản ghi mô phỏng (Không gửi request mạng)
   ============================================================ */

/* ── Load động tour.js ─────────────────── */

(function loadTourScript() {
    const currentScript = document.currentScript;
    if (currentScript && currentScript.src) {
        const tourUrl = currentScript.src.replace('index.js', 'tour.js');
        const script = document.createElement('script');
        script.src = tourUrl;
        document.head.appendChild(script);
    } else {
        const script = document.createElement('script');
        script.src = '/scripts/extensions/third-party/RecentRequestLog/tour.js';
        document.head.appendChild(script);
    }
})();

/* ── Tham số có thể điều chỉnh và Hằng số ──────────────────────── */

const PLUGIN_KEY = 'RecentRequestLog';
const DEFAULT_MAX_RECORDS = 10;         /* Số bản ghi tối đa mặc định */
const MIN_MAX_RECORDS = 10;              /* Giá trị nhỏ nhất user có thể set */
const MAX_MAX_RECORDS = 100;            /* Giá trị lớn nhất user có thể set (Ngăn lạm dụng) */
const DOUBLE_CLICK_THRESHOLD = 350;     /* Ngưỡng thời gian xác định double click (ms), nhỏ hơn mức này coi là double click */
const STORAGE_THEME_KEY = `${PLUGIN_KEY}_theme`;
const STORAGE_MASTER_KEY = `${PLUGIN_KEY}_masterEnabled`;
const STORAGE_MAX_RECORDS_KEY = `${PLUGIN_KEY}_maxRecords`;  /* Lưu trữ số bản ghi tối đa */
const STORAGE_PREVIEW_KEY = `${PLUGIN_KEY}_contentPreview`;  /* Lưu trữ công tắc xem trước nội dung */
const STORAGE_PREF_MOBILE_FULL = `${PLUGIN_KEY}_prefMobileFull`;      /* Ưu tiên: Full màn hình trên Mobile (Mở panel trên điện thoại tự động full màn hình) */
const STORAGE_PREF_CLICK_OUTSIDE = `${PLUGIN_KEY}_prefClickOutside`;  /* Ưu tiên: Click ngoài panel plugin để đóng toàn bộ panel (Có tác dụng trên cả PC và Mobile) */
const STORAGE_PREF_FILTER_PERSIST = `${PLUGIN_KEY}_prefFilterPersist`; /* Ưu tiên: Lưu trạng thái lọc (Bật để giữ nguyên bộ lọc khi qua trang khác) */
const STORAGE_PREF_MINIMAL = `${PLUGIN_KEY}_prefMinimal`;            /* Ưu tiên: Chế độ tối giản (Tắt transition/animation/smooth scroll/nháy/làm mờ overlay) */
const STORAGE_PREF_BADGE_DEFAULT = `${PLUGIN_KEY}_prefBadgeDefault`; /* Ưu tiên: Lối vào floating badge mặc định (Khởi động mặc định hiện badge, vị trí góc phải trên) */
const STORAGE_PREF_FOLLOW_ST_THEME = `${PLUGIN_KEY}_prefFollowStTheme`; /* Ưu tiên: Chế độ Sáng/Tối theo theme ST (Panel chính tự động đổi Sáng/Tối theo theme của ST) */
const STORAGE_FILTER_STATE_KEY = `${PLUGIN_KEY}_filterState`;        /* Object trạng thái lọc được lưu (Chỉ đọc ghi khi bật "Lưu trạng thái lọc") */
const NATIVE_INTENT_WINDOW_MS = 5000;
const BADGE_SIZE = 34;               /* Cạnh floating badge (px): Desktop 34x34 */
const BADGE_SIZE_MOBILE = 30;        /* Cạnh floating badge (px): Mobile (<=768px) 30x30; getBadgeSize() sẽ trả về tùy theo breakpoint */
const BADGE_DRAG_THRESHOLD = 5;      /* Ngưỡng kéo floating badge (px): Di chuyển vượt quá mức này coi là đang kéo, nếu không thì coi là click khôi phục panel */
const BADGE_DEFAULT_MARGIN_RIGHT = 16; /* Khoảng cách từ vị trí mặc định của badge đến viền phải viewport (px): Dùng khi bật "Lối vào floating badge mặc định" */
const BADGE_DEFAULT_MARGIN_TOP = 12;  /* Khoảng cách từ vị trí mặc định của badge đến mép dưới thanh setting trên cùng của ST (px) */
const LONG_PRESS_MS = 550;            /* Ngưỡng xác định nhấn giữ (ms): Nhấn lâu hơn mức này và không di chuyển quá mức dung sai thì coi là nhấn giữ */
const LONG_PRESS_MOVE_TOLERANCE = 8;  /* Dung sai di chuyển khi nhấn giữ (px): Nhấn xong mà di chuyển quá mức này thì hủy bỏ nhấn giữ */
const PIN_TOAST_DURATION_MS = 1800;   /* Thời gian tự động biến mất của toast thông báo Ghim/Bỏ ghim (ms) */
const SIMULATE_TIMEOUT_MS = 15000;    /* Timeout fallback toàn trình khi tạo bản ghi mô phỏng (ms): Đến giờ thì dừng chuỗi lắp ráp, bỏ kết quả và báo lỗi */
const ST_THEME_DARK_LUMINANCE = 0.5;  /* Độ sáng cảm nhận tương đối của màu nền theme ST, thấp hơn mức này coi là theme Tối (Floating badge sẽ đổi sang bộ màu sáng) */

/* ── Hằng số liên quan đến Nhận diện nguồn request (Phán đoán phân tầng bằng chứng, RQ-32) ── */
const SOURCE_PLUGIN_DEFAULT_DETAIL = 'Plugin/Request phi Native'; /* Text chú thích khi phán đoán là "Plugin" (Dùng lại text có sẵn, không đổi domain) */
const ST_CHAT_COMPLETION_ENDPOINT = '/api/backends/chat-completions/generate'; /* Endpoint chat completion của ST dùng cho X3 "So sánh địa chỉ request" */
const PASS_MAX_AGE_MS = 5 * 60 * 1000;        /* Thời gian sống tối đa của lượt generate chính (ms): Fallback dọn dẹp các lượt bị treo do "Mất event kết thúc" */
const SOURCE_CORRECTION_WINDOW_MS = 5000;     /* Khung thời gian trigger sửa chữa (ms): Khoảng cách giữa lúc chốt response và event tin nhắn ST vượt quá mức này thì không sửa nữa */
const SOURCE_CORRECTION_RETRY_MS = 400;       /* Lần thử lại sau khoảng trễ ngắn (ms): Event tin nhắn đến trước, response chưa đọc xong thì bù thêm một lần */
const SOURCE_CORRECTION_PENDING_TTL_MS = 15000; /* Thời gian giữ bản ghi chờ sửa (ms): Quá giờ không thử sửa nữa */
const SOURCE_CORRECTION_PENDING_GRACE_MS = 1000; /* Thời gian ân hạn bản ghi chờ sửa (ms): Bản ghi vừa ghi nhận chưa vào list thì không bị dọn theo quan hệ thành viên */
const SOURCE_CORRECTION_MIN_OVERLAP = 24;     /* Độ dài trùng khớp tối thiểu để sửa (ký tự): Ngắn hơn mức này thì bắt buộc phải giống nhau hoàn toàn */

/* ── Che giấu trường nhạy cảm trong body request gốc ── */
const SENSITIVE_BODY_FIELDS = ['proxy_password'];
const SENSITIVE_BODY_MASK = '***';

/* Vỏ cứng FA bên trong shadow root: Chỉ chứa 33 icon solid mà plugin thực sự sử dụng (content lấy từ fontawesome.min.css 6.5.2 hiện tại của ST, không phải đoán)
   Khi thêm icon mới, chỉ cần bổ sung một dòng "tên_icon: '\\fXXX'" vào đây là được */
const FA_SOLID_CONTENT = {
    'arrow-down': '\\f063',
    'arrow-up': '\\f062',
    'check': '\\f00c',
    'chevron-down': '\\f078',
    'chevron-right': '\\f054',
    'chevron-up': '\\f077',
    'comment-dots': '\\f4ad',
    'compress-alt': '\\f422',
    'copy': '\\f0c5',
    'ellipsis': '\\f141',
    'eye': '\\f06e',
    'eye-slash': '\\f070',
    'expand': '\\f065',
    'file-lines': '\\f15c',
    'filter': '\\f0b0',
    'gear': '\\f013',
    'heart': '\\f004',
    'heart-circle-check': '\\e4fd',
    'list': '\\f03a',
    'magnifying-glass': '\\f002',
    'moon': '\\f186',
    'paper-plane': '\\f1d8',
    'power-off': '\\f011',
    'puzzle-piece': '\\f12e',
    'question': '\\3f',
    'rotate-left': '\\f2ea',
    'sun': '\\f185',
    'trash-can': '\\f2ed',
    'user': '\\f007',
    'vial': '\\f492',
    'xmark': '\\f00d',
    'caret-down': '\\f0d7',
    'clock-rotate-left': '\\f1da',
};

/* number: Giới hạn bản ghi tối đa đang có hiệu lực, load từ localStorage hoặc dùng mặc định */
let MAX_RECORDS = DEFAULT_MAX_RECORDS;
const AI_GENERATION_PATH_PATTERNS = [
    '/generate',
    '/completions',
    '/chat/completions',
    '/messages',
    'generatecontent',
    'streamgeneratecontent',
];
const ST_NON_GENERATION_PATH_PATTERNS = [
    '/api/chats',
    '/api/characters',
    '/api/settings',
    '/api/backgrounds',
    '/api/assets',
    '/api/extensions',
    '/api/plugins',
    '/api/secrets',
    '/api/sprites',
    '/api/tags',
    '/api/users',
    '/api/content',
    '/api/files',
    '/api/worldinfo',
    '/api/personas',
    '/api/groups',
];
const AI_GENERATION_BODY_KEYS = new Set([
    'model', 'temperature', 'max_tokens', 'max_new_tokens', 'max_length',
    'max_context_length', 'n_predict', 'stream', 'stop', 'stopping_strings',
    'top_p', 'top_k', 'top_a', 'min_p', 'typical_p', 'tfs', 'mirostat',
    'presence_penalty', 'frequency_penalty', 'repetition_penalty',
    'sampler_order', 'samplers', 'chat_completion_source', 'api_server',
    'generationConfig', 'safetySettings', 'tools', 'tool_choice',
    'logit_bias', 'seed',
]);

/* RegExp: Lọc sơ bộ "Hình dáng URL" của request dạng phong bì (Envelope) —— http(s):// + Từ khóa đường dẫn generate (Không phân biệt hoa thường).
   Từ khóa dùng lại từ AI_GENERATION_PATH_PATTERNS; Class ký tự loại trừ ngoặc kép/khoảng trắng/backslash, đảm bảo match được
   một chuỗi URL hoàn chỉnh chứ không phải đoạn text vắt ngang qua nhiều trường. */
const ENVELOPE_URL_SHAPE_RE = new RegExp(
    'https?://[^\\s"\'`\\\\]*(?:'
        + AI_GENERATION_PATH_PATTERNS.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
        + ')',
    'i'
);

/* object: Nguồn bị ép buộc sử dụng sau khi unbox phong bì thành công (Theo thiết kế, phán đoán này là chốt hạ: Không tham gia phán đoán phân tầng,
   cũng không tham gia "Sửa chữa khi response định hình") */
const ENVELOPE_PROXY_SOURCE = { type: 'plugin', label: 'Plugin', detail: 'Request proxy qua plugin', rule: 'envelope' };

/* RegExp: Endpoint generate xịn của nhà ST (/api/backends/<api>/generate). Trong lúc preview mô phỏng, dùng nó để chặn đứng request,
   đảm bảo "Chỉ lắp ráp, tuyệt đối không gửi mạng" */
const GENERATE_ENDPOINT_RE = /\/api\/backends\/[^/?#]+\/generate\b/i;

/* number: Timeout theo dõi phản hồi (5 phút): Quá giờ chưa xong thì dừng theo dõi và đánh dấu Timeout */
const REPLY_TIMEOUT_MS = 5 * 60 * 1000;

/* number: Thời gian giữ tối đa sau khi phản hồi đạt trạng thái cuối mà bản ghi chưa được tạo (Chờ addRecord mount vào) */
const PENDING_REPLY_KEEP_MS = 60 * 1000;
/* number: Số lượng tối đa mục trong khu vực chờ phản hồi (Tránh quá nhiều request song song làm phình bộ nhớ) */
const MAX_PENDING_REPLIES = 100;

/* number: Độ trễ debounce cho ô nhập tìm kiếm (ms), dừng nhập lâu quá mới thực hiện tìm kiếm */
const SEARCH_DEBOUNCE_MS = 120;

/* Giới hạn đọc body của response lỗi phi 2xx (Byte): Vượt quá thì dừng đọc, tránh lãng phí vào trang lỗi lớn */
const MAX_ERROR_BODY_BYTES = 8192;

/* Hẹn giờ fallback nháy cuộn đáy (ms): Chờ dự phòng khi cuộn mượt xong mà event scrollend không trigger */
const SCROLLEND_FALLBACK_MS = 2000;
/* Trễ tạo thanh cuộn lười (ms): Sau khi khu vực nội dung xuất hiện mới delay tạo thanh tiến trình, tránh reflow đồng bộ */
const SCROLLBAR_CREATE_DELAY_MS = 50;
/* number: Hàng đợi tạo thanh tiến trình mỗi frame xử lý tối đa mấy khu vực nội dung. Khi cuộn, cùng một frame sẽ có nhiều tin nhắn dài lọt vào viewport,
   tạo hết một lần (Mỗi cái chứa 4 DOM nhỏ và vài listener) sẽ gây tụt frame; Chia nhỏ ra các frame liên tiếp, điều kiện và hiệu ứng tạo không đổi */
const SCROLLBAR_CREATE_PER_FRAME = 4;
/* number: Độ thụt vào trên dưới của track so với hitbox (px), dùng chung để quy đổi chiều cao track và tọa độ kéo;
   Bắt buộc phải khớp với top/bottom của .rlog-scroll-track trong CSS */
const SCROLLBAR_TRACK_PADDING = 4;
/* number: Băng thông (màn hình) giữ lại cho "Unload & Restore nội dung": Giữ lại chừng này màn hình nội dung ở trên và dưới khu vực hiển thị danh sách để không bị unload.
   Nội dung bị unload sẽ đổi thành block giữ chỗ cùng chiều cao trên chính element đó, khi đóng/mở panel sẽ không phải trả phí tính toán layout và vẽ cho nội dung ngoài viewport. */
const BODY_KEEP_SCREENS = 1;
/* Trễ sắp xếp lại nút menu (ms): Đảm bảo xếp cuối cùng sau khi tất cả các plugin khởi tạo đồng bộ xong */
const MENU_REORDER_DELAY_MS = 100;
/* Trễ thử lại khởi tạo (ms): Khoảng thời gian giữa các lần thử lại khi object global ST chưa ready */
const INIT_RETRY_ST_MS = 200;
/* Trễ thử lại khởi tạo (ms): Khoảng thời gian giữa các lần thử lại khi context ST chưa ready */
const INIT_RETRY_CTX_MS = 300;
/* Chờ fallback APP_READY (ms): Event có thể đã trigger rồi, fallback trigger build UI */
const APP_READY_FALLBACK_MS = 500;
/* Biên trên của khoảng Token (Giảm dần, đơn vị token): getTokenTier sẽ trả về cấp độ 1-7 dựa trên điều kiện >= biên */
const TOKEN_TIER_BOUNDARIES = [200000, 128000, 64000, 32000, 16000, 8000, 4000];

/* ── Biến trạng thái ─────────────────────────── */

/* object|null: eventSource của ST */
let eventSource = null;
/* object|null: event_types của ST */
let event_types = null;

/* boolean: Đang trong quá trình preview mô phỏng —— Các request generate trong khung thời gian này đều không gửi qua mạng (Request mục tiêu sẽ được tạo hồ sơ trước rồi bị chặn, xem simulateCaptureCtx);
   Chỉ được gán true trong một khoảng thời gian ngắn tại captureSimulatedPrompt, khối finally chắc chắn sẽ reset */
let simulatePromptActive = false;

/* boolean: Đang chạy quy trình tạo bản ghi mô phỏng (Gồm lắp ráp, khôi phục, tính toán local) —— Trong thời gian này các nút sẽ bị mờ, không cho trigger trùng lặp */
let simulatePromptRunning = false;

/* object|null: Context bắt dữ liệu của lần mô phỏng này (Cấu trúc xem createSimulateCaptureCtx), chỉ tồn tại trong một lần mô phỏng.
   Đi theo request mục tiêu xuyên suốt pipeline ghi nhận, cung cấp cho giai đoạn tạo hồ sơ bất đồng bộ để xác định quyền sở hữu; Không dựa vào việc đọc cờ global (Vì lúc đó có thể đã bị reset rồi) */
let simulateCaptureCtx = null;

/* Array: Danh sách các bản ghi bắt được */
let records = [];

/* boolean: Hướng dẫn sử dụng có đang chạy hay không (Khi đang chạy thì bản ghi mới chỉ lưu tạm chứ không hiển thị, tránh làm loạn định vị DOM của hướng dẫn) */
let tourActive = false;

/* Array: Bản ghi mới lưu tạm trong lúc hướng dẫn (Sau khi hướng dẫn kết thúc sẽ do endTour gộp vào khôi phục, đảm bảo không mất) */
let tourPendingRecords = [];

/* HTMLElement|null: Element DOM của panel */
let panelEl = null;

/* ShadowRoot|null: Shadow root của panel plugin (Chứa panel và style bên trong, cách ly với CSS theme bên thứ 3) */
let panelShadowRoot = null;

/* HTMLElement|null: Element host chứa shadow (Gắn vào body, làm giá đỡ cho shadow root) */
let shadowHostEl = null;

/* HTMLElement|null: Host light DOM của floating badge (Lối vào plugin thu nhỏ sau khi đóng panel).
   Host độc lập gắn vào document.body, cung cấp cho bên thứ 3 nhận diện/chứa chấp plugin;
   Phần nhìn thấy nằm trong shadow root riêng của nó (.rlog-badge-visual). */
let badgeEl = null;

/* HTMLElement|null: Element hình ảnh của floating badge (Gắn trong shadow root riêng của badgeEl,
   document không tìm thấy được, chỉ dùng cho mục đích hỗ trợ test như __RLogApi.getBadgeVisualEl()) */
let badgeVisualEl = null;

/* string|null: Cache kết quả serialize chuỗi rule của style.css (Hai shadow root của panel và badge mỗi cái cần một node <style>,
   text rule chỉ serialize một lần) */
let selfCssTextCache = null;

/* {left,top}|null: Vị trí trong phiên của floating badge (Tọa độ góc trái trên).
   Lần đầu thu gọn sẽ ghi lại tọa độ click, sau khi kéo sẽ cập nhật, lần thu gọn sau dùng lại; Refresh là xóa. */
let badgePos = null;

/* boolean: Có chặn cú click native do trình duyệt phát ra sau khi "Click floating badge để khôi phục panel" không (Cờ dùng một lần).
   Khi badge ẩn đi và panel xuất hiện tại cùng tọa độ, cú click đó sẽ hit-test trúng nút trên thanh tiêu đề panel, có thể vô tình mở drawer. */
let badgeSuppressNextClick = false;

/* boolean: ST hiện tại có đang dùng theme Tối hay không (Màu badge lấy ngược lại: ST Tối → badge Sáng), do syncBadgeTheme() quản lý */
let stThemeIsDark = false;

/* MutationObserver|null: Lắng nghe thay đổi thuộc tính style của <html> để nhận biết ST đổi theme (Xem initBadgeThemeSync) */
let badgeThemeObserver = null;

/* HTMLElement|null: Nút bấm trong menu extension */
let toggleBtn = null;

/* boolean: Panel có đang hiển thị hay không */
let isPanelVisible = false;

/* @type {boolean} Nội dung panel có cần build lại hay không (Gán true khi dữ liệu/setting render thay đổi, clear về false sau khi render xong).
   Khi ẩn panel vẫn giữ nguyên DOM, tránh việc mỗi lần mở phải build lại toàn bộ gây giật lag. */
let panelContentDirty = true;

/* boolean: Có phải chế độ Sáng hay không */
let isLightTheme = false;

/* boolean: Cửa sổ panel có đang bị gập hay không */
let isPanelCollapsed = false;

/* boolean: Trong lúc ẩn/gập panel có bản ghi mới đến hay không, lúc mở lại cần cuộn lên đầu danh sách */
let pendingScrollToTop = false;

/* boolean: Công tắc tổng của plugin có đang bật hay không (Lưu vào localStorage, cài đặt lần đầu mặc định bật) */
let masterEnabled = true;

/* HTMLElement|null: Element DOM dialog cài đặt số bản ghi tối đa */
let maxRecordsDialog = null;

/* HTMLElement|null: Element toast thông báo nhẹ Ghim/Bỏ ghim (Giữa phần trên cùng của panel) */
let pinToastEl = null;

/* timeout|null: Hẹn giờ tự động tắt của toast thông báo Ghim/Bỏ ghim */
let pinToastTimer = null;

/* boolean: Sau khi kích hoạt nhấn giữ ghim sẽ gán bằng true, dùng để chặn cú click ngay sau đó vào thanh tiêu đề (Tránh gập/mở nhầm) */
let suppressRecordHeaderClick = false;

/* boolean: Trong lúc nhấn giữ xếp lại trên Mobile đã bind sự kiện dọn dẹp chặn hover chưa (Tránh bind trùng/chồng chất) */
let hoverSuppressBound = false;

/* Liên quan đến kéo/thu phóng panel */
let panelResizing = false;
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartW = 0;
let resizeStartH = 0;

/* Function|null: Tham chiếu đến window.fetch gốc */
let originalFetch = null;

/* Function|null: Hàm bọc fetch đang được cài đặt hiện tại */
let currentHook = null;

/* WeakMap<Window, Function>: Cửa sổ đã cài đặt hàm bọc fetch → Hàm bọc (Cửa sổ chính + iframe cùng nguồn)
   Công dụng: ① Ngăn chặn cùng một cửa sổ bọc nhiều lần làm hỏng chuỗi bọc fetch gốc;
        ② Cắt đứt xem có cần bọc lại hay không sau khi lớp bọc bị script bên trong iframe thay thế. */
const hookedFetchHooks = new WeakMap();

/* WeakSet<HTMLIFrameElement>: Các element iframe đã được gắn listener "Cài lại sau khi reload" (Chống gắn listener trùng lặp) */
const iframeLoadListenersAttached = new WeakSet();

/* WeakMap<XMLHttpRequest, {method, url, async}>: Tham số open của instance XHR (Đọc khi send; Open nhiều lần thì ghi đè) */
const xhrOpenMeta = new WeakMap();

/* WeakMap<Window, {open, send}>: Cửa sổ đã cài đặt hàm bọc XHR (Cửa sổ chính + iframe cùng nguồn) → Phương thức prototype lúc cài đặt.
   Công dụng giống hookedFetchHooks: Chống bọc nhiều lần trên cùng một realm; Bọc lại sau khi iframe reload hoặc script bên trong thay thế prototype. */
const hookedXhrProtos = new WeakMap();

/* boolean: Lớp bọc request iframe (fetch + XHR, quét lúc đầu + MutationObserver lắng nghe động) đã cài đặt chưa */
let iframeHooksInstalled = false;

/* object: Kết quả của lần thử unbox phong bì gần nhất (Dành cho __rlogDebug truy vấn; Chỉ ghi lý do và thứ tự ứng viên, không ghi địa chỉ thật) */
let lastEnvelopeResult = { hit: false, reason: 'none', urlCandidateIndex: null, bodyCandidateIndex: null };

/* number: Số ID bắt request tăng dần, dùng để gắn phản hồi chính xác vào bản ghi tương ứng */
let captureSeq = 0;

/* Khu vực chờ phản hồi chưa được gắn vào bản ghi (key: captureId): { startTime, timer, expireTimer, status,
   content, reasoning, failReason, time, reader, finished }, sẽ được consumePendingReply tiêu thụ sau khi bản ghi được tạo. */
const pendingReplies = new Map();

/* string|null: Fingerprint của tin nhắn trong bản ghi trước đó, dùng để lọc trùng lặp */
let lastRecordFingerprint = null;

/* number: Timestamp của bản ghi trước đó */
let lastRecordTime = 0;

/* { timestamp: number, target: string, source: 'click'|'pointerdown'|'keydown' : |null} Lối vào generate native gần nhất của ST */
let lastNativeIntent = null;

/* boolean: Đã cài đặt listener lối vào native chưa */
let sourceTrackingInstalled = false;

/* object|null: Trạng thái của lượt (pass) generate chính hiện tại (Điểm neo để nhận diện chiều xuôi RQ-32)
   { id, active, type, startTime, depth, dataTime, bodyRef, chatBodyRef, promptArray, e2Claimed, candidateCount, positionForfeited }
   - bodyRef     API chính phi chat completion: Object payload dữ liệu công khai (Chính là object body request)
   - chatBodyRef API chính chat completion: Payload của event "Body request sắp được gửi" (Chính là object body request)
   - promptArray API chính chat completion: Mảng prompt trong payload dữ liệu công khai (Dùng cho yêu cầu bổ sung cùng nguồn E2)
   Lượt (pass) được mở bởi "Bắt đầu generate (Không yên lặng, không chỉ lắp ráp)" và đóng bởi "Kết thúc generate / Generate bị ngừng";
   Thông báo lồng nhau của chat nhóm sẽ được xử lý theo kiểu "Dữ liệu công khai gần nhất thuộc về lượt hiện tại" (Xem openOrResetGenerationPass). */
let generationPass = null;

/* number: Số ID của lượt (pass) (Tự tăng; Khi bằng chứng vị trí E3 bị hủy bỏ thì dùng ID này để tìm lại bản ghi của lượt này đã bị phán là native bằng bằng chứng vị trí) */
let generationPassSeq = 0;

/* number|null: Số ID lượt (pass) của lần "Bằng chứng vị trí bị hủy bỏ" gần nhất (Object lượt có thể đã đóng, nên giữ lại một bản copy riêng:
   Trong một lượt có 2 bước "Phán đoán" và "Tạo bản ghi" của hai request là bất đồng bộ, request thứ 2 có thể hủy bỏ bằng chứng trước khi request thứ 1 kịp tạo bản ghi) */
let lastForfeitedPositionPassId = null;

/* boolean: Đã cài đặt theo dõi lượt (pass) generate chính chưa */
let generationPassTrackingInstalled = false;

/* object|null: Text ứng viên tầng lầu của event tin nhắn ST gần nhất (Tin nhắn đến / Tin nhắn nhân vật đã render / Chuyển trang thành công)
   { mesId, texts: string[], at }; Dùng cho "Sửa chữa nguồn sau khi response định hình". */
let lastFloorEvent = null;

/* Map<record, {at}>: Bản ghi plugin "Response đã chốt, chờ sửa chữa định hình" (Cần duyệt qua, nên không dùng WeakMap) */
const pendingSourceCorrections = new Map();

/* number|timeout|null: Hẹn giờ thử lại sửa chữa trễ ngắn */
let sourceCorrectionTimer = null;

/* object: Thống kê sửa chữa (Dành cho __rlogDebug.getSourceCorrectionStats truy vấn) */
let sourceCorrectionStats = { count: 0, lastReason: '', lastTime: '' };

/* boolean: Đã cài đặt theo dõi sửa chữa nguồn chưa (Lắng nghe event tin nhắn ST) */
let sourceCorrectionTrackingInstalled = false;

/* object|null: Kết quả phán đoán nguồn gần nhất (Tên rule / Chú thích hover / Lý do; Dành cho __rlogDebug truy vấn) */
let lastSourceDecision = null;

/* string: Lý do loại trừ của lần phán đoán "Plugin" gần nhất (Dành cho __rlogDebug.getLastExclusion truy vấn) */
let lastExclusionReason = '';

/* boolean: UI đã build xong chưa (Chống build lặp lại do race condition của init()) */
let uiBuilt = false;

/* boolean: Công tắc xem trước nội dung, mặc định tắt (Lưu vào localStorage) */
let contentPreviewEnabled = false;

/* boolean|null: Ép ghi đè công tắc xem trước nội dung (Dùng để demo trong chương trình hướng dẫn) */
let forcePreviewState = null;

/* @type {object} Trạng thái cài đặt ưu tiên (6 mục, mặc định tắt hết; Lưu vào localStorage) */
let preferences = {
    badgeDefault: false,   /* boolean: Lối vào floating badge mặc định (Bật thì khởi động mặc định hiện badge, vị trí góc phải trên; Khi đóng panel/thu nhỏ badge sẽ quay về badgePos) */
    followStTheme: false,  /* boolean: Chế độ Sáng/Tối tuân theo theme của ST (Bật thì Sáng/Tối của panel chính tự động tuân theo theme ST, nút Sáng/Tối thủ công vô tác dụng; Không liên quan gì đến màu của badge) */
    mobileFull: false,     /* boolean: Full màn hình trên Mobile (Mở panel trên điện thoại tự động full màn hình) */
    clickOutside: false,   /* boolean: Click ngoài panel plugin để đóng toàn bộ panel (Chung cho 2 nền tảng, dĩ nhiên lúc full màn hình thì không có tác dụng) */
    filterPersist: false,  /* boolean: Lưu trạng thái lọc (Bật để giữ nguyên trạng thái lọc khi qua trang khác; Tắt thì không đụng vào bộ lọc hiện tại) */
    minimal: false,        /* boolean: Chế độ tối giản (Bật để bỏ transition/animation/smooth scroll/nháy/làm mờ overlay, chỉ giữ lại feedback trạng thái và animation hướng dẫn) */
};

/* HTMLElement|null: Element DOM của overlay cài đặt ưu tiên (Mask + Panel) */
let prefOverlayEl = null;

/* HTMLElement|null: Nút bấm mở drawer "Thêm" của cài đặt ưu tiên (Dùng để chuyển trạng thái icon hình trái tim) */
let prefBtnEl = null;

/* MutationObserver|null: Lắng nghe thay đổi thuộc tính style của <html>, nhận biết ST đổi theme để đồng bộ theme của panel
   (Chỉ gắn khi bật "Chế độ Sáng/Tối tuân theo theme của ST"; Badge có observer cùng tên độc lập riêng, 2 cái không xài chung, không ảnh hưởng nhau) */
let panelThemeObserver = null;

/* @type {object|null} Trạng thái tìm kiếm hiện tại (Cùng lúc chỉ một bản ghi được tìm kiếm)
   { recordIndex, keyword, matches: [{msgIdx, start, end}], currentIdx, searchEl } */
let searchState = null;

/* number|null: ID của hẹn giờ debounce nhập tìm kiếm */
let searchDebounceTimer = null;

/* Trạng thái lọc (Trạng thái bộ nhớ theo phiên, F5 là reset): { source, role, model } 3 nhóm boolean, mặc định bật hết = không lọc,
   Bất kỳ mục nào false nghĩa là ẩn phân loại đó; Nguồn/Model kiểm soát toàn bộ bản ghi, Vai trò kiểm soát tin nhắn con bên trong bản ghi. */
let filterState = {
    source: { native: true, plugin: true },
    role: { system: true, user: true, assistant: true, other: true },
    model: { gemini: true, claude: true, deepseek: true, other: true },
};

/* HTMLElement|null: Thanh tiêu đề chờ nháy báo hiệu sau khi nhảy xuống đáy (Trigger sau khi cuộn mượt đến nơi) */
let pendingFlashHeader = null;
/* number|null: Hẹn giờ fallback nháy cuộn đáy (Dự phòng khi scrollend không trigger) */
let pendingFlashTimer = null;
/* HTMLElement|null: Element bản ghi trigger việc cuộn lên đỉnh khi thu gọn (Chỉ nháy khi mở lại đúng bản ghi đó) */
let recordCollapseToppedEl = null;

/* HTMLElement|null: Element DOM của overlay "Xem toàn văn" hiện tại */
let readFullOverlayEl = null;

/* number|null: Index bản ghi tương ứng với overlay đang mở */
let readFullRecordIndex = null;

/* string: Định dạng hiển thị hiện tại: 'formatted' (Đã sắp xếp) hoặc 'raw' (JSON gốc) */
let readFullFormat = 'formatted';

/* ── Hàm tiện ích ─────────────────────────── */

/* Đọc context ST an toàn: Nếu chưa ready hoặc có lỗi bên trong thì cứ trả về null (X3 của nhận diện nguồn và theo dõi lượt đều xài nó)
   @returns {object|null} */
function getStContextSafe() {
    try {
        return (window.SillyTavern && typeof window.SillyTavern.getContext === 'function')
            ? window.SillyTavern.getContext()
            : null;
    } catch (e) {
        return null;
    }
}

/* Format timestamp (Format giống hệt trong addRecord: YYYY-MM-DD HH:mm:ss)
   @param {Date|number} value @returns {string} */
function formatTimestamp(value) {
    const d = (value instanceof Date) ? value : new Date(value);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} `
        + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

/* Trích xuất định danh "Gia tộc" từ tên model (Cùng gia tộc dùng chung tokenizer), rule khớp theo getTokenizerModel() của tokenizers.js trong ST.
   @param {string} modelName @returns {string} Định danh gia tộc, nếu không nhận ra thì trả về tên gốc in thường */
function extractModelFamily(modelName) {
    if (!modelName || modelName === '未知模型') return '';
    const m = modelName.toLowerCase();

    /* Gia tộc GPT: gpt, o1, o3, o4, davinci, turbo */
    if (m.includes('gpt') || m.includes('o1-') || m.includes('o3-') || m.includes('o4-') || m.includes('davinci')) return 'gpt';

    /* Gia tộc Claude */
    if (m.includes('claude')) return 'claude';

    /* Gia tộc Gemini/Gemma (Mọi model của Google dùng tokenizer Gemma) */
    if (m.includes('gemini') || m.includes('gemma') || m.includes('palm')) return 'gemini';

    /* Gia tộc Llama: llama, mistral, mixtral, qwen, deepseek, yi, command-r, command-a, nemo, pixtral, jamba */
    if (m.includes('llama') || m.includes('mistral') || m.includes('mixtral') || m.includes('qwen') || m.includes('deepseek') || m.includes('command-r') || m.includes('command-a') || m.includes('yi-') || m.includes('nemo') || m.includes('pixtral') || m.includes('jamba')) return 'llama';

    /* Gia tộc NovelAI */
    if (m.includes('kayra') || m.includes('clio') || m.includes('erato')) return 'novelai';

    /* Không nhận diện được, trả về tên gốc để làm định danh gia tộc (Match chính xác cũng được) */
    return m;
}

/* 2 tên model có cùng gia tộc không (Dựa theo extractModelFamily, xài chung tokenizer)
   @param {string} modelA @param {string} modelB @returns {boolean} */
function isSameModelFamily(modelA, modelB) {
    if (!modelA || modelA === '未知模型' || !modelB) return true; /* Nếu không rõ thì mặc định cho là tương thích */
    return extractModelFamily(modelA) === extractModelFamily(modelB);
}

/* Dùng tokenizer native của ST để tính Token bất đồng bộ rồi ghi lại vào messages[i].tokens (Nếu không khả dụng thì hạ cấp xuống ước tính byte)
   @param {Array} messages @param {string} modelName Dùng để check tính tương thích của tokenizer */
async function computeTokensForMessages(messages, modelName) {
    const ctx = window.SillyTavern && typeof window.SillyTavern.getContext === 'function'
        ? window.SillyTavern.getContext()
        : null;
    const getTokenCountAsync = ctx && ctx.getTokenCountAsync;

    if (!getTokenCountAsync) {
        /* Fallback: Khi context ST không dùng được, xài cách tính byte giống ST (BYTES_PER_TOKEN = 3.35) */
        const textEncoder = new TextEncoder();
        for (const msg of messages) {
            const byteLength = textEncoder.encode(msg.content).length;
            msg.tokens = Math.ceil(byteLength / 3.35);
            msg.tokenPrecise = false; /* Đánh dấu là giá trị không chính xác, UI sẽ thêm tiền tố ~ */
        }
        return;
    }

    let stModelName = '';
    try {
        if (ctx && typeof ctx.getChatCompletionModel === 'function') {
            stModelName = ctx.getChatCompletionModel();
        }
    } catch (e) { /* ignore */ }

    /* So sánh gia tộc model: Cùng gia tộc dùng chung tokenizer, không cần hiện ~ */
    const tokenizerCompatible = isSameModelFamily(modelName, stModelName);

    /* Chạy từng tin nhắn qua tokenizer native của ST để lấy con số chuẩn xác (ST có cache bên trong) */
    for (const msg of messages) {
        try {
            msg.tokens = await getTokenCountAsync(msg.content, 0);
            msg.tokenPrecise = tokenizerCompatible; /* Chỉ coi là chuẩn xác khi tên model khớp */
        } catch (e) {
            /* Lỗi tokenizer thì hạ cấp xuống ước tính byte */
            const byteLength = new TextEncoder().encode(msg.content).length;
            msg.tokens = Math.ceil(byteLength / 3.35);
            msg.tokenPrecise = false;
        }
    }
}

/* Trích xuất tên model từ body request (Mỗi API xài một tên field khác nhau)
   @param {object} body @returns {string} Trích không được thì trả về 未知模型 */
function extractModelName(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return '未知模型';

    /* Field model tầng ngoài cùng (OpenAI và hầu hết định dạng tương thích) */
    if (typeof body.model === 'string' && body.model) return body.model;

    /* Format của Gemini: generationConfig.model */
    if (body.generationConfig && typeof body.generationConfig.model === 'string' && body.generationConfig.model) {
        return body.generationConfig.model;
    }

    /* Các field phổ biến khác */
    const modelKeys = ['model_name', 'modelName', 'name', 'engine'];
    for (const key of modelKeys) {
        if (typeof body[key] === 'string' && body[key]) return body[key];
    }

    return '未知模型';
}

function getFullPromptText(record) {
    return record.messages
        .map((m) => `[${m.role}]\n${m.content}`)
        .join('\n\n');
}

function getTotalTokens(messages) {
    return messages.reduce((sum, m) => sum + m.tokens, 0);
}

/* Trả về cấp độ khoảng (0-7) dựa vào tổng số token
   @param {number} tokens Tổng số token
   @returns {number} Cấp độ khoảng 0-7 */
function getTokenTier(tokens) {
    for (let i = 0; i < TOKEN_TIER_BOUNDARIES.length; i++) {
        if (tokens >= TOKEN_TIER_BOUNDARIES[i]) return TOKEN_TIER_BOUNDARIES.length - i;
    }
    return 0;
}

function getRoleClass(role) {
    const map = {
        'system': 'role-system',
        'user': 'role-user',
        'assistant': 'role-assistant',
        'tool': 'role-tool',
        'response': 'role-response',
    };
    return map[role] || 'role-other';
}

function getRoleLabel(role) {
    const map = {
        'system': 'System',
        'user': 'User',
        'assistant': 'Assistant',
        'tool': 'Tool',
        'response': 'Response',
    };
    return map[role] || role;
}

/* Lấy chữ preview đầu tin nhắn: Giữ nguyên text gốc, chuyển xuống dòng thành dấu cách, cắt bớt 200 ký tự phía JS (CSS lo phần dấu ba chấm trực quan)
   @param {string} content @returns {string} */
function getContentPreview(content) {
    if (!content || typeof content !== 'string') return '';
    const collapsed = content.replace(/\n/g, ' ').trim();
    if (!collapsed) return '';
    /* Lấy 200 ký tự làm giới hạn trên an toàn, CSS lo việc làm ẩn bớt chữ trực quan */
    return collapsed.length > 200 ? collapsed.slice(0, 200) + '…' : collapsed;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/* Parse kênh RGB của chuỗi màu: Chỉ hỗ trợ cách viết mà ST dùng cho màu theme (#rgb / #rrggbb / rgb() / rgba());
   Alpha không tham gia parse——Độ sáng/tối của theme chỉ nhìn vào hướng của màu.
   @param {string} color @returns {{r,g,b}|null} */
function parseCssColorChannels(color) {
    if (!color) return null;
    const text = String(color).trim();
    const fn = text.match(/^rgba?\(([^)]+)\)$/i);
    if (fn) {
        const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
        if (parts.length < 3) return null;
        const rgb = parts.slice(0, 3).map(part => parseFloat(part));
        if (rgb.some(num => Number.isNaN(num))) return null;
        return { r: rgb[0], g: rgb[1], b: rgb[2] };
    }
    const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
        const body = hex[1].length === 3
            ? hex[1].split('').map(c => c + c).join('')
            : hex[1];
        return {
            r: parseInt(body.slice(0, 2), 16),
            g: parseInt(body.slice(2, 4), 16),
            b: parseInt(body.slice(4, 6), 16),
        };
    }
    return null;
}

/* Độ sáng cảm nhận tương đối theo WCAG (Có trọng số sau khi tuyến tính hóa sRGB), dùng để nhận biết nền theme sáng hay tối
   @param {number} r @param {number} g @param {number} b @returns {number} */
function relativeLuminance(r, g, b) {
    const toLinear = (value) => {
        const s = Math.min(Math.max(value, 0), 255) / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/* ── Xác thực cấu trúc body AI ───────────────────── */

/* Đặc điểm của object tin nhắn chat nội bộ ST, dùng để loại bỏ dữ liệu chat không phải request AI
   Chỉ chứa các field có sẵn của ST; Không dùng các custom key mà plugin bên thứ 3 ghi vào dữ liệu chat để phán đoán */
const ST_INTERNAL_MSG_KEYS = new Set([
    'chat_metadata', 'mes', 'swipe_id', 'send_date', 'is_user', 'is_system',
    'extra', 'gen_id', 'gen_finished', 'swipes', 'swipe_info',
    'ch_name', 'file_name', 'integrity', 'note_prompt',
    'note_interval', 'note_position', 'note_depth', 'note_role',
    'timedWorldInfo',
]);

function getFetchRequestUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    try {
        if (input instanceof URL) return input.toString();
    } catch (e) { /* ignore */ }
    return '';
}

function getUrlPathForMatch(url) {
    if (!url || typeof url !== 'string') return '';
    try {
        return new URL(url, window.location.href).pathname.toLowerCase();
    } catch (e) {
        return url.toLowerCase();
    }
}

function pathMatchesAny(path, patterns) {
    if (!path) return false;
    return patterns.some(pattern => path.indexOf(pattern) !== -1);
}

function isExplicitNonGenerationUrl(url) {
    const path = getUrlPathForMatch(url);
    return pathMatchesAny(path, ST_NON_GENERATION_PATH_PATTERNS)
        && !pathMatchesAny(path, AI_GENERATION_PATH_PATTERNS);
}

function isPotentialGenerationUrl(url) {
    const path = getUrlPathForMatch(url);
    return pathMatchesAny(path, AI_GENERATION_PATH_PATTERNS);
}

/* Fast path tầng ngoài (Dùng chung cho fetch và XHR): Nếu địa chỉ là API nội bộ ST và không có đặc điểm của endpoint generate, thì bỏ qua phán đoán tầng ngoài,
   chỉ thử unbox phong bì. */
function isOuterFastPathUrl(url) {
    const path = getUrlPathForMatch(url);
    return !!(path && !pathMatchesAny(path, AI_GENERATION_PATH_PATTERNS)
        && (path.startsWith('/api/') || path.startsWith('/assets/') || path.startsWith('/backgrounds/')));
}

function hasGenerationRequestHints(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
    return Object.keys(body).some(k => AI_GENERATION_BODY_KEYS.has(k));
}

/* Xác thực nghiêm ngặt xem một object có phải là tin nhắn AI chuẩn hay không
   Cố tình chỉ chấp nhận role + content, tránh việc nhận nhầm dữ liệu lịch sử chat nội bộ ST, card nhân vật hoặc load hệ thống thành request generate. */
function isAiMessageObject(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const keys = Object.keys(obj);

    if (keys.some(k => ST_INTERNAL_MSG_KEYS.has(k))) return false;

    if (!keys.includes('role') || !keys.includes('content')) return false;

    const role = typeof obj.role === 'string' ? obj.role.toLowerCase().trim() : '';
    if (!['system', 'user', 'assistant', 'tool', 'function', 'developer', 'model', 'human'].includes(role)) return false;

    if (typeof obj.content === 'string') return obj.content.length > 0;
    if (Array.isArray(obj.content)) return obj.content.length > 0;

    return false;
}

function isGeminiContentObject(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const keys = Object.keys(obj);
    if (keys.some(k => ST_INTERNAL_MSG_KEYS.has(k))) return false;
    if (!('parts' in obj) || !Array.isArray(obj.parts) || obj.parts.length === 0) return false;

    return obj.parts.some(part => {
        if (!part || typeof part !== 'object') return false;
        return typeof part.text === 'string' && part.text.length > 0;
    });
}

/* Xác định xem body request có phải là request generate của AI hay không: Trọng tâm là nhận diện cấu trúc, kết hợp lọc qua URL và tham số generate (Loại trừ API nội bộ ST).
   Thứ tự check từ rẻ đến đắt: Check kiểu -> Loại trừ URL -> Quét key tầng ngoài cùng -> Kiểm tra từng phần tử mảng. */
function isAiRequestBody(body, requestUrl) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;

    /* Loại trừ bằng URL một cách rõ ràng (Khớp index chuỗi, khỏi duyệt mảng) */
    if (isExplicitNonGenerationUrl(requestUrl)) return false;

    const generationUrl = isPotentialGenerationUrl(requestUrl);
    const hasHints = hasGenerationRequestHints(body);

    /* Nếu vừa không phải URL generate lại không có đặc điểm của tham số generate, chỉ đi tiếp nếu có trường chứa tin nhắn ở tầng ngoài cùng:
       Cho qua text completion thuần, đồng thời đỡ tốn công duyệt từng phần tử mảng */
    if (!generationUrl && !hasHints) {
        const hasMessagesArray = Array.isArray(body.messages) && body.messages.length > 0;
        const hasChatArray = Array.isArray(body.chat) && body.chat.length > 0;
        const hasContentsArray = Array.isArray(body.contents) && body.contents.length > 0;
        const hasSystemPrompt = typeof body.system === 'string' && body.system.length > 0;
        const hasPlainPrompt = typeof body.prompt === 'string' && body.prompt.length > 0;

        if (!hasMessagesArray && !hasChatArray && !hasContentsArray && !hasSystemPrompt && !hasPlainPrompt) {
            return false;
        }

        if (hasPlainPrompt && !hasMessagesArray && !hasChatArray && !hasContentsArray && !hasSystemPrompt) {
            /* Mở đường cho tình huống text completion thuần (Đã được xử lý riêng trong parseFetchRequestBody) */
            return true;
        }

        /* Có mảng nhưng lại thiếu dấu hiệu generate, khả năng cao là load data nội bộ ST */
        return false;
    }

    const looksLikeGeneration = generationUrl || hasHints;

    if (typeof body.system === 'string' && Array.isArray(body.messages) && body.messages.length > 0) {
        return looksLikeGeneration && body.messages.some(isAiMessageObject);
    }

    if (Array.isArray(body.messages) && body.messages.length > 0) {
        return looksLikeGeneration && body.messages.some(isAiMessageObject);
    }

    if (Array.isArray(body.chat) && body.chat.length > 0) {
        return looksLikeGeneration && body.chat.some(isAiMessageObject);
    }

    if (Array.isArray(body.contents) && body.contents.length > 0) {
        return looksLikeGeneration && body.contents.some(isGeminiContentObject);
    }

    if (typeof body.prompt === 'string' && body.prompt.length > 0) {
        return true;
    }

    return false;
}

/* ── Unbox request proxy phong bì (Envelope) ─────────────────── */

/* Ghi lại kết quả của một lần thử unbox phong bì (Dành cho __rlogDebug truy vấn; Chỉ ghi lý do và thứ tự ứng viên tầng ngoài cùng, tuyệt đối không ghi lại bất kỳ địa chỉ thật nào) */
function rememberEnvelopeResult(hit, reason, urlIndex, bodyIndex) {
    lastEnvelopeResult = {
        hit: !!hit,
        reason,
        urlCandidateIndex: hit ? urlIndex : null,
        bodyCandidateIndex: hit ? bodyIndex : null,
    };
}

/* Parse chuỗi text request thành object JSON (Mảng/Vô hướng/JSON lỗi thì mặc định trả về null, không ném lỗi) */
function parseJsonText(text) {
    if (typeof text !== 'string' || !text) return null;
    try {
        const parsed = JSON.parse(text);
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null;
    } catch (e) {
        return null;
    }
}

/* Lấy giá trị ứng viên cho body tầng trong của phong bì (G4 + G7): Nếu là object (phi mảng) thì lấy luôn; Nếu là chuỗi thì JSON.parse tối đa một lần,
   nếu kết quả vẫn là object thì mới lấy; Các trường hợp khác coi như ứng viên đó không hợp lệ (Không đi sâu đệ quy). */
function normalizeEnvelopeBody(value) {
    if (!value) return null;
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
        return parseJsonText(value);
    }
    return null;
}

/* Unbox một request theo hình dáng phong bì (Pure function, chỉ đọc input; Không đệ quy, không tìm object bên trong, một request tối đa chỉ match một cặp):
   Input Method + Text request gốc → { effectiveUrl, effectiveBody, viaProxyEnvelope } hoặc null (Không phải phong bì).
   Thứ tự kiểm duyệt: G1 Method → G3 Lọc sơ bộ "Hình dáng URL" trong text → G4/G7 Lấy giá trị body → G9 Duyệt tính xác định ở tầng ngoài cùng →
   G6① Tầng trong bắt buộc phải là địa chỉ tuyệt đối http(s) → G5 Dùng lại hàm xác thực request body hiện tại (Không care tên field, chỉ care giá trị). */
function resolveRequestEnvelope(method, rawText) {
    /* G1: Chỉ xử lý các phương thức write (Giống với logic chặn hiện tại) */
    const upperMethod = typeof method === 'string' ? method.toUpperCase() : '';
    if (upperMethod !== 'POST' && upperMethod !== 'PUT' && upperMethod !== 'PATCH') {
        rememberEnvelopeResult(false, 'method-not-writable');
        return null;
    }

    /* G3: Lọc sơ bộ giá rẻ —— Trong text gốc bắt buộc phải có dấu vết "Hình dáng URL", không có thì khỏi parse JSON */
    if (typeof rawText !== 'string' || !rawText || !ENVELOPE_URL_SHAPE_RE.test(rawText)) {
        rememberEnvelopeResult(false, 'url-shape-miss');
        return null;
    }

    const outer = parseJsonText(rawText);
    if (!outer) {
        rememberEnvelopeResult(false, 'outer-not-object');
        return null;
    }

    /* G9: Chỉ duyệt trong các field đếm được ở tầng ngoài cùng (Thứ tự theo Object.keys); Vòng lặp ngoài cho ứng viên URL,
       Vòng lặp trong cho ứng viên body, dừng lại ngay khi có tổ hợp đầu tiên thỏa mãn đồng thời G6①/G5. */
    const keys = Object.keys(outer);
    let sawUrlCandidate = false;
    for (let urlIndex = 0; urlIndex < keys.length; urlIndex++) {
        const urlCandidate = outer[keys[urlIndex]];
        if (typeof urlCandidate !== 'string' || !urlCandidate) continue;
        if (!isPotentialGenerationUrl(urlCandidate)) continue;
        sawUrlCandidate = true;
        /* G6①: Địa chỉ mục tiêu tầng trong bắt buộc phải là địa chỉ tuyệt đối http(s) hoàn chỉnh (Loại trừ đường dẫn tương đối nội bộ ST) */
        if (!/^https?:\/\//i.test(urlCandidate)) continue;
        for (let bodyIndex = 0; bodyIndex < keys.length; bodyIndex++) {
            if (bodyIndex === urlIndex) continue; /* Cùng một field không thể đóng hai vai trò */
            const innerBody = normalizeEnvelopeBody(outer[keys[bodyIndex]]);
            if (!innerBody) continue;
            /* G5: Tầng trong tái sử dụng toàn bộ logic xác thực hiện tại (Yêu cầu cuối cùng là phải có mảng tin nhắn role/content xịn) */
            if (!isAiRequestBody(innerBody, urlCandidate)) continue;
            rememberEnvelopeResult(true, 'hit', urlIndex, bodyIndex);
            return { effectiveUrl: urlCandidate, effectiveBody: innerBody, viaProxyEnvelope: true };
        }
    }

    rememberEnvelopeResult(false, sawUrlCandidate ? 'no-valid-pair' : 'no-url-candidate');
    return null;
}

/* Đánh giá request thống nhất (Dùng chung cho fetch và XHR): Nếu pass đánh giá tầng ngoài → Ghi nhận theo tầng ngoài (Khỏi unbox); Nếu tạch
   (Bao gồm cả bị fast path nhảy cóc) → Thử unbox phong bì. Hai cái này độc quyền lẫn nhau, một request chỉ nẻ ra tối đa một bản ghi.
   @param {object} capture { requestUrl, method, rawText, getBody, context }
     getBody: Hàm lấy lười body request tầng ngoài (Trả về object|null; Nếu không cần qua phong bì thì đỡ tốn công parse)
     context: Context phán đoán nguồn (RQ-32), khi pass đánh giá tầng ngoài thì nhét thêm bodyObject / rawText vào để truyền xuống
   @returns {{effectiveUrl, effectiveBody, viaProxyEnvelope, context?}|null} */
function decideCapturedRequest(capture) {
    if (!isOuterFastPathUrl(capture.requestUrl)) {
        let outerBody = null;
        try {
            outerBody = capture.getBody ? capture.getBody() : null;
        } catch (e) {
            outerBody = null;
        }
        if (outerBody && isAiRequestBody(outerBody, capture.requestUrl)) {
            return {
                effectiveUrl: capture.requestUrl,
                effectiveBody: outerBody,
                viaProxyEnvelope: false,
                /* Context request: Bổ sung reference của object body request tầng ngoài (Lúc mà reference giống hệt dữ liệu công khai đã lưu thì E2 tự động pass luôn) */
                context: Object.assign({}, capture.context || {}, {
                    bodyObject: outerBody,
                    rawText: (typeof capture.rawText === 'string') ? capture.rawText : (capture.context ? capture.context.rawText : null),
                }),
            };
        }
    }
    return resolveRequestEnvelope(capture.method, capture.rawText);
}

/* ── Nhận diện nguồn request (Phán đoán phân tầng bằng chứng, RQ-32) ───────── */

/* [Thứ tự phán đoán (Cố định, theo định nghĩa ở phần "Phụ lục RQ-32" trong requirements.md)]
   0 Xác thực body request hiện tại + Unbox phong bì (Mục loại trừ duy nhất có thể terminate sớm, RQ-31)
   → 1 E1 Object handle có thể hủy giống nhau (Chỉ áp dụng cho fetch và chỉ cho stream)
   → 2 E2 Body request lấy từ dữ liệu công khai của lượt (pass) generate chính này (Mỗi lượt chỉ nhận request đầu tiên match)
   → 3 Các loại trừ chung X2 (Field loại generate bất thường) / X3 (Định danh API không khớp với cấu hình chính) / X4 (Không nằm trong bất kỳ lượt generate chính nào) / X5 (iframe cùng nguồn)
   → 4 Bằng chứng vị trí dự phòng E3 (Nằm sau event dữ liệu công khai, trước khi lượt này kết thúc, và lượt này chỉ có duy nhất một request ghi ứng viên)
   → 5 Fallback cũ: Click lối vào native / Enter + Khung thời gian 5 giây + Bảo kê loại event bắt đầu generate (Giữ lại không xóa, độ ưu tiên thấp nhất)
   → 6 Các trường hợp còn lại đều là "Plugin" (Mặc định)

   [Lý do xếp thứ tự (Bắt buộc phải giữ)]: X3 so sánh ngay tại "Khoảnh khắc bị chặn", mà plugin thì có thể tạm thời sửa cấu hình API chính giữa lúc generate (Đổi model /
   đổi kênh tạm thời), lúc đó request xịn không khớp cấu hình hiện tại; Nếu check loại trừ sớm sẽ dán nhãn nhầm request xịn thành plugin. E2 là check cùng nguồn,
   request của plugin không thể nào thỏa mãn được, nên cho bằng chứng thuận (positive) chạy trước thì không có rủi ro gì. */

/* Tên rule dùng để phán đoán nguồn (Phục vụ debug __rlogDebug.getLastSourceDecision và rà soát doc, không hiển thị trên UI):
   envelope / E1 / E2 / X2 / X3 / X4 / X5 / E3 / legacy / default / E3-revoked / correct */

/* Tạo object nguồn: Tập giá trị vẫn chỉ có 2 loại "Native / Plugin"; rule / evidence / passId là metadata phán đoán nội bộ
   (Tên Rule dùng để debug và assert khi regression test, khi evidence = 'position' thì bản ghi có thể bị lùi về "Plugin" nếu tính duy nhất của E3 hỏng).
   @param {'native'|'plugin'} type @param {string} detail Chú thích khi hover @param {string} rule @returns {object} */
function makeSource(type, detail, rule) {
    const normalized = type === 'native' ? 'native' : 'plugin';
    return {
        type: normalized,
        label: getSourceLabel({ type: normalized }),
        detail,
        rule: rule || '',
        evidence: null,
        passId: null,
    };
}

/* Ghi nhận kết quả phán đoán nguồn gần nhất (Dùng cho port debug) và trả về luôn kết quả đó
   @param {object} result @param {string} reason Lý do người đọc hiểu được @returns {object} */
function noteSourceDecision(result, reason) {
    lastSourceDecision = {
        type: result.type,
        rule: result.rule,
        detail: result.detail,
        reason: reason || '',
        at: Date.now(),
    };
    if (result.type === 'plugin') {
        lastExclusionReason = `${result.rule}: ${reason || ''}`.trim();
    }
    return result;
}

/* ── Theo dõi Lượt (pass) generate chính ───────────────── */

/* Đọc tên API chính của ST ('openai' là đường dẫn chat completion, còn lại là đường dẫn text completion)
   @returns {string} */
function getStMainApi() {
    const stCtx = getStContextSafe();
    return (stCtx && typeof stCtx.mainApi === 'string') ? stCtx.mainApi : '';
}

/* Kết thúc lượt này (Xóa object lượt; Timeout bị treo cũng chui qua đường này) */
function resetGenerationPassState() {
    generationPass = null;
}

/* Mở / Reset một lượt generate chính (Nhận được event "Bắt đầu generate", loại không phải yên lặng, không phải chỉ lắp ráp mà không gửi).
   Thông báo generate chính của chat nhóm sẽ bị lồng nhau thành nhiều cục: Xử lý theo kiểu "Dữ liệu công khai gần nhất thuộc về lượt hiện tại" —— Không tạo object lượt mới,
   chỉ xóa dữ liệu công khai và biến đếm ứng viên của lượt này (Việc nhận E2 và đếm E3 sẽ bắt đầu lại từ đầu), đồng thời cộng dồn độ sâu lồng.
   @param {string} type Loại generate */
function openOrResetGenerationPass(type) {
    const now = Date.now();
    if (generationPass && (now - generationPass.startTime) > PASS_MAX_AGE_MS) {
        resetGenerationPassState(); /* Lượt bị treo (Mất event kết thúc): Dọn dẹp sạch sẽ rồi mới mở lượt mới */
    }
    if (!generationPass) {
        generationPass = {
            id: ++generationPassSeq,
            active: true,
            type: '',
            startTime: now,
            depth: 0,
            dataTime: null,
            bodyRef: null,
            chatBodyRef: null,
            promptArray: null,
            e2Claimed: false,
            candidateCount: 0,
        };
    }
    generationPass.active = true;
    generationPass.type = String(type || '') || generationPass.type;
    generationPass.startTime = now;
    generationPass.depth++;
    generationPass.dataTime = null;
    generationPass.bodyRef = null;
    generationPass.chatBodyRef = null;
    generationPass.promptArray = null;
    generationPass.e2Claimed = false;
    generationPass.candidateCount = 0;
}

/* Nhận được "Kết thúc generate / Generate bị ngừng": Giảm độ sâu lồng, khi độ sâu về 0 thì kết thúc lượt này */
function closeGenerationPass() {
    if (!generationPass) return;
    generationPass.depth--;
    if (generationPass.depth <= 0) resetGenerationPassState();
}

/* Lượt generate chính hiện tại (Timeout bị treo thì coi như không có lượt nào → Giao cho X4 phán là "Plugin")
   @returns {object|null} */
function getActiveGenerationPass() {
    if (!generationPass || !generationPass.active) return null;
    if ((Date.now() - generationPass.startTime) > PASS_MAX_AGE_MS) {
        resetGenerationPassState();
        return null;
    }
    return generationPass;
}

/* Event "Lắp ráp xong dữ liệu request": Lưu reference payload dữ liệu công khai của lượt này, và chép lại thời gian của dữ liệu công khai (Cột mốc của E3).
   - API chính phi chat completion: Payload chính là object body request (E2 sẽ so sánh bằng cách serialize trực tiếp tại hiện trường)
   - API chính chat completion: Payload là mảng prompt ({ prompt: [...] }), đợi đến event "Body request sắp được gửi" mới có object body request
   @param {object} payload @param {boolean} dryRun */
function onPassDataGathered(payload, dryRun) {
    const pass = getActiveGenerationPass();
    if (!pass) return;
    if (dryRun === true) return; /* Chỉ lắp ráp, không gửi */
    pass.dataTime = Date.now();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
    if (getStMainApi() === 'openai') {
        pass.promptArray = Array.isArray(payload.prompt) ? payload.prompt : null;
    } else {
        pass.bodyRef = payload;
    }
}

/* Event "Body request sắp được gửi" (Đường dẫn chat completion): Payload chính là object body request sắp bị JSON.stringify.
   Generate yên lặng (type === 'quiet') không phải là request kịch bản chính, không ghi vào lượt này (Nếu không sẽ lấy nhầm request yên lặng của plugin làm request chính). */
function onChatCompletionSettingsReady(payload) {
    const pass = getActiveGenerationPass();
    if (!pass) return;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
    if (payload.type === 'quiet') return;
    pass.chatBodyRef = payload;
}

/* Cài đặt theo dõi lượt (pass) generate chính (Bắt đầu generate / Lắp ráp xong dữ liệu request / Body request sắp được gửi / Kết thúc generate / Generate bị ngừng) */
function installGenerationPassTracking() {
    if (generationPassTrackingInstalled) return;
    if (!eventSource || !event_types) return;
    generationPassTrackingInstalled = true;

    const on = (key, handler) => {
        const evt = event_types[key];
        if (evt) eventSource.on(evt, handler);
    };

    on('GENERATION_STARTED', (type, _options, dryRun) => {
        if (dryRun === true) return;              /* Chỉ lắp ráp, không gửi */
        if (String(type) === 'quiet') return;     /* Generate yên lặng: Không phải request kịch bản chính, không coi là lượt generate chính */
        openOrResetGenerationPass(String(type));
    });
    on('GENERATE_AFTER_DATA', (payload, dryRun) => onPassDataGathered(payload, dryRun));
    on('CHAT_COMPLETION_SETTINGS_READY', (payload) => onChatCompletionSettingsReady(payload));
    on('GENERATION_ENDED', () => closeGenerationPass());
    on('GENERATION_STOPPED', () => closeGenerationPass());
}

/* ── Bằng chứng thuận (E1 / E2) ─────────────────── */

/* E1: Object signal đi kèm request === Object signal hiện tại của instance bộ xử lý stream (Chỉ áp dụng cho fetch và chỉ cho stream).
   Cả hai signal đều được createFetchHook đọc đồng bộ ngay tại "Khoảnh khắc bị chặn" rồi tống vào context request (Xem buildFetchRequestContext),
   do đó không có cửa "Phán đoán muộn hơn lúc hủy bộ xử lý stream" gây lỗi timing. XHR không có handle hủy được gắn trên request, nên không bao giờ pass được.
   @param {object|null} context @returns {boolean} */
function matchHandleIdentity(context) {
    if (!context || context.fromXhr) return false;
    return !!(context.signal && context.streamingSignal && context.signal === context.streamingSignal);
}

/* Body request có hình dáng chat completion (messages là mảng khác rỗng): Tiêu chí field của X2 / X3 chỉ xài được cho hình dáng này,
   API chính phi chat completion sẽ phải nhờ X4 / X5 / E2 gánh hộ.
   @param {object} body @returns {boolean} */
function isChatCompletionShaped(body) {
    return !!(body && typeof body === 'object' && !Array.isArray(body)
        && Array.isArray(body.messages) && body.messages.length > 0);
}

/* Serialize reference object tại hiện trường (Trường hợp vòng lặp vô tận / Lỗi serialize thì trả về null)
   @param {object} value @returns {string|null} */
function stringifyRef(value) {
    try {
        return JSON.stringify(value);
    } catch (e) {
        return null;
    }
}

/* Mảng tin nhắn sau khi loại bỏ các phần tử không hợp lệ (Phần tử không phải object sẽ bị coi là "Không hợp lệ" và bị gạch đi)
   @param {Array} list @returns {Array} */
function validMessageItems(list) {
    return Array.isArray(list) ? list.filter((m) => m && typeof m === 'object') : [];
}

/* Yêu cầu bổ sung cho đường dẫn chat completion: Mảng messages của object body request phải cùng nguồn với mảng prompt của lượt này (Giống nhau từng phần tử, cho phép bỏ qua phần tử lỗi)
   @param {Array} messages @param {Array} promptArray @returns {boolean} */
function isSameSourceMessages(messages, promptArray) {
    const a = validMessageItems(messages);
    const b = validMessageItems(promptArray);
    if (a.length === 0 || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

/* E2: Body request lấy từ dữ liệu công khai của lượt (pass) generate chính này. Bắt buộc phải lưu reference, serialize tại hiện trường ngay "Khoảnh khắc bị chặn" để so sánh (Không được serialize từ trước,
   vì đoạn giữa có thể bị các listener khác chỉnh sửa nguyên trạng); ST chạy kiểu "Serialize xong là gửi ngay lập tức", không chèn code khác vào giữa 2 bước này.
   Hai đường dẫn:
   - API chính phi chat completion: Payload dữ liệu công khai chính là object body request → So sánh reference object y chang nhau hoặc kết quả serialize tại hiện trường giống hệt
   - API chính chat completion: Object body request lấy từ event "Body request sắp được gửi" → Serialize tại hiện trường giống hệt, đồng thời messages và mảng prompt của lượt này phải cùng nguồn
   Không khớp thì bị hạ cấp, giao cho tầng sau xử lý.
   @param {object|null} context @returns {boolean} */
function matchDataSameSource(context) {
    const pass = getActiveGenerationPass();
    if (!pass || pass.e2Claimed) return false;
    const bodyObject = context ? context.bodyObject : null;
    const rawText = context ? context.rawText : null;

    if (pass.bodyRef) {
        if (bodyObject && bodyObject === pass.bodyRef) return true;
        const serialized = stringifyRef(pass.bodyRef);
        if (serialized !== null && typeof rawText === 'string' && rawText === serialized) return true;
    }
    if (pass.chatBodyRef) {
        const serialized = stringifyRef(pass.chatBodyRef);
        if (serialized !== null && typeof rawText === 'string' && rawText === serialized
            && isSameSourceMessages(pass.chatBodyRef.messages, pass.promptArray)) {
            return true;
        }
    }
    return false;
}

/* ── Các loại trừ chung (X2 / X3) ───────────────── */

/* Chuẩn hóa giá trị định danh (undefined / null đồng nhất với chuỗi rỗng: ST không set một field nào đó cũng giống như set bằng rỗng)
   @param {*} value @returns {string} */
function normalizeIdentityValue(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

/* Địa chỉ kênh (Custom URL / Reverse proxy): Cả hai đều là thông tin kênh "Request được đưa đi đâu", ưu tiên lấy giá trị khác rỗng xuất hiện trước
   @param {object} source @returns {string} */
function getChannelAddress(source) {
    if (!source || typeof source !== 'object') return '';
    return normalizeIdentityValue(source.reverse_proxy) || normalizeIdentityValue(source.custom_url);
}

/* Kiểm tra xem địa chỉ request có phải là endpoint chat completion của ST không (Chỉ so path: Cửa sổ chính chặn được địa chỉ tương đối, iframe / XHR chặn được địa chỉ tuyệt đối)
   @param {string} url @returns {boolean} */
function isStChatCompletionEndpoint(url) {
    return getUrlPathForMatch(url) === ST_CHAT_COMPLETION_ENDPOINT;
}

/* X3: Định danh API phải nhất quán với cấu hình chính (Chỉ áp dụng cho body request có hình dáng chat completion). Tại khoảnh khắc chặn sẽ đọ 4 thứ:
   Nhà cung cấp / Địa chỉ request / Địa chỉ kênh (Custom URL, reverse proxy) / Model. Nếu lệch bất kỳ cái nào thì là "Plugin";
   **Khớp cả 4 cái cũng không đủ làm bằng chứng cấu thành Native** (Nên không tham gia phán đoán chiều thuận, chỉ dùng để loại trừ).
   @param {object} body @param {string} requestUrl @returns {boolean} */
function isApiIdentityConsistent(body, requestUrl) {
    const stCtx = getStContextSafe();
    const settings = stCtx && stCtx.chatCompletionSettings;
    if (!settings) return false; /* Không lấy được cấu hình chính → Chịu chết không chứng minh được sự nhất quán */

    /* ① Nhà cung cấp */
    if (normalizeIdentityValue(body.chat_completion_source) !== normalizeIdentityValue(settings.chat_completion_source)) {
        return false;
    }
    /* ② Địa chỉ request (Endpoint chat completion của ST) */
    if (!isStChatCompletionEndpoint(requestUrl)) return false;
    /* ③ Địa chỉ kênh (Custom URL / Reverse proxy) */
    if (getChannelAddress(body) !== getChannelAddress(settings)) return false;
    /* ④ Model */
    let expectedModel = '';
    try {
        expectedModel = (typeof stCtx.getChatCompletionModel === 'function')
            ? stCtx.getChatCompletionModel(settings)
            : settings.model;
    } catch (e) {
        expectedModel = settings.model;
    }
    if (normalizeIdentityValue(body.model) !== normalizeIdentityValue(expectedModel)) return false;

    return true;
}

/* ── Bằng chứng vị trí dự phòng (E3) và Lối vào phán đoán phân tầng ───────── */

/* Hủy bỏ bằng chứng vị trí của lượt này (Lượt này lòi ra request ghi ứng viên thứ 2): Giáng cấp các bản ghi đã được phán là native nhờ bằng chứng "Vị trí" xuống thành "Plugin".
   Chỉ lùi cấp cho những bản ghi "Vẫn giữ kết quả phán đoán gốc bằng bằng chứng vị trí, và chưa bị Sửa chữa định hình nhúng tay vào" —— Những bản ghi đã được
   (record.sourceCorrected) sửa chữa và nâng cấp lên Native rồi thì cứ giữ nguyên Native (Đó là một luồng bằng chứng độc lập khác). */
function revokePositionEvidence(pass) {
    if (!pass) return;
    let revoked = 0;
    for (const list of [records, tourPendingRecords]) {
        for (const record of list) {
            const src = record && record.source;
            if (!src || src.evidence !== 'position' || src.passId !== pass.id) continue;
            if (record.sourceCorrected) continue;
            const prevType = src.type;
            record.source = makeSource('plugin', SOURCE_PLUGIN_DEFAULT_DETAIL, 'E3-revoked');
            refreshRecordSourceDom(record, prevType);
            revoked++;
        }
    }
    if (revoked > 0) {
        lastExclusionReason = `E3-revoked: Lượt này xuất hiện nhiều request ghi ứng viên, bằng chứng vị trí bị hủy bỏ (${revoked} bản ghi bị lùi về "Plugin")`;
    }
}

/* Hủy bỏ bằng chứng vị trí của lượt này: Đánh dấu lượt + Ghi lại ID (Để cho những request "Đang bay trên đường nhưng chưa tạo bản ghi" lúc addRecord tự soi gương lại mình) +
   Lùi cấp các bản ghi đã được tạo dựa trên bằng chứng vị trí thành "Plugin" */
function forfeitPositionEvidence(pass) {
    if (!pass) return;
    pass.positionForfeited = true;
    lastForfeitedPositionPassId = pass.id;
    revokePositionEvidence(pass);
}

/* Chốt sổ bằng chứng vị trí E3: Phán đoán (Lúc chặn) và Tạo bản ghi (Bất đồng bộ, phải đợi tính token) là hai bước tách rời, ở giữa đó có thể
   xuất hiện request ghi ứng viên thứ 2 của lượt này —— Lúc này bằng chứng vị trí không còn đứng vững, tạo bản ghi thẳng theo diện "Plugin" luôn, tránh để người dùng thấy cảnh "Native" nhấp nháy rồi tụt cấp. */
function finalizePositionEvidenceSource(source) {
    if (!source || source.evidence !== 'position') return source;
    const forfeitedByLive = !!(generationPass && generationPass.id === source.passId
        && generationPass.candidateCount >= 2);
    if (forfeitedByLive || lastForfeitedPositionPassId === source.passId) {
        lastExclusionReason = 'E3-revoked: Lượt này xuất hiện nhiều request ghi ứng viên, bằng chứng vị trí bị hủy bỏ';
        return makeSource('plugin', SOURCE_PLUGIN_DEFAULT_DETAIL, 'E3-revoked');
    }
    return source;
}

/* Đếm ứng viên E3: Trong phạm vi lượt này, sau event dữ liệu công khai (Cột mốc của lượt này), mọi request ghi ứng viên đều bị tính sổ, bao gồm cả mấy request pass unbox phong bì;
   Lòi ra 2 cái trở lên là bỏ luôn bằng chứng vị trí. Để tránh đếm trùng, processCapturedBody chỉ gọi hàm này 1 lần duy nhất sau khi request body pass xác thực. */
function notePassWriteCandidate() {
    const pass = getActiveGenerationPass();
    if (!pass || pass.dataTime == null) return;
    pass.candidateCount++;
    if (pass.candidateCount >= 2) forfeitPositionEvidence(pass);
}

/* Fallback cũ (Mức ưu tiên thấp nhất, giữ lại không xóa): Click lối vào native / Enter + Khung thời gian 5 giây + Bảo kê loại event bắt đầu generate.
   Lối vào native không bị tiêu thụ ngay lập tức (Vì trong lúc bấm Tạo lại / Trả lời thay thế có thể dính các request trung gian), hết giờ thì tự hủy.
   @returns {object|null} Match thì trả về object nguồn, tạch thì null */
function legacyNativeIntentSource() {
    const now = Date.now();
    if (lastNativeIntent && (now - lastNativeIntent.timestamp) <= NATIVE_INTENT_WINDOW_MS) {
        return makeSource('native', `Request Native-${lastNativeIntent.target}`, 'legacy');
    }
    if (lastNativeIntent && (now - lastNativeIntent.timestamp) > NATIVE_INTENT_WINDOW_MS) {
        lastNativeIntent = null;
    }
    return null;
}

/* Lối vào phán đoán phân tầng nguồn request (Thứ tự cố định xem comment ở đầu phần này; Lý do xếp thứ tự bắt buộc phải giữ nguyên)
   @param {object} body Object body request đã qua xác thực
   @param {string} requestUrl Địa chỉ request có hiệu lực
   @param {object|null} context Context của request { rawText, bodyObject, method, topWindow, signal, streamingSignal, fromXhr }
   @returns {object} Object nguồn (Native / Plugin) */
function decideRequestSource(body, requestUrl, context) {
    const ctxInfo = context || {};
    const pass = getActiveGenerationPass();

    /* 1 E1 Object handle có thể hủy giống nhau (Chỉ áp dụng cho fetch và chỉ cho stream) → Native */
    if (matchHandleIdentity(ctxInfo)) {
        return noteSourceDecision(makeSource('native', 'Request Native-Handle Stream', 'E1'), 'Object signal mang theo request giống hệt với instance bộ xử lý stream hiện tại');
    }

    /* 2 E2 Body request lấy từ dữ liệu công khai của lượt (pass) generate chính này (Tiêu chuẩn chính; Mỗi lượt chỉ nhận request đầu tiên match) → Native */
    if (matchDataSameSource(ctxInfo)) {
        if (pass) pass.e2Claimed = true;
        return noteSourceDecision(makeSource('native', 'Request Native-Cùng Nguồn Dữ Liệu', 'E2'), 'Body request cùng nguồn với dữ liệu công khai của lượt này');
    }

    /* 3 Các loại trừ chung (Chỉ phong bì mới có thể dừng sớm, việc này đã xong ở lối vào) → Plugin */
    if (isChatCompletionShaped(body)) {
        if (!Object.prototype.hasOwnProperty.call(body, 'type')) {
            return noteSourceDecision(makeSource('plugin', SOURCE_PLUGIN_DEFAULT_DETAIL, 'X2'), 'Body request chat completion thiếu field type (Body không phải do ST dựng)');
        }
        if (body.type === 'quiet') {
            return noteSourceDecision(makeSource('plugin', SOURCE_PLUGIN_DEFAULT_DETAIL, 'X2'), 'type === quiet (Generate yên lặng, không phải request kịch bản chính)');
        }
        if (!isApiIdentityConsistent(body, requestUrl)) {
            return noteSourceDecision(makeSource('plugin', SOURCE_PLUGIN_DEFAULT_DETAIL, 'X3'), 'Định danh API không khớp với cấu hình chính (Nhà cung cấp / Địa chỉ request / Địa chỉ kênh / Model)');
        }
    }
    if (!pass) {
        return noteSourceDecision(makeSource('plugin', SOURCE_PLUGIN_DEFAULT_DETAIL, 'X4'), 'Không nằm trong bất kỳ lượt generate chính nào');
    }
    if (!ctxInfo.topWindow) {
        return noteSourceDecision(makeSource('plugin', SOURCE_PLUGIN_DEFAULT_DETAIL, 'X5'), 'Đến từ iframe cùng nguồn (Không phải cửa sổ trên cùng)');
    }

    /* 4 Bằng chứng vị trí dự phòng E3 (Nằm sau event dữ liệu công khai, trước khi lượt này kết thúc, và lượt này chỉ có duy nhất một request ghi ứng viên) → Native */
    if (pass && pass.dataTime != null && pass.candidateCount === 1) {
        const result = makeSource('native', 'Request Native-Bằng Chứng Vị Trí', 'E3');
        result.evidence = 'position';
        result.passId = pass.id;
        return noteSourceDecision(result, 'Sau event dữ liệu công khai, request ghi ứng viên duy nhất của lượt này');
    }

    /* 5 Fallback cũ (Mức ưu tiên thấp nhất) → Native */
    const legacy = legacyNativeIntentSource();
    if (legacy) return noteSourceDecision(legacy, 'Fallback khung thời gian cũ (Click lối vào native / Enter)');

    /* 6 Các trường hợp còn lại → Plugin (Mặc định) */
    return noteSourceDecision(makeSource('plugin', SOURCE_PLUGIN_DEFAULT_DETAIL, 'default'), 'Mặc định Plugin');
}

/* ── Sửa chữa nguồn sau khi response định hình (Chỉ nâng cấp từ "Plugin → Nguyên bản") ── */

/* Chuẩn hóa văn bản tầng (floor text): Thống nhất ngắt dòng, thu gọn khoảng trắng trong dòng, xóa khoảng trắng ở đầu/cuối và các dòng trống.
   (Khi ST render vào chat sẽ thực hiện cắt chuỗi dừng, nối prompt bias..., ở đây chỉ chuẩn hóa ở mức độ khoảng trắng.) */
function normalizeFloorText(text) {
    if (typeof text !== 'string' || !text) return '';
    return text.replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[\t\u00a0 ]+/g, ' ').trim())
        .filter((line) => line.length > 0)
        .join('\n');
}

/* "Văn bản thuần" của reply (không bao gồm suy nghĩ): Reply trong bản ghi có định dạng ghép nối là `<think>…</think>` + dòng trống + văn bản chính */
function getReplyPlainContent(record) {
    const content = (record && record.reply && record.reply.content) || '';
    return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/* Văn bản tầng có khớp với văn bản thuần của bản ghi hay không (cả hai bên đều đã được chuẩn hóa): Hoàn toàn bằng nhau, hoặc khi độ dài đủ lớn thì "tầng chứa văn bản chính"
   (Việc tạo tiếp (continue) sẽ ghép nội dung mới vào cuối tầng, prompt bias sẽ được thêm vào đầu tầng; Văn bản ngắn chỉ công nhận hoàn toàn bằng nhau để tránh phán đoán sai) */
function isFloorTextMatch(floorText, replyText) {
    if (!floorText || !replyText) return false;
    if (floorText === replyText) return true;
    if (replyText.length < SOURCE_CORRECTION_MIN_OVERLAP) return false;
    return floorText.indexOf(replyText) !== -1;
}

/* Ghi nhớ văn bản ứng viên của tầng từ sự kiện tin nhắn ST gần nhất (tin nhắn đến / tin nhắn nhân vật đã render / chuyển trang swipe):
   Văn bản chính của tầng hiện tại + các ứng viên swipe của tầng đó. */
function rememberFloorEvent(mesId) {
    const stCtx = getStContextSafe();
    const chat = stCtx && stCtx.chat;
    const idx = Number(mesId);
    const message = (Array.isArray(chat) && Number.isFinite(idx)) ? chat[idx] : null;
    if (!message || typeof message !== 'object') return;

    const texts = [];
    if (typeof message.mes === 'string' && message.mes.trim()) texts.push(message.mes);
    if (Array.isArray(message.swipes)) {
        for (const swipe of message.swipes) {
            if (typeof swipe === 'string' && swipe.trim()) texts.push(swipe);
        }
    }
    const normalized = texts.map(normalizeFloorText).filter((t) => t);
    if (normalized.length === 0) return;

    lastFloorEvent = { mesId: idx, texts: normalized, at: Date.now() };
    scheduleSourceCorrectionCheck();
}

/* Đăng ký một bản ghi "chờ sửa chữa" (gọi khi văn bản response đã chốt): Chỉ đăng ký các bản ghi không phải bản demo hiện đang được đánh dấu là "plugin".
   Bỏ qua bản demo; Khi tìm kiếm mục tiêu sửa chữa, quét qua cả danh sách bình thường và hàng đợi tạm thời của hướng dẫn (xem prunePendingSourceCorrections). */
function queueSourceCorrection(record) {
    if (!record || record.isDemo) return;
    if (!record.source || record.source.type !== 'plugin') return;
    if (record.source.rule === 'envelope') return; /* Giải nén phong bì thành công thì nguồn cố định là "plugin", không tham gia sửa chữa */
    pendingSourceCorrections.set(record, { at: Date.now() });
    scheduleSourceCorrectionCheck();
}

/* Dọn dẹp danh sách chờ sửa chữa: Bản ghi không còn trong danh sách (bị cắt / xóa sạch / xóa) hoặc vượt quá thời gian lưu giữ.
   Các mục trong thời gian gia hạn chỉ được đánh giá dựa trên thời gian tồn tại — Khi "reply đến trước, bản ghi vào danh sách sau", bản ghi vẫn chưa vào danh sách,
   nếu phán đoán theo quan hệ thành viên sẽ xóa nhầm mục vừa được đăng ký. */
function prunePendingSourceCorrections(now) {
    for (const [record, meta] of pendingSourceCorrections) {
        const age = now - meta.at;
        if (age <= SOURCE_CORRECTION_PENDING_GRACE_MS) continue;
        const alive = records.indexOf(record) !== -1 || tourPendingRecords.indexOf(record) !== -1;
        if (!alive || age > SOURCE_CORRECTION_PENDING_TTL_MS) {
            pendingSourceCorrections.delete(record);
        }
    }
}

/* Kích hoạt một lần thử sửa chữa: Một lần ngay lập tức + một lần thử lại với độ trễ ngắn (Bù thêm một lần khi sự kiện tin nhắn đến trước mà response chưa đọc xong;
   Phía response đến sau sẽ do queueSourceCorrection → hàm này chịu trách nhiệm kích hoạt, ai đến sau thì người đó kích hoạt). */
function scheduleSourceCorrectionCheck() {
    if (pendingSourceCorrections.size === 0) return;
    tryPromoteSourcesFromFloor();
    if (sourceCorrectionTimer === null) {
        sourceCorrectionTimer = setTimeout(() => {
            sourceCorrectionTimer = null;
            tryPromoteSourcesFromFloor();
        }, SOURCE_CORRECTION_RETRY_MS);
    }
}

/* Sửa chữa: Bản ghi hiện được đánh dấu là "plugin", nếu văn bản thuần của response (không chứa suy nghĩ) sau khi chuẩn hóa khớp với văn bản tầng / ứng viên swipe vừa xuất hiện,
   và chỉ khớp duy nhất một cái → nâng cấp thành "nguyên bản". Chỉ thực hiện nâng cấp, tuyệt đối không giáng cấp; Khớp 0 hoặc nhiều mục thì đều không sửa
   (Lấy "response không định hình" làm bằng chứng là không an toàn: thất bại, hủy bỏ, tạo ngầm (quiet generation), đóng vai (impersonate) đều không định hình vào tầng). */
function tryPromoteSourcesFromFloor() {
    const floorEvent = lastFloorEvent;
    if (!floorEvent || !floorEvent.texts.length) return;
    const now = Date.now();
    if ((now - floorEvent.at) > SOURCE_CORRECTION_WINDOW_MS) return; /* Sự kiện tầng đã quá cũ: không sửa chữa */

    prunePendingSourceCorrections(now);
    if (pendingSourceCorrections.size === 0) return;

    let matchedRecord = null;
    let matchedCount = 0;
    for (const [record] of pendingSourceCorrections) {
        if (!record.reply || !record.source || record.source.type !== 'plugin') continue;
        const replyText = normalizeFloorText(getReplyPlainContent(record));
        if (!floorEvent.texts.some((text) => isFloorTextMatch(text, replyText))) continue;
        matchedCount++;
        matchedRecord = record;
        if (matchedCount > 1) break;
    }
    if (matchedCount !== 1) return;
    promoteRecordSource(matchedRecord);
}

/* Nâng cấp nguồn của bản ghi thành "nguyên bản" (Chỉ sửa 3 trường của nguồn: loại / tên hiển thị / giải thích khi hover; Giữ nguyên các nội dung khác của bản ghi) */
function promoteRecordSource(record) {
    const prevType = record.source && record.source.type;
    record.source = makeSource('native', '原生请求-响应落楼修正', 'correct');
    record.sourceCorrected = true;
    pendingSourceCorrections.delete(record);
    sourceCorrectionStats.count++;
    sourceCorrectionStats.lastReason = '响应纯正文与楼层正文 / 翻页候选唯一匹配';
    sourceCorrectionStats.lastTime = formatTimestamp(Date.now());
    refreshRecordSourceDom(record, prevType);
}

/* Cài đặt theo dõi sửa chữa nguồn: Sự kiện tin nhắn ST (tin nhắn đến / tin nhắn nhân vật đã render / chuyển trang swipe) → ghi nhớ ứng viên tầng và thử sửa chữa */
function installSourceCorrectionTracking() {
    if (sourceCorrectionTrackingInstalled) return;
    if (!eventSource || !event_types) return;
    sourceCorrectionTrackingInstalled = true;

    const onFloorEvent = (mesId) => rememberFloorEvent(mesId);
    for (const key of ['MESSAGE_RECEIVED', 'CHARACTER_MESSAGE_RENDERED', 'MESSAGE_SWIPED']) {
        const evt = event_types[key];
        if (evt) eventSource.on(evt, onFloorEvent);
    }
}

/* Context phán đoán nguồn của request fetch (đọc đồng bộ ngay khoảnh khắc chặn; phía XHR do beginXhrCapture cấu trúc riêng) */
function buildFetchRequestContext(realmWindow, input, init, method) {
    let signal = (init && init.signal) ? init.signal : null;
    if (!signal && isRequestLike(input)) {
        try { signal = input.signal || null; } catch (e) { signal = null; }
    }
    const stCtx = getStContextSafe();
    const processor = stCtx ? stCtx.streamingProcessor : null;
    const streamingSignal = (processor && processor.abortController) ? processor.abortController.signal : null;
    return {
        rawText: (init && typeof init.body === 'string') ? init.body : null,
        bodyObject: null, /* Sẽ được decideCapturedRequest bổ sung khi phán đoán lớp ngoài thông qua (tham chiếu object giống nhau cũng là bằng chứng E2) */
        method,
        topWindow: realmWindow === window,
        fromXhr: false,
        signal,
        streamingSignal,
    };
}

function rememberNativeIntent(target, source) {
    lastNativeIntent = {
        timestamp: Date.now(),
        target,
        source,
    };
}

function installSourceTracking() {
    if (sourceTrackingInstalled) return;
    sourceTrackingInstalled = true;

    const nativeTargets = [
        { selector: '#send_but', label: '发送按钮' },
        { selector: '#option_regenerate', label: '重新生成' },
        { selector: '#option_continue, #mes_continue', label: '继续' },
        { selector: '#mes_impersonate', label: '扮演' },
        { selector: '.swipe_right, .mes_swipe_right, [data-action="swipe-right"], [title="Swipe right"]', label: '生成备选回复' },
    ];

    const onNativeClickIntent = (e) => {
        const targetEl = e.target instanceof Element ? e.target : null;
        if (!targetEl) return;

        /* Chỉ kiểm tra trong các khu vực liên quan đến chat (#sheld là container khu vực nội dung chính của ST), tránh duyệt qua các khu vực vô nghĩa như menu/cài đặt */
        const chatZone = document.getElementById('sheld') || document.getElementById('chat') || document.getElementById('send_form');
        if (chatZone && !chatZone.contains(targetEl)) {
            return;
        }

        let matched = null;

        for (const item of nativeTargets) {
            if (targetEl.closest(item.selector)) {
                matched = item;
                break;
            }
        }

        if (matched) {
            rememberNativeIntent(matched.label, e.type === 'pointerdown' ? 'pointerdown' : 'click');
        }
    };

    document.addEventListener('pointerdown', onNativeClickIntent, true);
    document.addEventListener('click', onNativeClickIntent, true);

    /* Reply thay thế (swipe) / tạo lại có thể không đi qua pointerdown/click, trực tiếp lắng nghe GENERATION_STARTED làm phương án dự phòng */
    if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
        const stCtx = window.SillyTavern.getContext();
        if (stCtx && stCtx.eventSource && stCtx.event_types) {
            const onGenStarted = (type) => {
                const typeStr = String(type != null ? type : '');
                /* Chỉ bổ sung cờ đánh dấu khi sự kiện click DOM không thể bắt được, và chỉ nhận diện các loại tạo nguyên bản rõ ràng */
                if (!lastNativeIntent || (Date.now() - lastNativeIntent.timestamp) > NATIVE_INTENT_WINDOW_MS) {
                    if (typeStr === 'impersonate') {
                        rememberNativeIntent('扮演 (ST事件)', 'generationStarted');
                    } else if (typeStr === 'continue') {
                        rememberNativeIntent('继续 (ST事件)', 'generationStarted');
                    } else if (typeStr === 'regenerate') {
                        rememberNativeIntent('重新生成 (ST事件)', 'generationStarted');
                    } else if (typeStr === 'swipe') {
                        rememberNativeIntent('生成备选回复 (ST事件)', 'generationStarted');
                    }
                }
            };
            try {
                stCtx.eventSource.on(stCtx.event_types.GENERATION_STARTED, onGenStarted);
            } catch (err) {
                /* Đăng ký thất bại chỉ ảnh hưởng đến nhận diện dự phòng, theo dõi lối vào DOM vẫn hoạt động bình thường */
                console.debug(`[${PLUGIN_KEY}] 注册 GENERATION_STARTED 监听失败:`, err);
            }
        }
    }

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        if (e.isComposing || e.keyCode === 229) return;
        if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;

        const targetEl = e.target;
        if (!(targetEl instanceof HTMLTextAreaElement)) return;
        if (targetEl.id !== 'send_textarea') return;

        rememberNativeIntent('输入框 Enter', 'keydown');
    }, true);

    /* Expose API debug ra window */
    window.__rlogDebug = {
        getLastNativeIntent: () => lastNativeIntent,
        getRecords: () => records,
        getIframeHookCount: () => {
            let count = 0;
            document.querySelectorAll('iframe').forEach((f) => {
                try {
                    if (f.contentWindow && hookedFetchHooks.get(f.contentWindow)) count++;
                } catch (e) { /* Bỏ qua iframe khác domain */ }
            });
            return count;
        },
        /* Bộ đếm wrapper XHR (thống kê các realm iframe cùng nguồn đã được hook) */
        getXhrHookCount: () => {
            let count = 0;
            document.querySelectorAll('iframe').forEach((f) => {
                try {
                    if (f.contentWindow && hookedXhrProtos.has(f.contentWindow)) count++;
                } catch (e) { /* Bỏ qua iframe khác domain */ }
            });
            return count;
        },
        /* Kết quả của lần thử giải nén phong bì (envelope) gần nhất (trúng hay không + lý do; khi trúng sẽ chứa số thứ tự ứng viên cấp cao nhất do G9 chọn, không chứa địa chỉ thật) */
        getLastEnvelopeResult: () => lastEnvelopeResult,
        /* Số mục hiện tại trong khu vực chờ của reply (dùng cho assertion hồi quy: các request không thuộc loại bản ghi không được chiếm slot) */
        getPendingReplyCount: () => pendingReplies.size,
        /* Trạng thái và loại của lượt tạo chính hiện tại (tóm tắt chỉ đọc; không chứa tham chiếu body request) */
        getGenerationPass: () => {
            const pass = generationPass;
            if (!pass) return { active: false };
            return {
                active: !!pass.active,
                id: pass.id,
                type: pass.type,
                startTime: pass.startTime,
                ageMs: Date.now() - pass.startTime,
                depth: pass.depth,
                hasData: pass.dataTime != null,
                hasBodyRef: !!pass.bodyRef,
                hasChatBodyRef: !!pass.chatBodyRef,
                promptCount: Array.isArray(pass.promptArray) ? pass.promptArray.length : 0,
                e2Claimed: !!pass.e2Claimed,
                candidateCount: pass.candidateCount,
            };
        },
        /* Phán đoán nguồn gần nhất (Loại trúng bằng chứng chính: E1 cùng handle / E2 cùng nguồn dữ liệu / E3 vị trí; Loại trừ: X2–X5 / Mặc định) */
        getLastSourceDecision: () => (lastSourceDecision ? { ...lastSourceDecision } : null),
        /* Lý do loại trừ gần nhất khi phán đoán là "plugin" */
        getLastExclusion: () => lastExclusionReason,
        /* Số lần sửa chữa và lý do gần nhất (chỉ nâng cấp "plugin → nguyên bản") */
        getSourceCorrectionStats: () => ({ ...sourceCorrectionStats }),
        /* Số lượng bản ghi chờ sửa chữa hiện tại (response đã chốt, chờ khớp khi định hình vào tầng) */
        getPendingCorrectionCount: () => pendingSourceCorrections.size,
        /* Thống kê gỡ/khôi phục văn bản chính (chỉ đọc): loaded/unloaded là trạng thái hiện tại trong danh sách, passes/lastPassMs là bộ đếm bảo trì băng thông */
        getBodyUnloadStats: () => {
            const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
            let loaded = 0;
            if (listEl) {
                listEl.querySelectorAll('.rmsg-content').forEach((contentEl) => {
                    if (!unloadedBodies.has(contentEl)) loaded++;
                });
            }
            return {
                loaded,
                unloaded: unloadedBodies.size,
                passes: bodyUnloadStats.passes,
                lastPassMs: Math.round(bodyUnloadStats.lastPassMs * 10) / 10,
                restoreAllCount: bodyUnloadStats.restoreAllCount,
            };
        },
    };

    console.debug(`[${PLUGIN_KEY}] 请求来源识别已启用（证据分层判定 + 原生入口监听保底）。调试接口: window.__rlogDebug`);
}

function getSourceLabel(source) {
    if (source && source.type === 'native') return '原生';
    return '插件';
}

function getSourceClass(source) {
    if (source && source.type === 'native') return 'rlog-source-native';
    return 'rlog-source-plugin';
}

/* ── Đánh chặn request (fetch + XHR) ────────────── */

function getCurrentCharacterName() {
    try {
        const ctx = window.SillyTavern && typeof window.SillyTavern.getContext === 'function'
            ? window.SillyTavern.getContext()
            : null;
        if (ctx && ctx.name2) return ctx.name2;
        if (ctx && ctx.characterName) return ctx.characterName;
        const charId = ctx && ctx.characterId;
        if (charId && ctx.characters && ctx.characters[charId] && ctx.characters[charId].name) return ctx.characters[charId].name;
        if (ctx && ctx.groupId && ctx.groups && ctx.groups[ctx.groupId] && ctx.groups[ctx.groupId].name) {
            return ctx.groups[ctx.groupId].name;
        }
    } catch (e) { /* ignore */ }
    return '未知角色';
}

function normalizeRole(role) {
    if (!role || typeof role !== 'string') return 'unknown';
    const r = role.toLowerCase().trim();
    const mapping = {
        'model': 'assistant',
        'bot': 'assistant',
        'ai': 'assistant',
        'human': 'user',
        'usr': 'user',
        'sys': 'system',
        'function': 'tool',
        'tool_calls': 'tool',
        'tool_call': 'tool',
    };
    return mapping[r] || r;
}

/* Phân tích body request của các API AI khác nhau, thống nhất trích xuất danh sách tin nhắn
   Trả về null tức là không thể phân tích (bỏ qua trong im lặng, không tạo bản ghi) */
function parseFetchRequestBody(json) {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return null;

    const messages = [];

    /* 1. Định dạng OpenAI / Tương thích — mảng messages */
    if (Array.isArray(json.messages)) {
        for (const m of json.messages) {
            if (!isAiMessageObject(m)) continue;
            let content = '';
            if (typeof m.content === 'string' && m.content) {
                content = m.content;
            } else if (Array.isArray(m.content)) {
                content = m.content
                    .filter(c => c.type === 'text' && c.text)
                    .map(c => c.text)
                    .join('\n');
            }
            if (content) {
                messages.push({
                    role: normalizeRole(m.role),
                    content,
                    tokens: 0, /* Tính toán bất đồng bộ bởi computeTokensForMessages */
                    collapsed: true,
                });
            }
        }
    }

    /* 2. Mảng chat — Định dạng sự kiện nội bộ của ST (có thể bị fetch bắt được) */
    if (messages.length === 0 && Array.isArray(json.chat)) {
        for (const m of json.chat) {
            if (!isAiMessageObject(m)) continue;
            let content = '';
            if (typeof m.content === 'string' && m.content) {
                content = m.content;
            }
            if (content) {
                messages.push({
                    role: normalizeRole(m.role),
                    content,
                    tokens: 0,
                    collapsed: true,
                });
            }
        }
    }

    /* 3. Định dạng Google Gemini */
    if (messages.length === 0 && Array.isArray(json.contents)) {
        for (const c of json.contents) {
            if (!c || typeof c !== 'object') continue;
            const itemKeys = Object.keys(c);
            if (itemKeys.some(k => ST_INTERNAL_MSG_KEYS.has(k))) continue;
            let content = '';
            if (typeof c.parts === 'object' && Array.isArray(c.parts)) {
                content = c.parts
                    .filter(p => typeof p.text === 'string' && p.text)
                    .map(p => p.text)
                    .join('\n');
            } else if (typeof c.text === 'string') {
                content = c.text;
            }
            if (content) {
                messages.push({
                    role: normalizeRole(c.role || 'user'),
                    content,
                    tokens: 0,
                    collapsed: true,
                });
            }
        }
    }

    /* 4. Định dạng Anthropic */
    if (messages.length === 0 && typeof json.system === 'string' && Array.isArray(json.messages)) {
        if (json.system) {
            messages.push({
                role: 'system',
                content: json.system,
                tokens: 0,
                collapsed: true,
            });
        }
        for (const m of json.messages) {
            if (!isAiMessageObject(m)) continue;
            if (typeof m.content === 'string' && m.content) {
                messages.push({
                    role: normalizeRole(m.role),
                    content: m.content,
                    tokens: 0,
                    collapsed: true,
                });
            }
        }
    }

    /* 5. Hoàn thành văn bản thuần (text completion) */
    if (messages.length === 0 && typeof json.prompt === 'string' && json.prompt.length > 0) {
        messages.push({
            role: 'user',
            content: json.prompt,
            tokens: 0,
            collapsed: false,
        });
    }

    if (messages.length === 0) return null;
    return messages;
}

/* Che mờ các trường nhạy cảm trong body request gốc (dùng khi lưu trữ); Không thay đổi object đầu vào, nếu không có sẽ trả về nguyên trạng
   @param {object} body @returns {object} */
function redactSensitiveBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return body;

    let redacted = null;
    for (const field of SENSITIVE_BODY_FIELDS) {
        /* Giá trị trống không cần che mờ */
        if (!body[field]) continue;
        if (!redacted) redacted = Object.assign({}, body);
        redacted[field] = SENSITIVE_BODY_MASK;
    }
    return redacted || body;
}

/* Xử lý bất đồng bộ ngầm body request đã bắt (phân tích tin nhắn, tính token, lưu bản ghi), tách rời khỏi việc gửi request, không chặn mạng
   @param {object} body @param {string} requestUrl @param {number|null} captureId
   @param {boolean} [viaProxyEnvelope=false] Có phải có được từ việc giải nén phong bì hay không (ép buộc đánh dấu nguồn là "plugin")
   @param {object|null} [requestContext=null] Context phán đoán nguồn (RQ-32: Văn bản gốc / Object body request / Có phải top level không / Object signal)
   @param {object|null} [simulateCtx=null] Context bắt của lần mô phỏng này (Khác null tức là "đây là bắt mô phỏng"; Nguồn cố định là mô phỏng, không tham gia phán đoán nguồn) */
async function processCapturedBody(body, requestUrl, captureId, viaProxyEnvelope = false, requestContext = null, simulateCtx = null) {
    const isSimulated = !!simulateCtx;
    if (!body || !isAiRequestBody(body, requestUrl)) {
        if (isSimulated) simulateCtx.settle(null);
        return;
    }

    const messages = parseFetchRequestBody(body);
    if (!messages) {
        if (isSimulated) simulateCtx.settle(null);
        return;
    }

    const characterName = getCurrentCharacterName();
    /* Bộ đếm ứng viên E3 (request ghi ứng viên của lượt này, từ 2 cái trở lên sẽ hủy bỏ bằng chứng vị trí): Một request chỉ tính một lần; Bắt mô phỏng không tính vào */
    if (!isSimulated) notePassWriteCandidate();
    /* Giải nén phong bì thành công (Thứ tự phán đoán 0, mục loại trừ duy nhất có thể kết thúc sớm): Nguồn cố định là "plugin", không thực hiện phán đoán phân tầng bằng chứng;
       Bắt mô phỏng cố định dùng nguồn mô phỏng, tương tự cũng không phán đoán */
    const source = isSimulated
        ? { ...SIMULATED_PROMPT_SOURCE }
        : (viaProxyEnvelope
            ? noteSourceDecision(ENVELOPE_PROXY_SOURCE, '信封解包命中（RQ-31，判定终局）')
            : decideRequestSource(body, requestUrl, requestContext));
    let modelName = extractModelName(body);
    /* Fallback tên model của bản ghi mô phỏng: Khi không lấy được trong body request thì dùng tên model hiện tại của ST */
    if (isSimulated && modelName === '未知模型') modelName = getStChatCompletionModelName() || modelName;
    /* Mô phỏng đã phán đoán thất bại (timeout) thì không lập hồ sơ nữa: Kiểm tra một lần trước và sau khi tách từ (tokenize), tránh tính toán vô ích */
    if (isSimulated && simulateCtx.canceled) {
        simulateCtx.settle(null);
        return;
    }
    /* Dùng tokenizer gốc của ST để tính token chính xác (modelName dùng để phán đoán xem tokenizer có tương thích không) */
    await computeTokensForMessages(messages, modelName);
    /* Trong quá trình tokenize cũng có thể bị timeout: Tương tự sẽ không lập hồ sơ */
    if (isSimulated && simulateCtx.canceled) {
        simulateCtx.settle(null);
        return;
    }
    /* captureId dùng để gắn chính xác reply của request đó vào bản ghi này; rawBody sẽ được che mờ các trường nhạy cảm trước khi lưu trữ */
    const record = addRecord(characterName, messages, source, modelName, redactSensitiveBody(body), captureId,
        { simulated: isSimulated });
    /* Bắt mô phỏng: Thực hiện tín hiệu hoàn thành "bản ghi đã được tạo"; Không tạo được bản ghi thì thực hiện giá trị rỗng, quy trình mô phỏng sẽ xử lý như thất bại */
    if (isSimulated) simulateCtx.settle(record || null);
}

/* Phán đoán xem đầu vào của fetch có phải là object Request hay không.
   Dùng duck typing thay vì instanceof: Khi vượt qua các realm, Request trong iframe sẽ luôn trả về false khi dùng `instanceof Request` ở cửa sổ chính, nhưng phương thức clone/text vẫn có thể dùng được. */
function isRequestLike(input) {
    return !!(input && typeof input === 'object' && typeof input.clone === 'function' && typeof input.text === 'function');
}

/* Cấu trúc wrapper chặn fetch (cửa sổ chính và iframe cùng nguồn dùng chung): Mỗi realm dùng một cờ re-entry độc lập, bên trong wrapper luôn gọi
   fetch gốc của chính realm đó (truyền Request xuyên realm sẽ ném lỗi). Fast path sẽ lọc từng bước theo "Không phải write request → ST internal API →
   mới parse body"; Khóa chỉ bảo vệ việc bắt đồng bộ body, originalFetch được gọi ngay sau khi giải phóng khóa,
   tokenize và addRecord chạy bất đồng bộ, không chặn việc gửi request mạng.
   Khi phán đoán lớp ngoài không qua (bao gồm bị fast path bỏ qua), giai đoạn bất đồng bộ sẽ thử giải nén theo hình dạng phong bì (xem decideCapturedRequest).
   @param {Window} realmWindow @param {Function} getOriginalFetch @returns {Function} */
function createFetchHook(realmWindow, getOriginalFetch) {
    let realmHookInFlight = false; /* Bảo vệ re-entry của realm này (chống các wrapper khác tạo thành vòng lặp vô hạn) */
    return async function hookedFetch(input, init) {
        const originalFetch = getOriginalFetch();

        /* ── Mô phỏng xem trước ──
           Request mục tiêu được "trang bị vũ khí" ngay khi thông báo trước khi gửi đến chính là request của lần mô phỏng này: Tiếp tục đi xuống, tạo hồ sơ theo pipeline bản ghi bình thường,
           cuối cùng không giao cho fetch gốc (xem fetchPromise bên dưới); Các request tạo không được nhận diện trong cửa sổ vẫn chỉ chặn chứ không ghi lại */
        const simulateWindowHit = simulatePromptActive && GENERATE_ENDPOINT_RE.test(getFetchRequestUrl(input));
        /* Request mục tiêu chỉ có thể được gửi từ cửa sổ chính (chuỗi gửi của chính ST): Request tạo trong iframe chỉ chặn chứ không nhận diện */
        const simulateCapture = (simulateWindowHit && simulateCaptureCtx && simulateCaptureCtx.armed && realmWindow === window)
            ? simulateCaptureCtx
            : null;
        if (simulateCapture) simulateCapture.armed = false; /* Chỉ nhận diện request này */
        if (simulateWindowHit && !simulateCapture) {
            return Promise.reject(new DOMException('Simulate mode: generation request blocked', 'AbortError'));
        }

        /* ── Fast path 0: Bảo vệ re-entry (bắt mô phỏng mục này cần tạo hồ sơ, không bị giới hạn này) ── */
        if (realmHookInFlight && !simulateCapture) {
            return originalFetch.apply(realmWindow, [input, init]);
        }

        /* ── Fast path 1: Khi công tắc chính tắt sẽ truyền qua trực tiếp, không phân tích body (bắt mô phỏng mục này không bị giới hạn) ── */
        if (!masterEnabled && !simulateCapture) {
            return originalFetch.apply(realmWindow, [input, init]);
        }

        /* ── Fast path 2: Bỏ qua trực tiếp các request không phải POST/PUT/PATCH ── */
        let method = init && init.method ? init.method.toUpperCase() : 'GET';
        if (isRequestLike(input) && method === 'GET') {
            try { method = input.method.toUpperCase(); } catch (e) { /* ignore */ }
        }
        if (!simulateCapture && method !== 'POST' && method !== 'PUT' && method !== 'PATCH') {
            return originalFetch.apply(realmWindow, [input, init]);
        }

        /* ── Fast path 3: URL là API nội bộ của ST và không chứa đặc điểm của endpoint tạo (generation endpoint) ──
           "Bỏ qua trực tiếp" vốn có vẫn giữ nguyên: Chỉ khi body là chuỗi có thể đọc đồng bộ, và văn bản trúng lọc sơ bộ "hình dạng URL"
           (đặc điểm chung của request proxy dạng phong bì) thì mới tiếp tục bắt xuống dưới, phần còn lại vẫn truyền qua trực tiếp như cũ, không phân tích body. */
        const requestUrl = getFetchRequestUrl(input);
        const outerFastPath = isOuterFastPathUrl(requestUrl);
        const shapeText = (init && typeof init.body === 'string') ? init.body : null;
        if (!simulateCapture && outerFastPath && (!shapeText || !ENVELOPE_URL_SHAPE_RE.test(shapeText))) {
            return originalFetch.apply(realmWindow, [input, init]);
        }
        /* Địa chỉ cổng của theo dõi reply: Khi địa chỉ lớp ngoài bị fast path bỏ qua, dùng địa chỉ ứng viên lớp trong trúng bộ lọc sơ bộ
           (captureResponseForRequest chỉ theo dõi reply khi "địa chỉ giống endpoint tạo") */
        let replyGateUrl = requestUrl;
        if (outerFastPath && shapeText) {
            const shapeMatch = shapeText.match(ENVELOPE_URL_SHAPE_RE);
            if (shapeMatch) replyGateUrl = shapeMatch[0];
        }

        /* ── Khóa chỉ bảo vệ việc bắt đồng bộ của body (không liên quan đến I/O hoặc await); Khi cần đọc body bất đồng bộ từ Request,
           bắt đầu đọc xong sẽ lập tức thoát khóa, originalFetch được gọi sớm nhất có thể ở bên ngoài khóa ── */
        realmHookInFlight = true;
        /* object|null: Body request bắt đồng bộ từ init.body (dùng khi không cần đọc bất đồng bộ) */
        let syncBody = null;
        /* string|null: Văn bản request gốc bắt đồng bộ từ init.body (dùng để giải nén phong bì) */
        let rawText = null;
        /* Promise<object|null>|null: Promise đọc body bất đồng bộ từ Request.clone() */
        let asyncBodyPromise = null;
        try {
            if (init && init.body) {
                if (typeof init.body === 'string') {
                    rawText = init.body;
                    /* Lớp ngoài bị fast path bỏ qua thì không phân tích: Việc có phân tích hay không giao cho phán đoán bất đồng bộ sau khi trúng bộ lọc sơ bộ phong bì */
                    if (!outerFastPath) {
                        try { syncBody = JSON.parse(init.body); } catch (e) { syncBody = null; }
                    }
                } else if (typeof init.body === 'object' && !Array.isArray(init.body)) {
                    /* Tham chiếu trực tiếp (không clone, vì processCapturedBody chỉ đọc) */
                    syncBody = init.body;
                }
            }

            /* Không đọc thêm body của object Request (dò tìm phong bì chỉ nhắm vào chuỗi init.body có thể đọc đồng bộ) */
            if (!outerFastPath && !syncBody && isRequestLike(input)) {
                try {
                    const clonedReq = input.clone();
                    asyncBodyPromise = clonedReq.text().then(text => {
                        if (text) {
                            try { return JSON.parse(text); } catch (e) { return null; }
                        }
                        return null;
                    }).catch(() => null);
                } catch (e) {
                    /* clone thất bại (body có thể đã bị tiêu thụ), bỏ qua */
                }
            }
        } finally {
            realmHookInFlight = false;
        }

        /* ── Context request (dùng để phán đoán nguồn, RQ-32) ──
           Đọc đồng bộ ngay khoảnh khắc chặn; Hai tín hiệu của E1 (cùng object handle) lấy từ cùng một thời điểm,
           do đó không tồn tại cửa sổ thời gian "phán đoán trễ hơn lúc hủy bộ xử lý stream". */
        const requestContext = buildFetchRequestContext(realmWindow, input, init, method);

        /* ── Gọi fetch gốc (ngoài khóa; gọi qua tham chiếu closure, tránh đệ quy qua window.fetch) ──
           Bắt mô phỏng mục này là ngoại lệ: Ghi xong sẽ trả về "đã hủy", không đưa request ra ngoài */
        const fetchPromise = simulateCapture
            ? Promise.reject(new DOMException('Simulate mode: generation request blocked', 'AbortError'))
            : originalFetch.apply(realmWindow, [input, init]);

        /* ── Xử lý bất đồng bộ body ngầm (không chặn fetch trả về) ── */
        if (syncBody || rawText || asyncBodyPromise) {
            /* Mã bắt request lần này: Việc gắn reply, dọn dẹp khu vực chờ đều phụ thuộc vào nó; Bắt mô phỏng mục này không gửi mạng, không có reply để theo dõi */
            const captureId = simulateCapture ? null : ++captureSeq;
            /* Gắn theo dõi reply trên cùng một fetchPromise trả về cho caller (tương ứng chính xác, không bị lẫn lộn khi chạy không theo thứ tự/đồng thời);
               Bắt mô phỏng mục này không có reply để theo dõi */
            if (captureId != null) captureResponseForRequest(fetchPromise, replyGateUrl, captureId);
            /* Thống nhất phán đoán (ưu tiên lớp ngoài, lớp ngoài không qua mới thử giải nén phong bì), trúng thì dùng địa chỉ hiệu lực và body request hiệu lực để tạo hồ sơ;
               getBody là lazy evaluation, khi bị fast path bỏ qua sẽ không phân tích lại body lớp ngoài */
            const handleBody = (getBody) => {
                const decision = decideCapturedRequest({
                    requestUrl,
                    method,
                    rawText,
                    context: requestContext,
                    getBody,
                });
                if (!decision) {
                    /* Bắt mô phỏng mục này không qua phán đoán body request: Không tạo hồ sơ, cũng đừng để quy trình mô phỏng đợi mãi */
                    if (simulateCapture) simulateCapture.settle(null);
                    return null;
                }
                return processCapturedBody(decision.effectiveBody, decision.effectiveUrl, captureId,
                    decision.viaProxyEnvelope, decision.context, simulateCapture);
            };
            if (syncBody || rawText) {
                /* body bắt đồng bộ / văn bản gốc: Phân tích và phán đoán đặt vào giai đoạn bất đồng bộ sau khi request được gửi đi */
                Promise.resolve().then(() => handleBody(() => syncBody || parseJsonText(rawText)))
                    .catch(() => { /* Xử lý im lặng */ });
            } else if (asyncBodyPromise) {
                asyncBodyPromise.then(body => {
                    if (body) return handleBody(() => body);
                }).catch(() => { /* Xử lý im lặng */ });
            }
        }

        return fetchPromise;
    };
}

/* Cài đặt đánh chặn request cửa sổ chính (fetch + XHR): Cả hai bộ wrapper luôn được cài đặt, việc có ghi hay không do masterEnabled quyết định bên trong.
   Wrapper của plugin này chỉ cài lên khi buildUI (APP_READY / dự phòng trễ), do đó nó nằm ở lớp ngoài hơn so với wrapper "cài sẵn trong thời gian thực thi script";
   originalFetch / phương thức prototype XHR gốc bắt được chính là chuỗi gọi hạ lưu đã sẵn sàng vào thời điểm đó. */
function installRequestHooks() {
    if (currentHook) return; /* Đã cài đặt */

    originalFetch = window.fetch;
    currentHook = createFetchHook(window, () => originalFetch);
    window.fetch = currentHook;
    hookedFetchHooks.set(window, currentHook);
    hookRealmXhr(window);

    console.debug(`[${PLUGIN_KEY}] 请求拦截已启用（fetch + XHR，网络层统一拦截模式）`);
}

/* Cài đặt wrapper request cho một iframe cùng nguồn (fetch + XHR): Vượt domain không lấy được contentWindow thì bỏ qua trực tiếp;
   Đã cài và chưa bị thay thế thì bỏ qua, tránh phá hỏng chuỗi wrapper của realm đó.
   @param {HTMLIFrameElement} iframe @returns {boolean} Đã cài đặt hay chưa */
function hookIframeRequests(iframe) {
    if (!iframe) return false;
    if (!iframe.contentWindow) {
        /* contentWindow chưa sẵn sàng: Gắn lắng nghe load, thử lại sau khi load xong */
        if (!iframeLoadListenersAttached.has(iframe)) {
            iframeLoadListenersAttached.add(iframe);
            iframe.addEventListener('load', () => hookIframeRequests(iframe));
        }
        return false;
    }
    const win = iframe.contentWindow;
    try {
        /* Phán đoán cùng nguồn: Truy cập contentWindow.document khác domain sẽ ném SecurityError */
        void win.document;
    } catch (e) {
        return false;
    }

    /* Wrapper fetch: Đã cài và chưa bị thay thế thì bỏ qua */
    let ready = true;
    const existingHook = hookedFetchHooks.get(win);
    if (existingHook && win.fetch === existingHook) {
        ready = true;
    } else if (typeof win.fetch === 'function') {
        /* Bắt fetch gốc hiện tại của realm đó; Sau khi iframe tải lại (xây dựng lại realm) hoặc script bên trong thay thế fetch
           sẽ được wrapper lại bởi lắng nghe load. */
        const iframeOriginalFetch = win.fetch;
        const hook = createFetchHook(win, () => iframeOriginalFetch);
        win.fetch = hook;
        hookedFetchHooks.set(win, hook);
    } else {
        ready = false;
    }

    /* Wrapper XHR: Cùng một realm chỉ cài một lần, đã cài và chưa bị thay thế thì bỏ qua */
    if (!hookRealmXhr(win)) ready = false;

    if (!iframeLoadListenersAttached.has(iframe)) {
        iframeLoadListenersAttached.add(iframe);
        iframe.addEventListener('load', () => hookIframeRequests(iframe));
    }
    return ready;
}

/* Cài đặt wrapper request iframe cùng nguồn (fetch + XHR):
   Quét ban đầu các iframe hiện có, và dùng MutationObserver để lắng nghe các iframe được tạo động sau đó
   (bật/tắt script, đổi nhân vật/preset xây dựng lại, render tin nhắn...). Wrapper luôn được cài đặt, việc có ghi hay không do masterEnabled quyết định bên trong. */
function installIframeRequestHooks() {
    if (iframeHooksInstalled) return;
    iframeHooksInstalled = true;

    /* Quét ban đầu: Khi cài đặt có thể đã có iframe cùng nguồn trên trang */
    let hookedCount = 0;
    let totalCount = 0;
    for (const iframe of document.querySelectorAll('iframe')) {
        totalCount++;
        if (hookIframeRequests(iframe)) hookedCount++;
    }

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.tagName === 'IFRAME') {
                    hookIframeRequests(node);
                } else if (node.querySelectorAll) {
                    for (const inner of node.querySelectorAll('iframe')) {
                        hookIframeRequests(inner);
                    }
                }
            }
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    console.debug(`[${PLUGIN_KEY}] iframe 请求拦截已启用（fetch + XHR，初始 ${hookedCount}/${totalCount} 个 iframe + 动态监听）`);
}

/* ── Wrapper và lắng nghe XHR ─────────────────────── */

/* Phân tích địa chỉ open nhận được thành địa chỉ tuyệt đối theo location của chính realm đó (location của cửa sổ chính và iframe khác nhau). */
function resolveRealmUrl(realmWindow, url) {
    const raw = (typeof url === 'string') ? url : (url != null ? String(url) : '');
    if (!raw) return '';
    try {
        const base = (realmWindow && realmWindow.location) ? realmWindow.location.href : undefined;
        return new URL(raw, base).toString();
    } catch (e) {
        return raw;
    }
}

/* Bắt đầu một lần lắng nghe XHR (chỉ lắng nghe, tuyệt đối không quấy rầy): Ở giai đoạn send sẽ đồng bộ tạo stream tổng hợp "đệm thụ động" và gắn lắng nghe sự kiện,
   lúc này không cấp captureId, không đăng ký theo dõi reply; Sau khi phán đoán qua thì caller sẽ tiếp quản.
   Trong context phán đoán nguồn, signal / streamingSignal luôn là null: XHR không có handle hủy trên request,
   E1 (cùng object handle) chỉ áp dụng cho fetch, tuyệt đối không được áp dụng vào XHR.
   @param {XMLHttpRequest} xhr @param {*} body @param {Window} realmWindow realm gửi request đó
   @returns {{method, url, rawText, trackReply, responsePromise, discard, context}|null} */
function beginXhrCapture(xhr, body, realmWindow) {
    if (!masterEnabled) return null;
    if (!xhr || typeof xhr !== 'object') return null;
    const meta = xhrOpenMeta.get(xhr);
    if (!meta || !meta.async) return null;              /* Chưa qua open hoặc XHR đồng bộ (tham số thứ ba là false) sẽ không theo dõi */
    if (typeof body !== 'string' || !body) return null; /* Chỉ lắng nghe body chuỗi */
    const requestUrl = meta.url;
    const rawText = body;
    /* Context request (dùng cho phán đoán nguồn, RQ-32): Có phải top window không / Phương thức / Văn bản request gốc */
    const context = {
        rawText,
        bodyObject: null, /* Sẽ được decideCapturedRequest bổ sung khi phán đoán lớp ngoài thông qua */
        method: meta.method,
        topWindow: realmWindow === window,
        fromXhr: true,
        signal: null,
        streamingSignal: null,
    };
    /* Fast path lớp ngoài: Khi địa chỉ là API nội bộ của ST và không chứa đặc điểm endpoint tạo, chỉ khi văn bản trúng lọc sơ bộ "hình dạng URL" thì mới tiếp tục
       (Các write request /api/ không phải phong bì sẽ thoát ở bước này, chi phí giống hệt fast path của đánh chặn hiện có) */
    if (isOuterFastPathUrl(requestUrl) && !ENVELOPE_URL_SHAPE_RE.test(rawText)) return null;

    /* Khi responseType không rỗng/`text` thì chỉ ghi request, không theo dõi reply (do đó không cần tạo stream và lắng nghe) */
    let responseType = '';
    try { responseType = xhr.responseType || ''; } catch (e) { responseType = ''; }
    const trackReply = (responseType === '' || responseType === 'text');
    if (!trackReply) {
        return {
            method: meta.method,
            url: requestUrl,
            rawText,
            trackReply: false,
            responsePromise: null,
            discard: () => { /* Chỉ ghi request, không cần dọn đệm */ },
            context,
        };
    }

    /* Đệm thụ động: Hàng đợi ReadableStream tiếp nhận gia số từ progress, trước khi phán đoán qua không có bất kỳ bên đọc nào */
    let controller = null;
    const stream = new ReadableStream({ start(c) { controller = c; } });
    const encoder = new TextEncoder();
    let fedLength = 0;     /* Số ký tự responseText đã nạp (chỉ giữ phần tăng thêm, không tích lũy toàn đoạn) */
    let stopped = false;   /* Phán đoán không qua/stream báo lỗi: Dừng tiếp tục nạp */
    let settled = false;   /* Response đã đến trạng thái cuối (một trong load/error/abort/timeout) */
    let resolveResponse = null;
    let rejectResponse = null;
    const responsePromise = new Promise((resolve, reject) => {
        resolveResponse = resolve;
        rejectResponse = reject;
    });
    /* Phán đoán không qua (chưa đăng ký theo dõi reply) sẽ không tạo ra Promise rejection chưa được xử lý */
    responsePromise.catch(() => { /* 静默 */ });

    /* Nạp theo gia số (chỉ lấy đoạn mới thêm lần này) */
    function feed(fullText) {
        if (stopped || typeof fullText !== 'string') return;
        const delta = fullText.slice(fedLength);
        if (!delta) return;
        fedLength = fullText.length;
        try { controller.enqueue(encoder.encode(delta)); } catch (e) { stopped = true; }
    }
    /* Mạng thất bại/hủy bỏ/timeout: Ánh xạ vào nhánh thất bại hiện có (Hủy bỏ dùng tên AbortError, đi vào nhánh "Người dùng hủy" hiện có) */
    function fail(err) {
        if (settled) return;
        settled = true;
        stopped = true;
        try { controller.error(err); } catch (e) { /* ignore */ }
        rejectResponse(err);
    }

    xhr.addEventListener('progress', () => {
        if (settled) return;
        try { feed(xhr.responseText); } catch (e) { stopped = true; }
    });
    xhr.addEventListener('load', () => {
        if (settled) return;
        let text = '';
        try { text = xhr.responseText; } catch (e) { stopped = true; }
        feed(text);
        const status = Number(xhr.status) || 0;
        /* status 0 (bị từ chối cross-domain/mạng thất bại) và các mã không phải 200-599 được xử lý như lỗi mạng, không cấu trúc Response tổng hợp */
        if (status < 200 || status > 599) {
            fail(new Error('network error'));
            return;
        }
        let response = null;
        try {
            const init = { status, statusText: xhr.statusText || '' };
            const contentType = xhr.getResponseHeader && xhr.getResponseHeader('content-type');
            if (contentType) init.headers = { 'content-type': contentType };
            /* 204/205/304 là trạng thái không có văn bản chính: Bắt buộc cấu trúc không có body */
            const noBody = (status === 204 || status === 205 || status === 304);
            response = noBody ? new Response(null, init) : new Response(stream, init);
        } catch (e) {
            response = null;
        }
        if (!response) {
            fail(new Error('network error'));
            return;
        }
        settled = true;
        try { controller.close(); } catch (e) { /* ignore */ }
        resolveResponse(response);
    });
    xhr.addEventListener('error', () => fail(new Error('network error')));
    xhr.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        fail(err);
    });
    xhr.addEventListener('timeout', () => fail(new Error('network error')));

    return {
        method: meta.method,
        url: requestUrl,
        rawText,
        trackReply: true,
        responsePromise,
        context,
        /* Phán đoán không qua: Bỏ đi đệm thụ động (không cấp captureId, không chiếm slot chờ của reply) */
        discard: () => {
            stopped = true;
            try { controller.error(new Error('discarded')); } catch (e) { /* ignore */ }
        },
    };
}

/* Xử lý bất đồng bộ một lần XHR đã lắng nghe: Phán đoán → Cấp mã bắt và đăng ký theo dõi reply → Đi vào pipeline bản ghi hiện có.
   @param {object} capture Handle trả về của beginXhrCapture */
function processCapturedXhr(capture) {
    const decision = decideCapturedRequest({
        requestUrl: capture.url,
        method: capture.method,
        rawText: capture.rawText,
        context: capture.context,
        getBody: () => parseJsonText(capture.rawText),
    });
    if (!decision) {
        capture.discard();
        return null;
    }
    /* Phán đoán qua mới cấp captureId và đăng ký theo dõi reply: XHR không thuộc loại bản ghi hoàn toàn không chiếm slot chờ */
    const captureId = capture.trackReply ? ++captureSeq : null;
    if (captureId != null) {
        captureResponseForRequest(capture.responsePromise, decision.effectiveUrl, captureId);
    }
    return processCapturedBody(decision.effectiveBody, decision.effectiveUrl, captureId,
        decision.viaProxyEnvelope, decision.context);
}

/* Cài đặt wrapper XHR cho một realm (cửa sổ chính và iframe cùng nguồn dùng chung): Chỉ lắng nghe, tuyệt đối không làm phiền lệnh gọi gốc.
   open ghi lại phương thức và địa chỉ (địa chỉ tương đối được phân tích thành tuyệt đối theo location của realm), send bắt body chuỗi;
   Metadata của instance lưu bằng WeakMap, lặp lại open sẽ ghi đè. Đã cài và chưa bị thay thế thì bỏ qua;
   Sau khi iframe tải lại (xây dựng lại realm) hoặc script bên trong thay thế prototype, sẽ được wrapper lại bởi lắng nghe load.
   @param {Window} realmWindow @returns {boolean} Đã cài đặt hay chưa */
function hookRealmXhr(realmWindow) {
    if (!realmWindow) return false;
    let proto = null;
    try {
        const ctor = realmWindow.XMLHttpRequest;
        proto = ctor && ctor.prototype;
    } catch (e) {
        return false;
    }
    if (!proto || typeof proto.open !== 'function' || typeof proto.send !== 'function') return false;

    const installed = hookedXhrProtos.get(realmWindow);
    if (installed && proto.open === installed.open && proto.send === installed.send) return true; /* Đã cài đặt */

    const originalOpen = proto.open;
    const originalSend = proto.send;

    const hookedOpen = function hookedXhrOpen(method, url, async) {
        try {
            xhrOpenMeta.set(this, {
                method: typeof method === 'string' ? method.toUpperCase() : 'GET',
                url: resolveRealmUrl(realmWindow, url),
                async: async !== false, /* XHR đồng bộ (tham số thứ ba của open là false) không theo dõi */
            });
        } catch (e) { /* Bỏ qua lỗi bắt, open gốc vẫn gọi bình thường */ }
        return originalOpen.apply(this, arguments);
    };

    const hookedSend = function hookedXhrSend(body) {
        let capture = null;
        try {
            capture = beginXhrCapture(this, body, realmWindow);
        } catch (e) {
            capture = null;
        }
        try {
            const result = originalSend.apply(this, arguments);
            if (capture) {
                /* Phán đoán và ghi lại đặt vào giai đoạn bất đồng bộ sau khi request được gửi đi, không chặn send */
                Promise.resolve().then(() => processCapturedXhr(capture))
                    .catch(() => { try { capture.discard(); } catch (e) { /* ignore */ } });
            }
            return result;
        } catch (err) {
            /* send gốc tự ném lỗi: Vứt bỏ lần bắt này và ném lỗi nguyên bản, không thay đổi ngữ nghĩa lỗi */
            try { if (capture) capture.discard(); } catch (e) { /* ignore */ }
            throw err;
        }
    };

    try {
        proto.open = hookedOpen;
        proto.send = hookedSend;
    } catch (e) {
        return false;
    }
    hookedXhrProtos.set(realmWindow, { open: hookedOpen, send: hookedSend });
    return true;
}

/* ── Theo dõi và phân tích reply ──────────────────────── */

/* Thời lượng timeout reply đang có hiệu lực (có debug đè lên thì dùng giá trị đè, không thì dùng mặc định 5 phút)
   @returns {number} */
function getReplyTimeoutMs() {
    return replyTimeoutOverrideMs != null ? replyTimeoutOverrideMs : REPLY_TIMEOUT_MS;
}

/* Văn bản hiển thị của thẻ đánh dấu trạng thái (tiếng Anh, viết hoa chữ cái đầu)
   @param {string} status 'succeed' | 'fail' | 'timeout'
   @returns {string} */
function getReplyStatusLabel(status) {
    if (status === 'simulated') return 'Simulated';
    if (status === 'fail') return 'Fail';
    if (status === 'timeout') return 'Timeout';
    return 'Succeed';
}

/* Lấy giá trị trạng thái của "thẻ trạng thái" trên thanh tiêu đề bản ghi: Bản ghi mô phỏng cố định ở simulated, còn lại lấy trạng thái reply thực tế
   @param {object} record @returns {string|null} */
function getRecordStatus(record) {
    if (record && record.simulated) return 'simulated';
    return (record && record.reply && record.reply.status) || null;
}

/* Cache chiều rộng slot thẻ trạng thái reply (px): Do getReplyStatusMaxWidth đo thực tế một lần, dùng chung cho placeholder/thẻ */
let replyStatusMaxWidth = null;

/* Đo thực tế chiều rộng lớn nhất (px) của ba thẻ trạng thái dưới font chữ hiện tại, ghi vào --rlog-status-w, cung cấp cho placeholder dùng chung chiều rộng slot,
   tránh việc bố cục bị nhảy khi reply đến. Probe gắn vào body và kế thừa font chữ bảng điều khiển một cách rõ ràng, chỉ khi đo được chiều rộng hợp lệ mới cache.
   @returns {number} */
function getReplyStatusMaxWidth() {
    if (replyStatusMaxWidth !== null) return replyStatusMaxWidth;
    if (!panelEl || !panelEl.isConnected) return 0;
    const probe = document.createElement('span');
    probe.className = 'rlog-reply-status';
    probe.style.fontFamily = getComputedStyle(panelEl).fontFamily;
    probe.style.position = 'fixed';
    probe.style.left = '-9999px';
    probe.style.top = '0';
    probe.style.visibility = 'hidden';
    probe.style.display = 'inline-flex';
    probe.style.minWidth = '0px'; /* Đè lên var() trong rule class, tránh phụ thuộc vòng khi đo lường */
        probe.style.pointerEvents = 'none';
        probe.style.whiteSpace = 'nowrap';
        let max = 0;
        for (const status of ['succeed', 'fail', 'timeout']) {
            probe.textContent = getReplyStatusLabel(status);
            /* Gắn vào shadow root để đo, style giống bảng điều khiển và không bị ảnh hưởng bởi theme của bên thứ ba */
            if (panelShadowRoot) panelShadowRoot.appendChild(probe);
            max = Math.max(max, probe.offsetWidth);
            probe.remove();
        }
    /* Chỉ cache khi đo ra chiều rộng hợp lệ: Trong trường hợp bất thường body bị ẩn sẽ đo ra 0, cache 0 sẽ làm placeholder mất hiệu lực vĩnh viễn */
    if (max > 0) replyStatusMaxWidth = max;
    return max;
}

/* Tooltip hover của thẻ đánh dấu trạng thái: Chỉ hiển thị lý do động + thời gian kết thúc (chữ trạng thái đã có trên thẻ); Thành công thì thống nhất hiển thị Succeed
   @param {object} record @returns {string} */
function getReplyStatusTitle(record) {
    if (record && record.simulated) return `Simulated · ${record.timestamp || ''}`;
    const reply = record && record.reply;
    if (!reply) return '';
    let reason;
    if (reply.status === 'succeed') {
        reason = 'Succeed'; /* Thành công không có lý do động, phần lý do là cố định */
    } else {
        reason = reply.failReason || getReplyStatusLabel(reply.status);
        if (reason === 'timeout') reason = 'Timeout'; /* Lý do timeout đồng nghĩa với trạng thái, giữ chữ hoa/thường nhất quán với thẻ */
    }
    return `${reason} · ${reply.time || ''}`;
}

/* Nối nội dung hiển thị của reply: Suy nghĩ được bọc bằng <think>, để trống một dòng rồi tiếp theo là văn bản chính
   @param {object} replyData { reasoning, content } @returns {string} */
function buildReplyContent(replyData) {
    const reasoning = (replyData.reasoning || '').trim();
    const content = (replyData.content || '').trim();
    const parts = [];
    if (reasoning) parts.push(`<think>\n${reasoning}\n</think>`);
    if (content) parts.push(content);
    return parts.join('\n\n');
}

/* Nối thêm văn bản vào khu vực tích lũy văn bản chính/suy nghĩ: Văn bản mới là tiền tố của văn bản đã tích lũy và dài hơn → Thay thế (kiểu tích lũy như Gemini),
   nếu không thì nối thêm (kiểu gia số như OpenAI/Anthropic); Khối trùng lặp giống hệt xem như không có phần mới, bỏ qua.
   @param {object} entry @param {string} text @param {boolean} isReasoning */
function appendReplyText(entry, text, isReasoning) {
    if (!text) return;
    const key = isReasoning ? 'reasoning' : 'content';
    const acc = entry[key] || '';
    if (!acc) {
        entry[key] = text; /* Đoạn đầu ghi trực tiếp */
        return;
    }
    if (text.startsWith(acc) && text.length > acc.length) {
        entry[key] = text; /* Kiểu tích lũy (Gemini...): Thay thế toàn bộ */
    } else if (!text.startsWith(acc)) {
        entry[key] = acc + text; /* Kiểu gia số: Nối thêm */
    }
    /* text === acc (trùng lặp độ dài bằng nhau) xem như không có phần mới, bỏ qua */
}

/* Trích xuất gia số văn bản chính/suy nghĩ từ một JSON chunk (tương thích với OpenAI delta/message/text + reasoning_content,
   mảng Anthropic delta.text/delta.thinking/content, Gemini candidates[0].content.parts)
   @param {object} chunk @param {number} captureId */
function extractReplyFromChunk(chunk, captureId) {
    const entry = pendingReplies.get(captureId);
    if (!entry || entry.finished) return;
    if (!chunk || typeof chunk !== 'object') return;

    /* Tương thích OpenAI (delta stream / message trọn gói / text) */
    if (Array.isArray(chunk.choices) && chunk.choices[0]) {
        const c0 = chunk.choices[0];
        const delta = c0 && typeof c0.delta === 'object' ? c0.delta : null;
        if (delta) {
            if (typeof delta.reasoning_content === 'string') appendReplyText(entry, delta.reasoning_content, true);
            if (typeof delta.reasoning === 'string') appendReplyText(entry, delta.reasoning, true);
            if (typeof delta.content === 'string') appendReplyText(entry, delta.content, false);
            if (typeof delta.text === 'string') appendReplyText(entry, delta.text, false);
        }
        const msg = c0 && typeof c0.message === 'object' ? c0.message : null;
        if (msg) {
            if (typeof msg.reasoning_content === 'string') appendReplyText(entry, msg.reasoning_content, true);
            if (typeof msg.reasoning === 'string') appendReplyText(entry, msg.reasoning, true);
            if (typeof msg.content === 'string') appendReplyText(entry, msg.content, false);
        }
        if (typeof c0.text === 'string') appendReplyText(entry, c0.text, false);
        return;
    }

    /* Stream Anthropic (delta.thinking / delta.text) */
    if (chunk.delta && typeof chunk.delta === 'object') {
        if (typeof chunk.delta.thinking === 'string') appendReplyText(entry, chunk.delta.thinking, true);
        if (typeof chunk.delta.text === 'string') appendReplyText(entry, chunk.delta.text, false);
        return;
    }

    /* Gemini (candidates[0].content.parts) */
    if (Array.isArray(chunk.candidates) && chunk.candidates[0]) {
        const parts = chunk.candidates[0].content && chunk.candidates[0].content.parts;
        if (Array.isArray(parts)) {
            for (const part of parts) {
                if (part && typeof part.text === 'string' && part.text.length > 0) {
                    appendReplyText(entry, part.text, !!part.thought);
                }
            }
        }
        return;
    }

    /* Non-stream Anthropic (mảng content) */
    if (Array.isArray(chunk.content)) {
        for (const part of chunk.content) {
            if (!part || typeof part !== 'object') continue;
            if (part.type === 'text' && typeof part.text === 'string') appendReplyText(entry, part.text, false);
            if (part.type === 'thinking' && typeof part.thinking === 'string') appendReplyText(entry, part.thinking, true);
        }
    }
}

/* Phân tích một đoạn văn bản SSE (các event cách nhau bằng dòng trống), trích xuất gia số từng event, tương thích với dòng data: và [DONE]
   @param {string} text @param {number} captureId */
function processSseText(text, captureId) {
    if (!text) return;
    const events = text.split(/\r\n\r\n|\r\r|\n\n/);
    for (const evt of events) {
        if (!evt || !evt.trim()) continue;
        const dataLines = [];
        for (const line of evt.split(/\r\n|\r|\n/)) {
            if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).replace(/^ /, ''));
            }
        }
        const data = dataLines.join('\n').trim();
        if (!data || data === '[DONE]') continue;
        let chunk = null;
        try { chunk = JSON.parse(data); } catch (e) { continue; }
        if (chunk && chunk.error) {
            finalizeReply(captureId, 'fail', 'api error: ' + (chunk.error.message || chunk.error.code || 'unknown'));
            return;
        }
        extractReplyFromChunk(chunk, captureId);
    }
}

/* Đọc thống nhất body response theo gia số (không phụ thuộc Content-Type): Khi xuất hiện dòng data: thì phân tích theo SSE (tương thích proxy đánh dấu stream response thành
   application/json); Nếu không thì đợi stream kết thúc sẽ phân tích toàn bộ JSON/văn bản. Khi bị hủy/lỗi thì SSE giữ lại nội dung đã nhận,
   JSON không có nội dung dùng được thì ghi lại reply rỗng. Đọc clone, không ảnh hưởng đến ST và các plugin khác.
   @param {Response} clone @param {number} captureId @param {string|null} hintMode */
function readResponseBody(clone, captureId, hintMode = null) {
    if (!clone || !clone.body || typeof clone.body.getReader !== 'function') {
        finalizeReply(captureId, 'fail', 'empty body');
        return;
    }
    const reader = clone.body.getReader();
    const entry = pendingReplies.get(captureId);
    if (entry) entry.reader = reader;
    const decoder = new TextDecoder();
    let buffer = '';
    let mode = hintMode; /* null=chưa xác định, 'sse', 'json' */

    function finalizeDone() {
        const cur = pendingReplies.get(captureId);
        if (!cur || cur.finished) return;
        if (mode === 'sse') {
            /* Xử lý event cuối cùng không kết thúc bằng dòng trống */
            if (buffer.trim()) processSseText(buffer, captureId);
        } else {
            const text = buffer.trim();
            if (text) {
                let data = null;
                try { data = JSON.parse(text); } catch (e) { data = null; }
                if (data) {
                    if (data.error) {
                        finalizeReply(captureId, 'fail', 'api error: ' + (data.error.message || data.error.code || 'unknown'));
                        return;
                    }
                    extractReplyFromChunk(data, captureId);
                } else if (!/^data:|\ndata:/.test(text)) {
                    /* Hoàn thành văn bản thuần...: Toàn đoạn được xem là văn bản chính */
                    appendReplyText(cur, text, false);
                }
            }
        }
        finalizeReply(captureId, 'succeed', '');
    }

    function pump() {
        reader.read().then(({ done, value }) => {
            const cur = pendingReplies.get(captureId);
            if (!cur || cur.finished) return;
            if (done) {
                finalizeDone();
                return;
            }
            buffer += decoder.decode(value, { stream: true });
            /* Khi chế độ chưa xác định thì nhận diện theo nội dung: Xuất hiện dòng data: là xem như SSE */
            if (!mode && /^data:|\ndata:/.test(buffer)) {
                mode = 'sse';
            }
            if (mode === 'sse') {
                const parts = buffer.split(/\r\n\r\n|\r\r|\n\n/);
                buffer = parts.pop();
                processSseText(parts.join('\n\n'), captureId);
                /* Đường dẫn của chunk lỗi... có thể đã finalize, lúc này dừng việc tiếp tục đọc */
                const after = pendingReplies.get(captureId);
                if (after && !after.finished) pump();
            } else {
                pump();
            }
        }).catch(() => {
            /* Stream bị hủy/lỗi: Chế độ SSE giữ lại nội dung đã phân tích (bao gồm cả suy nghĩ đang dở dang); Chế độ JSON vẫn chưa có nội dung khả dụng */
            const cur = pendingReplies.get(captureId);
            if (!cur || cur.finished) return;
            if (mode === 'sse' && buffer.trim()) {
                processSseText(buffer, captureId);
            }
            finalizeReply(captureId, 'fail', 'stream aborted');
        });
    }
    pump();
}

/* Trích xuất thông báo lỗi khả dụng đầu tiên từ object lỗi JSON (duyệt qua các trường quy ước API phổ biến).
   @param {object} data JSON response lỗi đã phân tích
   @returns {string} Văn bản thông báo trích xuất được, nếu không có trả về chuỗi rỗng */
function extractErrorMessage(data) {
    if (!data || typeof data !== 'object') return '';
    const candidates = [];
    if (data.error && typeof data.error === 'object') {
        if (typeof data.error.message === 'string') candidates.push(data.error.message);
        if (typeof data.error.code === 'string') candidates.push(data.error.code);
    }
    if (typeof data.error === 'string') candidates.push(data.error);
    if (typeof data.message === 'string') candidates.push(data.message);
    if (typeof data.detail === 'string') candidates.push(data.detail);
    return candidates.find(s => s && s.trim()) || '';
}

/* Đọc văn bản chính của response không phải 2xx để trích xuất báo lỗi thực (body response chỉ đọc được 1 lần, bắt buộc đọc clone); Bất kỳ thất bại nào cũng lùi về baseReason
   @param {Response} response @param {number} captureId @param {string} baseReason */
function readErrorResponseBody(response, captureId, baseReason) {
    let clone = null;
    try {
        /* clone bắt buộc phải gọi đồng bộ (trước khi response gốc bị ST... tiêu thụ), nếu không body đã sử dụng sẽ ném lỗi */
        clone = response.clone();
    } catch (e) {
        finalizeReply(captureId, 'fail', baseReason);
        return;
    }
    if (!clone || !clone.body || typeof clone.body.getReader !== 'function') {
        finalizeReply(captureId, 'fail', baseReason);
        return;
    }
    const reader = clone.body.getReader();
    const entry = pendingReplies.get(captureId);
    if (entry) entry.reader = reader; /* Giao cho abortPendingReply thống nhất giải phóng */
    const decoder = new TextDecoder();
    let text = '';

    function done() {
        let reason = baseReason;
        const trimmed = text.trim();
        if (trimmed) {
            let data = null;
            try { data = JSON.parse(trimmed); } catch (e) { data = null; }
            const message = data ? extractErrorMessage(data) : '';
            if (message) reason = `${baseReason}: ${message}`;
        }
        finalizeReply(captureId, 'fail', reason);
    }

    function pump() {
        reader.read().then(({ done: isDone, value }) => {
            const cur = pendingReplies.get(captureId);
            if (!cur || cur.finished) return;
            if (isDone) {
                done();
                return;
            }
            text += decoder.decode(value, { stream: true });
            if (text.length >= MAX_ERROR_BODY_BYTES) {
                done(); /* Vượt giới hạn trên: Dùng nội dung đã đọc để trích xuất, không tiếp tục đọc */
                return;
            }
            pump();
        }).catch(() => {
            finalizeReply(captureId, 'fail', baseReason);
        });
    }
    pump();
}

/* Gắn theo dõi reply cho request đã bắt: Thêm xử lý lên fetchPromise, không sửa đổi Promise đó, đọc clone không ảnh hưởng response gốc
   @param {Promise<Response>} fetchPromise @param {string} requestUrl @param {number} captureId */
function captureResponseForRequest(fetchPromise, requestUrl, captureId) {
    if (!isPotentialGenerationUrl(requestUrl)) return;

    /* Khu vực chờ đầy: Loại bỏ theo dõi cũ nhất (giải phóng reader của nó), tránh đầy bộ nhớ */
    if (pendingReplies.size >= MAX_PENDING_REPLIES) {
        const oldestKey = pendingReplies.keys().next().value;
        if (oldestKey != null) abortPendingReply(oldestKey);
    }

    const entry = {
        startTime: Date.now(),
        timer: null,
        expireTimer: null,
        status: null,
        content: '',
        reasoning: '',
        failReason: '',
        time: '',
        reader: null,
        finished: false,
    };
    pendingReplies.set(captureId, entry);

    /* Dự phòng timeout: 5 phút chưa kết thúc → Dừng theo dõi và đánh dấu Timeout (giữ lại nội dung đã tích lũy) */
    entry.timer = setTimeout(() => {
        finalizeReply(captureId, 'timeout', 'timeout');
    }, getReplyTimeoutMs());

    fetchPromise.then(response => {
        try {
            if (!response || !response.ok) {
                if (response) {
                    /* Không phải 2xx: Cố gắng đọc văn bản chính của lỗi để lấy báo lỗi thực, không đọc được thì fallback về mã trạng thái HTTP */
                    readErrorResponseBody(response, captureId, `HTTP ${response.status}`);
                } else {
                    finalizeReply(captureId, 'fail', 'no response');
                }
                return;
            }
            /* clone bắt buộc phải gọi đồng bộ, nếu không body đã sử dụng sẽ ném lỗi */
            const clone = response.clone();
            const contentType = (response.headers.get('content-type') || '').toLowerCase();
            /* Content-Type chỉ để tham khảo: Thống nhất đọc theo gia số, dựa vào văn bản chính để nhận diện SSE, tránh việc "proxy đánh dấu stream response
               thành application/json" bị gián đoạn làm mất nội dung đã nhận */
            readResponseBody(clone, captureId, contentType.includes('text/event-stream') ? 'sse' : null);
        } catch (e) {
            finalizeReply(captureId, 'fail', 'response clone failed');
        }
    }, err => {
        /* Lỗi mạng / Người dùng hủy bỏ (AbortError) */
        const reason = (err && err.name === 'AbortError') ? 'aborted' : 'network error';
        finalizeReply(captureId, 'fail', reason);
    });
}

/* Trạng thái cuối của theo dõi reply: Đánh dấu hoàn thành, giải phóng reader, gắn vào bản ghi đã có; Nếu bản ghi chưa được tạo thì giữ trong khu chờ (giới hạn 60s)
   @param {number} captureId @param {string} status @param {string} failReason */
function finalizeReply(captureId, status, failReason) {
    const entry = pendingReplies.get(captureId);
    if (!entry || entry.finished) return;
    entry.finished = true;
    clearTimeout(entry.timer);
    if (entry.reader) {
        try { Promise.resolve(entry.reader.cancel()).catch(() => { /* ignore */ }); } catch (e) { /* ignore */ }
    }

    /* Kết thúc bình thường nhưng văn bản rỗng/quá ngắn → Xem như thất bại (suy nghĩ không tính vào phán đoán độ dài) */
    if (status === 'succeed') {
        const content = (entry.content || '').trim();
        if (!content) {
            status = 'fail';
            failReason = 'empty reply';
        } else if (content.length <= 10) {
            status = 'fail';
            failReason = 'reply too short';
        }
    }

    entry.status = status;
    entry.failReason = failReason || '';
    const now = new Date();
    entry.time = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const record = findRecordByCaptureId(captureId);
    if (record) {
        attachReplyToRecord(record, entry);
        pendingReplies.delete(captureId);
    } else {
        /* Bản ghi chưa tạo xong: Giữ lại trong thời gian ngắn để addRecord gắn vào, hết giờ chưa gắn thì bỏ đi */
        entry.expireTimer = setTimeout(() => {
            pendingReplies.delete(captureId);
        }, PENDING_REPLY_KEEP_MS);
    }
}

/* Hủy theo dõi một reply đang chạy: Xóa timer, giải phóng reader, xóa hàng chờ (không chèn bất kỳ cờ nào).
   @param {number} captureId */
function abortPendingReply(captureId) {
    const entry = pendingReplies.get(captureId);
    if (!entry) return;
    clearTimeout(entry.timer);
    clearTimeout(entry.expireTimer);
    if (entry.reader) {
        try { Promise.resolve(entry.reader.cancel()).catch(() => { /* ignore */ }); } catch (e) { /* ignore */ }
    }
    pendingReplies.delete(captureId);
}

/* Lấy ra và xóa một mục chờ của reply đã đến trạng thái cuối (chỉ trả về khi finished, tránh việc gắn slot đang chờ thành reply rỗng)
   @param {number} captureId @returns {object|null} */
function consumePendingReply(captureId) {
    const entry = pendingReplies.get(captureId);
    if (!entry || !entry.finished) return null;
    clearTimeout(entry.timer);
    clearTimeout(entry.expireTimer);
    pendingReplies.delete(captureId);
    return entry;
}

/* Tìm bản ghi theo captureId: Quét qua cả danh sách bình thường và hàng đợi tạm thời của hướng dẫn.
   @param {number} captureId
   @returns {object|null} */
function findRecordByCaptureId(captureId) {
    const found = records.find(r => r.id === captureId);
    if (found) return found;
    return tourPendingRecords.find(r => r.id === captureId) || null;
}

/* Gắn reply đã đến trạng thái cuối vào bản ghi (record.reply) và tính token bất đồng bộ; Chỉ thêm vào sub-message Response, không dựng lại danh sách,
   vị trí đọc và trạng thái tìm kiếm không bị ảnh hưởng.
   @param {object} record @param {object} replyData @param {boolean} [skipRender=false] */
function attachReplyToRecord(record, replyData, skipRender = false) {
    if (!record || record.reply) return;
    /* Khi Fail/Timeout sẽ ghi lý do thất bại vào nội dung reply: Cách một dòng ở cuối nội dung đã có (như nửa đoạn reply được giữ lại khi hủy) rồi nối thêm; */
    /* Nội dung rỗng thì ghi trực tiếp lý do. Thiết bị di động không có hover, làm vậy thì mở ra/xem trước/sao chép/tìm kiếm đều có thể thấy lỗi trực tiếp. */
    let content = buildReplyContent(replyData);
    if ((replyData.status === 'fail' || replyData.status === 'timeout') && replyData.failReason) {
        content = content ? `${content}\n\n${replyData.failReason}` : replyData.failReason;
    }
    record.reply = {
        role: 'response',
        content,
        tokens: 0,
        tokenPrecise: false,
        collapsed: true,
        status: replyData.status,
        failReason: replyData.failReason || '',
        time: replyData.time || '',
    };
    /* Tính token chính xác của reply bất đồng bộ (sau khi ghi kết quả lại chỉ cập nhật số trên thanh tiêu đề reply, không dựng lại danh sách) */
    computeTokensForMessages([record.reply], record.modelName || '').then(() => {
        updateReplyTokenInDom(record);
    }).catch(() => { /* 静默 */ });
    if (!skipRender) appendReplyToRecordDom(record);
    /* Văn bản chính response đã chốt: Đăng ký thành "chờ sửa chữa" (đợi sau khi sự kiện tin nhắn ST định hình vào tầng sẽ thực hiện một lần nâng cấp giới hạn "plugin → nguyên bản") */
    queueSourceCorrection(record);
}

/* Reply đến: Chỉ gắn thêm sub-message Response vào cuối bản ghi đó và cập nhật trạng thái thanh tiêu đề, không dựng lại danh sách (vị trí đọc,
   cuộn vùng nội dung, trạng thái tìm kiếm giữ nguyên); Khi bảng điều khiển ẩn/bản ghi không ở trong DOM/trong thời gian hướng dẫn thì chỉ đặt dirty flag.
   @param {object} record */
function appendReplyToRecordDom(record) {
    panelContentDirty = true;
    if (!panelEl || !isPanelVisible || tourActive) return;
    const listEl = panelEl.querySelector('#rlog-list');
    const recordEl = listEl ? listEl.querySelector(`.rlog-record[data-record-index="${records.indexOf(record)}"]`) : null;
    const bodyEl = recordEl ? recordEl.querySelector('.rlog-record-body') : null;
    if (!recordEl || !bodyEl) return;

    const idx = Number(recordEl.dataset.recordIndex);
    const replyMsgIdx = record.messages.length;
    /* Khi sub-message reply bị ẩn bởi bộ lọc nhân vật thì không thêm DOM của sub-message (Dữ liệu đã được ghi vào record.reply,
       sau khi khôi phục hiển thị sẽ được lần render tiếp theo đưa ra một cách tự nhiên); Cờ đánh dấu trạng thái trên thanh tiêu đề vẫn cập nhật bình thường */
    if (isMessageVisible(record.reply)) {
        /* Idempotent: Đã gắn rồi thì bỏ qua (tránh chèn 2 dòng khi bị trigger lặp lại);
           Văn bản chính của bản ghi đang thu gọn chưa được tạo, lúc này không thêm DOM sub-message (dữ liệu reply đã nằm trong record.reply,
           lần mở rộng tiếp theo sẽ do ensureRecordBody() mang ra cùng lúc), chỉ cập nhật thẻ trạng thái thanh tiêu đề */
        if (bodyEl.dataset.bodyBuilt === '1' && !bodyEl.querySelector(`.rmsg-item[data-record="${idx}"][data-msg="${replyMsgIdx}"]`)) {
            bodyEl.insertAdjacentHTML('beforeend', buildMessageHtml(record.reply, idx, replyMsgIdx));
            const replyItemEl = bodyEl.querySelector(`.rmsg-item[data-record="${idx}"][data-msg="${replyMsgIdx}"]`);
            if (replyItemEl) bindMsgItemEvents(replyItemEl);
        }
    }

    /* Cờ trạng thái reply trên thanh tiêu đề (chỉ hiển thị khi thu gọn, khi mở rộng sẽ bị CSS ẩn đi): Không tồn tại thì bổ sung, tồn tại thì làm mới nội dung */
    let statusEl = recordEl.querySelector('.rlog-reply-status');
    if (!statusEl) {
        const toggleIconEl = recordEl.querySelector('.rlog-toggle-icon');
        if (toggleIconEl && toggleIconEl.parentNode) {
            statusEl = document.createElement('span');
            toggleIconEl.parentNode.insertBefore(statusEl, toggleIconEl);
        }
    }
    if (statusEl) {
        statusEl.className = `rlog-reply-status rlog-reply-status-${record.reply.status}`;
        statusEl.title = getReplyStatusTitle(record);
        statusEl.textContent = getReplyStatusLabel(record.reply.status);
    }
}

/* Sau khi tính xong token reply, chỉ cập nhật số token trên thanh tiêu đề của reply, không dựng lại danh sách.
   Khi bản ghi không ở trong DOM (đóng bảng điều khiển/đang hướng dẫn), lần render tiếp theo sẽ tự nhiên mang theo con số đúng.
   @param {object} record Bản ghi mục tiêu */
function updateReplyTokenInDom(record) {
    panelContentDirty = true;
    if (!panelEl || !isPanelVisible) return;
    const idx = records.indexOf(record);
    if (idx < 0) return;
    const listEl = panelEl.querySelector('#rlog-list');
    if (!listEl) return;
    const replyItemEl = listEl.querySelector(`.rmsg-item[data-record="${idx}"][data-msg="${record.messages.length}"]`);
    const tokensEl = replyItemEl ? replyItemEl.querySelector('.rmsg-tokens') : null;
    if (tokensEl) {
        const reply = record.reply;
        tokensEl.textContent = `${reply.tokenPrecise ? '' : '~'}${reply.tokens} tokens`;
    }
}

/* ── Quản lý dữ liệu ─────────────────────────── */

/* Dấu vân tay chống trùng lặp để tạo danh sách tin nhắn: Nối role + content của mỗi tin nhắn, dùng để phán đoán xem hai bản ghi có nội dung giống nhau hay không */
function computeMessagesFingerprint(messages) {
    if (!messages || messages.length === 0) return '';
    /* Chỉ dùng 50 tin nhắn đầu + 500 ký tự đầu của mỗi tin nhắn để làm dấu vân tay, tránh việc tin nhắn quá lớn làm chậm hiệu suất */
    return messages.slice(0, 50).map(m => {
        const role = m.role || '';
        const content = typeof m.content === 'string' ? m.content.slice(0, 500) : '';
        return `${role}:${content}`;
    }).join('|');
}

/* Danh sách bản ghi bình thường hiện tại (chưa ghim) */
function getNormalRecords() {
    return records.filter(r => !r.pinned);
}

/* Cắt bỏ các bản ghi bình thường cũ nhất vượt quá giới hạn (tìm từ cuối mảng lên và xóa, giữ nguyên thứ tự ban đầu của records).
   Bản ghi đã ghim được bỏ qua, không tính vào giới hạn (do đó records.length có thể lớn hơn MAX_RECORDS); nếu bản ghi bị xóa có reply đang chờ thì hủy theo dõi. */
function pruneNormalRecords() {
    let overCount = getNormalRecords().length - MAX_RECORDS;
    if (overCount <= 0) return;
    for (let i = records.length - 1; i >= 0 && overCount > 0; i--) {
        const rec = records[i];
        if (rec.pinned) continue;
        records.splice(i, 1);
        if (rec.id != null) abortPendingReply(rec.id);
        overCount--;
    }
}

function addRecord(characterName, messages, source, modelName, rawBody, captureId, options = {}) {
    if (!masterEnabled) return;
    if (!characterName || !messages || messages.length === 0) return;

    /* Chống trùng lặp: Nếu nội dung messages giống với bản ghi trước đó và trong vòng 500ms, thì bỏ qua */
    const fingerprint = computeMessagesFingerprint(messages);
    const now = Date.now();
    if (fingerprint && fingerprint === lastRecordFingerprint && (now - lastRecordTime) < 500) {
        /* Request chưa tạo thành bản ghi, theo dõi reply của nó cũng bị vứt bỏ cùng, tránh tồn đọng trong khu vực chờ */
        if (captureId != null) abortPendingReply(captureId);
        return;
    }
    lastRecordFingerprint = fingerprint;
    lastRecordTime = now;

    const date = new Date();
    const ts = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;

    const record = {
        characterName,
        timestamp: ts,
        /* Phán đoán nguồn được hoàn thành lúc đánh chặn, việc tạo hồ sơ phải đợi tính toán token, giữa hai bước này trạng thái lượt hiện tại có thể đã thay đổi,
           do đó trước khi tạo hồ sơ thực hiện xác nhận cuối cùng đối với "bằng chứng vị trí" (xem finalizePositionEvidenceSource) */
        source: finalizePositionEvidenceSource(source)
            || { type: 'plugin', label: '插件', detail: SOURCE_PLUGIN_DEFAULT_DETAIL },
        modelName: modelName || '未知模型',
        messages,
        rawBody: rawBody || null,   /* Object JSON body request gốc (dùng cho định dạng gốc của "Xem toàn văn") */
        collapsed: true,
        pinned: false,                /* Cờ ghim tạm thời: Không chiếm giới hạn bản ghi bình thường, làm mới là reset */
        id: captureId != null ? captureId : null, /* Mã số bắt request, dùng để gắn reply */
        reply: null,                 /* Nội dung reply (lưu trữ độc lập, không tính vào tin nhắn request/xem toàn văn) */
    };

    /* Bản ghi mô phỏng: Không có reply thực, trực tiếp gắn thẻ trạng thái simulated trên thanh tiêu đề */
    if (options.simulated) record.simulated = true;

    /* Reply có thể đến trước khi bản ghi được tạo (lúc finalize bản ghi chưa được tạo): Chỉ gắn ngay khi reply đã đến trạng thái cuối,
       và giao cho luồng render tiếp theo của addRecord hiển thị (skipRender=true tránh render lặp lại);
       các mục đang chờ được giữ trong khu vực chờ, do finalizeReply gắn vào sau */
    if (captureId != null) {
        const replyData = consumePendingReply(captureId);
        if (replyData) attachReplyToRecord(record, replyData, true);
    }

    /* Trong thời gian hướng dẫn: Bản ghi mới chỉ lưu tạm, không thêm vào render danh sách (tránh làm gián đoạn việc định vị DOM của các bước hướng dẫn),
       sau khi hướng dẫn kết thúc sẽ do endTour gộp và khôi phục; tương tự cũng chịu ràng buộc bởi giới hạn số bản ghi tối đa */
    if (tourActive) {
        tourPendingRecords.unshift(record);
        if (tourPendingRecords.length > MAX_RECORDS) {
            const evicted = tourPendingRecords.pop();
            if (evicted && evicted.id != null) abortPendingReply(evicted.id);
        }
        return record;
    }

    /* Khi bộ lọc có hiệu lực, trước tiên phán đoán xem bản ghi mới có hiển thị không:
       Nếu không hiển thị thì giữ nguyên vị trí đọc hiện tại (không thu gọn bản ghi hiện có, không cuộn lên đầu, không nhấp nháy), chỉ đưa vào hàng đợi bình thường và làm mới bộ đếm */
    const filterActive = isFilterActive();
    const newRecordVisible = filterActive ? matchesFilter(record) : true;

    /* Khi bản ghi mới đến sẽ thu gọn tất cả bản ghi hiện có (chỉ thu gọn bản thân bản ghi, không động đến trạng thái thu gọn của các tin nhắn bên trong mỗi bản ghi);
       Bản ghi mới không bị thu gọn khi bị bộ lọc ẩn đi, tránh làm gián đoạn vị trí đang đọc */
    if (!filterActive || newRecordVisible) {
        records.forEach(r => { r.collapsed = true; });
    }

    records.unshift(record);
    pruneNormalRecords();

    panelContentDirty = true;
    if (panelEl && isPanelVisible) {
        const listEl = panelEl.querySelector('#rlog-list');
        const prevScrollTop = listEl ? listEl.scrollTop : 0;
        renderPanelContent();
        if (!isPanelCollapsed) {
            if (!filterActive || newRecordVisible) {
                /* Khi bảng điều khiển mở rộng hoàn toàn và có thể nhìn thấy: Định vị đến bản thân bản ghi mới (bản ghi ghim có thể nằm trên nó), và nhấp nháy bản ghi mới */
                const newRecordEl = getRecordElByIndex(0);
                if (newRecordEl) {
                    scrollToRecordEl(newRecordEl);
                    flashTopHint(newRecordEl);
                } else {
                    if (listEl) listEl.scrollTop = 0;
                    flashTopHint();
                }
            } else if (listEl) {
                /* Bản ghi mới bị bộ lọc ẩn đi: Giữ nguyên vị trí đọc ban đầu */
                listEl.scrollTop = prevScrollTop;
            }
        }
    }
    /* Khi bảng điều khiển không ở trạng thái "mở rộng hoàn toàn và có thể nhìn thấy" (cửa sổ thu gọn/đóng hoàn toàn), để dành đến khi khôi phục hiển thị sẽ cuộn lên đầu
       (xem togglePanelWindow / showPanel); khi bản ghi mới bị bộ lọc ẩn đi cũng không cuộn, sau khi khôi phục vẫn giữ nguyên vị trí */
    if (!(panelEl && isPanelVisible && !isPanelCollapsed) && (!filterActive || newRecordVisible)) {
        pendingScrollToTop = true;
    }

    /* Trả về object bản ghi: Bắt mô phỏng phải thực hiện tín hiệu hoàn thành ngay khoảnh khắc tạo hồ sơ; Khi bỏ qua tạo hồ sơ (chống trùng lặp / công tắc chính...) sẽ trả về undefined */
    return record;
}

function clearAllRecords() {
    /* Chỉ xóa sạch các bản ghi bình thường; Bản ghi ghim được giữ lại, và các reply chưa đến trạng thái cuối của chúng tiếp tục được theo dõi */
    records = records.filter(r => {
        if (r.pinned) return true;
        if (r.id != null) abortPendingReply(r.id);
        return false;
    });
    panelContentDirty = true;
    if (panelEl && isPanelVisible) {
        renderPanelContent();
    }
}

/* ── Cài đặt lưu trữ vĩnh viễn ────────────────────────── */

function setMasterEnabled(enabled) {
    masterEnabled = enabled;
    try {
        localStorage.setItem(STORAGE_MASTER_KEY, enabled ? '1' : '0');
    } catch (e) { /* ignore */ }
    updateMasterToggleUI();
    
    if (panelEl && isPanelVisible) {
        /* Nếu danh sách hiện tại trống và bảng điều khiển có thể nhìn thấy, lập tức làm mới văn bản nhắc nhở trống */
        if (records.length === 0) {
            panelContentDirty = true;
            renderPanelContent();
        }
    }
    
    /* hook luôn được cài đặt (bên trong dựa vào masterEnabled để phán đoán xem có ghi lại hay không), không tháo lắp theo công tắc, tránh phá hỏng chuỗi wrapper của các plugin khác */
}

function updateMasterToggleUI() {
    if (!panelEl) return;
    
    const btn = panelEl.querySelector('#rlog-master-toggle');
    if (btn) {
        if (masterEnabled) {
            btn.classList.add('rlog-master-on');
            btn.classList.remove('rlog-master-off');
            btn.style.color = '#4caf50'; /* Màu biểu tượng khi công tắc chính bật (inline ghi đè .rlog-master-on của CSS) */
            btn.querySelector('i').className = 'fa-solid fa-power-off';
            btn.title = '插件开启-自动记录中';
        } else {
            btn.classList.add('rlog-master-off');
            btn.classList.remove('rlog-master-on');
            btn.style.color = '#999'; /* Màu biểu tượng khi công tắc chính tắt (inline ghi đè .rlog-master-off của CSS) */
            btn.querySelector('i').className = 'fa-solid fa-power-off';
            btn.title = '插件关闭-已停止记录';
        }
    }

    if (!masterEnabled) {
        panelEl.classList.add('rlog-disabled');
    } else {
        panelEl.classList.remove('rlog-disabled');
    }
}

/* Tải trạng thái công tắc xem trước nội dung từ localStorage (mặc định đóng)
   @returns {boolean} Có bật xem trước nội dung hay không */
function loadContentPreview() {
    try { return localStorage.getItem(STORAGE_PREVIEW_KEY) === '1'; } catch (e) { return false; }
}

function saveContentPreview(enabled) {
    try { localStorage.setItem(STORAGE_PREVIEW_KEY, enabled ? '1' : '0'); } catch (e) { /* ignore */ }
}

function toggleContentPreview() {
    contentPreviewEnabled = !contentPreviewEnabled;
    saveContentPreview(contentPreviewEnabled);
    updatePreviewToggleUI();
    /* Công tắc xem trước ảnh hưởng đến nội dung render của mỗi tin nhắn, cần phải dựng lại DOM */
    panelContentDirty = true;
    if (panelEl && isPanelVisible) {
        renderPanelContent();
    }
}

/* Cập nhật giao diện nút công tắc xem trước trên thanh tiêu đề (bật fa-eye / tắt fa-eye-slash) */
function updatePreviewToggleUI() {
    const toggleEl = panelEl ? panelEl.querySelector('#rlog-preview-btn') : null;
    if (!toggleEl) return;
    const iconEl = toggleEl.querySelector('i');
    if (contentPreviewEnabled) {
        toggleEl.classList.add('rlog-preview-on');
        toggleEl.classList.remove('rlog-preview-off');
        if (iconEl) iconEl.className = 'fa-solid fa-eye';
        toggleEl.title = '内容预览-已开启';
    } else {
        toggleEl.classList.remove('rlog-preview-on');
        toggleEl.classList.add('rlog-preview-off');
        if (iconEl) iconEl.className = 'fa-solid fa-eye-slash';
        toggleEl.title = '内容预览-已关闭';
    }
}

/* ── Cài đặt tùy chọn (Lưu trữ vĩnh viễn + Trạng thái icon) ─────────────── */

/* Ánh xạ Key cài đặt tùy chọn → Key lưu trữ localStorage */
const PREF_STORAGE_KEYS = {
    badgeDefault: STORAGE_PREF_BADGE_DEFAULT,
    followStTheme: STORAGE_PREF_FOLLOW_ST_THEME,
    mobileFull: STORAGE_PREF_MOBILE_FULL,
    clickOutside: STORAGE_PREF_CLICK_OUTSIDE,
    filterPersist: STORAGE_PREF_FILTER_PERSIST,
    minimal: STORAGE_PREF_MINIMAL,
};

/* Tải toàn bộ cài đặt tùy chọn từ localStorage (mặc định tắt hết; giá trị lưu !== '1' đều được xem là tắt) */
function loadPreferences() {
    for (const key of Object.keys(preferences)) {
        try { preferences[key] = localStorage.getItem(PREF_STORAGE_KEYS[key]) === '1'; }
        catch (e) { preferences[key] = false; }
    }
}

/* Lưu trữ vĩnh viễn một tùy chọn đơn lẻ vào localStorage (cùng cơ chế với các công tắc hiện tại: '1'/'0') */
function savePreference(key, value) {
    try { localStorage.setItem(PREF_STORAGE_KEYS[key], value ? '1' : '0'); } catch (e) { /* ignore */ }
}

/* Có ít nhất một tùy chọn đang được kích hoạt hay không (dùng để chuyển đổi icon lối vào "Cài đặt tùy chọn" fa-heart ↔ fa-heart-circle-check) */
function hasActivePreference() {
    return preferences.badgeDefault || preferences.followStTheme || preferences.mobileFull
        || preferences.clickOutside || preferences.filterPersist || preferences.minimal;
}

/* Cập nhật icon lối vào "Cài đặt tùy chọn": Bất kỳ tùy chọn nào kích hoạt → fa-heart-circle-check, tắt hết → fa-heart */
function updatePrefButtonIcon() {
    if (!prefBtnEl) return;
    const iconEl = prefBtnEl.querySelector('i');
    if (!iconEl) return;
    if (hasActivePreference()) {
        iconEl.className = 'fa-solid fa-heart-circle-check';
    } else {
        iconEl.className = 'fa-solid fa-heart';
    }
}

/* Đồng bộ trạng thái trực quan của tất cả Toggle trong lớp phủ tùy chọn (bật/tắt + role/aria-checked) */
function syncPrefToggleUI() {
    if (!prefOverlayEl) return;
    const toggles = prefOverlayEl.querySelectorAll('.rlog-toggle');
    toggles.forEach((toggle) => {
        const key = toggle.getAttribute('data-pref-key');
        const on = key ? !!preferences[key] : false;
        toggle.classList.toggle('rlog-toggle-on', on);
        toggle.setAttribute('aria-checked', on ? 'true' : 'false');
    });
}

/* Thiết lập một tùy chọn nào đó: Cập nhật trạng thái + Lưu trữ vĩnh viễn + Làm mới trạng thái icon và trực quan của công tắc */
function setPreference(key, value) {
    if (!(key in preferences)) return;
    preferences[key] = !!value;
    savePreference(key, preferences[key]);
    updatePrefButtonIcon();
    syncPrefToggleUI();
    /* Hành vi tức thời của công tắc tùy chọn: Đa số các công tắc chỉ được logic tương ứng đọc cờ, một vài công tắc cần có hiệu lực ngay sẽ được xử lý theo key */
    if (key === 'mobileFull') updateMobileFullscreenClass();
    if (key === 'filterPersist' && preferences.filterPersist) saveFilterState();
    if (key === 'minimal') updateMinimalClass();
    if (key === 'followStTheme') setPreferenceFollowStThemeBehavior();
    if (key === 'badgeDefault') setPreferenceBadgeDefaultBehavior();
}

/* Hành vi tức thời sau khi chuyển đổi "Chế độ ngày đêm theo theme ST": Bật → Gắn lắng nghe theme ST và đồng bộ ngay lập tức (khi bảng điều khiển đã mở sẽ theo
   hoạt ảnh chuyển ngày/đêm hiện có); Tắt → Ghi theme hiện tại xuống đĩa một lần (ghi nhớ nó), từ đó về sau thay đổi của ST không còn ảnh hưởng đến bảng điều khiển. */
function setPreferenceFollowStThemeBehavior() {
    if (preferences.followStTheme) {
        initPanelThemeFollow(true);
    } else {
        saveTheme(isLightTheme);
    }
}

/* Áp dụng hành vi tức thời sau khi chuyển đổi tùy chọn "Lối vào floating badge mặc định" (Xử lý ranh giới khi bật/tắt).
   - Bật: Khi bảng điều khiển ẩn sẽ hiển thị floating badge ngay lập tức (badgePos rỗng thì dùng vị trí mặc định ở góc trên bên phải).
   - Tắt: Nếu floating badge hiện tại hiển thị do "thu gọn" (isPanelCollapsed) thì giữ lại; nếu không thì ẩn. */
function setPreferenceBadgeDefaultBehavior() {
    if (!badgeEl) return;
    if (preferences.badgeDefault) {
        if (!isPanelVisible) {
            if (!badgePos) badgePos = getDefaultBadgePos();
            else badgePos = clampBadgeToViewport(badgePos.left, badgePos.top);
            badgeEl.style.left = badgePos.left + 'px';
            badgeEl.style.top = badgePos.top + 'px';
            setBadgeActive(true);
        }
    } else {
        if (!isPanelCollapsed) setBadgeActive(false);
    }
}

/* Phán đoán xem "Toàn màn hình trên di động" hiện tại có nên có hiệu lực hay không: Tùy chọn bật + viewport di động (breakpoint duy nhất 768px).
   Desktop do bị breakpoint cách ly, mục này luôn không có hiệu lực, không ảnh hưởng đến logic khác. */
function isMobileFullActive() {
    return preferences.mobileFull && window.matchMedia('(max-width: 768px)').matches;
}

/* Áp dụng/Hoàn tác "Toàn màn hình trên di động": Thêm/bỏ class .rlog-mobile-fullscreen cho bảng điều khiển, style do khu vực thích ứng CSS di động đảm nhận.
   Chuyển đổi tùy chọn, mở bảng điều khiển, khởi tạo sẽ gọi mỗi lúc một lần, đảm bảo vị trí/kích thước cửa sổ bảng điều khiển luôn đồng nhất với tùy chọn. */
function updateMobileFullscreenClass() {
    if (!panelEl) return;
    const active = isMobileFullActive();
    const changed = panelEl.classList.contains('rlog-mobile-fullscreen') !== active;
    panelEl.classList.toggle('rlog-mobile-fullscreen', active);
    /* Kích thước bảng điều khiển thay đổi → Chiều rộng ngắt dòng văn bản chính có thể thay đổi: Chạy bảo trì băng thông một lần (Một khi chiều rộng thay đổi nó sẽ khôi phục toàn bộ trước rồi mới gỡ lại) */
    if (changed) scheduleBodyBandPass(panelEl.querySelector('#rlog-list'));
}

/* Áp dụng/Hoàn tác "Chế độ tối giản": Thêm class .rlog-minimal vào shadow host (chứ không phải bảng điều khiển),
   phối hợp với style `:host(.rlog-minimal)` trong shadow để tắt toàn bộ transition/animation cùng một lúc (bao gồm cả popup cùng cấp với bảng điều khiển).
   Chuyển đổi tùy chọn, lúc khởi tạo sẽ gọi mỗi lúc một lần. */
function updateMinimalClass() {
    if (!shadowHostEl) return;
    shadowHostEl.classList.toggle('rlog-minimal', !!preferences.minimal);
}

/* Mở lớp phủ cài đặt tùy chọn:
   Trước tiên thu gọn ngăn kéo "Thêm", sau đó hiển thị lớp phủ che (bảng cài đặt hiển thị ở giữa). */
function openPrefPanel() {
    if (!prefOverlayEl) return;
    closeMoreDrawer();
    syncPrefToggleUI();
    prefOverlayEl.classList.add('rlog-pref-open');
    /* Đợi một frame để lớp che hiển thị, đo lường hoàn tất, rồi mới cập nhật mũi tên gợi ý cuộn */
    requestAnimationFrame(() => updatePrefScrollArrows());
}

/* Đóng lớp phủ cài đặt tùy chọn (cách đóng duy nhất là dấu × ở góc trên bên phải).
   Click vào lớp che không kích hoạt đóng; tùy chọn "Click ra ngoài bảng điều khiển để đóng" nhắm vào toàn bộ bảng điều khiển chính của plugin, không liên quan đến lớp phủ. */
function closePrefPanel() {
    if (!prefOverlayEl) return;
    prefOverlayEl.classList.remove('rlog-pref-open');
}

/* Cập nhật mũi tên gợi ý cuộn của danh sách tùy chọn: Chỉ khi nội dung thật sự cần cuộn mới hiển thị mũi tên hướng tương ứng, chỉ để gợi ý, không tham gia tương tác
   (phụ thuộc vào sự kiện scroll được liên kết bởi buildUI và cập nhật frame đầu tiên của openPrefPanel). */
function updatePrefScrollArrows() {
    if (!prefOverlayEl) return;
    const list = prefOverlayEl.querySelector('.rlog-pref-list');
    const up = prefOverlayEl.querySelector('.rlog-pref-scroll-up');
    const down = prefOverlayEl.querySelector('.rlog-pref-scroll-down');
    if (!list || !up || !down) return;
    const canUp = list.scrollTop > 1;
    const canDown = list.scrollTop + list.clientHeight < list.scrollHeight - 1;
    up.classList.toggle('rlog-pref-arrow-visible', canUp);
    down.classList.toggle('rlog-pref-arrow-visible', canDown);
}

function loadTheme() {
    try { return localStorage.getItem(STORAGE_THEME_KEY) === 'light'; } catch (e) { return false; }
}

function saveTheme(isLight) {
    try { localStorage.setItem(STORAGE_THEME_KEY, isLight ? 'light' : 'dark'); } catch (e) { /* ignore */ }
}

function applyTheme() {
    if (!panelEl) return;
    if (isLightTheme) {
        panelEl.classList.add('rlog-light');
    } else {
        panelEl.classList.remove('rlog-light');
    }
    /* Đồng bộ class theme cho shadow host: Các popup bên trong shadow dựa vào .rlog-light trên host để chuyển đổi sáng/tối (kế thừa qua ranh giới shadow);
       Floating badge là host độc lập, phối màu theo dõi theme ST theo hướng ngược lại, được xử lý riêng bởi syncBadgeTheme(). */
    if (shadowHostEl) {
        if (isLightTheme) shadowHostEl.classList.add('rlog-light');
        else shadowHostEl.classList.remove('rlog-light');
    }
}

/* Đồng bộ theme bảng điều khiển với theme ST hiện tại (cùng hướng; floating badge lấy màu ngược lại thuộc về một logic khác). Tái sử dụng cơ chế hiện có:
   isStThemeDark() lấy tín hiệu, applyTheme() chuyển class theme của bảng điều khiển và shadow host, updateThemeButtonIcon() làm mới icon.
   @param {boolean} animate Có phát hoạt ảnh chuyển đổi khi theme thật sự thay đổi hay không (chỉ có hiệu lực khi bảng điều khiển đã mở và không phải chế độ tối giản) */
function syncPanelThemeToSt(animate) {
    if (!preferences.followStTheme) return;
    const isLight = !isStThemeDark();
    /* Trạng thái và class DOM đã nhất quán thì bỏ qua (thêm một bước kiểm tra class: sau khi host được dựng lại cũng có thể tự phục hồi) */
    if (isLight === isLightTheme && (!panelEl || panelEl.classList.contains('rlog-light') === isLight)) return;
    isLightTheme = isLight;
    /* Không ghi lưu trữ theme khi đang theo dõi: "Ghi nhớ theme hiện tại" chỉ thực thi một lần khi tắt công tắc */
    applyTheme();
    updateThemeButtonIcon();
    if (animate && isPanelVisible) playThemeSwitchAnimation();
}

/* Khởi tạo "Chế độ ngày đêm theo theme ST": Trước tiên đồng bộ tĩnh một lần, sau đó gắn lắng nghe thuộc tính style của <html> (cùng điểm gắn với floating badge,
   ST không có sự kiện thay đổi theme); Nếu điểm gắn mất hiệu lực trong tương lai thì chỉ biểu hiện là không tự động theo dõi nữa. Observer chỉ gắn một lần.
   @param {boolean} animate Đồng bộ lần đầu có cho phép phát hoạt ảnh hay không (khi khởi tạo truyền false) */
function initPanelThemeFollow(animate) {
    if (!preferences.followStTheme) return;
    syncPanelThemeToSt(animate);
    if (panelThemeObserver) return;
    panelThemeObserver = new MutationObserver(() => syncPanelThemeToSt(true));
    panelThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
}

/* Tải giới hạn số bản ghi tối đa do người dùng cài đặt từ localStorage (trả về giá trị mặc định khi không có giá trị đã lưu hoặc giá trị không hợp lệ) */
function loadMaxRecords() {
    try {
        const raw = localStorage.getItem(STORAGE_MAX_RECORDS_KEY);
        if (raw !== null && raw !== undefined) {
            const num = parseInt(raw, 10);
            /* Kiểm tra tính hợp lệ: Bắt buộc phải là số nguyên hợp lệ và nằm trong phạm vi cho phép */
            if (!isNaN(num) && num >= MIN_MAX_RECORDS && num <= MAX_MAX_RECORDS) {
                return num;
            }
        }
    } catch (e) { /* ignore */ }
    return DEFAULT_MAX_RECORDS;
}

function saveMaxRecords(value) {
    try {
        localStorage.setItem(STORAGE_MAX_RECORDS_KEY, String(value));
    } catch (e) { /* ignore */ }
}

/* Cài đặt giới hạn số bản ghi tối đa mới: Cập nhật biến toàn cục, lưu trữ vĩnh viễn, cắt bỏ các bản ghi vượt giới hạn, làm mới hiển thị thanh tiêu đề
   @param {number} newMax Giá trị giới hạn mới */
function setMaxRecords(newMax) {
    if (typeof newMax !== 'number' || isNaN(newMax) || newMax < MIN_MAX_RECORDS || newMax > MAX_MAX_RECORDS) {
        return false;
    }
    MAX_RECORDS = newMax;
    saveMaxRecords(MAX_RECORDS);

    /* Nếu số bản ghi bình thường hiện tại vượt quá giới hạn mới, cắt bỏ bản ghi bình thường cũ nhất; bản ghi ghim không bị ảnh hưởng */
    pruneNormalRecords();

    updateHeaderTitle();
    panelContentDirty = true;

    if (panelEl && isPanelVisible) {
        renderPanelContent();
    }

    return true;
}

/* ── Popup chung ─────────────────────────── */

/* Tạo và hiển thị hộp thoại cài đặt số bản ghi tối đa (kích hoạt khi click đúp vào chữ trên thanh tiêu đề) */
function showMaxRecordsDialog() {
    if (maxRecordsDialog) {
        maxRecordsDialog.remove();
    }

    /* Dùng inline style để cài đặt kích thước định vị, ngăn chặn CSS trang cha (như transform) phá vỡ hệ quy chiếu của position:fixed */
    const overlay = document.createElement('div');
    overlay.className = 'rlog-dialog-overlay';
    overlay.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        max-width: 100vw !important;
        max-height: 100vh !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 9999 !important;
    `;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeMaxRecordsDialog();
        }
    });

    const dialog = document.createElement('div');
    dialog.className = 'rlog-dialog';

    if (isLightTheme) {
        dialog.classList.add('rlog-dialog-light');
    }

        dialog.innerHTML = `
        <div class="rlog-dialog-header">
            <span>设置记录上限</span>
            <button class="rlog-dialog-close" title="关闭"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="rlog-dialog-body">
            <p class="rlog-dialog-desc">
                请输入记录上限，范围 ${MIN_MAX_RECORDS} ~ ${MAX_MAX_RECORDS}。
            </p>
            <div class="rlog-dialog-input-row">
                <input type="number" class="rlog-dialog-input" 
                       id="rlog-max-records-input" 
                       min="${MIN_MAX_RECORDS}" max="${MAX_MAX_RECORDS}" 
                       value="${MAX_RECORDS}" 
                       placeholder="${MAX_RECORDS}">
                <button class="rlog-dialog-btn rlog-dialog-btn-confirm" id="rlog-dialog-confirm">确定</button>
            </div>

        </div>
    `;

    overlay.appendChild(dialog);
    /* Popup được gắn vào shadow root (chứ không phải document.body): Đồng thời được cách ly bởi theme và tránh gắn vào bảng điều khiển có transform làm hỏng hệ quy chiếu fixed */
    if (panelShadowRoot) panelShadowRoot.appendChild(overlay);
    maxRecordsDialog = overlay;

    dialog.querySelector('.rlog-dialog-close').addEventListener('click', closeMaxRecordsDialog);

    dialog.querySelector('#rlog-dialog-confirm').addEventListener('click', () => {
        const input = dialog.querySelector('#rlog-max-records-input');
        const rawValue = parseInt(input.value, 10);
        if (!isNaN(rawValue)) {
            const clamped = Math.max(MIN_MAX_RECORDS, Math.min(MAX_MAX_RECORDS, rawValue));
            setMaxRecords(clamped);
        }
        closeMaxRecordsDialog();
    });

    dialog.querySelector('#rlog-max-records-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            dialog.querySelector('#rlog-dialog-confirm').click();
        } else if (e.key === 'Escape') {
            closeMaxRecordsDialog();
        }
    });

    setTimeout(() => {
        const input = dialog.querySelector('#rlog-max-records-input');
        if (input) {
            input.focus();
            input.select();
        }
    }, 100);
}

function closeMaxRecordsDialog() {
    if (maxRecordsDialog) {
        maxRecordsDialog.remove();
        maxRecordsDialog = null;
    }
}

/* HTMLElement|null: Phần tử DOM của popup xác nhận hiện tại */
let confirmDialogEl = null;

/* Popup xác nhận chung (Các thao tác phá hủy như xóa sạch bản ghi, xóa từng mục...)
   @param {object} options { title=确认操作, message=, confirmText=确认, cancelText=取消,
   onConfirm, onCancel } */
function showConfirmDialog(options) {
    const {
        title = '确认操作',
        message = '',
        confirmText = '确认',
        cancelText = '取消',
        onConfirm = null,
        onCancel = null,
    } = options || {};

    closeConfirmDialog();

    /* Dùng inline style để cài đặt kích thước định vị, ngăn chặn CSS trang cha (như transform) phá vỡ hệ quy chiếu của position:fixed */
    const overlay = document.createElement('div');
    overlay.className = 'rlog-dialog-overlay';
    overlay.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        max-width: 100vw !important;
        max-height: 100vh !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 9999 !important;
    `;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeConfirmDialog();
            if (typeof onCancel === 'function') onCancel();
        }
    });

    const dialog = document.createElement('div');
    dialog.className = 'rlog-dialog rlog-confirm-dialog';

    if (isLightTheme) {
        dialog.classList.add('rlog-dialog-light');
    }

    dialog.innerHTML = `
        <div class="rlog-dialog-header">
            <span>${escapeHtml(title)}</span>
            <button class="rlog-dialog-close" title="关闭"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="rlog-dialog-body">
            <div class="rlog-confirm-message">${message}</div>
            <div class="rlog-confirm-actions">
                <button class="rlog-dialog-btn rlog-dialog-btn-cancel" id="rlog-confirm-cancel">${escapeHtml(cancelText)}</button>
                <button class="rlog-dialog-btn rlog-dialog-btn-danger" id="rlog-confirm-ok">${escapeHtml(confirmText)}</button>
            </div>
        </div>
    `;

    overlay.appendChild(dialog);
    if (panelShadowRoot) panelShadowRoot.appendChild(overlay);
    confirmDialogEl = overlay;

    dialog.querySelector('.rlog-dialog-close').addEventListener('click', () => {
        closeConfirmDialog();
        if (typeof onCancel === 'function') onCancel();
    });

    dialog.querySelector('#rlog-confirm-cancel').addEventListener('click', () => {
        closeConfirmDialog();
        if (typeof onCancel === 'function') onCancel();
    });

    dialog.querySelector('#rlog-confirm-ok').addEventListener('click', () => {
        closeConfirmDialog();
        if (typeof onConfirm === 'function') onConfirm();
    });

    /* Hỗ trợ bàn phím: Enter xác nhận, Escape hủy */
    dialog.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            dialog.querySelector('#rlog-confirm-ok').click();
        } else if (e.key === 'Escape') {
            closeConfirmDialog();
            if (typeof onCancel === 'function') onCancel();
        }
    });

    /* Tự động focus vào nút hủy (Thao tác an toàn mặc định, tránh ấn nhầm xác nhận) */
    setTimeout(() => {
        const cancelBtn = dialog.querySelector('#rlog-confirm-cancel');
        if (cancelBtn) cancelBtn.focus();
    }, 100);
}

function closeConfirmDialog() {
    if (confirmDialogEl) {
        confirmDialogEl.remove();
        confirmDialogEl = null;
    }
}

/* ── Tìm kiếm ───────────────────────────── */

/* Reset trạng thái tìm kiếm hiện tại (đóng hộp tìm kiếm, xóa từ khóa, xóa highlight, reset số thứ tự trúng), dùng cho tất cả các tình huống cần thoát khỏi chế độ tìm kiếm.
   Không phụ thuộc vào việc UI hộp tìm kiếm đã được dựng hay chưa, chỉ thao tác khi có tồn tại trong DOM. */
function resetSearchIfActive() {
    if (searchDebounceTimer !== null) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
    }

    /* Xóa tất cả dấu highlight */
    if (searchState) {
        const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
        if (listEl) restoreSearchHighlights(listEl);

        const searchEl = searchState.searchEl;
        if (searchEl && searchEl.parentNode) {
            searchEl.parentNode.removeChild(searchEl);
        }
        /* Khôi phục hiển thị nút thao tác gốc, mũi tên thu gọn/mở rộng, thẻ trạng thái đang tìm kiếm của bản ghi tương ứng */
        if (panelEl && searchState.recordIndex !== undefined) {
            const recordEl = panelEl.querySelector(`.rlog-record[data-record-index="${searchState.recordIndex}"]`);
            if (recordEl) {
                /* Xóa thẻ "đang tìm kiếm" (CSS dựa vào nó để khôi phục hiển thị các nút bị ẩn) */
                recordEl.classList.remove('rlog-searching');
                const toggleIcon = recordEl.querySelector('.rlog-toggle-icon');
                if (toggleIcon) toggleIcon.style.visibility = '';
            }
        }

        searchState = null;
    }

    /* Nếu hộp tìm kiếm vẫn ở trạng thái focus khi bị xóa, blur không đảm bảo sẽ được kích hoạt: Dự phòng hủy đóng băng chiều cao bảng điều khiển */
    unfreezePanelForSearchKeyboard();
}

/* Set<string>: Tập hợp ký tự khoảng trắng tương đương \s (tránh chi phí regex cho từng ký tự trong vòng lặp) */
const WHITESPACE_CHARS = new Set([' ', '\t', '\n', '\r', '\f', '\v', '\u00a0', '\u1680',
    '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006', '\u2007',
    '\u2008', '\u2009', '\u200a', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff']);

/* Chuẩn hóa văn bản dùng cho tìm kiếm: Chuỗi khoảng trắng liên tiếp được thu gọn thành một khoảng trắng duy nhất và trả về ánh xạ "ký tự đã chuẩn hóa → chỉ mục gốc".
   Mục đích là để làm cho ngắt dòng/khoảng trắng trong nội dung tương đương với khoảng trắng trong từ khóa — Văn bản nhiều đoạn copy từ bên ngoài thường chuyển ngắt dòng thành khoảng trắng.
   @param {string} text @returns {{normalized, map}} */
function normalizeTextWithMap(text) {
    let normalized = '';
    const map = [];
    let lastWasSpace = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (WHITESPACE_CHARS.has(ch)) {
            if (!lastWasSpace) {
                normalized += ' ';
                map.push(i);
                lastWasSpace = true;
            }
        } else {
            normalized += ch;
            map.push(i);
            lastWasSpace = false;
        }
    }
    return { normalized, map };
}

/* Tìm kiếm kết quả khớp trong tất cả tin nhắn của bản ghi được chỉ định (quét chuỗi thuần túy, không chạm vào DOM, hiệu suất ổn định với văn bản dài). Cả hai bên đều thực hiện chuẩn hóa,
   có thể khớp kể cả qua ngắt dòng/khoảng trắng được copy vào; start/end trả về là offset nội dung gốc, có thể dùng trực tiếp cho highlight.
   @param {number} recordIndex @param {string} keyword @returns {Array<{msgIdx,start,end}>} */
function findMatchesInRecord(recordIndex, keyword) {
    const record = records[recordIndex];
    if (!record || !record.messages || !keyword) return [];

    const normalizedKeyword = keyword.replace(/\s+/g, ' ').trim();
    if (!normalizedKeyword) return [];
    const lowerKeyword = normalizedKeyword.toLowerCase();
    /* Khi từ khóa không chứa khoảng trắng (phần lớn các tìm kiếm), việc chuẩn hóa sẽ không làm thay đổi kết quả khớp — Việc chuẩn hóa chỉ thu gọn khoảng trắng,
       không làm thay đổi thứ tự tương đối của các ký tự không phải khoảng trắng, do đó có thể quét trực tiếp trên "văn bản thực tế trên trang",
       tiết kiệm việc tạo văn bản đã chuẩn hóa và ánh xạ chỉ mục cho từng tin nhắn (với bản ghi dài, bước này có thể tốn mười mấy mili-giây/mỗi lần nhập) */
    const plainScan = normalizedKeyword.indexOf(' ') === -1;

    const matches = [];

    record.messages.forEach((msg, msgIdx) => {
        /* Các tin nhắn con bị ẩn do bộ lọc vai trò sẽ không tham gia tìm kiếm: Nội dung không có trong DOM, highlight điều hướng không thể định vị */
        if (!isMessageVisible(msg)) return;
        addContentMatches(msg.content, msgIdx, normalizedKeyword, lowerKeyword, matches, plainScan);
    });
    /* Reply đóng vai trò như một tin nhắn ảo cuối cùng để tham gia tìm kiếm (msgIdx = messages.length) */
    if (record.reply && isMessageVisible(record.reply)) {
        addContentMatches(record.reply.content, record.messages.length, normalizedKeyword, lowerKeyword, matches, plainScan);
    }

    return matches;
}

/* Chuyển đổi văn bản gốc của tin nhắn thành "văn bản hiển thị trên trang": Render đi qua <pre>, trình phân tích sẽ làm hai việc, ở đây đối chiếu từng cái
   (Bỏ sót bất kỳ cái nào, vị trí rơi của từ khóa sẽ bị lệch toàn bộ) — ① \r\n / \r → \n; ② Vứt bỏ NUL.
   Ngắt dòng đầu tiên ở đầu do buildMessageHtml chèn thêm một ngắt dòng sau <pre> để bù trừ, ở đây không xử lý nữa.
   @param {string} content @returns {string} */
function toRenderedText(content) {
    return content.replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
}

/* Thu thập các từ khóa khớp trong nội dung một tin nhắn/reply đơn lẻ (offset dựa trên toRenderedText, cùng nguồn với văn bản trên trang)
   @param {string} content @param {number} msgIdx @param {string} normalizedKeyword
   @param {string} lowerKeyword @param {Array} matches
   @param {boolean} [plainScan=false] Khi từ khóa không chứa khoảng trắng thì đi theo đường nhanh: Không tạo văn bản chuẩn hóa và ánh xạ chỉ mục */
function addContentMatches(content, msgIdx, normalizedKeyword, lowerKeyword, matches, plainScan = false) {
    if (typeof content !== 'string' || !content) return;

    if (plainScan) {
        const rendered = toRenderedText(content);
        const lowerContent = rendered.toLowerCase();
        let pos = 0;
        let count = 0;
        while (pos <= lowerContent.length && count < 5000) {
            const idx = lowerContent.indexOf(lowerKeyword, pos);
            if (idx === -1) break;
            matches.push({ msgIdx, start: idx, end: idx + normalizedKeyword.length });
            pos = idx + normalizedKeyword.length;
            count++;
        }
        return;
    }

    const { normalized, map } = normalizeTextWithMap(toRenderedText(content));
    const lowerContent = normalized.toLowerCase();

    let pos = 0;
    /* Trong nội dung đã chuẩn hóa không có từ khóa thì bỏ qua tin nhắn đó */
    const firstIdx = lowerContent.indexOf(lowerKeyword);
    if (firstIdx === -1) return;

    /* Duyệt qua tất cả các vị trí xuất hiện (Bảo vệ tối đa 5000 chỗ, đề phòng văn bản lặp lại cực đoan làm chậm hệ thống) */
    let count = 0;
    while (pos <= normalized.length && count < 5000) {
        const idx = lowerContent.indexOf(lowerKeyword, pos);
        if (idx === -1) break;
        /* Khôi phục offset khớp trong văn bản đã chuẩn hóa thành offset văn bản trên trang (có thể dùng trực tiếp để highlight) */
        const origStart = map[idx];
        const normEnd = idx + normalizedKeyword.length;
        const origEnd = map[normEnd - 1] + 1;
        matches.push({ msgIdx, start: origStart, end: origEnd });
        pos = idx + normalizedKeyword.length;
        count++;
    }
}

/* Khôi phục tất cả highlight tìm kiếm hiện tại về văn bản thuần: Chỉ thiết lập lại toàn bộ textContent một lần cho "tin nhắn thực sự chứa mark".
   Việc gỡ từng mark (replaceChild + normalize) khi có nhiều kết quả khớp sẽ rất đắt đỏ (Thử nghiệm thực tế 2000 chỗ mất khoảng 478ms, 10460 chỗ mất khoảng 20.7s),
   thiết lập lại toàn bộ là tương đương và là phép gán một lần cho mỗi tin nhắn; Cơ sở văn bản và highlight dùng chung toRenderedText, nhất quán từng chữ một với văn bản trên trang.
   @param {HTMLElement} listEl */
function restoreSearchHighlights(listEl) {
    if (!listEl) return;
    const markedItems = new Set();
    listEl.querySelectorAll('mark.rlog-search-mark, mark.rlog-search-mark-current').forEach((mark) => {
        const item = mark.closest('.rmsg-item');
        if (item) markedItems.add(item);
    });
    markedItems.forEach((item) => {
        const msg = getMessageByIndex(records[Number(item.dataset.record)], Number(item.dataset.msg));
        const contentEl = item.querySelector('.rmsg-content');
        if (msg && contentEl) contentEl.textContent = toRenderedText(msg.content);
    });
}

/* Xóa tất cả highlight tìm kiếm <mark> (Khớp màu vàng thông thường + Kết quả trúng màu cam hiện tại), khôi phục khu vực nội dung văn bản thuần */
function clearSearchHighlights() {
    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    if (!listEl) return;
    restoreSearchHighlights(listEl);
}

/* Hạ cấp highlight màu cam trúng hiện tại xuống thành màu vàng (chỉ đổi class name, không xóa mark), để điều hướng tái sử dụng highlight đã vẽ tránh phải vẽ lại toàn bộ;
   Khi hạ cấp ghi lại matchIdx, tiện cho việc định vị khi nhảy lại. @param {number} [oldMatchIdx] */
function clearCurrentHighlight(oldMatchIdx) {
    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    if (!listEl) return;
    listEl.querySelectorAll('mark.rlog-search-mark-current').forEach(mark => {
        mark.classList.remove('rlog-search-mark-current');
        mark.classList.add('rlog-search-mark');
        if (oldMatchIdx !== undefined && oldMatchIdx >= 0) {
            mark.dataset.matchIdx = String(oldMatchIdx);
        }
    });
}

/* Xóa mark khớp màu vàng thông thường của matchIdx được chỉ định (vị trí mục tiêu sẽ được bao phủ và vẽ bởi màu cam)
   @param {number} matchIdx Chỉ số của kết quả khớp trong matches */
function removeYellowMarkByMatchIdx(matchIdx) {
    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    if (!listEl) return;
    listEl.querySelectorAll(`mark.rlog-search-mark[data-match-idx="${matchIdx}"]`).forEach(mark => {
        const parent = mark.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(mark.textContent), mark);
            parent.normalize();
        }
    });
}

/* Bọc văn bản trong khoảng [start, end) của nội dung tin nhắn thành <mark> (TreeWalker định vị chính xác offset)
   @param {HTMLElement} contentEl @param {number} start @param {number} end
   @param {string} [className=rlog-search-mark-current] @returns {HTMLElement|null} */
function highlightRange(contentEl, start, end, className = 'rlog-search-mark-current') {
    if (!contentEl || start < 0 || end <= start) return null;

    const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
    let currentOffset = 0;
    let node = null;

    while ((node = walker.nextNode())) {
        const nodeLen = node.textContent.length;
        if (currentOffset + nodeLen > start) break;
        currentOffset += nodeLen;
    }
    if (!node) return null;

    const nodeStart = currentOffset;
    const splitStart = start - nodeStart;
    const splitEnd = end - nodeStart;

    if (splitEnd > node.textContent.length) {
        /* Trường hợp vượt ranh giới node (từ khóa nằm trên nhiều text node), xử lý đơn giản hóa: Chỉ lấy phần có thể khớp trong node hiện tại */
        const visibleStart = Math.max(0, splitStart);
        const visibleEnd = Math.min(node.textContent.length, splitEnd);
        if (visibleEnd <= visibleStart) return null;
        const range = document.createRange();
        range.setStart(node, visibleStart);
        range.setEnd(node, visibleEnd);
        const mark = document.createElement('mark');
        mark.className = className;
        try {
            range.surroundContents(mark);
        } catch (e) {
            return null;
        }
        return mark;
    }

    const range = document.createRange();
    range.setStart(node, splitStart);
    range.setEnd(node, splitEnd);
    const mark = document.createElement('mark');
    mark.className = className;
    try {
        range.surroundContents(mark);
    } catch (e) {
        return null;
    }
    return mark;
}

/* Highlight tất cả kết quả khớp trong bản ghi này (màu vàng, không bao gồm kết quả trúng hiện tại — nó được applyCurrentMatch vẽ màu cam).
   Mỗi tin nhắn tạo fragment "text node + <mark>" một lần và thay thế toàn bộ node con của khu vực nội dung:
   Việc gọi Range.surroundContents cho từng chỗ là cắt liên tục trong cùng một khối văn bản, chi phí tăng siêu tuyến tính theo số lượng kết quả trúng trong khối đó
   (Thử nghiệm thực tế 420 chỗ trong một khối thì 60 chỗ cuối đắt gấp mười mấy lần so với 60 chỗ đầu), trong khi đó việc tạo một lần là tuyến tính,
   DOM tạo ra tương đương với bọc từng chỗ (cùng mark class name và data-match-idx, chữ được ghi bằng textContent không cần escape).
   @param {HTMLElement} recordEl @param {number} recordIndex */
function highlightAllMatches(recordEl, recordIndex) {
    if (!searchState || !recordEl) return;
    const record = records[recordIndex];
    if (!record) return;
    /* Văn bản chính của bản ghi bị thu gọn vẫn chưa được tạo, vị trí rơi của highlight phải tìm trong cây con sau khi được tạo bù */
    ensureRecordBody(recordEl);

    /* Nhóm theo tin nhắn (bỏ qua kết quả trúng hiện tại, màu cam vẽ riêng), và giữ lại chỉ số của kết quả khớp trong matches cho mark ghi lại */
    const matchesByMsg = new Map();
    searchState.matches.forEach((match, idx) => {
        if (idx === searchState.currentIdx) return;
        if (!matchesByMsg.has(match.msgIdx)) matchesByMsg.set(match.msgIdx, []);
        matchesByMsg.get(match.msgIdx).push({ match, idx });
    });

    matchesByMsg.forEach((msgMatches, msgIdx) => {
        const msg = getMessageByIndex(record, msgIdx);
        if (!msg) return;
        /* Đảm bảo tin nhắn được mở rộng (highlight tìm kiếm cần khu vực nội dung nhìn thấy được) */
        if (msg.collapsed) {
            msg.collapsed = false;
            const msgItem = recordEl.querySelector(`.rmsg-item[data-msg="${msgIdx}"]`);
            if (msgItem) {
                msgItem.classList.add('expanded');
                msgItem.classList.remove('collapsed');
            }
        }
        const contentEl = ensureMessageContent(recordEl.querySelector(`.rmsg-item[data-msg="${msgIdx}"]`));
        if (!contentEl) return;

        /* Trong cùng một tin nhắn, ghép fragment theo thứ tự start tăng dần: Text node và phần tử mark xen kẽ, nối thêm văn bản còn lại vào cuối */
        const text = toRenderedText(msg.content);
        const sorted = msgMatches.slice().sort((a, b) => a.match.start - b.match.start);
        const fragment = document.createDocumentFragment();
        let cursor = 0;
        sorted.forEach(({ match, idx }) => {
            if (match.start > cursor) {
                fragment.appendChild(document.createTextNode(text.slice(cursor, match.start)));
            }
            const markEl = document.createElement('mark');
            markEl.className = 'rlog-search-mark';
            /* Ghi lại chỉ số khớp, cho removeYellowMarkByMatchIdx định vị mark màu vàng */
            markEl.dataset.matchIdx = String(idx);
            markEl.textContent = text.slice(match.start, match.end);
            fragment.appendChild(markEl);
            cursor = match.end;
        });
        if (cursor < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(cursor)));
        }
        contentEl.replaceChildren(fragment);
        /* Chữ và chiều cao đều không đổi, nhưng khu vực nội dung đã bị thay thế toàn bộ, tiện tay làm mới thanh cuộn của tin nhắn đó một lần (khi không có thanh tiến trình thì là thao tác rỗng) */
        requestThumbUpdate(contentEl);
    });
}

/* Trả về hành vi cuộn nên dùng hiện tại: Chế độ tối giản dùng 'auto' nhảy trực tiếp, nếu không thì dùng 'smooth' mượt mà. */
function getScrollBehavior() {
    return preferences.minimal ? 'auto' : 'smooth';
}

/* Cuộn kết quả trúng hiện tại đến vị trí thoải mái: Trước tiên cuộn bên trong .rmsg-content, sau đó tính toán scrollTop của .rlog-list để tin nhắn rơi xuống
   bên dưới thanh tiêu đề dính. Không dùng scrollIntoView — Nó sẽ cuộn đệ quy tất cả các tổ tiên có thể cuộn, trên thiết bị di động sẽ cuộn luôn cả giao diện chính của ST.
   @param {HTMLElement} markEl @param {HTMLElement} contentEl */
function scrollToMatch(markEl, contentEl) {
    if (!markEl || !contentEl) return;

    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    if (!listEl) return;

    const contentRect = contentEl.getBoundingClientRect();
    const markRect = markEl.getBoundingClientRect();
    const contentScrollTop = contentEl.scrollTop;
    const relativeTop = markRect.top - contentRect.top + contentScrollTop;
    const targetScroll = relativeTop - contentRect.height * 0.25;
    /* Cả trên và dưới đều phải kẹp vào phạm vi cuộn thực tế của khu vực nội dung: Khi kết quả trúng gần cuối tin nhắn dài, trình duyệt sẽ kẹp giá trị vượt giới hạn bên dưới về
       maxScroll, nếu ở đây không kẹp trước, "vị trí cuối cùng của kết quả trúng" được suy ra theo delta bên dưới sẽ bị lớn hơn,
       danh sách lớp ngoài dựa vào đó định vị sẽ để lại kết quả trúng ở vị trí lệch xuống dưới (Thử nghiệm thực tế lệch tối đa hàng trăm pixel) */
    const maxContentScroll = Math.max(0, contentEl.scrollHeight - contentEl.clientHeight);
    const clampedContentScroll = Math.max(0, Math.min(targetScroll, maxContentScroll));
    contentEl.scrollTo({ top: clampedContentScroll, behavior: getScrollBehavior() });

    /* Cuộn danh sách lớp ngoài định vị thủ công: Cuộn lớp trong vẫn chưa hoàn tất, nhưng vị trí trực quan cuối cùng của mark có thể được suy ra từ gia số cuộn
       (markRect.top - delta), kỳ vọng nó rơi xuống bên dưới hai thanh tiêu đề dính, khoảng 1/3 khu vực nhìn thấy còn lại */
    const delta = clampedContentScroll - contentScrollTop;
    const markFinalTop = markRect.top - delta;
    const listRect = listEl.getBoundingClientRect();

    /* Tích lũy offsetHeight của hai thanh tiêu đề sticky (.rlog-record-header / .rmsg-header) thay vì giá trị cố định,
       để tự động tương thích với các chiều cao khác nhau giữa desktop/mobile và chiều cao thay đổi do ngắt dòng của thanh tiêu đề trên mobile. Chú ý không thể dùng getBoundingClientRect().bottom:
       Khi tin nhắn chứa mark không nằm trong viewport thì header chưa dính, bottom sẽ ở xa ngoài viewport, dẫn đến scrollTop mục tiêu bị kẹp về 0. */
    const recordEl = markEl.closest('.rlog-record');
    const msgItemEl = markEl.closest('.rmsg-item');
    let stickyHeight = 0;
    if (recordEl) {
        const recordHeaderEl = recordEl.querySelector('.rlog-record-header');
        if (recordHeaderEl) stickyHeight += recordHeaderEl.offsetHeight;
    }
    if (msgItemEl) {
        const msgHeaderEl = msgItemEl.querySelector('.rmsg-header');
        if (msgHeaderEl) stickyHeight += msgHeaderEl.offsetHeight;
    }

    /* Vị trí logic của mark trong nội dung danh sách (không bị ảnh hưởng bởi trạng thái cuộn) */
    const markInList = listEl.scrollTop + markFinalTop - listRect.top;
    const visibleHeight = Math.max(0, listEl.clientHeight - stickyHeight);
    const targetListScroll = markInList - stickyHeight - visibleHeight * 0.33;

    /* Kẹp vào phạm vi cuộn hợp lệ (tránh trình duyệt tự kẹp im lặng dẫn đến nhảy đột ngột) */
    const maxListScroll = Math.max(0, listEl.scrollHeight - listEl.clientHeight);
    /* Cận dưới: Vị trí logic của cạnh trên bản ghi trong danh sách. Thấp hơn nó, cạnh trên của bản ghi sẽ lộ ra phía trên danh sách, thanh tiêu đề cũng sẽ rơi xuống từ vị trí dính
       ; Khi vị trí trúng không đủ để thỏa mãn điểm rơi tiêu chuẩn thì ưu tiên đảm bảo thanh tiêu đề bản ghi không di chuyển, cho phép highlight dừng ở vị trí thấp hơn */
    const recordTopInList = recordEl
        ? listEl.scrollTop + recordEl.getBoundingClientRect().top - listRect.top
        : 0;
    const minListScroll = Math.max(0, Math.min(recordTopInList, maxListScroll));
    const clampedListScroll = Math.max(minListScroll, Math.min(targetListScroll, maxListScroll));

    /* Chỉ cuộn lớp ngoài khi cần điều chỉnh (khi mark đã nhìn thấy được thì giữ nguyên, tránh kích hoạt bất kỳ cuộn bên ngoài nào) */
    if (Math.abs(clampedListScroll - listEl.scrollTop) > 1) {
        listEl.scrollTo({ top: clampedListScroll, behavior: getScrollBehavior() });
    }
}

/* Cập nhật hiển thị bộ đếm của hộp tìm kiếm (ví dụ: 3/18) */
function updateSearchCounter() {
    if (!searchState || !searchState.searchEl) return;
    const counter = searchState.searchEl.querySelector('.rlog-search-count');
    if (!counter) return;

    const total = searchState.matches.length;
    const current = total > 0 ? searchState.currentIdx + 1 : 0;
    counter.textContent = `${current}/${total}`;

    /* Có từ khóa nhưng không có kết quả trúng: Bộ đếm chuyển đỏ */
    counter.classList.toggle('rlog-search-count-empty', !!searchState.keyword && total === 0);

    /* Vô hiệu hóa mũi tên lên/xuống khi không có kết quả hoặc chỉ có một kết quả */
    const prevBtn = searchState.searchEl.querySelector('.rlog-search-prev');
    const nextBtn = searchState.searchEl.querySelector('.rlog-search-next');
    if (prevBtn) prevBtn.disabled = total <= 1;
    if (nextBtn) nextBtn.disabled = total <= 1;
}

/* Thực hiện tìm kiếm tại tin nhắn được chỉ định và highlight kết quả trúng hiện tại + Cuộn đến vị trí đó
   @param {number} msgIdx @param {number} matchIdx
   @param {boolean} [redrawYellowHighlights=true] Từ khóa tìm kiếm thay đổi truyền true (Xóa sạch toàn bộ highlight và vẽ lại);
   Điều hướng bằng phím lên xuống truyền false (Chỉ xóa kết quả trúng màu cam hiện tại, dùng lại highlight màu vàng đã vẽ) */
function applyCurrentMatch(msgIdx, matchIdx, redrawYellowHighlights = true) {
    if (!searchState) return;
    const recordIndex = searchState.recordIndex;
    const record = records[recordIndex];
    const msg = getMessageByIndex(record, msgIdx);
    if (!record || !msg) return;

    const listEl = panelEl.querySelector('#rlog-list');
    const recordEl = listEl.querySelector(`.rlog-record[data-record-index="${recordIndex}"]`);
    if (!recordEl) return;

    if (redrawYellowHighlights) {
        /* Từ khóa tìm kiếm thay đổi: Xóa toàn bộ highlight rồi vẽ lại */
        clearSearchHighlights();

        if (record.collapsed) {
            record.collapsed = false;
            recordEl.classList.add('expanded');
            recordEl.classList.remove('collapsed');
        }

        /* Highlight tất cả kết quả khớp trong bản ghi này (màu vàng, bỏ qua kết quả trúng hiện tại; đồng thời mở rộng các tin nhắn thu gọn khớp được) */
        highlightAllMatches(recordEl, recordIndex);
    } else {
        /* Chuyển hướng điều hướng: Hạ cấp kết quả trúng màu cam cũ xuống thành màu vàng, tái sử dụng mark đã vẽ, tránh vẽ lại toàn bộ */
        const oldIdx = searchState.currentIdx;
        clearCurrentHighlight(oldIdx);

        /* Bắt buộc phải xóa mark màu vàng còn sót lại ở vị trí mục tiêu trước, nếu không tính toán offset DOM sẽ bị lỗi khi vẽ màu cam mới */
        removeYellowMarkByMatchIdx(matchIdx);

        if (record.collapsed) {
            record.collapsed = false;
            recordEl.classList.add('expanded');
            recordEl.classList.remove('collapsed');
        }
    }

    /* Nội dung của bản ghi bị thu gọn / tin nhắn bị thu gọn đều không thể nhìn thấy, không thể định vị, trước tiên tạo bù theo yêu cầu rồi mới mở rộng */
    ensureRecordBody(recordEl);
    if (msg.collapsed) {
        msg.collapsed = false;
        const msgItem = recordEl.querySelector(`.rmsg-item[data-msg="${msgIdx}"]`);
        if (msgItem) {
            msgItem.classList.add('expanded');
            msgItem.classList.remove('collapsed');
        }
    }

    const contentEl = ensureMessageContent(recordEl.querySelector(`.rmsg-item[data-msg="${msgIdx}"]`));
    if (!contentEl) return;

    /* Tạo thanh cuộn bất đồng bộ (tin nhắn vừa được mở rộng, cần đợi bố cục ổn định) */
    setTimeout(() => createScrollbarForContent(contentEl), SCROLLBAR_CREATE_DELAY_MS);

    const match = searchState.matches[matchIdx];
    if (!match) return;

    const markEl = highlightRange(contentEl, match.start, match.end, 'rlog-search-mark-current');

    searchState.currentIdx = matchIdx;
    updateSearchCounter();

    if (markEl) {
        scrollToMatch(markEl, contentEl);
    }
}

/* Thực hiện tìm kiếm (Được gọi bởi debounce sau khi từ khóa nhập thay đổi)
   @param {number} recordIndex Chỉ số bản ghi
   @param {string} keyword Từ khóa tìm kiếm */
function performSearch(recordIndex, keyword) {
    if (!searchState || !panelEl) return;

    /* Xóa matches và highlight của lần tìm kiếm trước đó */
    searchState.matches = findMatchesInRecord(recordIndex, keyword);
    searchState.currentIdx = -1;
    searchState.keyword = keyword;

    if (!keyword) {
        clearSearchHighlights();
        updateSearchCounter();
        return;
    }

    if (searchState.matches.length > 0) {
        /* Tự động chuyển đến kết quả khớp đầu tiên */
        searchState.currentIdx = 0;
        applyCurrentMatch(searchState.matches[0].msgIdx, 0);
    } else {
        /* Không có kết quả khớp: Xóa highlight, bộ đếm hiển thị 0/0 */
        clearSearchHighlights();
        updateSearchCounter();
    }
}

/* Chuyển đến kết quả khớp tiếp theo/trước đó
   @param {number} direction 1=Tiếp theo, -1=Trước đó */
function navigateSearch(direction) {
    if (!searchState || !searchState.matches || searchState.matches.length === 0) return;

    const total = searchState.matches.length;
    let nextIdx = searchState.currentIdx + direction;
    /* Nhảy vòng lặp */
    if (nextIdx >= total) nextIdx = 0;
    if (nextIdx < 0) nextIdx = total - 1;

    const match = searchState.matches[nextIdx];
    /* Tham số thứ ba false: Khi nhảy điều hướng chỉ xóa kết quả trúng màu cam hiện tại, dùng lại highlight màu vàng đã vẽ (tối ưu hóa hiệu suất) */
    applyCurrentMatch(match.msgIdx, nextIdx, false);
}

function closeSearch() {
    resetSearchIfActive();
}

/* Mở chế độ tìm kiếm cho bản ghi được chỉ định (Nguyên tắc độc quyền: Một lúc chỉ có một bản ghi ở trạng thái tìm kiếm)
   @param {number} recordIndex Chỉ số bản ghi */
function openSearchForRecord(recordIndex) {
    if (!panelEl) return;
    /* Độc quyền: Trước tiên đóng bất kỳ tìm kiếm nào đã có */
    resetSearchIfActive();

    const listEl = panelEl.querySelector('#rlog-list');
    const recordEl = listEl.querySelector(`.rlog-record[data-record-index="${recordIndex}"]`);
    if (!recordEl) return;

    const actionsEl = recordEl.querySelector('.rlog-record-actions');
    const actionsInner = recordEl.querySelector('.rlog-record-actions-inner');
    if (!actionsEl || !actionsInner) return;

    /* Gắn thẻ "đang tìm kiếm": CSS ẩn các nút khác và mũi tên xuống ngoại trừ kính lúp, nhường không gian cho hộp tìm kiếm mở rộng sang phải */
    recordEl.classList.add('rlog-searching');

    /* Ẩn mũi tên thu gọn/mở rộng (▾): Dùng visibility để giữ chỗ, phối hợp với CSS cố định chiều rộng của actions-inner,
       đảm bảo vị trí kính lúp không bị đẩy đi */
    const toggleIcon = recordEl.querySelector('.rlog-toggle-icon');
    if (toggleIcon) toggleIcon.style.visibility = 'hidden';

    /* Tự động mở rộng bản ghi bị thu gọn (highlight tìm kiếm cần khu vực nội dung nhìn thấy được) */
    const record = records[recordIndex];
    if (record && record.collapsed) {
        record.collapsed = false;
        recordEl.classList.add('expanded');
        recordEl.classList.remove('collapsed');
        ensureRecordBody(recordEl);
        /* Sau khi mở rộng, tạo chậm thanh tiến trình cho khu vực nội dung tin nhắn (chỉ tạo ngay cho phần trong viewport, còn lại trì hoãn) */
        queueScrollbarsForEls(recordEl.querySelectorAll('.rmsg-content'));
    }

    /* Dựng DOM hộp tìm kiếm: Nút kính lúp giữ nguyên vị trí làm mỏ neo trực quan, hộp tìm kiếm mở rộng ở bên phải của nó */
    const searchBox = document.createElement('div');
    searchBox.className = 'rlog-search-box';
    searchBox.innerHTML = `
        <div class="rlog-search-input-wrap">
            <input type="text" class="rlog-search-input" placeholder="搜索..." autocomplete="off" spellcheck="false">
            <span class="rlog-search-count">0/0</span>
        </div>
        <button class="rlog-search-next" title="下一个 (Enter)" disabled>
            <i class="fa-solid fa-arrow-down"></i>
        </button>
        <button class="rlog-search-prev" title="上一个 (Shift+Enter)" disabled>
            <i class="fa-solid fa-arrow-up"></i>
        </button>
    `;

    const searchBtn = actionsInner.querySelector('.rlog-search-btn');
    if (searchBtn) {
        searchBtn.insertAdjacentElement('afterend', searchBox);
    } else {
        actionsInner.appendChild(searchBox);
    }

    searchState = {
        recordIndex,
        keyword: '',
        matches: [],
        currentIdx: -1,
        searchEl: searchBox,
    };

    const input = searchBox.querySelector('.rlog-search-input');
    const prevBtn = searchBox.querySelector('.rlog-search-prev');
    const nextBtn = searchBox.querySelector('.rlog-search-next');

    /* Thiết bị di động: Đóng băng chiều cao bảng điều khiển trong thời gian focus, tránh việc bảng điều khiển bị đẩy lên/kéo xuống theo khi bàn phím ảo hiện/ẩn gây giật lag
       (Chỉ đóng đinh chiều cao, không đổi các nguồn kích thước khác; mất focus sẽ khôi phục và chạy bù đồng bộ viewport một lần) */
    input.addEventListener('focus', () => freezePanelForSearchKeyboard(input));
    input.addEventListener('blur', () => unfreezePanelForSearchKeyboard());

    /* boolean: Cờ trạng thái tổ hợp bộ gõ (Khi pinyin chưa lên màn hình thì sự kiện input không kích hoạt tìm kiếm) */
    let isComposing = false;
    /* Hàm điều phối tìm kiếm debounce: Dùng chung cho sự kiện input và compositionend */
    const scheduleSearch = () => {
        if (searchDebounceTimer !== null) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
        }
        searchDebounceTimer = setTimeout(() => {
            searchDebounceTimer = null;
            performSearch(recordIndex, input.value);
        }, SEARCH_DEBOUNCE_MS);
    };

    /* Bỏ qua sự kiện input trong quá trình tổ hợp bộ gõ */
    input.addEventListener('compositionstart', () => { isComposing = true; });
    /* Kết thúc tổ hợp (Chữ đã lên màn hình): Tìm kiếm bù một lần (Trong quá trình tổ hợp có thể đã bỏ lỡ input) */
    input.addEventListener('compositionend', () => {
        isComposing = false;
        scheduleSearch();
    });

    /* Tìm kiếm thời gian thực khi nhập (debounce) */
    input.addEventListener('input', (e) => {
        if (isComposing || e.isComposing || e.keyCode === 229) return;
        scheduleSearch();
    });

    /* Phím tắt bàn phím: Enter Tiếp theo / Shift+Enter Trước đó / Esc Đóng */
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                navigateSearch(-1);
            } else {
                navigateSearch(1);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeSearch();
        }
    });

    prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateSearch(-1);
    });

    nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateSearch(1);
    });

    setTimeout(() => {
        if (input && searchState && searchState.searchEl === searchBox) {
            input.focus();
        }
    }, 50);
}

/* ── Bộ lọc ─────────────────────────────── */

/* Tên model → Nhóm bộ lọc: DeepSeek / Claude / Gemini (bao gồm Gemma, Palm) được nhóm cố định, còn lại thuộc về "Khác".
   Tách biệt, không dùng lại với extractModelFamily() (dùng cho phân từ): DeepSeek cần được nhóm độc lập. */
function getModelFilterGroup(modelName) {
    if (!modelName || modelName === '未知模型') return 'other';
    const m = modelName.toLowerCase();
    if (m.includes('deepseek')) return 'deepseek';
    if (m.includes('claude')) return 'claude';
    if (m.includes('gemini') || m.includes('gemma') || m.includes('palm')) return 'gemini';
    return 'other';
}

/* Vai trò tin nhắn → Nhóm bộ lọc: system / user / assistant cố định, còn lại (tool, developer...) thuộc về "Khác" */
function getRoleFilterGroup(role) {
    if (role === 'system') return 'system';
    if (role === 'user') return 'user';
    if (role === 'assistant') return 'assistant';
    return 'other';
}

/* Tin nhắn con (bao gồm cả tin nhắn ảo reply) có vượt qua bộ lọc vai trò hay không: Bộ lọc vai trò phán đoán từng tin nhắn một, không trực tiếp quyết định toàn bộ bản ghi */
function isMessageVisible(msg) {
    if (!msg) return false;
    return !!filterState.role[getRoleFilterGroup(msg.role)];
}

/* Bản ghi có vượt qua bộ lọc hiện tại hay không:
   Nguồn/Model phán đoán theo toàn bộ bản ghi; Vai trò phán đoán từng tin nhắn con một — Bản thân bản ghi chỉ cần còn
   ít nhất một tin nhắn con hiển thị (tin nhắn bình thường hoặc reply) thì giữ lại, nếu không sẽ ẩn theo danh sách. */
function matchesFilter(record) {
    if (!record) return false;
    const sourceKey = record.source && record.source.type === 'native' ? 'native' : 'plugin';
    if (!filterState.source[sourceKey]) return false;
    const hasVisibleMessage = record.messages.some(isMessageVisible)
        || (record.reply ? isMessageVisible(record.reply) : false);
    if (!hasVisibleMessage) return false;
    const modelKey = getModelFilterGroup(record.modelName);
    if (!filterState.model[modelKey]) return false;
    return true;
}

/* Danh sách bản ghi hiển thị (Chỉ ảnh hưởng đến render; Mảng records giữ nguyên, data-record-index trên DOM vẫn là chỉ số thực) */
function getVisibleRecords() {
    return records.filter(matchesFilter);
}

/* Có bộ lọc nào đang có hiệu lực hay chưa (Bất kỳ công tắc nhóm nào bị tắt) */
function isFilterActive() {
    return Object.keys(filterState).some((group) =>
        Object.keys(filterState[group]).some((key) => !filterState[group][key])
    );
}

/* Tạo mới một trạng thái bộ lọc mặc định "mở toàn bộ" (dùng cho hướng dẫn lưu tạm/khôi phục) */
function createDefaultFilterState() {
    return {
        source: { native: true, plugin: true },
        role: { system: true, user: true, assistant: true, other: true },
        model: { gemini: true, claude: true, deepseek: true, other: true },
    };
}

/* Lưu trữ vĩnh viễn trạng thái bộ lọc hiện tại vào localStorage (chỉ gọi khi công tắc "Lưu trữ trạng thái bộ lọc" được bật) */
function saveFilterState() {
    try { localStorage.setItem(STORAGE_FILTER_STATE_KEY, JSON.stringify(filterState)); } catch (e) { /* 忽略异常 */ }
}

/* Làm sạch trạng thái bộ lọc đọc về từ localStorage: Lấy mặc định mở toàn bộ làm tiêu chuẩn, từng nhóm từng key chỉ chấp nhận giá trị boolean, còn lại fallback về true */
function sanitizeFilterState(state) {
    const def = createDefaultFilterState();
    if (!state || typeof state !== 'object') return def;
    const out = createDefaultFilterState();
    for (const group of Object.keys(def)) {
        if (state[group] && typeof state[group] === 'object') {
            for (const key of Object.keys(def[group])) {
                if (typeof state[group][key] === 'boolean') out[group][key] = state[group][key];
            }
        }
    }
    return out;
}

/* Tải trạng thái bộ lọc đã lưu và ghi đè filterState hiện tại (chỉ đọc khi công tắc "Lưu trữ trạng thái bộ lọc" được bật);
   Không có giá trị / phân tích lỗi / dữ liệu không hợp lệ đều fallback về mặc định mở toàn bộ. */
function loadPersistedFilterState() {
    if (!preferences.filterPersist) return;
    try {
        const raw = localStorage.getItem(STORAGE_FILTER_STATE_KEY);
        if (raw === null) return;
        filterState = sanitizeFilterState(JSON.parse(raw));
    } catch (e) { /* Phân tích lỗi: Fallback về mặc định mở toàn bộ */
        filterState = createDefaultFilterState();
    }
}

/* Đường dẫn SVG của icon thương hiệu model (simple-icons đơn sắc 24x24, fill="currentColor", inline không có file hình ảnh) */
const FILTER_MODEL_SVG = {
    gemini_full: `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
        <defs>
            <radialGradient id="gemini-top" cx="50%" cy="0%" r="60%">
                <stop offset="0%" stop-color="#FF5252" />
                <stop offset="100%" stop-color="#FF5252" stop-opacity="0" />
            </radialGradient>
            <radialGradient id="gemini-right" cx="100%" cy="50%" r="70%">
                <stop offset="0%" stop-color="#4285F4" />
                <stop offset="100%" stop-color="#4285F4" stop-opacity="0" />
            </radialGradient>
            <radialGradient id="gemini-bottom" cx="50%" cy="100%" r="60%">
                <stop offset="0%" stop-color="#0F9D58" />
                <stop offset="100%" stop-color="#0F9D58" stop-opacity="0" />
            </radialGradient>
            <radialGradient id="gemini-left" cx="0%" cy="50%" r="60%">
                <stop offset="0%" stop-color="#FBBC05" />
                <stop offset="100%" stop-color="#FBBC05" stop-opacity="0" />
            </radialGradient>
            <mask id="gemini-mask">
                <path fill="#ffffff" d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"/>
            </mask>
        </defs>
        <g mask="url(#gemini-mask)">
            <rect width="24" height="24" fill="#4285F4" />
            <rect width="24" height="24" fill="url(#gemini-top)" />
            <rect width="24" height="24" fill="url(#gemini-bottom)" />
            <rect width="24" height="24" fill="url(#gemini-left)" />
        </g>
    </svg>`,
    claude: 'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z',
    deepseek: 'M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45',
};

/* Cập nhật chỉ báo "Đã ẩn N" bên cạnh tiêu đề (chỉ hiển thị số lượng bản ghi bị ẩn bởi bộ lọc) và dấu chấm tròn kích hoạt của nút bộ lọc
   @param {Array} [visibleRecords] Các bản ghi hiển thị đã được tính toán (renderPanelContent đã tính một bản, truyền vào để tránh duyệt lại) */
function updateFilterIndicator(visibleRecords) {
    if (!panelEl) return;
    const active = isFilterActive();
    const indicator = panelEl.querySelector('#rlog-filter-indicator');
    if (indicator) {
        /* Chỉ hiển thị số lượng bản ghi bị ẩn do bộ lọc; Không có bản ghi nào bị ẩn thì ẩn chỉ báo, chỉ để lại dấu chấm tròn của nút */
        const hiddenCount = records.length - (visibleRecords || getVisibleRecords()).length;
        const showText = active && hiddenCount > 0;
        indicator.hidden = !showText;
        if (showText) {
            const textEl = panelEl.querySelector('#rlog-filter-indicator-text');
            if (textEl) textEl.textContent = `Đã ẩn ${hiddenCount}`;
        }
    }
    const btn = panelEl.querySelector('#rlog-filter-btn');
    if (btn) btn.classList.toggle('rlog-filter-active', active);
}

/* Làm mới trạng thái trực quan bật/tắt của tất cả các nút phân đoạn trong ngăn kéo (aria-pressed đồng bộ trạng thái hỗ trợ tiếp cận) */
function updateFilterChipUI() {
    if (!panelEl) return;
    panelEl.querySelectorAll('.rlog-filter-chip').forEach((chip) => {
        const group = chip.dataset.filterGroup;
        const value = chip.dataset.filterValue;
        const on = !!(filterState[group] && filterState[group][value]);
        chip.classList.toggle('rlog-filter-chip-on', on);
        chip.classList.toggle('rlog-filter-chip-off', !on);
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
}

/* Chuyển đổi một công tắc bộ lọc đơn lẻ và dựng lại danh sách (khi dựng lại thì tìm kiếm một mục sẽ tự động thoát, nhất quán với hành vi render hiện có) */
function toggleFilterChip(group, value) {
    if (!filterState[group] || !(value in filterState[group])) return;
    filterState[group][value] = !filterState[group][value];
    updateFilterChipUI();
    panelContentDirty = true;
    /* "Lưu trữ trạng thái bộ lọc" bật thì ghi xuống đĩa ngay lập tức */
    if (preferences.filterPersist) saveFilterState();
    if (panelEl && isPanelVisible) renderPanelContent();
}

/* Reset toàn bộ bộ lọc thành "mở toàn bộ" và làm mới danh sách
   @param {boolean} [persist=true] Có ghi xuống đĩa sau khi reset hay không (Người dùng reset thủ công=true; Gọi lập trình như hướng dẫn... truyền false,
      tránh việc hướng dẫn ghi đè bộ lọc đã lưu của người dùng thành mở toàn bộ lúc mới bắt đầu) */
function resetFilters(persist = true) {
    filterState = createDefaultFilterState();
    updateFilterChipUI();
    updateFilterIndicator();
    panelContentDirty = true;
    if (persist && preferences.filterPersist) saveFilterState();
    if (panelEl && isPanelVisible) renderPanelContent();
}

/* ── Render và xây dựng HTML ──────────────────── */

function getHeaderCountText() {
    return `${records.length}/${MAX_RECORDS}`;
}

/* Cập nhật thời gian thực của thẻ nguồn (được gọi sau khi sửa chữa nguồn / bằng chứng vị trí E3 bị vô hiệu hóa):
   Sự phụ thuộc của bộ lọc không đổi → Cập nhật định điểm thẻ nguồn và huy hiệu của bản ghi đó; Sự phụ thuộc của bộ lọc thay đổi → Vẽ lại toàn bộ bảng và làm mới chỉ báo cùng bộ đếm;
   Bảng điều khiển không hiển thị / Hướng dẫn đang diễn ra → Chỉ đặt cờ dirty, lần render tiếp theo sẽ mang theo.
   @param {object} record Bản ghi mục tiêu @param {string} prevSourceType Loại nguồn trước khi thay đổi */
function refreshRecordSourceDom(record, prevSourceType) {
    panelContentDirty = true;
    if (!record) return;

    const newType = (record.source && record.source.type === 'native') ? 'native' : 'plugin';
    const membershipChanged = isFilterActive() && !!prevSourceType && prevSourceType !== newType
        && !filterState.source[newType];
    if (membershipChanged) {
        if (panelEl && isPanelVisible && !tourActive) renderPanelContent();
        return;
    }
    if (!panelEl || !isPanelVisible || tourActive) return;

    const idx = records.indexOf(record);
    const listEl = idx >= 0 ? panelEl.querySelector('#rlog-list') : null;
    const recordEl = listEl ? listEl.querySelector(`.rlog-record[data-record-index="${idx}"]`) : null;
    if (!recordEl) {
        /* Bản ghi không có trong DOM (Bị bộ lọc nhân vật / model ẩn đi, hoặc vẫn đang trong hàng đợi lưu tạm của hướng dẫn): Chỉ cần làm mới chỉ báo và bộ đếm */
        updateFilterIndicator();
        return;
    }

    recordEl.setAttribute('data-source', newType);
    const badge = recordEl.querySelector('.rlog-source-badge');
    if (badge) {
        badge.className = `rlog-source-badge ${getSourceClass(record.source)}`;
        badge.title = (record.source && record.source.detail) || getSourceLabel(record.source);
        badge.innerHTML = `<span class="rlog-status-dot"></span>${escapeHtml(getSourceLabel(record.source))}`;
    }
    updateFilterIndicator();
}

function updateHeaderTitle() {
    if (!panelEl) return;
    const countEl = panelEl.querySelector('.rlog-title-count');
    if (countEl) {
        countEl.textContent = getHeaderCountText();
    }
}

function buildMessageHtml(msg, recordIdx, msgIdx) {
    const roleClass = getRoleClass(msg.role);
    const roleLabel = getRoleLabel(msg.role);
    const collapsedClass = msg.collapsed ? 'collapsed' : 'expanded';
    /* tokenPrecise là true biểu thị đã sử dụng giá trị chính xác của trình phân từ native ST, không hiển thị dấu ~ ước tính */
    const tokenPrefix = msg.tokenPrecise ? '' : '~';
    /* Chữ xem trước nội dung (Chỉ hiển thị khi công tắc được bật, hoặc đang ở trạng thái trình diễn xem trước bắt buộc) */
    const showPreview = forcePreviewState !== null ? forcePreviewState : contentPreviewEnabled;
    const previewHtml = showPreview
        ? `<span class="rmsg-preview-text" title="${escapeHtml(msg.content.slice(0, 200))}">${escapeHtml(getContentPreview(msg.content))}</span>`
        : '';
    /* Tin nhắn thu gọn không tạo phần thân: Phần thân sẽ được giữ lại để ensureMessageContent() tạo bù khi mở rộng, nếu không mỗi lần dựng lại toàn bộ bảng
       sẽ phải nối chuỗi và phân tích lại phần thân prompt của toàn bộ bản ghi (bao gồm cả phần thu gọn) một lần nữa.
       Đệm một dấu ngắt dòng sau <pre>: Thứ mà trình phân tích nuốt mất chính là nó, phần thân (bao gồm dòng trống ở đầu) sẽ hiển thị nguyên trạng */
    const contentHtml = msg.collapsed ? '' : `<pre class="rmsg-content">\n${escapeHtml(msg.content)}</pre>`;
    return `
        <div class="rmsg-item ${collapsedClass} ${roleClass}" data-record="${recordIdx}" data-msg="${msgIdx}">
            <div class="rmsg-header">
                <span class="rmsg-expand-icon"><i class="fa-solid fa-chevron-right"></i></span>
                <span class="rmsg-role-badge ${roleClass}">${escapeHtml(roleLabel)}</span>
                ${previewHtml}
                <span class="rmsg-tokens">${tokenPrefix}${msg.tokens} tokens</span>
                <button class="rmsg-copy-btn" data-record="${recordIdx}" data-msg="${msgIdx}" title="复制此消息">
                    <i class="fa-solid fa-copy"></i>
                </button>
            </div>
            ${contentHtml}
        </div>
    `;
}

/* Lắp ráp HTML phần thân bản ghi (Tin nhắn con hiển thị + Reply): Dùng chung cho việc render toàn bộ bảng và tạo bù theo yêu cầu của bản ghi thu gọn.
   Bộ lọc nhân vật lọc từng tin nhắn con một: Chỉ lắp ráp các tin nhắn con hiển thị, data-msg vẫn ghi chỉ mục thực;
   Reply đóng vai trò như một tin nhắn ảo cuối cùng (data-msg = messages.length), có cùng hình thái với các tin nhắn con khác.
   @param {object} rec @param {number} idx @returns {string} */
function buildRecordMessagesHtml(rec, idx) {
    return rec.messages
        .map((msg, mIdx) => ({ msg, mIdx }))
        .filter(({ msg }) => isMessageVisible(msg))
        .map(({ msg, mIdx }) => buildMessageHtml(msg, idx, mIdx))
        .join('')
        + (rec.reply && isMessageVisible(rec.reply)
            ? buildMessageHtml(rec.reply, idx, rec.messages.length)
            : '');
}

/* Bản ghi thu gọn chỉ hiện thanh tiêu đề, phần thân (Tiêu đề tin nhắn con + Phần thân) giữ lại để tạo bù theo yêu cầu khi mở rộng; Cái nào đã tạo thì tái sử dụng trực tiếp.
   Bất kỳ luồng nào cần DOM của phần thân (Mở rộng bản ghi, tìm kiếm và highlight, mở rộng/thu gọn tất cả tin nhắn, di chuyển nhanh xuống đáy) đều phải đi qua đây trước.
   Các bản ghi đã bị hủy tải (unload) khi khuất màn hình: Phần tử và thanh tiêu đề vẫn còn, chỉ có chữ của phần thân bị xóa sạch, lúc này dựa vào needText để quyết định xem có tạo bù lại trước hay không——
   Chỉ cần luồng của phần tử và hình học (Thu gọn tất cả tin nhắn của mục này, di chuyển nhanh xuống đáy) truyền false, tránh việc tạo vô ích toàn bộ phần thân.
   @param {HTMLElement} recordEl @param {boolean} [needText=true] @returns {HTMLElement|null} */
function ensureRecordBody(recordEl, needText = true) {
    if (!recordEl) return null;
    const bodyEl = recordEl.querySelector('.rlog-record-body');
    if (!bodyEl) return null;
    if (bodyEl.dataset.bodyBuilt !== '1') {
        const idx = Number(recordEl.dataset.recordIndex);
        const rec = records[idx];
        if (!rec) return bodyEl;
        bodyEl.innerHTML = buildRecordMessagesHtml(rec, idx);
        bodyEl.dataset.bodyBuilt = '1';
        bodyEl.querySelectorAll('.rmsg-item').forEach(bindMsgItemEvents);
    }
    /* Phần thân bản ghi đã được tạo, nhưng phần thân của một số tin nhắn trong đó đã bị hủy tải khi khuất màn hình: Luồng này muốn đọc phần thân thì phải tạo bù lại trước */
    if (needText) restoreRecordBodies(recordEl);
    return bodyEl;
}

/* Tin nhắn thu gọn chỉ hiện thanh tiêu đề, phần thân giữ lại để tạo bù theo yêu cầu khi mở rộng.
   Cơ sở văn bản và render toàn bộ bảng có cùng nguồn (đi qua toRenderedText), nếu không offset tìm kiếm trong bản ghi sẽ bị lệch so với chữ trên trang.
   Phần tử phần thân đã bị hủy tải khi khuất màn hình vẫn còn (chỉ là chữ bị xóa sạch, chiều cao bị khóa), bắt buộc phải khôi phục trước rồi mới trả về,
   nếu không "Phần tử đã tồn tại" sẽ bị phán đoán nhầm thành phần thân đã sẵn sàng, sau khi mở rộng sẽ nhận được một khoảng trắng.
   @param {HTMLElement} msgItem @returns {HTMLElement|null} */
function ensureMessageContent(msgItem) {
    if (!msgItem) return null;
    const existing = msgItem.querySelector('.rmsg-content');
    if (existing) {
        if (unloadedBodies.has(existing)) restoreBody(existing);
        return existing;
    }
    const msg = getMessageByIndex(records[Number(msgItem.dataset.record)], Number(msgItem.dataset.msg));
    if (!msg) return null;
    const pre = document.createElement('pre');
    pre.className = 'rmsg-content';
    pre.textContent = toRenderedText(msg.content);
    msgItem.appendChild(pre);
    return pre;
}

function renderPanelContent() {
    if (!panelEl) return;

    /* Trước khi dựng lại DOM bắt buộc phải dọn dẹp trạng thái tìm kiếm (Highlight tìm kiếm, hộp tìm kiếm tham chiếu đến node DOM cũ sẽ bị mất hiệu lực) */
    resetSearchIfActive();

    const listEl = panelEl.querySelector('#rlog-list');
    if (!listEl) return;

    /* Bản ghi hiển thị chỉ tính một lần: Chỉ báo "Đã ẩn N" và danh sách render bên dưới dùng chung một bản (Mỗi bản ghi đều phải duyệt qua tin nhắn con để phán đoán bộ lọc nhân vật) */
    const visibleRecords = getVisibleRecords();
    updateHeaderTitle();
    updateFilterIndicator(visibleRecords);

    if (records.length === 0) {
        panelEl.classList.add('rlog-empty-list');
        const emptyMsg = masterEnabled 
            ? '暂无请求记录，请发送消息后查看。'
            : '记录功能已关闭，请点击电源图标开启。';
        listEl.innerHTML = `<div class="rlog-empty">${escapeHtml(emptyMsg)}</div>`;
        pruneDetachedUnloadedBodies();
        panelContentDirty = false;
        return;
    }
    panelEl.classList.remove('rlog-empty-list');

    /* Sau khi lọc không có bản ghi nào để hiển thị: Trạng thái trống chuyên dụng + Reset bằng một click (Phân biệt với "Tạm thời không có bản ghi") */
    if (visibleRecords.length === 0) {
        panelEl.classList.add('rlog-empty-list');
        listEl.innerHTML = `<div class="rlog-empty"><div>没有符合筛选条件的记录</div><button id="rlog-filter-reset-empty" class="rlog-filter-reset-empty-btn">重置筛选</button></div>`;
        const resetBtn = listEl.querySelector('#rlog-filter-reset-empty');
        if (resetBtn) {
            resetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                resetFilters();
            });
        }
        panelContentDirty = false;
        pruneDetachedUnloadedBodies();
        return;
    }

    /* Ghi chiều rộng của slot thẻ trạng thái vào biến CSS: Chỗ chờ và thẻ sau khi đến sẽ dùng chung, tránh việc bố cục thanh tiêu đề bị giật */
    const statusMaxW = getReplyStatusMaxWidth();
    if (statusMaxW > 0) {
        panelEl.style.setProperty('--rlog-status-w', `${statusMaxW}px`);
    }

    /* Chỉ render các bản ghi hiển thị; Bản ghi ghim render trước, bản ghi bình thường theo sau, bên trong nhóm con giữ nguyên thứ tự ban đầu của records (Mới → Cũ).
       data-record-index của DOM ghi chỉ mục thực trong records chứ không phải vị trí hiển thị, luồng lấy dữ liệu theo chỉ mục không cần đổi ngữ nghĩa */
    const displayRecords = visibleRecords.filter(r => r.pinned)
        .concat(visibleRecords.filter(r => !r.pinned));
    const displayIndexes = displayRecords.map((rec) => records.indexOf(rec));
    listEl.innerHTML = displayRecords
        .map((rec, vi) => {
            const idx = displayIndexes[vi];
            const totalTokens = getTotalTokens(rec.messages);
            const collapsedClass = rec.collapsed ? 'collapsed' : 'expanded';
            const pinnedClass = rec.pinned ? 'rlog-pinned' : '';
            const sourceLabel = getSourceLabel(rec.source);
            const sourceClass = getSourceClass(rec.source);
            const sourceType = sourceClass === 'rlog-source-native' ? 'native' : 'plugin';
            const sourceTitle = (rec.source && rec.source.detail) || sourceLabel;

            const allPrecise = rec.messages.every(m => m.tokenPrecise === true);
            const recordTokenPrefix = allPrecise ? '' : '~';

            /* Bản ghi thu gọn chỉ hiện thanh tiêu đề, toàn bộ phần thân giữ lại để ensureRecordBody() tạo bù khi mở rộng */
            const messagesHtml = rec.collapsed ? '' : buildRecordMessagesHtml(rec, idx);

            /* Thẻ trạng thái reply: Chỉ hiển thị giữa nhóm nút và mũi tên thu gọn khi thu gọn; Khi reply đang trên đường đến thì trước tiên xuất ra chỗ chờ trong suốt để chiếm slot,
               sau khi đến sẽ do appendReplyToRecordDom thay thế tại chỗ thành thẻ trạng thái, không bị ngắt dòng lệch vị trí trên màn hình hẹp */
            const recordStatus = getRecordStatus(rec);
            const replyStatusHtml = recordStatus
                ? `<span class="rlog-reply-status rlog-reply-status-${recordStatus}" title="${escapeHtml(getReplyStatusTitle(rec))}">${getReplyStatusLabel(recordStatus)}</span>`
                : (rec.id != null && pendingReplies.has(rec.id)
                    ? '<span class="rlog-reply-status rlog-reply-status-placeholder"></span>'
                    : '');

            return `
                <div class="rlog-record ${collapsedClass} ${pinnedClass}" data-source="${sourceType}" data-record-index="${idx}">
                    <div class="rlog-record-header">
                        <div class="rlog-record-info" title="长按置顶 / 长按取消置顶">
                            <span class="rlog-char-name">${escapeHtml(rec.characterName)}</span>
                            <span class="rlog-source-badge ${sourceClass}" title="${escapeHtml(sourceTitle)}"><span class="rlog-status-dot"></span>${escapeHtml(sourceLabel)}</span>
                            <span class="rlog-time">${escapeHtml(rec.timestamp)}</span>
                            <span class="rlog-model-badge" title="请求模型">${escapeHtml(rec.modelName || '未知模型')}</span>
                            <span class="rlog-total-tokens">${recordTokenPrefix}<span class="rlog-token-num rlog-token-tier-${getTokenTier(totalTokens)}">${totalTokens}</span>&nbsp;tokens [${rec.messages.length}]</span>
                        </div>
                        <div class="rlog-record-actions">
                            <div class="rlog-record-actions-inner" style="display:flex; gap:4px; align-items:center;">
                                <button class="rlog-search-btn" data-record="${idx}" title="搜索本条记录">
                                    <i class="fa-solid fa-magnifying-glass"></i>
                                </button>
                                <button class="rlog-msg-expand-btn" data-record="${idx}" title="展开所有消息">
                                    <i class="fa-solid fa-expand"></i>
                                </button>
                                <button class="rlog-msg-collapse-btn" data-record="${idx}" title="折叠所有消息">
                                    <i class="fa-solid fa-compress-alt"></i>
                                </button>
                                <button class="rlog-jump-bottom-btn" data-record="${idx}" title="快速置底">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="4" x2="12" y2="15"></line><line x1="5" y1="20" x2="19" y2="20"></line></svg>
                                </button>
                                <button class="rlog-read-full-btn" data-record="${idx}" title="查看全文">
                                    <i class="fa-solid fa-file-lines"></i>
                                </button>
                                <button class="rlog-delete-record-btn" data-record="${idx}" title="删除本条记录">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>
                            ${replyStatusHtml}
                            <span class="rlog-toggle-icon"><i class="fa-solid fa-chevron-down"></i></span>
                        </div>
                    </div>
                    <div class="rlog-record-body" data-body-built="${rec.collapsed ? '0' : '1'}">
                        ${messagesHtml}
                    </div>
                </div>
            `;
        })
        .join('');

    bindListEvents(listEl);

    /* Hủy tải tại chỗ phần thân ngoài viewport (Lúc này danh sách đã được mount, có thể đo lường hình học): Lần mở này chỉ cần trả chi phí dàn trang và vẽ cho phần hiển thị.
       Đặt trước syncRecordHeaderVars, việc đo lại chiều cao tiêu đề sau đó sẽ rơi vào giao diện nhẹ nhàng "Phần thân đã được hủy tải" */
    runBodyBandPass(listEl);
    pruneDetachedUnloadedBodies();

    /* Ghi --rlog-rec-h (Chiều cao thực đo của thanh tiêu đề bản ghi) cho mỗi bản ghi, dùng để định vị dính (sticky) cho thanh tiêu đề tin nhắn */
    syncRecordHeaderVars(listEl);

    /* Tạo thanh tiến trình overlay cho khu vực nội dung tin nhắn */
    attachScrollIndicators(listEl);

    /* Render hoàn tất, xóa cờ dirty (Lần sau mở bảng điều khiển không cần dựng lại DOM) */
    panelContentDirty = false;
}

/* Đồng bộ --rlog-rec-h của mỗi bản ghi = Chiều cao thực tế của thanh tiêu đề bản ghi: sticky top của thanh tiêu đề tin nhắn bắt buộc phải bằng nó thì mới dính được
   ngay bên dưới thanh tiêu đề bản ghi, trong khi thanh tiêu đề bản ghi sẽ cao lên do ngắt dòng (trên màn hình hẹp có thể lên tới 100px+), nếu hardcode chiều cao sẽ bị che khuất.
   Chỉ ghi khi bố cục thay đổi, không tham gia vào việc cuộn từng frame.
   Đọc xong tất cả chiều cao một lần rồi mới ghi biến đồng loạt: Ghi biến sẽ làm mất hiệu lực style, việc đọc ghi xen kẽ sẽ biến mỗi lần đọc bản ghi thành một lần buộc tính toán lại bố cục (forced layout). */
function syncRecordHeaderVars(listEl) {
    if (!listEl) return;
    ensureSharedResizeObserver();
    /* Dọn dẹp các mục tiêu quan sát cũ không còn trong danh sách (renderPanelContent dùng innerHTML để dựng lại DOM) */
    const currentHeaders = new Set(listEl.querySelectorAll('.rlog-record-header'));
    observedRecordHeaders.forEach((headerEl) => {
        if (!currentHeaders.has(headerEl)) {
            sharedResizeObserver.unobserve(headerEl);
            observedRecordHeaders.delete(headerEl);
        }
    });
    const measured = [];
    listEl.querySelectorAll('.rlog-record').forEach((recordEl) => {
        const headerEl = recordEl.querySelector('.rlog-record-header');
        if (!headerEl) return;
        /* Dùng getBoundingClientRect().height (số thập phân) thay vì offsetHeight (làm tròn):
           Chiều cao ngắt dòng thường là số thập phân, việc làm tròn sẽ để lại khe hở sub-pixel giữa tiêu đề tin nhắn và tiêu đề bản ghi */
        measured.push([recordEl, headerEl.getBoundingClientRect().height]);
        /* Khi chiều cao thanh tiêu đề thay đổi (Ngắt dòng/Font chữ/Viewport thay đổi) sẽ tự động làm mới offset */
        if (!observedRecordHeaders.has(headerEl)) {
            observedRecordHeaders.add(headerEl);
            /* Quan sát border-box: --rlog-rec-h ghi chính là chiều cao của border-box (bao gồm padding), trong khi content-box mặc định
               sẽ không thông báo khi "Chỉ có padding thay đổi", sẽ bỏ sót loại thay đổi chiều cao này dẫn đến offset dính không được cập nhật */
            sharedResizeObserver.observe(headerEl, { box: 'border-box' });
        }
    });
    measured.forEach(([recordEl, height]) => {
        recordEl.style.setProperty('--rlog-rec-h', `${height.toFixed(2)}px`);
    });
}

/* boolean: Đã có lệnh đo lại do "Kích thước viewport thay đổi" được xếp vào frame tiếp theo hay chưa (Các resize liên tiếp được gộp thành một lần trên một frame) */
let viewportSyncQueued = false;

/* number|null: Chiều cao bảng điều khiển (px) bị đóng băng trong thời gian focus nhập tìm kiếm (phiên bàn phím ảo); null = Chưa đóng băng.
   Chỉ có hiệu lực trên thiết bị di động: Bàn phím sẽ thu hẹp viewport bố cục, nếu chiều cao bảng điều khiển tiếp tục dùng vh thì sẽ bị cao lên thấp xuống theo, kéo theo việc kích hoạt
   đo lại độ dính / làm mới thanh tiến trình / bảo trì băng thông phần thân cùng các tác vụ nặng khác. */
let searchKeyboardFreezeHeight = null;
/* HTMLElement|null: Hộp nhập tìm kiếm đã kích hoạt lần đóng băng chiều cao bảng điều khiển này (Dọn dẹp khi hủy đóng băng) */
let searchKeyboardFreezeInput = null;
/* Array<[string,string,string]>|null: Snapshot giá trị gốc của các thuộc tính inline height/min-height/max-height của bảng điều khiển trước khi đóng băng
   (Bao gồm độ ưu tiên), khi hủy đóng băng sẽ khôi phục nguyên trạng —— Không làm thay đổi kích thước bảng điều khiển sau khi người dùng kéo thả thu phóng thủ công */
let searchKeyboardFreezeStyleSnapshot = null;

/* Phán đoán viewport di động: Nhất quán với breakpoint của style (Breakpoint duy nhất 768px) */
function isMobileViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
}

/* Đóng băng chiều cao bảng điều khiển trong thời gian focus nhập tìm kiếm (Chỉ thiết bị di động): Bàn phím sẽ thu hẹp viewport bố cục, nếu chiều cao bảng điều khiển tiếp tục do vh quyết định
   thì sẽ cao lên thấp xuống theo, kéo theo kích hoạt đo lại độ dính / làm mới thanh tiến trình / bảo trì băng thông phần thân (Hủy tải và khôi phục hàng loạt), khi nhập
   sẽ giật lag rõ rệt. Ở đây, tại khoảnh khắc focus (Viewport chưa thu hẹp), ghi lại chiều cao thực đo của bảng điều khiển và dùng inline !important để đóng đinh; Trước tiên tạo snapshot
   kích thước inline vốn có, khi hủy sẽ khôi phục nguyên trạng, kết quả kéo thả thu phóng thủ công của người dùng không bị ảnh hưởng. */
function freezePanelForSearchKeyboard(inputEl) {
    if (!panelEl || !inputEl || searchKeyboardFreezeHeight !== null) return;
    if (!isMobileViewport()) return;
    const height = panelEl.getBoundingClientRect().height;
    if (!(height > 0)) return;
    const props = ['height', 'min-height', 'max-height'];
    searchKeyboardFreezeStyleSnapshot = props.map((prop) => [
        prop,
        panelEl.style.getPropertyValue(prop),
        panelEl.style.getPropertyPriority(prop),
    ]);
    searchKeyboardFreezeHeight = height;
    searchKeyboardFreezeInput = inputEl;
    const value = height.toFixed(2) + 'px';
    props.forEach((prop) => panelEl.style.setProperty(prop, value, 'important'));
}

/* Hủy đóng băng chiều cao bảng điều khiển của phiên bàn phím tìm kiếm: Khôi phục snapshot kích thước inline, rồi chạy bù đồng bộ viewport một lần
   (Các tác vụ nặng bị bỏ qua trong thời gian đóng băng sẽ được thực thi đồng loạt trong frame này) */
function unfreezePanelForSearchKeyboard() {
    if (searchKeyboardFreezeHeight === null) return;
    searchKeyboardFreezeHeight = null;
    searchKeyboardFreezeInput = null;
    if (panelEl && searchKeyboardFreezeStyleSnapshot) {
        searchKeyboardFreezeStyleSnapshot.forEach(([prop, value, priority]) => {
            if (value) panelEl.style.setProperty(prop, value, priority);
            else panelEl.style.removeProperty(prop);
        });
    }
    searchKeyboardFreezeStyleSnapshot = null;
    scheduleViewportSync();
}

/* Sau khi bàn phím hiện lên, nếu hộp tìm kiếm rơi ra ngoài khu vực nhìn thấy (Cạnh dưới bảng điều khiển bị đóng băng bị bàn phím che mất), thì cuộn thanh tiêu đề bản ghi đó (bao gồm hộp tìm kiếm)
   cho đến khi "Lộ ra hoàn toàn" —— Chỉ bù phần không lộ ra (Bên dưới bị bàn phím chặn thì cuộn lên vừa đủ lộ cạnh dưới, bên trên bị
   cạnh trên danh sách cắt mất thì cuộn xuống vừa đủ lộ cạnh trên), không trực tiếp đưa thanh tiêu đề lên đỉnh; Nếu đã hiển thị hoàn toàn thì không động đến, không làm bất kỳ việc dựng lại hay đo lại nào. */
function ensureSearchInputVisible() {
    if (searchKeyboardFreezeHeight === null) return;
    const inputEl = searchKeyboardFreezeInput;
    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    if (!inputEl || !inputEl.isConnected || !listEl) return;
    const listRect = listEl.getBoundingClientRect();
    const headerEl = inputEl.closest('.rlog-record-header');
    if (!headerEl) return;
    const headerRect = headerEl.getBoundingClientRect();
    /* Cận dưới hiển thị lấy giá trị nhỏ hơn giữa "Cạnh dưới danh sách" và "Chiều cao viewport bố cục": Khi bàn phím Android ép trang,
       window.innerHeight chính là cạnh trên của bàn phím, trong khi cạnh dưới bảng điều khiển bị đóng băng có thể rơi xuống dưới nó */
    const visibleTop = listRect.top;
    const visibleBottom = Math.min(listRect.bottom, window.innerHeight);
    const margin = 8;
    /* Chỉ bù phần bị thiếu: Số dương = Cuộn lên lộ cạnh dưới, Số âm = Cuộn xuống lộ cạnh trên */
    let delta = 0;
    if (headerRect.bottom > visibleBottom - margin) {
        delta = headerRect.bottom - (visibleBottom - margin);
    } else if (headerRect.top < visibleTop + margin) {
        delta = headerRect.top - (visibleTop + margin);
    }
    if (delta !== 0) listEl.scrollTop += delta;
}

/* Điểm vào đo lại khi kích thước viewport/bảng điều khiển thay đổi: Việc thanh địa chỉ thu/mở, bàn phím hiện lên, kéo thả thu phóng sẽ liên tục kích hoạt resize,
   nếu mỗi lần đều đo lại toàn bộ thanh tiêu đề bản ghi sẽ làm tăng chi phí lên gấp bội, do đó gộp lại thực thi đồng loạt một lần vào frame tiếp theo.
   Việc gộp chỉ giảm số lần thực thi, không thu hẹp nội dung đo lại —— Kích thước thay đổi cuối cùng vẫn sẽ phản ánh vào offset dính. */
function scheduleViewportSync() {
    if (viewportSyncQueued) return;
    viewportSyncQueued = true;
    requestAnimationFrame(() => {
        viewportSyncQueued = false;
        /* Trong phiên bàn phím tìm kiếm, chiều cao bảng điều khiển đã bị đóng băng, hình học của RRL không có thay đổi: Bỏ qua các tác vụ nặng, chỉ xác nhận dự phòng rằng hộp nhập hiển thị */
        if (searchKeyboardFreezeHeight !== null) {
            ensureSearchInputVisible();
            return;
        }
        syncRecordHeaderVars(panelEl && panelEl.querySelector('#rlog-list'));
        /* Viewport thay đổi kích thước có thể làm thay đổi toàn bộ bố cục (Media query chuyển đổi padding/cỡ chữ...), chưa chắc đã đi kèm với thay đổi kích thước của bản thân khu vực nội dung,
           ở đây giữ lại một lần cập nhật toàn bộ dự phòng (Cập nhật định hướng chỉ bao phủ "Những thay đổi kích thước quan sát được") */
        requestThumbUpdate();
        /* Viewport thay đổi cũng có thể làm thay đổi chiều rộng ngắt dòng của phần thân (Breakpoint Desktop ↔ Mobile): Bảo trì băng thông bên trong sẽ phát hiện chiều rộng và dựng lại chiều cao chiếm chỗ */
        scheduleBodyBandPass(panelEl && panelEl.querySelector('#rlog-list'));
        /* Đồng bộ kích thước floating badge khi chuyển đổi Desktop ↔ Mobile */
        updateBadgeSize();
        /* Khi floating badge hiển thị, nó sẽ bị kẹp lại vào khu vực nhìn thấy theo sự thay đổi của viewport; Không giới hạn trạng thái thu gọn —— Ở chế độ lối vào mặc định, floating badge cũng sẽ hiển thị ở trạng thái không thu gọn */
        if (badgeEl && badgeEl.classList.contains('rlog-badge-active')) {
            const pos = clampBadgeToViewport(
                parseFloat(badgeEl.style.left) || 0,
                parseFloat(badgeEl.style.top) || 0
            );
            badgeEl.style.left = pos.left + 'px';
            badgeEl.style.top = pos.top + 'px';
            /* Đồng bộ cập nhật vị trí bản ghi trong phiên sau khi resize */
            badgePos = pos;
        }
    });
}

/* Neo cuộn (Scroll anchoring): So sánh vị trí của mỏ neo trong viewport trước và sau hành động, nếu dịch lên trên quá 1px thì dùng khoảng chênh lệch vị trí để hiệu chỉnh cuộn ngược lại.
   Chỉ giữ giá trị scrollTop là chưa đủ —— Giá trị khôi phục sẽ bị trình duyệt im lặng kẹp vào giới hạn mới, thanh tiêu đề dính cũng sẽ bị tuột và rơi xuống theo khi container thấp đi.
   Các thao tác loại thu gọn bắt buộc phải truyền anchorEl (Thanh tiêu đề bản ghi/tin nhắn được click), nếu không khe hở kẹp sẽ còn sót lại; Loại mở rộng có thể không truyền.
   @param {Function} action @param {HTMLElement|null} [anchorEl] */
function preserveScrollTop(action, anchorEl) {
    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    if (!listEl) { action(); return; }
    const saved = listEl.scrollTop;
    /* Vị trí của phần tử mỏ neo so với đỉnh khu vực nhìn thấy của danh sách trước khi thao tác (Khi dính thì chính là vị trí dính) */
    let beforeRelTop = null;
    if (anchorEl) {
        beforeRelTop = anchorEl.getBoundingClientRect().top - listEl.getBoundingClientRect().top;
    }
    action();
    listEl.scrollTop = saved;
    /* Khi mỏ neo dịch lên trên quá 1px (Do kẹp hoặc tuột dính) thì dùng chênh lệch vị trí để hiệu chỉnh ngược lại; Dịch xuống (Dính chặt) là hành vi bình thường */
    if (anchorEl && beforeRelTop !== null) {
        const curRelTop = anchorEl.getBoundingClientRect().top - listEl.getBoundingClientRect().top;
        if (curRelTop - beforeRelTop < -1) {
            listEl.scrollTop = listEl.scrollTop + (curRelTop - beforeRelTop);
        }
    }
    /* Thu gọn/Mở rộng sẽ làm thay đổi chiều cao danh sách, có thể kéo trực tiếp nội dung ngoài viewport (ngoài băng thông) vào viewport —— Loại thay đổi này không có sự kiện cuộn,
       bắt buộc phải sắp xếp bù một lần bảo trì băng thông, nếu không phần thân được đưa lên thế chỗ vẫn sẽ là chỗ chiếm có chiều cao bằng nhau (Biểu hiện là "Chỉ có thanh tiêu đề, phần thân trống không") */
    scheduleBodyBandPass(listEl);
}

/* Liên kết sự kiện tương tác cho từng mục tin nhắn đơn lẻ (Thu gọn/mở rộng thanh tiêu đề + Nút copy), dùng chung cho render toàn bộ bảng và nối thêm reply.
   @param {HTMLElement} msgItem Phần tử .rmsg-item */
function bindMsgItemEvents(msgItem) {
    const header = msgItem.querySelector('.rmsg-header');
    if (header) {
        header.addEventListener('click', function (e) {
            if (e.target.closest('button')) return;
            const item = this.closest('.rmsg-item');
            const recIdx = Number(item.dataset.record);
            const msgIdx = Number(item.dataset.msg);
            preserveScrollTop(() => {
                toggleMessageCollapse(recIdx, msgIdx, item);
            }, header);
        });
    }
    const copyBtn = msgItem.querySelector('.rmsg-copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            const recIdx = Number(this.dataset.record);
            const msgIdx = Number(this.dataset.msg);
            copySingleMessage(recIdx, msgIdx, this);
        });
    }
}

function bindListEvents(listEl) {
    listEl.querySelectorAll('.rmsg-item').forEach(bindMsgItemEvents);

    listEl.querySelectorAll('.rlog-record-header').forEach((header) => {
        /* boolean: Điểm bắt đầu của lần nhấn này có nằm trong hộp tìm kiếm hay không (Khi kéo chọn chữ vượt ra ngoài sẽ không kích hoạt thu gọn) */
        let mouseDownInSearchBox = false;
        header.addEventListener('mousedown', (e) => {
            mouseDownInSearchBox = e.target.closest('.rlog-search-box') !== null;
        });
        header.addEventListener('touchstart', (e) => {
            mouseDownInSearchBox = e.target.closest('.rlog-search-box') !== null;
        });
        header.addEventListener('click', function (e) {
            /* Sau khi nhấn giữ để ghim, native click được kích hoạt lần này sẽ không thu gọn/mở rộng bản ghi nữa */
            if (suppressRecordHeaderClick) {
                suppressRecordHeaderClick = false;
                return;
            }
            if (e.target.closest('button')) return;
            /* Khu vực hộp tìm kiếm (Hộp nhập/Bộ đếm/Khoảng trống) không kích hoạt thu gọn/mở rộng, giữ trạng thái tìm kiếm ổn định */
            if (e.target.closest('.rlog-search-box')) return;
            /* Khi nhấn từ trong hộp tìm kiếm, kéo ra ngoài rồi thả ra thì mục tiêu click là tổ tiên chung header, không nên kích hoạt thu gọn/mở rộng */
            if (mouseDownInSearchBox) return;
            const recordEl = this.closest('.rlog-record');
            const idx = Number(recordEl.dataset.recordIndex);
            /* Giữ nguyên vị trí cuộn khi mở rộng/thu gọn bản ghi đơn lẻ (Thanh tiêu đề cố định trong viewport, nội dung chỉ mở rộng xuống dưới) */
            preserveScrollTop(() => {
                toggleRecordCollapse(idx, recordEl);
            }, this);
        });

        /* Nhấn giữ thanh tiêu đề bản ghi để chuyển đổi ghim (Pointer Events: Di chuyển quá dung sai hoặc nhấc lên sớm sẽ hủy bỏ);
           Sau khi kích hoạt nhấn giữ thì ức chế click tiếp theo, tránh xung đột với click đơn để thu gọn/mở rộng */
        let longPressTimer = null;
        let activePointerId = null;
        let currentPointerType = null;
        let startX = 0;
        let startY = 0;

        const cancelLongPress = () => {
            if (longPressTimer !== null) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
            if (activePointerId !== null && header.hasPointerCapture) {
                /* Thử giải phóng capture; Bỏ qua ngoại lệ */
                try { header.releasePointerCapture(activePointerId); } catch (err) { /* ignore */ }
            }
            activePointerId = null;
        };

        /* Có nên bỏ qua nhấn giữ hay không: Loại trừ các nút thật và hộp tìm kiếm, các khoảng trống/trạng thái còn lại không che chắn mang tính phòng thủ */
        const isLongPressExcluded = (e) => e.target.closest('button') !== null
            || e.target.closest('.rlog-search-box') !== null;

        header.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            if (isLongPressExcluded(e)) return;
            const recordEl = header.closest('.rlog-record');
            if (!recordEl) return;
            const index = Number(recordEl.dataset.recordIndex);
            cancelLongPress();
            currentPointerType = e.pointerType;
            activePointerId = e.pointerId;
            startX = e.clientX;
            startY = e.clientY;
            /* Chuột: Capture tường minh để vẫn nhận được pointermove khi di chuyển quá dung sai; Màn hình cảm ứng dùng capture ngầm định + touch-action để kiểm soát cuộn */
            if (e.pointerType !== 'touch') {
                try { header.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            }
            longPressTimer = setTimeout(() => {
                longPressTimer = null;
                suppressRecordHeaderClick = true;
                setTimeout(() => { suppressRecordHeaderClick = false; }, 50);
                /* Chỉ thiết bị di động: Sau khi nhấn giữ để sắp xếp lại, ức chế hover mô phỏng cảm ứng của bản ghi thế chỗ, nhấc ngón tay lên sẽ khôi phục bình thường */
                if (currentPointerType === 'touch') beginHoverSuppress();
                toggleRecordPinned(index, header);
            }, LONG_PRESS_MS);
        });

        header.addEventListener('pointermove', (e) => {
            if (longPressTimer === null) return;
            const dx = Math.abs(e.clientX - startX);
            const dy = Math.abs(e.clientY - startY);
            if (dx > LONG_PRESS_MOVE_TOLERANCE || dy > LONG_PRESS_MOVE_TOLERANCE) {
                cancelLongPress();
            }
        });

        header.addEventListener('pointerup', () => cancelLongPress());
        header.addEventListener('pointercancel', () => cancelLongPress());
        /* Nhấn giữ thanh tiêu đề không phải nút trên thiết bị di động sẽ không hiện menu hệ thống (Nút/Hộp tìm kiếm giữ nguyên hành vi gốc) */
        header.addEventListener('contextmenu', (e) => {
            if (isLongPressExcluded(e)) return;
            e.preventDefault();
        });
    });

    listEl.querySelectorAll('.rlog-search-btn').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const idx = Number(this.dataset.record);
            if (searchState && searchState.recordIndex === idx) {
                closeSearch();
            } else {
                openSearchForRecord(idx);
            }
        });
    });

    listEl.querySelectorAll('.rlog-read-full-btn').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const idx = Number(this.dataset.record);
            openReadFullOverlay(idx);
        });
    });

    listEl.querySelectorAll('.rlog-msg-collapse-btn').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const idx = Number(this.dataset.record);
            /* Sau khi thu gọn tất cả tin nhắn thì phải về đỉnh, không thể giữ nguyên vị trí cuộn nữa (preserveScrollTop sẽ triệt tiêu việc về đỉnh) */
            collapseRecordMessages(idx);
        });
    });

    listEl.querySelectorAll('.rlog-msg-expand-btn').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const idx = Number(this.dataset.record);
            preserveScrollTop(() => {
                expandRecordMessages(idx);
            });
        });
    });

    listEl.querySelectorAll('.rlog-jump-bottom-btn').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const idx = Number(this.dataset.record);
            scrollToRecordBottom(idx);
        });
    });

    listEl.querySelectorAll('.rlog-delete-record-btn').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const idx = Number(this.dataset.record);
            const record = records[idx];
            if (!record) return;

            showConfirmDialog({
                title: '删除单条记录',
                message: `确定要删除 <strong>${escapeHtml(record.characterName)}</strong> 的这条请求记录吗？<br>（${escapeHtml(record.timestamp)}，共 ${record.messages.length} 条消息）<br>此操作不可撤销。`,
                confirmText: '删除',
                cancelText: '取消',
                onConfirm: () => {
                    deleteRecord(idx);
                },
            });
        });
    });

}

/* ── Thu gọn mở rộng và Nhấp nháy khi về đỉnh ────────────────────── */

function toggleRecordCollapse(index, recordEl) {
    /* Thoát chế độ tìm kiếm khi thu gọn bản ghi (Thu gọn sẽ làm thay đổi khả năng hiển thị của khu vực nội dung, trạng thái tìm kiếm không nên được giữ lại) */
    resetSearchIfActive();
    records[index].collapsed = !records[index].collapsed;
    if (records[index].collapsed) {
        /* Sau khi thu gọn nội dung danh sách sẽ thấp đi, trình duyệt sẽ ép scrollTop về lại đỉnh; Chỉ khi đã cuộn trước khi thu gọn,
           và sau khi thu gọn thực sự chạm đỉnh, thì mới coi là đã xảy ra việc về đỉnh */
        const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
        const wasScrolled = !!(listEl && listEl.scrollTop > 1);
        recordCollapseToppedEl = null;
        /* Cắt ngang nhấp nháy chạm đáy đang diễn ra khi thu gọn bản ghi (Sau khi mở rộng sẽ không phát lại nữa) */
        clearHeaderFlash(recordEl);
        recordEl.classList.add('collapsed');
        recordEl.classList.remove('expanded');
        if (wasScrolled && listEl && listEl.scrollTop === 0) {
            recordCollapseToppedEl = recordEl;
        }
    } else {
        recordEl.classList.add('expanded');
        recordEl.classList.remove('collapsed');
        /* Bắt buộc phải tạo bù phần thân trước: "Về đỉnh xong nhấp nháy tiêu đề tin nhắn con đầu tiên" phải lấy mục tiêu trong cây con mới tạo này */
        ensureRecordBody(recordEl);
        /* Chỉ khi lần thu gọn này thực sự ép danh sách về lại đỉnh, thì mới nhấp nháy gợi ý cho thanh tiêu đề của tin nhắn con đầu tiên;
           Dừng ở đỉnh rồi thu gọn/mở rộng lặp đi lặp lại, hoặc mở rộng bình thường sau khi xuất hiện bản ghi mới đều không nhấp nháy */
        if (recordCollapseToppedEl === recordEl) {
            const firstMsgHeader = recordEl.querySelector('.rmsg-item .rmsg-header');
            if (firstMsgHeader) triggerHeaderFlash(firstMsgHeader);
        }
        recordCollapseToppedEl = null;
        /* Sau khi mở rộng bản ghi, tạo lười (lazy create) thanh tiến trình cho khu vực nội dung tin nhắn (Chỉ tạo ngay trong viewport, còn lại trì hoãn) */
        queueScrollbarsForEls(recordEl.querySelectorAll('.rmsg-content'));
    }
}

/* Chuyển đổi ghim tạm thời của bản ghi đơn lẻ: Việc ghim không chiếm giới hạn bản ghi bình thường, không bị dọn dẹp tự động; Khi ghim sẽ thu gọn toàn bộ (trạng thái thu gọn của tin nhắn con không đổi);
   Bỏ ghim sẽ không tự động mở rộng, khôi phục việc tham gia dọn dẹp; Không chủ động cuộn, chỉ dùng toast để phản hồi. */
function toggleRecordPinned(index, infoEl) {
    if (index < 0 || index >= records.length) return;
    const record = records[index];
    if (!record) return;

    resetSearchIfActive();

    record.pinned = !record.pinned;
    if (record.pinned && !record.collapsed) {
        record.collapsed = true;
    }

    panelContentDirty = true;
    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    const prevScrollTop = listEl ? listEl.scrollTop : 0;
    if (panelEl && isPanelVisible) {
        renderPanelContent();
        /* Giữ nguyên vị trí cuộn hiện tại sau khi render dựng lại (Ghim/Bỏ ghim không chủ động nhảy đến chỗ có bản ghi) */
        if (listEl && listEl.isConnected) {
            const maxScroll = Math.max(0, listEl.scrollHeight - listEl.clientHeight);
            listEl.scrollTop = Math.min(prevScrollTop, maxScroll);
        }
    }

    showPinToast(record.pinned
        ? '已置顶，不受普通记录清理影响'
        : '已取消置顶，将重新参与普通记录清理');
}

/* Hiển thị toast gọn nhẹ (Căn giữa đỉnh bảng điều khiển, dùng chung cho Ghim/Xóa sạch/Theo dõi theme và Lối vào chiếm chỗ...);
   Nhiều lần liên tiếp chỉ thay thế văn bản, reset bộ đếm thời gian, không xếp chồng.
   @param {string} text Chữ gợi ý
   @param {{persist?: boolean}} [options] Khi persist=true sẽ hiển thị liên tục không tự biến mất (Dùng để mô phỏng gợi ý trạng thái đang xử lý...),
   Sẽ bị thay thế/loại bỏ bởi toast tiếp theo hoặc click đóng */
function showPinToast(text, options = {}) {
    if (!panelEl) return;
    if (!pinToastEl) pinToastEl = panelEl.querySelector('#rlog-pin-toast');
    if (!pinToastEl) return;
    if (pinToastTimer !== null) clearTimeout(pinToastTimer);
    pinToastEl.textContent = text;
    pinToastEl.classList.add('rlog-pin-toast-active');
    pinToastTimer = options.persist ? null : setTimeout(hidePinToast, PIN_TOAST_DURATION_MS);
}

function hidePinToast() {
    if (pinToastTimer !== null) {
        clearTimeout(pinToastTimer);
        pinToastTimer = null;
    }
    if (pinToastEl) {
        pinToastEl.classList.remove('rlog-pin-toast-active');
    }
}

/* Trong quá trình nhấn giữ để sắp xếp lại trên thiết bị di động, thêm class tạm thời cho #rlog-list, để bản ghi thế chỗ không bị highlight vô cớ do mô phỏng hover cảm ứng */
function beginHoverSuppress() {
    if (!panelEl) return;
    const listEl = panelEl.querySelector('#rlog-list');
    if (!listEl) return;
    listEl.classList.add('rlog-hover-suppress');
    if (hoverSuppressBound) return;
    hoverSuppressBound = true;

    const end = () => {
        if (!hoverSuppressBound) return;
        hoverSuppressBound = false;
        const cur = panelEl ? panelEl.querySelector('#rlog-list') : null;
        if (cur) cur.classList.remove('rlog-hover-suppress');
        document.removeEventListener('pointerdown', end, { capture: true });
        document.removeEventListener('pointermove', onMouseMove, { capture: true });
    };

    const onMouseMove = (e) => { if (e.pointerType === 'mouse') end(); };

    /* Class ức chế không bị xóa theo pointerup/pointercancel của cử chỉ lần này (Màn hình cảm ứng sẽ còn sót lại :hover, việc sắp xếp lại còn có thể kích hoạt
       pointercancel), đổi thành xóa vào lần pointerdown / pointermove của chuột tiếp theo; Không cài đặt timeout dự phòng,
       nếu không hover còn sót lại sau khi tự động khôi phục ức chế sẽ lại trồi lên */
    document.addEventListener('pointerdown', end, { capture: true });
    document.addEventListener('pointermove', onMouseMove, { capture: true });
}

function toggleMessageCollapse(recIdx, msgIdx, msgItem) {
    /* Thu gọn/Mở rộng tin nhắn thuộc về thao tác nội bộ của bản ghi đơn lẻ, không thoát chế độ tìm kiếm (Highlight tìm kiếm vẫn được giữ trong DOM) */
    const record = records[recIdx];
    if (!record) return;
    const msg = getMessageByIndex(record, msgIdx);
    if (!msg) return;
    msg.collapsed = !msg.collapsed;
    if (msg.collapsed) {
        /* Cắt ngang nhấp nháy chạm đáy đang diễn ra khi thu gọn tin nhắn (Sau khi mở rộng sẽ không phát lại nữa) */
        clearHeaderFlash(msgItem);
        msgItem.classList.add('collapsed');
        msgItem.classList.remove('expanded');
    } else {
        msgItem.classList.add('expanded');
        msgItem.classList.remove('collapsed');
        const contentEl = ensureMessageContent(msgItem);
        if (contentEl) {
            contentEl.scrollTop = 0; /* Khi mở rộng lại sau khi thu gọn, xem từ đỉnh nội dung tin nhắn */
            createScrollbarForContent(contentEl);
        }
    }
}

/* Lấy tin nhắn theo chỉ mục tin nhắn: N tin nhắn đầu tiên là record.messages, tin nhắn ảo cuối cùng là reply (data-msg = messages.length)
   @param {object} record @param {number} msgIdx @returns {object|null} */
function getMessageByIndex(record, msgIdx) {
    if (!record) return null;
    if (msgIdx < record.messages.length) return record.messages[msgIdx];
    if (msgIdx === record.messages.length) return record.reply || null;
    return null;
}

/* "Thu gọn tất cả các mục" trên thanh tiêu đề: Thu gọn tất cả bản ghi và tất cả tin nhắn bên trong chúng */
function collapseAllEntries() {
    resetSearchIfActive();
    if (records.length === 0) return;
    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    clearHeaderFlash(listEl);
    records.forEach((r, i) => {
        r.collapsed = true;
        r.messages.forEach(m => { m.collapsed = true; });
        if (r.reply) r.reply.collapsed = true;
        const recordEl = panelEl.querySelector(`.rlog-record[data-record-index="${i}"]`);
        if (recordEl) {
            recordEl.classList.add('collapsed');
            recordEl.classList.remove('expanded');
            recordEl.querySelectorAll('.rmsg-item').forEach(el => {
                el.classList.add('collapsed');
                el.classList.remove('expanded');
            });
        }
    });
    if (listEl) listEl.scrollTop = 0;
    /* Sau khi về đỉnh, nhấp nháy gợi ý cho mục mới nhất ở trên cùng */
    flashTopHint();
    /* Thu gọn toàn bộ bản ghi cùng một lúc sẽ làm chiều cao danh sách giảm mạnh, nội dung di chuyển lên trên: Sắp xếp bù một lần bảo trì băng thông, tránh việc khoảng trắng thế chỗ */
    scheduleBodyBandPass(listEl);
}

/* "Thu gọn tất cả tin nhắn" của bản ghi đơn lẻ: Thu gọn tin nhắn của tất cả các nhân vật trong bản ghi này, cuộn lại thanh tiêu đề tin nhắn nhân vật trên cùng trong mục này và nhấp nháy
   (Mục tiêu định vị và nhấp nháy chỉ nhận diện bản ghi này, khác với "Thu gọn tất cả các mục" của thanh tiêu đề chính là quay về đỉnh danh sách)
   @param {number} index Chỉ mục bản ghi */
function collapseRecordMessages(index) {
    /* Tin nhắn đang tìm kiếm sau khi thu gọn thì highlight không còn ý nghĩa, thoát chế độ tìm kiếm trước */
    resetSearchIfActive();
    const record = records[index];
    if (!record || !record.messages) return;

    record.messages.forEach(m => { m.collapsed = true; });
    if (record.reply) record.reply.collapsed = true;

    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    const recordEl = listEl ? listEl.querySelector(`.rlog-record[data-record-index="${index}"]`) : null;
    if (recordEl) {
        /* Chỉ cần phần tử và hình học (Thu gọn class name + Định vị + Mục tiêu nhấp nháy đều là thanh tiêu đề), không cần phải tạo bù lại phần thân */
        ensureRecordBody(recordEl, false);
        /* Cắt ngang nhấp nháy chạm đáy đang diễn ra khi thu gọn tất cả tin nhắn của mục này (Sau khi mở rộng sẽ không phát lại nữa) */
        clearHeaderFlash(recordEl);
        recordEl.querySelectorAll('.rmsg-item').forEach(el => {
            el.classList.add('collapsed');
            el.classList.remove('expanded');
        });
        /* Cuộn lại về bản ghi này (Thanh tiêu đề tin nhắn dính bên dưới thanh tiêu đề của bản ghi này), không quay về đỉnh danh sách nữa */
        scrollToRecordEl(recordEl);
        /* Nhấp nháy thanh tiêu đề tin nhắn nhân vật trên cùng trong mục này (Thứ tự DOM đầu tiên chính là trên cùng; Bộ lọc nhân vật đã có hiệu lực ở giai đoạn render) */
        triggerHeaderFlash(recordEl.querySelector('.rmsg-header'));
        /* Thu gọn tất cả tin nhắn của mục này sẽ làm nội dung bên dưới di chuyển lên trên (Có thể bị kéo vào viewport): Sắp xếp bù một lần bảo trì băng thông */
        scheduleBodyBandPass(listEl);
    }
}

/* "Mở rộng tất cả tin nhắn" của bản ghi đơn lẻ: Mở rộng tin nhắn của tất cả các nhân vật trong bản ghi này
   @param {number} index Chỉ mục bản ghi */
function expandRecordMessages(index) {
    const record = records[index];
    if (!record || !record.messages) return;

    record.messages.forEach(m => { m.collapsed = false; });
    if (record.reply) record.reply.collapsed = false;

    const recordEl = panelEl.querySelector(`.rlog-record[data-record-index="${index}"]`);
    if (recordEl) {
        ensureRecordBody(recordEl);
        recordEl.querySelectorAll('.rmsg-item').forEach(el => {
            el.classList.add('expanded');
            el.classList.remove('collapsed');
            ensureMessageContent(el);
        });
        /* Tạo lười (lazy create) thanh tiến trình cho khu vực nội dung tin nhắn (Chỉ tạo ngay trong viewport, còn lại trì hoãn) */
        queueScrollbarsForEls(recordEl.querySelectorAll('.rmsg-content'));
        /* Mở rộng sẽ làm nội dung bên dưới di chuyển xuống dưới, đẩy nội dung ngoài băng thông phía trên vào viewport: Sắp xếp bù một lần bảo trì băng thông */
        scheduleBodyBandPass(panelEl.querySelector('#rlog-list'));
    }
}

/* "Di chuyển nhanh xuống đáy" của bản ghi đơn lẻ: Cuộn đến tin nhắn con cuối cùng của mục này (Có reply thì là Response) và làm thanh tiêu đề của nó nhấp nháy;
   Chỉ định vị + Nhấp nháy, không đổi bất kỳ trạng thái thu gọn/mở rộng nào. @param {number} index */
function scrollToRecordBottom(index) {
    if (!panelEl) return;
    const listEl = panelEl.querySelector('#rlog-list');
    const recordEl = listEl.querySelector(`.rlog-record[data-record-index="${index}"]`);
    if (!recordEl) return;
    /* Chỉ định vị và nhấp nháy theo thanh tiêu đề của tin nhắn con cuối cùng, không cần chữ của phần thân */
    ensureRecordBody(recordEl, false);

    const lastItemEl = recordEl.querySelector('.rmsg-item:last-child');
    if (!lastItemEl) return;
    const headerEl = lastItemEl.querySelector('.rmsg-header');
    if (!headerEl) return;

    /* Tính toán vị trí logic của thanh tiêu đề trong nội dung danh sách: Ở trạng thái dính, getBoundingClientRect trả về vị trí
       sau khi dính chứ không phải vị trí tự nhiên, do đó dùng item rect không sticky + offsetTop của thanh tiêu đề so với item để suy ra */
    const listRect = listEl.getBoundingClientRect();
    const itemRect = lastItemEl.getBoundingClientRect();
    const headerTopInList = listEl.scrollTop + itemRect.top - listRect.top + headerEl.offsetTop;

    const recordHeaderEl = recordEl.querySelector('.rlog-record-header');
    /* Điểm rơi chỉ tính theo thanh tiêu đề bản ghi (Không cộng dồn thanh tiêu đề tin nhắn); offsetHeight là chiều cao của bản thân phần tử, không thay đổi theo trạng thái dính */
    const stickyHeight = recordHeaderEl ? recordHeaderEl.offsetHeight : 0;
    /* Thanh tiêu đề mục tiêu rơi xuống dưới thanh tiêu đề bản ghi, vị trí lấy theo tỷ lệ khu vực nhìn thấy còn lại (Càng nhỏ càng gần phía trên) */
    const visibleHeight = Math.max(0, listEl.clientHeight - stickyHeight);
    const targetScroll = headerTopInList - stickyHeight - visibleHeight * 0.13;

    /* Kẹp vào phạm vi cuộn hợp lệ; Cận dưới lấy vị trí logic của cạnh trên bản ghi trong danh sách —— Thấp hơn nó danh sách sẽ cuộn qua cạnh trên bản ghi,
       thanh tiêu đề bản ghi sẽ rớt khỏi vị trí dính. Khi không chạm được điểm rơi mục tiêu thì ưu tiên đảm bảo thanh tiêu đề dính không di chuyển */
    const maxListScroll = Math.max(0, listEl.scrollHeight - listEl.clientHeight);
    const recordTopInList = listEl.scrollTop + recordEl.getBoundingClientRect().top - listRect.top;
    const minListScroll = Math.max(0, Math.min(recordTopInList, maxListScroll));
    const clampedListScroll = Math.max(minListScroll, Math.min(targetScroll, maxListScroll));

    /* Chỉ cuộn khi cần điều chỉnh (Khi mục tiêu đã hiển thị thì giữ nguyên, nhấp nháy vẫn kích hoạt như thường) */
    if (Math.abs(clampedListScroll - listEl.scrollTop) > 1) {
        /* Cuộn mượt cần có thời gian, đợi cuộn đến nơi rồi mới kích hoạt nhấp nháy (scrollend + Bộ đếm thời gian dự phòng) */
        cancelPendingFlash();
        pendingFlashHeader = headerEl;
        listEl.scrollTo({ top: clampedListScroll, behavior: getScrollBehavior() });
        let settled = false;
        const onScrollEnd = () => {
            if (settled) return;
            settled = true;
            listEl.removeEventListener('scrollend', onScrollEnd);
            triggerDeferredFlash();
        };
        listEl.addEventListener('scrollend', onScrollEnd);
        pendingFlashTimer = setTimeout(onScrollEnd, SCROLLEND_FALLBACK_MS);
    } else {
        triggerHeaderFlash(headerEl);
    }
}

/* Kích hoạt nhấp nháy chạm đáy đang chờ (Được gọi sau khi cuộn đến nơi); Bỏ qua trong im lặng khi thanh tiêu đề mục tiêu đã bị dựng lại/gỡ bỏ */
function triggerDeferredFlash() {
    if (pendingFlashTimer !== null) {
        clearTimeout(pendingFlashTimer);
        pendingFlashTimer = null;
    }
    const header = pendingFlashHeader;
    pendingFlashHeader = null;
    if (header && header.isConnected) {
        triggerHeaderFlash(header);
    }
}

function cancelPendingFlash() {
    if (pendingFlashTimer !== null) {
        clearTimeout(pendingFlashTimer);
        pendingFlashTimer = null;
    }
    pendingFlashHeader = null;
}

/* Xóa class nhấp nháy thanh tiêu đề trong phạm vi được chỉ định, và hủy các nhấp nháy đang chờ kích hoạt trong phạm vi đó (Gọi khi thu gọn bản ghi/tin nhắn).
   @param {HTMLElement} scopeEl Phạm vi tác dụng (Bản ghi, mục tin nhắn hoặc toàn bộ danh sách) */
function clearHeaderFlash(scopeEl) {
    if (!scopeEl) return;
    scopeEl.querySelectorAll('.rmsg-header.rlog-flash-bottom, .rlog-record-header.rlog-flash-bottom')
        .forEach(el => clearFlashClasses(el));
    if (pendingFlashHeader && scopeEl.contains(pendingFlashHeader)) {
        cancelPendingFlash();
    }
}

/* Lấy phần tử DOM bản ghi trong danh sách theo chỉ mục records thực (data-record-index luôn ghi chỉ mục thực) */
function getRecordElByIndex(index) {
    if (!panelEl) return null;
    const listEl = panelEl.querySelector('#rlog-list');
    return listEl ? listEl.querySelector(`.rlog-record[data-record-index="${index}"]`) : null;
}

/* Cuộn danh sách, làm cho thanh tiêu đề bản ghi được chỉ định xuất hiện ở đỉnh khu vực nhìn thấy (Tính bằng chênh lệch tọa độ view, không phụ thuộc vào offsetTop) */
function scrollToRecordEl(recordEl) {
    if (!panelEl || !recordEl) return;
    const listEl = panelEl.querySelector('#rlog-list');
    if (!listEl) return;
    const listRect = listEl.getBoundingClientRect();
    const recordRect = recordEl.getBoundingClientRect();
    const target = listEl.scrollTop + (recordRect.top - listRect.top);
    const maxScroll = Math.max(0, listEl.scrollHeight - listEl.clientHeight);
    const clamped = Math.min(Math.max(0, target), maxScroll);
    if (Math.abs(clamped - listEl.scrollTop) > 1) {
        listEl.scrollTop = clamped;
    }
}

/* Nhấp nháy gợi ý khi về đỉnh mà không có nút: Khi mở rộng thì nhấp nháy thanh tiêu đề tin nhắn con đầu tiên, khi thu gọn/không hiển thị thì nhấp nháy thanh tiêu đề bản ghi;
   Không kích hoạt khi bảng điều khiển chưa mở hoặc cửa sổ đang thu gọn */
function flashTopHint(recordEl) {
    if (!panelEl || !isPanelVisible || isPanelCollapsed) return;
    const listEl = panelEl.querySelector('#rlog-list');
    const firstRecord = recordEl || (listEl ? listEl.querySelector('.rlog-record') : null);
    if (!firstRecord) return;
    let target = firstRecord.querySelector('.rmsg-header');
    if (!target || !target.offsetParent) {
        target = firstRecord.querySelector('.rlog-record-header');
    }
    if (target) {
        triggerHeaderFlash(target);
    }
}

/* Gỡ bỏ toàn bộ class liên quan đến nhấp nháy (Class đánh dấu + Hai class tên animation luân phiên): Dùng chung cho việc Cắt ngang nhấp nháy / Đóng bảng điều khiển.
   Ba class name tương ứng 1-1 với quy tắc nhấp nháy của style.css, sửa bên kia thì phải đồng bộ sửa bên này */
function clearFlashClasses(el) {
    el.classList.remove('rlog-flash-bottom', 'rlog-flash-a', 'rlog-flash-b');
}

/* Nhấp nháy màu nền thanh tiêu đề: Hai tên animation có nội dung giống nhau (rlog-flash-a / -b) được luân phiên thêm vào,
   Cùng một thanh tiêu đề khi animation chưa phát xong mà được kích hoạt lại thì cũng có thể phát lại từ đầu.
   Trạng thái luân phiên được ghi trong dataset chứ không nhìn vào class name: clearHeaderFlash() có thể vừa mới gỡ class ra,
   nếu phán đoán theo class name sẽ chọn lại cùng một tên animation, trong cùng một tác vụ tương đương với việc không đổi tên (không phát lại).
   @param {HTMLElement} headerEl */
function triggerHeaderFlash(headerEl) {
    if (!headerEl) return;
    /* Chế độ tối giản: Không nhấp nháy (Chỉ giữ lại định vị cuộn), đồng thời tránh việc dưới animation:none thì animationend
       không được kích hoạt dẫn đến sót lại class .rlog-flash-bottom */
    if (preferences.minimal) return;
    const nextAlt = headerEl.dataset.rlogFlashAlt === 'a' ? 'b' : 'a';
    headerEl.dataset.rlogFlashAlt = nextAlt;
    clearFlashClasses(headerEl);
    headerEl.classList.add('rlog-flash-bottom', `rlog-flash-${nextAlt}`);
    if (!headerEl.dataset.rlogFlashBound) {
        headerEl.dataset.rlogFlashBound = '1';
        headerEl.addEventListener('animationend', function onFlashEnd(e) {
            /* Hai tên animation luân phiên (rlog-flash-bottom-a / -b) khớp theo tiền tố */
            if (e.animationName.startsWith('rlog-flash-bottom')) {
                clearFlashClasses(this);
            }
        });
    }
}

/* ── Xóa và Copy bản ghi ──────────────────────── */

/* "Xóa" bản ghi đơn lẻ: Xóa bản ghi này khỏi danh sách
   @param {number} index Chỉ mục bản ghi */

function deleteRecord(index) {
    if (index < 0 || index >= records.length) return;
    const record = records[index];
    /* Khi xóa bản ghi, đồng bộ hủy bỏ theo dõi reply đang trên đường đến của request đó */
    if (record && record.id != null) abortPendingReply(record.id);
    records.splice(index, 1);
    panelContentDirty = true;
    if (panelEl && isPanelVisible) {
        renderPanelContent();
    }
}

async function copyFullRecord(index, btnEl) {
    const record = records[index];
    if (!record) return;
    const text = getFullPromptText(record);
    await doCopy(text, btnEl);
}

async function copySingleMessage(recIdx, msgIdx, btnEl) {
    const msg = getMessageByIndex(records[recIdx], msgIdx);
    if (!msg) return;
    await doCopy(msg.content, btnEl);
}

async function doCopy(text, btnEl) {
    try {
        await navigator.clipboard.writeText(text);
        showCopyFeedback(btnEl, true);
    } catch {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showCopyFeedback(btnEl, true);
        } catch (e) {
            console.error(`[${PLUGIN_KEY}] 复制失败:`, e);
            showCopyFeedback(btnEl, false);
        }
        document.body.removeChild(textarea);
    }
}

function showCopyFeedback(btnEl, success) {
    const originalHtml = btnEl.innerHTML;
    if (success) {
        btnEl.innerHTML = '<i class="fa-solid fa-check"></i>';
        btnEl.classList.add('copy-success');
    } else {
        btnEl.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        btnEl.classList.add('copy-fail');
    }
    setTimeout(() => {
        btnEl.innerHTML = originalHtml;
        btnEl.classList.remove('copy-success', 'copy-fail');
    }, 1500);
}

/* ── Lớp phủ xem toàn văn ──────────────────────── */

/* Lấy văn bản của khu vực nội dung lớp phủ @param {object} record @param {string} format formatted hoặc raw @returns {string} */
function getReadContent(record, format) {
    if (format === 'raw') {
        if (!record.rawBody) {
            return '{"error": "原始请求体数据不可用"}';
        }
        try {
            return JSON.stringify(record.rawBody, null, 2);
        } catch (e) {
            return '{"error": "原始请求体数据不可用"}';
        }
    }
    return getFullPromptText(record);
}

function switchReadFormat(format) {
    if (!readFullOverlayEl) return;
    readFullFormat = format;
    const record = records[readFullRecordIndex];
    if (!record) return;

    const contentEl = readFullOverlayEl.querySelector('.rlog-read-content');
    if (contentEl) {
        contentEl.textContent = getReadContent(record, format);
        contentEl.scrollTop = 0;
    }

    const toggleEl = readFullOverlayEl.querySelector('.rlog-read-format-btn');
    if (toggleEl) {
        if (format === 'raw') {
            toggleEl.classList.add('raw');
            toggleEl.classList.remove('formatted');
        } else {
            toggleEl.classList.remove('raw');
            toggleEl.classList.add('formatted');
        }
    }
}

/* Lớp phủ "Xem toàn văn" về đỉnh/xuống đáy: Trực tiếp cuộn khu vực nội dung (Văn bản dài liên tục, chỉ làm cuộn chức năng, không làm animation nhấp nháy)
   @param {'top'|'bottom'} position Mục tiêu cuộn: 'top' Đỉnh / 'bottom' Đáy */
function scrollReadContentTo(position) {
    if (!readFullOverlayEl) return;
    const contentEl = readFullOverlayEl.querySelector('.rlog-read-content');
    if (!contentEl) return;
    /* Cuộn mượt lên đỉnh/xuống đáy; Mục tiêu chạm đáy gán bằng scrollHeight, trình duyệt sẽ tự động clamp đến vị trí có thể cuộn tối đa */
    contentEl.scrollTo({
        top: position === 'bottom' ? contentEl.scrollHeight : 0,
        behavior: getScrollBehavior(),
    });
}

function closeReadFullOverlay() {
    if (readFullOverlayEl) {
        /* Dọn dẹp thanh cuộn tùy chỉnh của khu vực nội dung lớp phủ, tránh tồn đọng */
        const readContentEl = readFullOverlayEl.querySelector('.rlog-read-content');
        if (readContentEl) {
            detachScrollbarForContent(readContentEl);
        }
        readFullOverlayEl.remove();
        readFullOverlayEl = null;
    }
    readFullRecordIndex = null;
    document.removeEventListener('keydown', handleReadFullEscape);
}

/* Trình xử lý phím Escape đóng lớp phủ @param {KeyboardEvent} e Sự kiện bàn phím */
function handleReadFullEscape(e) {
    if (e.key === 'Escape' && readFullOverlayEl) {
        closeReadFullOverlay();
    }
}

/* Mở lớp phủ "Xem toàn văn", hiển thị prompt hoàn chỉnh của bản ghi được chỉ định; Lớp phủ được gắn vào trong #rlog-panel, che khuất hoàn toàn bảng điều khiển
   @param {number} index Chỉ mục bản ghi */
function openReadFullOverlay(index) {
    /* Trước tiên thoát chế độ tìm kiếm (Trong thời gian lớp phủ mở, tìm kiếm không hiển thị và không thể thao tác) */
    resetSearchIfActive();

    const record = records[index];
    if (!record || !panelEl) return;

    /* Đóng lớp phủ cũ (nếu có) */
    closeReadFullOverlay();

    readFullRecordIndex = index;
    readFullFormat = 'formatted';

    const overlay = document.createElement('div');
    overlay.className = 'rlog-read-overlay';

    overlay.innerHTML = `
        <div class="rlog-read-header">
            <span class="rlog-read-title">查看全文</span>
            <div class="rlog-read-header-actions">
                <button class="rlog-read-format-btn formatted" title="切换显示格式" aria-label="切换显示格式">{}</button>
                <button class="rlog-read-jump-top-btn" title="回顶">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="4" x2="19" y2="4"></line><line x1="12" y1="9" x2="12" y2="20"></line><polyline points="7 14 12 9 17 14"></polyline></svg>
                </button>
                <button class="rlog-read-jump-bottom-btn" title="置底">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="4" x2="12" y2="15"></line><line x1="5" y1="20" x2="19" y2="20"></line></svg>
                </button>
                <button class="rlog-read-copy-btn" title="复制当前内容">
                    <i class="fa-solid fa-copy"></i>
                </button>
                <button class="rlog-read-close-btn" title="关闭 (Esc)">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </div>
        <div class="rlog-read-content"></div>
        <div class="rlog-read-footer"></div>
    `;

    /* Nội dung sử dụng textContent để cài đặt văn bản thuần, tránh chi phí phân tích của innerHTML */
    const contentEl = overlay.querySelector('.rlog-read-content');
    contentEl.textContent = getReadContent(record, 'formatted');

    const toggleEl = overlay.querySelector('.rlog-read-format-btn');
    toggleEl.addEventListener('click', (e) => {
        e.stopPropagation();
        switchReadFormat(readFullFormat === 'formatted' ? 'raw' : 'formatted');
    });

    const jumpTopBtn = overlay.querySelector('.rlog-read-jump-top-btn');
    jumpTopBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        scrollReadContentTo('top');
    });

    const jumpBottomBtn = overlay.querySelector('.rlog-read-jump-bottom-btn');
    jumpBottomBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        scrollReadContentTo('bottom');
    });

    const copyBtn = overlay.querySelector('.rlog-read-copy-btn');
    copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const text = getReadContent(record, readFullFormat);
        await doCopy(text, copyBtn);
    });

    const closeBtn = overlay.querySelector('.rlog-read-close-btn');
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeReadFullOverlay();
    });

    panelEl.appendChild(overlay);
    readFullOverlayEl = overlay;

    /* Tạo thanh cuộn tùy chỉnh cho khu vực nội dung của lớp phủ (Tái sử dụng style và tương tác của thanh tiến trình Overlay) */
    const readContentElForScroll = overlay.querySelector('.rlog-read-content');
    if (readContentElForScroll) {
        queueScrollbarsForEls([readContentElForScroll]);
    }

    document.addEventListener('keydown', handleReadFullEscape);
}

/* ── Thanh cuộn tùy chỉnh ───────────────────────── */

/* Lưu trữ dữ liệu dọn dẹp thanh tiến trình tương ứng của mỗi .rmsg-content
   Map key: contentEl -> { scrollHandler, hitboxEl, thumbEl } */
const scrollbarCleanups = new Map();

/* Set<HTMLElement>: Tất cả các phần tử .rmsg-content đã tạo thanh tiến trình (Dành cho ResizeObserver dùng chung để cập nhật hàng loạt) */
const scrollbarElements = new Set();

/* Set<HTMLElement>: Các phần tử .rmsg-content đang chờ vào viewport để tạo lười (lazy create) thanh tiến trình */
const pendingScrollbarContentEls = new Set();

/* ResizeObserver|null: ResizeObserver dùng chung: Tất cả thanh tiến trình dùng chung một cái, thay vì mỗi phần tử một cái */
let sharedResizeObserver = null;

/* Set<HTMLElement>: Thanh tiêu đề bản ghi đã lắng nghe thay đổi chiều cao (Offset dính --rlog-rec-h tự động làm mới theo chiều cao) */
const observedRecordHeaders = new Set();

/* IntersectionObserver|null: IntersectionObserver dùng để tạo lười thanh tiến trình */
let scrollbarLazyObserver = null;

/* Array<HTMLElement>: Khu vực nội dung đã vào viewport, chờ tạo thanh tiến trình theo frame (Khi trúng nhiều mục trong cùng một frame thì xếp hàng dàn đều ra) */
const scrollbarCreateQueue = [];

/* boolean: Đã có lệnh "Tạo thanh tiến trình theo frame" nào được xếp vào frame tiếp theo chưa */
let scrollbarCreateFlushQueued = false;

/* boolean: Đã có RAF nào xếp hàng để cập nhật thumb chưa */
let thumbUpdateQueued = false;

/* boolean: Có đang chờ cập nhật toàn bộ tất cả thanh tiến trình không (Dùng khi hình học tổng thể thay đổi, ví dụ: kích thước viewport thay đổi) */
let thumbFullUpdatePending = false;

/* Set<HTMLElement>: Khu vực nội dung chờ cập nhật định hướng (Sự kiện scroll, thay đổi kích thước/vị trí do ResizeObserver báo cáo).
   RO callback chỉ chịu trách nhiệm thu thập, việc "Đọc giá trị layout → Ghi style" thực tế được gom chung vào cùng một frame rAF để làm——
   Việc đọc layout trong RO callback sẽ kích hoạt tính toán lại bắt buộc (forced recalculation), và có thể gây ra cảnh báo resize loop. */
const pendingThumbElements = new Set();

/* Lấy chiều cao có sẵn trong callback của ResizeObserver: borderBoxSize và getBoundingClientRect().height đều là
   border-box, đều là số thập phân, và observer đã đo sẵn kích thước rồi——Đọc lại DOM chỉ kích hoạt forced layout một cách vô ích.
   Chỉ khi một số môi trường cá biệt thiếu borderBoxSize thì mới fallback về việc đọc DOM. */
function readObservedHeight(entry, el) {
    const box = entry.borderBoxSize && entry.borderBoxSize[0];
    if (box && typeof box.blockSize === 'number') return box.blockSize;
    return el.getBoundingClientRect().height;
}

/* Đảm bảo ResizeObserver dùng chung đã được tạo: Tất cả thanh tiến trình đều do nó thống nhất lắng nghe, tránh chi phí overhead của hơn 100 observer độc lập */
function ensureSharedResizeObserver() {
    if (sharedResizeObserver) return;
    sharedResizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            const entryEl = entry.target;
            if (!entryEl || !entryEl.classList) continue;
            /* Chiều cao thanh tiêu đề bản ghi thay đổi (Ngắt dòng/Font chữ/Viewport thay đổi) → Làm mới offset dính theo thời gian thực */
            if (entryEl.classList.contains('rlog-record-header')) {
                const recordEl = entryEl.closest('.rlog-record');
                if (recordEl) {
                    recordEl.style.setProperty('--rlog-rec-h', `${readObservedHeight(entry, entryEl).toFixed(2)}px`);
                }
                continue;
            }
            /* Kích thước của chính khu vực nội dung thay đổi → Chỉ xếp "cái này" vào tập hợp chờ cập nhật */
            if (entryEl.classList.contains('rmsg-content') || entryEl.classList.contains('rlog-read-content')) {
                requestThumbUpdate(entryEl);
                continue;
            }
            /* Chiều cao thanh tiêu đề tin nhắn thay đổi: Phần thân của cùng một tin nhắn sẽ bị đẩy lên/đẩy xuống, bản thân kích thước phần thân không đổi (Observer sẽ không báo cáo nó),
               nhưng offset của nó so với mục tin nhắn đã thay đổi → Lấy lại phần thân theo mục tin nhắn, đi qua cùng một luồng cập nhật định hướng */
            if (entryEl.classList.contains('rmsg-header')) {
                const itemEl = entryEl.closest('.rmsg-item');
                const contentEl = itemEl ? itemEl.querySelector('.rmsg-content') : null;
                if (contentEl) requestThumbUpdate(contentEl);
            }
        }
    });
}

/* Tạo lười (lazy create) IntersectionObserver: Thanh tiến trình chỉ được tạo khi khu vực nội dung đến gần viewport (rootMargin 200px),
   Tránh việc khi mở rộng hơn 100 tin nhắn sẽ tạo ra một lượng lớn thanh tiến trình ngay lập tức gây giật lag do layout đồng bộ. */
function ensureScrollbarLazyObserver() {
    if (scrollbarLazyObserver) return;
    scrollbarLazyObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const contentEl = entry.target;
                pendingScrollbarContentEls.delete(contentEl);
                scrollbarLazyObserver.unobserve(contentEl);
                scrollbarCreateQueue.push(contentEl);
            }
        });
        scheduleScrollbarCreateFlush();
    }, { root: null, rootMargin: '200px 0px', threshold: 0 });
}

/* Dàn đều việc "Tạo thanh tiến trình" ra các frame liên tiếp: Một frame xử lý tối đa SCROLLBAR_CREATE_PER_FRAME cái, phần còn lại tiếp tục ở frame sau.
   Chỉ thay đổi sự phân bổ thời điểm tạo, còn điều kiện tạo, phán đoán và hành vi của thanh tiến trình không đổi. */
function scheduleScrollbarCreateFlush() {
    if (scrollbarCreateFlushQueued) return;
    scrollbarCreateFlushQueued = true;
    requestAnimationFrame(flushScrollbarCreateQueue);
}

function flushScrollbarCreateQueue() {
    scrollbarCreateFlushQueued = false;
    const batch = [];
    while (scrollbarCreateQueue.length > 0 && batch.length < SCROLLBAR_CREATE_PER_FRAME) {
        const contentEl = scrollbarCreateQueue.shift();
        /* Đã rời khỏi DOM / Đã có thanh tiến trình / Đã bị hủy tải (unload) thành chỗ chiếm (placeholder) / Đã quay lại hàng đợi quan sát lười, đều không xử lý ở đây:
           Chỗ chiếm không bị tràn (overflow), việc khôi phục và xếp hàng lại sẽ do các luồng hiện có chịu trách nhiệm */
        if (!contentEl || !contentEl.isConnected) continue;
        if (scrollbarCleanups.has(contentEl) || unloadedBodies.has(contentEl)) continue;
        if (pendingScrollbarContentEls.has(contentEl)) continue;
        batch.push(contentEl);
    }
    if (batch.length > 0) {
        /* Đọc xong giá trị layout của đợt này trước, rồi mới thống nhất tạo DOM: Bản thân việc tạo sẽ làm đổi DOM, nếu "Tạo một cái đọc một cái"
           mỗi lần tạo một thanh đều khiến việc đọc của thanh tiếp theo va phải layout đã mất hiệu lực, sẽ bị ép phải làm thêm N lần forced layout */
        const measured = batch.map((contentEl) => ({ contentEl, m: measureScrollbarCreation(contentEl) }));
        measured.forEach(({ contentEl, m }) => {
            /* Cấu trúc container bất thường (Phần tử đã rời khỏi quan hệ contentEl→container): Không dọn dẹp cũng không đăng ký lại, giao cho isConnected dọn dẹp */
            if (!m) return;
            /* "Đo không thành công" ≠ "Không tràn": Khi hiện không hiển thị / Không có layout thì clientHeight bằng 0, việc đo ra "Không tràn" là ảo ảnh.
               Đăng ký lại vào hàng đợi quan sát lười, đợi khi nó thực sự hiển thị sẽ do observer báo cáo lại một lần nữa → Đo lại ở frame tiếp theo.
               Việc observe lại sẽ do observer khử trùng (Đã có trong danh sách quan sát thì không đăng ký lặp lại), pending là Set nên cũng không thêm lặp lại;
               Đo không thành công ⇒ Phần tử hiện có kích thước bằng 0, observer sẽ không phán đoán là giao nhau (intersecting), do đó không tạo thành vòng lặp thử lại chạy không (idle) mỗi frame */
            if (!m.measurable) {
                queueScrollbarsForEls([contentEl]);
                return;
            }
            /* Đo thành công và thực sự bị tràn → Tạo thanh; Đo thành công nhưng không cần cuộn (Tin nhắn ngắn) là trạng thái cuối, không thử lại */
            if (m.hasOverflow) buildScrollbar(contentEl, m);
        });
    }
    if (scrollbarCreateQueue.length > 0) scheduleScrollbarCreateFlush();
}

/* Yêu cầu cập nhật vị trí thumb của thanh tiến trình (Xử lý hàng loạt bằng RAF): Không truyền tham số = Cập nhật toàn bộ (Dự phòng khi hình học tổng thể thay đổi),
   Truyền contentEl = Chỉ cập nhật thanh tiến trình tương ứng của phần tử đó; Nhiều yêu cầu trong cùng một frame được gộp thành một lần.
   Yêu cầu định hướng được khử trùng theo phần tử rồi cập nhật từng cái một (Không thể chỉ giữ lại cái cuối cùng: Nhiều phần tử thay đổi trong cùng frame sẽ bị sót).
   @param {HTMLElement} [contentEl] */
function requestThumbUpdate(contentEl) {
    if (contentEl) {
        pendingThumbElements.add(contentEl);
    } else {
        thumbFullUpdatePending = true;
    }
    if (thumbUpdateQueued) return;
    thumbUpdateQueued = true;
    requestAnimationFrame(() => {
        thumbUpdateQueued = false;
        if (thumbFullUpdatePending) {
            thumbFullUpdatePending = false;
            pendingThumbElements.clear();
            updateScrollbarThumbs(scrollbarElements);
            return;
        }
        if (pendingThumbElements.size === 0) return;
        const targets = [...pendingThumbElements];
        pendingThumbElements.clear();
        updateScrollbarThumbs(targets);
    });
}

/* Giai đoạn Đọc (Read phase): Đọc xong một lần toàn bộ giá trị layout mà khu vực nội dung này cần (Bốn giá trị không phụ thuộc lẫn nhau, và style được ghi sau đó chỉ tác dụng lên
   hitbox/thumb —— Chúng đều là anh em của position:absolute, sẽ không quay lại làm thay đổi những giá trị này)
   @param {HTMLElement} contentEl Phần tử khu vực nội dung @returns {object} */
function measureScrollbarThumb(contentEl) {
    const scrollHeight = contentEl.scrollHeight;
    const clientHeight = contentEl.clientHeight;
    const scrollTop = contentEl.scrollTop;
    const contentTop = contentEl.offsetTop;
    return { scrollHeight, clientHeight, scrollTop, contentTop, maxScroll: scrollHeight - clientHeight };
}

/* Giai đoạn Ghi (Write phase): Ghi style thanh tiến trình theo các giá trị đã đo được (Trong hàm này không đọc lại giá trị layout nữa)
   @param {object} cleanup Dữ liệu dọn dẹp của thanh tiến trình đó (Bao gồm hitboxEl/thumbEl)
   @param {object} m Giá trị trả về của measureScrollbarThumb */
function applyScrollbarThumb(cleanup, m) {
    const hitbox = cleanup.hitboxEl;
    const thumb = cleanup.thumbEl;
    if (!hitbox || !thumb) return;

    const { scrollHeight, clientHeight, scrollTop, contentTop, maxScroll } = m;

    /* Đồng bộ hình học trước, sau đó ẩn theo yêu cầu: Khi nội dung không cần cuộn (Tin nhắn thu gọn, chỗ chiếm có chiều cao bằng nhau bị hủy tải khi khuất màn hình)
       hitbox vẫn ở lại trong DOM nhưng không hiển thị, vị trí và chiều cao cũng phải đi theo nội dung, tránh việc để lại các giá trị hết hạn */
    hitbox.style.top = contentTop + 'px';
    hitbox.style.height = clientHeight + 'px';
    if (maxScroll <= 0) {
        hitbox.style.display = 'none';
        return;
    }
    hitbox.style.display = '';

    /* Chiều cao khả dụng của track: Trừ đi lượng thụt vào trên dưới của track so với hitbox */
    const trackHeight = clientHeight - SCROLLBAR_TRACK_PADDING * 2;

    const thumbRatio = clientHeight / scrollHeight;
    const thumbHeight = Math.max(20, thumbRatio * trackHeight);
    thumb.style.height = thumbHeight + 'px';

    const thumbRange = trackHeight - thumbHeight;

    const thumbTop = maxScroll > 0 ? (scrollTop / maxScroll) * thumbRange : 0;
    thumb.style.top = thumbTop.toFixed(1) + 'px';
}

/* Cập nhật thanh tiến trình cho một nhóm khu vực nội dung: Đọc xong cả lô trước (Giá trị layout), sau đó mới ghi style cho cả lô.
   Làm từng cái một kiểu "Ghi một cái, đọc cái tiếp theo" sẽ khiến mỗi lần đọc đều va phải sự mất hiệu lực của style/layout do lần ghi trước gây ra, buộc phải làm thêm forced layout.
   @param {Iterable<HTMLElement>} contentEls */
function updateScrollbarThumbs(contentEls) {
    const plan = [];
    for (const contentEl of contentEls) {
        const cleanup = scrollbarCleanups.get(contentEl);
        if (!cleanup || !cleanup.hitboxEl || !cleanup.thumbEl) continue;
        plan.push({ cleanup, metrics: measureScrollbarThumb(contentEl) });
    }
    plan.forEach(({ cleanup, metrics }) => applyScrollbarThumb(cleanup, metrics));
}

/* Tạo lười thanh tiến trình cho một nhóm .rmsg-content (Chỉ tạo khi vào/đến gần viewport; Nếu đã trong hàng đợi quan sát hoặc đã có thanh tiến trình thì bỏ qua)
   @param {NodeListOf<HTMLElement>|HTMLElement[]} contentEls */
function queueScrollbarsForEls(contentEls) {
    ensureScrollbarLazyObserver();
    /* Hỗ trợ .rmsg-content (Khu vực nội dung tin nhắn) và .rlog-read-content (Khu vực nội dung lớp phủ Xem toàn văn) */
    const SCROLLABLE_CONTENT_CLASSES = ['rmsg-content', 'rlog-read-content'];
    contentEls.forEach((contentEl) => {
        if (!contentEl || !contentEl.classList) return;
        if (!SCROLLABLE_CONTENT_CLASSES.some(c => contentEl.classList.contains(c))) return;
        /* Chỗ chiếm bị hủy tải (unload) khi khuất màn hình không có nội dung, cũng không nên có thanh tiến trình; Hơn nữa một khi bị observer lười tiêu thụ thì sẽ bị gỡ khỏi hàng đợi quan sát,
           Sau khi khôi phục, tin nhắn này sẽ vĩnh viễn không có thanh tiến trình —— Thống nhất do restoreBody() xếp hàng lại sau khi khôi phục */
        if (unloadedBodies.has(contentEl)) return;
        if (pendingScrollbarContentEls.has(contentEl)) return;
        if (scrollbarCleanups.has(contentEl)) return;
        pendingScrollbarContentEls.add(contentEl);
        scrollbarLazyObserver.observe(contentEl);
    });
}

/* Lấy thanh tiêu đề liền kề mà "Chiều cao thay đổi sẽ đẩy khu vực nội dung này lên/xuống": Chỉ có khu vực nội dung tin nhắn (trong .rmsg-item) mới có ——
   Khu vực nội dung của lớp phủ "Xem toàn văn" cuộn trong một popup cố định, vị trí không bị ảnh hưởng bởi các phần tử cùng cấp, trả về null.
   @param {HTMLElement} contentEl @returns {HTMLElement|null} */
function getContentAnchorHeaderEl(contentEl) {
    const container = contentEl.parentElement;
    if (!container || !container.classList.contains('rmsg-item')) return null;
    return container.querySelector('.rmsg-header');
}

/* Giai đoạn Đọc: Các giá trị layout/style cần đọc trước khi tạo thanh tiến trình. Tách riêng ra là để khi tạo hàng loạt có thể "Đọc xong một mẻ trước, rồi thống nhất tạo",
   Tránh việc "Tạo một cái đọc một cái" kích hoạt forced layout liên tục.
   @param {HTMLElement} contentEl Phần tử .rmsg-content @returns {object|null} */
function measureScrollbarCreation(contentEl) {
    /* Gắn (mount) lên container cha của contentEl (Không phải bên trong contentEl):
       .rmsg-content → .rmsg-item; .rlog-read-content → .rlog-read-overlay */
    /* Như vậy khi hitbox sử dụng định vị position: absolute sẽ không bị cuộn ra khỏi viewport theo contentEl */
    const container = contentEl.parentElement;
    if (!container) return null;
    const isRmsgItem = container.classList.contains('rmsg-item');
    const isReadOverlay = container.classList.contains('rlog-read-overlay');
    if (!isRmsgItem && !isReadOverlay) return null;
    const clientHeight = contentEl.clientHeight;
    return {
        container,
        /* Có đo được layout hợp lệ hay không: Khi khu vực nội dung bị thu gọn / Toàn bộ khối bị ẩn thì clientHeight bằng 0,
           Lúc này việc "Không tràn" là ảo ảnh, không thể coi là "Không cần thanh tiến trình" để kết thúc (Sẽ vĩnh viễn sót thanh),
           Phải giữ lại trong danh sách chờ để thử lại khi nó hiển thị. Khu vực nội dung hiển thị bình thường có padding, clientHeight chắc chắn > 0 */
        measurable: clientHeight > 0,
        /* Khi nội dung không cần cuộn thì không cần thanh tiến trình; Việc đọc giá trị layout scrollHeight ở đây là không thể tránh khỏi,
           Nhưng chỉ thực thi khi tiến vào viewport (Tạo lười + Hàng loạt) */
        hasOverflow: contentEl.scrollHeight > clientHeight,
        /* Container cần position: relative làm tham chiếu định vị cho hitbox */
        needsPositionFix: getComputedStyle(container).position === 'static',
    };
}

/* Tạo thanh tiến trình overlay cho một phần tử .rmsg-content đơn lẻ
   @param {HTMLElement} contentEl Phần tử .rmsg-content */
function createScrollbarForContent(contentEl) {
    detachScrollbarForContent(contentEl);
    const measured = measureScrollbarCreation(contentEl);
    if (!measured || !measured.hasOverflow) return;
    buildScrollbar(contentEl, measured);
}

/* Giai đoạn Ghi: Tạo DOM và listener theo kết quả của measureScrollbarCreation (Trong hàm này không đọc lại giá trị layout nữa)
   @param {HTMLElement} contentEl Phần tử .rmsg-content
   @param {object} measured Giá trị trả về của measureScrollbarCreation */
function buildScrollbar(contentEl, measured) {
    const container = measured.container;

    /* Đảm bảo container có position: relative làm tham chiếu định vị */
    if (measured.needsPositionFix) {
        container.style.position = 'relative';
    }

    /* --- Tạo cấu trúc DOM --- */
    const hitbox = document.createElement('div');
    hitbox.className = 'rlog-scroll-hitbox';

    const track = document.createElement('div');
    track.className = 'rlog-scroll-track';

    const thumb = document.createElement('div');
    thumb.className = 'rlog-scroll-thumb';

    const dot = document.createElement('div');
    dot.className = 'rlog-scroll-dot';

    /* dot là phần tử con trực tiếp của hitbox (Cùng cấp với track), tránh bị overflow:hidden của track cắt xén */
    track.appendChild(thumb);
    hitbox.appendChild(track);
    hitbox.appendChild(dot);
    container.appendChild(hitbox);

    scrollbarElements.add(contentEl);

    const cleanup = {
        scrollHandler: null,
        hitboxEl: hitbox,
        thumbEl: thumb,
    };

    /* Đăng ký cleanup trước rồi mới yêu cầu cập nhật ban đầu (Khi cập nhật sẽ tra cứu cleanup theo khu vực nội dung để tìm hitbox/thumb) */
    scrollbarCleanups.set(contentEl, cleanup);
    requestThumbUpdate(contentEl);

    /* Lắng nghe sự kiện scroll (Xử lý hàng loạt bằng RAF, tránh việc cuộn tần suất cao kích hoạt forced layout liên tục) */
    const onScroll = () => requestThumbUpdate(contentEl);
    cleanup.scrollHandler = onScroll;
    contentEl.addEventListener('scroll', onScroll, { passive: true });

    ensureSharedResizeObserver();
    if (sharedResizeObserver) {
        try {
            sharedResizeObserver.observe(contentEl);
        } catch (e) { /* ignore */ }
        /* Quan sát luôn cả thanh tiêu đề tin nhắn ở trên: Nó cao lên sẽ đẩy phần thân xuống, trong khi kích thước bản thân phần thân không đổi
           (Observer sẽ không báo cáo phần thân) —— Giao cho RO callback map ngược lại về phần thân này để cập nhật định hướng */
        const anchorHeaderEl = getContentAnchorHeaderEl(contentEl);
        if (anchorHeaderEl) {
            try {
                sharedResizeObserver.observe(anchorHeaderEl, { box: 'border-box' });
            } catch (e) { /* ignore */ }
        }
    }

    /* --- Tương tác: Dấu chấm đi theo vị trí ngón tay (Không đi theo thumb), có thể chạm tới hai đầu của track --- */
    /* boolean: Có đang kéo thả không */
    let dragging = false;
    /* number|null: pointerId hiện tại (Dùng cho pointer capture) */
    let capturedPointerId = null;

    /* Tính toán giá trị top của dấu chấm trong hitbox dựa trên clientY (Giới hạn trong phạm vi của track)
       @param {number} clientY Tọa độ Y trên trang của con trỏ
       @returns {number} Giá trị style.top của dot (So với hitbox) */
    function clientYToDotTop(clientY) {
        const hitboxRect = hitbox.getBoundingClientRect();
        /* Offset Y của ngón tay so với đỉnh hitbox (dot là phần tử con của hitbox, style.top là so với hitbox) */
        let relativeY = clientY - hitboxRect.top;

        const trackTop = SCROLLBAR_TRACK_PADDING;
        const trackBottom = hitboxRect.height - SCROLLBAR_TRACK_PADDING;
        relativeY = Math.max(trackTop, Math.min(trackBottom, relativeY));

        /* Một nửa chiều cao của dấu chấm: Để giá trị trả về chỉ vào tâm của dấu chấm (top của dot là góc trên bên trái).
           Giá trị này phải bằng đúng một nửa chiều cao thực tế của .rlog-scroll-dot trong CSS, khi điều chỉnh kích thước dấu chấm thì phải sửa đồng bộ ở đây */
        const DOT_HALF = 2.5;
        return (relativeY - DOT_HALF) + 'px';
    }

    /* Suy ngược lại vị trí cuộn của nội dung dựa trên vị trí dấu chấm
       @param {number} clientY Tọa độ Y trên trang của con trỏ
       @returns {number} Giá trị scrollTop tương ứng */
    function dotPositionToScroll(clientY) {
        const hitboxRect = hitbox.getBoundingClientRect();
        const clientHeight = contentEl.clientHeight;
        const maxScroll = contentEl.scrollHeight - clientHeight;
        if (maxScroll <= 0) return 0;

        let relativeY = clientY - hitboxRect.top;
        const trackHeight = clientHeight - SCROLLBAR_TRACK_PADDING * 2;
        const trackTop = SCROLLBAR_TRACK_PADDING;
        const trackBottom = trackTop + trackHeight;
        relativeY = Math.max(trackTop, Math.min(trackBottom, relativeY));

        const ratio = (relativeY - trackTop) / trackHeight;
        return Math.round(ratio * maxScroll);
    }

    function onPointerDown(e) {
        /* Chỉ xử lý nút chính (Chuột trái hoặc Cảm ứng) */
        if (e.button !== undefined && e.button !== 0) return;

        dragging = true;
        capturedPointerId = e.pointerId;
        hitbox.setPointerCapture(e.pointerId);
        hitbox.classList.add('active');

        dot.style.top = clientYToDotTop(e.clientY);
        contentEl.scrollTop = dotPositionToScroll(e.clientY);
        e.preventDefault();
    }

    function onPointerMove(e) {
        if (!dragging) return;

        const maxScroll = contentEl.scrollHeight - contentEl.clientHeight;
        if (maxScroll <= 0) return;

        dot.style.top = clientYToDotTop(e.clientY);
        contentEl.scrollTop = dotPositionToScroll(e.clientY);

        e.preventDefault();
    }

    function onPointerUp(e) {
        if (!dragging) return;
        dragging = false;
        hitbox.classList.remove('active');
        if (capturedPointerId !== null) {
            try { hitbox.releasePointerCapture(capturedPointerId); } catch (err) { /* ignore */ }
            capturedPointerId = null;
        }
    }

    hitbox.addEventListener('pointerdown', onPointerDown);
    hitbox.addEventListener('pointermove', onPointerMove);
    hitbox.addEventListener('pointerup', onPointerUp);
    hitbox.addEventListener('pointercancel', onPointerUp);
    /* lostpointercapture làm nhiệm vụ dọn dẹp dự phòng */
    hitbox.addEventListener('lostpointercapture', onPointerUp);

}

/* Gỡ bỏ thanh tiến trình overlay của một .rmsg-content đơn lẻ và dọn dẹp tài nguyên
   @param {HTMLElement} contentEl Phần tử .rmsg-content */
function detachScrollbarForContent(contentEl) {
    /* Việc hủy đăng ký phía register được thực thi vô điều kiện: Bất kể thanh tiến trình đã được tạo ra hay chưa, đều phải xóa sạch đăng ký "Đang chờ tạo".
       Nếu không, khi phần thân bị hủy tải (unload) trong thời gian xếp hàng, pending / observer sẽ để lại các đăng ký hết hạn,
       Sau này khi khôi phục thông qua queueScrollbarsForEls() sẽ bị "Đã có trong danh sách chờ" chặn lại → Vĩnh viễn thiếu thanh tiến trình.
       Nhân tiện loại các phần tử vẫn đang trong hàng đợi tạo theo frame ra khỏi hàng đợi, tránh va chạm với lần dọn dẹp này hoặc lần xếp hàng lại tiếp theo */
    const queuedIdx = scrollbarCreateQueue.indexOf(contentEl);
    if (queuedIdx !== -1) scrollbarCreateQueue.splice(queuedIdx, 1);
    pendingScrollbarContentEls.delete(contentEl);
    if (scrollbarLazyObserver) {
        try { scrollbarLazyObserver.unobserve(contentEl); } catch (e) { /* ignore */ }
    }

    const cleanup = scrollbarCleanups.get(contentEl);
    if (!cleanup) return;

    contentEl.removeEventListener('scroll', cleanup.scrollHandler);
    if (sharedResizeObserver) {
        try { sharedResizeObserver.unobserve(contentEl); } catch (e) { /* ignore */ }
        const anchorHeaderEl = getContentAnchorHeaderEl(contentEl);
        if (anchorHeaderEl) {
            try { sharedResizeObserver.unobserve(anchorHeaderEl); } catch (e) { /* ignore */ }
        }
    }
    scrollbarElements.delete(contentEl);
    if (cleanup.hitboxEl && cleanup.hitboxEl.parentNode) {
        cleanup.hitboxEl.remove();
    }
    scrollbarCleanups.delete(contentEl);
}

/* Xóa các phần tử đã rời khỏi DOM trong hàng đợi "Xếp hàng đợi vào viewport rồi mới tạo thanh tiến trình" (Các phần tử cũ đã bị hủy sau khi dựng lại toàn bộ bảng).
   Hàng đợi quan sát và Set đều tham chiếu mạnh (strong reference) đến các phần tử, nếu không cắt đứt thì mỗi đợt dựng lại sẽ lưu lại toàn bộ DOM danh sách của đợt trước trong bộ nhớ;
   Các phần tử vẫn còn trong DOM (Như khu vực nội dung của lớp phủ "Xem toàn văn", việc dựng lại sẽ không hủy nó) được giữ lại trong hàng đợi, hành vi không đổi. */
function clearDetachedPendingScrollbarEls() {
    if (pendingScrollbarContentEls.size === 0) return;
    pendingScrollbarContentEls.forEach((contentEl) => {
        if (contentEl.isConnected) return;
        if (scrollbarLazyObserver) {
            try { scrollbarLazyObserver.unobserve(contentEl); } catch (e) { /* ignore */ }
        }
        pendingScrollbarContentEls.delete(contentEl);
    });
}

/* Tạo/Làm mới thanh tiến trình cho tất cả .rmsg-content trong danh sách (Gọi sau khi dựng lại DOM và sau khi mở rộng/thu gọn), tạo lười (lazy create) để tránh giật lag khi làm hàng loạt
   @param {HTMLElement} listEl */
function attachScrollIndicators(listEl) {
    /* Dọn dẹp các thanh tiến trình đã bị hủy cùng với việc dựng lại: Chỉ xử lý các phần tử đã rời khỏi DOM.
       renderPanelContent dùng innerHTML để dựng lại DOM, các phần tử cũ trong danh sách chắc chắn đã rời khỏi DOM;
       Trong khi khu vực nội dung của lớp phủ "Xem toàn văn" nằm cùng cấp với danh sách, việc dựng lại sẽ không hủy nó (Thanh tiến trình của nó chỉ được gắn một lần khi mở lớp phủ),
       Nếu tháo dỡ luôn thì sẽ không còn ai dựng lại nữa, do đó giữ lại. */
    scrollbarCleanups.forEach((_, contentEl) => {
        if (contentEl.isConnected) return;
        detachScrollbarForContent(contentEl);
    });
    /* Các phần tử cũ đang xếp hàng chờ tạo thanh tiến trình từ đợt trước cũng bị hủy cùng với việc dựng lại, ở đây loại ra khỏi hàng đợi luôn */
    clearDetachedPendingScrollbarEls();

    /* Đưa tất cả vào hàng đợi quan sát tạo lười, để IntersectionObserver tạo theo yêu cầu dựa trên viewport */
    queueScrollbarsForEls(listEl.querySelectorAll('.rmsg-content'));
}

/* ── Hủy tải (unload) phần thân và Khôi phục theo yêu cầu ─────────────────── */

/* Map<HTMLElement, {scrollTop:number}>: Các phần tử phần thân tin nhắn đã bị hủy tải khi khuất màn hình (Chữ đã bị xóa sạch, chiều cao đã bị khóa).
   Chữ của phần thân không được backup ở đây —— records[].messages[].content chính là nguồn duy nhất, khi khôi phục sẽ ghi lại theo toRenderedText,
   Dùng chung một cơ sở văn bản với highlight tìm kiếm; Ở đây chỉ cần ghi lại vị trí cuộn bên trong phần tử. */
const unloadedBodies = new Map();

/* number: Chiều rộng của danh sách ở lần bảo trì băng thông (band maintenance) trước (px). Việc thu phóng bảng điều khiển / Toàn màn hình trên di động / Chuyển đổi Desktop↔Mobile đều làm thay đổi chiều rộng ngắt dòng của phần thân,
   Chiều cao chỗ chiếm đã khóa sẽ lập tức mất hiệu lực —— Khi phát hiện chiều rộng thay đổi thì trước tiên khôi phục toàn bộ phần thân, ở frame tiếp theo sẽ hủy tải lại theo hình học mới. */
let lastBandListWidth = 0;

/* boolean: Đã có lệnh bảo trì băng thông nào được xếp vào frame tiếp theo chưa (Các kích hoạt liên tục như cuộn/dựng lại... được gộp thành một lần trên một frame) */
let bodyBandPassQueued = false;

/* Thống kê việc hủy tải phần thân (Chỉ dành cho cổng debug read-only __rlogDebug.getBodyUnloadStats; Các assertion hồi quy (regression) và probe hiệu suất cũng đọc nó) */
const bodyUnloadStats = { passes: 0, lastPassMs: 0, restoreAllCount: 0 };

/* Khởi tạo việc bảo trì băng cuộn (scroll band) của danh sách: Khi cuộn, khôi phục theo yêu cầu phần thân tiến vào băng thông, hủy tải phần thân rời khỏi băng thông.
   Chỉ bind một lần sau khi buildUI xây dựng xong danh sách (Bản thân phần tử #rlog-list sẽ không bị thay thế khi dựng lại toàn bộ bảng). */
function initBodyBandMaintenance(listEl) {
    if (!listEl || listEl.dataset.rlogBandBound === '1') return;
    listEl.dataset.rlogBandBound = '1';
    listEl.addEventListener('scroll', () => scheduleBodyBandPass(listEl), { passive: true });
}

/* Băng thông nhìn thấy của danh sách: Trên dưới viewport mỗi bên BODY_KEEP_SCREENS màn hình. Danh sách bị bảng điều khiển cắt xén (clip), dùng chính hình chữ nhật của danh sách là chuẩn nhất */
function getBodyBand(listEl) {
    const rect = listEl.getBoundingClientRect();
    const margin = rect.height * BODY_KEEP_SCREENS;
    return { top: rect.top - margin, bottom: rect.bottom + margin };
}

/* Phần thân này có bị "Ghim chặt" không cho phép hủy tải hay không: Các phần tử chứa <mark> highlight tìm kiếm, và bản ghi đang được tìm kiếm.
   Highlight tìm kiếm và bước nhảy khi trúng mục tiêu (hit jump) đều phụ thuộc vào node văn bản thật, hủy tải chúng sẽ làm mất hiệu lực highlight. */
function isBodyPinned(contentEl) {
    if (contentEl.querySelector('mark.rlog-search-mark, mark.rlog-search-mark-current')) return true;
    if (!searchState) return false;
    const recordEl = contentEl.closest('.rlog-record');
    return !!recordEl && Number(recordEl.dataset.recordIndex) === searchState.recordIndex;
}

/* Hủy tải một phần thân đơn lẻ: Xóa sạch chữ, khóa cứng chiều cao thành chiều cao thực đo (Chỗ chiếm có chiều cao bằng nhau), và ghi lại vị trí cuộn bên trong phần tử.
   height do bên gọi đo sẵn trong "Giai đoạn Đọc" rồi truyền vào; Chỉ khi không truyền thì mới tự đọc một lần (Tránh việc kích hoạt forced layout lần nữa trong giai đoạn Ghi).
   Lưu ý đừng ghi contentEl.scrollTop ở đây: Sau khi xóa sạch, phần tử không thể cuộn nữa, nó sẽ tự động về 0,
   Và việc gán giá trị sẽ ép một lần layout (Thực đo mỗi dòng mất khoảng 1ms, 400 dòng sẽ mất vài trăm mili-giây). */
function unloadBody(contentEl, height) {
    if (!contentEl || unloadedBodies.has(contentEl)) return false;
    const measuredHeight = typeof height === 'number' ? height : contentEl.getBoundingClientRect().height;
    if (measuredHeight <= 0) return false;
    unloadedBodies.set(contentEl, { scrollTop: contentEl.scrollTop });
    contentEl.textContent = '';
    contentEl.style.height = `${measuredHeight}px`;
    contentEl.dataset.rlogUnloaded = '1';
    /* Chỗ chiếm không cần thanh tiến trình nội bộ nữa: Xóa luôn hitbox DOM, listener scroll và đăng ký observer, tài nguyên được giải phóng cùng với chỗ chiếm.
       Khi khôi phục, restoreBody sẽ xếp hàng lại, tạo lại theo cơ chế hiện có, vị trí cuộn đã được ghi vào unloadedBodies ở trên. */
    detachScrollbarForContent(contentEl);
    return true;
}

/* Khôi phục một phần thân đơn lẻ: Ghi lại chữ từ tầng dữ liệu, gỡ bỏ khóa chiều cao, hoàn nguyên vị trí cuộn bên trong phần tử, và xếp hàng lại vào hàng đợi tạo lười thanh tiến trình.
   Khi phần tử đã rời khỏi DOM (Node cũ sau khi dựng lại toàn bộ bảng) thì trực tiếp vứt bỏ mục trong bảng, tránh việc lưu lại toàn bộ cây con danh sách cũ trong bộ nhớ. */
function restoreBody(contentEl) {
    if (!contentEl) return false;
    const state = unloadedBodies.get(contentEl);
    if (!state) return false;
    if (!contentEl.isConnected) {
        unloadedBodies.delete(contentEl);
        return false;
    }
    const msgItem = contentEl.closest('.rmsg-item');
    const msg = msgItem
        ? getMessageByIndex(records[Number(msgItem.dataset.record)], Number(msgItem.dataset.msg))
        : null;
    if (!msg) {
        unloadedBodies.delete(contentEl);
        delete contentEl.dataset.rlogUnloaded;
        contentEl.style.height = '';
        return false;
    }
    unloadedBodies.delete(contentEl);
    contentEl.textContent = toRenderedText(msg.content);
    contentEl.style.height = '';
    delete contentEl.dataset.rlogUnloaded;
    if (state.scrollTop) contentEl.scrollTop = state.scrollTop;
    /* Thanh tiến trình bắt buộc phải xếp hàng lại: Chỗ chiếm không bị tràn, nếu observer lười nhìn thấy nó ở trạng thái chỗ chiếm, nó sẽ trả về sớm và gỡ phần tử ra khỏi hàng đợi quan sát,
       Như vậy sau khi khôi phục, tin nhắn này sẽ vĩnh viễn không có thanh tiến trình (Xem phán đoán tương tự trong queueScrollbarsForEls) */
    queueScrollbarsForEls([contentEl]);
    return true;
}

/* Khôi phục toàn bộ phần thân đã bị hủy tải trong một bản ghi (Bước bắt buộc trước khi mở rộng bản ghi này, hoặc thực hiện tìm kiếm trên bản ghi đó) */
function restoreRecordBodies(recordEl) {
    if (!recordEl) return 0;
    let count = 0;
    recordEl.querySelectorAll('.rmsg-content').forEach((contentEl) => {
        if (restoreBody(contentEl)) count++;
    });
    return count;
}

/* Khôi phục toàn bộ: Dùng khi chiều rộng bảng điều khiển thay đổi làm mất hiệu lực chiều cao chỗ chiếm (Luồng hiếm gặp, cost có thể chấp nhận được) */
function restoreAllBodies() {
    [...unloadedBodies.keys()].forEach((contentEl) => restoreBody(contentEl));
}

/* Vứt bỏ các mục trong bảng đã rời khỏi DOM (Sau khi dựng lại toàn bộ bảng bằng cách dùng innerHTML thay thế toàn bộ danh sách, các node cũ phải được gỡ khỏi bảng kịp thời,
   Nếu không Map sẽ tham chiếu mạnh (strong reference) đến chúng, lưu lại toàn bộ cây con danh sách của đợt trước trong bộ nhớ) */
function pruneDetachedUnloadedBodies() {
    if (unloadedBodies.size === 0) return;
    unloadedBodies.forEach((_, contentEl) => {
        if (!contentEl.isConnected) unloadedBodies.delete(contentEl);
    });
}

/* Một lần bảo trì băng thông. Giai đoạn Đọc đọc xong toàn bộ hình học và trạng thái của tất cả phần thân trước (Không ghi DOM), sau đó thống nhất thực thi khôi phục và hủy tải:
   Ghi một cái đọc cái tiếp theo sẽ khiến mỗi lần đọc đều va phải sự mất hiệu lực của style do việc vừa ghi xong gây ra, buộc phải làm thêm forced layout. */
function runBodyBandPass(listEl) {
    if (!listEl || !listEl.isConnected) return;
    /* Bảng điều khiển ẩn / Danh sách không có layout thực tế thì không làm: Lúc này rect đều bằng 0, phán đoán băng thông không có ý nghĩa */
    if (!isPanelVisible || listEl.clientHeight === 0) return;

    const startedAt = performance.now();

    /* Chiều rộng thay đổi → Chiều cao chỗ chiếm được đo theo chiều rộng cũ, trước tiên khôi phục toàn bộ, frame tiếp theo sẽ hủy tải lại theo hình học mới */
    const width = listEl.clientWidth;
    if (lastBandListWidth > 0 && width !== lastBandListWidth) {
        restoreAllBodies();
        bodyUnloadStats.restoreAllCount++;
        lastBandListWidth = width;
        scheduleBodyBandPass(listEl);
        bodyUnloadStats.lastPassMs = performance.now() - startedAt;
        return;
    }
    lastBandListWidth = width;

    const band = getBodyBand(listEl);

    /* Giai đoạn Đọc: Hình chữ nhật của khu vực nội dung + Có bị ghim hay không + Đã hủy tải chưa (Toàn bộ quá trình không ghi DOM) */
    const measured = [];
    listEl.querySelectorAll('.rmsg-content').forEach((contentEl) => {
        measured.push({
            contentEl,
            rect: contentEl.getBoundingClientRect(),
            unloaded: unloadedBodies.has(contentEl),
            pinned: isBodyPinned(contentEl),
        });
    });

    const inBand = (rect) => rect.bottom > band.top && rect.top < band.bottom;

    /* Giai đoạn Ghi: Khôi phục trước (Khôi phục ưu tiên hơn hủy tải, tránh việc giật lag qua lại ở rìa băng thông), sau đó mới hủy tải */
    measured.forEach(({ contentEl, rect, unloaded }) => {
        if (unloaded && inBand(rect)) restoreBody(contentEl);
    });
    let unloadedCount = 0;
    measured.forEach(({ contentEl, rect, unloaded, pinned }) => {
        if (unloaded || pinned || inBand(rect)) return;
        if (unloadBody(contentEl, rect.height)) unloadedCount++;
    });

    bodyUnloadStats.passes++;
    bodyUnloadStats.lastPassMs = performance.now() - startedAt;
    return unloadedCount;
}

/* Gộp việc bảo trì băng thông vào frame tiếp theo (Khi kích hoạt liên tục do cuộn/viewport thay đổi..., một frame chạy tối đa một lần) */
function scheduleBodyBandPass(listEl) {
    if (bodyBandPassQueued) return;
    bodyBandPassQueued = true;
    requestAnimationFrame(() => {
        bodyBandPassQueued = false;
        const target = listEl && listEl.isConnected
            ? listEl
            : (panelEl ? panelEl.querySelector('#rlog-list') : null);
        runBodyBandPass(target);
    });
}

/* ── Điều khiển bảng điều khiển ─────────────────────────── */

/* Độ dài cạnh thực tế của floating badge: Desktop BADGE_SIZE (34x34), Di động (≤768px) BADGE_SIZE_MOBILE (30x30);
   Kích thước dùng inline style (Định vị floating badge và hiệu chỉnh vượt quá ranh giới cần giá trị pixel cụ thể), trong style.css chỉ chỉnh cỡ chữ của icon */
function getBadgeSize() {
    return window.matchMedia('(max-width: 768px)').matches ? BADGE_SIZE_MOBILE : BADGE_SIZE;
}

/* Vị trí hợp lệ của floating badge trong viewport: Tham số đầu vào là tọa độ góc trên bên trái của floating badge, clamp vào trong viewport (Đảm bảo floating badge hiển thị hoàn toàn).
   Cận dưới của top lấy chiều cao thực tế của thanh cài đặt trên cùng của ST: Layer của floating badge thấp hơn thanh cài đặt trên cùng, nếu đi vào chiều cao đó sẽ bị che khuất không click được,
   Do đó cấm floating badge đi vào khu vực thanh trên cùng, đảm bảo ở bất kỳ vị trí nào cũng có thể nhìn thấy và click được. */
function clampBadgeToViewport(left, top) {
    const size = getBadgeSize();
    const topBarEl = document.getElementById('top-settings-holder');
    const minTop = topBarEl ? Math.ceil(topBarEl.getBoundingClientRect().height) : 0;
    const maxLeft = Math.max(0, window.innerWidth - size);
    const maxTop = Math.max(minTop, window.innerHeight - size);
    return {
        left: Math.min(Math.max(0, left), maxLeft),
        top: Math.min(Math.max(minTop, top), maxTop),
    };
}

/* Vị trí thả mặc định của "Lối vào mặc định của floating badge": Cách rìa phải BADGE_DEFAULT_MARGIN_RIGHT, cách rìa dưới của thanh trên cùng ST xuống dưới một khoảng
   BADGE_DEFAULT_MARGIN_TOP, cuối cùng đi qua clampBadgeToViewport để dự phòng; Sau khi kéo thả sẽ do badgePos tiếp quản. */
function getDefaultBadgePos() {
    const size = getBadgeSize();
    const topBarEl = document.getElementById('top-settings-holder');
    const minTop = topBarEl ? Math.ceil(topBarEl.getBoundingClientRect().height) : 0;
    return clampBadgeToViewport(
        window.innerWidth - size - BADGE_DEFAULT_MARGIN_RIGHT,
        minTop + BADGE_DEFAULT_MARGIN_TOP
    );
}

/* Đồng bộ kích thước floating badge: Chiều rộng/cao của host chuyển đổi theo breakpoint, gọi khi khởi tạo và resize */
function updateBadgeSize() {
    if (!badgeEl) return;
    const size = getBadgeSize();
    badgeEl.style.width = size + 'px';
    badgeEl.style.height = size + 'px';
}

/* Hiện tại ST có phải là theme tối (dark theme) hay không: Đọc --SmartThemeBlurTintColor, tính toán độ sáng cảm nhận tương đối (relative luminance) < ngưỡng thì phán đoán là tối;
   Không đọc được/Không nhận ra/Lỗi phân tích cú pháp thì mặc định xử lý như theme tối (Fallback về floating badge tối màu). @returns {boolean} */
function isStThemeDark() {
    let raw = '';
    try {
        raw = getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBlurTintColor').trim();
    } catch (e) { /* Đọc thất bại: xử lý như theme tối */ }
    const channels = parseCssColorChannels(raw);
    if (!channels) return true;
    return relativeLuminance(channels.r, channels.g, channels.b) < ST_THEME_DARK_LUMINANCE;
}

/* Đồng bộ hệ màu floating badge: ST sáng → Floating badge tối, ST tối → Floating badge sáng (Luôn ngược lại, đảm bảo độ tương phản).
   Chỉ thêm bớt .rlog-badge-light trên host của floating badge (Giá trị hệ màu nằm trong bảng tổng); Khi kết quả phán đoán không đổi thì không động vào DOM, tránh làm ngắt quãng transition. */
function syncBadgeTheme() {
    if (!badgeEl) return;
    const isDark = isStThemeDark();
    /* Trạng thái và class của host đều đã nhất quán thì mới bỏ qua (Thêm một bước kiểm tra class: Có thể tự phục hồi sau khi host được dựng lại) */
    if (isDark === stThemeIsDark && badgeEl.classList.contains('rlog-badge-light') === isDark) return;
    stThemeIsDark = isDark;
    badgeEl.classList.toggle('rlog-badge-light', isDark);
}

/* Khởi tạo việc theo dõi theme cho hệ màu floating badge: Đồng bộ một lần trước, sau đó lắng nghe thuộc tính style của <html> (ST không có sự kiện thay đổi theme);
   Việc mất hiệu lực của điểm gắn (mount point) trong tương lai chỉ biểu hiện ở việc hệ màu floating badge không được cập nhật nữa */
function initBadgeThemeSync() {
    syncBadgeTheme();
    if (badgeThemeObserver) return;
    badgeThemeObserver = new MutationObserver(() => syncBadgeTheme());
    badgeThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
}

/* Reset bảng điều khiển về định vị/kích thước mặc định: Xóa bỏ các inline style do việc kéo thả/thu phóng ghi vào, để giá trị mặc định của style.css có hiệu lực
   (Định vị mặc định vốn dĩ đã nằm trong viewport, không cần hiệu chỉnh ranh giới bổ sung) */
function resetPanelToDefault() {
    if (!panelEl) return;
    panelEl.style.left = '';
    panelEl.style.top = '';
    panelEl.style.right = '';
    panelEl.style.bottom = '';
    panelEl.style.transform = '';
    panelEl.style.width = '';
    panelEl.style.height = '';
    panelEl.style.minHeight = '';
    panelEl.style.maxHeight = '';
    panelEl.style.transition = '';
}

/* Chuyển đổi trạng thái ẩn/hiện của floating badge: Floating badge chỉ hiển thị ở trạng thái "Thu gọn bảng điều khiển" (.rlog-badge-active), còn lại thì ẩn */
function setBadgeActive(active) {
    if (!badgeEl) return;
    if (active) badgeEl.classList.add('rlog-badge-active');
    else badgeEl.classList.remove('rlog-badge-active');
    /* host là light DOM, dùng inline display là ổn định nhất, tránh việc theme của bên thứ ba ảnh hưởng đến trạng thái ẩn/hiện thông qua CSS thông thường */
    badgeEl.style.display = active ? 'flex' : 'none';
}

/* Việc chuyển đổi "Bảng điều khiển ↔ Floating badge" được kích hoạt khi click vào văn bản tiêu đề.
   @param {MouseEvent} [ev] Sự kiện click (Dùng để lấy tọa độ click làm tâm cho floating badge; Khi thu gọn lần đầu mà không có sự kiện thì fallback về căn giữa) */
function togglePanelWindow(ev) {
    isPanelCollapsed = !isPanelCollapsed;
    if (isPanelCollapsed) {
        /* Thu gọn thành floating badge: Lần thu gọn đầu tiên trong phiên sẽ ghi lại tọa độ click lúc đó làm tâm floating badge, thu gọn lần sau sẽ tái sử dụng vị trí đã ghi
           (Sau khi kéo thả thì sẽ là vị trí sau khi kéo); Sau khi làm mới trang, badgePos được reset về null, xử lý như lần thu gọn đầu tiên */
        hidePinToast();
        /* Tương tự như đóng bảng điều khiển: Trước khi ẩn, xóa sạch các class animation đang phát (Nhấp nháy / Chuyển đổi theme),
          Nếu không trong thời gian ẩn animation sẽ không chạy tiếp, khi mở rộng lại sẽ phát bù lại từ đầu một lần */
        clearPanelAnimations();
        /* Tương tự như đóng bảng điều khiển: Trước khi thu gọn, tranh thủ lúc layout còn hiệu lực thì hủy tải các phần thân ngoài viewport, khi mở rộng sẽ không phải trả chi phí dàn trang và vẽ cho chúng */
        runBodyBandPass(panelEl.querySelector('#rlog-list'));
        panelEl.classList.add('rlog-window-collapsed');
        panelEl.style.display = 'none';
        if (badgeEl) {
            if (!badgePos) {
                const size = getBadgeSize();
                const cx = ev ? ev.clientX : window.innerWidth / 2;
                const cy = ev ? ev.clientY : window.innerHeight / 2;
                badgePos = clampBadgeToViewport(cx - size / 2, cy - size / 2);
            } else {
                /* Tái sử dụng vị trí đã ghi, và clamp dưới viewport/kích thước hiện tại (Đảm bảo vẫn nhìn thấy sau khi cửa sổ thu nhỏ hoặc chuyển đổi breakpoint) */
                badgePos = clampBadgeToViewport(badgePos.left, badgePos.top);
            }
            badgeEl.style.left = badgePos.left + 'px';
            badgeEl.style.top = badgePos.top + 'px';
        }
        setBadgeActive(true);
    } else {
        setBadgeActive(false);
        panelEl.classList.remove('rlog-window-collapsed');
        panelEl.style.display = 'flex';
        resetPanelToDefault();
        /* Trong thời gian thu gọn có thể đã có dữ liệu/render thay đổi (Bản ghi mới đến), trước khi khôi phục phải dựng lại DOM trước */
        if (panelContentDirty) {
            renderPanelContent();
        }
        /* Sau khi cửa sổ mở rộng lại thì đo lại chiều cao thanh tiêu đề bản ghi (Trong thời gian ẩn offsetHeight bằng 0, offset dính cần được làm mới) */
        syncRecordHeaderVars(panelEl.querySelector('#rlog-list'));
        /* Khi có bản ghi mới đến trong thời gian thu gọn, sau khi khôi phục mở rộng thì quay lại mục mới nhất trên cùng của danh sách */
        if (pendingScrollToTop) {
            pendingScrollToTop = false;
            const newRecordEl = getRecordElByIndex(0);
            if (newRecordEl) {
                scrollToRecordEl(newRecordEl);
                flashTopHint(newRecordEl);
            } else {
                const listEl = panelEl.querySelector('#rlog-list');
                if (listEl) listEl.scrollTop = 0;
                flashTopHint();
            }
        }
        /* Bảng điều khiển sau khi mở rộng lại sẽ không tự phát ra sự kiện scroll, chủ động chạy một lần bảo trì băng thông (Giống với luồng mở ở trên) */
        runBodyBandPass(panelEl.querySelector('#rlog-list'));
    }
}

function addMenuEntry() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) {
        setTimeout(addMenuEntry, 300);
        return;
    }

    toggleBtn = document.createElement('div');
    toggleBtn.id = 'prompt-capture-toggle';
    toggleBtn.className = 'list-group-item';
    toggleBtn.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> 最近请求记录';
    toggleBtn.addEventListener('click', togglePanel);
    menu.appendChild(toggleBtn);

    /* Trì hoãn việc append lại, đảm bảo xếp sau tất cả các plugin được khởi tạo đồng bộ (appendChild sẽ di chuyển các node đã có) */
    setTimeout(() => {
        if (toggleBtn && toggleBtn.parentNode) {
            toggleBtn.parentNode.appendChild(toggleBtn);
        }
    }, MENU_REORDER_DELAY_MS);
}

/* Thu gọn ngăn kéo "Thêm" (Dành cho việc loại trừ lẫn nhau, click ra ngoài, hướng dẫn sử dụng) */
function closeMoreDrawer() {
    if (!panelEl) return;
    const drawer = panelEl.querySelector('#rlog-more-drawer');
    const btn = panelEl.querySelector('#rlog-more-btn');
    if (drawer) drawer.classList.remove('expanded');
    if (btn) btn.classList.remove('active-drawer-btn');
}

/* Thu gọn ngăn kéo "Bộ lọc" (Dành cho việc loại trừ lẫn nhau, click ra ngoài, hướng dẫn sử dụng) */
function closeFilterDrawer() {
    if (!panelEl) return;
    const drawer = panelEl.querySelector('#rlog-filter-drawer');
    const btn = panelEl.querySelector('#rlog-filter-btn');
    if (drawer) drawer.classList.remove('expanded');
    if (btn) btn.classList.remove('active-drawer-btn');
}

/* Khi chuyển đổi ngăn kéo, ngăn kéo cũ sẽ thu gọn tức thì (Bỏ qua animation): Chiều rộng của hai ngăn kéo chồng lên nhau sẽ làm toàn bộ hàng phình to ra trước rồi mới thụt lại (Nảy trái phải),
   Cho cái cũ biến mất trực tiếp, cái mới mở rộng bình thường là có thể tránh được. Cách làm: Vô hiệu hóa transition → Xóa class mở rộng → Bắt buộc reflow (forced reflow) → Khôi phục transition. */
function closeDrawerInstant(drawer, btn) {
    if (!drawer) return;
    drawer.style.transition = 'none';
    drawer.classList.remove('expanded');
    if (btn) btn.classList.remove('active-drawer-btn');
    void drawer.offsetWidth; /* Bắt buộc reflow: Commit việc thu gọn tức thì, sau khi khôi phục transition sẽ không phát bù animation */
    drawer.style.transition = '';
}

/* Định vị địa chỉ thực của style.css của bản thân plugin này: Ưu tiên dùng <link> style của plugin đã được ST tiêm vào (id có dạng "<Thư_mục>-css"),
   Khi không tìm thấy thì fallback về đường dẫn hardcode. Không dùng import.meta: Khi ST load bằng ES Module thì document.currentScript là null,
   Và khi test logic dùng Node VM để tải file này (Không phải module). */
function getSelfCssUrl() {
    try {
        const link = [...document.querySelectorAll('link[rel="stylesheet"]')].find(l => l.id && l.id.endsWith('RecentRequestLog-css'));
        if (link) return link.href;
    } catch (e) { /* Không có document (Ví dụ như VM test logic không thực thi đến đây) hoặc có ngoại lệ, đi vào đường dự phòng (fallback) */ }
    return '/scripts/extensions/third-party/RecentRequestLog/style.css';
}

/* Nguồn style trong shadow (Ưu tiên): Sao chép đồng bộ các rule từ <link> style.css của plugin này đã được ST load thành <style> trong shadow,
   Tránh việc load bất đồng bộ của <link> khiến các phép đo sớm (Như probe chiều rộng chỗ chiếm trạng thái) không lấy được style của class.
   Shadow root của bảng điều khiển và shadow root của floating badge mỗi cái cần một bản; Việc serialize các rule thông qua selfCssTextCache chỉ làm một lần. */
function buildSelfCssElement() {
    try {
        const selfCssUrl = getSelfCssUrl();
        const link = [...document.querySelectorAll('link[rel="stylesheet"]')].find(l => l.href === selfCssUrl);
        if (link && link.sheet && link.sheet.cssRules && link.sheet.cssRules.length) {
            if (selfCssTextCache === null) {
                selfCssTextCache = [...link.sheet.cssRules].map(r => r.cssText).join('\n');
            }
            const style = document.createElement('style');
            style.textContent = selfCssTextCache;
            return style;
        }
    } catch (e) {
        /* Lỗi cross-domain hoặc stylesheet chưa sẵn sàng...: Chuyển xuống <link> dự phòng bên dưới */
    }
    return buildSelfCssLink();
}

/* Nguồn style trong shadow (Dự phòng): Tham chiếu trực tiếp đến file style.css của bản thân plugin này (Tái sử dụng bộ nhớ cache của trình duyệt, không load lại nội dung) */
function buildSelfCssLink() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = getSelfCssUrl();
    return link;
}

/* Shim cho FA trong shadow: Các rule @font-face / .fa ở cấp độ document không thể lọt vào shadow, ở đây bổ sung một lớp khả dụng tối thiểu vào trong shadow.
   - @font-face tái sử dụng file font fa-solid-900 hiện có của ST (Địa chỉ tuyệt đối, không download không sao chép)
   - Chỉ viết ::before content cho 33 icon mà plugin thực sự sử dụng; Nếu thêm icon mới thì bổ sung một dòng trong FA_SOLID_CONTENT */
function buildFaShimStyle() {
    const style = document.createElement('style');
    const faWoff2 = new URL('webfonts/fa-solid-900.woff2', location.href).href;
    const faTtf = new URL('webfonts/fa-solid-900.ttf', location.href).href;
    const rules = [
        /* Tiêu chuẩn chung trong shadow: box-sizing/làm mịn font chữ... của * toàn cục trong ST không thể lọt vào shadow, ở đây bổ sung vào;
           text-shadow là thuộc tính có thể kế thừa, * toàn cục của ST sẽ thẩm thấu độ rực (glow) của theme qua shadow host, bắt buộc phải reset về none. */
        '*,*::before,*::after{box-sizing:border-box;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;-webkit-tap-highlight-color:transparent;text-shadow:none}',
        '@font-face{font-family:"Font Awesome 6 Free";font-style:normal;font-weight:900;font-display:block;'
            + `src:url("${faWoff2}") format("woff2"),url("${faTtf}") format("truetype")}`,
        '.fa,.fa-solid,.fas{font-family:"Font Awesome 6 Free";font-weight:900;font-style:normal;font-variant:normal;'
            + 'line-height:1;text-rendering:auto;display:inline-block;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}',
    ];
    for (const [name, code] of Object.entries(FA_SOLID_CONTENT)) {
        rules.push(`.fa-solid.fa-${name}:before{content:"${code}"}`);
    }
    style.textContent = rules.join('\n');
    return style;
}

/* Style "Chế độ tối giản" trong shadow: Dùng :host(.rlog-minimal) tắt toàn bộ transition và animation của bảng điều khiển/popup cùng một lúc
   (Popup cùng cấp với #rlog-panel, chỉ có :host mới có thể bao trọn cả hai), giữ lại phản hồi trạng thái tức thời; Bỏ độ mờ (blur) của lớp phủ tùy chọn;
   Miễn trừ rõ ràng cho hướng dẫn sử dụng (.rlog-tour-*). Loại rule :host này chỉ có thể được tiêm vào lúc runtime của JS, nếu viết vào style.css sẽ bị loại bỏ. */
function buildMinimalShimStyle() {
    const style = document.createElement('style');
    const rules = [
        ':host(.rlog-minimal){transition:none!important;animation:none!important}',
        ':host(.rlog-minimal) *,:host(.rlog-minimal) *::before,:host(.rlog-minimal) *::after{transition:none!important;animation:none!important}',
        ':host(.rlog-minimal) .rlog-pref-overlay{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}',
        ':host(.rlog-minimal) .rlog-tour-highlight::before,:host(.rlog-minimal) .rlog-tour-highlight::after{transition:none!important;animation:none!important}',
        ':host(.rlog-minimal) .rlog-tour-highlight{transition:all .3s cubic-bezier(.4,0,.2,1)!important;animation:none!important}',
        ':host(.rlog-minimal) .rlog-tour-tooltip::before,:host(.rlog-minimal) .rlog-tour-tooltip::after{transition:left .3s cubic-bezier(.4,0,.2,1)!important;animation:none!important}',
        ':host(.rlog-minimal) .rlog-tour-tooltip{transition:all .3s cubic-bezier(.4,0,.2,1)!important;animation:rlog-dialog-fadein .3s ease-out!important}',
    ];
    style.textContent = rules.join('\n');
    return style;
}

function buildUI() {
    if (uiBuilt) return;
    uiBuilt = true;

    addMenuEntry();

    /* Tải các cài đặt lưu trữ dài hạn (persistent settings) */
    isLightTheme = loadTheme();
    MAX_RECORDS = loadMaxRecords();
    try {
        masterEnabled = localStorage.getItem(STORAGE_MASTER_KEY) !== '0';
    } catch (e) {
        masterEnabled = true;
    }

    panelEl = document.createElement('div');
    panelEl.id = 'rlog-panel';
    panelEl.style.display = 'none';

    applyTheme();

    panelEl.innerHTML = `
        <div class="rlog-panel-header">
            <h4>
                <span class="rlog-title-text" title="Nhấp để thu gọn/mở rộng">Nhật ký yêu cầu gần đây</span>
                <span class="rlog-title-count" title="Bấm đúp để sửa giới hạn bản ghi">${getHeaderCountText()}</span>
                <span class="rlog-filter-indicator" id="rlog-filter-indicator" hidden>
                    <span id="rlog-filter-indicator-text"></span>
                    <button id="rlog-filter-reset-btn" title="Đặt lại bộ lọc" aria-label="Đặt lại bộ lọc"><i class="fa-solid fa-rotate-left"></i></button>
                </span>
            </h4>
            <div class="rlog-header-drag-space" style="flex: 1; height: 28px; cursor: move; margin: 0 10px;"></div>
            <div class="rlog-header-actions">
                <div class="rlog-more-drawer" id="rlog-more-drawer">
                    <button id="rlog-master-toggle" class="rlog-header-btn rlog-master-on" title="Công tắc tổng: Đã bật — Nhấp để tắt">
                        <i class="fa-solid fa-power-off"></i>
                    </button>
                    <button id="rlog-help-btn" class="rlog-header-btn" title="Xem hướng dẫn sử dụng">
                        <i class="fa-solid fa-question"></i>
                    </button>
                    <button id="rlog-pref-btn" class="rlog-header-btn" title="Cài đặt tùy chọn">
                        <i class="fa-solid fa-heart"></i>
                    </button>
                    <button id="rlog-preview-btn" class="rlog-header-btn" title="Xem trước nội dung-Đã tắt">
                        <i class="fa-solid fa-eye-slash"></i>
                    </button>
                    <button id="rlog-clear-btn" class="rlog-header-btn" title="Xóa tất cả bản ghi">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                    <button id="rlog-theme-btn" class="rlog-header-btn" title="Chuyển chế độ Ngày/Đêm">
                        <i class="fa-solid fa-sun"></i>
                    </button>
                </div>
                <div class="rlog-filter-drawer" id="rlog-filter-drawer">
                    <span class="rlog-filter-group">
                        <button class="rlog-filter-chip rlog-filter-chip-on" data-filter-group="source" data-filter-value="native" title="Yêu cầu native"><i class="fa-solid fa-paper-plane"></i></button>
                        <button class="rlog-filter-chip rlog-filter-chip-on" data-filter-group="source" data-filter-value="plugin" title="Yêu cầu plugin/non-native"><i class="fa-solid fa-puzzle-piece"></i></button>
                    </span>
                    <span class="rlog-filter-group">
                        <button class="rlog-filter-chip rlog-filter-chip-on rlog-filter-chip-model" data-filter-group="model" data-filter-value="gemini" title="Gemini">${FILTER_MODEL_SVG.gemini_full}</button>
                        <button class="rlog-filter-chip rlog-filter-chip-on rlog-filter-chip-model" data-filter-group="model" data-filter-value="claude" title="Claude"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${FILTER_MODEL_SVG.claude}"/></svg></button>
                        <button class="rlog-filter-chip rlog-filter-chip-on rlog-filter-chip-model" data-filter-group="model" data-filter-value="deepseek" title="DeepSeek"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${FILTER_MODEL_SVG.deepseek}"/></svg></button>
                        <button class="rlog-filter-chip rlog-filter-chip-on" data-filter-group="model" data-filter-value="other" title="Khác"><i class="fa-solid fa-list"></i></button>
                    </span>
                    <span class="rlog-filter-group">
                        <button class="rlog-filter-chip rlog-filter-chip-on" data-filter-group="role" data-filter-value="system" title="System"><i class="fa-solid fa-gear"></i></button>
                        <button class="rlog-filter-chip rlog-filter-chip-on" data-filter-group="role" data-filter-value="assistant" title="Assistant"><i class="fa-solid fa-comment-dots"></i></button>
                        <button class="rlog-filter-chip rlog-filter-chip-on" data-filter-group="role" data-filter-value="user" title="User"><i class="fa-solid fa-user"></i></button>
                        <button class="rlog-filter-chip rlog-filter-chip-on" data-filter-group="role" data-filter-value="other" title="Khác"><i class="fa-solid fa-list"></i></button>
                    </span>
                </div>
                <button id="rlog-more-btn" class="rlog-header-btn" title="Tùy chọn khác">
                    <i class="fa-solid fa-ellipsis"></i>
                </button>
                <button id="rlog-filter-btn" class="rlog-header-btn" title="Lọc bản ghi">
                    <i class="fa-solid fa-filter"></i>
                    <span class="rlog-filter-dot"></span>
                </button>
                <button id="rlog-global-search-btn" class="rlog-header-btn" title="Tìm kiếm tất cả bản ghi (Placeholder)">
                    <i class="fa-solid fa-magnifying-glass"></i>
                </button>
                <button id="rlog-collapse-all-btn" class="rlog-header-btn" title="Thu gọn tất cả các mục">
                    <i class="fa-solid fa-compress-alt"></i>
                </button>
                <button id="rlog-close-btn" class="rlog-close-btn" title="Đóng bảng điều khiển"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div class="rlog-panel-body">
            <div id="rlog-list" class="rlog-list">
                <div class="rlog-empty">${escapeHtml(masterEnabled ? 'Hiện chưa có nhật ký yêu cầu nào, vui lòng gửi tin nhắn rồi xem lại.' : 'Chức năng ghi đã bị tắt, vui lòng nhấp vào biểu tượng nguồn để bật.')}</div>
            </div>
            <div class="rlog-resize-grip" title="Kéo để điều chỉnh kích thước cửa sổ"></div>
        </div>
        <div id="rlog-pin-toast" class="rlog-pin-toast" aria-live="polite"></div>
        <div class="rlog-pref-overlay" id="rlog-pref-overlay">
            <div class="rlog-pref-panel">
                <div class="rlog-pref-header">
                    <div class="rlog-pref-header-text">
                        <span class="rlog-pref-title">Cài đặt tùy chọn</span>
                        <div class="rlog-pref-sub">Một số cài đặt lưu trữ dài hạn cho các tùy chọn cụ thể</div>
                    </div>
                    <button class="rlog-pref-close" title="Đóng"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="rlog-pref-divider"></div>
                <div class="rlog-pref-list-wrap">
                    <i class="rlog-pref-scroll rlog-pref-scroll-up fa-solid fa-chevron-up"></i>
                    <div class="rlog-pref-list">
                        <div class="rlog-pref-item">
                            <div class="rlog-pref-item-text">
                                <span class="rlog-pref-label">Floating badge làm lối vào mặc định</span>
                                <div class="rlog-pref-item-desc">Sau khi bật, plugin khởi động sẽ hiển thị floating badge theo mặc định<br>Nếu không, floating badge chỉ xuất hiện khi thu nhỏ</div>
                            </div>
                            <button class="rlog-toggle" data-pref-key="badgeDefault" role="switch" aria-checked="false" aria-label="Floating badge làm lối vào mặc định"></button>
                        </div>
                        <div class="rlog-pref-item">
                            <div class="rlog-pref-item-text">
                                <span class="rlog-pref-label">Chế độ Ngày/Đêm đi theo theme ST</span>
                                <div class="rlog-pref-item-desc">Sau khi bật, chế độ Ngày/Đêm tự động đi theo theme sáng/tối<br>Ở chế độ này, nút chuyển đổi thủ công sẽ không có tác dụng</div>
                            </div>
                            <button class="rlog-toggle" data-pref-key="followStTheme" role="switch" aria-checked="false" aria-label="Chế độ Ngày/Đêm đi theo theme ST"></button>
                        </div>
                        <div class="rlog-pref-item">
                            <div class="rlog-pref-item-text">
                                <span class="rlog-pref-label">Mặc định toàn màn hình trên di động</span>
                                <div class="rlog-pref-item-desc">Khu vực đọc được tối đa hóa, ghi đè cài đặt tiếp theo<br>Vì không còn khu vực ngoài bảng điều khiển nữa</div>
                            </div>
                            <button class="rlog-toggle" data-pref-key="mobileFull" role="switch" aria-checked="false" aria-label="Mặc định toàn màn hình trên di động"></button>
                        </div>
                        <div class="rlog-pref-item">
                            <div class="rlog-pref-item-text">
                                <span class="rlog-pref-label">Nhấp ra ngoài bảng điều khiển để đóng</span>
                                <div class="rlog-pref-item-desc">Không cần phải vật lộn với nút x nữa, bấm đâu cũng đóng được</div>
                            </div>
                            <button class="rlog-toggle" data-pref-key="clickOutside" role="switch" aria-checked="false" aria-label="Nhấp ra ngoài bảng điều khiển để đóng"></button>
                        </div>
                        <div class="rlog-pref-item">
                            <div class="rlog-pref-item-text">
                                <span class="rlog-pref-label">Lưu trạng thái bộ lọc</span>
                                <div class="rlog-pref-item-desc">Các mục lọc không còn tự động đặt lại nữa<br>Nếu bật mà không tìm thấy nội dung, hãy nhớ đặt lại bộ lọc trước</div>
                            </div>
                            <button class="rlog-toggle" data-pref-key="filterPersist" role="switch" aria-checked="false" aria-label="Lưu trạng thái bộ lọc"></button>
                        </div>
                        <div class="rlog-pref-item">
                            <div class="rlog-pref-item-text">
                                <span class="rlog-pref-label">Chế độ tối giản</span>
                                <div class="rlog-pref-item-desc">Bỏ tất cả cuộn mượt, lơ lửng (hover), thông báo nhấp nháy<br>và các hiệu ứng hình ảnh khác, cực kỳ trực diện</div>
                            </div>
                            <button class="rlog-toggle" data-pref-key="minimal" role="switch" aria-checked="false" aria-label="Chế độ tối giản"></button>
                        </div>
                    </div>
                    <i class="rlog-pref-scroll rlog-pref-scroll-down fa-solid fa-chevron-down"></i>
                </div>
            </div>
        </div>
    `;

    panelEl.classList.remove('rlog-window-collapsed');

    /* Bảo trì băng thông phần thân trong khi bảng điều khiển mở: Bổ sung phần thân vào viewport theo yêu cầu khi cuộn, hủy tải những phần rời khỏi viewport */
    initBodyBandMaintenance(panelEl.querySelector('#rlog-list'));

    /* Cách ly Shadow DOM: host + shadow root, bảng điều khiển và style của nó được đưa vào shadow, không bị CSS theme bên thứ ba ghi đè */
    shadowHostEl = document.createElement('div');
    shadowHostEl.id = 'rlog-shadow-host';
    panelShadowRoot = shadowHostEl.attachShadow({ mode: 'open' });
    panelShadowRoot.appendChild(buildSelfCssElement());
    panelShadowRoot.appendChild(buildFaShimStyle());
    panelShadowRoot.appendChild(buildMinimalShimStyle());
    panelShadowRoot.appendChild(panelEl);
    document.body.appendChild(shadowHostEl);

    /* Floating badge: light DOM host độc lập (#rlog-badge-host) + shadow root riêng của nó.
       host được bộc lộ trong DOM thông thường (kèm script_id/role/title/class/định vị cố định) để bên thứ ba có thể nhận diện và thu gọn;
       Hình ảnh hiển thị (visual) nằm bên trong shadow root của host (.rlog-badge-visual), theme của bên thứ ba không thể chạm tới. */
    badgeEl = document.createElement('div');
    badgeEl.id = 'rlog-badge-host';
    badgeEl.className = 'rlog-badge-host rlog-floating-button';
    badgeEl.setAttribute('script_id', 'recent-request-log-badge');
    badgeEl.setAttribute('role', 'button');
    badgeEl.setAttribute('aria-label', 'Nhật ký yêu cầu gần đây');
    badgeEl.title = 'Nhật ký yêu cầu gần đây';
    badgeEl.style.cssText =
        `position:fixed;display:none;width:${getBadgeSize()}px;height:${getBadgeSize()}px;`
        + 'cursor:pointer;z-index:2999;box-sizing:border-box;background:transparent;border:0;padding:0;margin:0;';
    /* Icon trong light DOM: Dành cho các plugin thu gọn của bên thứ ba đọc icon lối vào thông qua querySelector(i). Host có shadow root riêng,
       bản thân phần tử con trong light DOM sẽ không tham gia vào việc render; hidden chỉ là để khai báo ý định — CSS FA của ST sẽ gán display cho .fa-solid. */
    badgeEl.innerHTML = '<i class="fa-solid fa-clock-rotate-left" hidden></i>';

    const badgeShadowRoot = badgeEl.attachShadow({ mode: 'open' });
    /* Nguồn style cho hình ảnh hiển thị của floating badge: Cùng cách làm với shadow root của bảng điều khiển, sao chép cùng một file style.css vào shadow root */
    badgeShadowRoot.appendChild(buildSelfCssElement());
    badgeShadowRoot.appendChild(buildFaShimStyle());
    badgeVisualEl = document.createElement('div');
    badgeVisualEl.className = 'rlog-badge-visual';
    badgeVisualEl.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i>';
    badgeShadowRoot.appendChild(badgeVisualEl);
    document.body.appendChild(badgeEl);

    /* Đồng bộ kích thước hiện tại của floating badge, sau đó giao cho tương tác con trỏ (Hệ màu được cung cấp bởi các biến gắn trên #rlog-badge-host trong style.css) */
    updateBadgeSize();
    initBadgeInteraction();
    /* Hệ màu của floating badge đi theo theme sáng/tối của ST (Bao gồm cả listener cho việc chuyển đổi theme sau này; Giá trị hệ màu vẫn lấy từ bảng biến tổng trong style.css) */
    initBadgeThemeSync();
    /* Sau khi host đã sẵn sàng, áp dụng lại các class theme (Dành cho bảng điều khiển/popup; Hệ màu của floating badge đã tự động đi theo theme ST ở trên) */
    applyTheme();

    /* Tách chữ tiêu đề H4: Nhấp vào phần chữ để thu gọn/mở rộng, bấm đúp vào phần số để cài đặt số lượng bản ghi tối đa */
    {
        const textEl = panelEl.querySelector('.rlog-title-text');
        const countEl = panelEl.querySelector('.rlog-title-count');
        /* number|null: ID của timer dùng để trì hoãn việc phán đoán click đúp/đơn (Chỉ dùng cho phần số) */
        let countClickTimer = null;

        /* Phần chữ: Nhấp để thu gọn/mở rộng cửa sổ ngay lập tức (Không có độ trễ) */
        textEl.addEventListener('click', (e) => {
            e.stopPropagation();
            /* Không thu gọn trong lúc hướng dẫn: Floating badge sẽ làm mục tiêu highlight của hướng dẫn (phần tử trong bảng điều khiển) biến mất, làm hỏng hướng dẫn */
            if (tourActive) return;
            togglePanelWindow(e);
        });

        /* Phần số: Bấm đúp để bật lên hộp thoại cài đặt (Nhấp đơn không phản hồi) */
        countEl.addEventListener('click', (e) => {
            e.stopPropagation();

            if (countClickTimer) {
                clearTimeout(countClickTimer);
                countClickTimer = null;
                showMaxRecordsDialog();
                return;
            }

            countClickTimer = setTimeout(() => {
                countClickTimer = null;
            }, DOUBLE_CLICK_THRESHOLD);
        });
    }

    const moreBtn = panelEl.querySelector('#rlog-more-btn');
    const moreDrawer = panelEl.querySelector('#rlog-more-drawer');
    const filterBtn = panelEl.querySelector('#rlog-filter-btn');
    const filterDrawer = panelEl.querySelector('#rlog-filter-drawer');

    moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (filterDrawer.classList.contains('expanded')) {
            /* Chuyển đổi ngăn kéo: Ngăn kéo cũ thu gọn tức thì (Bỏ qua transition), ngăn kéo mới mở rộng bình thường, tránh việc chiều rộng hai ngăn kéo chồng lên nhau làm nảy (bounce) giao diện */
            closeDrawerInstant(filterDrawer, filterBtn);
        } else {
            closeFilterDrawer();
        }
        moreDrawer.classList.toggle('expanded');
        if (moreDrawer.classList.contains('expanded')) {
            moreBtn.classList.add('active-drawer-btn');
        } else {
            moreBtn.classList.remove('active-drawer-btn');
        }
    });

    filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (moreDrawer.classList.contains('expanded')) {
            closeDrawerInstant(moreDrawer, moreBtn);
        } else {
            closeMoreDrawer();
        }
        filterDrawer.classList.toggle('expanded');
        if (filterDrawer.classList.contains('expanded')) {
            filterBtn.classList.add('active-drawer-btn');
        } else {
            filterBtn.classList.remove('active-drawer-btn');
        }
    });

    filterDrawer.querySelectorAll('.rlog-filter-chip').forEach((chip) => {
        chip.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFilterChip(chip.dataset.filterGroup, chip.dataset.filterValue);
        });
    });

    const filterResetBtn = panelEl.querySelector('#rlog-filter-reset-btn');
    if (filterResetBtn) {
        filterResetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetFilters();
        });
    }

    /* Tìm kiếm toàn cục hiện chỉ có placeholder lối vào: Nhấp để hiện thông báo nhẹ (Sẽ thay thế đoạn này khi chức năng chính thức được triển khai) */
    const globalSearchBtn = panelEl.querySelector('#rlog-global-search-btn');
    if (globalSearchBtn) {
        globalSearchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showPinToast('Tìm kiếm toàn cục vui lòng chờ cập nhật sau');
        });
    }

    /* Lắng nghe click toàn cục: Nhấp ra ngoài để thu gọn bất kỳ ngăn kéo nào đang mở (Loại trừ lẫn nhau giữa "Thêm" và "Bộ lọc") */
    if (!document.rlogHeaderDrawerListenerInstalled) {
        document.rlogHeaderDrawerListenerInstalled = true;
        document.addEventListener('click', (e) => {
            if (panelEl && isPanelVisible) {
                const drawerPairs = [
                    { drawer: panelEl.querySelector('#rlog-more-drawer'), btn: panelEl.querySelector('#rlog-more-btn') },
                    { drawer: panelEl.querySelector('#rlog-filter-drawer'), btn: panelEl.querySelector('#rlog-filter-btn') },
                ];
                drawerPairs.forEach(({ drawer, btn }) => {
                    if (drawer && drawer.classList.contains('expanded')
                        && !drawer.contains(e.target) && !btn.contains(e.target)) {
                        drawer.classList.remove('expanded');
                        btn.classList.remove('active-drawer-btn');
                    }
                });
            }
        });
    }

    /* Lắng nghe click toàn cục: Khi bật "Nhấp ra ngoài bảng điều khiển để đóng", nhấp ra ngoài bảng điều khiển sẽ đóng nó.
       Click bên trong shadow sẽ được redirect đến #rlog-shadow-host, do đó dùng e.target === shadowHostEl ||
       e.composedPath().includes(panelEl) để phán đoán là bên trong bảng điều khiển; Đồng thời cho qua nút chuyển đổi menu của chính plugin,
       nếu không cú click dùng nó để mở bảng điều khiển sẽ lập tức đóng bảng điều khiển lại. */
    if (!document.rlogOutsideCloseListenerInstalled) {
        document.rlogOutsideCloseListenerInstalled = true;
        document.addEventListener('click', (e) => {
            if (!preferences.clickOutside || !isPanelVisible) return;
            /* Trạng thái floating badge: Nhấp ra ngoài bảng điều khiển sẽ không xóa floating badge (Nó là lối vào do người dùng chủ động thu gọn tạo ra), click vào bản thân floating badge sẽ do chính floating badge xử lý */
            if (isPanelCollapsed) return;
            if (toggleBtn && toggleBtn.contains(e.target)) return;
            const insidePanel = e.target === shadowHostEl || e.composedPath().includes(panelEl);
            if (insidePanel) return;
            hidePanel();
        });
    }

    panelEl.querySelector('#rlog-close-btn').addEventListener('click', hidePanel);

    panelEl.querySelector('#rlog-collapse-all-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        collapseAllEntries();
    });

    panelEl.querySelector('#rlog-clear-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const normalCount = getNormalRecords().length;
        const pinnedCount = records.length - normalCount;
        if (normalCount === 0) {
            /* Không có bản ghi thông thường: Chỉ hiện thông báo nhẹ, không bật popup xác nhận, không xóa bất kỳ bản ghi nào */
            showPinToast(pinnedCount > 0
                ? 'Không có bản ghi thông thường nào để xóa, bản ghi được ghim sẽ không bị xóa'
                : 'Không có bản ghi nào để xóa');
            return;
        }
        /* Khi bộ lọc đang hoạt động, cần ghi rõ trong văn bản xác nhận rằng các bản ghi thông thường bị ẩn cũng sẽ bị xóa cùng */
        const visibleNormalCount = getVisibleRecords().filter(r => !r.pinned).length;
        const hiddenNormalCount = normalCount - visibleNormalCount;
        const pinnedNote = pinnedCount > 0
            ? `<br>（<strong>${pinnedCount}</strong> bản ghi được ghim sẽ được giữ lại）`
            : '<br>（Không có bản ghi được ghim）';
        showConfirmDialog({
            title: 'Xóa tất cả bản ghi',
            message: hiddenNormalCount > 0
                ? `Bạn có chắc chắn muốn xóa toàn bộ <strong>${normalCount}</strong> bản ghi yêu cầu thông thường không? (Trong đó có <strong>${hiddenNormalCount}</strong> bản ghi đang bị ẩn bởi bộ lọc, cũng sẽ bị xóa cùng)${pinnedNote}<br>Thao tác này không thể hoàn tác.`
                : `Bạn có chắc chắn muốn xóa toàn bộ <strong>${normalCount}</strong> bản ghi yêu cầu thông thường không?${pinnedNote}<br>Thao tác này không thể hoàn tác.`,
            confirmText: 'Xóa',
            cancelText: 'Hủy',
            onConfirm: () => {
                clearAllRecords();
            },
        });
    });

    panelEl.querySelector('#rlog-help-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.__RLogTour && typeof window.__RLogTour.start === 'function') {
            /* Đảm bảo bảng điều khiển đã mở rộng và cả hai ngăn kéo đều thu gọn */
            closeMoreDrawer();
            closeFilterDrawer();
            
            if (isPanelCollapsed) togglePanelWindow();
            
            window.__RLogTour.start();
        }
    });

    buildSimulatePromptButton(panelEl);

    /* Cài đặt tùy chọn: Nút lối vào + Lớp phủ (overlay) */
    prefBtnEl = panelEl.querySelector('#rlog-pref-btn');
    prefOverlayEl = panelEl.querySelector('#rlog-pref-overlay');

    if (prefBtnEl) {
        prefBtnEl.addEventListener('click', (e) => {
            e.stopPropagation();
            openPrefPanel();
            e.currentTarget.blur();
        });
    }

    if (prefOverlayEl) {
        /* Nút × ở góc trên bên phải là cách duy nhất để đóng lớp phủ */
        const prefCloseEl = prefOverlayEl.querySelector('.rlog-pref-close');
        if (prefCloseEl) {
            prefCloseEl.addEventListener('click', (e) => {
                e.stopPropagation();
                closePrefPanel();
                e.currentTarget.blur();
            });
        }

        /* Mỗi Toggle: Nhấp để lật trạng thái + Lưu trữ dài hạn + Cập nhật trạng thái icon lối vào */
        const toggles = prefOverlayEl.querySelectorAll('.rlog-toggle');
        toggles.forEach((toggle) => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const key = toggle.getAttribute('data-pref-key');
                if (!key) return;
                setPreference(key, !preferences[key]);
                e.currentTarget.blur();
            });
        });

        const prefListEl = prefOverlayEl.querySelector('.rlog-pref-list');
        if (prefListEl) {
            prefListEl.addEventListener('scroll', () => updatePrefScrollArrows(), { passive: true });
        }

        /* Nhấp vào phần mask không làm gì cả: Nó chỉ chịu trách nhiệm che bảng điều khiển, chặn tương tác ở lớp dưới, lớp phủ chỉ có thể đóng qua nút × ở góc trên bên phải */
    }

    /* Tải các tùy chọn lưu trữ dài hạn và đồng bộ icon lối vào + giao diện của công tắc */
    loadPreferences();
    updatePrefButtonIcon();
    syncPrefToggleUI();
    /* Mặc định toàn màn hình trên di động: Dựa vào tùy chọn + viewport hiện tại để thiết lập class toàn màn hình (Bảng điều khiển lúc này đang display:none, style sẽ có hiệu lực khi hiển thị) */
    updateMobileFullscreenClass();
    /* Chế độ tối giản: Dựa vào tùy chọn để thêm/bớt class trên shadow host (Kích hoạt rule :host tối giản) */
    updateMinimalClass();
    /* "Chế độ Ngày/Đêm đi theo theme ST": Khi bật, đồng bộ tĩnh với theme hiện tại của ST và gắn listener thay đổi theme (Lúc này không phát animation) */
    initPanelThemeFollow(false);
    /* Lưu trạng thái bộ lọc: Khi bật, đọc trạng thái bộ lọc đã lưu từ lần trước để ghi đè giá trị mặc định (Phải có hiệu lực trước updateFilterChipUI) */
    loadPersistedFilterState();
    /* "Floating badge làm lối vào mặc định": Khi bật thì khởi động hiển thị mặc định floating badge (Vị trí mặc định ở góc trên bên phải), bảng điều khiển giữ nguyên trạng thái ẩn, không thu gọn;
       badgePos vẫn không lưu trữ dài hạn —— Làm mới trang/Khởi tạo lại sẽ về vị trí mặc định */
    if (preferences.badgeDefault && badgeEl) {
        if (!badgePos) badgePos = getDefaultBadgePos();
        else badgePos = clampBadgeToViewport(badgePos.left, badgePos.top);
        badgeEl.style.left = badgePos.left + 'px';
        badgeEl.style.top = badgePos.top + 'px';
        setBadgeActive(true);
    }

    panelEl.querySelector('#rlog-theme-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        /* Khi "Chế độ Ngày/Đêm đi theo theme ST" đang bật thì việc chuyển đổi thủ công không có tác dụng: Tương tác nút giữ nguyên, chỉ hiện toast báo lý do */
        if (preferences.followStTheme) {
            showPinToast('Vui lòng tắt tự động theo dõi theme trước');
            return;
        }
        isLightTheme = !isLightTheme;
        saveTheme(isLightTheme);
        applyTheme();
        updateThemeButtonIcon();
        playThemeSwitchAnimation();
    });
    updateThemeButtonIcon();

    const masterToggleBtn = panelEl.querySelector('#rlog-master-toggle');
    if (masterToggleBtn) {
        masterToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setMasterEnabled(!masterEnabled);
            e.target.blur();
        });
    }
    updateMasterToggleUI();

    contentPreviewEnabled = loadContentPreview();
    updatePreviewToggleUI();

    const previewToggleEl = panelEl.querySelector('#rlog-preview-btn');
    if (previewToggleEl) {
        previewToggleEl.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleContentPreview();
        });
    }

    makeDraggable(panelEl);
    makeResizable(panelEl);

    /* Chiều rộng của viewport/bảng điều khiển thay đổi (Bao gồm chuyển đổi Desktop↔Mobile, kéo để đổi chiều rộng) sẽ làm thay đổi chiều cao ngắt dòng của thanh tiêu đề bản ghi, cần đo lại offset dính;
       Các lần resize liên tiếp sẽ được scheduleViewportSync gộp vào frame tiếp theo, một frame đo lại tối đa một lần */
    if (!window.rlogHeaderVarResizeInstalled) {
        window.rlogHeaderVarResizeInstalled = true;
        window.addEventListener('resize', scheduleViewportSync);
    }

    /* Cài đặt listener nhận diện nguồn gốc (Chỉ ghi lại lối vào native của người dùng, không bị ảnh hưởng bởi công tắc tổng) */
    installSourceTracking();

    /* Cài đặt theo dõi lượt tạo chính (generation pass) (Mỏ neo để nhận diện theo chiều xuôi của RQ-32) */
    installGenerationPassTracking();
    /* Cài đặt theo dõi sửa chữa nguồn gốc (RQ-32: Nâng cấp hạn chế từ "plugin → native" sau khi phản hồi đã xuất hiện trên giao diện) */
    installSourceCorrectionTracking();

    /* Cài đặt chặn yêu cầu (fetch + XHR; Bên trong sẽ dựa vào masterEnabled để quyết định có ghi hay không) */
    installRequestHooks();
    /* Cài đặt chặn yêu cầu iframe đồng nguồn */
    installIframeRequestHooks();

    /* Đồng bộ trạng thái hiển thị của các nút phân đoạn bộ lọc (Khi hướng dẫn/API đã thay đổi trạng thái thì lấy trạng thái thực tế làm chuẩn) */
    updateFilterChipUI();

    /* Toast ghim/bỏ ghim: Nhấp để loại bỏ sớm (Chặn nổi bọt sự kiện (event bubbling) để tránh kích hoạt listener "Nhấp ra ngoài bảng điều khiển để đóng" cấp độ document) */
    const pinToast = panelEl.querySelector('#rlog-pin-toast');
    if (pinToast) {
        pinToast.addEventListener('click', (e) => {
            e.stopPropagation();
            hidePinToast();
        });
    }

    renderPanelContent();
}

function updateThemeButtonIcon() {
    const btn = panelEl ? panelEl.querySelector('#rlog-theme-btn') : null;
    if (!btn) return;
    btn.innerHTML = isLightTheme
        ? '<i class="fa-solid fa-moon"></i>'
        : '<i class="fa-solid fa-sun"></i>';
}

/* Animation chuyển đổi theme Ngày/Đêm (Thu phóng như hơi thở (breathing scale) + Chuyển màu theme tức thì): Nút Ngày/Đêm và tự động chuyển đổi "Đi theo theme ST" sử dụng chung một kịch bản này.
   Điều kiện tiền đề: Trước khi gọi, isLightTheme đã được cập nhật, các class theme đã được áp dụng.
   Màu theme sử dụng chuyển đổi tức thì thay vì chuyển dần (fade) từng phần tử một: Các phần tử cấp tin nhắn trong bảng điều khiển và pseudo-element (phần tử giả) của chúng đều có transition màu 0.35s,
   Nếu chuyển dần từng phần tử sẽ tạo ra một lượng lớn transition trong frame chuyển đổi, gây sụt frame liên tục; Phản hồi trực quan của việc chuyển đổi sẽ do animation thu phóng như hơi thở đảm nhận. */
function playThemeSwitchAnimation() {
    if (!panelEl) return;
    panelEl.classList.remove('rlog-anim-light', 'rlog-anim-dark');

    /* Chế độ tối giản: Theme đã được chuyển tức thì qua applyTheme(), bỏ qua kịch bản animation (Đồng thời cũng tránh sót lại các class animation) */
    if (preferences.minimal) return;

    /* Vô hiệu hóa tất cả các transition màu bên trong bảng điều khiển trước: Băng qua 2 frame để màu theme được chốt thành màu cuối cùng trong 2 frame này,
       Sau đó tháo bỏ class vô hiệu hóa, phát animation thu phóng như hơi thở */
    panelEl.classList.add('rlog-theme-transitioning');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            panelEl.classList.remove('rlog-theme-transitioning');
            /* Trong 2 frame này bảng điều khiển có thể đã bị ẩn (Đóng / Thu gọn thành floating badge): Không bổ sung class animation trong thời gian bị ẩn,
               Nếu không khi hiển thị lại sẽ phát bù lại từ đầu một lần */
            if (!isPanelVisible || isPanelCollapsed) return;
            if (isLightTheme) {
                panelEl.classList.add('rlog-anim-light');
            } else {
                panelEl.classList.add('rlog-anim-dark');
            }
            /* Xóa class animation sau khi animation kết thúc, tránh việc phát lại khi đóng rồi mở cửa sổ */
            const onAnimEnd = () => {
                panelEl.classList.remove('rlog-anim-light', 'rlog-anim-dark');
                panelEl.removeEventListener('animationend', onAnimEnd);
            };
            panelEl.addEventListener('animationend', onAnimEnd);
        });
    });
}

function togglePanel() {
    isPanelVisible ? hidePanel() : showPanel();
}

/* Trước khi ẩn bảng điều khiển (Đóng bảng điều khiển / Thu gọn thành floating badge), xóa bỏ class animation đang phát, hủy bỏ nhấp nháy (flash) đang chờ kích hoạt.
   Trong thời gian phần tử bị ẩn, animation sẽ không chạy tiếp, cũng không phát sinh animationend, nếu giữ class lại sẽ phát bù từ đầu khi hiển thị lại;
   Cả hai luồng ẩn đều sử dụng chung phần này để đảm bảo hành vi dọn dẹp nhất quán.
   rlog-theme-transitioning vốn dĩ sẽ được gỡ bỏ bởi rAF kép, nếu trùng hợp bị ẩn trong 2 frame đó thì cũng xóa luôn. */
function clearPanelAnimations() {
    if (!panelEl) return;
    clearHeaderFlash(panelEl);   /* Xóa class nhấp nháy + Hủy bỏ nhấp nháy cuộn xuống đáy (scroll to bottom) đang chờ kích hoạt trong bảng điều khiển */
    cancelPendingFlash();        /* Dự phòng: Khi mục tiêu chờ kích hoạt đã bị dựng lại (rebuild) / bị đưa ra khỏi bảng điều khiển thì cũng xóa timer */
    panelEl.classList.remove('rlog-anim-light', 'rlog-anim-dark', 'rlog-theme-transitioning');
}

function showPanel() {
    if (!panelEl) buildUI();
    /* Dự phòng: Đảm bảo bảng điều khiển sẽ quay lại trạng thái mở rộng từ trạng thái floating badge/thu gọn */
    setBadgeActive(false);
    panelEl.classList.remove('rlog-window-collapsed');
    isPanelCollapsed = false;
    /* "Floating badge làm lối vào mặc định": Việc mở lại bảng điều khiển luôn đưa nó về vị trí/kích thước mặc định của plugin (Hai luồng mở được thống nhất);
       Lối vào không mặc định thì giữ nguyên vị trí hiển thị ban đầu */
    if (preferences.badgeDefault) resetPanelToDefault();
    panelEl.style.display = 'flex';
    isPanelVisible = true;
    /* Mặc định toàn màn hình trên di động: Tùy chọn bật + viewport di động thì mới có hiệu lực */
    updateMobileFullscreenClass();
    if (toggleBtn) toggleBtn.classList.add('active');
    /* Chỉ dựng lại DOM khi có dữ liệu/cài đặt render thay đổi; Nếu không thì giữ lại DOM cũ để tránh giật lag bảng điều khiển khi mở một lượng lớn tin nhắn */
    if (panelContentDirty) {
        renderPanelContent();
    }
    /* Sau khi bảng điều khiển hiển thị, đo lại chiều cao thanh tiêu đề bản ghi: Ở trạng thái ẩn offsetHeight bằng 0, offset dính cần lấy chiều cao có thể thấy làm chuẩn */
    syncRecordHeaderVars(panelEl.querySelector('#rlog-list'));
    /* Khi có bản ghi mới đến trong thời gian bảng điều khiển đóng, quay lại mục mới nhất trên cùng của danh sách khi mở lại */
    if (pendingScrollToTop && !isPanelCollapsed) {
        pendingScrollToTop = false;
        const newRecordEl = getRecordElByIndex(0);
        if (newRecordEl) {
            scrollToRecordEl(newRecordEl);
            flashTopHint(newRecordEl);
        } else {
            const listEl = panelEl.querySelector('#rlog-list');
            if (listEl) listEl.scrollTop = 0;
            flashTopHint();
        }
    }

    /* Bảng điều khiển sẽ không kích hoạt sự kiện scroll sau khi hiển thị lại, chủ động chạy một lần bảo trì băng thông:
       Bổ sung các phần thân cần thiết dựa trên viewport hiện tại (Bao gồm cả việc cuộn lên trên cùng vừa thực hiện ở trên), hủy tải những phần thân ở xa */
    runBodyBandPass(panelEl.querySelector('#rlog-list'));

    /* Sau khi bảng điều khiển hiển thị, kiểm tra xem có cần chạy hướng dẫn không */
    if (window.__RLogTour && typeof window.__RLogTour.check === 'function') {
        setTimeout(() => window.__RLogTour.check(), 300);
    }
}

function hidePanel() {
    /* Thoát chế độ tìm kiếm khi đóng bảng điều khiển */
    resetSearchIfActive();
    /* Ẩn toast ghim/bỏ ghim khi đóng bảng điều khiển */
    hidePinToast();
    /* Ngầm dọn dẹp lớp phủ "Xem toàn văn" khi đóng bảng điều khiển (Nếu có) */
    closeReadFullOverlay();
    /* Thu gọn lớp phủ "Cài đặt tùy chọn" khi đóng bảng điều khiển, tránh việc đóng bảng điều khiển lúc lớp phủ đang mở, mở lại nó vẫn còn ở trạng thái mở */
    closePrefPanel();
    /* Hủy tải một lần tất cả các phần thân bên ngoài viewport nhân lúc layout vẫn còn hiệu lực trước khi đóng (Đo được khoảng 3ms):
       Khi mở lại chỉ cần trả chi phí dàn trang và vẽ cho phần hiển thị được, không còn phải trả chi phí cho tất cả các phần thân đã mở rộng.
       Bắt buộc phải đặt sau resetSearchIfActive() —— Highlight tìm kiếm sẽ được khôi phục thành văn bản thuần trước, để ở đây sẽ không hủy tải nhầm phần thân chứa <mark> */
    runBodyBandPass(panelEl ? panelEl.querySelector('#rlog-list') : null);
    isPanelCollapsed = false;
    if (panelEl) {
        /* Dọn dẹp các class animation đang phát (Nhấp nháy / Chuyển đổi theme), tránh việc phát lại khi mở lần sau */
        clearPanelAnimations();
        panelEl.classList.remove('rlog-window-collapsed');
        panelEl.style.display = 'none';
    }
    isPanelVisible = false;
    if (toggleBtn) toggleBtn.classList.remove('active');
    /* "Floating badge làm lối vào mặc định": Sau khi đóng bảng điều khiển, floating badge trở về badgePos (Nếu rỗng thì dùng vị trí mặc định ở góc trên bên phải), vẫn không lưu trữ dài hạn;
       Lối vào không mặc định giữ nguyên hiện trạng —— Bảng điều khiển đóng hoàn toàn, floating badge biến mất */
    if (preferences.badgeDefault && badgeEl) {
        if (!badgePos) badgePos = getDefaultBadgePos();
        else badgePos = clampBadgeToViewport(badgePos.left, badgePos.top);
        badgeEl.style.left = badgePos.left + 'px';
        badgeEl.style.top = badgePos.top + 'px';
        setBadgeActive(true);
    } else {
        setBadgeActive(false);
    }
}


/* ── Kéo thả và Thu phóng ────────────────────────── */

function makeResizable(el) {
    const grip = el.querySelector('.rlog-resize-grip');
    if (!grip) return;

    grip.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        panelResizing = true;
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        resizeStartW = el.offsetWidth;
        resizeStartH = el.offsetHeight;
        /* Neo cạnh Trái/Trên: Bảng điều khiển mặc định được căn giữa ngang (left:50% + translateX(-50%)), nếu chỉ thay đổi width thì nó sẽ di chuyển đối xứng
           sang hai bên; Sau khi đổi sang định vị left/top, thu phóng sẽ chỉ ảnh hưởng đến cạnh Phải/Dưới */
        const rect = el.getBoundingClientRect();
        el.style.transform = 'none';
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top}px`;
        el.style.transition = 'none';
    });

    grip.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        e.preventDefault();
        panelResizing = true;
        resizeStartX = e.touches[0].clientX;
        resizeStartY = e.touches[0].clientY;
        resizeStartW = el.offsetWidth;
        resizeStartH = el.offsetHeight;
        /* Tương tự như mousedown: Neo cạnh Trái/Trên, thu phóng chỉ ảnh hưởng đến cạnh Phải/Dưới */
        const rect = el.getBoundingClientRect();
        el.style.transform = 'none';
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top}px`;
        el.style.transition = 'none';
    });
}

(function initGlobalResize() {
    document.addEventListener('mousemove', (e) => {
        if (!panelResizing || !panelEl) return;
        const dx = e.clientX - resizeStartX;
        const dy = e.clientY - resizeStartY;
        const newW = Math.max(350, resizeStartW + dx);
        const newH = Math.max(200, resizeStartH + dy);
        panelEl.style.width = `${newW}px`;
        panelEl.style.height = `${newH}px`;
        panelEl.style.maxHeight = 'none';
    });

    document.addEventListener('mouseup', () => {
        if (panelResizing) {
            panelResizing = false;
            if (panelEl) panelEl.style.transition = '';
            /* Chiều rộng bảng điều khiển thay đổi có thể làm thay đổi chiều cao ngắt dòng của thanh tiêu đề bản ghi, đo lại offset dính */
            syncRecordHeaderVars(panelEl && panelEl.querySelector('#rlog-list'));
            /* Chiều rộng bảng điều khiển thay đổi cũng sẽ làm thay đổi chiều rộng ngắt dòng của phần thân → Cho bảo trì băng thông dựng lại chiều cao chỗ chiếm dựa trên hình học mới */
            scheduleBodyBandPass(panelEl && panelEl.querySelector('#rlog-list'));
        }
    });

    document.addEventListener('touchmove', (e) => {
        if (!panelResizing || !panelEl) return;
        e.preventDefault();
        const dx = e.touches[0].clientX - resizeStartX;
        const dy = e.touches[0].clientY - resizeStartY;
        const newW = Math.max(350, resizeStartW + dx);
        const newH = Math.max(200, resizeStartH + dy);
        panelEl.style.width = `${newW}px`;
        panelEl.style.height = `${newH}px`;
        panelEl.style.maxHeight = 'none';
    }, { passive: false });

    document.addEventListener('touchend', () => {
        if (panelResizing) {
            panelResizing = false;
            if (panelEl) panelEl.style.transition = '';
            syncRecordHeaderVars(panelEl && panelEl.querySelector('#rlog-list'));
            /* Thu phóng bằng kéo thả trên màn hình cảm ứng cũng tương tự: Nếu chiều rộng thay đổi, dựng lại chiều cao chỗ chiếm dựa trên hình học mới */
            scheduleBodyBandPass(panelEl && panelEl.querySelector('#rlog-list'));
        }
    });
})();

/* Tương tác kéo thả/nhấp của floating badge (Pointer Events thống nhất cho chuột và màn hình cảm ứng): Độ dời > BADGE_DRAG_THRESHOLD được xem là kéo,
   không khôi phục bảng điều khiển khi pointerup; Không đạt ngưỡng được xem là nhấp, khôi phục bảng điều khiển */
function initBadgeInteraction() {
    if (!badgeEl) return;
    /* Sau khi nhấp vào floating badge để khôi phục bảng điều khiển, floating badge sẽ bị ẩn đi, bảng điều khiển sẽ xuất hiện ở cùng một tọa độ, sự kiện click native do trình duyệt phát ra ngay sau đó sẽ hit-test trúng vào
       nút/tiêu đề của bảng điều khiển ở vị trí đó (Làm mở nhầm ngăn kéo hoặc vô tình thu gọn); Sử dụng lính canh dùng một lần (one-time guard) ở giai đoạn capture (capture phase) để chặn nó theo cờ đánh dấu */
    if (!document.rlogBadgeClickGuardInstalled) {
        document.rlogBadgeClickGuardInstalled = true;
        document.addEventListener('click', (e) => {
            if (badgeSuppressNextClick) {
                badgeSuppressNextClick = false;
                e.stopPropagation();
                e.preventDefault();
            }
        }, true);
    }
    let dragActive = false;
    let dragged = false;
    let startX = 0, startY = 0, origLeft = 0, origTop = 0;

    badgeEl.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        dragActive = true;
        dragged = false;
        startX = e.clientX;
        startY = e.clientY;
        origLeft = parseFloat(badgeEl.style.left) || 0;
        origTop = parseFloat(badgeEl.style.top) || 0;
        try { badgeEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        e.preventDefault();
    });

    badgeEl.addEventListener('pointermove', (e) => {
        if (!dragActive) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!dragged && Math.hypot(dx, dy) > BADGE_DRAG_THRESHOLD) {
            dragged = true;
        }
        if (dragged) {
            const pos = clampBadgeToViewport(origLeft + dx, origTop + dy);
            badgeEl.style.left = pos.left + 'px';
            badgeEl.style.top = pos.top + 'px';
            /* Cập nhật vị trí bản ghi trong phiên sau khi kéo, để dùng lại cho lần thu gọn tiếp theo */
            badgePos = pos;
        }
    });

    const onBadgeUp = (e) => {
        if (!dragActive) return;
        dragActive = false;
        e.stopPropagation();
        try { badgeEl.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        const wasDrag = dragged;
        if (wasDrag) {
            /* Kéo thả: Trình duyệt vẫn sẽ bù lại sự kiện click native sau pointerup, chặn nó để tránh bị nhầm thành "Nhấp để mở bảng điều khiển" */
            badgeSuppressNextClick = true;
            setTimeout(() => { badgeSuppressNextClick = false; }, 0);
        }
        if (e.type === 'pointercancel') {
            /* Con trỏ bị hủy (ví dụ: cảm ứng bị gián đoạn bởi hệ thống): Không sinh ra click, kết thúc trực tiếp */
            dragged = false;
            return;
        }
        /* Chưa kéo: Việc mở bảng điều khiển được giao cho giai đoạn click ngay sau đó xử lý —— Giữ floating badge hiển thị trong suốt quá trình phát click,
           Việc mở bảng điều khiển bị hoãn lại sau click, để cả hai không nhận nhầm cùng một cú click */
        dragged = false;
    };
    badgeEl.addEventListener('pointerup', onBadgeUp);
    badgeEl.addEventListener('pointercancel', onBadgeUp);
    /* Nhấp vào floating badge (Bao gồm cả click native kích hoạt trực tiếp trên host bởi bên thứ ba): Hoãn việc "Mở bảng điều khiển" cho đến khi cú click này
       được phát hoàn toàn, giữ floating badge hiển thị ở giai đoạn này; Không chủ động stopPropagation */
    badgeEl.addEventListener('click', (e) => {
        /* Dự phòng: Nếu cú click sau khi kéo thả không bị luồng trên chặn (Rất hiếm), chặn thêm một lần nữa ở đây */
        if (badgeSuppressNextClick) return;
        setTimeout(() => {
            if (preferences.badgeDefault) showPanel();
            else togglePanelWindow();
        }, 0);
    });
}

function makeDraggable(el) {
    const header = el.querySelector('.rlog-panel-header');
    if (!header) return;

    let startX, startY, origX, origY;
    let dragging = false;

    header.style.cursor = 'move';

    header.addEventListener('mousedown', (e) => {
        /* Bỏ qua các nút, tiêu đề H4 và các phần tử con của chúng, công tắc xem trước (Chúng có tương tác riêng, không tham gia vào kéo thả) */
        if (e.target.tagName === 'BUTTON' || e.target.closest('h4') || e.target.closest('#rlog-preview-btn')) return;
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = el.getBoundingClientRect();
        origX = rect.left;
        origY = rect.top;
        el.style.transform = 'none';
        el.style.left = `${origX}px`;
        el.style.top = `${origY}px`;
        el.style.transition = 'none';
        e.preventDefault();
    });

    header.addEventListener('touchstart', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('h4') || e.target.closest('#rlog-preview-btn')) return;
        dragging = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        const rect = el.getBoundingClientRect();
        origX = rect.left;
        origY = rect.top;
        el.style.transform = 'none';
        el.style.left = `${origX}px`;
        el.style.top = `${origY}px`;
        el.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        el.style.left = `${origX + dx}px`;
        el.style.top = `${origY + dy}px`;
        el.style.bottom = 'auto';
        el.style.right = 'auto';
    });

    document.addEventListener('touchmove', (e) => {
        if (!dragging) return;
        e.preventDefault();
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        el.style.left = `${origX + dx}px`;
        el.style.top = `${origY + dy}px`;
        el.style.bottom = 'auto';
        el.style.right = 'auto';
    }, { passive: false });

    document.addEventListener('mouseup', () => {
        if (dragging) {
            dragging = false;
            el.style.transition = '';
            /* Kéo thả không làm thay đổi chiều rộng, nhưng vẫn giữ nguyên việc đo lại để đề phòng thay đổi ngắt dòng ngẫu nhiên */
            syncRecordHeaderVars(panelEl && panelEl.querySelector('#rlog-list'));
        }
    });

    document.addEventListener('touchend', () => {
        if (dragging) {
            dragging = false;
            el.style.transition = '';
            syncRecordHeaderVars(panelEl && panelEl.querySelector('#rlog-list'));
        }
    });
}

/* ── Khởi tạo ──────────────────────────── */

function init() {
    if (!window.SillyTavern || typeof window.SillyTavern.getContext !== 'function') {
        console.debug(`[${PLUGIN_KEY}] Đang đợi SillyTavern khởi tạo...`);
        setTimeout(init, INIT_RETRY_ST_MS);
        return;
    }

    const ctx = window.SillyTavern.getContext();
    if (!ctx || !ctx.eventSource || !ctx.event_types) {
        console.debug(`[${PLUGIN_KEY}] Context của ST chưa sẵn sàng, sẽ thử lại sau...`);
        setTimeout(init, INIT_RETRY_CTX_MS);
        return;
    }

    eventSource = ctx.eventSource;
    event_types = ctx.event_types;

    /* Dựng UI thông qua sự kiện APP_READY hoặc qua setTimeout dự phòng, nhưng chỉ thực thi một lần */
    const tryBuildUI = () => {
        if (!uiBuilt) buildUI();
    };

    eventSource.once(event_types.APP_READY, () => {
        tryBuildUI();
    });

    /* Dự phòng: Nếu APP_READY đã kích hoạt trước đó (Plugin tải sau), trực tiếp dựng UI */
    setTimeout(() => {
        tryBuildUI();
    }, APP_READY_FALLBACK_MS);

    console.debug(`[${PLUGIN_KEY}] Khởi tạo hoàn tất - Lắng nghe ngầm việc gửi prompt`);
}

init();

/* ── API Đối ngoại ───────────────────────── */

window.__RLogApi = {
    records: () => records,
    /* Truy cập Bảng điều khiển/Shadow root (Dành cho tour.js sử dụng): Bảng điều khiển đã được treo vào shadow root, document không thể tìm thấy, chuyển sang lấy từ đây */
    getPanelEl: () => panelEl,
    /* Truy cập Floating badge (Hỗ trợ test): Có thể tra cứu light DOM host bằng document (Hình ảnh hiển thị nằm bên trong shadow root của nó),
       Lấy phần tử hình ảnh hiển thị bằng getBadgeVisualEl() */
    getBadgeEl: () => badgeEl,
    getBadgeVisualEl: () => badgeVisualEl,
    q: (sel) => (panelShadowRoot ? panelShadowRoot.querySelector(sel) : null),
    /* Các thứ liên quan đến tìm kiếm (Dành cho tour.js sử dụng) */
    openSearchForRecord: (recordIndex) => openSearchForRecord(recordIndex),
    performSearch: (recordIndex, keyword) => performSearch(recordIndex, keyword),
    closeSearch: () => closeSearch(),
    injectDemo: () => {
        const demoRecord = {
            characterName: 'Nhân vật không xác định',
            timestamp: new Date().toLocaleString('zh-CN', { hour12: false }),
            source: { type: 'plugin', label: 'Plugin', detail: 'Yêu cầu plugin/non-native' },
            modelName: 'Human-Brain-1.0-Pro',
            messages: [
                { 
                    role: 'assistant', 
                    content: '<thinking>\nGenerating example message...\n\nKhoan đã, rốt cuộc thì ví dụ nên viết cái gì?\nTại sao tôi lại phải làm chuyện này?\nThôi bỏ đi, cứ viết đại một câu vậy.\n</thinking>\n\nXin chào! Chào mừng bạn sử dụng plugin này.', 
                    tokens: 42, 
                    collapsed: false, 
                    tokenPrecise: true 
                }
            ],
            collapsed: false,
            isDemo: true /* Đánh dấu là bản ghi dùng để biểu diễn (demo) */
        };
        records.unshift(demoRecord);
        panelContentDirty = true;
        if (panelEl && isPanelVisible) renderPanelContent();
    },
    removeDemo: () => {
        records = records.filter(r => !r.isDemo);
        panelContentDirty = true;
        if (panelEl && isPanelVisible) renderPanelContent();
    },
    openDrawer: () => {
        if (!panelEl) return;
        closeFilterDrawer();
        const moreDrawer = panelEl.querySelector('#rlog-more-drawer');
        const moreBtn = panelEl.querySelector('#rlog-more-btn');
        if (moreDrawer) moreDrawer.classList.add('expanded');
        if (moreBtn) moreBtn.classList.add('active-drawer-btn');
    },
    closeDrawer: () => {
        if (!panelEl) return;
        const moreDrawer = panelEl.querySelector('#rlog-more-drawer');
        const moreBtn = panelEl.querySelector('#rlog-more-btn');
        if (moreDrawer) moreDrawer.classList.remove('expanded');
        if (moreBtn) moreBtn.classList.remove('active-drawer-btn');
    },
    /* Công tắc ngăn kéo "Bộ lọc" (Dành cho tour.js sử dụng); Khi mở sẽ tự động thu gọn ngăn kéo "Thêm" */
    setFilterDrawer: (open) => {
        if (!panelEl) return;
        const filterDrawer = panelEl.querySelector('#rlog-filter-drawer');
        const filterBtn = panelEl.querySelector('#rlog-filter-btn');
        if (!filterDrawer) return;
        if (open) {
            closeMoreDrawer();
            filterDrawer.classList.add('expanded');
            filterBtn.classList.add('active-drawer-btn');
        } else {
            filterDrawer.classList.remove('expanded');
            filterBtn.classList.remove('active-drawer-btn');
        }
    },
    /* Đọc/Ghi trạng thái bộ lọc (Dành cho tour.js tạm lưu/khôi phục; setFilterState sẽ kích hoạt dựng lại) */
    getFilterState: () => JSON.parse(JSON.stringify(filterState)),
    setFilterState: (state) => {
        filterState = state && typeof state === 'object' ? state : createDefaultFilterState();
        updateFilterChipUI();
        panelContentDirty = true;
        if (panelEl && isPanelVisible) renderPanelContent();
    },
    /* Đặt lại bộ lọc (Dành cho hướng dẫn/test hồi quy/gọi từ bên ngoài): Khi hướng dẫn bắt đầu sẽ dùng hàm này để đặt bộ lọc về trạng thái mở hoàn toàn nhằm hiển thị demo, do đó không ghi vào ổ đĩa;
       Người dùng đặt lại thủ công sẽ thông qua nút giao diện resetFilters() (Mặc định sẽ lưu trữ dài hạn) */
    resetFilters: () => resetFilters(false),
    toggleFilterChip: (group, value) => toggleFilterChip(group, value),
    getVisibleRecordsCount: () => getVisibleRecords().length,
    /* Thay thế toàn bộ danh sách bản ghi (Dành cho tour.js sử dụng để xóa sạch/khôi phục bản ghi trong thời gian hướng dẫn) */
    setRecords: (newRecords) => {
        records = Array.isArray(newRecords) ? newRecords : [];
        /* Chỉ cắt xén các bản ghi thông thường vượt quá giới hạn thông thường; Bản ghi được ghim vẫn giữ nguyên (Bản ghi tạm thời được khôi phục bởi hướng dẫn có thể làm tổng số vượt quá giới hạn) */
        pruneNormalRecords();
        panelContentDirty = true;
        if (panelEl && isPanelVisible) renderPanelContent();
    },
    /* Điều khiển trạng thái hướng dẫn (Dành cho tour.js sử dụng): Bản ghi mới sinh ra trong thời gian hướng dẫn sẽ được lưu tạm, không hiển thị */
    setTourActive: (active) => {
        tourActive = !!active;
    },
    /* Lấy ra và xóa sạch các bản ghi mới được lưu tạm trong thời gian hướng dẫn (Dành cho tour.js hợp nhất và khôi phục khi hướng dẫn kết thúc) */
    drainTourPendingRecords: () => {
        const pending = tourPendingRecords;
        tourPendingRecords = [];
        return pending;
    },
    expandDemo: () => {
        if (records.length > 0) {
            records[0].collapsed = false;
            records[0].messages.forEach(m => m.collapsed = false);
            panelContentDirty = true;
            if (panelEl && isPanelVisible) renderPanelContent();
        }
    },
    collapseDemo: () => {
        if (records.length > 0) {
            records[0].collapsed = true;
            records[0].messages.forEach(m => m.collapsed = true);
            panelContentDirty = true;
            if (panelEl && isPanelVisible) renderPanelContent();
        }
    },
    forcePreview: (state) => {
        forcePreviewState = state ? true : null;
        panelContentDirty = true;
        if (panelEl && isPanelVisible) renderPanelContent();
    },
    /* Cài đặt tùy chọn (Dành cho việc test/iterative development sau này) */
    openPreferences: () => openPrefPanel(),
    closePreferences: () => closePrefPanel(),
    getPreferences: () => JSON.parse(JSON.stringify(preferences)),
    setPreference: (key, value) => setPreference(key, value),
};

/* ── Các chức năng test tạm thời (Chỉ dành cho các hàm gỡ lỗi trong console) ────── */

/* number|null: Gỡ lỗi tạm thời: Ghi đè thời gian chờ phản hồi (Dành cho simulateReplyTimeout test mô phỏng, sẽ xóa sau này) */
let replyTimeoutOverrideMs = null;

/* Chèn tất cả dữ liệu test bằng một cú nhấp (Chức năng tạm thời, sẽ xóa sau này): 8 bản ghi ở các cấp độ Token + Mô phỏng phản hồi Thành công/Thất bại +
   Một lần kết thúc quá thời gian 2 giây; Lối vào thống nhất tại console __RLogApi.injectTokenTierTest() (Chức năng cũ của nút bình tam giác ở ngăn kéo "Thêm"
   đã được chuyển vào đây, hành vi giữ nguyên: Sau khi chèn cũng sẽ thu gọn ngăn kéo "Thêm") */
window.__RLogApi.injectTokenTierTest = function injectTokenTierTest() {
        /* Số token điển hình của mỗi cấp độ (Tương ứng với ranh giới của getTokenTier) */
        const tierValues = [
            { tokens: 2000,  label: '<4K' },
            { tokens: 6000,  label: '4K-8K' },
            { tokens: 12000, label: '8K-16K' },
            { tokens: 24000, label: '16K-32K' },
            { tokens: 48000, label: '32K-64K' },
            { tokens: 96000, label: '64K-128K' },
            { tokens: 160000, label: '128K-200K' },
            { tokens: 240000, label: '>200K' },
        ];
        const baseTs = new Date();
        const tsStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        const tierRecords = tierValues.map((t, i) => {
            const ts = new Date(baseTs.getTime() - i * 60000);
            return {
                characterName: 'Nhân vật mẫu',
                timestamp: tsStr(ts),
                source: { type: 'plugin', label: 'Plugin', detail: 'Yêu cầu plugin/non-native' },
                modelName: 'Test-Model',
                messages: [{
                    role: 'system',
                    content: `Test cấp độ ${t.label}`,
                    tokens: t.tokens,
                    collapsed: true,
                    tokenPrecise: true,
                }],
                collapsed: true,
                isDemo: true, /* Đánh dấu là bản ghi biểu diễn, có thể bị removeDemo xóa sạch */
            };
        });

        /* Bản ghi mô phỏng phản hồi Thành công / Thất bại (Dùng để xác minh cờ Succeed / Fail và việc hiển thị tin nhắn phản hồi con) */
        const successRecord = {
            characterName: 'Mẫu Thành công',
            timestamp: tsStr(new Date(baseTs.getTime() - 8 * 60000)),
            source: { type: 'native', label: 'Native', detail: 'Test mô phỏng' },
            modelName: 'Test-Model',
            messages: [{
                role: 'user',
                content: 'Yêu cầu mô phỏng: Đây là bản ghi có phản hồi thành công.',
                tokens: 96,
                collapsed: true,
                tokenPrecise: true,
            }],
            collapsed: true,
            isDemo: true,
            reply: {
                role: 'response',
                content: '<think>\nSuy nghĩ mô phỏng: Mô hình đã hoàn thành quá trình suy nghĩ bình thường.\n</think>\n\nPhản hồi mô phỏng: Đây là nội dung phản hồi thành công hoàn chỉnh và đủ dài, dùng để xác minh cờ Succeed và hiển thị phần thân.',
                tokens: 188,
                tokenPrecise: true,
                collapsed: true,
                status: 'succeed',
                failReason: '',
                time: tsStr(new Date(baseTs.getTime() - 8 * 60000 + 5000)),
            },
        };
        const failRecord = {
            characterName: 'Mẫu Thất bại',
            timestamp: tsStr(new Date(baseTs.getTime() - 9 * 60000)),
            source: { type: 'native', label: 'Native', detail: 'Test mô phỏng' },
            modelName: 'Test-Model',
            messages: [{
                role: 'user',
                content: 'Yêu cầu mô phỏng: Đây là bản ghi có phản hồi thất bại.',
                tokens: 88,
                collapsed: true,
                tokenPrecise: true,
            }],
            collapsed: true,
            isDemo: true,
            reply: {
                role: 'response',
                content: 'HTTP 500', /* Giống hệt với đường dẫn gắn (mount) thực tế: Khi Fail thì nội dung phản hồi ghi lý do thất bại (Trên di động có thể nhìn thấy mà không cần lơ lửng chuột (hover)) */
                tokens: 2,
                tokenPrecise: true,
                collapsed: true,
                status: 'fail',
                failReason: 'HTTP 500',
                time: tsStr(new Date(baseTs.getTime() - 9 * 60000 + 3000)),
            },
        };

        /* Thay thế các bản ghi biểu diễn hiện có, tránh bị xếp chồng */
        records = records.filter(r => !r.isDemo);
        records.unshift(...tierRecords);
        records.unshift(failRecord, successRecord);
        panelContentDirty = true;
        if (panelEl && isPanelVisible) renderPanelContent();

        /* Kích hoạt mô phỏng quá thời gian: Thực sự kết thúc sau 2 giây do timeout, addRecord sẽ ghim bản ghi quá thời gian lên đầu và thu gọn các bản ghi khác */
        if (window.__RLogApi && typeof window.__RLogApi.simulateReplyTimeout === 'function') {
            window.__RLogApi.simulateReplyTimeout({
                reasoning: 'Suy nghĩ mô phỏng: Mô hình đang nghĩ được nửa chừng thì bị kẹt...',
                content: 'Phần thân mô phỏng: Đây là một phần nội dung đã được xuất ra.',
            });
        }

        /* Thu gọn ngăn kéo "Thêm" sau khi chèn để hiển thị các bản ghi test (Hành vi giống như khi nhấp vào nút bình tam giác lúc trước) */
        closeMoreDrawer();
    };
    /* Chức năng gỡ lỗi tạm thời (Sẽ xóa sau này): Mô phỏng quá thời gian chờ phản hồi —— Rút ngắn 5 phút thành 2 giây, chạy luồng kết thúc timeout thật
       @param {object} [opts] { reasoning, content } @returns {number|null} captureId */

window.__RLogApi.simulateReplyTimeout = function simulateReplyTimeout(opts = {}) {
        if (!masterEnabled) {
            console.warn(`[${PLUGIN_KEY}] Công tắc tổng đã bị tắt, không thể mô phỏng timeout.`);
            return null;
        }
        const savedOverride = replyTimeoutOverrideMs;
        replyTimeoutOverrideMs = 2000; /* Tạm thời rút ngắn thành 2 giây */
        const captureId = ++captureSeq;
        const entry = {
            startTime: Date.now(),
            timer: null,
            expireTimer: null,
            status: null,
            content: opts.content || '',
            reasoning: opts.reasoning || '',
            failReason: '',
            time: '',
            reader: null,
            finished: false,
        };
        pendingReplies.set(captureId, entry);
        entry.timer = setTimeout(() => finalizeReply(captureId, 'timeout', 'timeout'), getReplyTimeoutMs());
        /* Chạy luồng addRecord thật để tạo bản ghi (Nội dung có chứa timestamp, tránh bị bỏ qua do lọc trùng lặp 500ms) */
        addRecord(
            'Mẫu Quá thời gian',
            [{ role: 'user', content: `【Mô phỏng Timeout】Phản hồi không bao giờ trả về · ${Date.now()}` }],
            { type: 'native', label: 'Native', detail: 'Test mô phỏng timeout' },
            'Test-model',
            null,
            captureId
        );
        replyTimeoutOverrideMs = savedOverride; /* Khôi phục mặc định (Đã có hiệu lực đối với bản ghi mô phỏng này) */
        console.debug(`[${PLUGIN_KEY}] Đã chèn bản ghi mô phỏng timeout, cờ Timeout sẽ xuất hiện sau 2 giây.`);
        return captureId;
    };

/* ── Mô phỏng Prompt (Lắp ráp thật, không gửi request) ─────── */

/* Cờ nguồn của bản ghi mô phỏng: Để phân biệt với bản ghi bắt (capture) thực tế (Bản ghi thực tế đến từ việc chặn ở tầng mạng) */
const SIMULATED_PROMPT_SOURCE = { type: 'plugin', label: 'Mô phỏng', detail: 'Bản ghi mô phỏng-Chưa được gửi thực tế' };

/* string: Khi chưa kết nối, tạm thời đổi trạng thái kết nối của ST thành giá trị này, để luồng lắp ráp thật có thể chạy được (Chạy xong thì hoàn nguyên về giá trị cũ);
   Lấy một đoạn văn bản giải thích không phải là no_connection, để khi thanh trạng thái hiện lên tức thời cũng có thể thấy đó là mô phỏng */
const SIMULATE_ONLINE_STATUS = 'Mô phỏng xem trước';

/* Lấy tên mô hình hoàn thành trò chuyện (chat completion) hiện tại của ST (Dùng để fallback cho tên mô hình của bản ghi mô phỏng; Nếu không lấy được thì trả về null) */
function getStChatCompletionModelName() {
    try {
        const ctx = window.SillyTavern && typeof window.SillyTavern.getContext === 'function'
            ? window.SillyTavern.getContext()
            : null;
        const name = ctx && typeof ctx.getChatCompletionModel === 'function' ? ctx.getChatCompletionModel() : null;
        return (typeof name === 'string' && name) ? name : null;
    } catch (e) {
        return null;
    }
}

/* Tạo một context bắt (capture context) cho quá trình mô phỏng (Fetch wrapper sẽ nhận yêu cầu mục tiêu rồi truyền suốt xuống pipeline của bản ghi):
   - armed: Đặt thành true khi thông báo "trước khi gửi" đến, wrapper dựa vào đây để nhận ra mục tiêu mô phỏng lần này, sau khi nhận xong sẽ đặt lại thành false;
   - canceled: Đặt thành true khi phán đoán timeout là thất bại, pipeline bản ghi sẽ kiểm tra cờ này trước khi lưu hồ sơ;
   - ready / settle: Tín hiệu hoàn thành khi bản ghi đã được lưu xong (Chỉ được dùng một lần; Nếu không lưu thành bản ghi thì sẽ trả về giá trị rỗng, quy trình mô phỏng sẽ xử lý như một lần thất bại) */
function createSimulateCaptureCtx() {
    let settle = null;
    const captureCtx = {
        armed: false,
        canceled: false,
        ready: null,
        settle(record) {
            const resolve = settle;
            settle = null;
            if (typeof resolve === 'function') {
                try { resolve(record || null); } catch (e) { /* ignore */ }
            }
        },
    };
    captureCtx.ready = new Promise((resolve) => { settle = resolve; });
    return captureCtx;
}

/* Lắp ráp prompt hiện tại và tạo ra một bản ghi mô phỏng (Tuyệt đối không gửi request tạo thật).
   Chạy luồng gửi thực sự của ST, để "Nén tin nhắn hệ thống / Bộ chặn lượt tạo (generation interceptor) / Hook trước khi gửi / Mục trình quản lý prompt / Worldbook / Regex"
   tất cả đều có hiệu lực như bình thường; Khi request được ghép xong và đi tới tầng fetch, pipeline ghi nhận của chính plugin này sẽ lưu hồ sơ, rồi sau đó chặn đứng việc gửi đi.
   Thông báo trước khi gửi (Hoàn thành trò chuyện CHAT_COMPLETION_SETTINGS_READY / Các API khác GENERATE_AFTER_DATA) vừa đến là lập tức
   vũ trang (arm) cho yêu cầu mục tiêu của lần mô phỏng này, đồng thời gọi stopGeneration() trong cùng thông báo đó: Vừa để ST coi lần này như "Người dùng chủ động hủy",
   vừa đóng vai trò là chốt chặn dự phòng (fallback) "Tuyệt đối không gửi mạng".
   `automatic_trigger: true` chỉ tắt hai nhánh "Chèn nội dung khung nhập liệu thành tin nhắn người dùng" của ST (Không bao gồm các logic khác),
   Do đó sẽ không tạo ra các tầng (floor) mới, không ghi vào ổ cứng; Bản nháp trong khung nhập liệu sẽ do chúng ta tự chuyển thành một object trong bộ nhớ và tạm thời đẩy vào chat,
   Để Regex / Worldbook / Interceptor đều có thể nhìn thấy nó. Tất cả những thay đổi tạm thời này sẽ được khôi phục từng mục một trong khối finally.
   Toàn bộ quá trình đều có một chốt chặn timeout (SIMULATE_TIMEOUT_MS): Tới giờ thì ngắt luồng lắp ráp, thay thế toast, và vứt bỏ kết quả của lần này. */
async function captureSimulatedPrompt() {
    if (simulatePromptRunning) return;
    if (!masterEnabled) {
        showPinToast('Chức năng ghi đã bị tắt, không thể tạo bản ghi mô phỏng');
        return;
    }
    const ctx = window.SillyTavern && typeof window.SillyTavern.getContext === 'function'
        ? window.SillyTavern.getContext()
        : null;
    if (!ctx || typeof ctx.generate !== 'function' || !ctx.eventSource || !ctx.eventTypes || typeof ctx.stopGeneration !== 'function') {
        showPinToast('Mô phỏng thất bại: Không tìm thấy giao diện tạo (generate interface) của ST');
        return;
    }
    /* Luồng thực tế của chat nhóm (Group chat) sẽ chạy "Tạo hàng loạt cho nhiều nhân vật", có khả năng sẽ thực sự gửi request, do đó không hỗ trợ */
    if (ctx.groupId) {
        showPinToast('Mô phỏng tạm thời không hỗ trợ chat nhóm');
        return;
    }
    if (ctx.streamingProcessor) {
        showPinToast('Mô phỏng thất bại: Hiện đang có một lượt tạo đang diễn ra');
        return;
    }

    /* Bắt đầu mô phỏng: Đặt cờ đang chạy, làm mờ nút, hiển thị toast tiến trình thường trực, và kích hoạt chốt chặn timeout cho toàn bộ quá trình */
    simulatePromptRunning = true;
    setSimulateButtonDisabled(true);
    showPinToast('Đang mô phỏng và chặn, vui lòng đợi (Sẽ không gửi thực tế)', { persist: true });

    /* Context bắt (capture context) cho lần mô phỏng này: Xuyên suốt toàn bộ luồng "Vũ trang → Nhận yêu cầu để lưu hồ sơ → Tín hiệu hoàn thành" */
    let timedOut = false;
    const captureCtx = createSimulateCaptureCtx();
    simulateCaptureCtx = captureCtx;

    const timeoutTimer = setTimeout(() => {
        timedOut = true;
        /* Timeout = Thất bại: Mọi kết quả đến sau đều bị vứt bỏ (Pipeline bản ghi sẽ kiểm tra cờ này trước khi lưu hồ sơ), và kết thúc quá trình chờ */
        captureCtx.canceled = true;
        /* Ngắt luồng lắp ráp của ST; Chặn cứng (hard block) ở fetch trong lúc này vẫn có hiệu lực */
        try { ctx.stopGeneration(); } catch (e) { /* ignore */ }
        showPinToast('Mô phỏng thất bại: Quá thời gian tạo bản ghi mô phỏng');
        captureCtx.settle(null);
    }, SIMULATE_TIMEOUT_MS);

    try {
        await runSimulatedPromptCapture(ctx, () => timedOut, captureCtx);
    } finally {
        clearTimeout(timeoutTimer);
        simulateCaptureCtx = null;
        captureCtx.armed = false;
        /* Sau khi dọn dẹp, cho dù pipeline bản ghi có bị chậm trễ và vẫn đang chạy, cũng sẽ không ghi bản ghi xuống nữa */
        captureCtx.canceled = true;
        simulatePromptRunning = false;
        simulatePromptActive = false;
        setSimulateButtonDisabled(false);
    }
}

/* Thân chính của quy trình mô phỏng (Được gọi sau khi đã qua kiểm tra tiền đề): Lắp ráp thật + Vũ trang yêu cầu mục tiêu + Lưu hồ sơ ở tầng fetch + Khôi phục.
   @param {object} ctx Context ST
   @param {() => boolean} isTimedOut Chốt chặn timeout đã được kích hoạt hay chưa; Nếu đã kích hoạt thì vứt bỏ kết quả lần này
   @param {object} captureCtx Context bắt cho lần mô phỏng này (Vũ trang / Hủy / Tín hiệu hoàn thành, xem createSimulateCaptureCtx) */
async function runSimulatedPromptCapture(ctx, isTimedOut, captureCtx) {
    /* —— Ảnh chụp nhanh (Snapshot - Sẽ khôi phục từng mục một trong khối finally) —— */
    const meta = ctx.chatMetadata;
    const hadTainted = !!(meta && Object.prototype.hasOwnProperty.call(meta, 'tainted'));
    const taintedValue = hadTainted ? meta.tainted : undefined;
    const textarea = document.querySelector('#send_textarea');
    const savedDraft = textarea ? String(textarea.value || '') : '';

    /* Bản nháp sẽ đi vào chat tạm thời dưới dạng object thuần trong bộ nhớ (Không render, không cấp phát mesid, không phát sự kiện, không ghi vào ổ cứng) */
    const injectedMessage = savedDraft.length > 0 ? {
        name: ctx.name1,
        is_user: true,
        is_system: false,
        send_date: Date.now(),
        mes: typeof ctx.substituteParams === 'function' ? ctx.substituteParams(savedDraft) : savedDraft,
        extra: {},
    } : null;

    const isChatCompletion = ctx.mainApi === 'openai';
    /* Thông báo trước khi gửi = "Yêu cầu đã lắp ráp xong, sắp sửa gửi packet đi": Vũ trang cho yêu cầu mục tiêu của lần mô phỏng này; Đồng thời hủy bỏ việc gửi thực sự
      (Fetch sẽ thất bại trực tiếp do signal đã bị hủy, đóng vai trò là chốt chặn "Tuyệt đối không gửi mạng") */
    const onBeforeSend = () => {
        /* Các thông báo đến muộn (Quá trình mô phỏng đã được dọn dẹp, ví dụ như được phát ra sau khi đã timeout) sẽ không được vũ trang, chỉ thực hiện việc hủy */
        if (simulatePromptActive) captureCtx.armed = true;
        ctx.stopGeneration();
    };
    const onChatSettingsReady = () => onBeforeSend();
    const onAfterData = () => onBeforeSend();

    /* Khi chưa kết nối, ST sẽ return trực tiếp trước khi lắp ráp; Ở đây tạm thời đổi trạng thái kết nối thành một giá trị không phải no_connection để cho qua,
       Chạy xong sẽ khôi phục lại giá trị cũ trong khối finally. Nếu không lấy được setOnlineStatus (Giao diện nội bộ) thì fallback về thông báo "Không thể mô phỏng". */
    const previousOnlineStatus = ctx.onlineStatus;
    let forcedOnlineModule = null;
    if (previousOnlineStatus === 'no_connection') {
        try {
            const scriptModule = await import('/script.js');
            if (scriptModule && typeof scriptModule.setOnlineStatus === 'function') {
                scriptModule.setOnlineStatus(SIMULATE_ONLINE_STATUS);
                forcedOnlineModule = scriptModule;
            }
        } catch (e) {
            forcedOnlineModule = null;
        }
        if (!forcedOnlineModule) {
            showPinToast('Mô phỏng thất bại: Hiện tại ST chưa kết nối API');
            return;
        }
    }

    /* Việc timeout có thể xảy ra trong quá trình dynamic import (nhập khẩu động) / chờ đợi: Không tiến vào quá trình lắp ráp nữa */
    if (isTimedOut()) return;

    simulatePromptActive = true;
    try {
        if (isChatCompletion) ctx.eventSource.on(ctx.eventTypes.CHAT_COMPLETION_SETTINGS_READY, onChatSettingsReady);
        else ctx.eventSource.on(ctx.eventTypes.GENERATE_AFTER_DATA, onAfterData);

        if (injectedMessage) ctx.chat.push(injectedMessage);

        /* automatic_trigger chỉ bỏ qua hai nhánh "Chèn tin nhắn người dùng"; ST sẽ tự đọc và xóa sạch khung nhập liệu, khối finally sẽ khôi phục lại */
        await ctx.generate('normal', { automatic_trigger: true });
    } catch (e) {
        /* Thất bại do việc hủy / chặn cứng là một lộ trình nằm trong dự tính, chỉ cần ghi log ra console là được, không cần báo lỗi cho người dùng */
        console.debug(`[${PLUGIN_KEY}] Luồng prompt mô phỏng kết thúc`, e);
    } finally {
        /* —— Bất kể thành công, bị hủy hay có ngoại lệ (exception), đều khôi phục từng mục một, tuyệt đối không bỏ sót —— */
        try { ctx.eventSource.removeListener(ctx.eventTypes.CHAT_COMPLETION_SETTINGS_READY, onChatSettingsReady); } catch (e) { /* ignore */ }
        try { ctx.eventSource.removeListener(ctx.eventTypes.GENERATE_AFTER_DATA, onAfterData); } catch (e) { /* ignore */ }

        const injectedIndex = injectedMessage ? ctx.chat.lastIndexOf(injectedMessage) : -1;
        if (injectedIndex !== -1) ctx.chat.splice(injectedIndex, 1);

        if (textarea) {
            textarea.value = savedDraft;
            try { textarea.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { /* ignore */ }
        }
        if (meta) {
            if (hadTainted) meta.tainted = taintedValue;
            else delete meta.tainted;
        }

        /* Khôi phục các nút Gửi / Trượt / Dừng và is_send_press đã bị thay đổi ở đầu luồng thực tế */
        try { if (typeof ctx.activateSendButtons === 'function') ctx.activateSendButtons(); } catch (e) { /* ignore */ }

        /* Khôi phục trạng thái kết nối đã bị thay đổi tạm thời (Chỉ khôi phục khi nó vẫn là giá trị mà chúng ta đã nhét vào, tránh việc ghi đè lên các cập nhật trạng thái thực sự của ST trong thời gian đó) */
        if (forcedOnlineModule) {
            try {
                const liveStatus = window.SillyTavern && typeof window.SillyTavern.getContext === 'function'
                    ? window.SillyTavern.getContext().onlineStatus
                    : null;
                if (liveStatus === SIMULATE_ONLINE_STATUS) forcedOnlineModule.setOnlineStatus(previousOnlineStatus);
            } catch (e) { /* ignore */ }
        }

        simulatePromptActive = false;
    }

    /* Sau khi timeout thì vứt bỏ kết quả lần này: Trạng thái đã được khôi phục ở trên, không chờ bản ghi nữa, không đổi toast nữa */
    if (isTimedOut()) return;

    /* Chờ tầng fetch ghi xong yêu cầu mô phỏng này: Pipeline bản ghi sẽ thực hiện (settle) ngay lúc lưu hồ sơ;
       Chốt chặn timeout đến giờ cũng sẽ kết thúc việc chờ (Lúc này sẽ được xử lý như một lần thất bại) */
    const record = await captureCtx.ready;
    if (isTimedOut()) return;
    if (!record) {
        showPinToast('Mô phỏng thất bại: Không lấy được dữ liệu prompt khả dụng');
        return;
    }
    showPinToast('Đã tạo bản ghi mô phỏng (Chưa được gửi thực tế, chỉ mang tính chất tham khảo)');
}

/* Nút Mô phỏng: Được thêm vào cuối ngăn kéo "Thêm", nhấp vào sẽ lắp ráp prompt hiện tại và tạo ra một bản ghi mô phỏng (Không gửi request) */
function buildSimulatePromptButton(panelEl) {
    const btn = document.createElement('button');
    btn.id = 'rlog-simulate-btn';
    btn.className = 'rlog-header-btn';
    btn.title = 'Tạo bản ghi mô phỏng (Không gửi thực tế)';
    btn.innerHTML = '<i class="fa-solid fa-vial"></i>';
    /* Thêm vào cuối ngăn kéo (Đảm bảo thứ tự: Công tắc tổng-Hướng dẫn-Tùy chọn-Xem trước-Xóa-Ngày/Đêm-Mô phỏng) */
    const drawer = panelEl.querySelector('#rlog-more-drawer');
    if (drawer) drawer.appendChild(btn);
    btn.addEventListener('click', (e) => {
        /* Chặn nổi bọt sự kiện: Sự kiện click sẽ xuyên qua shadow root, và bị listener "Nhấp ra ngoài để thu gọn ngăn kéo" trên document xem như một cú click bên ngoài bảng điều khiển */
        e.stopPropagation();
        captureSimulatedPrompt().catch((err) => {
            console.debug(`[${PLUGIN_KEY}] Mô phỏng prompt thất bại`, err);
            showPinToast('Mô phỏng thất bại: Xảy ra lỗi ngoài dự kiến');
        });
    });
}

/* Làm mờ nút trong khi đang mô phỏng (Về mặt hình ảnh thể hiện rằng không thể kích hoạt lặp lại; Việc chặn thực sự được đảm bảo bởi simulatePromptRunning) */
function setSimulateButtonDisabled(disabled) {
    if (!panelEl) return;
    const btn = panelEl.querySelector('#rlog-simulate-btn');
    if (btn) btn.disabled = !!disabled;
}