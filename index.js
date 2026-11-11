/* ============================================================
   Nhật ký yêu cầu gần đây (Recent Request Log) — Module logic chính (index.js)
   ============================================================ */

/* [Mục lục phân vùng] (Theo thứ tự từ trên xuống dưới của tệp)
   1. Tải động tour.js       Tải module hướng dẫn sử dụng khi khởi động tiện ích (luôn đặt ở đầu tiên)
   2. Tham số và hằng số có thể điều chỉnh Toàn bộ giá trị số/khóa lưu trữ/mẫu đường dẫn có thể điều chỉnh, đổi thông số chỉ sửa ở đây
   3. Biến trạng thái         Trạng thái bộ nhớ runtime như bảng điều khiển/dữ liệu/tìm kiếm/theo dõi phản hồi
   4. Hàm tiện ích           Các hàm thuần túy không có side-effect (escape/tên model/token/ánh xạ vai trò, v.v.)
   5. Xác thực cấu trúc body Request AI Phán đoán xem body request có phải là request sinh nội dung AI hay không
   6. Nhận diện nguồn request Theo dõi phiên sinh nội dung chính + Phán đoán bằng chứng phân tầng (Envelope → E1 → E2 → X2-X5 → E3 → Fallback → Tiện ích mặc định)
                             + Hiệu chỉnh thăng cấp có giới hạn sau khi Response vào sàn chat; theo dõi cổng native cũ được giữ lại làm fallback ưu tiên thấp nhất
   7. Đánh chặn request (fetch + XHR)  Bắt body request ở tầng mạng (parse/process/install + bọc XHR, bao gồm mở rộng iframe cùng nguồn)
   8. Theo dõi và phân tích Response   Bắt response/phân tích SSE/trích xuất lỗi/gắn kết trạng thái cuối
   9. Quản lý dữ liệu        Thêm bớt bản ghi, vân tay chống trùng lặp, giới hạn số lượng bản ghi
   10. Cài đặt bền vững      Đọc/ghi công tắc tổng/xem trước nội dung/chủ đề/số bản ghi tối đa/cài đặt ưu tiên
   11. Popup dùng chung      Cài đặt số bản ghi tối đa + Popup xác nhận dùng chung
   12. Tìm kiếm              Trạng thái tìm kiếm/khớp/tô sáng/điều hướng
   13. Bộ lọc                Trạng thái bộ lọc/khớp/ngăn kéo và nút phân đoạn/chỉ báo
   14. Render và dựng HTML   HTML bản ghi/tin nhắn, renderPanelContent, gắn kết sự kiện
   15. Thu gọn mở rộng và nhấp nháy về đỉnh Thu gọn/mở rộng, neo cuộn, xuống đáy về đỉnh, nhắc nhở nhấp nháy
   16. Xóa và sao chép bản ghi Xóa bản ghi đơn lẻ, sao chép toàn bộ/tin nhắn đơn lẻ, phản hồi sao chép
   17. Lớp phủ Xem toàn văn  Đóng mở lớp phủ, chuyển đổi định dạng, cuộn, phím Esc để đóng
   18. Thanh cuộn tùy chỉnh  Bộ quan sát dùng chung, tạo/cập nhật/kéo thanh cuộn, chỉ báo cuộn
   19. Dỡ bỏ chính văn và khôi phục theo nhu cầu Dọn dẹp chính văn ngoài viewport thành phần giữ chỗ cùng chiều cao, bù lại theo nhu cầu trước khi vào tầm nhìn (bao gồm duy trì dải cuộn)
   20. Điều khiển bảng điều khiển Lối vào menu, buildUI, đóng mở/thu gọn (↔ Nút nổi)/nút đổi chủ đề
   21. Kéo thả và thu phóng  Kéo bảng điều khiển/thu phóng góc dưới bên phải/kéo nút nổi
   22. Khởi tạo              Chờ ST sẵn sàng và dựng UI
   23. API đối ngoại         Giao diện window.__RLogApi dành cho tour.js
   24. Tính năng kiểm thử tạm thời Chỉ còn lại các hàm debug trong console (inject thử nghiệm / mô phỏng timeout, sẽ xóa sau)
   25. Mô phỏng prompt (không gửi request) Lắp ráp thực tế + Cắt ngang trước khi gửi, tạo một bản ghi mô phỏng (không gửi request mạng)
   ============================================================ */

/* ── Tải động tour.js ─────────────────── */

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

/* ── Tham số và hằng số có thể điều chỉnh ──────────────────────── */

const PLUGIN_KEY = 'RecentRequestLog';
const DEFAULT_MAX_RECORDS = 10;         /* Số bản ghi tối đa mặc định */
const MIN_MAX_RECORDS = 10;              /* Giá trị tối thiểu người dùng có thể đặt */
const MAX_MAX_RECORDS = 100;            /* Giá trị tối đa người dùng có thể đặt (tránh lạm dụng) */
const SETTINGS_SCHEMA_VERSION = 1;      /* Phiên bản cấu trúc cấu hình tiện ích này trong extensionSettings của ST */
const STORAGE_THEME_KEY = `${PLUGIN_KEY}_theme`;
const STORAGE_MASTER_KEY = `${PLUGIN_KEY}_masterEnabled`;
const STORAGE_MAX_RECORDS_KEY = `${PLUGIN_KEY}_maxRecords`;  /* Khóa lưu trữ bền vững số bản ghi tối đa */
const STORAGE_PREVIEW_KEY = `${PLUGIN_KEY}_contentPreview`;  /* Khóa lưu trữ bền vững công tắc xem trước nội dung */
const STORAGE_PREF_MOBILE_FULL = `${PLUGIN_KEY}_prefMobileFull`;      /* Tùy chọn: Toàn màn hình trên di động (tự động tràn màn hình khi mở bảng điều khiển trên di động) */
const STORAGE_PREF_CLICK_OUTSIDE = `${PLUGIN_KEY}_prefClickOutside`;  /* Tùy chọn: Nhấp ngoài bảng điều khiển tiện ích để đóng toàn bộ bảng điều khiển (có hiệu lực trên cả hai nền tảng) */
const STORAGE_PREF_FILTER_PERSIST = `${PLUGIN_KEY}_prefFilterPersist`; /* Tùy chọn: Giữ trạng thái bộ lọc (sau khi bật sẽ giữ lại trạng thái bộ lọc qua các trang) */
const STORAGE_PREF_MINIMAL = `${PLUGIN_KEY}_prefMinimal`;            /* Tùy chọn: Chế độ tối giản (loại bỏ hiệu ứng chuyển cảnh/hoạt ảnh/cuộn mượt/nhấp nháy/làm mờ lớp phủ) */
const STORAGE_PREF_BADGE_DEFAULT = `${PLUGIN_KEY}_prefBadgeDefault`; /* Tùy chọn: Lối vào mặc định là nút nổi (mặc định hiển thị nút nổi khi khởi động, vị trí mặc định ở góc trên bên phải) */
const STORAGE_PREF_FOLLOW_ST_THEME = `${PLUGIN_KEY}_prefFollowStTheme`; /* Tùy chọn: Chế độ ngày đêm theo theme ST (giao diện sáng tối của bảng điều khiển chính tự động theo theme ST) */
const STORAGE_FILTER_STATE_KEY = `${PLUGIN_KEY}_filterState`;        /* Đối tượng trạng thái bộ lọc được lưu trữ bền vững (chỉ đọc/ghi khi tùy chọn "Giữ trạng thái bộ lọc" được bật) */
const STORAGE_TOUR_VERSION_KEY = `${PLUGIN_KEY}_tour_version`;       /* Khóa lưu trữ trình duyệt bản cũ: Phiên bản hướng dẫn đã xem */
/* Khóa lưu trữ trình duyệt bản cũ: Chỉ dùng để di chuyển một lần và dọn dẹp dữ liệu của tiện ích, xóa chính xác từng khóa khi dọn dẹp */
const LEGACY_STORAGE_KEYS = [
    STORAGE_THEME_KEY,
    STORAGE_MASTER_KEY,
    STORAGE_MAX_RECORDS_KEY,
    STORAGE_PREVIEW_KEY,
    STORAGE_PREF_MOBILE_FULL,
    STORAGE_PREF_CLICK_OUTSIDE,
    STORAGE_PREF_FILTER_PERSIST,
    STORAGE_PREF_MINIMAL,
    STORAGE_PREF_BADGE_DEFAULT,
    STORAGE_PREF_FOLLOW_ST_THEME,
    STORAGE_FILTER_STATE_KEY,
    STORAGE_TOUR_VERSION_KEY,
];
const NATIVE_INTENT_WINDOW_MS = 5000;
const PANEL_HEADER_DRAG_THRESHOLD = 4; /* Ngưỡng phán đoán kéo thanh tiêu đề (px): Vượt quá ngưỡng mới di chuyển bảng điều khiển, tránh việc nhấp chuột thông thường đi kèm rung tay nhẹ */
const PANEL_HEADER_DRAG_BLOCK_SELECTOR = 'button, input, textarea, select, a, [role="button"], [contenteditable="true"]';
const BADGE_SIZE = 34;               /* Chiều dài cạnh nút nổi (px): Desktop 34×34 */
const BADGE_SIZE_MOBILE = 30;        /* Chiều dài cạnh nút nổi (px): Mobile (≤768px) 30×30; Desktop/Mobile do getBadgeSize() trả về theo breakpoint */
const BADGE_DRAG_THRESHOLD = 5;      /* Ngưỡng phán đoán kéo nút nổi (px): Độ dịch chuyển vượt quá giá trị này coi như kéo, ngược lại coi như nhấp để khôi phục bảng điều khiển */
const BADGE_DEFAULT_MARGIN_RIGHT = 16; /* Khoảng cách từ vị trí mặc định của nút nổi đến mép phải viewport (px): Vị trí mặc định khi khởi động nếu bật "Lối vào mặc định là nút nổi" */
const BADGE_DEFAULT_MARGIN_TOP = 12;  /* Khoảng cách từ vị trí mặc định của nút nổi xuống dưới mép dưới thanh cài đặt trên đỉnh ST (px) */
const LONG_PRESS_MS = 550;            /* Ngưỡng phán đoán nhấn giữ (ms): Nhấn giữ quá thời gian này và dịch chuyển không vượt quá dung sai được coi là nhấn giữ */
const LONG_PRESS_MOVE_TOLERANCE = 8;  /* Dung sai di chuyển khi nhấn giữ (px): Dịch chuyển vượt quá giá trị này sau khi nhấn sẽ hủy thao tác nhấn giữ */
const PIN_TOAST_DURATION_MS = 1800;   /* Thời gian tự động biến mất của thông báo ghim / bỏ ghim (ms) */
const ANDROID_LONG_COPY_WARN_BYTES = 512 * 1024; /* Mốc cảnh báo clipboard của Android: Giới hạn Binder khoảng 1 MiB, chừa lại một nửa biên độ an toàn */
const ANDROID_LONG_COPY_WARN_TEXT = 'Nội dung khá dài, nếu không thể sao chép bình thường, vui lòng sử dụng tính năng xuất file';
const RESPONSE_META_DASH = '—';       /* Ký tự giữ chỗ cho chỉ số không thể tính toán trên dòng tiêu đề Response */
const RESPONSE_META_DISCLAIMER = 'Dữ liệu hiệu năng chỉ mang tính tham khảo';
const RESPONSE_META_VALUE_MAX_CHARS = 60; /* Giới hạn hiển thị tối đa trên một dòng cho các giá trị gốc có thể quá dài trong chi tiết Response */
const TOKEN_COUNT_PLACEHOLDER = '- tokens'; /* Văn bản token hoàn chỉnh khi không có output thực tế, giữ cùng hậu tố với token dạng số */
const MESSAGE_READ_TOKEN_THRESHOLD = 800; /* Cung cấp lối vào đọc độc lập khi một tin nhắn đạt tới số lượng token này */
const MOBILE_LAYOUT_HEIGHT_DELAY_MS = 200; /* Cửa sổ gộp thay đổi chiều cao trên di động (ms): Tránh các khung hình chuyển cảnh liên tục của thanh địa chỉ/bàn phím */
const MOBILE_KEYBOARD_RELEASE_GRACE_MS = 650; /* Thời gian gia hạn giải phóng sau khi mất focus trên di động (ms): Chờ bàn phím ảo thu lại hoàn toàn */
const MOBILE_LAYOUT_HEIGHT_TOLERANCE = 12; /* Dung sai khôi phục chiều cao trên di động (px): Tránh dựng lại bố cục liên tục ở khung hình đuôi hoạt ảnh */

/* Chi tiết Response chỉ thu thập các trường gốc của thượng nguồn nằm trong whitelist; quy tắc quyết định thứ tự hiển thị theo thứ tự danh sách.
   Khi thêm trường mới, ưu tiên bổ sung quy tắc tại đây, không sửa đổi logic phân tích chính văn hoặc render chi tiết của từng endpoint. */
const RESPONSE_META_USAGE_ROOTS = [
    [],
    ['usage'],
    ['message', 'usage'],
    ['response', 'usage'],
    ['error', 'usage'],
    ['data', 'usage'],
];
const RESPONSE_META_TOKEN_FIELDS = [
    'prompt_tokens',
    'completion_tokens',
    'total_tokens',
    'input_tokens',
    'output_tokens',
];
const RESPONSE_META_TOKEN_DETAIL_FIELDS = [
    ['cached_tokens', ['prompt_tokens_details', 'cached_tokens']],
    ['cache_write_tokens', ['prompt_tokens_details', 'cache_write_tokens']],
    ['cached_tokens', ['input_tokens_details', 'cached_tokens']],
    ['reasoning_tokens', ['completion_tokens_details', 'reasoning_tokens']],
    ['reasoning_tokens', ['output_tokens_details', 'reasoning_tokens']],
    ['cached_tokens', ['cached_tokens']],
    ['cache_write_tokens', ['cache_write_tokens']],
    ['cache_read_input_tokens', ['cache_read_input_tokens']],
    ['cache_creation_input_tokens', ['cache_creation_input_tokens']],
    ['reasoning_tokens', ['reasoning_tokens']],
];
const RESPONSE_META_GEMINI_TOKEN_RULES = [
    ['promptTokenCount', ['usageMetadata', 'promptTokenCount']],
    ['candidatesTokenCount', ['usageMetadata', 'candidatesTokenCount']],
    ['totalTokenCount', ['usageMetadata', 'totalTokenCount']],
    ['cachedContentTokenCount', ['usageMetadata', 'cachedContentTokenCount']],
    ['thoughtsTokenCount', ['usageMetadata', 'thoughtsTokenCount']],
];
const RESPONSE_META_END_RULES = [
    ['finish_reason', ['finish_reason']],
    ['finish_reason', ['choices', 0, 'finish_reason']],
    ['finish_reason', ['choices', 0, 'message', 'finish_reason']],
    ['finishReason', ['finishReason']],
    ['finishReason', ['candidates', 0, 'finishReason']],
    ['stop_reason', ['stop_reason']],
    ['stop_reason', ['message', 'stop_reason']],
    ['stop_reason', ['delta', 'stop_reason']],
    ['stop_sequence', ['stop_sequence']],
    ['stop_sequence', ['message', 'stop_sequence']],
    ['stop_sequence', ['delta', 'stop_sequence']],
    ['incomplete_details', ['incomplete_details']],
    ['incomplete_details', ['response', 'incomplete_details']],
    ['incomplete_details', ['error', 'incomplete_details']],
    ['status', ['status']],
    ['status', ['response', 'status']],
    ['status', ['error', 'status']],
    ['blockReason', ['blockReason']],
    ['blockReason', ['promptFeedback', 'blockReason']],
];
const RESPONSE_META_FIELD_RULES = [
    ...RESPONSE_META_TOKEN_FIELDS.flatMap((name) => RESPONSE_META_USAGE_ROOTS.map((root) => ({
        key: name,
        path: [...root, name],
    }))),
    ...RESPONSE_META_TOKEN_DETAIL_FIELDS.flatMap(([name, suffix]) => RESPONSE_META_USAGE_ROOTS.map((root) => ({
        key: name,
        path: [...root, ...suffix],
    }))),
    ...RESPONSE_META_GEMINI_TOKEN_RULES.map(([name, path]) => ({
        key: name,
        path,
    })),
    ...RESPONSE_META_END_RULES.map(([name, path]) => ({
        key: name,
        path,
    })),
    ...RESPONSE_META_USAGE_ROOTS.map((root) => ({
        key: 'cost',
        path: [...root, 'cost'],
    })),
].map((rule, order) => ({ ...rule, order }));
const SIMULATE_TIMEOUT_MS = 30000;    /* Thời gian timeout dự phòng toàn trình khi tạo bản ghi mô phỏng (ms): Đến hạn sẽ dừng chuỗi lắp ráp, hủy kết quả và báo lỗi */
const ST_THEME_DARK_LUMINANCE = 0.5;  /* Độ sáng cảm nhận tương đối của màu nền theme ST thấp hơn giá trị này được coi là theme tối (nút nổi chuyển sang dùng bộ màu sáng) */
const QUICK_REPLY_ENTRY_SET_NAME = 'RecentRequestLog'; /* Tên tập hợp QR gốc chuyên dụng của tiện ích (định danh ổn định, không đổi theo ngôn ngữ giao diện) */
const QUICK_REPLY_ENTRY_LABEL = 'Nhật ký yêu cầu gần đây'; /* Văn bản và tiêu đề nút QR gốc */
const QUICK_REPLY_ENTRY_COMMAND = 'rlog-toggle';      /* Lệnh slash thường trú của tiện ích: Dùng khi nhấp QR gốc và làm dự phòng khi lối vào bị ẩn */
const ENTRY_PREFERENCE_KEYS = ['badgeDefault', 'quickReplyEntry', 'hideExtensionEntry']; /* Khóa tùy chọn liên quan đến các lối vào hiển thị */

/* ── Nhận diện nguồn request (Phán đoán bằng chứng phân tầng, RQ-32) các hằng số liên quan ── */
const SOURCE_PLUGIN_DEFAULT_DETAIL = 'Yêu cầu từ tiện ích mở rộng/Không phải Native'; /* Mô tả hover khi phán đoán là "Tiện ích" (kế thừa văn bản sẵn có, miền giá trị không đổi) */
const ST_CHAT_COMPLETION_ENDPOINT = '/api/backends/chat-completions/generate'; /* Đường dẫn endpoint chat completion của ST dùng để đối chiếu trong X3 "Địa chỉ request" */
const PASS_MAX_AGE_MS = 5 * 60 * 1000;        /* Thời gian sống tối đa của phiên sinh nội dung chính (ms): Dự phòng dọn dẹp các phiên treo do "mất sự kiện kết thúc" */
const SOURCE_CORRECTION_WINDOW_MS = 5000;     /* Cửa sổ kích hoạt hiệu chỉnh (ms): Không hiệu chỉnh nếu khoảng cách giữa lúc Response hoàn tất và sự kiện tin nhắn ST vượt quá giá trị này */
const SOURCE_CORRECTION_RETRY_MS = 400;       /* Thử lại hiệu chỉnh với độ trễ ngắn (ms): Bổ sung một lần khi sự kiện tin nhắn đến trước mà Response chưa đọc xong */
const SOURCE_CORRECTION_PENDING_TTL_MS = 15000; /* Thời gian giữ bản ghi chờ hiệu chỉnh (ms): Vượt quá thời gian này sẽ không cố gắng hiệu chỉnh nữa */
const SOURCE_CORRECTION_PENDING_GRACE_MS = 1000; /* Thời gian gia hạn bản ghi chờ hiệu chỉnh (ms): Bản ghi vừa đăng ký chưa vào danh sách sẽ không bị dọn theo quan hệ thành viên */
const SOURCE_CORRECTION_MIN_OVERLAP = 24;     /* Độ dài chồng lấn tối thiểu để khớp hiệu chỉnh (ký tự): Ngắn hơn độ dài này chỉ chấp nhận trùng khớp hoàn toàn */

/* ── Che giấu các trường nhạy cảm trong body request gốc ── */
const SENSITIVE_BODY_FIELDS = ['proxy_password'];
const SENSITIVE_BODY_MASK = '***';

/* Vỏ FontAwesome cố định bên trong shadow root: Chỉ gồm 39 icon nét đặc mà tiện ích thực tế sử dụng (content lấy từ fontawesome.min.css bản 6.5.2 của ST, không phải suy đoán)
   Khi thêm icon mới chỉ cần bổ sung một dòng "Tên icon: '\\fXXX'" tại đây */
const FA_SOLID_CONTENT = {
    'arrow-down': '\\f063',
    'arrow-up': '\\f062',
    'arrow-up-right-from-square': '\\f08e',
    'check': '\\f00c',
    'chevron-down': '\\f078',
    'chevron-right': '\\f054',
    'chevron-up': '\\f077',
    'circle-stop': '\\f28d',
    'comment-dots': '\\f4ad',
    'copy': '\\f0c5',
    'ellipsis': '\\f141',
    'eye': '\\f06e',
    'eye-slash': '\\f070',
    'file-export': '\\f56e',
    'clipboard-list': '\\f46d',
    'filter': '\\f0b0',
    'flask': '\\f0c3',
    'gear': '\\f013',
    'heart': '\\f004',
    'heart-circle-check': '\\e4fd',
    'list': '\\f03a',
    'magnifying-glass': '\\f002',
    'maximize': '\\f31e',
    'minimize': '\\f78c',
    'minus': '\\f068',
    'moon': '\\f186',
    'paper-plane': '\\f1d8',
    'power-off': '\\f011',
    'puzzle-piece': '\\f12e',
    'question': '\\3f',
    'rotate-left': '\\f2ea',
    'sun': '\\f185',
    'trash-can': '\\f2ed',
    'user': '\\f007',
    'window-maximize': '\\f2d0',
    'window-restore': '\\f2d2',
    'xmark': '\\f00d',
    'caret-down': '\\f0d7',
    'clock-rotate-left': '\\f1da',
};

/* number: Giới hạn số lượng bản ghi tối đa đang có hiệu lực, tải từ cài đặt tiện ích ST hoặc dùng giá trị mặc định */
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

/* RegExp: Sàng lọc trước "Dạng thức URL" của request dạng Envelope —— http(s):// + Từ khóa đường dẫn sinh nội dung (không phân biệt hoa thường).
   Từ khóa dùng lại AI_GENERATION_PATH_PATTERNS; lớp ký tự loại bỏ dấu ngoặc kép/khoảng trắng/dấu gạch chéo ngược để đảm bảo khớp được một
   chuỗi địa chỉ hoàn chỉnh chứ không phải đoạn văn bản xuyên trường. */
const ENVELOPE_URL_SHAPE_RE = new RegExp(
    'https?://[^\\s"\'`\\\\]*(?:'
        + AI_GENERATION_PATH_PATTERNS.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
        + ')',
    'i'
);

/* object: Nguồn bắt buộc sử dụng sau khi trúng gói giải nén Envelope (phán đoán này theo thiết kế là cuối cùng: Không tham gia phán đoán bằng chứng phân tầng,
   cũng không tham gia "Hiệu chỉnh sau khi Response vào sàn chat") */
const ENVELOPE_PROXY_SOURCE = { type: 'plugin', label: 'Tiện ích', detail: 'Yêu cầu Proxy qua tiện ích', rule: 'envelope' };

/* RegExp: Endpoint sinh nội dung thực tế nội bộ của ST (/api/backends/<api>/generate). Dùng để chặn cứng request trong thời gian xem trước mô phỏng,
   đảm bảo "chỉ lắp ráp, tuyệt đối không gửi qua mạng" */
const GENERATE_ENDPOINT_RE = /\/api\/backends\/[^/?#]+\/generate\b/i;

/* number: Giá trị mặc định, phạm vi hợp lệ và giới hạn cứng của hàng đợi chờ phản hồi cho timeout theo dõi Response */
const DEFAULT_REPLY_TIMEOUT_SEC = 300;
const MIN_REPLY_TIMEOUT_SEC = 0;
const MAX_REPLY_TIMEOUT_SEC = 3600;
const MAX_PENDING_REPLIES_HARD_LIMIT = 100;
const PREF_NUMBER_NOTICE_INTERVAL_MS = 1000;

/* number: Thời gian giữ tối đa sau khi phản hồi đạt trạng thái cuối mà bản ghi chưa được tạo xong (chờ addRecord gắn kết) */
const PENDING_REPLY_KEEP_MS = 60 * 1000;

/* number: Độ trễ debounce khi nhập tìm kiếm (ms), thực hiện tìm kiếm sau một khoảng thời gian ngừng nhập */
const SEARCH_DEBOUNCE_MS = 120;

/* Giới hạn phân tích lý do lỗi không phải 2xx (byte): Response gốc vẫn được lưu toàn vẹn, chỉ ngừng tích lũy văn bản trích xuất lỗi */
const MAX_ERROR_BODY_BYTES = 8192;

/* Hẹn giờ dự phòng nhấp nháy khi xuống đáy (ms): Chờ dự phòng khi sự kiện scrollend không được kích hoạt sau khi cuộn mượt */
const SCROLLEND_FALLBACK_MS = 2000;
/* Độ trễ tạo lười thanh cuộn (ms): Trì hoãn việc tạo thanh tiến trình sau khi vùng nội dung xuất hiện, tránh đồng bộ reflow */
const SCROLLBAR_CREATE_DELAY_MS = 50;
/* number: Số lượng vùng nội dung tối đa mà hàng đợi tạo thanh tiến trình xử lý trong mỗi frame. Khi cuộn, sẽ có nhiều tin nhắn dài cùng vào viewport trong một frame,
   việc tạo toàn bộ cùng một lúc (mỗi cái gồm 4 DOM nhỏ và một vài listener) sẽ gây tụt FPS; chia đều qua các frame liên tiếp để hoàn thành, điều kiện tạo và hiệu quả giữ nguyên */
const SCROLLBAR_CREATE_PER_FRAME = 4;
/* number: Lượng co vào trên dưới của rãnh cuộn so với hitbox (px), dùng chung cho chiều cao rãnh cuộn và quy đổi tọa độ kéo;
   phải đồng bộ với top/bottom của .rlog-scroll-track trong CSS */
const SCROLLBAR_TRACK_PADDING = 4;
/* number: Dải băng thông giữ lại của "Dỡ bỏ chính văn và khôi phục theo nhu cầu" (màn hình): Vùng hiển thị danh sách giữ lại số màn hình này ở cả trên và dưới mà không dỡ bỏ chính văn.
   Chính văn bị dỡ bỏ sẽ được thay thế bằng phần giữ chỗ cùng chiều cao trên cùng một phần tử, khi đóng/mở lại bảng điều khiển sẽ không phải trả phí bố cục và vẽ cho phần chính văn ngoài viewport. */
const BODY_KEEP_SCREENS = 1;
/* Độ trễ sắp xếp lại nút menu (ms): Đảm bảo xếp ở cuối cùng sau tất cả các tiện ích được khởi tạo đồng bộ */
const MENU_REORDER_DELAY_MS = 100;
/* Độ trễ thử lại khởi tạo (ms): Khoảng thời gian thử lại khi đối tượng toàn cục của ST chưa sẵn sàng */
const INIT_RETRY_ST_MS = 200;
/* Độ trễ thử lại khởi tạo (ms): Khoảng thời gian thử lại khi ngữ cảnh ST chưa sẵn sàng */
const INIT_RETRY_CTX_MS = 300;
/* Chờ dự phòng APP_READY (ms): Sự kiện có thể đã kích hoạt trước đó, kích hoạt dự phòng việc dựng UI */
const APP_READY_FALLBACK_MS = 500;
/* Biên trên phân cấp Token (giảm dần, đơn vị token): getTokenTier trả về cấp bậc khoảng 1-7 theo >= mốc biên */
const TOKEN_TIER_BOUNDARIES = [200000, 128000, 64000, 32000, 16000, 8000, 4000];
/* number: Ngưỡng nhắc nhở Token nhấp nháy: Khi đạt ngưỡng sẽ ghi đè màu khoảng và nhấp nháy; 0 nghĩa là tắt hoàn toàn lớp cảnh báo tùy chỉnh */
const DEFAULT_TOKEN_WARNING_THRESHOLD = 200000;
const MIN_TOKEN_WARNING_THRESHOLD = 0;
const MAX_TOKEN_WARNING_THRESHOLD = 1000000;

/* ── Biến trạng thái ─────────────────────────── */

/* object|null: ST eventSource */
let eventSource = null;
/* object|null: ST event_types */
let event_types = null;

/* boolean: Xem trước mô phỏng đang diễn ra —— các request sinh nội dung trong cửa sổ này đều không gửi qua mạng (request mục tiêu được lập hồ sơ trước rồi mới chặn, xem simulateCaptureCtx);
   chỉ đặt true tạm thời trong captureSimulatedPrompt, finally chắc chắn được reset */
let simulatePromptActive = false;

/* boolean: Quy trình tạo bản ghi mô phỏng đang chạy (gồm lắp ráp, phục hồi, thống kê cục bộ) —— trong thời gian này nút chuyển sang chế độ dừng thủ công */
let simulatePromptRunning = false;

/* object|null: Ngữ cảnh bắt giữ của lần mô phỏng này (cấu trúc xem createSimulateCaptureCtx), chỉ tồn tại trong một lần mô phỏng.
   Đi cùng request mục tiêu suốt tuyến vào pipeline bản ghi, dùng cho giai đoạn lập hồ sơ bất đồng bộ xác định nguồn gốc; không dựa vào việc đọc lại cờ toàn cục (khi đó có thể đã reset) */
let simulateCaptureCtx = null;

/* object|null: Trạng thái vận hành mô phỏng hiện tại (lý do hủy / timer timeout / phương thức hủy).
   Callback đến muộn chỉ giữ đối tượng chạy và captureCtx của riêng nó, không thể ghi đè trạng thái toàn cục của lần mô phỏng tiếp theo */
let simulateActiveRun = null;

/* object|null: Ý định của nút mô phỏng khi con trỏ nhấn xuống lần này (start / stop), để sự kiện click liền sau tiêu thụ một lần */
let simulateButtonIntent = null;
/* number: Số thứ tự ý định của con trỏ, ngăn callback dọn dẹp của một cử chỉ xóa nhầm các cử chỉ tiếp theo */
let simulateButtonIntentSeq = 0;
/* number|null: Timer dọn dẹp trễ sau pointerup chờ click xử lý */
let simulateButtonIntentTimer = null;
/* boolean: Listener nhấp bên ngoài nút mô phỏng và ẩn trang có phải chỉ tồn tại cùng ý định con trỏ hiện tại hay không */
let simulateButtonIntentDismissalBound = false;

/* Array: Danh sách bản ghi thu thập được */
let records = [];

/* boolean: Hướng dẫn sử dụng có đang chạy hay không (khi đang chạy, bản ghi mới chỉ tạm lưu chứ không hiển thị, tránh làm gián đoạn việc định vị DOM hướng dẫn) */
let tourActive = false;

/* Array: Bản ghi mới tạm lưu trong thời gian hướng dẫn (khi kết thúc hướng dẫn sẽ được endTour hợp nhất và khôi phục, đảm bảo không thất lạc) */
let tourPendingRecords = [];

/* HTMLElement|null: Phần tử DOM bảng điều khiển */
let panelEl = null;

/* ShadowRoot|null: Shadow Root của bảng điều khiển tiện ích (bảng điều khiển và style đặt bên trong, cách ly CSS theme bên thứ ba) */
let panelShadowRoot = null;

/* HTMLElement|null: Phần tử host shadow (gắn vào body, chứa shadow root) */
let shadowHostEl = null;

/* HTMLElement|null: Host light DOM của nút nổi (lối vào tiện ích dạng nhỏ sau khi thu gọn bảng điều khiển).
   Host độc lập gắn vào document.body, để các tiện ích thu gom bên thứ ba nhận diện/thu gom;
   Giao diện hiển thị nằm trong shadow root của chính nó (.rlog-badge-visual). */
let badgeEl = null;

/* HTMLElement|null: Phần tử hiển thị của nút nổi (gắn vào bên trong shadow root của chính badgeEl,
   document không tìm thấy, chỉ dành cho các trợ lý kiểm thử như __RLogApi.getBadgeVisualEl() sử dụng) */
let badgeVisualEl = null;

/* string|null: Cache kết quả tuần tự hóa các quy tắc trong style.css (hai shadow root của bảng điều khiển và nút nổi mỗi bên cần một node <style>,
   văn bản quy tắc chỉ tuần tự hóa một lần) */
let selfCssTextCache = null;

/* {left,top}|null: Vị trí của nút nổi trong session (tọa độ góc trên bên trái của nút nổi).
   Thu nhỏ lần đầu sử dụng vị trí mặc định ở góc trên bên phải, cập nhật sau khi kéo, thu gọn lần nữa sẽ tái sử dụng; làm mới trang sẽ xóa. */
let badgePos = null;

/* boolean: Có chặn click gốc mà trình duyệt phân phối sau khi "nhấp nút nổi để khôi phục bảng điều khiển" hay không (cờ dùng một lần).
   Khi nút nổi ẩn đi và bảng điều khiển xuất hiện ở cùng tọa độ, click này sẽ hit-test trúng nút trên thanh tiêu đề của bảng điều khiển, có thể mở nhầm ngăn kéo. */
let badgeSuppressNextClick = false;

/* boolean: ST hiện tại có phải theme tối hay không (phối màu nút nổi lấy ngược lại: ST tối → Nút nổi sáng), do syncBadgeTheme() duy trì */
let stThemeIsDark = false;

/* MutationObserver|null: Lắng nghe thuộc tính style của <html> trong thời gian nút nổi hiển thị để đồng bộ phối màu đảo ngược */
let badgeThemeObserver = null;

/* HTMLElement|null: Nút trong menu mở rộng */
let toggleBtn = null;

/* boolean: Bảng điều khiển có đang mở rộng hiển thị hay không; cả trạng thái nút nổi và trạng thái đóng hoàn toàn đều là false */
let isPanelExpanded = false;

/* number|null: Timer đăng ký trễ listener đóng khi nhấp ra ngoài; hủy bỏ khi bảng điều khiển đóng hoặc thu nhỏ thành nút nổi */
let panelOutsideCloseArmTimer = null;

/* @type {boolean} Nội dung bảng điều khiển có cần dựng lại hay không (đặt thành true khi cài đặt dữ liệu/render thay đổi, xóa về false sau khi render xong).
   DOM được giữ lại khi bảng điều khiển ẩn, tránh việc mở mỗi lần đều dựng lại toàn bộ gây giật lag. */
let panelContentDirty = true;

/* boolean: Có phải chế độ sáng hay không (mặc định là sáng; giá trị đã lưu sẽ ghi đè khi khởi tạo) */
let isLightTheme = true;

/* boolean: Trong thời gian bảng điều khiển ẩn có bản ghi mới đến hay không, khi mở rộng cần cuộn về đầu danh sách */
let pendingScrollToTop = false;

/* boolean: Trạng thái toàn màn hình mặc định được đóng băng khi khởi tạo trang; sau đó thay đổi viewport hoặc sửa tùy chọn đều không tính toán lại */
let initialFullscreenActive = false;

/* boolean|null: Ghi đè toàn màn hình trong trang hiện tại; null nghĩa là chưa chuyển đổi thủ công, thao tác thanh tiêu đề và chuyển tùy chọn mobile đều sẽ cập nhật nó */
let manualFullscreenOverride = null;

/* boolean: Công tắc tổng của tiện ích có bật hay không (lưu bền vững vào cài đặt mở rộng ST, cài đặt lần đầu mặc định bật) */
let masterEnabled = true;

/* HTMLElement|null: Phần tử toast thông báo nhẹ ghim/bỏ ghim (căn giữa trên đỉnh bảng điều khiển) */
let pinToastEl = null;

/* HTMLElement|null: Popover giải thích chỉ số Response (bên trong bảng điều khiển, dựa vào z-index trên đỉnh để tránh bị danh sách cắt bớt) */
let responseMetaTipEl = null;

/* HTMLElement|null: Điểm neo ⓘ của giải thích chỉ số Response hiện tại */
let responseMetaTipAnchorEl = null;

/* timeout|null: Timer tự động biến mất của thông báo ghim/bỏ ghim */
let pinToastTimer = null;

/* boolean: Đặt thành true sau khi kích hoạt nhấn giữ ghim, dùng để triệt tiêu sự kiện click thanh tiêu đề bản ghi liền sau đó (tránh thu gọn/mở rộng nhầm) */
let suppressRecordHeaderClick = false;

/* boolean: Trong thời gian sắp xếp lại do nhấn giữ trên di động đã gắn cờ triệt tiêu hover hay chưa (tránh lắng nghe lặp lại/tích tụ) */
let hoverSuppressBound = false;

/* Liên quan đến kéo thả/thu phóng bảng điều khiển */
let panelResizing = false;
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartW = 0;
let resizeStartH = 0;
/* boolean: Listener kéo/thu phóng toàn trang chỉ gắn khi bảng điều khiển mở rộng đã được gắn hay chưa */
let panelPointerListenersBound = false;
/* {bind:Function,unbind:Function}|null: Quy trình gắn và gỡ listener toàn cục khi kéo thanh tiêu đề */
let panelHeaderDragBinding = null;
/* {bind:Function,unbind:Function}|null: Quy trình gắn và gỡ listener toàn cục khi thu phóng */
let panelResizeBinding = null;

/* Function|null: Tham chiếu đến window.fetch gốc */
let originalFetch = null;

/* Function|null: Hàm bọc fetch đang được cài đặt */
let currentHook = null;

/* WeakMap<Window, Function>: Cửa sổ đã cài đặt bọc fetch → Hàm bọc (Cửa sổ chính + iframe cùng nguồn)
   Mục đích: ① Tránh bọc lặp lại cùng một cửa sổ làm hỏng chuỗi bọc fetch ban đầu;
            ② Sau khi hàm bọc bị script bên trong iframe thay thế, dựa vào đây để phán đoán xem có cần bọc lại hay không. */
const hookedFetchHooks = new WeakMap();

/* WeakSet<HTMLIFrameElement>: Các phần tử iframe đã gắn listener "cài đặt lại hàm bọc sau khi reload" (chống gắn lặp lại) */
const iframeLoadListenersAttached = new WeakSet();

/* WeakMap<XMLHttpRequest, {method, url, async}>: Tham số open của instance XHR (đọc khi send; open lặp lại sẽ ghi đè) */
const xhrOpenMeta = new WeakMap();

/* WeakMap<Window, {open, send}>: Cửa sổ đã cài đặt bọc XHR (Cửa sổ chính + iframe cùng nguồn) → Phương thức prototype khi cài đặt.
   Mục đích giống với hookedFetchHooks: Chống bọc lặp lại cùng một realm; bọc lại sau khi iframe reload hoặc script bên trong thay thế prototype. */
const hookedXhrProtos = new WeakMap();

/* boolean: Hàm bọc request của iframe (fetch + XHR, quét ban đầu + MutationObserver lắng nghe động) đã được cài đặt hay chưa */
let iframeHooksInstalled = false;

/* object: Kết quả của lần thử giải nén Envelope gần nhất (dành cho __rlogDebug truy vấn; chỉ ghi lại lý do và số thứ tự ứng viên, không ghi địa chỉ thực tế) */
let lastEnvelopeResult = { hit: false, reason: 'none', urlCandidateIndex: null, bodyCandidateIndex: null };

/* object: Bộ đếm pipeline nội dung request. */
const requestPipelineStats = {
    analyzeCalls: 0,
    messageParseCalls: 0,
    hintScans: 0,
    jsonParses: 0,
    envelopeParses: 0,
    requestTextReads: 0,
};

/* object|null: Tóm tắt mô tả body, kế hoạch request và ngữ cảnh nguồn Fetch gần nhất. */
let lastBodyDescriptorSummary = null;
let lastRequestPlanSummary = null;
let lastFetchSourceContextSummary = null;

function summarizeBodyDescriptor(descriptor) {
    if (!descriptor) return null;
    return {
        state: descriptor.state,
        origin: descriptor.origin,
        hasRawText: descriptor.hasRawText,
        unsupportedReason: descriptor.unsupportedReason,
    };
}

/* number: Số thứ tự bắt request tăng dần, dùng để gắn chính xác phản hồi về bản ghi tương ứng */
let captureSeq = 0;

/* Khu vực hàng đợi phản hồi chưa được gắn vào bản ghi (key: captureId): { startTime, firstTokenAt, streaming,
   elapsedMs, httpStatus, upstreamMeta, upstreamMetaByPath, rawResponseText, toolCalls, timer,
   expireTimer, status, content, reasoning, failReason, time, reader, finished },
   sau khi bản ghi được tạo xong sẽ do consumePendingReply tiêu thụ. */
const pendingReplies = new Map();

/* string|null: Vân tay messages của bản ghi trước đó, dùng để chống trùng lặp */
let lastRecordFingerprint = null;

/* number: Dấu thời gian của bản ghi trước đó */
let lastRecordTime = 0;

/* { timestamp: number, target: string, source: 'click'|'pointerdown'|'keydown' }|null Cổng sinh nội dung native gần nhất của ST */
let lastNativeIntent = null;

/* boolean: Đã cài đặt listener cổng native hay chưa */
let sourceTrackingInstalled = false;

/* object|null: Trạng thái phiên sinh nội dung chính (pass) hiện tại (Điểm neo nhận diện chuẩn của RQ-32)
   { id, active, type, startTime, depth, dataTime, bodyRef, chatBodyRef, promptArray, e2Claimed, candidateCount, positionForfeited }
   - bodyRef     API chính không phải chat completion: Đối tượng payload dữ liệu công khai (chính là đối tượng body request)
   - chatBodyRef API chính chat completion: Payload của sự kiện "Body request sắp gửi đi" (chính là đối tượng body request)
   - promptArray API chính chat completion: Mảng prompt trong payload dữ liệu công khai (dùng cho yêu cầu bổ sung cùng nguồn E2)
   Phiên được mở bởi "Bắt đầu sinh nội dung (không im lặng, không chỉ lắp ráp)", được đóng bởi "Sinh nội dung kết thúc / Sinh nội dung bị dừng";
   Thông báo lồng nhau của chat nhóm được xử lý theo nguyên tắc "Dữ liệu công khai gần nhất thuộc về phiên hiện tại" (xem openOrResetGenerationPass). */
let generationPass = null;

/* number: Số thứ tự phiên (tự tăng; khi bằng chứng vị trí E3 bị hủy sẽ tìm lại các bản ghi trong phiên đã phán đoán là native theo bằng chứng vị trí dựa vào số thứ tự này) */
let generationPassSeq = 0;

/* number|null: Số thứ tự phiên gần nhất có "bằng chứng vị trí đã bị hủy" (đối tượng phiên có thể đã đóng, nên giữ riêng một bản:
   Việc "phán đoán" và "lập hồ sơ" hai request trong phiên là hai bước bất đồng bộ, request thứ hai có thể hủy bằng chứng trước khi request thứ nhất kịp lập hồ sơ) */
let lastForfeitedPositionPassId = null;

/* boolean: Đã cài đặt theo dõi phiên sinh nội dung chính hay chưa */
let generationPassTrackingInstalled = false;

/* object|null: Văn bản ứng viên tầng chat của sự kiện tin nhắn ST gần nhất (tin nhắn đến / tin nhắn nhân vật đã render / đã chuyển trang)
   { mesId, texts: string[], at }; Dùng cho việc "Hiệu chỉnh nguồn sau khi Response vào sàn chat". */
let lastFloorEvent = null;

/* Map<record, {at}>: Các bản ghi tiện ích đang "Response đã hoàn tất, chờ hiệu chỉnh khi vào sàn chat" (cần duyệt qua, nên không dùng WeakMap) */
const pendingSourceCorrections = new Map();

/* number|timeout|null: Timer thử lại hiệu chỉnh với độ trễ ngắn */
let sourceCorrectionTimer = null;

/* object: Thống kê hiệu chỉnh (dành cho __rlogDebug.getSourceCorrectionStats truy vấn) */
let sourceCorrectionStats = { count: 0, lastReason: '', lastTime: '' };

/* boolean: Đã cài đặt theo dõi hiệu chỉnh nguồn (lắng nghe sự kiện tin nhắn ST) hay chưa */
let sourceCorrectionTrackingInstalled = false;

/* object|null: Kết quả phán đoán nguồn gần nhất (Tên quy tắc / Mô tả hover / Lý do; dành cho __rlogDebug truy vấn) */
let lastSourceDecision = null;

/* string: Lý do loại trừ khi phán đoán là "Tiện ích" gần nhất (dành cho __rlogDebug.getLastExclusion truy vấn) */
let lastExclusionReason = '';

/* boolean: UI đã được dựng hay chưa (ngăn race condition trong init() dẫn đến việc dựng hai lần) */
let uiBuilt = false;

/* boolean: Công tắc xem trước nội dung, mặc định tắt (lưu bền vững vào cài đặt mở rộng ST) */
let contentPreviewEnabled = false;

/* boolean|null: Trạng thái ép buộc ghi đè xem trước nội dung (dùng cho chương trình hướng dẫn minh họa) */
let forcePreviewState = null;

/* @type {object} Trạng thái cài đặt ưu tiên (8 mục, mặc định tắt toàn bộ; lưu bền vững vào cài đặt mở rộng ST) */
let preferences = {
    badgeDefault: false,   /* boolean: Lối vào mặc định là nút nổi (sau khi bật, khởi động tiện ích mặc định hiển thị nút nổi, vị trí mặc định ở góc trên bên phải; khi đóng bảng điều khiển/thu nhỏ thì nút nổi trở về badgePos) */
    quickReplyEntry: false, /* boolean: Lối vào thanh QR (sau khi bật sẽ kích hoạt tập hợp QR gốc chuyên dụng của tiện ích) */
    hideExtensionEntry: false, /* boolean: Ẩn lối vào mặc định trong menu mở rộng; độc lập với các công tắc lối vào còn lại */
    followStTheme: false,  /* boolean: Chế độ ngày đêm theo theme ST (sau khi bật, giao diện sáng tối của bảng điều khiển chính tự động theo theme ST, nút chuyển ngày/đêm thủ công không có tác dụng; không liên quan đến phối màu nút nổi) */
    mobileFull: false,     /* boolean: Toàn màn hình trên di động (mở bảng điều khiển trên di động sẽ tự động tràn toàn màn hình) */
    clickOutside: false,   /* boolean: Nhấp ngoài bảng điều khiển tiện ích để đóng toàn bộ bảng điều khiển (dùng chung cho cả hai nền tảng, khi toàn màn hình tự nhiên không có tác dụng) */
    filterPersist: false,  /* boolean: Giữ trạng thái bộ lọc (sau khi bật sẽ giữ lại trạng thái bộ lọc qua các trang; khi tắt không làm thay đổi bộ lọc hiện tại) */
    minimal: false,        /* boolean: Chế độ tối giản (sau khi bật sẽ loại bỏ hiệu ứng chuyển cảnh/hoạt ảnh/cuộn mượt/nhấp nháy/làm mờ lớp phủ, giữ lại phản hồi trạng thái và chuyển động hướng dẫn) */
};

/* number: Timeout chờ phản hồi đang có hiệu lực (giây); 0 nghĩa là không đặt timeout. Lưu riêng biệt với các tùy chọn boolean */
let replyTimeoutSec = DEFAULT_REPLY_TIMEOUT_SEC;

/* number: Ngưỡng nhắc nhở Token nhấp nháy đang có hiệu lực; 0 nghĩa là chỉ giữ lại phối màu phân cấp ban đầu */
let tokenWarningThreshold = DEFAULT_TOKEN_WARNING_THRESHOLD;

/* number: Thời điểm hiển thị toast lỗi nhập tùy chọn số lần trước (hạn chế việc nhập sai liên tục làm nhảy thông báo lặp lại) */
let prefNumberNoticeAt = 0;

/* HTMLElement|null: Phần tử DOM lớp phủ cài đặt ưu tiên (Lớp che + Bảng điều khiển) */
let prefOverlayEl = null;

/* HTMLElement|null: Nút mở ngăn kéo "Tùy chọn khác" của cài đặt ưu tiên (dùng để chuyển đổi trạng thái icon hình trái tim) */
let prefBtnEl = null;

/* boolean: Lệnh slash thường trú của tiện ích đã được đăng ký hay chưa */
let toggleCommandReady = false;

/* Promise: Hàng đợi tuần tự hóa các thay đổi của tập hợp lối vào QR, tránh việc chuyển đổi tùy chọn nhanh làm việc tạo/xóa ghi đè lẫn nhau */
let quickReplyEntrySyncQueue = Promise.resolve();

/* MutationObserver|null: Lắng nghe thuộc tính style của <html> khi bảng điều khiển mở rộng và bật "Chế độ ngày đêm theo theme ST";
   nút nổi có bộ quan sát cùng tên độc lập riêng, hai bên không dùng chung và không ảnh hưởng lẫn nhau */
let panelThemeObserver = null;

/* @type {object|null} Trạng thái tìm kiếm hiện tại (tại một thời điểm chỉ có thể tìm kiếm trong một bản ghi)
   { recordIndex, keyword, matches: [{msgIdx, start, end}], currentIdx, searchEl } */
let searchState = null;

/* @type {object|null} Trạng thái tìm kiếm toàn cục (độc lập với tìm kiếm bản ghi đơn lẻ, không lưu trữ DOM node)
   { keyword, matches: [{record, msgIdx, start, end}], currentIdx, hasNewData,
     highlightedRecords: Map<record, {manual, domPainted}> } */
let globalSearchState = null;

/* boolean: Ngăn kéo tìm kiếm toàn cục có đang mở hay không; quản lý tách biệt với trạng thái tìm kiếm bản ghi đơn lẻ */
let globalSearchOpen = false;

/* number: Tác vụ frame tiếp theo để xóa cờ "chuyển đổi qua lại giữa các ngăn kéo", tránh việc chuyển đổi liên tục làm callback cũ xóa sớm trạng thái mới */
let headerDrawerSwapClearFrame = 0;

/* ResizeObserver|null: Giúp lớp chống chạm nhầm độc lập của tìm kiếm toàn cục liên tục căn chỉnh theo cụm điều khiển tìm kiếm */
let globalSearchGuardObserver = null;
/* boolean: Trong thời gian ngăn kéo tìm kiếm toàn cục mở rộng, bộ quan sát chống chạm nhầm đã kết nối với cụm điều khiển hiện tại hay chưa */
let globalSearchGuardObserverActive = false;

/* number|null: ID timer debounce của ô nhập tìm kiếm */
let searchDebounceTimer = null;

/* Trạng thái bộ lọc (trạng thái bộ nhớ cấp session, reset khi làm mới trang): Gồm ba nhóm boolean { source, role, model }, mặc định bật toàn bộ = không lọc,
   bất kỳ mục nào là false biểu thị ẩn phân loại đó; nguồn/model kiểm soát toàn bộ bản ghi, vai trò kiểm soát tin nhắn con bên trong bản ghi. */
let filterState = {
    source: { native: true, plugin: true },
    role: { system: true, user: true, assistant: true, other: true },
    model: { gemini: true, claude: true, deepseek: true, other: true },
};

/* object|null: Snapshot chuẩn hóa cấu hình tiện ích này trong extensionSettings của ST */
let pluginSettings = null;

/* HTMLElement|null: Thanh tiêu đề chờ nhấp nháy sau khi chuyển xuống đáy (kích hoạt sau khi cuộn mượt vào đúng vị trí) */
let pendingFlashHeader = null;
/* number|null: Timer dự phòng nhấp nháy khi xuống đáy (dự phòng khi scrollend không kích hoạt) */
let pendingFlashTimer = null;
/* HTMLElement|null: Phần tử bản ghi kích hoạt cuộn về đỉnh khi thu gọn (chỉ nhấp nháy khi mở rộng lại chính bản ghi đó) */
let recordCollapseToppedEl = null;

/* HTMLElement|null: Phần tử DOM lớp phủ đọc hiện tại (toàn bộ bản ghi hoặc tin nhắn đơn lẻ) */
let readFullOverlayEl = null;

/* number|null: Chỉ số bản ghi tương ứng với lớp phủ đang mở hiện tại */
let readFullRecordIndex = null;

/* string: Chế độ đọc hiện tại: 'record' (toàn bộ bản ghi) hoặc 'message' (tin nhắn đơn lẻ) */
let readOverlayMode = 'record';

/* HTMLElement|null: Nút kích hoạt cần khôi phục focus sau khi đóng lớp phủ đọc tin nhắn đơn lẻ */
let readOverlayReturnFocusEl = null;

/* string: Định dạng hiển thị hiện tại: 'formatted' (đã sắp xếp) hoặc 'raw' (JSON gốc) */
let readFullFormat = 'formatted';

/* ── Hàm tiện ích ─────────────────────────── */

/* Đọc ngữ cảnh ST an toàn: Khi chưa sẵn sàng hoặc có exception nội bộ đều trả về null (cả X3 của phán đoán nguồn và theo dõi phiên đều dùng hàm này)
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

/* Định dạng dấu thời gian (đồng bộ với định dạng nội tuyến trong addRecord: YYYY-MM-DD HH:mm:ss)
   @param {Date|number} value @returns {string} */
function formatTimestamp(value) {
    const d = (value instanceof Date) ? value : new Date(value);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} `
        + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

/* Trích xuất định danh "gia tộc" từ tên model (cùng gia tộc dùng chung tokenizer), quy tắc khớp tham chiếu getTokenizerModel() trong tokenizers.js của ST.
   @param {string} modelName @returns {string} Định danh gia tộc, khi không nhận diện được sẽ trả về tên gốc viết thường */
function extractModelFamily(modelName) {
    if (!modelName || modelName === 'Model không xác định' || modelName === '未知模型') return '';
    const m = modelName.toLowerCase();

    /* Gia tộc GPT: gpt, o1, o3, o4, davinci, turbo */
    if (m.includes('gpt') || m.includes('o1-') || m.includes('o3-') || m.includes('o4-') || m.includes('davinci')) return 'gpt';

    /* Gia tộc Claude */
    if (m.includes('claude')) return 'claude';

    /* Gia tộc Gemini/Gemma (tất cả model của Google dùng tokenizer Gemma) */
    if (m.includes('gemini') || m.includes('gemma') || m.includes('palm')) return 'gemini';

    /* Gia tộc Llama: llama, mistral, mixtral, qwen, deepseek, yi, command-r, command-a, nemo, pixtral, jamba */
    if (m.includes('llama') || m.includes('mistral') || m.includes('mixtral') || m.includes('qwen') || m.includes('deepseek') || m.includes('command-r') || m.includes('command-a') || m.includes('yi-') || m.includes('nemo') || m.includes('pixtral') || m.includes('jamba')) return 'llama';

    /* Gia tộc NovelAI */
    if (m.includes('kayra') || m.includes('clio') || m.includes('erato')) return 'novelai';

    /* Không thể nhận diện, trả về tên gốc làm định danh gia tộc (khớp chính xác cũng được) */
    return m;
}

/* Hai tên model có cùng gia tộc hay không (phán đoán theo extractModelFamily, dùng chung tokenizer)
   @param {string} modelA @param {string} modelB @returns {boolean} */
function isSameModelFamily(modelA, modelB) {
    if (!modelA || modelA === 'Model không xác định' || modelA === '未知模型' || !modelB) return true; /* Khi không thể phán đoán thì mặc định coi như tương thích */
    return extractModelFamily(modelA) === extractModelFamily(modelB);
}

/* Sử dụng tokenizer gốc của ST để tính Token bất đồng bộ và ghi ngược vào messages[i].tokens (khi không khả dụng sẽ giáng cấp sang ước tính theo byte)
   @param {Array} messages @param {string} modelName Dùng để phán đoán tính tương thích của tokenizer */
async function computeTokensForMessages(messages, modelName) {
    const ctx = window.SillyTavern && typeof window.SillyTavern.getContext === 'function'
        ? window.SillyTavern.getContext()
        : null;
    const getTokenCountAsync = ctx && ctx.getTokenCountAsync;

    if (!getTokenCountAsync) {
        /* Giáng cấp: Khi ST context không khả dụng, sử dụng cách ước tính byte đồng bộ với ST (BYTES_PER_TOKEN = 3.35) */
        const textEncoder = new TextEncoder();
        for (const msg of messages) {
            const byteLength = textEncoder.encode(msg.content).length;
            msg.tokens = Math.ceil(byteLength / 3.35);
            msg.tokenPrecise = false; /* Đánh dấu không phải giá trị chính xác, UI hiển thị tiền tố ~ */
        }
        return;
    }

    let stModelName = '';
    try {
        if (ctx && typeof ctx.getChatCompletionModel === 'function') {
            stModelName = ctx.getChatCompletionModel();
        }
    } catch (e) { /* ignore */ }

    /* Đối chiếu theo gia tộc model: Cùng gia tộc dùng chung tokenizer, không cần hiển thị ~ */
    const tokenizerCompatible = isSameModelFamily(modelName, stModelName);

    /* Dùng tokenizer gốc của ST tính toán chính xác từng dòng (ST có bộ nhớ cache nội bộ) */
    for (const msg of messages) {
        try {
            msg.tokens = await getTokenCountAsync(msg.content, 0);
            msg.tokenPrecise = tokenizerCompatible; /* Chỉ khi tên model khớp nhau mới coi là chính xác */
        } catch (e) {
            /* Giáng cấp sang ước tính theo byte khi gọi tokenizer thất bại */
            const byteLength = new TextEncoder().encode(msg.content).length;
            msg.tokens = Math.ceil(byteLength / 3.35);
            msg.tokenPrecise = false;
        }
    }
}

/* Dành riêng cho OpenAI chat completion: Tính toán từng dòng theo đối tượng tin nhắn hoàn chỉnh trong request cuối cùng, tái sử dụng cache token của ST.
   Từng dòng sử dụng full=false, chỉ lấy phần thuộc về bản thân tin nhắn đó trong toàn bộ request; nội dung có cấu trúc tiếp tục đi theo luồng thống kê hiện tại. */
let stTokenizersModulePromise = null;

function loadStTokenizersModule() {
    if (!stTokenizersModulePromise) {
        stTokenizersModulePromise = import('/scripts/tokenizers.js');
    }
    return stTokenizersModulePromise;
}

async function computeOpenAiPromptTokens(messages, finalMessages, modelName) {
    let countTokensOpenAIAsync = null;
    try {
        ({ countTokensOpenAIAsync } = await loadStTokenizersModule());
    } catch (e) {
        await computeTokensForMessages(messages, modelName);
        return;
    }

    const ctx = getStContextSafe();
    let stModelName = '';
    try {
        if (ctx && typeof ctx.getChatCompletionModel === 'function') {
            stModelName = ctx.getChatCompletionModel();
        }
    } catch (e) { /* ignore */ }
    const tokenizerCompatible = isSameModelFamily(modelName, stModelName);

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        try {
            msg.tokens = await countTokensOpenAIAsync(finalMessages[i], false);
            msg.tokenPrecise = tokenizerCompatible;
        } catch (e) {
            const byteLength = new TextEncoder().encode(msg.content).length;
            msg.tokens = Math.ceil(byteLength / 3.35);
            msg.tokenPrecise = false;
        }
    }
}

/* Lấy các phân đoạn không rỗng thực sự do model tạo ra trong phản hồi: Tách riêng phần suy nghĩ và chính văn để giữ lại, phục vụ cho việc thống kê token.
   Không bao gồm các thẻ <think> dùng để hiển thị, dòng trống ngăn cách hoặc lý do thất bại. */
function getReplyOutputParts(replyData) {
    if (!replyData) return [];
    return [replyData.reasoning, replyData.content]
        .filter((text) => typeof text === 'string' && text.trim())
        .map((text) => text.trim());
}

/* Thống kê riêng biệt các phân đoạn gốc của phản hồi rồi cộng dồn lại: Tránh tính các thẻ bọc giao diện hoặc dấu phân cách hiển thị giữa các phân đoạn vào token. */
async function computeTokensForReplyOutput(parts, modelName) {
    let tokens = 0;
    let tokenPrecise = true;
    for (const content of parts) {
        const sample = { content };
        await computeTokensForMessages([sample], modelName);
        tokens += Number(sample.tokens) || 0;
        tokenPrecise = tokenPrecise && sample.tokenPrecise === true;
    }
    return { tokens, tokenPrecise };
}

/* Trích xuất tên model từ body request (các trường của từng API khác nhau)
   @param {object} body @returns {string} Trích xuất không được sẽ trả về 'Model không xác định' */
function extractModelName(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Model không xác định';

    /* Trường model ở cấp cao nhất (OpenAI, phần lớn các định dạng tương thích) */
    if (typeof body.model === 'string' && body.model) return body.model;

    /* Định dạng Gemini: generationConfig.model */
    if (body.generationConfig && typeof body.generationConfig.model === 'string' && body.generationConfig.model) {
        return body.generationConfig.model;
    }

    /* Các trường thông dụng khác */
    const modelKeys = ['model_name', 'modelName', 'name', 'engine'];
    for (const key of modelKeys) {
        if (typeof body[key] === 'string' && body[key]) return body[key];
    }

    return 'Model không xác định';
}

/* Lấy văn bản tin nhắn hiện cần hiển thị: Khi có media có cấu trúc thì dùng văn bản đã sắp xếp kèm phần giữ chỗ, ngược lại trở về văn bản gốc.
   Token và request gốc vẫn chỉ dùng content, không đọc phần giữ chỗ ở đây. */
function getMessageDisplayText(msg) {
    if (msg && typeof msg.formattedContent === 'string') return msg.formattedContent;
    return msg && typeof msg.content === 'string' ? msg.content : '';
}

function getFullRecordText(record) {
    return getRecordDisplayEntries(record)
        .map((msg) => {
            const meta = msg.role === 'tool'
                ? [msg.toolName, msg.toolCallId].filter(value => typeof value === 'string' && value)
                : [];
            const heading = meta.length > 0
                ? `[${msg.role}] ${meta.join(' ')}`
                : `[${msg.role}]`;
            return `${heading}\n${getMessageDisplayText(msg)}`;
        })
        .join('\n\n');
}

function getTotalTokens(messages) {
    return messages.reduce((sum, m) => sum + (Number(m.tokens) || 0), 0);
}

/* Tổng token của bản ghi sử dụng tổng cấp request được xác định khi lập hồ sơ; dữ liệu cũ như inject kiểm thử bị thiếu trường sẽ trở về tổng của các tin nhắn. */
function getRecordPromptTokens(record) {
    if (record && Number.isFinite(record.promptTokens)) return record.promptTokens;
    return getTotalTokens(record && Array.isArray(record.messages) ? record.messages : []);
}

/* Trả về cấp bậc khoảng (0-7) dựa theo tổng số token
   @param {number} tokens Tổng số token
   @returns {number} Cấp bậc khoảng từ 0-7 */
function getTokenTier(tokens) {
    for (let i = 0; i < TOKEN_TIER_BOUNDARIES.length; i++) {
        if (tokens >= TOKEN_TIER_BOUNDARIES[i]) return TOKEN_TIER_BOUNDARIES.length - i;
    }
    return 0;
}

/* Trả về class hiển thị cho con số Token: Cảnh báo tùy chỉnh ưu tiên đè lên màu khoảng; khi tắt cảnh báo bằng 0 vẫn giữ màu đỏ cố định cho mức >200K */
function getTokenTierClass(tokens, warningThreshold = tokenWarningThreshold) {
    if (warningThreshold > 0 && tokens >= warningThreshold) {
        return 'rlog-token-tier-7 rlog-token-warning';
    }
    return `rlog-token-tier-${getTokenTier(tokens)}`;
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

/* Mục TOOL bổ sung sau Response dùng chung cấu trúc render với tin nhắn thông thường. */
function getRecordToolEntries(record) {
    return record && record.reply && Array.isArray(record.reply.toolEntries)
        ? record.reply.toolEntries
        : [];
}

/* Tổng hợp tin nhắn request, Response và TOOL theo thứ tự bản ghi thực tế; chỉ dùng cho việc hiển thị và xuất file. */
function getRecordDisplayEntries(record) {
    if (!record) return [];
    const entries = Array.isArray(record.messages) ? [...record.messages] : [];
    if (record.reply) entries.push(record.reply);
    entries.push(...getRecordToolEntries(record));
    return entries;
}

/* Lấy văn bản xem trước ở phần đầu tin nhắn: Giữ nguyên văn bản, đổi xuống dòng thành khoảng trắng, phía JS cắt bớt ở 200 ký tự (việc thu gọn thị giác giao cho CSS)
   @param {string} content @returns {string} */
function getContentPreview(content) {
    if (!content || typeof content !== 'string') return '';
    const collapsed = content.replace(/\n/g, ' ').trim();
    if (!collapsed) return '';
    /* 200 ký tự là giới hạn an toàn, việc thu gọn thị giác giao cho CSS */
    return collapsed.length > 200 ? collapsed.slice(0, 200) + '…' : collapsed;
}

/* Văn bản token trên thanh tiêu đề tin nhắn: Hiển thị phần giữ chỗ khi Response không có nội dung sinh thực tế, tránh việc bản thân lý do lỗi trông giống như output.
   tokenPrecise là true nghĩa là đã sử dụng tokenizer gốc của ST, không hiển thị ký hiệu ước tính ~. */
function getMessageTokenText(msg) {
    if (msg && msg.role === 'response' && msg.hasOutput === false) return TOKEN_COUNT_PLACEHOLDER;
    if (msg && msg.tokensIncludedInResponse === true) return TOKEN_COUNT_PLACEHOLDER;
    const tokenPrefix = msg && msg.tokenPrecise ? '' : '~';
    const tokens = msg && Number.isFinite(msg.tokens) ? msg.tokens : 0;
    return `${tokenPrefix}${tokens} tokens`;
}

/* Tin nhắn đơn lẻ có cung cấp lối vào đọc độc lập hay không; khi Response không có output thực tế dù có token bất thường cũng không hiển thị */
function shouldOfferMessageRead(msg) {
    if (!msg || (msg.role === 'response' && msg.hasOutput === false)) return false;
    if (msg.forceReadEntry === true) return true;
    const tokens = Number(msg.tokens);
    return Number.isFinite(tokens) && tokens >= MESSAGE_READ_TOKEN_THRESHOLD;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/* Phân tích các kênh RGB của chuỗi màu: Chỉ bao phủ các cách viết mà màu theme ST hay dùng (#rgb / #rrggbb / rgb() / rgba());
   alpha không tham gia phân tích —— độ sáng tối của theme chỉ nhìn vào hướng màu sắc.
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

/* Độ sáng cảm nhận tương đối theo WCAG (tính trọng số sau khi tuyến tính hóa sRGB), dùng để phán đoán độ sáng tối của màu nền theme
   @param {number} r @param {number} g @param {number} b @returns {number} */
function relativeLuminance(r, g, b) {
    const toLinear = (value) => {
        const s = Math.min(Math.max(value, 0), 255) / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/* ── Xác thực cấu trúc body Request AI ───────────────────── */

/* Đặc trưng đối tượng tin nhắn chat nội bộ của ST, dùng để loại trừ dữ liệu chat không phải request AI
   Chỉ thu thập các trường riêng của ST; các key tùy chỉnh do tiện ích bên thứ ba ghi vào dữ liệu chat không dùng để phán đoán */
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

/* Lối tắt nhanh tầng ngoài (dùng chung cho cả fetch và XHR): Khi địa chỉ là endpoint nội bộ ST và không chứa đặc trưng endpoint sinh nội dung, bỏ qua phán đoán tầng ngoài,
   chỉ thử giải nén Envelope. */
function isOuterFastPathUrl(url) {
    const path = getUrlPathForMatch(url);
    return !!(path && !pathMatchesAny(path, AI_GENERATION_PATH_PATTERNS)
        && (path.startsWith('/api/') || path.startsWith('/assets/') || path.startsWith('/backgrounds/')));
}

/* Kiểm tra đối tượng có trường riêng và có thể liệt kê (enumerable) hay không. */
function hasEnumerableOwnProperty(obj, key) {
    return Object.prototype.propertyIsEnumerable.call(obj, key);
}

/* Kiểm tra các trường bổ trợ sinh nội dung cố định. */
function hasGenerationRequestHints(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
    requestPipelineStats.hintScans++;
    for (const key of AI_GENERATION_BODY_KEYS) {
        if (hasEnumerableOwnProperty(body, key)) return true;
    }
    return false;
}

/* Xác thực nghiêm ngặt xem một đối tượng có phải là tin nhắn AI chuẩn hay không
   Ở đây cố tình chỉ chấp nhận role + content, tránh việc phán đoán nhầm lịch sử chat nội bộ ST, card nhân vật hoặc dữ liệu tải hệ thống thành request sinh nội dung. */
function isAiMessageObject(obj) {
    if (!obj || typeof obj !== 'object') return false;
    for (const key of ST_INTERNAL_MSG_KEYS) {
        if (hasEnumerableOwnProperty(obj, key)) return false;
    }
    if (!hasEnumerableOwnProperty(obj, 'role') || !hasEnumerableOwnProperty(obj, 'content')) return false;

    const role = typeof obj.role === 'string' ? obj.role.toLowerCase().trim() : '';
    if (!['system', 'user', 'assistant', 'tool', 'function', 'developer', 'model', 'human'].includes(role)) return false;

    if (typeof obj.content === 'string') return obj.content.length > 0;
    if (Array.isArray(obj.content)) return obj.content.length > 0;

    return false;
}

/* Phân tích mảng tin nhắn messages; trả về null khi không có tin nhắn hợp lệ. */
function parseMessagesBody(messageList) {
    requestPipelineStats.messageParseCalls++;
    const messages = [];
    for (const m of messageList) {
        if (!isAiMessageObject(m)) continue;
        const { content, formattedContent } = splitMessageContent(m.content);
        if (content || formattedContent) {
            const toolCallId = typeof m.tool_call_id === 'string' ? m.tool_call_id : '';
            const toolName = typeof m.name === 'string' ? m.name : '';
            messages.push({
                role: normalizeRole(m.role),
                content,
                tokens: 0,
                collapsed: true,
                ...(formattedContent !== content ? { formattedContent } : {}),
                ...(toolCallId ? { toolCallId } : {}),
                ...(toolName ? { toolName } : {}),
            });
        }
    }
    return messages.length > 0 ? messages : null;
}

/* Phân tích mảng tin nhắn chat, chỉ chấp nhận content dạng chuỗi. */
function parseChatBody(chatList) {
    requestPipelineStats.messageParseCalls++;
    const messages = [];
    for (const m of chatList) {
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
    return messages.length > 0 ? messages : null;
}

/* Phân tích contents[].parts của Gemini; không nhận diện text cấp cao nhất. */
function parseGeminiBody(contentsList) {
    requestPipelineStats.messageParseCalls++;
    const messages = [];
    for (const content of contentsList) {
        if (!content || typeof content !== 'object') continue;
        let hasInternalField = false;
        for (const key of ST_INTERNAL_MSG_KEYS) {
            if (hasEnumerableOwnProperty(content, key)) {
                hasInternalField = true;
                break;
            }
        }
        if (hasInternalField) continue;
        if (!Array.isArray(content.parts) || content.parts.length === 0) continue;
        const contentData = splitMessageContent(content.parts);
        if (contentData.content || contentData.formattedContent) {
            messages.push({
                role: normalizeRole(content.role || 'user'),
                content: contentData.content,
                tokens: 0,
                collapsed: true,
                ...(contentData.formattedContent !== contentData.content
                    ? { formattedContent: contentData.formattedContent }
                    : {}),
            });
        }
    }
    return messages.length > 0 ? messages : null;
}

/* Chuyển đổi prompt thành một tin nhắn user. */
function parsePromptBody(prompt) {
    requestPipelineStats.messageParseCalls++;
    return [{
        role: 'user',
        content: prompt,
        tokens: 0,
        collapsed: false,
    }];
}

/* Phân tích body request AI, trả về giao thức và mảng tin nhắn; không tính toán Token. */
function analyzeAiBody(body, requestUrl) {
    requestPipelineStats.analyzeCalls++;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    if (isExplicitNonGenerationUrl(requestUrl)) return null;

    let messagesValue;
    let chatValue;
    let contentsValue;
    let systemValue;
    let promptValue;
    try {
        /* Đọc qua năm trường ứng viên, mỗi trường một lần. */
        messagesValue = body.messages;
        chatValue = body.chat;
        contentsValue = body.contents;
        systemValue = body.system;
        promptValue = body.prompt;
    } catch (e) {
        return null;
    }

    const hasMessages = Array.isArray(messagesValue) && messagesValue.length > 0;
    const hasChat = Array.isArray(chatValue) && chatValue.length > 0;
    const hasContents = Array.isArray(contentsValue) && contentsValue.length > 0;
    const hasSystem = typeof systemValue === 'string' && systemValue.length > 0;
    const hasPrompt = typeof promptValue === 'string' && promptValue.length > 0;
    const generationUrl = isPotentialGenerationUrl(requestUrl);

    /* Khi không có ứng viên cấu trúc không rỗng, chỉ cho phép prompt đi tiếp. */
    if (!hasMessages && !hasChat && !hasContents && !hasSystem) {
        return hasPrompt ? { protocol: 'prompt', messages: parsePromptBody(promptValue) } : null;
    }
    if (!generationUrl && !hasGenerationRequestHints(body)) return null;

    /* Ưu tiên messages; khi messages không rỗng nhưng không có tin nhắn hợp lệ thì không fallback về các định dạng khác. */
    if (hasMessages) {
        const messages = parseMessagesBody(messagesValue);
        return messages ? { protocol: 'messages', messages } : null;
    }
    if (hasChat) {
        const messages = parseChatBody(chatValue);
        if (messages) return { protocol: 'chat', messages };
    }
    if (hasContents) {
        const messages = parseGeminiBody(contentsValue);
        if (messages) return { protocol: 'contents', messages };
    }
    if (hasPrompt) {
        return { protocol: 'prompt', messages: parsePromptBody(promptValue) };
    }
    return null;
}

/* Trả về lý do loại body không được hỗ trợ (unsupported); null nghĩa là xử lý như structured-object. */
function getUnsupportedFetchBodyReason(value) {
    if (value === '') return 'empty-body';
    if (Array.isArray(value)) return 'array-body';
    if (typeof value !== 'object') return 'non-object-body';
    let tag = '';
    try {
        tag = Object.prototype.toString.call(value);
    } catch (e) {
        return 'body-classification-failed';
    }
    if (tag === '[object Blob]' || tag === '[object File]') return 'blob-body';
    if (tag === '[object FormData]') return 'form-data-body';
    if (tag === '[object URLSearchParams]') return 'url-search-params-body';
    if (tag === '[object ArrayBuffer]') return 'array-buffer-body';
    if (tag === '[object DataView]' || tag === '[object TypedArray]') return 'typed-array-body';
    if (tag === '[object ReadableStream]') return 'readable-stream-body';
    try {
        if (ArrayBuffer.isView(value)) return 'typed-array-body';
    } catch (e) { /* ignore */ }
    return null;
}

/* Trích xuất mô tả nguồn body của Fetch. */
function readFetchBodySource(input, init) {
    let body;
    try {
        body = init ? init.body : undefined;
    } catch (e) {
        return {
            state: 'unsupported',
            origin: 'init-string',
            value: null,
            valuePromise: null,
            hasRawText: false,
            unsupportedReason: 'body-getter-failed',
        };
    }

    if (body === undefined || body === null) {
        if (isRequestLike(input)) {
            let valuePromise;
            try {
                const clonedRequest = input.clone();
                valuePromise = clonedRequest.text()
                    .then((text) => {
                        requestPipelineStats.requestTextReads++;
                        return typeof text === 'string' ? text : null;
                    })
                    .catch(() => null);
            } catch (e) {
                valuePromise = Promise.resolve(null);
            }
            return {
                state: 'text',
                origin: 'request-text',
                value: null,
                valuePromise,
                hasRawText: false,
                unsupportedReason: null,
            };
        }
        return {
            state: 'none',
            origin: 'init-string',
            value: null,
            valuePromise: null,
            hasRawText: false,
            unsupportedReason: null,
        };
    }

    if (typeof body === 'string') {
        if (body.length === 0) {
            return {
                state: 'unsupported',
                origin: 'init-string',
                value: body,
                valuePromise: null,
                hasRawText: false,
                unsupportedReason: 'empty-body',
            };
        }
        return {
            state: 'text',
            origin: 'init-string',
            value: body,
            valuePromise: null,
            hasRawText: true,
            unsupportedReason: null,
        };
    }

    const unsupportedReason = getUnsupportedFetchBodyReason(body);
    if (unsupportedReason) {
        return {
            state: 'unsupported',
            origin: 'init-string',
            value: body,
            valuePromise: null,
            hasRawText: false,
            unsupportedReason,
        };
    }

    return {
        state: 'structured-object',
        origin: 'structured-object',
        value: body,
        valuePromise: null,
        hasRawText: false,
        unsupportedReason: null,
    };
}

/* Trích xuất mô tả nguồn body dạng chuỗi của XHR. */
function readXhrBodySource(body) {
    if (typeof body !== 'string' || !body) {
        return {
            state: 'none',
            origin: 'xhr-text',
            value: null,
            valuePromise: null,
            hasRawText: false,
            unsupportedReason: null,
        };
    }
    return {
        state: 'text',
        origin: 'xhr-text',
        value: body,
        valuePromise: null,
        hasRawText: true,
        unsupportedReason: null,
    };
}

/* ── Giải nén request Proxy dạng Envelope ─────────────────── */

/* Ghi lại kết quả của một lần thử giải nén Envelope (dành cho __rlogDebug truy vấn; chỉ ghi lại lý do và số thứ tự ứng viên cấp cao nhất, không ghi bất kỳ địa chỉ thực tế nào) */
function rememberEnvelopeResult(hit, reason, urlIndex, bodyIndex) {
    lastEnvelopeResult = {
        hit: !!hit,
        reason,
        urlCandidateIndex: hit ? urlIndex : null,
        bodyCandidateIndex: hit ? bodyIndex : null,
    };
}

/* Phân tích văn bản request thành đối tượng JSON (mảng/scalar/JSON không hợp lệ đều trả về null, không ném exception) */
function parseJsonText(text) {
    if (typeof text !== 'string' || !text) return null;
    requestPipelineStats.jsonParses++;
    try {
        const parsed = JSON.parse(text);
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null;
    } catch (e) {
        return null;
    }
}

/* Lấy giá trị ứng viên body lớp bên trong của Envelope (G4 + G7): object (không phải mảng) lấy dùng trực tiếp; chuỗi chỉ JSON.parse tối đa một lần,
   kết quả phân tích vẫn là object mới lấy dùng; các trường hợp còn lại đều coi ứng viên đó không hợp lệ (không đệ quy sâu hơn). */
function normalizeEnvelopeBody(value) {
    if (!value) return null;
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
        return parseJsonText(value);
    }
    return null;
}

/* Giải nén một lớp request Envelope; chỉ xử lý các method ghi và địa chỉ nội tầng http(s) hoàn chỉnh. */
function resolveRequestEnvelope(method, rawText, parsedOuter = null, outerAlreadyParsed = false) {
    /* Chỉ xử lý các method ghi. */
    const upperMethod = typeof method === 'string' ? method.toUpperCase() : '';
    if (upperMethod !== 'POST' && upperMethod !== 'PUT' && upperMethod !== 'PATCH') {
        rememberEnvelopeResult(false, 'method-not-writable');
        return null;
    }

    /* Sàng lọc trước văn bản gốc bằng dạng thức URL. */
    if (typeof rawText !== 'string' || !rawText || !ENVELOPE_URL_SHAPE_RE.test(rawText)) {
        rememberEnvelopeResult(false, 'url-shape-miss');
        return null;
    }

    requestPipelineStats.envelopeParses++;
    const outer = outerAlreadyParsed ? parsedOuter : parseJsonText(rawText);
    if (!outer) {
        rememberEnvelopeResult(false, 'outer-not-object');
        return null;
    }

    /* Khớp các ứng viên URL và chính văn cấp cao nhất theo thứ tự Object.keys. */
    const keys = Object.keys(outer);
    let sawUrlCandidate = false;
    for (let urlIndex = 0; urlIndex < keys.length; urlIndex++) {
        const urlCandidate = outer[keys[urlIndex]];
        if (typeof urlCandidate !== 'string' || !urlCandidate) continue;
        if (!isPotentialGenerationUrl(urlCandidate)) continue;
        sawUrlCandidate = true;
        /* Địa chỉ lớp bên trong phải là địa chỉ http(s) hoàn chỉnh. */
        if (!/^https?:\/\//i.test(urlCandidate)) continue;
        for (let bodyIndex = 0; bodyIndex < keys.length; bodyIndex++) {
            if (bodyIndex === urlIndex) continue;
            const innerBody = normalizeEnvelopeBody(outer[keys[bodyIndex]]);
            if (!innerBody) continue;
            /* Chính văn lớp bên trong sử dụng bộ phân tích hợp nhất. */
            const analysis = analyzeAiBody(innerBody, urlCandidate);
            if (!analysis) continue;
            rememberEnvelopeResult(true, 'hit', urlIndex, bodyIndex);
            return {
                effectiveUrl: urlCandidate,
                effectiveBody: innerBody,
                viaProxyEnvelope: true,
                analysis,
            };
        }
    }

    rememberEnvelopeResult(false, sawUrlCandidate ? 'no-valid-pair' : 'no-url-candidate');
    return null;
}

/* Tạo RequestPlan cho ứng viên body của Fetch/XHR. */
async function planCapturedRequest(candidate) {
    const descriptor = candidate && candidate.body;
    if (!descriptor || descriptor.state === 'none' || descriptor.state === 'unsupported') return null;

    let body = null;
    let rawText = null;
    let bodyParsed = false;
    if (descriptor.state === 'structured-object') {
        body = descriptor.value;
        bodyParsed = true;
    } else if (descriptor.state === 'text') {
        rawText = typeof descriptor.value === 'string'
            ? descriptor.value
            : (descriptor.valuePromise ? await descriptor.valuePromise.catch(() => null) : null);
        if (typeof rawText !== 'string') return null;
        body = parseJsonText(rawText);
        bodyParsed = true;
    }
    if (!body && !rawText) return null;

    const sourceContext = Object.assign({}, candidate.context || {}, {
        bodyObject: body,
        rawText,
    });
    let effectiveUrl = candidate.requestUrl;
    let effectiveBody = body;
    let analysis = null;
    let viaProxyEnvelope = false;

    if (body && !isOuterFastPathUrl(candidate.requestUrl)) {
        try {
            analysis = analyzeAiBody(body, candidate.requestUrl);
        } catch (e) {
            analysis = null;
        }
    }

    if (!analysis && typeof rawText === 'string' && rawText) {
        const envelope = resolveRequestEnvelope(candidate.method, rawText, body, bodyParsed);
        if (envelope) {
            effectiveUrl = envelope.effectiveUrl;
            effectiveBody = envelope.effectiveBody;
            analysis = envelope.analysis;
            viaProxyEnvelope = true;
        }
    }
    if (!analysis || !effectiveBody) return null;

    const plan = {
        captureId: candidate.captureId != null ? candidate.captureId : null,
        requestStartedAt: candidate.requestStartedAt,
        effectiveUrl,
        body: effectiveBody,
        rawText,
        hasRawText: typeof rawText === 'string' && rawText.length > 0,
        bodyOrigin: viaProxyEnvelope
            ? 'envelope-object'
            : (descriptor.origin === 'init-string'
                ? 'json-string'
                : descriptor.origin),
        protocol: analysis.protocol,
        messages: analysis.messages,
        viaProxyEnvelope,
        sourceContext,
    };
    lastRequestPlanSummary = {
        effectiveUrlIsGeneration: isPotentialGenerationUrl(effectiveUrl),
        protocol: plan.protocol,
        messageCount: plan.messages.length,
        bodyOrigin: plan.bodyOrigin,
        hasRawText: plan.hasRawText,
        viaProxyEnvelope: plan.viaProxyEnvelope,
    };
    return plan;
}

/* ── Nhận diện nguồn request (Phán đoán bằng chứng phân tầng, RQ-32) ───────── */

/* Thứ tự phán đoán nguồn: E1 → E2 → X2-X5 → E3 → Fallback cũ → Mặc định tiện ích.
   E2 phải nằm trước X3, tránh phán đoán nhầm khi tạm thời chuyển đổi cấu hình API chính. */

/* Tên quy tắc dùng trong phán đoán nguồn (dành cho cổng debug __rlogDebug.getLastSourceDecision đối chiếu với tài liệu, không tham gia hiển thị):
   envelope / E1 / E2 / X2 / X3 / X4 / X5 / E3 / legacy / default / E3-revoked / correct */

/* Tạo đối tượng nguồn: Miền giá trị vẫn là hai giá trị 'native / plugin'; rule / evidence / passId là metadata phán đoán nội bộ
   (Tên Rule dùng cho debug và khẳng định regression, khi evidence = 'position' bản ghi có thể bị lùi về 'plugin' khi tính duy nhất của E3 mất hiệu lực).
   @param {'native'|'plugin'} type @param {string} detail Mô tả hover @param {string} rule @returns {object} */
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

/* Ghi lại kết quả phán đoán nguồn gần nhất (dùng cho cổng debug) và trả về kết quả đó
   @param {object} result @param {string} reason Lý do con người có thể đọc được @returns {object} */
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

/* ── Theo dõi phiên sinh nội dung chính (pass) ───────────────── */

/* Đọc tên API chính của ST ('openai' biểu thị luồng chat completion, còn lại là luồng dạng text completion)
   @returns {string} */
function getStMainApi() {
    const stCtx = getStContextSafe();
    return (stCtx && typeof stCtx.mainApi === 'string') ? stCtx.mainApi : '';
}

/* Kết thúc phiên này (xóa đối tượng phiên; timeout treo cũng đi qua đây) */
function resetGenerationPassState() {
    generationPass = null;
}

/* Mở / Reset một phiên sinh nội dung chính (nhận sự kiện "Bắt đầu sinh nội dung", loại không im lặng, không phải chỉ lắp ráp không gửi).
   Thông báo sinh nội dung chính của chat nhóm sẽ xuất hiện lồng nhau nhiều bản: Xử lý theo "Dữ liệu công khai gần nhất thuộc về phiên hiện tại" —— phiên đã có không tạo đối tượng mới,
   chỉ xóa dữ liệu công khai và bộ đếm ứng viên của phiên này (xác nhận E2 và đếm E3 theo đó bắt đầu lại), đồng thời tích lũy độ sâu lồng nhau.
   @param {string} type Loại sinh nội dung */
function openOrResetGenerationPass(type) {
    const now = Date.now();
    if (generationPass && (now - generationPass.startTime) > PASS_MAX_AGE_MS) {
        resetGenerationPassState(); /* Phiên treo (mất sự kiện kết thúc): Xóa trước rồi mới mở phiên mới */
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

/* Nhận "Sinh nội dung kết thúc / Sinh nội dung bị dừng": Giảm độ sâu lồng nhau, độ sâu về 0 tức là kết thúc phiên này */
function closeGenerationPass() {
    if (!generationPass) return;
    generationPass.depth--;
    if (generationPass.depth <= 0) resetGenerationPassState();
}

/* Phiên sinh nội dung chính hiện tại (timeout treo coi như không có phiên → Giao cho X4 phán đoán là "Tiện ích")
   @returns {object|null} */
function getActiveGenerationPass() {
    if (!generationPass || !generationPass.active) return null;
    if ((Date.now() - generationPass.startTime) > PASS_MAX_AGE_MS) {
        resetGenerationPassState();
        return null;
    }
    return generationPass;
}

/* Sự kiện "Lắp ráp dữ liệu request hoàn tất": Lưu tham chiếu payload dữ liệu công khai của phiên này, và ghi lại thời gian dữ liệu công khai (điểm bắt đầu của E3).
   - API chính không phải chat completion: Payload chính là đối tượng body request (E2 trực tiếp tuần tự hóa tại chỗ để so sánh)
   - API chính chat completion: Payload là mảng prompt ({ prompt: [...] }), đối tượng body request đợi sự kiện "Body request sắp gửi đi" bổ sung
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

/* Sự kiện "Body request sắp gửi đi" (luồng chat completion): Payload chính là đối tượng body request sắp được JSON.stringify.
   Sinh nội dung im lặng (type === 'quiet') không phải request cốt truyện chính, không ghi vào phiên này (nếu không sẽ coi request im lặng của chính tiện ích là request chính). */
function onChatCompletionSettingsReady(payload) {
    const pass = getActiveGenerationPass();
    if (!pass) return;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
    if (payload.type === 'quiet') return;
    pass.chatBodyRef = payload;
}

/* Cài đặt theo dõi phiên sinh nội dung chính (Bắt đầu sinh / Lắp ráp dữ liệu request hoàn tất / Body request sắp gửi đi / Sinh kết thúc / Sinh bị dừng) */
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
        if (String(type) === 'quiet') return;     /* Sinh nội dung im lặng: Không phải request cốt truyện chính, không coi là phiên sinh nội dung chính */
        openOrResetGenerationPass(String(type));
    });
    on('GENERATE_AFTER_DATA', (payload, dryRun) => onPassDataGathered(payload, dryRun));
    on('CHAT_COMPLETION_SETTINGS_READY', (payload) => onChatCompletionSettingsReady(payload));
    on('GENERATION_ENDED', () => closeGenerationPass());
    on('GENERATION_STOPPED', () => closeGenerationPass());
}

/* ── Bằng chứng xuôi (E1 / E2) ─────────────────── */

/* E1: Đối tượng signal mà request mang theo === Đối tượng signal trên instance bộ xử lý stream hiện tại (chỉ fetch và chỉ stream).
   Cả hai signal đều được createFetchHook đọc đồng bộ tại "khoảnh khắc đánh chặn" rồi đưa vào ngữ cảnh request (xem buildFetchRequestContext),
   do đó không tồn tại khoảng thời gian chênh lệch "phán đoán muộn hơn lúc bộ xử lý stream bị hủy". XHR không có handle có thể hủy bỏ trên thân request, vĩnh viễn không áp dụng.
   @param {object|null} context @returns {boolean} */
function matchHandleIdentity(context) {
    if (!context || context.fromXhr) return false;
    return !!(context.signal && context.streamingSignal && context.signal === context.streamingSignal);
}

/* Body request có cấu trúc chat completion (messages là mảng không rỗng): Căn cứ trường của X2 / X3 chỉ áp dụng cho cấu trúc này,
   API chính không phải chat completion dựa vào X4 / X5 / E2 bao phủ.
   @param {object} body @returns {boolean} */
function isChatCompletionShaped(body) {
    return !!(body && typeof body === 'object' && !Array.isArray(body)
        && Array.isArray(body.messages) && body.messages.length > 0);
}

/* Tuần tự hóa tham chiếu đối tượng tại chỗ (trả về null nếu tham chiếu vòng / tuần tự hóa thất bại)
   @param {object} value @returns {string|null} */
function stringifyRef(value) {
    try {
        return JSON.stringify(value);
    } catch (e) {
        return null;
    }
}

/* Mảng tin nhắn sau khi loại trừ các mục không hợp lệ (mục không phải object bị loại theo diện "mục không hợp lệ")
   @param {Array} list @returns {Array} */
function validMessageItems(list) {
    return Array.isArray(list) ? list.filter((m) => m && typeof m === 'object') : [];
}

/* Yêu cầu bổ sung của luồng chat completion: messages của đối tượng body request cùng nguồn với mảng prompt của phiên này (khớp từng phần tử, cho phép loại bỏ mục không hợp lệ)
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

/* E2: Body request cùng nguồn với dữ liệu công khai sinh nội dung chính đã lưu lúc vào cổng.
   @param {object} plan @returns {boolean} */
function matchDataSameSource(plan) {
    const context = plan && plan.sourceContext;
    const pass = context && context.generationPass;
    const evidence = context && context.passEvidence;
    if (!pass || !evidence || pass.e2Claimed) return false;
    const bodyObject = plan.body;
    const rawText = plan.rawText;

    if (evidence.bodyRef) {
        if (bodyObject && bodyObject === evidence.bodyRef) return true;
        const serialized = stringifyRef(evidence.bodyRef);
        if (serialized !== null && typeof rawText === 'string' && rawText === serialized) return true;
    }
    if (evidence.chatBodyRef) {
        const serialized = stringifyRef(evidence.chatBodyRef);
        if (serialized !== null && typeof rawText === 'string' && rawText === serialized
            && isSameSourceMessages(evidence.chatBodyRef.messages, evidence.promptArray)) {
            return true;
        }
    }
    return false;
}

/* ── Các mục loại trừ dùng chung (X2 / X3) ───────────────── */

/* Chuẩn hóa giá trị định danh (undefined / null tương đương chuỗi rỗng: ST không cài đặt trường nào đó với việc cài đặt là rỗng là cùng một nghĩa)
   @param {*} value @returns {string} */
function normalizeIdentityValue(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

/* Địa chỉ kênh (Địa chỉ tùy chỉnh / Reverse proxy): Cả hai đều là thông tin kênh "request được gửi đến đâu", lấy giá trị không rỗng xuất hiện trước
   @param {object} source @returns {string} */
function getChannelAddress(source) {
    if (!source || typeof source !== 'object') return '';
    return normalizeIdentityValue(source.reverse_proxy) || normalizeIdentityValue(source.custom_url);
}

/* Địa chỉ request có phải là endpoint sinh nội dung chat completion của ST hay không (chỉ so khớp đường dẫn: Cửa sổ chính bắt được là địa chỉ tương đối, iframe / XHR bắt được là địa chỉ tuyệt đối)
   @param {string} url @returns {boolean} */
function isStChatCompletionEndpoint(url) {
    return getUrlPathForMatch(url) === ST_CHAT_COMPLETION_ENDPOINT;
}

/* X3: Body request chat completion có nhất quán với nhà cung cấp, địa chỉ request, địa chỉ kênh và model lúc vào cổng hay không.
   @param {object} body @param {string} requestUrl @param {object|null} snapshot @returns {boolean} */
function isApiIdentityConsistent(body, requestUrl, snapshot) {
    if (!snapshot || !snapshot.available) return false;

    /* ① Nhà cung cấp */
    if (normalizeIdentityValue(body.chat_completion_source) !== snapshot.chatCompletionSource) {
        return false;
    }
    /* ② Địa chỉ request (endpoint sinh nội dung chat completion của ST) */
    if (!isStChatCompletionEndpoint(requestUrl)) return false;
    /* ③ Địa chỉ kênh (Địa chỉ tùy chỉnh / Reverse proxy) */
    if (getChannelAddress(body) !== snapshot.channelAddress) return false;
    /* ④ Model */
    if (normalizeIdentityValue(body.model) !== snapshot.model) return false;

    return true;
}

/* ── Bằng chứng vị trí dự phòng (E3) và Cổng phán đoán phân tầng ───────── */

/* Từ bỏ bằng chứng vị trí của phiên này (xuất hiện request ghi ứng viên thứ hai trong phiên): Lùi các bản ghi đã phán đoán là native theo bằng chứng "vị trí" về "Tiện ích".
   Chỉ lùi các bản ghi "vẫn là kết quả gốc do bằng chứng vị trí phán đoán, và chưa từng được hiệu chỉnh khi Response vào sàn chat" —— bản ghi đã được hiệu chỉnh khi Response vào sàn chat
   (record.sourceCorrected) thăng cấp thành native sẽ giữ nguyên là native (đó là một bằng chứng độc lập khác). */
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
        lastExclusionReason = `E3-revoked: Phiên này xuất hiện nhiều request ghi ứng viên, bằng chứng vị trí bị hủy (${revoked} bản ghi bị lùi về "Tiện ích")`;
    }
}

/* Hủy bằng chứng vị trí của phiên này: Đánh dấu phiên + Ghi lại số thứ tự (dành cho request "đang trên đường gửi nhưng chưa kịp lập hồ sơ" tự kiểm tra khi addRecord) +
   Lùi các bản ghi đã lập hồ sơ theo bằng chứng vị trí về "Tiện ích" */
function forfeitPositionEvidence(pass) {
    if (!pass) return;
    pass.positionForfeited = true;
    lastForfeitedPositionPassId = pass.id;
    revokePositionEvidence(pass);
}

/* Xác nhận bằng chứng vị trí E3 vẫn còn hiệu lực trước khi lập hồ sơ. */
function finalizePositionEvidenceSource(source, pass = null) {
    if (!source || source.evidence !== 'position') return source;
    const forfeitedByLive = !!(generationPass && generationPass.id === source.passId
        && generationPass.candidateCount >= 2);
    const forfeitedByEntryPass = !!(pass && pass.id === source.passId && pass.candidateCount >= 2);
    if (forfeitedByLive || forfeitedByEntryPass || lastForfeitedPositionPassId === source.passId) {
        lastExclusionReason = 'E3-revoked: Phiên này xuất hiện nhiều request ghi ứng viên, bằng chứng vị trí bị hủy';
        return makeSource('plugin', SOURCE_PLUGIN_DEFAULT_DETAIL, 'E3-revoked');
    }
    return source;
}

/* Ghi lại request ghi ứng viên trong một phiên; hủy E3 khi ứng viên thứ hai xuất hiện. */
function notePassWriteCandidate(pass) {
    if (!pass || pass.dataTime == null) return;
    pass.candidateCount++;
    if (pass.candidateCount >= 2) forfeitPositionEvidence(pass);
}

/* Cửa sổ thời gian cổng native cũ làm dự phòng; cần giữ lại làm bằng chứng nguồn có mức ưu tiên thấp nhất. */
function legacyNativeIntentSource(snapshot) {
    const now = Date.now();
    if (snapshot && (now - snapshot.timestamp) <= NATIVE_INTENT_WINDOW_MS) {
        return makeSource('native', `Yêu cầu Native-${snapshot.target}`, 'legacy');
    }
    return null;
}

/* Phán đoán nguồn request của RequestPlan.
   @param {object} plan
   @returns {object} Đối tượng nguồn (Native / Tiện ích) */
function decideRequestSource(plan) {
    const body = plan.body;
    const requestUrl = plan.effectiveUrl;
    const ctxInfo = plan.sourceContext || {};
    const pass = ctxInfo.generationPass;

    /* E1 */
    if (matchHandleIdentity(ctxInfo)) {
        return noteSourceDecision(makeSource('native', 'Yêu cầu Native-Handle stream', 'E1'), 'Đối tượng signal mà request mang theo nhất quán với instance bộ xử lý stream hiện tại');
    }

    /* E2 */
    if (matchDataSameSource(plan)) {
        if (pass) pass.e2Claimed = true;
        return noteSourceDecision(makeSource('native', 'Yêu cầu Native-Dữ liệu cùng nguồn', 'E2'), 'Body request cùng nguồn với dữ liệu công khai của phiên này');
    }

    /* X2 / X3 */
    if (isChatCompletionShaped(body)) {
        if (!Object.prototype.hasOwnProperty.call(body, 'type')) {
            return noteSourceDecision(makeSource('plugin', SOURCE_PLUGIN_DEFAULT_DETAIL, 'X2'), 'Body request chat completion thiếu trường type (body không phải do ST cấu tạo)');
        }
        if (body.type === 'quiet') {
            return noteSourceDecision(makeSource('plugin', SOURCE_PLUGIN_DEFAULT_DETAIL, 'X2'), 'type === quiet (Sinh nội dung im lặng, không phải request cốt truyện chính)');
        }
        if (!isApiIdentityConsistent(body, requestUrl, ctxInfo.apiIdentitySnapshot)) {
            return noteSourceDecision(makeSource('plugin', SOURCE_PLUGIN_DEFAULT_DETAIL, 'X3'), 'Định danh API không nhất quán với cấu hình chính (Nhà cung cấp / Địa chỉ request / Địa chỉ kênh / Model)');
        }
    }
    if (!pass) {
        return noteSourceDecision(makeSource('plugin', SOURCE_PLUGIN_DEFAULT_DETAIL, 'X4'), 'Không nằm trong bất kỳ phiên sinh nội dung chính nào');
    }
    if (!ctxInfo.topWindow) {
        return noteSourceDecision(makeSource('plugin', SOURCE_PLUGIN_DEFAULT_DETAIL, 'X5'), 'Đến từ iframe cùng nguồn (không phải cửa sổ cao nhất)');
    }

    /* E3 */
    if (pass && pass.dataTime != null && pass.candidateCount === 1) {
        const result = makeSource('native', 'Yêu cầu Native-Bằng chứng vị trí', 'E3');
        result.evidence = 'position';
        result.passId = pass.id;
        return noteSourceDecision(result, 'Sau sự kiện dữ liệu công khai, là request ghi ứng viên duy nhất của phiên này');
    }

    /* Fallback cũ */
    const legacy = legacyNativeIntentSource(ctxInfo.nativeIntentSnapshot);
    if (legacy) return noteSourceDecision(legacy, 'Fallback cửa sổ thời gian cũ (Nhấp chuột vào lối vào native / Phím Enter)');

    /* Mặc định tiện ích */
    return noteSourceDecision(makeSource('plugin', SOURCE_PLUGIN_DEFAULT_DETAIL, 'default'), 'Mặc định tiện ích');
}

/* ── Hiệu chỉnh nguồn sau khi Response vào sàn chat (Chỉ làm thăng cấp "Tiện ích → Native") ── */

/* Chuẩn hóa văn bản tầng chat: Thống nhất xuống dòng, thu gọn khoảng trắng trong dòng, loại bỏ khoảng trắng đầu cuối dòng và dòng trống.
   (ST khi vào sàn chat sẽ thực hiện cắt gọt chuỗi dừng, ghép nối bias prompt..., ở đây chỉ chuẩn hóa ở mức độ khoảng trắng.) */
function normalizeFloorText(text) {
    if (typeof text !== 'string' || !text) return '';
    return text.replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[\t\u00a0 ]+/g, ' ').trim())
        .filter((line) => line.length > 0)
        .join('\n');
}

/* "Chính văn thuần túy" của phản hồi (không chứa suy nghĩ): Phản hồi trong bản ghi ở dạng ghép nối `<think>…</think>` + dòng trống + chính văn */
function getReplyPlainContent(record) {
    const content = (record && record.reply && record.reply.content) || '';
    return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/* Chính văn tầng chat có khớp với chính văn thuần túy của bản ghi hay không (cả hai phía đều đã được chuẩn hóa): Bằng nhau hoàn toàn, hoặc khi độ dài đủ thì "tầng chat chứa chính văn"
   (Sinh nội dung viết tiếp sẽ ghép nội dung mới vào cuối tầng chat, bias prompt sẽ thêm vào đầu tầng chat; văn bản ngắn chỉ chấp nhận bằng nhau hoàn toàn để tránh phán đoán nhầm) */
function isFloorTextMatch(floorText, replyText) {
    if (!floorText || !replyText) return false;
    if (floorText === replyText) return true;
    if (replyText.length < SOURCE_CORRECTION_MIN_OVERLAP) return false;
    return floorText.indexOf(replyText) !== -1;
}

/* Ghi nhớ văn bản ứng viên tầng chat của sự kiện tin nhắn ST gần nhất (tin nhắn đến / tin nhắn nhân vật đã render / đã chuyển trang):
   Chính văn tầng chat hiện tại + Ứng viên chuyển trang của tầng chat đó (swipes). */
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

/* Đăng ký một bản ghi "chờ hiệu chỉnh" (gọi khi chính văn phản hồi hoàn tất): Chỉ đăng ký các bản ghi không phải demo hiện đang gắn nhãn "Tiện ích".
   Bỏ qua bản ghi demo; khi tìm mục tiêu hiệu chỉnh sẽ bao phủ đồng thời cả danh sách bình thường và hàng đợi tạm lưu hướng dẫn (xem prunePendingSourceCorrections). */
function queueSourceCorrection(record) {
    if (!record || record.isDemo) return;
    if (!record.source || record.source.type !== 'plugin') return;
    if (record.source.rule === 'envelope') return; /* Bản ghi giải nén Envelope nguồn cố định là "Tiện ích", không tham gia hiệu chỉnh */
    pendingSourceCorrections.set(record, { at: Date.now() });
    scheduleSourceCorrectionCheck();
}

/* Dọn dẹp bảng chờ hiệu chỉnh: Bản ghi không còn trong danh sách (bị cắt tỉa / xóa sạch / xóa lẻ) hoặc vượt quá thời gian giữ lại.
   Các mục trong thời gian gia hạn chỉ phán đoán theo thời gian sống —— khi "phản hồi đến trước, bản ghi vào danh sách sau" thì bản ghi chưa vào danh sách,
   phán đoán theo quan hệ thành viên sẽ xóa nhầm mục vừa đăng ký. */
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

/* Kích hoạt một lần thử hiệu chỉnh: Ngay lập tức một lần + Một lần thử lại với độ trễ ngắn (bổ sung một lần khi sự kiện tin nhắn đến trước mà phản hồi chưa đọc xong;
   phía phản hồi đến sau do queueSourceCorrection → Hàm này chịu trách nhiệm kích hoạt, bên nào đến sau thì bên đó kích hoạt). */
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

/* Hiệu chỉnh: Bản ghi hiện đang gắn nhãn "Tiện ích", mà chính văn thuần túy của phản hồi (không chứa suy nghĩ) sau khi chuẩn hóa khớp với chính văn tầng chat / ứng viên chuyển trang vừa xuất hiện,
   và việc khớp là duy nhất → Thăng cấp thành "Native". Chỉ làm thăng cấp, tuyệt đối không làm giáng cấp; khớp được 0 bản ghi hoặc nhiều bản ghi đều không sửa
   (dùng "phản hồi không vào sàn chat" làm bằng chứng là không an toàn: Thất bại, hủy bỏ, sinh im lặng, đóng vai đều không vào sàn chat). */
function tryPromoteSourcesFromFloor() {
    const floorEvent = lastFloorEvent;
    if (!floorEvent || !floorEvent.texts.length) return;
    const now = Date.now();
    if ((now - floorEvent.at) > SOURCE_CORRECTION_WINDOW_MS) return; /* Sự kiện tầng chat quá cũ: Không thực hiện hiệu chỉnh */

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

/* Thăng cấp nguồn bản ghi thành "Native" (chỉ đổi ba trường của nguồn: Loại / Tên hiển thị / Mô tả hover; các nội dung khác của bản ghi giữ nguyên) */
function promoteRecordSource(record) {
    const prevType = record.source && record.source.type;
    record.source = makeSource('native', 'Yêu cầu Native-Hiệu chỉnh khi vào sàn chat', 'correct');
    record.sourceCorrected = true;
    pendingSourceCorrections.delete(record);
    sourceCorrectionStats.count++;
    sourceCorrectionStats.lastReason = 'Chính văn thuần túy của phản hồi khớp duy nhất với chính văn tầng chat / ứng viên chuyển trang';
    sourceCorrectionStats.lastTime = formatTimestamp(Date.now());
    refreshRecordSourceDom(record, prevType);
}

/* Cài đặt theo dõi hiệu chỉnh nguồn: Sự kiện tin nhắn ST (Tin nhắn đến / Tin nhắn nhân vật đã render / Đã chuyển trang) → Ghi nhớ ứng viên tầng chat và thử hiệu chỉnh */
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

/* Lưu snapshot định danh API lúc vào cổng. */
function buildApiIdentitySnapshot() {
    const stCtx = getStContextSafe();
    const settings = stCtx && stCtx.chatCompletionSettings;
    if (!settings) return { available: false };
    let expectedModel = '';
    try {
        expectedModel = (typeof stCtx.getChatCompletionModel === 'function')
            ? stCtx.getChatCompletionModel(settings)
            : settings.model;
    } catch (e) {
        expectedModel = settings.model;
    }
    return {
        available: true,
        chatCompletionSource: normalizeIdentityValue(settings.chat_completion_source),
        channelAddress: getChannelAddress(settings),
        model: normalizeIdentityValue(expectedModel),
    };
}

/* Cấu tạo ngữ cảnh nguồn lối vào request. */
function buildSourceContext(realmWindow, method, fromXhr, requestStartedAt) {
    const pass = getActiveGenerationPass();
    return {
        capturedAt: requestStartedAt,
        method,
        topWindow: realmWindow === window,
        fromXhr,
        generationPass: pass,
        passEvidence: pass ? {
            id: pass.id,
            dataTime: pass.dataTime,
            bodyRef: pass.bodyRef,
            chatBodyRef: pass.chatBodyRef,
            promptArray: pass.promptArray,
        } : null,
        nativeIntentSnapshot: lastNativeIntent ? { ...lastNativeIntent } : null,
        apiIdentitySnapshot: buildApiIdentitySnapshot(),
        bodyObject: null,
        rawText: null,
    };
}

/* Cấu tạo ngữ cảnh lối vào request Fetch. */
function buildFetchRequestContext(realmWindow, input, init, method, requestStartedAt = Date.now()) {
    let signal = (init && init.signal) ? init.signal : null;
    if (!signal && isRequestLike(input)) {
        try { signal = input.signal || null; } catch (e) { signal = null; }
    }
    const stCtx = getStContextSafe();
    const processor = stCtx ? stCtx.streamingProcessor : null;
    const streamingSignal = (processor && processor.abortController) ? processor.abortController.signal : null;
    return Object.assign(buildSourceContext(realmWindow, method, false, requestStartedAt), {
        rawText: null,
        signal,
        streamingSignal,
    });
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
        { selector: '#send_but', label: 'Nút gửi' },
        { selector: '#option_regenerate', label: 'Tạo lại' },
        { selector: '#option_continue, #mes_continue', label: 'Tiếp tục' },
        { selector: '#mes_impersonate', label: 'Đóng vai' },
        { selector: '.swipe_right, .mes_swipe_right, [data-action="swipe-right"], [title="Swipe right"]', label: 'Tạo phản hồi dự phòng' },
    ];

    const onNativeClickIntent = (e) => {
        const targetEl = e.target instanceof Element ? e.target : null;
        if (!targetEl) return;

        /* Chỉ kiểm tra trong khu vực liên quan đến chat (#sheld là container khu vực nội dung chính của ST), tránh việc duyệt vô nghĩa các khu vực menu/cài đặt */
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

    /* Phản hồi dự phòng / Tạo lại có thể không đi qua pointerdown/click, trực tiếp lắng nghe GENERATION_STARTED làm phương án bảo hiểm */
    if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
        const stCtx = window.SillyTavern.getContext();
        if (stCtx && stCtx.eventSource && stCtx.event_types) {
            const onGenStarted = (type) => {
                const typeStr = String(type != null ? type : '');
                /* Chỉ bổ sung đánh dấu khi sự kiện click DOM không bắt được, và chỉ nhận diện loại sinh nội dung native rõ ràng */
                if (!lastNativeIntent || (Date.now() - lastNativeIntent.timestamp) > NATIVE_INTENT_WINDOW_MS) {
                    if (typeStr === 'impersonate') {
                        rememberNativeIntent('Đóng vai (Sự kiện ST)', 'generationStarted');
                    } else if (typeStr === 'continue') {
                        rememberNativeIntent('Tiếp tục (Sự kiện ST)', 'generationStarted');
                    } else if (typeStr === 'regenerate') {
                        rememberNativeIntent('Tạo lại (Sự kiện ST)', 'generationStarted');
                    } else if (typeStr === 'swipe') {
                        rememberNativeIntent('Tạo phản hồi dự phòng (Sự kiện ST)', 'generationStarted');
                    }
                }
            };
            try {
                stCtx.eventSource.on(stCtx.event_types.GENERATION_STARTED, onGenStarted);
            } catch (err) {
                /* Đăng ký thất bại chỉ ảnh hưởng đến nhận diện bảo hiểm, theo dõi lối vào DOM vẫn hoạt động bình thường */
                console.debug(`[${PLUGIN_KEY}] Đăng ký listener GENERATION_STARTED thất bại:`, err);
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

        rememberNativeIntent('Ô nhập Enter', 'keydown');
    }, true);

    /* Phơi bày giao diện debug ra window */
    window.__rlogDebug = {
        getLastNativeIntent: () => lastNativeIntent,
        getRecords: () => records,
        getIframeHookCount: () => {
            let count = 0;
            document.querySelectorAll('iframe').forEach((f) => {
                try {
                    if (f.contentWindow && hookedFetchHooks.get(f.contentWindow)) count++;
                } catch (e) { /* Bỏ qua iframe khác nguồn (cross-origin) */ }
            });
            return count;
        },
        /* Bộ đếm bọc XHR (thống kê các realm iframe cùng nguồn đã gắn hook) */
        getXhrHookCount: () => {
            let count = 0;
            document.querySelectorAll('iframe').forEach((f) => {
                try {
                    if (f.contentWindow && hookedXhrProtos.has(f.contentWindow)) count++;
                } catch (e) { /* Bỏ qua iframe khác nguồn (cross-origin) */ }
            });
            return count;
        },
        /* Kết quả lần thử giải nén Envelope gần nhất (Trúng hay không + Lý do; khi trúng chứa số thứ tự ứng viên cấp cao nhất do G9 chọn, không chứa địa chỉ thực tế) */
        getLastEnvelopeResult: () => lastEnvelopeResult,
        /* Số lượng mục hiện tại trong hàng đợi phản hồi (Dùng cho khẳng định regression: Request không thuộc diện bản ghi không được chiếm chỗ) */
        getPendingReplyCount: () => pendingReplies.size,
        /* Trạng thái sẵn sàng của hook request (Dùng cho kiểm thử chờ đợi): Cờ cài đặt fetch không yêu cầu bằng với window.fetch hiện tại,
           bởi vì các tiện ích khác vẫn có thể tiếp tục bọc chuỗi gọi sau tiện ích này */
        getHookStatus: () => ({
            fetchHookInstalled: !!currentHook,
            windowFetchMatchesCurrentHook: !!currentHook && window.fetch === currentHook,
            mainXhrHookInstalled: hookedXhrProtos.has(window),
            iframeHooksInstalled,
        }),
        /* Bộ đếm pipeline chính văn và tóm tắt gần nhất (chỉ chứa các trường phân loại, không chứa chính văn) */
        getRequestPipelineStats: () => ({
            ...requestPipelineStats,
            lastBody: lastBodyDescriptorSummary ? { ...lastBodyDescriptorSummary } : null,
            lastPlan: lastRequestPlanSummary ? { ...lastRequestPlanSummary } : null,
            lastFetchContext: lastFetchSourceContextSummary ? { ...lastFetchSourceContextSummary } : null,
        }),
        resetRequestPipelineStats: () => {
            Object.keys(requestPipelineStats).forEach((key) => { requestPipelineStats[key] = 0; });
            lastBodyDescriptorSummary = null;
            lastRequestPlanSummary = null;
            lastFetchSourceContextSummary = null;
        },
        /* Trạng thái và loại phiên sinh nội dung chính hiện tại (Tóm tắt chỉ đọc; không chứa tham chiếu body request) */
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
        /* Phán đoán nguồn gần nhất (Loại trúng bằng chứng chính: E1 Cùng handle / E2 Dữ liệu cùng nguồn / E3 Vị trí; Loại trừ: X2–X5 / Mặc định) */
        getLastSourceDecision: () => (lastSourceDecision ? { ...lastSourceDecision } : null),
        /* Lý do loại trừ khi phán đoán là "Tiện ích" gần nhất */
        getLastExclusion: () => lastExclusionReason,
        /* Số lần hiệu chỉnh và lý do gần nhất (chỉ làm thăng cấp "Tiện ích → Native") */
        getSourceCorrectionStats: () => ({ ...sourceCorrectionStats }),
        /* Số lượng bản ghi chờ hiệu chỉnh hiện tại (Response đã hoàn tất, chờ khớp khi vào sàn chat) */
        getPendingCorrectionCount: () => pendingSourceCorrections.size,
        /* Thống kê dỡ bỏ/khôi phục chính văn (chỉ đọc): loaded/unloaded là trạng thái hiện tại trong danh sách, passes/lastPassMs là bộ đếm duy trì băng thông */
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

    console.debug(`[${PLUGIN_KEY}] Nhận diện nguồn yêu cầu đã được kích hoạt (Phán đoán bằng chứng phân tầng + Lắng nghe lối vào native bảo hiểm). Giao diện debug: window.__rlogDebug`);
}

function getSourceLabel(source) {
    if (source && source.type === 'native') return 'Native';
    return 'Tiện ích';
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
    return 'Nhân vật không xác định';
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

/* Nhận diện các mục media trong mảng nội dung request, chỉ trả về văn bản giữ chỗ đơn giản dùng cho định dạng sắp xếp.
   Ở đây chỉ đọc các trường media có cấu trúc trong body request cuối cùng, không suy đoán từ văn bản thông thường hay nội dung base64. */
function getMediaPlaceholder(part) {
    if (!part || typeof part !== 'object') return '';

    const type = typeof part.type === 'string' ? part.type.toLowerCase() : '';
    const directTypes = {
        image: '[Hình ảnh]',
        image_url: '[Hình ảnh]',
        input_image: '[Hình ảnh]',
        video: '[Video]',
        video_url: '[Video]',
        input_video: '[Video]',
        audio: '[Âm thanh]',
        audio_url: '[Âm thanh]',
        input_audio: '[Âm thanh]',
        file: '[Tệp]',
        file_url: '[Tệp]',
        input_file: '[Tệp]',
        document: '[Tệp]',
    };
    if (directTypes[type]) return directTypes[type];

    /* Tương thích với các mục request không ghi type nhưng mang các trường media tiêu chuẩn */
    if (part.image_url != null) return '[Hình ảnh]';
    if (part.video_url != null) return '[Video]';
    if (part.audio_url != null || part.input_audio != null) return '[Âm thanh]';
    if (part.file_url != null || part.file_id != null || part.file_data != null || part.input_file != null) return '[Tệp]';

    /* Media nội tuyến / Tham chiếu tệp của Gemini: Phân loại theo MIME, các loại khác hiển thị thống nhất là tệp */
    const inlineData = part.inlineData || part.inline_data;
    const fileData = part.fileData || part.file_data;
    const dataRef = inlineData && typeof inlineData === 'object'
        ? inlineData
        : (fileData && typeof fileData === 'object' ? fileData : null);
    if (dataRef) {
        const mimeType = String(dataRef.mimeType || dataRef.mime_type || '').toLowerCase();
        if (mimeType.startsWith('image/')) return '[Hình ảnh]';
        if (mimeType.startsWith('video/')) return '[Video]';
        if (mimeType.startsWith('audio/')) return '[Âm thanh]';
        return '[Tệp]';
    }

    return '';
}

/* Tách chính văn tin nhắn thành hai phần: content giữ nguyên văn bản gốc (dùng cho token và dữ liệu gốc),
   formattedContent giữ thêm phần giữ chỗ media (dùng cho từng tin nhắn, tìm kiếm và định dạng sắp xếp). */
function splitMessageContent(content) {
    if (typeof content === 'string') {
        return { content, formattedContent: content };
    }
    if (!Array.isArray(content)) {
        return { content: '', formattedContent: '' };
    }

    const textParts = [];
    const formattedParts = [];
    for (const part of content) {
        if (!part || typeof part !== 'object') continue;
        const isTextPart = typeof part.text === 'string'
            && (!part.type || part.type === 'text' || part.type === 'input_text');
        if (isTextPart && part.text) {
            textParts.push(part.text);
            formattedParts.push(part.text);
            continue;
        }
        const placeholder = getMediaPlaceholder(part);
        if (placeholder) formattedParts.push(placeholder);
    }

    return {
        content: textParts.join('\n'),
        formattedContent: formattedParts.join('\n'),
    };
}

/* Che giấu các trường nhạy cảm trong body request gốc (dùng khi lưu trữ); không thay đổi đối tượng đầu vào, không trúng thì trả về nguyên bản
   @param {object} body @returns {object} */
function redactSensitiveBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return body;

    let redacted = null;
    for (const field of SENSITIVE_BODY_FIELDS) {
        /* Giá trị rỗng không cần che giấu */
        if (!body[field]) continue;
        if (!redacted) redacted = Object.assign({}, body);
        redacted[field] = SENSITIVE_BODY_MASK;
    }
    return redacted || body;
}

/* Xử lý RequestPlan đã được xác thực.
   @param {object} plan
   @param {number|null} captureId
   @param {object|null} [simulateCtx=null] Ngữ cảnh bắt giữ của lần mô phỏng này (không rỗng tức là "request này là bắt giữ mô phỏng"; nguồn cố định là mô phỏng, không tham gia phán đoán nguồn)
   @param {number|null} [requestStartedAt=null] Thời điểm request vào cổng đánh chặn (mili giây) */
async function processCapturePlan(plan, captureId = null, simulateCtx = null, requestStartedAt = null) {
    const isSimulated = !!simulateCtx;
    if (!plan || !plan.body || !Array.isArray(plan.messages) || plan.messages.length === 0) {
        if (isSimulated) simulateCtx.settle(null);
        return;
    }

    const body = plan.body;
    const messages = plan.messages;
    const characterName = getCurrentCharacterName();
    /* Đếm ứng viên E3; bắt giữ mô phỏng không tính vào. */
    if (!isSimulated) notePassWriteCandidate(plan.sourceContext.generationPass);
    /* Request Envelope cố định là nguồn tiện ích; bắt giữ mô phỏng cố định là nguồn mô phỏng. */
    const source = isSimulated
        ? { ...SIMULATED_PROMPT_SOURCE }
        : (plan.viaProxyEnvelope
            ? noteSourceDecision(ENVELOPE_PROXY_SOURCE, 'Trúng giải nén Envelope (RQ-31, phán đoán chung cuộc)')
            : decideRequestSource(plan));
    let modelName = extractModelName(body);
    /* Bản ghi mô phỏng khi thiếu tên model sẽ dùng model hiện tại của ST. */
    if (isSimulated && (modelName === 'Model không xác định' || modelName === '未知模型')) modelName = getStChatCompletionModelName() || modelName;
    /* Khi mô phỏng đã bị hủy thì không tiếp tục phân từ và lập hồ sơ. */
    if (isSimulated && simulateCtx.canceled) {
        simulateCtx.settle(null);
        return;
    }
    /* Lựa chọn luồng phân từ chính xác của OpenAI hoặc phân từ thông dụng. */
    const stCtx = getStContextSafe();
    const finalMessages = stCtx && stCtx.mainApi === 'openai' && Array.isArray(body.messages)
        ? body.messages.filter(isAiMessageObject)
        : [];
    const canUseOpenAiPromptTokens = stCtx
        && Array.isArray(body.messages)
        && finalMessages.length === messages.length
        && finalMessages.every(message => typeof message.content === 'string');
    if (canUseOpenAiPromptTokens) {
        await computeOpenAiPromptTokens(messages, finalMessages, modelName);
    } else {
        await computeTokensForMessages(messages, modelName);
    }
    /* Sau khi hoàn thành phân từ kiểm tra lại xem mô phỏng đã bị hủy hay chưa. */
    if (isSimulated && simulateCtx.canceled) {
        simulateCtx.settle(null);
        return;
    }
    /* Lập hồ sơ và che giấu trường nhạy cảm. */
    const record = addRecord(characterName, messages, source, modelName, redactSensitiveBody(body), captureId,
        { simulated: isSimulated, requestStartedAt, sourcePass: plan.sourceContext.generationPass });
    /* Đệ trình kết quả bắt giữ mô phỏng. */
    if (isSimulated) simulateCtx.settle(record || null);
}

/* Phán đoán đầu vào của fetch có phải là đối tượng Request hay không.
   Dùng duck typing thay vì instanceof: Khi xuyên realm, Request bên trong iframe đối với
   `instanceof Request` của cửa sổ chính luôn là false, nhưng các phương thức clone/text vẫn khả dụng. */
function isRequestLike(input) {
    return !!(input && typeof input === 'object' && typeof input.clone === 'function' && typeof input.text === 'function');
}

/* Cấu tạo hàm bọc đánh chặn Fetch.
   @param {Window} realmWindow @param {Function} getOriginalFetch @returns {Function} */
function createFetchHook(realmWindow, getOriginalFetch) {
    let realmHookInFlight = false; /* Bảo vệ chống re-entrancy cho realm này (chống các hàm bọc khác tạo thành vòng lặp kín) */
    return async function hookedFetch(input, init) {
        /* Thời điểm khởi tạo request: Ghi nhận đồng bộ khi vào bộ đánh chặn, không lấy thời gian tính token sau đó hoặc thời gian bấm xuất file */
        const requestStartedAt = Date.now();
        const originalFetch = getOriginalFetch();

        /* ── Xem trước mô phỏng ──
           Thông báo trước khi gửi vừa đến thì request mục tiêu được "vũ trang" chính là request của lần mô phỏng này: Tiếp tục đi xuống dưới, lập hồ sơ theo pipeline bản ghi bình thường,
           cuối cùng không giao cho fetch gốc (xem fetchPromise bên dưới); các request sinh nội dung không được nhận diện trong cửa sổ vẫn chỉ chặn chứ không ghi */
        const simulateWindowHit = simulatePromptActive && GENERATE_ENDPOINT_RE.test(getFetchRequestUrl(input));
        /* Request mục tiêu chỉ có thể do cửa sổ chính phát ra (chuỗi gửi của chính ST): Request sinh nội dung bên trong iframe chỉ chặn chứ không nhận diện */
        const simulateCapture = (simulateWindowHit && simulateCaptureCtx && simulateCaptureCtx.armed && realmWindow === window)
            ? simulateCaptureCtx
            : null;
        if (simulateCapture) simulateCapture.armed = false; /* Chỉ nhận diện duy nhất request này */
        if (simulateWindowHit && !simulateCapture) {
            return Promise.reject(new DOMException('Simulate mode: generation request blocked', 'AbortError'));
        }

        /* ── Lối tắt nhanh 0: Bảo vệ chống re-entrancy (Request bắt giữ mô phỏng này cần lập hồ sơ, không bị giới hạn này) ── */
        if (realmHookInFlight && !simulateCapture) {
            return originalFetch.apply(realmWindow, [input, init]);
        }

        /* ── Lối tắt nhanh 1: Khi công tắc tổng tắt thì truyền thẳng, không phân tích body (Request bắt giữ mô phỏng này không bị giới hạn này) ── */
        if (!masterEnabled && !simulateCapture) {
            return originalFetch.apply(realmWindow, [input, init]);
        }

        /* ── Lối tắt nhanh 2: Bỏ qua trực tiếp các request không phải POST/PUT/PATCH ── */
        let method = init && init.method ? init.method.toUpperCase() : 'GET';
        if (isRequestLike(input) && method === 'GET') {
            try { method = input.method.toUpperCase(); } catch (e) { /* ignore */ }
        }
        if (!simulateCapture && method !== 'POST' && method !== 'PUT' && method !== 'PATCH') {
            return originalFetch.apply(realmWindow, [input, init]);
        }

        /* ── Nguồn chính văn ── */
        const requestUrl = getFetchRequestUrl(input);
        let bodyDescriptor;
        try {
            bodyDescriptor = readFetchBodySource(input, init);
        } catch (e) {
            bodyDescriptor = {
                state: 'unsupported',
                origin: 'init-string',
                value: null,
                valuePromise: null,
                hasRawText: false,
                unsupportedReason: 'body-read-failed',
            };
        }
        lastBodyDescriptorSummary = summarizeBodyDescriptor(bodyDescriptor);

        /* ── Lối tắt nhanh 3: URL nội bộ ST ── */
        const outerFastPath = isOuterFastPathUrl(requestUrl);
        const textValue = bodyDescriptor.state === 'text' && typeof bodyDescriptor.value === 'string'
            ? bodyDescriptor.value
            : '';
        const envelopePossible = bodyDescriptor.state === 'text'
            && (bodyDescriptor.origin === 'request-text' || ENVELOPE_URL_SHAPE_RE.test(textValue));
        if (!simulateCapture && outerFastPath && !envelopePossible) {
            return originalFetch.apply(realmWindow, [input, init]);
        }

        /* Chọn địa chỉ theo dõi phản hồi ban đầu. */
        let replyGateUrl = requestUrl;
        if (outerFastPath && textValue) {
            const shapeMatch = textValue.match(ENVELOPE_URL_SHAPE_RE);
            if (shapeMatch) replyGateUrl = shapeMatch[0];
        }

        /* ── Snapshot đồng bộ lối vào request ── */
        realmHookInFlight = true;
        let requestContext;
        try {
            requestContext = buildFetchRequestContext(realmWindow, input, init, method, requestStartedAt);
            requestContext.rawText = bodyDescriptor.state === 'text'
                && typeof bodyDescriptor.value === 'string'
                ? bodyDescriptor.value
                : null;
            lastFetchSourceContextSummary = {
                passId: requestContext.generationPass ? requestContext.generationPass.id : null,
                hasPassEvidence: !!requestContext.passEvidence,
                hasBodyRef: !!(requestContext.passEvidence && requestContext.passEvidence.bodyRef),
                hasChatBodyRef: !!(requestContext.passEvidence && requestContext.passEvidence.chatBodyRef),
                promptCount: requestContext.passEvidence && Array.isArray(requestContext.passEvidence.promptArray)
                    ? requestContext.passEvidence.promptArray.length
                    : 0,
                hasDataTime: !!(requestContext.passEvidence && requestContext.passEvidence.dataTime != null),
                e2ClaimedAtEntry: !!(requestContext.generationPass && requestContext.generationPass.e2Claimed),
                hasNativeIntent: !!requestContext.nativeIntentSnapshot,
                hasApiIdentity: !!(requestContext.apiIdentitySnapshot
                    && requestContext.apiIdentitySnapshot.available),
            };
        } finally {
            realmHookInFlight = false;
        }

        /* ── Gọi fetch gốc (bên ngoài khóa; gọi qua tham chiếu closure, tránh đệ quy qua window.fetch) ──
           Ngoại lệ cho request bắt giữ mô phỏng: Sau khi ghi nhận xong lập tức trả về "Đã hủy", không chuyển request ra ngoài */
        const fetchPromise = simulateCapture
            ? Promise.reject(new DOMException('Simulate mode: generation request blocked', 'AbortError'))
            : originalFetch.apply(realmWindow, [input, init]);

        const hasCapturableBody = bodyDescriptor.state === 'text' || bodyDescriptor.state === 'structured-object';
        if (!hasCapturableBody) {
            if (simulateCapture) simulateCapture.settle(null);
            return fetchPromise;
        }

        /* Phân bổ mã bắt giữ và đăng ký theo dõi phản hồi ban đầu. */
        const captureId = simulateCapture ? null : ++captureSeq;
        let replyTracked = false;
        if (captureId != null) {
            replyTracked = captureResponseForRequest(fetchPromise, replyGateUrl, captureId);
        }

        Promise.resolve().then(async () => {
            const plan = await planCapturedRequest({
                requestUrl,
                method,
                body: bodyDescriptor,
                context: requestContext,
                captureId,
                requestStartedAt,
            });
            if (!plan) {
                if (captureId != null && replyTracked) abortPendingReply(captureId);
                if (simulateCapture) simulateCapture.settle(null);
                return;
            }
            if (captureId != null && !replyTracked) {
                replyTracked = captureResponseForRequest(fetchPromise, plan.effectiveUrl, captureId);
            }
            await processCapturePlan(plan, captureId, simulateCapture, requestStartedAt);
        }).catch(() => {
            if (captureId != null) abortPendingReply(captureId);
            if (simulateCapture) simulateCapture.settle(null);
        });

        return fetchPromise;
    };
}

/* Cài đặt đánh chặn request cho cửa sổ chính (fetch + XHR): Cả hai bộ bọc đều luôn được cài đặt, bên trong do masterEnabled quyết định có ghi hay không.
   Bộ bọc của tiện ích này chỉ được gắn khi buildUI (APP_READY / Dự phòng trễ), do đó nằm ở lớp ngoài hơn so với các bộ bọc "được gắn ngay khi thực thi script";
   originalFetch / Phương thức prototype XHR gốc bắt được chính là chuỗi gọi xuôi dòng đã sẵn sàng vào thời điểm đó. */
function installRequestHooks() {
    if (currentHook) return; /* Đã cài đặt */

    originalFetch = window.fetch;
    currentHook = createFetchHook(window, () => originalFetch);
    window.fetch = currentHook;
    hookedFetchHooks.set(window, currentHook);
    hookRealmXhr(window);

    console.debug(`[${PLUGIN_KEY}] Đánh chặn yêu cầu đã được kích hoạt (fetch + XHR, chế độ đánh chặn hợp nhất tầng mạng)`);
}

/* Cài đặt bọc request cho một iframe cùng nguồn đơn lẻ (fetch + XHR): Khác nguồn không lấy được contentWindow thì bỏ qua trực tiếp;
   Đã cài đặt và chưa bị thay thế thì bỏ qua, tránh phá vỡ chuỗi bọc của realm đó.
   @param {HTMLIFrameElement} iframe @returns {boolean} Đã cài đặt hay chưa */
function hookIframeRequests(iframe) {
    if (!iframe) return false;
    if (!iframe.contentWindow) {
        /* contentWindow chưa sẵn sàng: Gắn listener load, thử lại sau khi tải xong */
        if (!iframeLoadListenersAttached.has(iframe)) {
            iframeLoadListenersAttached.add(iframe);
            iframe.addEventListener('load', () => hookIframeRequests(iframe));
        }
        return false;
    }
    const win = iframe.contentWindow;
    try {
        /* Phán đoán cùng nguồn: Truy cập khác nguồn vào contentWindow.document sẽ ném SecurityError */
        void win.document;
    } catch (e) {
        return false;
    }

    /* Bọc fetch: Đã cài và chưa bị thay thế thì bỏ qua */
    let ready = true;
    const existingHook = hookedFetchHooks.get(win);
    if (existingHook && win.fetch === existingHook) {
        ready = true;
    } else if (typeof win.fetch === 'function') {
        /* Bắt fetch gốc hiện tại của realm đó; sau khi iframe reload (realm được dựng lại) hoặc script nội bộ thay thế fetch,
           listener load sẽ bọc lại. */
        const iframeOriginalFetch = win.fetch;
        const hook = createFetchHook(win, () => iframeOriginalFetch);
        win.fetch = hook;
        hookedFetchHooks.set(win, hook);
    } else {
        ready = false;
    }

    /* Bọc XHR: Cùng một realm chỉ cài một lần, đã cài và chưa bị thay thế thì bỏ qua */
    if (!hookRealmXhr(win)) ready = false;

    if (!iframeLoadListenersAttached.has(iframe)) {
        iframeLoadListenersAttached.add(iframe);
        iframe.addEventListener('load', () => hookIframeRequests(iframe));
    }
    return ready;
}

/* Cài đặt bọc request cho iframe cùng nguồn (fetch + XHR):
   Quét ban đầu các iframe hiện có, và dùng MutationObserver để lắng nghe các iframe tạo động sau này
   (Bật/tắt script, dựng lại khi đổi nhân vật/preset, render tin nhắn, v.v.). Bọc luôn được cài đặt, bên trong do masterEnabled quyết định có ghi hay không. */
function installIframeRequestHooks() {
    if (iframeHooksInstalled) return;
    iframeHooksInstalled = true;

    /* Quét ban đầu: Khi cài đặt có thể đã tồn tại iframe cùng nguồn trong trang */
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

    console.debug(`[${PLUGIN_KEY}] Đánh chặn yêu cầu iframe đã được kích hoạt (fetch + XHR, ban đầu ${hookedCount}/${totalCount} iframe + Lắng nghe động)`);
}

/* ── Đóng gói và theo dõi ngầm XHR ─────────────────────── */

/* Phân tích địa chỉ nhận được từ open thành địa chỉ tuyệt đối theo location của chính realm đó (location của cửa sổ chính và iframe khác nhau). */
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

/* Bắt đầu một lần theo dõi ngầm XHR và thiết lập bộ đệm phản hồi.
   @param {XMLHttpRequest} xhr @param {*} body @param {Window} realmWindow Realm phát ra request đó
   @returns {{method, url, body, trackReply, responsePromise, discard, context}|null} */
function beginXhrCapture(xhr, body, realmWindow) {
    if (!masterEnabled) return null;
    if (!xhr || typeof xhr !== 'object') return null;
    /* Thời điểm khởi tạo request XHR. */
    const requestStartedAt = Date.now();
    const meta = xhrOpenMeta.get(xhr);
    if (!meta || !meta.async) return null;              /* Chưa qua open hoặc XHR đồng bộ (tham số thứ ba là false) sẽ không theo dõi */
    const bodyDescriptor = readXhrBodySource(body);
    if (bodyDescriptor.state === 'none') return null;    /* Chỉ theo dõi ngầm body là chuỗi không rỗng */
    lastBodyDescriptorSummary = summarizeBodyDescriptor(bodyDescriptor);
    const requestUrl = meta.url;
    const rawText = bodyDescriptor.value;
    /* Ngữ cảnh lối vào request XHR. */
    const context = Object.assign(buildSourceContext(realmWindow, meta.method, true, requestStartedAt), {
        rawText,
        signal: null,
        streamingSignal: null,
    });
    /* URL nội bộ ST chỉ tiếp tục khi văn bản có khả năng cấu thành Envelope. */
    if (isOuterFastPathUrl(requestUrl) && !ENVELOPE_URL_SHAPE_RE.test(rawText)) return null;

    /* responseType không phải rỗng/`text` thì chỉ ghi lại request, không theo dõi phản hồi (do đó không cần tạo stream và lắng nghe) */
    let responseType = '';
    try { responseType = xhr.responseType || ''; } catch (e) { responseType = ''; }
    const trackReply = (responseType === '' || responseType === 'text');
    if (!trackReply) {
        return {
            method: meta.method,
            url: requestUrl,
            body: bodyDescriptor,
            trackReply: false,
            responsePromise: null,
            discard: () => { /* Chỉ ghi lại request, không cần dọn dẹp bộ đệm */ },
            context,
            requestStartedAt,
        };
    }

    /* Bộ đệm thụ động: Hàng đợi ReadableStream tiếp nhận phần gia tăng của progress, trước khi phán đoán thông qua thì không có bất kỳ bên đọc nào */
    let controller = null;
    const stream = new ReadableStream({ start(c) { controller = c; } });
    const encoder = new TextEncoder();
    let fedLength = 0;     /* Số ký tự responseText đã nạp vào (chỉ giữ lại phần gia tăng, không tích lũy nguyên đoạn) */
    let stopped = false;   /* Phán đoán không thông qua/stream đã báo lỗi: Dừng tiếp tục nạp */
    let settled = false;   /* Phản hồi đã đến trạng thái cuối (một trong các trạng thái load/error/abort/timeout) */
    let resolveResponse = null;
    let rejectResponse = null;
    const responsePromise = new Promise((resolve, reject) => {
        resolveResponse = resolve;
        rejectResponse = reject;
    });
    /* Khi phán đoán không thông qua (chưa đăng ký theo dõi phản hồi) sẽ không tạo ra Promise reject chưa được xử lý */
    responsePromise.catch(() => { /* Im lặng */ });

    /* Nạp gia tăng (chỉ lấy một đoạn mới tăng thêm lần này) */
    function feed(fullText) {
        if (stopped || typeof fullText !== 'string') return;
        const delta = fullText.slice(fedLength);
        if (!delta) return;
        fedLength = fullText.length;
        try { controller.enqueue(encoder.encode(delta)); } catch (e) { stopped = true; }
    }
    /* Lỗi mạng/hủy bỏ/quá hạn: Ánh xạ tới nhánh thất bại hiện có (hủy bỏ dùng tên AbortError, đi theo nhánh "người dùng hủy bỏ" sẵn có) */
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
        /* status 0 (bị từ chối do CORS/lỗi mạng)... không thuộc phạm vi 200–599 sẽ xử lý theo dạng lỗi mạng, không tạo Response tổng hợp */
        if (status < 200 || status > 599) {
            fail(new Error('network error'));
            return;
        }
        let response = null;
        try {
            const init = { status, statusText: xhr.statusText || '' };
            const contentType = xhr.getResponseHeader && xhr.getResponseHeader('content-type');
            if (contentType) init.headers = { 'content-type': contentType };
            /* 204/205/304 là trạng thái không có body: Bắt buộc tạo mà không mang body */
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
        body: bodyDescriptor,
        trackReply: true,
        responsePromise,
        context,
        requestStartedAt,
        /* Phán đoán không thông qua: Loại bỏ bộ đệm thụ động (không phân bổ captureId, không chiếm suất chờ xử lý phản hồi) */
        discard: () => {
            stopped = true;
            try { controller.error(new Error('discarded')); } catch (e) { /* ignore */ }
        },
    };
}

/* Lập kế hoạch và xử lý một request XHR đã theo dõi ngầm.
   @param {object} capture Handle trả về của beginXhrCapture */
async function processCapturedXhr(capture) {
    let captureId = null;
    try {
        const plan = await planCapturedRequest({
            requestUrl: capture.url,
            method: capture.method,
            body: capture.body,
            context: capture.context,
            requestStartedAt: capture.requestStartedAt,
        });
        if (!plan) {
            capture.discard();
            return null;
        }
        /* Sau khi kế hoạch được xác lập, phân bổ mã bắt giữ và đăng ký theo dõi phản hồi. */
        captureId = capture.trackReply ? ++captureSeq : null;
        plan.captureId = captureId;
        if (captureId != null) {
            captureResponseForRequest(capture.responsePromise, plan.effectiveUrl, captureId);
        }
        return await processCapturePlan(plan, captureId, null, capture.requestStartedAt);
    } catch (e) {
        if (captureId != null) abortPendingReply(captureId);
        capture.discard();
        return null;
    }
}

/* Cài đặt hàm bọc XHR cho một realm đơn lẻ (dùng chung cho cửa sổ chính và iframe cùng nguồn): Chỉ theo dõi ngầm, tuyệt đối không làm phiền lệnh gọi gốc.
   open ghi lại method và địa chỉ (địa chỉ tương đối được phân tích thành tuyệt đối theo location của chính realm đó), send bắt giữ body dạng chuỗi;
   Metadata của instance lưu bằng WeakMap, open lặp lại sẽ ghi đè. Đã cài và chưa bị thay thế thì bỏ qua;
   Sau khi iframe reload (tạo lại realm) hoặc script bên trong thay thế prototype, listener load sẽ bọc lại.
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
        } catch (e) { /* Bỏ qua exception khi bắt giữ, open gốc vẫn gọi bình thường */ }
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
                /* Việc phán đoán và ghi nhật ký được đưa vào giai đoạn bất đồng bộ sau khi request phát đi, không chặn send */
                Promise.resolve().then(() => processCapturedXhr(capture))
                    .catch(() => { try { capture.discard(); } catch (e) { /* ignore */ } });
            }
            return result;
        } catch (err) {
            /* Bản thân send gốc tự ném lỗi: Loại bỏ lần bắt giữ này và ném ra nguyên trạng, không thay đổi ngữ nghĩa lỗi */
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

/* ── Theo dõi và phân tích phản hồi ──────────────────────── */

/* Thời lượng timeout phản hồi đang có hiệu lực (khi có ghi đè debug thì dùng giá trị ghi đè; nếu không sẽ đọc cài đặt, 0 biểu thị không đặt timeout)
   @returns {number} Mili giây; 0 biểu thị vô hiệu hóa timeout */
function getReplyTimeoutMs() {
    return replyTimeoutOverrideMs != null ? replyTimeoutOverrideMs : replyTimeoutSec * 1000;
}

/* Văn bản hiển thị nhãn trạng thái (tiếng Anh, viết hoa chữ cái đầu)
   @param {string} status 'succeed' | 'fail' | 'timeout'
   @returns {string} */
function getReplyStatusLabel(status) {
    if (status === 'simulated') return 'Simulated';
    if (status === 'fail') return 'Fail';
    if (status === 'timeout') return 'Timeout';
    return 'Succeed';
}

/* Lấy giá trị trạng thái của "nhãn trạng thái" trên thanh tiêu đề bản ghi: Bản ghi mô phỏng cố định ở simulated, còn lại lấy trạng thái phản hồi thực tế
   @param {object} record @returns {string|null} */
function getRecordStatus(record) {
    if (record && record.simulated) return 'simulated';
    return (record && record.reply && record.reply.status) || null;
}

/* Bộ đệm chiều rộng slot nhãn trạng thái phản hồi (px): Do getReplyStatusMaxWidth đo thực tế một lần, dùng chung cho placeholder/nhãn */
let replyStatusMaxWidth = null;

/* Đo thực tế chiều rộng tối đa (px) của ba nhãn trạng thái dưới phông chữ hiện tại, ghi vào --rlog-status-w, dùng chung chiều rộng slot cho placeholder chờ đợi,
   tránh phản hồi đến làm giật bố cục. Probe gắn vào body và kế thừa rõ ràng phông chữ của bảng điều khiển, chỉ khi đo ra chiều rộng hợp lệ mới cache.
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
    probe.style.minWidth = '0px'; /* Ghi đè var() trong quy tắc class, tránh phụ thuộc vòng khi đo lường */
        probe.style.pointerEvents = 'none';
        probe.style.whiteSpace = 'nowrap';
        let max = 0;
        for (const status of ['succeed', 'fail', 'timeout']) {
            probe.textContent = getReplyStatusLabel(status);
            /* Gắn vào Shadow Root để đo lường, style nhất quán với bảng điều khiển và không bị ảnh hưởng bởi theme của bên thứ ba */
            if (panelShadowRoot) panelShadowRoot.appendChild(probe);
            max = Math.max(max, probe.offsetWidth);
            probe.remove();
        }
    /* Chỉ cache khi đo ra chiều rộng hợp lệ: Trong trường hợp bất thường body bị ẩn sẽ đo ra 0, cache 0 sẽ khiến placeholder mất hiệu lực vĩnh viễn */
    if (max > 0) replyStatusMaxWidth = max;
    return max;
}

/* Tooltip hover của nhãn trạng thái: Chỉ hiển thị lý do động + thời gian kết thúc (chữ trạng thái trên nhãn đã có); thành công hiển thị thống nhất là Succeed
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
        if (reason === 'timeout') reason = 'Timeout'; /* Lý do timeout đồng nghĩa với trạng thái, giữ nhất quán viết hoa thường với nhãn */
    }
    return `${reason} · ${reply.time || ''}`;
}

/* Thời lượng hiệu năng hiển thị thống nhất bằng giây: Chữ đầu ngắn giữ lại hai chữ số thập phân, thời gian tiêu tốn thông thường giữ lại một chữ số, thời gian dài không hiển thị số thập phân thừa */
function formatResponseDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return RESPONSE_META_DASH;
    const seconds = ms / 1000;
    if (seconds < 1) return `${seconds.toFixed(2)}s`;
    if (seconds < 100) return `${seconds.toFixed(1)}s`;
    return `${Math.round(seconds)}s`;
}

/* Mô tả hover chỉ hiển thị thời điểm hoàn thành, không kèm ngày; không lấy được thời gian hợp lệ thì hiển thị dấu gạch ngang */
function formatResponseClock(time) {
    const match = String(time || '').match(/(\d{2}:\d{2}:\d{2})$/);
    return match ? match[1] : RESPONSE_META_DASH;
}

/* Lấy trường gốc theo đường dẫn cố định; chỉ đọc vị trí trúng quy tắc whitelist, không duyệt hoặc lưu toàn bộ response. */
function getResponseMetaPathValue(root, path) {
    let current = root;
    for (const part of path) {
        if (current == null || typeof current !== 'object') return undefined;
        current = current[part];
    }
    return current;
}

/* null, thiếu và chuỗi rỗng không tính là giá trị hợp lệ; số 0, false, object và mảng vẫn giữ nguyên giá trị gốc. */
function isValidResponseMetaValue(value) {
    if (value == null) return false;
    if (typeof value === 'string') return value.length > 0;
    return true;
}

/* Thu thập các trường whitelist từ bất kỳ JSON phản hồi nào đã phân tích. Giá trị không rỗng đến sau trên cùng một đường dẫn sẽ ghi đè giá trị trước,
   các đường dẫn khác nhau luôn được lưu riêng biệt; chunk trung gian và chunk cuối cùng của stream gọi độc lập, không vì chunk cuối cùng thiếu trường mà mất giá trị. */
function collectResponseMetaFromJson(chunk, captureId) {
    const entry = pendingReplies.get(captureId);
    if (!entry || entry.finished || !chunk || typeof chunk !== 'object') return;
    if (!Array.isArray(entry.upstreamMeta)) entry.upstreamMeta = [];
    if (!(entry.upstreamMetaByPath instanceof Map)) entry.upstreamMetaByPath = new Map();

    for (const rule of RESPONSE_META_FIELD_RULES) {
        const value = getResponseMetaPathValue(chunk, rule.path);
        if (!isValidResponseMetaValue(value)) continue;
        const path = rule.path.map((part) => typeof part === 'number' ? `[${part}]` : part)
            .join('.')
            .replace(/\.\[/g, '[');
        const existing = entry.upstreamMetaByPath.get(path);
        if (existing) {
            existing.value = value;
            existing.valueType = Array.isArray(value) ? 'array' : typeof value;
            continue;
        }
        const field = {
            key: rule.key,
            path,
            value,
            valueType: Array.isArray(value) ? 'array' : typeof value,
            order: rule.order,
        };
        entry.upstreamMetaByPath.set(path, field);
        entry.upstreamMeta.push(field);
    }
}

/* Chỉ số hiệu năng trên dòng tiêu đề Response: Không phải stream sẽ không tính chữ đầu và TPS, thất bại/hủy bỏ cũng không tính TPS */
function getReplyPerformanceValues(msg) {
    if (!msg || msg.simulated) {
        return { firstToken: RESPONSE_META_DASH, tps: RESPONSE_META_DASH, elapsed: RESPONSE_META_DASH };
    }
    const hasTtft = msg.streaming === true
        && Number.isFinite(msg.ttftMs)
        && msg.ttftMs >= 0;
    const hasElapsed = Number.isFinite(msg.elapsedMs) && msg.elapsedMs >= 0;
    const decodeMs = hasTtft && hasElapsed ? msg.elapsedMs - msg.ttftMs : 0;
    const canComputeTps = hasTtft
        && hasElapsed
        && msg.status === 'succeed'
        && Number.isFinite(msg.tokens)
        && msg.tokens > 0
        && decodeMs > 0;
    return {
        firstToken: hasTtft ? formatResponseDuration(msg.ttftMs) : RESPONSE_META_DASH,
        tps: canComputeTps ? (msg.tokens * 1000 / decodeMs).toFixed(1) : RESPONSE_META_DASH,
        elapsed: hasElapsed ? formatResponseDuration(msg.elapsedMs) : RESPONSE_META_DASH,
    };
}

/* Chữ chỉ số trên dòng tiêu đề Response; công tắc xem trước nội dung không còn ảnh hưởng đến vị trí này của Response */
function buildResponseMetaHtml(msg, recordIdx, msgIdx) {
    const perf = getReplyPerformanceValues(msg);
    return `<span class="rmsg-response-meta">`
        + `<button type="button" class="rmsg-response-info" data-record="${recordIdx}" data-msg="${msgIdx}" title="Xem chi tiết phản hồi" aria-label="Xem chi tiết phản hồi" aria-expanded="false" aria-controls="rlog-response-meta-tip">ⓘ</button>`
        + `<span class="rmsg-response-metrics">Chữ đầu ${perf.firstToken} · TPS ${perf.tps} · Thời gian ${perf.elapsed}</span>`
        + `</span>`;
}

/* Ghép nối nội dung hiển thị của phản hồi: Phần suy nghĩ được bọc bằng <think>, cách một dòng trống rồi nối tiếp chính văn
   @param {object} replyData { reasoning, content } @returns {string} */
function buildReplyContent(replyData) {
    const reasoning = (replyData.reasoning || '').trim();
    const content = (replyData.content || '').trim();
    const parts = [];
    if (reasoning) parts.push(`<think>\n${reasoning}\n</think>`);
    if (content) parts.push(content);
    return parts.join('\n\n');
}

/* Nối thêm văn bản vào khu vực tích lũy chính văn/suy nghĩ: Văn bản mới là tiền tố của văn bản đã tích lũy và dài hơn → Thay thế (dạng tích lũy như Gemini...),
   ngược lại thì nối thêm (dạng gia tăng như OpenAI/Anthropic); khối trùng lặp hoàn toàn giống nhau coi như không có phần mới, bỏ qua.
   @param {object} entry @param {string} text @param {boolean} isReasoning */
function appendReplyText(entry, text, isReasoning) {
    if (!text) return;
    const key = isReasoning ? 'reasoning' : 'content';
    const acc = entry[key] || '';
    let changed = false;
    if (!acc) {
        entry[key] = text; /* Đoạn đầu ghi trực tiếp */
        changed = true;
    } else if (text.startsWith(acc) && text.length > acc.length) {
        entry[key] = text; /* Dạng tích lũy (Gemini...): Thay thế toàn bộ */
        changed = true;
    } else if (!text.startsWith(acc)) {
        entry[key] = acc + text; /* Dạng gia tăng: Nối thêm */
        changed = true;
    }
    /* text === acc (trùng lặp bằng độ dài) coi như không có phần mới, bỏ qua */
    if (changed && entry.firstTokenAt == null) entry.firstTokenAt = Date.now();
}

/* Lấy đối tượng tạm thời của lệnh gọi công cụ theo index nội bộ của giao thức; thứ tự chèn của Map chính là thứ tự mục TOOL cuối cùng. */
function ensureReplyToolCall(entry, key) {
    if (!(entry.toolCalls instanceof Map)) entry.toolCalls = new Map();
    let call = entry.toolCalls.get(key);
    if (!call) {
        call = {
            id: '',
            name: '',
            argumentsText: '',
            argumentsValue: undefined,
        };
        entry.toolCalls.set(key, call);
    }
    return call;
}

/* Tên công cụ có thể đến đủ một lần, cũng có thể theo từng phần; giá trị hoàn chỉnh dạng tích lũy sẽ thay thế, phân đoạn trùng lặp sẽ bỏ qua. */
function appendReplyToolName(entry, call, name) {
    if (typeof name !== 'string' || !name) return;
    const current = call.name || '';
    if (!current) {
        call.name = name;
    } else if (name.startsWith(current) && name.length > current.length) {
        call.name = name;
    } else if (!current.startsWith(name) && !current.endsWith(name)) {
        call.name = current + name;
    }
    if (entry.firstTokenAt == null) entry.firstTokenAt = Date.now();
}

/* Tham số công cụ hỗ trợ phân đoạn chuỗi và snapshot đối tượng hoàn chỉnh; sau khi đối tượng đến đủ sẽ ghi đè văn bản phân đoạn cũ. */
function appendReplyToolArguments(entry, call, value) {
    if (value == null) return;
    if (typeof value === 'object') {
        call.argumentsValue = value;
        call.argumentsText = '';
    } else if (typeof value === 'string' && value) {
        const current = call.argumentsText || '';
        call.argumentsValue = undefined;
        if (!current) {
            call.argumentsText = value;
        } else if (value.startsWith(current) && value.length > current.length) {
            call.argumentsText = value;
        } else if (!current.startsWith(value) && !current.endsWith(value)) {
            call.argumentsText = current + value;
        }
    } else {
        return;
    }
    if (entry.firstTokenAt == null) entry.firstTokenAt = Date.now();
}

/* Đọc tool_calls hiện tại hoặc function_call kế thừa của OpenAI; các lệnh gọi song song có cùng index được tích lũy riêng biệt. */
function collectOpenAiReplyToolCalls(entry, payload) {
    if (!payload || typeof payload !== 'object') return;
    if (payload.tool_calls != null) {
        const calls = Array.isArray(payload.tool_calls) ? payload.tool_calls : [payload.tool_calls];
        calls.forEach((item, fallbackIndex) => {
            if (!item || typeof item !== 'object') return;
            const callIndex = Number.isInteger(item.index) ? item.index : fallbackIndex;
            const call = ensureReplyToolCall(entry, `openai:${callIndex}`);
            if (typeof item.id === 'string' && item.id) call.id = item.id;
            const fn = item.function && typeof item.function === 'object' ? item.function : null;
            if (fn) {
                appendReplyToolName(entry, call, fn.name);
                appendReplyToolArguments(entry, call, fn.arguments);
            }
        });
    }

    const legacy = payload.function_call;
    if (legacy && typeof legacy === 'object') {
        const call = ensureReplyToolCall(entry, 'legacy:0');
        appendReplyToolName(entry, call, legacy.name);
        appendReplyToolArguments(entry, call, legacy.arguments);
    }
}

/* Phán đoán xem đối tượng công cụ tạm thời đã có dữ liệu hiển thị được hay chưa, bỏ qua vỏ rỗng chỉ có index hoặc ID. */
function hasReplyToolOutput(replyData) {
    if (!replyData || !(replyData.toolCalls instanceof Map)) return false;
    for (const call of replyData.toolCalls.values()) {
        if (call.name
            || call.argumentsValue !== undefined
            || (typeof call.argumentsText === 'string' && call.argumentsText.length > 0)) {
            return true;
        }
    }
    return false;
}

/* Chuyển đổi đối tượng tạm thời của lệnh gọi công cụ thành cấu trúc mục tin nhắn hiện có; index giao thức và đối tượng phân tích kết thúc tại đây. */
function buildReplyToolEntries(replyData) {
    if (!replyData || !(replyData.toolCalls instanceof Map)) return [];
    const entries = [];
    for (const call of replyData.toolCalls.values()) {
        const hasArguments = call.argumentsValue !== undefined
            || (typeof call.argumentsText === 'string' && call.argumentsText.length > 0);
        if (!call.name && !hasArguments) continue;

        let argumentsText = '';
        if (call.argumentsValue !== undefined) {
            try {
                argumentsText = JSON.stringify(call.argumentsValue, null, 2);
            } catch (e) {
                argumentsText = String(call.argumentsValue);
            }
        } else if (call.argumentsText) {
            try {
                argumentsText = JSON.stringify(JSON.parse(call.argumentsText), null, 2);
            } catch (e) {
                argumentsText = call.argumentsText;
            }
        }

        entries.push({
            role: 'tool',
            content: argumentsText,
            tokens: 0,
            tokenPrecise: false,
            collapsed: true,
            tokensIncludedInResponse: true,
            ...(call.name ? { toolName: call.name } : {}),
            ...(call.id ? { toolCallId: call.id } : {}),
        });
    }
    return entries;
}

/* Trích xuất phần gia tăng của chính văn/suy nghĩ từ một chunk JSON đơn lẻ (tương thích OpenAI delta/message/text + reasoning_content,
   mảng delta.text/delta.thinking/content của Anthropic, candidates[0].content.parts của Gemini;
   đồng thời tích lũy các lệnh gọi công cụ tiêu chuẩn, lệnh gọi công cụ chỉ chuyển thành mục TOOL ở trạng thái cuối)
   @param {object} chunk @param {number} captureId */
function extractReplyFromChunk(chunk, captureId) {
    const entry = pendingReplies.get(captureId);
    if (!entry || entry.finished) return;
    if (!chunk || typeof chunk !== 'object') return;

    /* Tương thích OpenAI (delta dạng stream / trọn gói message / text) */
    if (Array.isArray(chunk.choices) && chunk.choices[0]) {
        const c0 = chunk.choices[0];
        const delta = c0 && typeof c0.delta === 'object' ? c0.delta : null;
        if (delta) {
            if (typeof delta.reasoning_content === 'string') appendReplyText(entry, delta.reasoning_content, true);
            if (typeof delta.reasoning === 'string') appendReplyText(entry, delta.reasoning, true);
            if (typeof delta.content === 'string') appendReplyText(entry, delta.content, false);
            if (typeof delta.text === 'string') appendReplyText(entry, delta.text, false);
            collectOpenAiReplyToolCalls(entry, delta);
        }
        const msg = c0 && typeof c0.message === 'object' ? c0.message : null;
        if (msg) {
            if (typeof msg.reasoning_content === 'string') appendReplyText(entry, msg.reasoning_content, true);
            if (typeof msg.reasoning === 'string') appendReplyText(entry, msg.reasoning, true);
            if (typeof msg.content === 'string') appendReplyText(entry, msg.content, false);
            collectOpenAiReplyToolCalls(entry, msg);
        }
        if (typeof c0.text === 'string') appendReplyText(entry, c0.text, false);
        return;
    }

    /* Điểm bắt đầu của khối nội dung lệnh gọi công cụ Anthropic. */
    if (chunk.content_block && typeof chunk.content_block === 'object'
        && chunk.content_block.type === 'tool_use') {
        const blockIndex = Number.isInteger(chunk.index) ? chunk.index : 0;
        const call = ensureReplyToolCall(entry, `anthropic:${blockIndex}`);
        if (typeof chunk.content_block.id === 'string' && chunk.content_block.id) {
            call.id = chunk.content_block.id;
        }
        appendReplyToolName(entry, call, chunk.content_block.name);
        appendReplyToolArguments(entry, call, chunk.content_block.input);
    }

    /* Stream Anthropic (delta.thinking / delta.text / input_json_delta) */
    if (chunk.delta && typeof chunk.delta === 'object') {
        if (typeof chunk.delta.thinking === 'string') appendReplyText(entry, chunk.delta.thinking, true);
        if (typeof chunk.delta.text === 'string') appendReplyText(entry, chunk.delta.text, false);
        if (chunk.delta.type === 'input_json_delta' && typeof chunk.delta.partial_json === 'string') {
            const blockIndex = Number.isInteger(chunk.index) ? chunk.index : 0;
            const call = ensureReplyToolCall(entry, `anthropic:${blockIndex}`);
            appendReplyToolArguments(entry, call, chunk.delta.partial_json);
        }
        return;
    }

    /* Gemini (candidates[0].content.parts) */
    if (Array.isArray(chunk.candidates) && chunk.candidates[0]) {
        const parts = chunk.candidates[0].content && chunk.candidates[0].content.parts;
        if (Array.isArray(parts)) {
            parts.forEach((part, partIndex) => {
                if (part && typeof part.text === 'string' && part.text.length > 0) {
                    appendReplyText(entry, part.text, !!part.thought);
                }
                if (part && part.functionCall && typeof part.functionCall === 'object') {
                    const call = ensureReplyToolCall(entry, `gemini:0:${partIndex}`);
                    appendReplyToolName(entry, call, part.functionCall.name);
                    appendReplyToolArguments(entry, call, part.functionCall.args);
                }
            });
        }
        return;
    }

    /* Non-stream Anthropic (mảng content) */
    if (Array.isArray(chunk.content)) {
        chunk.content.forEach((part, partIndex) => {
            if (!part || typeof part !== 'object') return;
            if (part.type === 'text' && typeof part.text === 'string') appendReplyText(entry, part.text, false);
            if (part.type === 'thinking' && typeof part.thinking === 'string') appendReplyText(entry, part.thinking, true);
            if (part.type === 'tool_use') {
                const call = ensureReplyToolCall(entry, `anthropic:${partIndex}`);
                if (typeof part.id === 'string' && part.id) call.id = part.id;
                appendReplyToolName(entry, call, part.name);
                appendReplyToolArguments(entry, call, part.input);
            }
        });
    }
}

/* Phân tích một đoạn văn bản SSE (các sự kiện phân tách bằng nhiều dòng trống), trích xuất phần gia tăng theo từng sự kiện, tương thích dòng data: và [DONE]
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
        collectResponseMetaFromJson(chunk, captureId);
        if (chunk && chunk.error) {
            finalizeReply(captureId, 'fail', 'api error: ' + (chunk.error.message || chunk.error.code || 'unknown'));
            return;
        }
        extractReplyFromChunk(chunk, captureId);
    }
}

/* Đọc gia tăng body phản hồi một cách hợp nhất (không phụ thuộc vào Content-Type): Xuất hiện dòng data: liền phân tích theo SSE (tương thích trường hợp proxy đánh dấu phản hồi dạng stream thành
   application/json); nếu không sẽ đợi sau khi kết thúc stream mới phân tích toàn bộ JSON/văn bản. Khi hủy bỏ/bất thường, chế độ SSE giữ lại nội dung đã nhận,
   JSON không có nội dung khả dụng thì ghi nhận phản hồi rỗng. Đọc bản clone, không ảnh hưởng đến ST và các tiện ích khác.
   @param {Response} clone @param {number} captureId @param {string|null} hintMode */
function readResponseBody(clone, captureId, hintMode = null) {
    if (!clone || !clone.body || typeof clone.body.getReader !== 'function') {
        finalizeReply(captureId, 'fail', 'empty body');
        return;
    }
    const reader = clone.body.getReader();
    const entry = pendingReplies.get(captureId);
    if (entry) {
        entry.reader = reader;
        if (hintMode === 'sse') entry.streaming = true;
    }
    const decoder = new TextDecoder();
    let buffer = '';
    let mode = hintMode; /* null=chưa xác định, 'sse', 'json' */
    let sawBytes = false;

    function finalizeDone() {
        const cur = pendingReplies.get(captureId);
        if (!cur || cur.finished) return;
        if (mode === 'sse') {
            /* Xử lý sự kiện cuối cùng không kết thúc bằng dòng trống */
            if (buffer.trim()) processSseText(buffer, captureId);
        } else {
            const text = buffer.trim();
            if (text) {
                let data = null;
                try { data = JSON.parse(text); } catch (e) { data = null; }
                if (data) {
                    collectResponseMetaFromJson(data, captureId);
                    if (data.error) {
                        finalizeReply(captureId, 'fail', 'api error: ' + (data.error.message || data.error.code || 'unknown'));
                        return;
                    }
                    extractReplyFromChunk(data, captureId);
                } else if (!/^data:|\ndata:/.test(text)) {
                    /* Text completion thuần túy...: Lấy toàn bộ đoạn làm chính văn */
                    appendReplyText(cur, text, false);
                }
            }
            if (sawBytes) cur.streaming = false;
        }
        finalizeReply(captureId, 'succeed', '');
    }

    function pump() {
        reader.read().then(({ done, value }) => {
            const cur = pendingReplies.get(captureId);
            if (!cur || cur.finished) return;
            if (done) {
                const tail = decoder.decode();
                if (tail) {
                    buffer += tail;
                    cur.rawResponseText += tail;
                }
                finalizeDone();
                return;
            }
            sawBytes = true;
            const decoded = decoder.decode(value, { stream: true });
            buffer += decoded;
            cur.rawResponseText += decoded;
            /* Khi chưa xác định chế độ thì nhận diện theo nội dung: Xuất hiện dòng data: liền coi là SSE */
            if (!mode && /^data:|\ndata:/.test(buffer)) {
                mode = 'sse';
                const current = pendingReplies.get(captureId);
                if (current) current.streaming = true;
            }
            if (mode === 'sse') {
                const parts = buffer.split(/\r\n\r\n|\r\r|\n\n/);
                buffer = parts.pop();
                processSseText(parts.join('\n\n'), captureId);
                /* Các luồng như chunk lỗi có thể đã finalize, lúc này dừng tiếp tục đọc */
                const after = pendingReplies.get(captureId);
                if (after && !after.finished) pump();
            } else {
                pump();
            }
        }).catch(() => {
            /* Stream bị hủy bỏ/bất thường: Chế độ SSE giữ lại nội dung đã phân tích (bao gồm nửa đoạn suy nghĩ); chế độ JSON chưa có nội dung khả dụng */
            const cur = pendingReplies.get(captureId);
            if (!cur || cur.finished) return;
            if (mode === 'sse' && buffer.trim()) {
                processSseText(buffer, captureId);
            }
            if (sawBytes) cur.streaming = mode === 'sse';
            finalizeReply(captureId, 'fail', 'stream aborted');
        });
    }
    pump();
}

/* Trích xuất thông báo lỗi khả dụng đầu tiên từ đối tượng lỗi JSON (duyệt tuần tự theo các trường quy ước thông thường của interface).
   @param {object} data JSON phản hồi lỗi đã phân tích
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

/* Đọc body phản hồi phi 2xx để trích xuất lỗi thực tế (body phản hồi chỉ đọc được một lần, bắt buộc đọc clone); bất kỳ thất bại nào đều fallback về baseReason
   @param {Response} response @param {number} captureId @param {string} baseReason */
function readErrorResponseBody(response, captureId, baseReason) {
    let clone = null;
    try {
        /* clone bắt buộc phải gọi đồng bộ (trước khi phản hồi gốc bị ST... tiêu thụ), nếu không body đã sử dụng sẽ ném lỗi */
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
    if (entry) entry.reader = reader; /* Giao cho abortPendingReply giải phóng thống nhất */
    const decoder = new TextDecoder();
    let text = '';
    let reserveFullReason = true;

    function done() {
        let reason = baseReason;
        const trimmed = text.trim();
        if (trimmed) {
            let data = null;
            try { data = JSON.parse(trimmed); } catch (e) { data = null; }
            if (data) collectResponseMetaFromJson(data, captureId);
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
                const tail = decoder.decode();
                if (tail) {
                    cur.rawResponseText += tail;
                    if (reserveFullReason) text += tail;
                }
                done();
                return;
            }
            const decoded = decoder.decode(value, { stream: true });
            cur.rawResponseText += decoded;
            if (reserveFullReason) {
                text += decoded;
                if (text.length >= MAX_ERROR_BODY_BYTES) {
                    /* Chỉ giới hạn lượng phân tích lý do lỗi, phản hồi gốc vẫn tiếp tục được lưu trữ trọn vẹn */
                    text = text.slice(0, MAX_ERROR_BODY_BYTES);
                    reserveFullReason = false;
                }
            }
            pump();
        }).catch(() => {
            finalizeReply(captureId, 'fail', baseReason);
        });
    }
    pump();
}

/* Gắn theo dõi phản hồi cho request; trả về việc có thực sự thiết lập theo dõi hay không. */
function captureResponseForRequest(fetchPromise, requestUrl, captureId) {
    if (!isPotentialGenerationUrl(requestUrl)) return false;
    if (pendingReplies.has(captureId)) return true;

    /* Khu vực chờ xử lý đạt giới hạn trên động: Loại bỏ theo dõi cũ nhất (giải phóng reader của nó), tránh phình bộ nhớ */
    const pendingLimit = getPendingReplyLimit();
    while (pendingReplies.size >= pendingLimit) {
        const oldestKey = pendingReplies.keys().next().value;
        if (oldestKey == null) break;
        abortPendingReply(oldestKey);
    }

    const entry = {
        startTime: Date.now(),
        firstTokenAt: null,
        streaming: null,
        elapsedMs: null,
        httpStatus: null,
        upstreamMeta: [],
        upstreamMetaByPath: new Map(),
        rawResponseText: '',
        toolCalls: new Map(),
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

    /* Fallback timeout: Đến giờ chưa kết thúc → Dừng theo dõi và đánh dấu Timeout (giữ lại nội dung đã tích lũy); 0 không tạo timer */
    const replyTimeoutMs = getReplyTimeoutMs();
    if (replyTimeoutMs > 0) {
        entry.timer = setTimeout(() => {
            finalizeReply(captureId, 'timeout', 'timeout');
        }, replyTimeoutMs);
    }

    fetchPromise.then(response => {
        try {
            if (!response || !response.ok) {
                if (response) {
                    const entry = pendingReplies.get(captureId);
                    if (entry && Number.isInteger(response.status) && response.status > 0) {
                        entry.httpStatus = response.status;
                    }
                    /* Phi 2xx: Cố gắng hết sức đọc body lỗi để trích xuất lỗi thực tế, không đọc được thì fallback về mã trạng thái */
                    readErrorResponseBody(response, captureId, `HTTP ${response.status}`);
                } else {
                    finalizeReply(captureId, 'fail', 'no response');
                }
                return;
            }
            /* clone bắt buộc phải gọi đồng bộ, nếu không body đã sử dụng sẽ ném lỗi */
            const clone = response.clone();
            const contentType = (response.headers.get('content-type') || '').toLowerCase();
            /* Content-Type chỉ dùng làm gợi ý: Đọc gia tăng thống nhất, dựa vào chính văn nhận diện SSE, tránh trường hợp "proxy gắn nhãn phản hồi dạng stream
               là application/json" bị hủy bỏ dẫn đến mất nội dung đã nhận */
            readResponseBody(clone, captureId, contentType.includes('text/event-stream') ? 'sse' : null);
        } catch (e) {
            finalizeReply(captureId, 'fail', 'response clone failed');
        }
    }, err => {
        /* Lỗi mạng / Người dùng hủy bỏ (AbortError) */
        const reason = (err && err.name === 'AbortError') ? 'aborted' : 'network error';
        finalizeReply(captureId, 'fail', reason);
    });
    return true;
}

/* Trạng thái cuối của theo dõi phản hồi: Đánh dấu hoàn thành, giải phóng reader, gắn vào bản ghi hiện có; bản ghi chưa tạo xong thì ở lại khu vực chờ xử lý (giới hạn 60s)
   @param {number} captureId @param {string} status @param {string} failReason */
function finalizeReply(captureId, status, failReason) {
    const entry = pendingReplies.get(captureId);
    if (!entry || entry.finished) return;
    entry.finished = true;
    clearTimeout(entry.timer);
    if (entry.reader) {
        try { Promise.resolve(entry.reader.cancel()).catch(() => { /* ignore */ }); } catch (e) { /* ignore */ }
    }

    /* Kết thúc bình thường nhưng chính văn rỗng/quá ngắn → Coi là thất bại (phần suy nghĩ không tính vào phán đoán độ dài); lệnh gọi công cụ thuộc về đầu ra hợp lệ. */
    if (status === 'succeed') {
        const content = (entry.content || '').trim();
        const hasToolCalls = hasReplyToolOutput(entry);
        if (!content && !hasToolCalls) {
            status = 'fail';
            failReason = 'empty reply';
        } else if (!hasToolCalls && content.length <= 10) {
            status = 'fail';
            failReason = 'reply too short';
        }
    }

    entry.status = status;
    entry.failReason = failReason || '';
    const now = new Date();
    const completedAt = now.getTime();
    entry.elapsedMs = Math.max(0, completedAt - entry.startTime);
    entry.ttftMs = entry.firstTokenAt == null ? null : Math.max(0, entry.firstTokenAt - entry.startTime);
    entry.time = formatTimestamp(now);

    const record = findRecordByCaptureId(captureId);
    if (record) {
        attachReplyToRecord(record, entry);
        pendingReplies.delete(captureId);
    } else {
        /* Bản ghi chưa tạo xong: Tạm thời giữ lại để addRecord gắn vào, quá hạn chưa gắn sẽ loại bỏ */
        entry.expireTimer = setTimeout(() => {
            pendingReplies.delete(captureId);
        }, PENDING_REPLY_KEEP_MS);
    }
}

/* Hủy bỏ một lần theo dõi phản hồi đang trên đường xử lý: Xóa timer, giải phóng reader, xóa mục chờ xử lý (không chèn bất kỳ đánh dấu nào).
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

/* Lấy ra và xóa một mục phản hồi chờ xử lý đã đến trạng thái cuối (chỉ trả về khi finished, tránh việc gắn placeholder đang xử lý thành phản hồi rỗng)
   @param {number} captureId @returns {object|null} */
function consumePendingReply(captureId) {
    const entry = pendingReplies.get(captureId);
    if (!entry || !entry.finished) return null;
    clearTimeout(entry.timer);
    clearTimeout(entry.expireTimer);
    pendingReplies.delete(captureId);
    return entry;
}

/* Tìm kiếm bản ghi theo captureId: Tra cứu cả danh sách bình thường lẫn hàng đợi tạm lưu hướng dẫn.
   @param {number} captureId
   @returns {object|null} */
function findRecordByCaptureId(captureId) {
    const found = records.find(r => r.id === captureId);
    if (found) return found;
    return tourPendingRecords.find(r => r.id === captureId) || null;
}

/* Gắn phản hồi trạng thái cuối vào bản ghi (record.reply) và tính token bất đồng bộ; Response và mục TOOL dùng chung cấu trúc tin nhắn,
   chỉ nối thêm mục đầu ra, không dựng lại danh sách, vị trí đọc và trạng thái tìm kiếm không bị ảnh hưởng.
   @param {object} record @param {object} replyData @param {boolean} [skipRender=false] */
function attachReplyToRecord(record, replyData, skipRender = false) {
    if (!record || record.reply) return;
    const outputParts = getReplyOutputParts(replyData);
    const toolEntries = buildReplyToolEntries(replyData);
    const hasOutput = outputParts.length > 0 || toolEntries.length > 0;
    /* Khi Fail/Timeout sẽ ghi lý do thất bại vào nội dung phản hồi: Nội dung đã có (như nửa đoạn phản hồi giữ lại khi hủy bỏ) sẽ cách một dòng trống ở cuối để nối thêm; */
    /* Nếu nội dung rỗng thì ghi trực tiếp lý do. Di động không có thao tác hover, làm vậy thì mở rộng/xem trước/sao chép/tìm kiếm đều có thể thấy trực tiếp lỗi. */
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
        streaming: replyData.streaming === true ? true : (replyData.streaming === false ? false : null),
        ttftMs: Number.isFinite(replyData.ttftMs) ? replyData.ttftMs : null,
        elapsedMs: Number.isFinite(replyData.elapsedMs) ? replyData.elapsedMs : null,
        httpStatus: Number.isInteger(replyData.httpStatus) ? replyData.httpStatus : null,
        upstreamMeta: Array.isArray(replyData.upstreamMeta)
            ? replyData.upstreamMeta.map((field) => ({ ...field }))
            : [],
        toolEntries,
        simulated: !!record.simulated,
        hasOutput,
    };
    record.rawResponseText = typeof replyData.rawResponseText === 'string'
        ? replyData.rawResponseText
        : '';
    /* Response cũng thuộc về chính văn tìm kiếm: Khi đã có kết quả toàn cục thì do người dùng chủ động cập nhật, không tự động nối thêm kết quả hiện tại. */
    markGlobalSearchDataChanged();
    /* Quá trình bất đồng bộ chỉ thống kê nội dung thực sự tạo ra; lý do thất bại vẫn giữ lại hiển thị trong chính văn nhưng không tính vào token */
    if (hasOutput) {
        Promise.all([
            computeTokensForReplyOutput(outputParts, record.modelName || ''),
            toolEntries.length > 0
                ? computeTokensForMessages(toolEntries, record.modelName || '')
                : Promise.resolve(),
        ]).then(([result]) => {
            const toolTokens = getTotalTokens(toolEntries);
            const toolPrecise = toolEntries.every(entry => entry.tokenPrecise === true);
            record.reply.tokens = result.tokens + toolTokens;
            record.reply.tokenPrecise = result.tokenPrecise && toolPrecise;
            updateReplyMetaInDom(record);
        }).catch(() => { /* Im lặng */ });
    }
    if (!skipRender) appendReplyToRecordDom(record);
    /* Chính văn phản hồi đã hoàn tất: Đăng ký là "Chờ hiệu chỉnh" (đợi sự kiện tin nhắn ST vào sàn chat xong sẽ thực hiện một lần thăng cấp hạn chế "Tiện ích → Native") */
    queueSourceCorrection(record);
}

/* Phản hồi đến: Nối thêm Response và mục TOOL vào cuối bản ghi và cập nhật trạng thái thanh tiêu đề, không dựng lại danh sách (vị trí đọc,
   cuộn khu vực nội dung, trạng thái tìm kiếm giữ nguyên); khi bảng điều khiển chưa mở rộng/bản ghi không nằm trong DOM/trong thời gian hướng dẫn chỉ đánh dấu dirty.
   @param {object} record */
function appendReplyToRecordDom(record) {
    panelContentDirty = true;
    if (!panelEl || !isPanelExpanded || tourActive) return;
    const listEl = panelEl.querySelector('#rlog-list');
    const recordEl = listEl ? listEl.querySelector(`.rlog-record[data-record-index="${records.indexOf(record)}"]`) : null;
    const bodyEl = recordEl ? recordEl.querySelector('.rlog-record-body') : null;
    if (!recordEl || !bodyEl) return;

    const idx = Number(recordEl.dataset.recordIndex);
    const replyMsgIdx = record.messages.length;
    const replyEntries = record.reply
        ? [record.reply, ...getRecordToolEntries(record)]
        : [];
    /* Các mục bị ẩn bởi bộ lọc vai trò sẽ không nối thêm vào DOM, sau khi khôi phục hiển thị sẽ do lần render tiếp theo tự động mang ra;
       khi chính văn của bản ghi thu gọn chưa được tạo thì chỉ cập nhật nhãn trạng thái thanh tiêu đề. */
    if (bodyEl.dataset.bodyBuilt === '1') {
        replyEntries.forEach((msg, offset) => {
            const msgIdx = replyMsgIdx + offset;
            if (!isMessageVisible(msg)) return;
            if (bodyEl.querySelector(`.rmsg-item[data-record="${idx}"][data-msg="${msgIdx}"]`)) return;
            bodyEl.insertAdjacentHTML('beforeend', buildMessageHtml(msg, idx, msgIdx));
            const itemEl = bodyEl.querySelector(`.rmsg-item[data-record="${idx}"][data-msg="${msgIdx}"]`);
            if (itemEl) bindMsgItemEvents(itemEl);
        });
    }

    /* Nhãn trạng thái phản hồi thanh tiêu đề (chỉ hiển thị khi thu gọn, khi mở rộng CSS sẽ ẩn): Chưa tồn tại thì bổ sung, đã tồn tại thì làm mới nội dung */
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

/* Sau khi tính toán token phản hồi hoàn tất sẽ cập nhật con số token và TPS của Response, không dựng lại danh sách.
   Khi bản ghi không có trong DOM (bảng điều khiển ẩn/đang trong hướng dẫn) thì lần render tiếp theo sẽ tự mang lại con số chính xác.
   @param {object} record Bản ghi mục tiêu */
function updateReplyMetaInDom(record) {
    panelContentDirty = true;
    if (!panelEl || !isPanelExpanded) return;
    const idx = records.indexOf(record);
    if (idx < 0) return;
    const listEl = panelEl.querySelector('#rlog-list');
    if (!listEl) return;
    const replyItemEl = listEl.querySelector(`.rmsg-item[data-record="${idx}"][data-msg="${record.messages.length}"]`);
    const tokensEl = replyItemEl ? replyItemEl.querySelector('.rmsg-tokens') : null;
    const reply = record.reply;
    if (tokensEl && reply) {
        tokensEl.textContent = getMessageTokenText(reply);
    }
    const metricsEl = replyItemEl ? replyItemEl.querySelector('.rmsg-response-metrics') : null;
    if (metricsEl && reply) {
        const perf = getReplyPerformanceValues(reply);
        metricsEl.textContent = `Chữ đầu ${perf.firstToken} · TPS ${perf.tps} · Thời gian ${perf.elapsed}`;
    }
    const readBtn = replyItemEl ? replyItemEl.querySelector('.rmsg-read-btn') : null;
    if (readBtn && reply) {
        readBtn.hidden = !shouldOfferMessageRead(reply);
    }
    getRecordToolEntries(record).forEach((toolEntry, toolIdx) => {
        const msgIdx = record.messages.length + 1 + toolIdx;
        const toolItemEl = listEl.querySelector(`.rmsg-item[data-record="${idx}"][data-msg="${msgIdx}"]`);
        if (!toolItemEl) return;
        const toolTokensEl = toolItemEl.querySelector('.rmsg-tokens');
        if (toolTokensEl) toolTokensEl.textContent = getMessageTokenText(toolEntry);
        const toolReadBtn = toolItemEl.querySelector('.rmsg-read-btn');
        if (toolReadBtn) toolReadBtn.hidden = !shouldOfferMessageRead(toolEntry);
    });
}

/* ── Quản lý dữ liệu ─────────────────────────── */

/* Tạo vân tay chống trùng lặp của danh sách tin nhắn: Ghép nối role + content của từng tin nhắn, dùng để phán đoán xem hai bản ghi có cùng nội dung hay không */
function computeMessagesFingerprint(messages) {
    if (!messages || messages.length === 0) return '';
    /* Chỉ dùng 50 tin nhắn đầu + 500 ký tự đầu của mỗi tin nhắn để làm vân tay, tránh tin nhắn siêu lớn làm giảm hiệu năng */
    return messages.slice(0, 50).map(m => {
        const role = m.role || '';
        const content = typeof m.content === 'string' ? m.content.slice(0, 500) : '';
        return `${role}:${content}`;
    }).join('|');
}

/* Danh sách bản ghi thông thường (chưa ghim) hiện tại */
function getNormalRecords() {
    return records.filter(r => !r.pinned);
}

/* Giới hạn trên hiệu lực của phản hồi chờ xử lý bám theo "Giới hạn trên bản ghi thông thường + Số lượng ghim hiện tại", đồng thời giữ lại bảo vệ bộ nhớ toàn cục 100 mục */
function getPendingReplyLimit() {
    const pinnedCount = records.reduce((count, record) => count + (record.pinned ? 1 : 0), 0);
    return Math.min(MAX_RECORDS + pinnedCount, MAX_PENDING_REPLIES_HARD_LIMIT);
}

/* Cắt tỉa các bản ghi thông thường cũ nhất vượt quá giới hạn trên bản ghi thông thường (tìm từ cuối mảng về trước và xóa, giữ nguyên thứ tự gốc của records).
   Bản ghi ghim được bỏ qua, không tính vào giới hạn trên (do đó records.length có thể lớn hơn MAX_RECORDS); nếu bản ghi bị xóa có phản hồi đang xử lý thì hủy theo dõi. */
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

    /* Khử trùng lặp: Nếu nội dung messages giống với bản ghi trước đó và trong vòng 500ms thì bỏ qua */
    const fingerprint = computeMessagesFingerprint(messages);
    const now = Date.now();
    if (fingerprint && fingerprint === lastRecordFingerprint && (now - lastRecordTime) < 500) {
        /* Request chưa tạo xong bản ghi thì việc theo dõi phản hồi của nó cũng bị hủy bỏ theo, tránh tồn đọng trong khu vực chờ xử lý */
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
        requestStartedAt: Number.isFinite(options.requestStartedAt) ? options.requestStartedAt : now,
        /* Phán đoán nguồn hoàn thành khi đánh chặn, lập hồ sơ phải chờ tính token, trạng thái phiên này giữa hai bước có thể đã thay đổi,
           do đó trước khi lập hồ sơ thực hiện xác nhận lần cuối đối với "Bằng chứng vị trí" (xem finalizePositionEvidenceSource) */
        source: finalizePositionEvidenceSource(source, options.sourcePass || null)
            || { type: 'plugin', label: 'Tiện ích', detail: SOURCE_PLUGIN_DEFAULT_DETAIL },
        modelName: modelName || 'Model không xác định',
        messages,
        promptTokens: getTotalTokens(messages), /* Tổng thị phần từng tin nhắn nhất quán với ngân sách prompt của ST */
        rawBody: rawBody || null,   /* Đối tượng JSON của body request gốc (khối đầu tiên trong định dạng JSON của "Xem toàn văn") */
        rawResponseText: '',         /* Chính văn phản hồi gốc; ghi vào sau khi phản hồi đến, không tham gia phân tích hiển thị */
        collapsed: true,
        pinned: false,                /* Đánh dấu ghim tạm thời: Không chiếm giới hạn trên bản ghi thông thường, làm mới trang sẽ reset */
        id: captureId != null ? captureId : null, /* Mã bắt giữ request, dùng để gắn phản hồi */
        reply: null,                 /* Nội dung phản hồi (lưu trữ độc lập; Xem toàn văn nối thêm theo thứ tự thực tế) */
    };

    /* Bản ghi mô phỏng: Không có phản hồi thực tế, trực tiếp đánh dấu một nhãn trạng thái simulated trên thanh tiêu đề */
    if (options.simulated) record.simulated = true;

    /* Phản hồi có thể đến trước khi bản ghi được tạo xong (khi finalize bản ghi vẫn chưa tạo): Chỉ khi phản hồi đã đến trạng thái cuối mới lập tức gắn vào,
       và giao cho luồng render phía sau của addRecord hiển thị (skipRender=true tránh render lặp lại);
       các mục vẫn đang xử lý được giữ lại trong khu vực chờ xử lý, do finalizeReply gắn vào sau */
    if (captureId != null) {
        const replyData = consumePendingReply(captureId);
        if (replyData) attachReplyToRecord(record, replyData, true);
    }

    /* Trong thời gian hướng dẫn: Bản ghi mới chỉ tạm lưu, không đưa vào render danh sách (tránh làm gián đoạn việc định vị DOM của các bước hướng dẫn),
       sau khi kết thúc hướng dẫn do endTour gộp và khôi phục lại; đồng thời cũng chịu ràng buộc bởi giới hạn số lượng bản ghi tối đa */
    if (tourActive) {
        tourPendingRecords.unshift(record);
        if (tourPendingRecords.length > MAX_RECORDS) {
            const evicted = tourPendingRecords.pop();
            if (evicted && evicted.id != null) abortPendingReply(evicted.id);
        }
        return record;
    }

    /* Khi bộ lọc có hiệu lực, trước tiên phán đoán xem bản ghi mới có hiển thị hay không:
       Không hiển thị thì giữ nguyên vị trí đọc hiện tại (không thu gọn bản ghi đã có, không cuộn lên đầu, không nhấp nháy), chỉ vào danh sách bình thường và làm mới bộ đếm */
    const filterActive = isFilterActive();
    const newRecordVisible = filterActive ? matchesFilter(record) : true;

    /* Khi bản ghi mới đến sẽ thu gọn tất cả bản ghi đã có (chỉ thu gọn bản thân bản ghi, không động tới trạng thái thu gọn tin nhắn bên trong từng bản ghi);
       khi bản ghi mới bị bộ lọc ẩn thì không thu gọn, tránh làm gián đoạn vị trí đang đọc */
    if (!filterActive || newRecordVisible) {
        records.forEach(r => { r.collapsed = true; });
    }

    records.unshift(record);
    pruneNormalRecords();
    /* Sau khi bản ghi mới đến chỉ thông báo tìm kiếm toàn cục có thể cập nhật; kết quả cũ và từ khóa hiện tại giữ nguyên không đổi. */
    markGlobalSearchDataChanged();

    panelContentDirty = true;
    if (panelEl && isPanelExpanded) {
        const listEl = panelEl.querySelector('#rlog-list');
        const prevScrollTop = listEl ? listEl.scrollTop : 0;
        renderPanelContent();
        if (!filterActive || newRecordVisible) {
            /* Khi bảng điều khiển mở rộng: Định vị tới chính bản thân bản ghi mới (bản ghi ghim có thể nằm phía trên nó), và nhấp nháy bản ghi mới */
            const newRecordEl = getRecordElByIndex(0);
            if (newRecordEl) {
                scrollToRecordEl(newRecordEl);
                flashTopHint(newRecordEl);
            } else {
                if (listEl) listEl.scrollTop = 0;
                flashTopHint();
            }
        } else if (listEl) {
            /* Bản ghi mới bị bộ lọc ẩn: Giữ nguyên vị trí đọc ban đầu */
            listEl.scrollTop = prevScrollTop;
        }
    }
    /* Khi bảng điều khiển ẩn sẽ để dành cuộn lên đầu sau khi mở rộng; khi bản ghi mới bị bộ lọc ẩn thì giữ nguyên vị trí ban đầu */
    if (!(panelEl && isPanelExpanded) && (!filterActive || newRecordVisible)) {
        pendingScrollToTop = true;
    }

    /* Trả về đối tượng bản ghi: Bắt giữ mô phỏng cần thực hiện tín hiệu hoàn thành ngay khoảnh khắc lập hồ sơ; khi bỏ qua việc lập hồ sơ (khử trùng lặp / công tắc tổng...) sẽ trả về undefined */
    return record;
}

function clearAllRecords() {
    /* Chỉ xóa các bản ghi thông thường; bản ghi ghim được giữ lại, và phản hồi chưa đến trạng thái cuối của nó vẫn tiếp tục được theo dõi */
    records = records.filter(r => {
        if (r.pinned) return true;
        if (r.id != null) abortPendingReply(r.id);
        return false;
    });
    panelContentDirty = true;
    if (panelEl && isPanelExpanded) {
        renderPanelContent();
    }
}

/* ── Cài đặt lưu trữ bền vững ────────────────────────── */

function createDefaultPluginSettings() {
    return {
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        masterEnabled: true,
        maxRecords: DEFAULT_MAX_RECORDS,
        replyTimeoutSec: DEFAULT_REPLY_TIMEOUT_SEC,
        replyTimeoutConfigured: false,
        tokenWarningThreshold: DEFAULT_TOKEN_WARNING_THRESHOLD,
        contentPreview: false,
        theme: 'light',
        badgeDefault: false,
        quickReplyEntry: false,
        hideExtensionEntry: false,
        followStTheme: false,
        mobileFull: false,
        clickOutside: false,
        filterPersist: false,
        minimal: false,
        filterState: createDefaultFilterState(),
        tourVersion: '',
    };
}

/* Xác thực và bổ sung cấu hình tiện ích trong ST; các trường cấp cao nhất chưa xác định sẽ do hàm lưu trữ bảo lưu riêng */
function normalizePluginSettings(raw) {
    const defaults = createDefaultPluginSettings();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return defaults;
    }

    const bool = (value, fallback) => typeof value === 'boolean' ? value : fallback;
    const requestedMax = Number(raw.maxRecords);
    const maxRecords = Number.isInteger(requestedMax)
        && requestedMax >= MIN_MAX_RECORDS
        && requestedMax <= MAX_MAX_RECORDS
        ? requestedMax
        : defaults.maxRecords;
    const rawReplyTimeout = raw.replyTimeoutSec;
    const requestedReplyTimeout = Number(rawReplyTimeout);
    let replyTimeoutSecValue = (typeof rawReplyTimeout === 'number' || typeof rawReplyTimeout === 'string')
        && String(rawReplyTimeout).trim() !== ''
        && Number.isInteger(requestedReplyTimeout)
        && requestedReplyTimeout >= MIN_REPLY_TIMEOUT_SEC
        && requestedReplyTimeout <= MAX_REPLY_TIMEOUT_SEC
        ? requestedReplyTimeout
        : defaults.replyTimeoutSec;
    const rawReplyTimeoutConfigured = raw.replyTimeoutConfigured === true;
    /* 0 là giá trị hợp lệ, nhưng phiên bản cũ/kiểm thử hủy bỏ có thể để lại số 0 không có cờ lưu rõ ràng; giá trị dạng này sẽ sửa theo mặc định 300 */
    if (replyTimeoutSecValue === MIN_REPLY_TIMEOUT_SEC && !rawReplyTimeoutConfigured) {
        replyTimeoutSecValue = defaults.replyTimeoutSec;
    }
    const rawWarningThreshold = raw.tokenWarningThreshold;
    const requestedWarningThreshold = Number(rawWarningThreshold);
    const tokenWarningThresholdValue = (typeof rawWarningThreshold === 'number'
        || typeof rawWarningThreshold === 'string')
        && String(rawWarningThreshold).trim() !== ''
        && Number.isInteger(requestedWarningThreshold)
        && requestedWarningThreshold >= MIN_TOKEN_WARNING_THRESHOLD
        && requestedWarningThreshold <= MAX_TOKEN_WARNING_THRESHOLD
        ? requestedWarningThreshold
        : defaults.tokenWarningThreshold;

    return {
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        masterEnabled: bool(raw.masterEnabled, defaults.masterEnabled),
        maxRecords,
        replyTimeoutSec: replyTimeoutSecValue,
        replyTimeoutConfigured: rawReplyTimeoutConfigured
            || replyTimeoutSecValue !== DEFAULT_REPLY_TIMEOUT_SEC,
        tokenWarningThreshold: tokenWarningThresholdValue,
        contentPreview: bool(raw.contentPreview, defaults.contentPreview),
        theme: raw.theme === 'dark' ? 'dark' : raw.theme === 'light' ? 'light' : defaults.theme,
        badgeDefault: bool(raw.badgeDefault, defaults.badgeDefault),
        quickReplyEntry: bool(raw.quickReplyEntry, defaults.quickReplyEntry),
        hideExtensionEntry: bool(raw.hideExtensionEntry, defaults.hideExtensionEntry),
        followStTheme: bool(raw.followStTheme, defaults.followStTheme),
        mobileFull: bool(raw.mobileFull, defaults.mobileFull),
        clickOutside: bool(raw.clickOutside, defaults.clickOutside),
        filterPersist: bool(raw.filterPersist, defaults.filterPersist),
        minimal: bool(raw.minimal, defaults.minimal),
        filterState: sanitizeFilterState(raw.filterState),
        tourVersion: typeof raw.tourVersion === 'string' ? raw.tourVersion : '',
    };
}

/* Đọc cấu hình trình duyệt phiên bản cũ; khi không có cấu hình máy chủ sẽ di chuyển toàn bộ, khi có cấu hình máy chủ dở dang sẽ bù các trường còn thiếu */
function readLegacyPluginSettings() {
    const defaults = createDefaultPluginSettings();
    let found = false;
    const read = (key) => {
        try {
            const value = localStorage.getItem(key);
            if (value !== null) found = true;
            return value;
        } catch (e) {
            return null;
        }
    };

    const legacyTheme = read(STORAGE_THEME_KEY);
    const legacy = {
        masterEnabled: read(STORAGE_MASTER_KEY) !== '0',
        maxRecords: parseInt(read(STORAGE_MAX_RECORDS_KEY), 10),
        contentPreview: read(STORAGE_PREVIEW_KEY) === '1',
        theme: legacyTheme === 'dark' ? 'dark' : legacyTheme === 'light' ? 'light' : defaults.theme,
        badgeDefault: read(STORAGE_PREF_BADGE_DEFAULT) === '1',
        followStTheme: read(STORAGE_PREF_FOLLOW_ST_THEME) === '1',
        mobileFull: read(STORAGE_PREF_MOBILE_FULL) === '1',
        clickOutside: read(STORAGE_PREF_CLICK_OUTSIDE) === '1',
        filterPersist: read(STORAGE_PREF_FILTER_PERSIST) === '1',
        minimal: read(STORAGE_PREF_MINIMAL) === '1',
        filterState: defaults.filterState,
        tourVersion: read(STORAGE_TOUR_VERSION_KEY) || '',
    };

    const rawFilterState = read(STORAGE_FILTER_STATE_KEY);
    if (rawFilterState !== null) {
        try { legacy.filterState = JSON.parse(rawFilterState); }
        catch (e) { legacy.filterState = defaults.filterState; }
    }

    return { found, settings: normalizePluginSettings(legacy) };
}

/* Trường máy chủ được ưu tiên; nếu cấu hình máy chủ không hoàn chỉnh, chỉ dùng giá trị trình duyệt cũ để bù các trường còn thiếu, tránh cấu hình dở dang gây mất cài đặt */
function mergePluginSettings(raw, fallback) {
    const merged = { ...(fallback || {}) };
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const key of Object.keys(raw)) {
            if (raw[key] !== undefined) merged[key] = raw[key];
        }
    }
    return normalizePluginSettings(merged);
}

/* Đồng bộ cấu hình máy chủ sang biến runtime hiện tại; mã giao diện tiếp tục dùng biến cũ, không làm thay đổi tương tác */
function applyPluginSettings(settings) {
    pluginSettings = normalizePluginSettings(settings);
    masterEnabled = pluginSettings.masterEnabled;
    MAX_RECORDS = pluginSettings.maxRecords;
    replyTimeoutSec = pluginSettings.replyTimeoutSec;
    tokenWarningThreshold = pluginSettings.tokenWarningThreshold;
    contentPreviewEnabled = pluginSettings.contentPreview;
    isLightTheme = pluginSettings.theme === 'light';
    for (const key of Object.keys(preferences)) {
        preferences[key] = !!pluginSettings[key];
    }
    /* Chỉ khi bật "Lưu trạng thái bộ lọc" mới khôi phục bộ lọc; khi tắt thì làm mới trang vẫn trở về mặc định mở toàn bộ */
    filterState = pluginSettings.filterPersist
        ? sanitizeFilterState(pluginSettings.filterState)
        : createDefaultFilterState();
}

/* Chỉ xóa các khóa trình duyệt riêng của tiện ích bản cũ, tuyệt đối không dùng localStorage.clear() */
function removeLegacyPluginStorage() {
    for (const key of LEGACY_STORAGE_KEYS) {
        try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    }
}

/* Tạo snapshot hoàn chỉnh từ các biến runtime; filterState cũng di chuyển lên máy chủ cùng với cấu hình */
function buildPluginSettingsSnapshot() {
    return normalizePluginSettings({
        ...(pluginSettings || {}),
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        masterEnabled,
        maxRecords: MAX_RECORDS,
        replyTimeoutSec,
        replyTimeoutConfigured: !!(pluginSettings && pluginSettings.replyTimeoutConfigured)
            || replyTimeoutSec !== DEFAULT_REPLY_TIMEOUT_SEC,
        tokenWarningThreshold,
        contentPreview: contentPreviewEnabled,
        theme: isLightTheme ? 'light' : 'dark',
        badgeDefault: preferences.badgeDefault,
        quickReplyEntry: preferences.quickReplyEntry,
        hideExtensionEntry: preferences.hideExtensionEntry,
        followStTheme: preferences.followStTheme,
        mobileFull: preferences.mobileFull,
        clickOutside: preferences.clickOutside,
        filterPersist: preferences.filterPersist,
        minimal: preferences.minimal,
        filterState,
        tourVersion: pluginSettings && typeof pluginSettings.tourVersion === 'string'
            ? pluginSettings.tourVersion
            : '',
    });
}

/* Ghi vào khóa extensionSettings riêng của tiện ích; giữ lại các trường chưa biết bên trong đối tượng này, không chạm vào khóa của tiện ích khác */
function persistPluginSettings() {
    const context = getStContextSafe();
    if (!context || !context.extensionSettings) return false;

    const snapshot = buildPluginSettingsSnapshot();
    const stored = context.extensionSettings[PLUGIN_KEY];
    const preserved = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    context.extensionSettings[PLUGIN_KEY] = { ...preserved, ...snapshot };
    pluginSettings = snapshot;

    if (typeof context.saveSettingsDebounced === 'function') {
        context.saveSettingsDebounced();
    }
    return true;
}

/* Tải cấu hình máy chủ; khi máy chủ đã có khóa của tiện ích sẽ lấy máy chủ làm chuẩn, ngược lại sẽ di chuyển an toàn cấu hình trình duyệt cũ */
function loadPluginSettings() {
    const context = getStContextSafe();
    const extensionSettings = context && context.extensionSettings;
    if (!extensionSettings) return false;

    const stored = extensionSettings[PLUGIN_KEY];
    const hasStoredSettings = stored && typeof stored === 'object' && !Array.isArray(stored);
    const legacy = readLegacyPluginSettings();

    if (hasStoredSettings) {
        applyPluginSettings(legacy.found
            ? mergePluginSettings(stored, legacy.settings)
            : normalizePluginSettings(stored));
        /* Các trường đã có trên máy chủ được ưu tiên, giá trị trình duyệt cũ chỉ bù trường còn thiếu */
        const needsTimeoutRepair = (stored.replyTimeoutSec === 0 || stored.replyTimeoutSec === '0')
            && stored.replyTimeoutConfigured !== true;
        const needsSave = needsTimeoutRepair
            || JSON.stringify(normalizePluginSettings(stored)) !== JSON.stringify(pluginSettings);
        if (!needsSave || persistPluginSettings()) {
            /* Sau khi cấu hình máy chủ đã hoàn chỉnh và khả dụng, mới xóa chính xác các khóa cũ riêng của tiện ích */
            removeLegacyPluginStorage();
        }
        return true;
    }

    applyPluginSettings(legacy.settings);
    /* Cả cài đặt lần đầu lẫn nâng cấp từ bản cũ đều ghi vào máy chủ tại đây; sau khi ghi thành công mới xóa khóa cũ của trình duyệt */
    if (persistPluginSettings()) {
        removeLegacyPluginStorage();
    }
    return true;
}

/* Hook dọn dẹp (clean) của ST: Xóa cấu hình tiện ích, tập hợp QR native và các khóa trình duyệt cũ được đặt tên chính xác.
   Lệnh slash thường trú chỉ tồn tại trong bộ nhớ trang hiện tại, được giải phóng thống nhất khi làm mới trang sau dọn dẹp, không cần hủy đăng ký riêng. */
async function cleanExtensionData() {
    await removeQuickReplyEntrySet().catch((error) => {
        console.warn(`[${PLUGIN_KEY}] Dọn dẹp tập hợp lối vào QR thất bại`, error);
    });
    const context = getStContextSafe();
    if (context && context.extensionSettings) {
        delete context.extensionSettings[PLUGIN_KEY];
        if (typeof context.saveSettingsDebounced === 'function') {
            context.saveSettingsDebounced();
        }
    }
    removeLegacyPluginStorage();
}

export { cleanExtensionData };

function setMasterEnabled(enabled) {
    masterEnabled = enabled;
    persistPluginSettings();
    updateMasterToggleUI();
    
    if (panelEl && isPanelExpanded) {
        /* Nếu danh sách hiện tại trống và bảng điều khiển đang hiển thị, lập tức làm mới thông điệp trống */
        if (records.length === 0) {
            panelContentDirty = true;
            renderPanelContent();
        }
    }
    
    /* Hook luôn được cài đặt (bên trong phán đoán ghi nhật ký theo masterEnabled), không gắn/gỡ theo công tắc, tránh làm hỏng chuỗi wrapper của tiện ích khác */
}

function updateMasterToggleUI() {
    if (!panelEl) return;
    
    const btn = panelEl.querySelector('#rlog-master-toggle');
    if (btn) {
        if (masterEnabled) {
            btn.classList.add('rlog-master-on');
            btn.classList.remove('rlog-master-off');
            btn.style.color = '#4caf50'; /* Màu biểu tượng khi công tắc tổng bật (inline ghi đè .rlog-master-on của CSS) */
            btn.querySelector('i').className = 'fa-solid fa-power-off';
            btn.title = 'Tiện ích bật - Đang tự động ghi nhật ký';
        } else {
            btn.classList.add('rlog-master-off');
            btn.classList.remove('rlog-master-on');
            btn.style.color = '#999'; /* Màu biểu tượng khi công tắc tổng tắt (inline ghi đè .rlog-master-off của CSS) */
            btn.querySelector('i').className = 'fa-solid fa-power-off';
            btn.title = 'Tiện ích tắt - Đã dừng ghi nhật ký';
        }
    }

    if (!masterEnabled) {
        panelEl.classList.add('rlog-disabled');
    } else {
        panelEl.classList.remove('rlog-disabled');
    }
}

/* Tải trạng thái công tắc xem trước nội dung từ cài đặt tiện ích ST (mặc định tắt)
   @returns {boolean} Có bật xem trước nội dung hay không */
function loadContentPreview() {
    return !!(pluginSettings && pluginSettings.contentPreview);
}

function saveContentPreview(enabled) {
    if (pluginSettings) pluginSettings.contentPreview = !!enabled;
    persistPluginSettings();
}

function toggleContentPreview() {
    contentPreviewEnabled = !contentPreviewEnabled;
    saveContentPreview(contentPreviewEnabled);
    updatePreviewToggleUI();
    /* Công tắc xem trước ảnh hưởng đến nội dung render của từng tin nhắn, cần dựng lại DOM */
    panelContentDirty = true;
    if (panelEl && isPanelExpanded) {
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
        toggleEl.title = 'Xem trước nội dung - Đã bật';
    } else {
        toggleEl.classList.remove('rlog-preview-on');
        toggleEl.classList.add('rlog-preview-off');
        if (iconEl) iconEl.className = 'fa-solid fa-eye-slash';
        toggleEl.title = 'Xem trước nội dung - Đã tắt';
    }
}

/* ── Cài đặt ưu tiên (Lưu trữ bền vững + Trạng thái icon) ─────────────── */

/* Tải toàn bộ cài đặt ưu tiên từ cài đặt tiện ích ST (mặc định tắt hết) */
function loadPreferences() {
    for (const key of Object.keys(preferences)) {
        preferences[key] = !!(pluginSettings && pluginSettings[key]);
    }
}

/* Đồng bộ ô nhập số trong cài đặt ưu tiên: Mở bảng điều khiển, sửa lỗi khi mất focus và sau khi submit đều quay về giá trị hợp lệ hiện tại */
function syncPrefNumberInputUI(selector, value) {
    const input = prefOverlayEl ? prefOverlayEl.querySelector(selector) : null;
    if (!input) return;
    input.value = String(value);
    input.classList.remove('rlog-pref-input-invalid');
}

function syncReplyTimeoutInputUI() {
    syncPrefNumberInputUI('#rlog-reply-timeout-input', replyTimeoutSec);
}

function syncTokenWarningThresholdInputUI() {
    syncPrefNumberInputUI('#rlog-token-warning-input', tokenWarningThreshold);
}

function syncMaxRecordsInputUI() {
    syncPrefNumberInputUI('#rlog-max-records-input', MAX_RECORDS);
}

/* Giới hạn tần suất toast khi liên tục nhập giá trị không hợp lệ, tránh việc nhấn giữ hoặc dán liên tục làm mới thông báo lặp lại */
function showPrefNumberInputNotice(text) {
    const now = Date.now();
    if (now - prefNumberNoticeAt < PREF_NUMBER_NOTICE_INTERVAL_MS) return;
    prefNumberNoticeAt = now;
    showPinToast(text);
}

/* Đọc và sửa đổi giá trị nhập số của cài đặt ưu tiên; trả về số nguyên khi hợp lệ, khôi phục giá trị hợp lệ và trả về null khi không hợp lệ */
function commitPrefIntegerInput(input, { min, max, getCurrent, unit }) {
    const raw = input.value.trim();
    const value = Number(raw);
    const valid = /^[0-9]+$/.test(raw)
        && Number.isInteger(value)
        && value >= min
        && value <= max;
    if (!valid) {
        showPrefNumberInputNotice(`Đã khôi phục về ${getCurrent()}${unit}`);
        input.value = String(getCurrent());
        input.classList.remove('rlog-pref-input-invalid');
        return null;
    }
    input.value = String(value);
    input.classList.remove('rlog-pref-input-invalid');
    return value;
}

/* Ô nhập số cài đặt ưu tiên: Chặn ký tự phi số, giữ lại bản nháp trong khi nhập; sửa giá trị không hợp lệ khi mất focus, submit khi đóng bảng điều khiển */
function bindPrefIntegerInput(input, { min, max, getCurrent, invalidText, unit }) {
    if (!input) return;

    input.addEventListener('beforeinput', (e) => {
        if (!e.inputType || !e.inputType.startsWith('insert')) return;
        const inserted = e.data != null
            ? e.data
            : (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '');
        if (!inserted) return;

        const start = input.selectionStart == null ? input.value.length : input.selectionStart;
        const end = input.selectionEnd == null ? start : input.selectionEnd;
        const nextValue = input.value.slice(0, start) + inserted + input.value.slice(end);
        const nextNumber = Number(nextValue);
        if (!/^[0-9]+$/.test(nextValue)
            || !Number.isInteger(nextNumber)
            || nextNumber > max) {
            e.preventDefault();
            showPrefNumberInputNotice(invalidText);
        }
    });

    /* Xử lý fallback cho các thao tác ghi không qua beforeinput như tự động điền của trình duyệt */
    input.addEventListener('input', () => {
        const digits = input.value.replace(/[^0-9]/g, '');
        if (digits !== input.value) {
            input.value = digits;
            showPrefNumberInputNotice(invalidText);
        }
        const value = Number(input.value);
        const invalid = input.value !== ''
            && (!Number.isInteger(value) || value > max);
        input.classList.toggle('rlog-pref-input-invalid', invalid);
        if (invalid) showPrefNumberInputNotice(invalidText);
    });

    input.addEventListener('blur', () => {
        const raw = input.value.trim();
        const value = Number(raw);
        const valid = /^[0-9]+$/.test(raw)
            && Number.isInteger(value)
            && value >= min
            && value <= max;
        if (!valid) {
            input.value = String(getCurrent());
            showPrefNumberInputNotice(`Đã khôi phục về ${getCurrent()}${unit}`);
        } else {
            input.value = String(value);
        }
        input.classList.remove('rlog-pref-input-invalid');
    });
}

/* Submit cài đặt timeout chờ phản hồi: Chỉ chấp nhận số nguyên từ 0~3600 giây; nhập không hợp lệ sẽ khôi phục giá trị hợp lệ lần trước */
function commitReplyTimeoutPreference() {
    const input = prefOverlayEl ? prefOverlayEl.querySelector('#rlog-reply-timeout-input') : null;
    if (!input) return false;
    const value = commitPrefIntegerInput(input, {
        min: MIN_REPLY_TIMEOUT_SEC,
        max: MAX_REPLY_TIMEOUT_SEC,
        getCurrent: () => replyTimeoutSec,
        unit: ' giây',
        invalidText: 'Chỉ có thể nhập số nguyên từ 0～3600 giây',
    });
    if (value == null) return false;

    if (value !== replyTimeoutSec) {
        replyTimeoutSec = value;
        if (!pluginSettings) pluginSettings = createDefaultPluginSettings();
        pluginSettings.replyTimeoutSec = replyTimeoutSec;
        pluginSettings.replyTimeoutConfigured = true;
        persistPluginSettings();
    }
    syncReplyTimeoutInputUI();
    return true;
}

/* Submit ngưỡng cảnh báo nhấp nháy Token: Chỉ chấp nhận số nguyên từ 0~1000000; 0 tắt hoàn toàn lớp cảnh báo tùy chỉnh */
function commitTokenWarningThresholdPreference() {
    const input = prefOverlayEl ? prefOverlayEl.querySelector('#rlog-token-warning-input') : null;
    if (!input) return false;
    const value = commitPrefIntegerInput(input, {
        min: MIN_TOKEN_WARNING_THRESHOLD,
        max: MAX_TOKEN_WARNING_THRESHOLD,
        getCurrent: () => tokenWarningThreshold,
        unit: ' tokens',
        invalidText: 'Ngưỡng nhắc nhở nhấp nháy chỉ có thể là số nguyên từ 0～1000000',
    });
    if (value == null) return false;

    if (value !== tokenWarningThreshold) {
        tokenWarningThreshold = value;
        if (!pluginSettings) pluginSettings = createDefaultPluginSettings();
        pluginSettings.tokenWarningThreshold = tokenWarningThreshold;
        persistPluginSettings();
        refreshTokenTierClasses();
    }
    syncTokenWarningThresholdInputUI();
    return true;
}

/* Submit giới hạn trên bản ghi: Chỉ chấp nhận số nguyên từ 10~100; giá trị hợp lệ tiếp tục dùng quy trình lưu trữ và cắt tỉa của setMaxRecords */
function commitMaxRecordsPreference() {
    const input = prefOverlayEl ? prefOverlayEl.querySelector('#rlog-max-records-input') : null;
    if (!input) return false;
    const value = commitPrefIntegerInput(input, {
        min: MIN_MAX_RECORDS,
        max: MAX_MAX_RECORDS,
        getCurrent: () => MAX_RECORDS,
        unit: ' bản ghi',
        invalidText: 'Giới hạn bản ghi chỉ có thể là số nguyên từ 10～100',
    });
    if (value == null) return false;

    if (value !== MAX_RECORDS) setMaxRecords(value);
    syncMaxRecordsInputUI();
    return true;
}

/* Lưu trữ bền vững từng cài đặt ưu tiên đơn lẻ vào cài đặt tiện ích ST */
function savePreference(key, value) {
    if (!pluginSettings) pluginSettings = createDefaultPluginSettings();
    pluginSettings[key] = !!value;
    persistPluginSettings();
}

/* Có ít nhất một tùy chọn ưu tiên đang kích hoạt hay không (dùng để chuyển đổi icon lối vào "Cài đặt ưu tiên" fa-heart ↔ fa-heart-circle-check) */
function hasActivePreference() {
    return preferences.badgeDefault || preferences.quickReplyEntry || preferences.hideExtensionEntry
        || preferences.followStTheme || preferences.mobileFull || preferences.clickOutside
        || preferences.filterPersist || preferences.minimal;
}

/* Cập nhật icon lối vào "Cài đặt ưu tiên": Bất kỳ tùy chọn nào kích hoạt → fa-heart-circle-check, tắt toàn bộ → fa-heart */
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

/* Đồng bộ trạng thái trực quan của tất cả Toggle trong lớp phủ cài đặt ưu tiên (bật/tắt + role/aria-checked) */
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

/* Chỉ khi sau khi sửa vẫn còn ít nhất một trong các lối vào menu, nút nổi hoặc QR thì mới cho phép sửa tùy chọn ưu tiên liên quan đến lối vào. */
function wouldLeaveNoEntry(nextPreferences) {
    return nextPreferences.hideExtensionEntry
        && !nextPreferences.badgeDefault
        && !nextPreferences.quickReplyEntry;
}

/* Thiết lập một tùy chọn ưu tiên nào đó: Kiểm tra ràng buộc lối vào trước, sau đó cập nhật trạng thái, lưu trữ bền vững và làm mới giao diện liên quan */
function setPreference(key, value) {
    if (!(key in preferences)) return false;
    const nextValue = !!value;
    const nextPreferences = { ...preferences, [key]: nextValue };
    if (ENTRY_PREFERENCE_KEYS.includes(key) && wouldLeaveNoEntry(nextPreferences)) {
        showPinToast('Vui lòng giữ lại ít nhất một lối vào ở trạng thái hiển thị');
        return false;
    }

    preferences[key] = nextValue;
    savePreference(key, preferences[key]);
    updatePrefButtonIcon();
    syncPrefToggleUI();
    /* Hành vi tức thì của công tắc ưu tiên: Đa số công tắc chỉ được logic tương ứng đọc cờ, một số ít cần có hiệu lực ngay sẽ xử lý theo key.
       mobileFull đồng bộ trạng thái hiện tại một lần trên di động; sau đó vẫn ưu tiên việc người dùng ghi đè phóng to thủ công, khi làm mới trang mới khởi tạo lại theo cài đặt ưu tiên. */
    if (key === 'filterPersist' && preferences.filterPersist) saveFilterState();
    if (key === 'minimal') updateMinimalClass();
    if (key === 'mobileFull') setPreferenceMobileFullBehavior();
    if (key === 'followStTheme') setPreferenceFollowStThemeBehavior();
    if (key === 'badgeDefault') setPreferenceBadgeDefaultBehavior();
    if (key === 'clickOutside') schedulePanelOutsideCloseListener();
    if (key === 'quickReplyEntry') syncQuickReplyEntry();
    if (key === 'hideExtensionEntry') syncMenuEntryVisibility();
    return true;
}

/* Đồng bộ trạng thái hiện tại một lần khi di động chuyển đổi "Mặc định toàn màn hình"; máy tính chỉ lưu cài đặt ưu tiên, không thay đổi bố cục hiện tại. */
function setPreferenceMobileFullBehavior() {
    if (!isMobileViewport()) return;
    manualFullscreenOverride = preferences.mobileFull;
    refreshMobilePanelLayoutForLayoutAction();
    syncFullscreenUI();
}

/* Hành vi tức thì sau khi chuyển đổi "Chế độ ngày đêm theo theme ST": Bật → Gắn bộ lắng nghe theme ST và đồng bộ ngay (khi bảng điều khiển đã mở thì chuyển đổi theo hiệu ứng ngày/đêm sẵn có);
   Tắt → Lưu theme hiện tại xuống bộ nhớ một lần (để ghi nhớ nó), sau đó biến đổi của ST không còn ảnh hưởng đến bảng điều khiển nữa. */
function setPreferenceFollowStThemeBehavior() {
    if (preferences.followStTheme) {
        activatePanelThemeFollow(true);
    } else {
        deactivatePanelThemeFollow();
        saveTheme(isLightTheme);
    }
}

/* Áp dụng hành vi tức thì sau khi chuyển đổi cài đặt "Nút nổi làm lối vào mặc định": Đồng bộ ẩn hiện nút nổi khi bảng điều khiển ẩn, giữ ẩn khi bảng điều khiển mở rộng. */
function setPreferenceBadgeDefaultBehavior() {
    if (!badgeEl || isPanelExpanded) return;
    if (preferences.badgeDefault) showBadgeAtStoredPosition();
    else {
        setBadgeActive(false);
        syncViewportListenerLifecycle();
    }
}

/* Tính toán trạng thái toàn màn hình ban đầu của trang: Chỉ gọi khi khởi tạo. Cài đặt ưu tiên trên di động bật thì mặc định toàn màn hình, ngược lại mặc định trạng thái thường. */
function initFullscreenState() {
    initialFullscreenActive = !!(preferences.mobileFull && isMobileViewport());
    manualFullscreenOverride = null;
}

/* Trạng thái toàn màn hình thực tế hiện tại: Sau khi người dùng chuyển đổi thủ công sẽ do giá trị ghi đè quyết định, ngược lại dùng giá trị mặc định đóng băng lúc khởi tạo. */
function isFullscreenActive() {
    return manualFullscreenOverride === null ? initialFullscreenActive : manualFullscreenOverride;
}

/* Đồng bộ class toàn màn hình, icon nút và bảo trì liên quan đến kích thước bảng điều khiển. Chỉ đọc trạng thái cache, không đọc lại cài đặt ưu tiên hoặc breakpoint của viewport. */
function syncFullscreenUI() {
    if (!panelEl) return;
    const active = isFullscreenActive();
    const changed = panelEl.classList.contains('rlog-fullscreen') !== active;
    panelEl.classList.toggle('rlog-fullscreen', active);

    const btn = panelEl.querySelector('#rlog-fullscreen-btn');
    const icon = btn ? btn.querySelector('i') : null;
    if (btn && icon) {
        icon.className = active ? 'fa-solid fa-window-restore' : 'fa-solid fa-window-maximize';
        const title = active ? 'Khôi phục' : 'Phóng to';
        btn.title = title;
        btn.setAttribute('aria-label', title);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }

    /* Kích thước bảng điều khiển đã đổi → Đo lại độ dính đỉnh và để việc bảo trì chiều rộng chính văn khôi phục/gỡ bỏ theo hình học mới; khi bảng điều khiển ẩn thì chờ quy trình mở xử lý thống nhất */
    if (changed && isPanelExpanded) schedulePanelViewportSync();
}

/* Người dùng nhấp phóng to/khôi phục: Chỉ ghi đè giá trị thủ công trong bộ nhớ, không sửa đổi cài đặt ưu tiên. */
function toggleFullscreen() {
    manualFullscreenOverride = !isFullscreenActive();
    refreshMobilePanelLayoutForLayoutAction();
    syncFullscreenUI();
}

/* Áp dụng/Hủy bỏ "Chế độ tối giản": Thêm class .rlog-minimal vào Shadow Host (chứ không phải bảng điều khiển),
   kết hợp style `:host(.rlog-minimal)` bên trong Shadow để tắt một lần toàn bộ transition/animation (bao gồm popup cùng cấp với bảng điều khiển).
   Gọi một lần khi chuyển đổi cài đặt ưu tiên và khi khởi tạo. */
function updateMinimalClass() {
    if (!shadowHostEl) return;
    shadowHostEl.classList.toggle('rlog-minimal', !!preferences.minimal);
}

/* Mở lớp phủ cài đặt ưu tiên: Giữ lại ngăn kéo "Tùy chọn khác" hiện tại, chỉ hiển thị lớp phủ che (bảng cài đặt hiển thị chính giữa). */
function openPrefPanel() {
    if (!prefOverlayEl) return;
    syncPrefToggleUI();
    syncMaxRecordsInputUI();
    syncReplyTimeoutInputUI();
    syncTokenWarningThresholdInputUI();
    prefNumberNoticeAt = 0;
    prefOverlayEl.classList.add('rlog-pref-open');
    /* Đợi một frame để lớp che hiển thị, đo lường xong rồi mới cập nhật mũi tên gợi ý cuộn */
    requestAnimationFrame(() => updatePrefScrollArrows());
}

/* Đóng lớp phủ cài đặt ưu tiên (cách đóng duy nhất là nút × ở góc trên bên phải).
   Nhấp vào lớp che không kích hoạt đóng; tùy chọn "Nhấp ngoài bảng điều khiển để đóng" nhắm vào toàn bộ bảng điều khiển chính của tiện ích, không liên quan đến lớp phủ. */
function closePrefPanel() {
    if (!prefOverlayEl) return;
    /* Chỉ submit khi lớp phủ thực sự mở, tránh việc đóng lặp lại ghi lại bản nháp cũ */
    if (prefOverlayEl.classList.contains('rlog-pref-open')) {
        commitMaxRecordsPreference();
        commitReplyTimeoutPreference();
        commitTokenWarningThresholdPreference();
    }
    prefOverlayEl.classList.remove('rlog-pref-open');
}

/* Cập nhật mũi tên gợi ý cuộn danh sách cài đặt ưu tiên: Chỉ hiển thị mũi tên hướng tương ứng khi nội dung thực sự cần cuộn, chỉ dùng để gợi ý, không tham gia tương tác
   (phụ thuộc vào sự kiện scroll được gán trong buildUI và cập nhật frame đầu tiên của openPrefPanel). */
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
    return pluginSettings ? pluginSettings.theme !== 'dark' : true;
}

function saveTheme(isLight) {
    if (pluginSettings) pluginSettings.theme = isLight ? 'light' : 'dark';
    persistPluginSettings();
}

function applyTheme() {
    if (!panelEl) return;
    if (isLightTheme) {
        panelEl.classList.add('rlog-light');
    } else {
        panelEl.classList.remove('rlog-light');
    }
    /* Đồng bộ class theme sang Shadow Host: Popup bên trong Shadow dựa vào .rlog-light trên Host để chuyển sáng tối (kế thừa xuyên ranh giới Shadow);
       nút nổi là Host độc lập, phối màu ngược chiều theo theme ST, do syncBadgeTheme() xử lý riêng. */
    if (shadowHostEl) {
        if (isLightTheme) shadowHostEl.classList.add('rlog-light');
        else shadowHostEl.classList.remove('rlog-light');
    }
}

/* Đồng bộ theme của bảng điều khiển theo theme hiện tại của ST (cùng chiều; việc lấy màu ngược chiều của nút nổi thuộc logic khác). Tái sử dụng cơ chế sẵn có:
   isStThemeDark() lấy tín hiệu, applyTheme() chuyển class theme của bảng điều khiển và Shadow Host, updateThemeButtonIcon() làm mới icon.
   @param {boolean} animate Có phát animation chuyển đổi khi theme thực sự thay đổi hay không (chỉ có hiệu lực khi bảng điều khiển đã mở và không ở chế độ tối giản) */
function syncPanelThemeToSt(animate) {
    if (!preferences.followStTheme) return;
    const isLight = !isStThemeDark();
    /* Trạng thái và class DOM đều đã nhất quán thì bỏ qua (thêm một bước kiểm tra class: sau khi host dựng lại cũng có thể tự phục hồi) */
    if (isLight === isLightTheme && (!panelEl || panelEl.classList.contains('rlog-light') === isLight)) return;
    isLightTheme = isLight;
    /* Khi đang theo dõi sẽ không ghi vào bộ nhớ theme: "Ghi nhớ theme hiện tại" chỉ thực thi đúng một lần ngay khi tắt công tắc */
    applyTheme();
    updateThemeButtonIcon();
    if (animate && isPanelExpanded) playThemeSwitchAnimation();
}

/* Khi bảng điều khiển mở rộng và bật tùy chọn theo dõi sẽ đồng bộ theme hiện tại, đồng thời lắng nghe thuộc tính style của <html> (ST không có sự kiện thay đổi theme).
   Khi mở lại, trước tiên đồng bộ bổ sung biến đổi bị bỏ lỡ trong thời gian đóng, sau đó mới đăng ký biến đổi tiếp theo; điểm gắn mất hiệu lực chỉ biểu hiện là không tự động theo dõi nữa.
   @param {boolean} animate Lần bổ sung đầu tiên có cho phép phát animation hay không (quy trình mở truyền false) */
function activatePanelThemeFollow(animate) {
    if (!preferences.followStTheme || !isPanelExpanded) return;
    syncPanelThemeToSt(animate);
    if (!panelThemeObserver) {
        panelThemeObserver = new MutationObserver(() => {
            if (!preferences.followStTheme || !isPanelExpanded) return;
            syncPanelThemeToSt(true);
        });
    }
    panelThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
}

/* Gỡ bỏ bộ quan sát theme khi bảng điều khiển ẩn hoặc tắt tùy chọn theo dõi, khôi phục lại khi mở rộng trở lại. */
function deactivatePanelThemeFollow() {
    if (!panelThemeObserver) return;
    panelThemeObserver.disconnect();
    panelThemeObserver = null;
}

/* Tải số lượng bản ghi tối đa do người dùng thiết lập từ cài đặt tiện ích ST (trả về giá trị mặc định nếu không có giá trị lưu hoặc giá trị không hợp lệ) */
function loadMaxRecords() {
    const value = pluginSettings ? Number(pluginSettings.maxRecords) : DEFAULT_MAX_RECORDS;
    return Number.isInteger(value) && value >= MIN_MAX_RECORDS && value <= MAX_MAX_RECORDS
        ? value
        : DEFAULT_MAX_RECORDS;
}

function saveMaxRecords(value) {
    if (pluginSettings) pluginSettings.maxRecords = value;
    persistPluginSettings();
}

/* Thiết lập giới hạn số lượng bản ghi tối đa mới: Cập nhật biến toàn cục, lưu trữ bền vững, cắt tỉa các bản ghi vượt quá giới hạn, làm mới hiển thị trên thanh tiêu đề
   @param {number} newMax Giá trị giới hạn mới */
function setMaxRecords(newMax) {
    if (typeof newMax !== 'number' || isNaN(newMax) || newMax < MIN_MAX_RECORDS || newMax > MAX_MAX_RECORDS) {
        return false;
    }
    MAX_RECORDS = newMax;
    saveMaxRecords(MAX_RECORDS);

    /* Nếu số lượng bản ghi thông thường hiện tại vượt quá giới hạn mới, cắt tỉa bản ghi thông thường cũ nhất; bản ghi ghim không bị ảnh hưởng */
    pruneNormalRecords();

    updateHeaderTitle();
    panelContentDirty = true;

    if (panelEl && isPanelExpanded) {
        renderPanelContent();
    }

    return true;
}

/* ── Modal popup dùng chung ─────────────────────────── */

/* HTMLElement|null: Phần tử DOM của modal xác nhận hiện tại */
let confirmDialogEl = null;

/* Modal xác nhận dùng chung (các thao tác phá hủy như xóa sạch bản ghi, xóa từng mục...)
   @param {object} options { title=Xác nhận thao tác, message=, confirmText=Xác nhận, cancelText=Hủy,
   onConfirm, onCancel } */
function showConfirmDialog(options) {
    const {
        title = 'Xác nhận thao tác',
        message = '',
        confirmText = 'Xác nhận',
        cancelText = 'Hủy',
        onConfirm = null,
        onCancel = null,
    } = options || {};

    closeConfirmDialog();

    /* Dùng inline style thiết lập kích thước định vị, tránh CSS của trang cha (như transform) phá vỡ hệ quy chiếu của position:fixed */
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
            <button class="rlog-dialog-close" title="Đóng"><i class="fa-solid fa-xmark"></i></button>
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

    /* Tự động focus vào nút Hủy (thao tác an toàn mặc định, tránh vô tình chạm xác nhận) */
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

/* Đặt lại trạng thái tìm kiếm hiện tại (đóng khung tìm kiếm, xóa từ khóa, xóa highlight, đặt lại số thứ tự khớp), dùng cho mọi kịch bản cần thoát chế độ tìm kiếm.
   Không phụ thuộc vào việc UI khung tìm kiếm đã dựng hay chưa, chỉ thao tác khi tồn tại trong DOM. */
function resetSearchIfActive() {
    if (searchDebounceTimer !== null) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
    }

    /* Xóa toàn bộ đánh dấu highlight */
    if (searchState) {
        const counter = searchState.searchEl
            ? searchState.searchEl.querySelector('.rlog-search-count')
            : null;
        cancelSearchCountEdit(counter ? counter.querySelector('.rlog-search-count-current') : null);
        const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
        if (listEl) restoreSearchHighlights(listEl);

        const searchEl = searchState.searchEl;
        if (searchEl && searchEl.parentNode) {
            searchEl.parentNode.removeChild(searchEl);
        }
        /* Khôi phục hiển thị nút thao tác gốc, mũi tên thu gọn/mở rộng, cờ trạng thái đang tìm kiếm của bản ghi tương ứng */
        if (panelEl && searchState.recordIndex !== undefined) {
            const recordEl = panelEl.querySelector(`.rlog-record[data-record-index="${searchState.recordIndex}"]`);
            if (recordEl) {
                /* Xóa đánh dấu "Đang tìm kiếm" (CSS dựa vào nó để khôi phục hiển thị các nút bị ẩn) */
                recordEl.classList.remove('rlog-searching');
                const toggleIcon = recordEl.querySelector('.rlog-toggle-icon');
                if (toggleIcon) toggleIcon.style.visibility = '';
            }
        }

        searchState = null;
    }

}

/* Set<string>: Tập hợp các ký tự khoảng trắng tương đương \s (tránh chi phí regex từng ký tự bên trong vòng lặp) */
const WHITESPACE_CHARS = new Set([' ', '\t', '\n', '\r', '\f', '\v', '\u00a0', '\u1680',
    '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006', '\u2007',
    '\u2008', '\u2009', '\u200a', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff']);

/* Chuẩn hóa văn bản dùng cho tìm kiếm: Chuỗi khoảng trắng liên tiếp được thu gọn thành một khoảng trắng đơn, và trả về ánh xạ "Ký tự chuẩn hóa → Chỉ số gốc".
   Mục đích là làm cho xuống dòng/khoảng trắng trong nội dung tương đương với khoảng trắng trong từ khóa - văn bản nhiều đoạn sao chép từ ngoài thường biến xuống dòng thành khoảng trắng.
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

/* Tìm kiếm kết quả khớp trong tất cả tin nhắn hiển thị của một bản ghi (quét chuỗi thuần túy, không chạm vào DOM, hiệu năng ổn định với văn bản dài). Cả hai bên đều chuẩn hóa,
   vẫn khớp được khi xuyên dòng/khoảng trắng sao chép vào; start/end trả về là độ lệch nội dung gốc, có thể dùng trực tiếp để highlight.
   @param {object} record @param {string} keyword @returns {Array<{msgIdx,start,end}>} */
function findMatchesInRecordData(record, keyword) {
    if (!record || !record.messages || !keyword) return [];

    const normalizedKeyword = keyword.replace(/\s+/g, ' ').trim();
    if (!normalizedKeyword) return [];
    const lowerKeyword = normalizedKeyword.toLowerCase();
    /* Khi từ khóa không chứa khoảng trắng (hầu hết các tìm kiếm), việc chuẩn hóa không thay đổi kết quả khớp - chuẩn hóa chỉ thu gọn khoảng trắng,
       không thay đổi thứ tự tương đối của các ký tự không phải khoảng trắng, do đó có thể quét trực tiếp trên "Chữ thực tế trên trang",
       tiết kiệm việc tạo văn bản chuẩn hóa và ánh xạ chỉ mục cho từng tin nhắn (đối với bản ghi dài mục này có thể tốn hơn mười mili giây/lần nhập) */
    const plainScan = normalizedKeyword.indexOf(' ') === -1;

    const matches = [];

    record.messages.forEach((msg, msgIdx) => {
        /* Tin nhắn con bị bộ lọc vai trò ẩn sẽ không tham gia tìm kiếm: Nội dung không có trong DOM, điều hướng highlight không thể định vị */
        if (!isMessageVisible(msg)) return;
        addContentMatches(getMessageDisplayText(msg), msgIdx, normalizedKeyword, lowerKeyword, matches, plainScan);
    });
    /* Phản hồi tham gia tìm kiếm với tư cách là tin nhắn giả cuối cùng (msgIdx = messages.length) */
    if (record.reply && isMessageVisible(record.reply)) {
        addContentMatches(getMessageDisplayText(record.reply), record.messages.length,
            normalizedKeyword, lowerKeyword, matches, plainScan);
    }
    getRecordToolEntries(record).forEach((toolEntry, toolIdx) => {
        if (!isMessageVisible(toolEntry)) return;
        addContentMatches(
            getMessageDisplayText(toolEntry),
            record.messages.length + 1 + toolIdx,
            normalizedKeyword,
            lowerKeyword,
            matches,
            plainScan,
        );
    });

    return matches;
}

/* Điểm vào tương thích của tìm kiếm đơn lẻ theo chỉ số bản ghi. */
function findMatchesInRecord(recordIndex, keyword) {
    return findMatchesInRecordData(records[recordIndex], keyword);
}

/* Quy đổi văn bản gốc của tin nhắn thành "Chữ hiển thị trên trang": Render qua <pre>, bộ phân tích cú pháp sẽ làm hai việc, ở đây đối chiếu từng cái
   (bỏ sót bất kỳ mục nào thì vị trí rơi của từ khóa sẽ trôi toàn bộ) - (1) \r\n / \r → \n; (2) Loại bỏ NUL.
   Dấu xuống dòng đầu tiên ở đầu chuỗi được buildMessageHtml đệm một dấu xuống dòng sau <pre> để triệt tiêu, tại đây không xử lý thêm.
   @param {string} content @returns {string} */
function toRenderedText(content) {
    return content.replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
}

/* Thu thập các kết quả khớp từ khóa trong nội dung tin nhắn đơn lẻ/phản hồi (độ lệch dựa trên toRenderedText, cùng nguồn với chữ trên trang)
   @param {string} content @param {number} msgIdx @param {string} normalizedKeyword
   @param {string} lowerKeyword @param {Array} matches
   @param {boolean} [plainScan=false] Từ khóa không chứa khoảng trắng đi theo đường tắt: Không dựng văn bản chuẩn hóa và ánh xạ chỉ số */
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
    /* Nội dung chuẩn hóa không có từ khóa thì bỏ qua tin nhắn đó */
    const firstIdx = lowerContent.indexOf(lowerKeyword);
    if (firstIdx === -1) return;

    /* Duyệt qua mọi vị trí xuất hiện (bảo vệ tối đa 5000 vị trí, chống văn bản lặp lại cực đoan gây chậm) */
    let count = 0;
    while (pos <= normalized.length && count < 5000) {
        const idx = lowerContent.indexOf(lowerKeyword, pos);
        if (idx === -1) break;
        /* Khôi phục độ lệch khớp trong văn bản chuẩn hóa thành độ lệch chữ trên trang (có thể dùng trực tiếp để highlight) */
        const origStart = map[idx];
        const normEnd = idx + normalizedKeyword.length;
        const origEnd = map[normEnd - 1] + 1;
        matches.push({ msgIdx, start: origStart, end: origEnd });
        pos = idx + normalizedKeyword.length;
        count++;
    }
}

/* Khôi phục toàn bộ highlight tìm kiếm hiện tại thành văn bản thuần túy: Chỉ thiết lập lại textContent tổng thể một lần cho "Tin nhắn thực sự có chứa mark".
   Gỡ từng thẻ mark (replaceChild + normalize) khi có nhiều kết quả khớp rất tốn kém (đo thực tế 2000 chỗ mất khoảng 478ms, 10460 chỗ mất khoảng 20.7s),
   việc thiết lập lại tổng thể tương đương và chỉ là một lần gán cho mỗi tin nhắn; chuẩn văn bản và highlight cùng dùng toRenderedText, nhất quán từng chữ với hiển thị trên trang.
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
        if (msg && contentEl) contentEl.textContent = toRenderedText(getMessageDisplayText(msg));
    });
}

/* Xóa tất cả các thẻ <mark> highlight tìm kiếm (khớp màu vàng thông thường + kết quả trúng màu cam hiện tại), khôi phục vùng nội dung văn bản thuần túy */
function clearSearchHighlights() {
    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    if (!listEl) return;
    restoreSearchHighlights(listEl);
}

/* Hạ cấp highlight màu cam của kết quả hiện tại thành màu vàng (chỉ đổi class, không xóa mark), phục vụ điều hướng tái sử dụng highlight đã vẽ để tránh vẽ lại toàn bộ;
   khi hạ cấp ghi lại matchIdx, thuận tiện định vị khi nhảy ngược lại. @param {number} [oldMatchIdx] */
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

/* Xóa thẻ mark khớp màu vàng thông thường có matchIdx chỉ định (vị trí đích sẽ được vẽ đè màu cam)
   @param {number} matchIdx Chỉ số khớp trong mảng matches */
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

/* Bọc văn bản trong đoạn [start, end) của nội dung tin nhắn thành <mark> (TreeWalker định vị chính xác độ lệch)
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
        /* Trường hợp xuyên qua ranh giới node (từ khóa trải dài trên nhiều text node), xử lý đơn giản hóa: Chỉ lấy phần có thể khớp trong node hiện tại */
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

/* Highlight các kết quả khớp bên trong một bản ghi chỉ định (màu vàng, không bao gồm kết quả trúng hiện tại - nó do bên gọi vẽ riêng màu cam).
   Mỗi tin nhắn tạo cấu trúc phân đoạn "Text node + <mark>" một lần và thay thế toàn bộ các node con của vùng nội dung:
   Dùng Range.surroundContents từng chỗ là cắt đi cắt lại trên cùng một khối văn bản, chi phí tăng siêu tuyến tính theo số lượng kết quả trúng trong khối đó
   (đo thực tế một khối 420 chỗ thì 60 chỗ cuối đắt gấp mười mấy lần 60 chỗ đầu), trong khi tạo cấu trúc một lần là tuyến tính,
   DOM tạo ra tương đương với việc bọc từng chỗ (cùng class mark và data-match-idx, chữ ghi bằng textContent không cần escape).
   @param {HTMLElement} recordEl @param {object} record
   @param {Array<{match: object, idx: number}>} indexedMatches Các kết quả khớp kèm chỉ số toàn cục trong bản ghi hiện tại
   @param {number} currentIdx Chỉ số kết quả trúng màu cam hiện tại */
function highlightRecordMatches(recordEl, record, indexedMatches, currentIdx) {
    if (!recordEl || !record || !Array.isArray(indexedMatches)) return;
    /* Chính văn của bản ghi thu gọn chưa được tạo, điểm rơi highlight phải tìm trong cây con sau khi dựng bổ sung */
    ensureRecordBody(recordEl);

    /* Nhóm theo tin nhắn (bỏ qua kết quả trúng hiện tại, màu cam vẽ riêng), và giữ lại chỉ số khớp trong matches để thẻ mark ghi nhận */
    const matchesByMsg = new Map();
    indexedMatches.forEach(({ match, idx }) => {
        if (idx === currentIdx) return;
        if (!matchesByMsg.has(match.msgIdx)) matchesByMsg.set(match.msgIdx, []);
        matchesByMsg.get(match.msgIdx).push({ match, idx });
    });

    matchesByMsg.forEach((msgMatches, msgIdx) => {
        const msg = getMessageByIndex(record, msgIdx);
        if (!msg) return;
        /* Đảm bảo tin nhắn được mở rộng (highlight tìm kiếm cần vùng nội dung hiển thị) */
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

        /* Trong cùng một tin nhắn ghép phân đoạn theo start tăng dần: Node văn bản và phần tử mark xen kẽ nhau, cuối cùng bù văn bản còn lại */
        const text = toRenderedText(getMessageDisplayText(msg));
        const sorted = msgMatches.slice().sort((a, b) => a.match.start - b.match.start);
        const fragment = document.createDocumentFragment();
        let cursor = 0;
        sorted.forEach(({ match, idx }) => {
            if (match.start > cursor) {
                fragment.appendChild(document.createTextNode(text.slice(cursor, match.start)));
            }
            const markEl = document.createElement('mark');
            markEl.className = 'rlog-search-mark';
            /* Ghi lại chỉ số khớp, phục vụ removeYellowMarkByMatchIdx định vị mark màu vàng */
            markEl.dataset.matchIdx = String(idx);
            markEl.textContent = text.slice(match.start, match.end);
            fragment.appendChild(markEl);
            cursor = match.end;
        });
        if (cursor < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(cursor)));
        }
        contentEl.replaceChildren(fragment);
        /* Chữ và chiều cao đều không đổi, nhưng vùng nội dung đã được thay thế toàn bộ, tiện thể làm mới thumb thanh cuộn của tin nhắn đó (không có thanh tiến trình thì là no-op) */
        requestThumbUpdate(contentEl);
    });
}

/* Lớp tương thích của tìm kiếm đơn lẻ: Toàn bộ kết quả khớp của bản ghi này đều đến từ cùng một searchState. */
function highlightAllMatches(recordEl, recordIndex) {
    if (!searchState || !recordEl) return;
    const record = records[recordIndex];
    if (!record) return;
    const indexedMatches = searchState.matches.map((match, idx) => ({ match, idx }));
    highlightRecordMatches(recordEl, record, indexedMatches, searchState.currentIdx);
}

/* Trả về hành vi cuộn nên dùng hiện tại: Chế độ tối giản dùng 'auto' để nhảy trực tiếp, ngược lại dùng 'smooth' để cuộn mượt. */
function getScrollBehavior() {
    return preferences.minimal ? 'auto' : 'smooth';
}

/* Cuộn kết quả trúng hiện tại về vị trí thuận mắt: Cuộn bên trong .rmsg-content trước, sau đó tính scrollTop của .rlog-list để tin nhắn rơi vào bên dưới thanh tiêu đề dính đỉnh.
   Không dùng scrollIntoView - nó sẽ cuộn đệ quy tất cả các tổ tiên có thể cuộn, trên di động sẽ làm cuộn lây sang cả giao diện chính của ST.
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
    /* Cả trên và dưới đều phải kẹp vào phạm vi cuộn thực tế của vùng nội dung: Khi kết quả trúng nằm gần cuối tin nhắn dài, trình duyệt sẽ kẹp giá trị vượt giới hạn bên dưới về maxScroll,
       nếu ở đây không kẹp trước, thì "Vị trí cuối cùng của kết quả trúng" suy ra từ delta ở dưới sẽ bị lớn hơn thực tế,
       danh sách bên ngoài căn cứ vào đó để định vị sẽ để kết quả trúng ở vị trí lệch xuống dưới (đo thực tế lệch tối đa hàng trăm pixel) */
    const maxContentScroll = Math.max(0, contentEl.scrollHeight - contentEl.clientHeight);
    const clampedContentScroll = Math.max(0, Math.min(targetScroll, maxContentScroll));
    contentEl.scrollTo({ top: clampedContentScroll, behavior: getScrollBehavior() });

    /* Danh sách bên ngoài tự tính toán vị trí cuộn thủ công: Cuộn bên trong chưa hoàn thành, nhưng vị trí trực quan cuối cùng của mark có thể suy ra từ phần gia tăng cuộn
       (markRect.top - delta), kỳ vọng nó rơi vào dưới hai tầng thanh tiêu đề dính đỉnh, chiếm khoảng 1/3 vùng nhìn thấy còn lại */
    const delta = clampedContentScroll - contentScrollTop;
    const markFinalTop = markRect.top - delta;
    const listRect = listEl.getBoundingClientRect();

    /* Cộng dồn offsetHeight của hai thanh tiêu đề sticky (.rlog-record-header / .rmsg-header) thay vì giá trị cố định,
       để tự động tương thích với chiều cao khác nhau trên desktop/mobile và việc tiêu đề mobile xuống dòng làm tăng chiều cao. Lưu ý không dùng getBoundingClientRect().bottom:
       Khi tin nhắn chứa mark không nằm trong viewport thì header chưa dính đỉnh, bottom sẽ nằm xa ngoài viewport, dẫn đến scrollTop mục tiêu bị kẹp về 0. */
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

    /* Kẹp vào phạm vi cuộn hợp lệ (tránh trình duyệt âm thầm kẹp gây giật vị trí bất ngờ) */
    const maxListScroll = Math.max(0, listEl.scrollHeight - listEl.clientHeight);
    /* Giới hạn dưới: Vị trí logic của mép trên bản ghi trong danh sách. Thấp hơn nó, mép trên bản ghi sẽ lộ ra phía trên danh sách, thanh tiêu đề theo đó sẽ rơi khỏi vị trí dính đỉnh;
       khi vị trí kết quả trúng không đủ để thỏa mãn điểm rơi tiêu chuẩn thì ưu tiên đảm bảo thanh tiêu đề bản ghi đứng yên, cho phép highlight dừng ở vị trí thấp hơn */
    const recordTopInList = recordEl
        ? listEl.scrollTop + recordEl.getBoundingClientRect().top - listRect.top
        : 0;
    const minListScroll = Math.max(0, Math.min(recordTopInList, maxListScroll));
    const clampedListScroll = Math.max(minListScroll, Math.min(targetListScroll, maxListScroll));

    /* Chỉ cuộn bên ngoài khi cần điều chỉnh (khi mark đã nhìn thấy thì giữ nguyên, tránh kích hoạt bất kỳ cuộn bên ngoài nào) */
    if (Math.abs(clampedListScroll - listEl.scrollTop) > 1) {
        listEl.scrollTo({ top: clampedListScroll, behavior: getScrollBehavior() });
    }
}

/* Cấu hình runtime cho việc nhảy số thứ tự tìm kiếm: Phần tử số thứ tự hiện tại là control chỉnh sửa tạm thời, không ghi callback vào thuộc tính DOM */
const searchCountEditConfigs = new WeakMap();

/* Lần chỉnh sửa số đếm này có thay đổi số chưa được submit hay không */
const searchCountEditDirty = new WeakSet();

/* Lấy 3 phần của bộ đếm; tương thích với các node cũ chưa chuyển sang cấu trúc phân đoạn DOM */
function getSearchCountParts(counter) {
    if (!counter) return null;
    let current = counter.querySelector('.rlog-search-count-current');
    let separator = counter.querySelector('.rlog-search-count-separator');
    let total = counter.querySelector('.rlog-search-count-total');
    if (!current || !separator || !total) {
        counter.replaceChildren();
        current = document.createElement('span');
        current.className = 'rlog-search-count-current';
        current.setAttribute('role', 'textbox');
        current.setAttribute('aria-label', 'Thứ tự kết quả tìm kiếm hiện tại');
        current.setAttribute('aria-multiline', 'false');
        current.setAttribute('inputmode', 'numeric');
        current.setAttribute('enterkeyhint', 'go');
        current.spellcheck = false;
        separator = document.createElement('span');
        separator.className = 'rlog-search-count-separator';
        separator.textContent = '/';
        total = document.createElement('span');
        total.className = 'rlog-search-count-total';
        counter.append(current, separator, total);
    }
    return { current, separator, total };
}

/* Chọn nội dung số thứ tự hiện tại: Sau khi nhấp chuột hoặc phím Tab đi vào đều có thể nhập đè trực tiếp */
function selectSearchCountContent(currentEl) {
    if (!currentEl) return;
    const selection = currentEl.getRootNode().getSelection
        ? currentEl.getRootNode().getSelection()
        : window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(currentEl);
    selection.removeAllRanges();
    selection.addRange(range);
}

/* Đưa con trỏ về cuối sau khi chỉnh sửa số, tránh việc dán nhiều chữ số làm con trỏ bị reset về đầu dòng ở mỗi bước */
function moveSearchCountCaretToEnd(currentEl) {
    const selection = currentEl.getRootNode().getSelection
        ? currentEl.getRootNode().getSelection()
        : window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(currentEl);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
}

/* Số thứ tự người dùng nhập lấy mốc cơ sở là 1; chỉ chấp nhận số nguyên thập phân thuần túy */
function parseSearchCountValue(currentEl, total) {
    const text = currentEl ? currentEl.textContent.trim() : '';
    if (!/^\d+$/.test(text)) return null;
    const value = Number(text);
    return Number.isSafeInteger(value) && value >= 1 && value <= total ? value : null;
}

function markSearchCountInvalid(currentEl, invalid) {
    if (!currentEl) return;
    currentEl.classList.toggle('rlog-search-count-invalid', invalid);
    currentEl.setAttribute('aria-invalid', invalid ? 'true' : 'false');
}

/* Thoát chỉnh sửa số và khôi phục số thứ tự thực tế hiện tại; khi blur=true đồng thời rời focus, phục vụ cho phím Esc */
function cancelSearchCountEdit(currentEl, { blur = false } = {}) {
    if (!currentEl || currentEl.dataset.rlogCountEditing !== '1') return;
    const config = searchCountEditConfigs.get(currentEl);
    currentEl.dataset.rlogCountEditing = '0';
    searchCountEditDirty.delete(currentEl);
    currentEl.textContent = String(config ? config.getCurrent() : 0);
    markSearchCountInvalid(currentEl, false);
    if (blur) currentEl.blur();
}

/* Submit chuyển đến theo số thứ tự; Enter giữ lại trong control đếm để thuận tiện tiếp tục chuyển, submit khi mất focus thì rời đi cùng focus */
function submitSearchCountEdit(currentEl, { fromBlur = false } = {}) {
    if (!currentEl || currentEl.dataset.rlogCountEditing !== '1') return false;
    const config = searchCountEditConfigs.get(currentEl);
    if (!config) return false;
    if (!searchCountEditDirty.has(currentEl)) {
        if (fromBlur) cancelSearchCountEdit(currentEl);
        return false;
    }

    /* Kết quả toàn cục có thể đã bị hiệu chỉnh bởi bản ghi mới / bộ lọc; đồng bộ dữ liệu trước rồi mới kiểm tra theo tổng số mới nhất */
    config.prepareCommit?.();
    const total = config.getTotal();
    const value = parseSearchCountValue(currentEl, total);
    if (value === null) {
        if (fromBlur) {
            cancelSearchCountEdit(currentEl);
        } else {
            markSearchCountInvalid(currentEl, true);
        }
        return false;
    }

    if (fromBlur) currentEl.dataset.rlogCountEditing = '0';
    searchCountEditDirty.delete(currentEl);
    markSearchCountInvalid(currentEl, false);
    config.onJump(value - 1);
    if (!fromBlur && currentEl.isConnected) {
        requestAnimationFrame(() => {
            if (currentEl.dataset.rlogCountEditing === '1'
                && currentEl.getRootNode().activeElement === currentEl) {
                selectSearchCountContent(currentEl);
            }
        });
    }
    return true;
}

/* Gán số thứ tự hiện tại của bộ đếm thành bộ chỉnh sửa số có thể thao tác bằng bàn phím */
function bindSearchCountJump(counter, options) {
    const parts = getSearchCountParts(counter);
    if (!parts) return;
    const { current } = parts;
    searchCountEditConfigs.set(current, {
        getCurrent: options.getCurrent,
        getTotal: options.getTotal,
        onJump: options.onJump,
        beforeEdit: options.beforeEdit,
        prepareCommit: options.prepareCommit,
    });
    if (current.dataset.rlogCountJumpBound === '1') return;
    current.dataset.rlogCountJumpBound = '1';

    let isComposing = false;
    current.addEventListener('focus', () => {
        const config = searchCountEditConfigs.get(current);
        if (!config || config.getTotal() <= 1) return;
        config.beforeEdit?.();
        if (config.getTotal() <= 1) {
            current.blur();
            return;
        }
        current.dataset.rlogCountEditing = '1';
        searchCountEditDirty.delete(current);
        markSearchCountInvalid(current, false);
        selectSearchCountContent(current);
    });

    current.addEventListener('compositionstart', () => { isComposing = true; });
    current.addEventListener('compositionend', () => {
        isComposing = false;
        current.dispatchEvent(new Event('input', { bubbles: true }));
    });
    current.addEventListener('input', () => {
        if (isComposing || current.dataset.rlogCountEditing !== '1') return;
        const config = searchCountEditConfigs.get(current);
        /* Chỉ giới hạn chuỗi nhập quá dài cực đoan; vượt quá tổng số vẫn giữ nguyên trạng và bôi đỏ, giao cho người dùng chỉnh lại */
        const maxDigits = 9;
        const clean = current.textContent.replace(/\D/g, '').slice(0, maxDigits);
        if (clean !== current.textContent) {
            current.textContent = clean;
            moveSearchCountCaretToEnd(current);
        }
        searchCountEditDirty.add(current);
        markSearchCountInvalid(current, false);
    });
    current.addEventListener('keydown', (event) => {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            submitSearchCountEdit(current);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            cancelSearchCountEdit(current, { blur: true });
        }
    });
    current.addEventListener('blur', () => {
        if (current.dataset.rlogCountEditing === '1') {
            submitSearchCountEdit(current, { fromBlur: true });
        }
    });
}

/* Làm mới hiển thị bộ đếm; khi tổng số lớn hơn 1 thì số thứ tự hiện tại có thể chỉnh sửa, các trường hợp khác giữ ở chế độ chỉ đọc */
function updateSearchCountDisplay(counter, current, total) {
    const parts = getSearchCountParts(counter);
    if (!parts) return;
    const currentEl = parts.current;
    const editable = total > 1;
    if (!editable) cancelSearchCountEdit(currentEl);

    currentEl.textContent = String(current);
    parts.total.textContent = String(total);
    currentEl.style.minWidth = `${Math.max(1, String(total).length)}ch`;
    currentEl.contentEditable = editable ? 'plaintext-only' : 'false';
    currentEl.tabIndex = editable ? 0 : -1;
    currentEl.title = editable ? 'Nhập số thứ tự rồi nhấn Enter để chuyển đến' : '';
    currentEl.setAttribute(
        'aria-label',
        total > 0
            ? `Kết quả thứ ${current}, tổng cộng ${total} kết quả${editable ? ', có thể nhập số thứ tự để chuyển đến' : ''}`
            : 'Chưa có kết quả tìm kiếm',
    );
    markSearchCountInvalid(currentEl, false);
}

/* Hủy chỉnh sửa số trước khi nhấp vào nút khác, tránh việc mất focus làm nhảy một lần rồi nút lại thực hiện một thao tác khác */
function installSearchCountEditDismissal(rootEl) {
    if (!rootEl || rootEl.dataset.rlogCountDismissBound === '1') return;
    rootEl.dataset.rlogCountDismissBound = '1';
    rootEl.addEventListener('pointerdown', (event) => {
        const currentEl = rootEl.querySelector('.rlog-search-count-current[data-rlog-count-editing="1"]');
        if (!currentEl || currentEl.contains(event.target)) return;
        const counter = currentEl.closest('.rlog-search-count');
        if (counter && counter.contains(event.target)) return;
        if (event.target.closest?.('button, input, a, [contenteditable="true"], [contenteditable="plaintext-only"], [role="button"]')) {
            cancelSearchCountEdit(currentEl);
        }
    }, true);
}

/* Cập nhật hiển thị bộ đếm của hộp tìm kiếm (vd: 3/18) */
function updateSearchCounter() {
    if (!searchState || !searchState.searchEl) return;
    const counter = searchState.searchEl.querySelector('.rlog-search-count');
    if (!counter) return;

    const total = searchState.matches.length;
    const current = total > 0 ? searchState.currentIdx + 1 : 0;
    updateSearchCountDisplay(counter, current, total);

    /* Có từ khóa nhưng không khớp: Bộ đếm chuyển sang màu đỏ */
    counter.classList.toggle('rlog-search-count-empty', !!searchState.keyword && total === 0);

    /* Vô hiệu hóa mũi tên lên/xuống khi không có kết quả hoặc chỉ có duy nhất một kết quả */
    const prevBtn = searchState.searchEl.querySelector('.rlog-search-prev');
    const nextBtn = searchState.searchEl.querySelector('.rlog-search-next');
    if (prevBtn) prevBtn.disabled = total <= 1;
    if (nextBtn) nextBtn.disabled = total <= 1;
}

/* Thực hiện tìm kiếm tại tin nhắn chỉ định, highlight kết quả khớp hiện tại + cuộn đến vị trí đó
   @param {number} msgIdx @param {number} matchIdx
   @param {boolean} [redrawYellowHighlights=true] Truyền true khi từ khóa tìm kiếm thay đổi (xóa toàn bộ highlight để vẽ lại);
   truyền false khi điều hướng bằng phím lên/xuống (chỉ xóa kết quả khớp màu cam hiện tại, tái sử dụng highlight màu vàng đã vẽ) */
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

        /* Highlight tất cả kết quả khớp trong bản ghi này (màu vàng, bỏ qua kết quả khớp hiện tại; đồng thời mở rộng các tin nhắn thu gọn khớp kết quả) */
        highlightAllMatches(recordEl, recordIndex);
    } else {
        /* Điều hướng nhảy bước: Hạ cấp kết quả khớp màu cam cũ thành màu vàng, tái sử dụng mark đã vẽ để tránh vẽ lại toàn bộ */
        const oldIdx = searchState.currentIdx;
        clearCurrentHighlight(oldIdx);

        /* Bắt buộc phải xóa mark màu vàng còn sót lại ở vị trí đích trước, nếu không việc tính toán độ lệch DOM khi vẽ màu cam mới sẽ mất hiệu lực */
        removeYellowMarkByMatchIdx(matchIdx);

        if (record.collapsed) {
            record.collapsed = false;
            recordEl.classList.add('expanded');
            recordEl.classList.remove('collapsed');
        }
    }

    /* Nội dung của bản ghi thu gọn / tin nhắn thu gọn đều không hiển thị, không thể định vị, cần dựng bù theo nhu cầu trước rồi mới mở rộng */
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

    /* Tạo thanh cuộn bất đồng bộ (tin nhắn vừa mở rộng, cần đợi layout ổn định) */
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

/* Thực hiện tìm kiếm (được debounce gọi sau khi thay đổi từ khóa nhập vào)
   @param {number} recordIndex Chỉ số bản ghi
   @param {string} keyword Từ khóa tìm kiếm */
function performSearch(recordIndex, keyword) {
    if (!searchState || !panelEl) return;

    /* Xóa rỗng matches và highlight của lần tìm kiếm trước */
    searchState.matches = findMatchesInRecord(recordIndex, keyword);
    searchState.currentIdx = -1;
    searchState.keyword = keyword;

    if (!keyword) {
        clearSearchHighlights();
        updateSearchCounter();
        return;
    }

    if (searchState.matches.length > 0) {
        /* Tự động nhảy đến kết quả khớp đầu tiên */
        searchState.currentIdx = 0;
        applyCurrentMatch(searchState.matches[0].msgIdx, 0);
    } else {
        /* Không khớp: Xóa highlight, bộ đếm hiển thị 0/0 */
        clearSearchHighlights();
        updateSearchCounter();
    }
}

/* Nhảy đến kết quả khớp kế tiếp / trước đó
   @param {number} direction 1=kế tiếp, -1=trước đó */
function navigateSearch(direction) {
    if (!searchState || !searchState.matches || searchState.matches.length === 0) return;

    const total = searchState.matches.length;
    let nextIdx = searchState.currentIdx + direction;
    /* Nhảy vòng lặp */
    if (nextIdx >= total) nextIdx = 0;
    if (nextIdx < 0) nextIdx = total - 1;

    const match = searchState.matches[nextIdx];
    /* Tham số thứ ba false: Khi điều hướng nhảy bước chỉ xóa kết quả khớp màu cam hiện tại, tái sử dụng highlight màu vàng đã vẽ (tối ưu hóa hiệu năng) */
    applyCurrentMatch(match.msgIdx, nextIdx, false);
}

function closeSearch() {
    resetSearchIfActive();
}

/* Thứ tự hiển thị thực tế của các bản ghi đang nhìn thấy: Nhóm ghim ở trước, nhóm thông thường ở sau, trong nhóm giữ nguyên thứ tự gốc của records. */
function getDisplayOrderedVisibleRecords(visibleRecords = getVisibleRecords()) {
    return visibleRecords.filter(record => record.pinned)
        .concat(visibleRecords.filter(record => !record.pinned));
}

/* Lấy tham chiếu tập trung của các control tìm kiếm toàn cục; trả về object rỗng khi ngăn kéo hoặc panel chưa được dựng. */
function getGlobalSearchEls() {
    if (!panelEl) return {};
    return {
        input: panelEl.querySelector('#rlog-global-search-input'),
        counter: panelEl.querySelector('.rlog-global-search-count'),
        submit: panelEl.querySelector('#rlog-global-search-submit'),
        next: panelEl.querySelector('.rlog-global-search-next'),
        prev: panelEl.querySelector('.rlog-global-search-prev'),
    };
}

/* Nút chỉ chuyển thành "Cập nhật" khi thỏa mãn đồng thời 3 điều kiện: "Đã có kết quả, từ khóa chưa đổi, có nội dung mới đến sau khi tìm kiếm". */
function updateGlobalSearchSubmitState() {
    const { input, submit } = getGlobalSearchEls();
    if (!input || !submit) return;
    const canUpdate = !!globalSearchState
        && input.value === globalSearchState.keyword
        && globalSearchState.hasNewData;
    const text = canUpdate ? 'Cập nhật' : 'Tìm kiếm';
    const label = submit.querySelector('.rlog-global-search-submit-label');
    if (label) label.textContent = text;
    else submit.textContent = text;
    submit.title = text;
    submit.classList.toggle('rlog-global-search-update', canUpdate);
}

/* Làm mới bộ đếm toàn cục, mũi tên lên/xuống và nút "Tìm kiếm / Cập nhật". */
function updateGlobalSearchControls() {
    const { counter, next, prev } = getGlobalSearchEls();
    const total = globalSearchState ? globalSearchState.matches.length : 0;
    const current = total > 0 && globalSearchState.currentIdx >= 0
        ? globalSearchState.currentIdx + 1
        : 0;
    if (counter) {
        updateSearchCountDisplay(counter, current, total);
        counter.classList.toggle(
            'rlog-search-count-empty',
            !!(globalSearchState && globalSearchState.keyword && total === 0),
        );
    }
    if (prev) prev.disabled = total <= 1;
    if (next) next.disabled = total <= 1;
    updateGlobalSearchSubmitState();
}

/* Sau khi bản ghi mới hoặc Response đến chỉ đánh dấu có thể cập nhật, không tự động tìm kiếm lại từ khóa hiện tại. */
function markGlobalSearchDataChanged() {
    if (!globalSearchState) return;
    globalSearchState.hasNewData = true;
    updateGlobalSearchSubmitState();
}

/* Tìm kiếm DOM hiện tại theo object bản ghi; sau khi dựng lại danh sách chỉ có thể định vị lại thông qua chỉ số thời gian thực trong records. */
function getRecordElForSearchRecord(record) {
    if (!panelEl || !record) return null;
    const recordIndex = records.indexOf(record);
    if (recordIndex < 0) return null;
    const listEl = panelEl.querySelector('#rlog-list');
    return listEl
        ? listEl.querySelector(`.rlog-record[data-record-index="${recordIndex}"]`)
        : null;
}

/* Khi các phần tử trong danh sách thay đổi, dọn dẹp các kết quả khớp và đăng ký highlight không còn nhìn thấy, đồng thời hiệu chỉnh chỉ số hiện tại.
   clearDomHighlights=true Dùng trước khi dựng lại toàn bộ bảng: Giữ lại bản ghi và thuộc tính duyệt thủ công, chỉ đánh dấu highlight DOM cũ đã mất hiệu lực.
   updateControls=false Dùng khi submit chỉnh sửa bộ đếm để tinh chỉnh kết quả trước, giữ lại con số người dùng đang nhập. */
function reconcileGlobalSearchResults(clearDomHighlights = false, updateControls = true) {
    if (!globalSearchState) return;
    const previousCurrent = globalSearchState.currentIdx >= 0
        ? globalSearchState.matches[globalSearchState.currentIdx]
        : null;
    const previousIndex = globalSearchState.currentIdx;
    const visibleSet = new Set(getDisplayOrderedVisibleRecords());
    const nextMatches = globalSearchState.matches.filter(match => visibleSet.has(match.record));

    if (nextMatches.length !== globalSearchState.matches.length) {
        globalSearchState.matches = nextMatches;
        if (nextMatches.length === 0) {
            globalSearchState.currentIdx = -1;
        } else if (previousCurrent) {
            const keptIndex = nextMatches.indexOf(previousCurrent);
            globalSearchState.currentIdx = keptIndex >= 0
                ? keptIndex
                : Math.min(previousIndex, nextMatches.length - 1);
        } else {
            globalSearchState.currentIdx = -1;
        }
    }
    globalSearchState.highlightedRecords.forEach((entry, record) => {
        if (!visibleSet.has(record)) {
            globalSearchState.highlightedRecords.delete(record);
            return;
        }
        if (clearDomHighlights) entry.domPainted = false;
    });
    if (updateControls) updateGlobalSearchControls();
}

/* Xóa rỗng phiên tìm kiếm toàn cục; không động đến trạng thái thu gọn của bản ghi, vị trí cuộn, cũng không đưa focus trở lại hộp nhập. */
function resetGlobalSearch() {
    const { counter } = getGlobalSearchEls();
    cancelSearchCountEdit(counter ? counter.querySelector('.rlog-search-count-current') : null);
    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    if (listEl) restoreSearchHighlights(listEl);
    globalSearchState = null;
    const { input } = getGlobalSearchEls();
    if (input) input.value = '';
    updateGlobalSearchControls();
}

/* Mở rộng bản ghi và tin nhắn mục tiêu, dựng bổ sung phần chính văn và trả về vùng nội dung. */
function prepareGlobalSearchTarget(match) {
    const recordEl = getRecordElForSearchRecord(match.record);
    if (!recordEl) return null;
    const msg = getMessageByIndex(match.record, match.msgIdx);
    if (!msg) return null;

    let recordExpandedNow = false;
    if (match.record.collapsed) {
        match.record.collapsed = false;
        recordEl.classList.add('expanded');
        recordEl.classList.remove('collapsed');
        recordExpandedNow = true;
    }
    ensureRecordBody(recordEl);
    if (recordExpandedNow) queueScrollbarsForEls(recordEl.querySelectorAll('.rmsg-content'));
    if (msg.collapsed) {
        msg.collapsed = false;
        const msgItem = recordEl.querySelector(`.rmsg-item[data-msg="${match.msgIdx}"]`);
        if (msgItem) {
            msgItem.classList.add('expanded');
            msgItem.classList.remove('collapsed');
        }
    }
    const contentEl = ensureMessageContent(
        recordEl.querySelector(`.rmsg-item[data-msg="${match.msgIdx}"]`),
    );
    return contentEl ? { recordEl, contentEl } : null;
}

/* Thu thập tất cả kết quả khớp của một bản ghi trong các kết quả toàn cục hiện có, đồng thời giữ lại chỉ số của chúng trong matches. */
function getGlobalSearchMatchesForRecord(record) {
    const indexedMatches = [];
    if (!globalSearchState || !record) return indexedMatches;
    globalSearchState.matches.forEach((match, idx) => {
        if (match.record === record) indexedMatches.push({ match, idx });
    });
    return indexedMatches;
}

/* Vẽ bù highlight tìm kiếm toàn cục cho một bản ghi đã mở rộng; manual=true biểu thị người dùng duyệt thủ công, vẫn giữ lại sau khi rời khỏi kết quả hiện tại.
   Ở đây chỉ đọc kết quả hiện có, không sửa đổi currentIdx, bộ đếm hay vị trí cuộn. */
function paintGlobalSearchRecord(recordEl, record, {
    manual = false,
    redraw = false,
    paintCurrent = true,
    currentMatchIdx = null,
} = {}) {
    if (!globalSearchState || !recordEl || !record || record.collapsed) return false;
    const indexedMatches = getGlobalSearchMatchesForRecord(record);
    if (indexedMatches.length === 0) return false;

    const previousEntry = globalSearchState.highlightedRecords.get(record);
    const keepManual = !!(manual || previousEntry?.manual);
    if (previousEntry?.domPainted && !redraw) {
        previousEntry.manual = keepManual;
        return true;
    }

    /* Trước khi vẽ lại cần khôi phục bản ghi này trước, tránh việc gọi lặp lại làm xếp chồng mark. */
    restoreSearchHighlights(recordEl);
    const candidateIdx = Number.isInteger(currentMatchIdx)
        ? currentMatchIdx
        : globalSearchState.currentIdx;
    const currentIdx = candidateIdx >= 0
        && globalSearchState.matches[candidateIdx]?.record === record
        ? candidateIdx
        : -1;
    highlightRecordMatches(recordEl, record, indexedMatches, currentIdx);
    globalSearchState.highlightedRecords.set(record, {
        manual: keepManual,
        domPainted: true,
    });

    if (paintCurrent && currentIdx >= 0) {
        const currentMatch = globalSearchState.matches[currentIdx];
        const msg = getMessageByIndex(record, currentMatch.msgIdx);
        if (msg) {
            if (msg.collapsed) {
                msg.collapsed = false;
                const msgItem = recordEl.querySelector(`.rmsg-item[data-msg="${currentMatch.msgIdx}"]`);
                if (msgItem) {
                    msgItem.classList.add('expanded');
                    msgItem.classList.remove('collapsed');
                }
            }
            const contentEl = ensureMessageContent(
                recordEl.querySelector(`.rmsg-item[data-msg="${currentMatch.msgIdx}"]`),
            );
            if (contentEl) {
                highlightRange(
                    contentEl,
                    currentMatch.start,
                    currentMatch.end,
                    'rlog-search-mark-current',
                );
                requestThumbUpdate(contentEl);
            }
        }
    }
    return true;
}

/* Vẽ bù highlight màu vàng khi mở rộng thủ công bản ghi hoặc tin nhắn; không thay đổi mục màu cam hiện tại và bộ đếm. */
function refreshGlobalSearchHighlightsForManualOpen(recordEl, record) {
    if (!globalSearchState || !recordEl || !record) return;
    paintGlobalSearchRecord(recordEl, record, { manual: true });
}

/* Sau khi dựng lại toàn bộ bảng, dùng object bản ghi để định vị lại và vẽ bù các bản ghi highlight đang mở rộng hiện tại.
   Bản ghi thu gọn không bắt buộc dựng chính văn ở đây, đợi khi người dùng mở rộng lại mới đi theo luồng vẽ bù thủ công. */
function repaintGlobalSearchHighlightsAfterRender(listEl) {
    if (!globalSearchState || !listEl) return;
    globalSearchState.highlightedRecords.forEach((entry, record) => {
        if (record.collapsed) return;
        const recordEl = getRecordElForSearchRecord(record);
        if (!recordEl || !listEl.contains(recordEl)) return;
        paintGlobalSearchRecord(recordEl, record, {
            manual: entry.manual,
            redraw: true,
        });
    });
}

/* Nhảy đến kết quả khớp chỉ định trong các kết quả toàn cục. Khi chuyển qua lại giữa các bản ghi chỉ vẽ lại bản ghi mục tiêu rời đi/bước vào; các bản ghi đã duyệt thủ công vẫn giữ màu vàng. */
function applyGlobalCurrentMatch(matchIdx) {
    if (!globalSearchState || !panelEl) return;
    const previousIdx = globalSearchState.currentIdx;
    const previousCurrent = previousIdx >= 0
        ? globalSearchState.matches[previousIdx]
        : null;
    const match = globalSearchState.matches[matchIdx];
    if (!match) return;
    const target = prepareGlobalSearchTarget(match);
    if (!target) return;

    const { recordEl, contentEl } = target;
    const record = match.record;
    const highlightedEntry = globalSearchState.highlightedRecords.get(record);
    const sameRecord = previousCurrent?.record === record;

    if (sameRecord && highlightedEntry?.domPainted) {
        clearCurrentHighlight(previousIdx);
        removeYellowMarkByMatchIdx(matchIdx);
    } else {
        if (previousCurrent && !sameRecord) {
            const previousRecord = previousCurrent.record;
            const previousEntry = globalSearchState.highlightedRecords.get(previousRecord);
            if (previousEntry?.manual) {
                /* Bản ghi người dùng đã duyệt thủ công vẫn giữ màu vàng, chỉ hạ cấp mục hiện tại màu cam vừa rời đi. */
                clearCurrentHighlight(previousIdx);
            } else {
                const previousRecordEl = getRecordElForSearchRecord(previousRecord);
                if (previousRecordEl) restoreSearchHighlights(previousRecordEl);
                globalSearchState.highlightedRecords.delete(previousRecord);
            }
        }
        paintGlobalSearchRecord(recordEl, record, {
            manual: !!highlightedEntry?.manual,
            redraw: true,
            paintCurrent: false,
            currentMatchIdx: matchIdx,
        });
    }

    /* Chỉ dựng bổ sung thanh tiến trình bất đồng bộ khi điều hướng tìm kiếm; chính văn đã hiển thị nên chi phí trễ không ảnh hưởng đến highlight lần này. */
    setTimeout(() => createScrollbarForContent(contentEl), SCROLLBAR_CREATE_DELAY_MS);
    const markEl = highlightRange(contentEl, match.start, match.end, 'rlog-search-mark-current');
    globalSearchState.currentIdx = matchIdx;
    updateGlobalSearchControls();
    if (markEl) scrollToMatch(markEl, contentEl);
}

/* Nhảy vòng lặp trong chuỗi kết quả toàn cục. */
function navigateGlobalSearch(direction) {
    if (!globalSearchState || globalSearchState.matches.length === 0) return;
    reconcileGlobalSearchResults(false);
    if (globalSearchState.matches.length === 0) return;
    const total = globalSearchState.matches.length;
    let nextIdx = globalSearchState.currentIdx + direction;
    if (nextIdx >= total) nextIdx = 0;
    if (nextIdx < 0) nextIdx = total - 1;
    applyGlobalCurrentMatch(nextIdx);
}

/* Nhấp Tìm kiếm/Cập nhật hoặc nhấn Enter để thực thi: Luôn dựa trên danh sách đang nhìn thấy và từ khóa đang nhập hiện tại làm chuẩn. */
function performGlobalSearch() {
    if (!panelEl) return;
    const { input } = getGlobalSearchEls();
    if (!input) return;
    const listEl = panelEl.querySelector('#rlog-list');
    if (listEl) restoreSearchHighlights(listEl);
    globalSearchState = null;

    const keyword = input.value;
    if (!keyword) {
        updateGlobalSearchControls();
        return;
    }

    const matches = [];
    getDisplayOrderedVisibleRecords().forEach((record) => {
        findMatchesInRecordData(record, keyword).forEach((match) => {
            matches.push({ record, ...match });
        });
    });
    globalSearchState = {
        keyword,
        matches,
        currentIdx: -1,
        hasNewData: false,
        highlightedRecords: new Map(),
    };
    if (matches.length > 0) {
        globalSearchState.currentIdx = 0;
        applyGlobalCurrentMatch(0);
    } else {
        updateGlobalSearchControls();
    }
}

/* Mở chế độ tìm kiếm cho bản ghi chỉ định (nguyên tắc độc quyền: tại một thời điểm chỉ duy nhất 1 bản ghi ở trạng thái tìm kiếm)
   @param {number} recordIndex Chỉ số bản ghi */
function openSearchForRecord(recordIndex) {
    if (!panelEl) return;
    /* Độc quyền: Khi ngăn kéo tìm kiếm toàn cục đang mở thì đóng lại trước, sau đó thoát khỏi các tìm kiếm đơn lẻ khác */
    if (globalSearchOpen) {
        setGlobalSearchDrawerOpen(false);
        scheduleBodyBandPass(panelEl.querySelector('#rlog-list'));
    }
    resetSearchIfActive();

    const listEl = panelEl.querySelector('#rlog-list');
    const recordEl = listEl.querySelector(`.rlog-record[data-record-index="${recordIndex}"]`);
    if (!recordEl) return;

    const actionsEl = recordEl.querySelector('.rlog-record-actions');
    const actionsInner = recordEl.querySelector('.rlog-record-actions-inner');
    if (!actionsEl || !actionsInner) return;

    /* Đánh dấu "Đang tìm kiếm": CSS ẩn các nút khác ngoài kính lúp và mũi tên xuống, giải phóng không gian cho hộp tìm kiếm mở rộng sang phải */
    recordEl.classList.add('rlog-searching');

    /* Ẩn mũi tên thu gọn/mở rộng (▾): Dùng visibility để giữ lại chỗ chiếm dụng, phối hợp cùng CSS cố định chiều rộng của actions-inner,
       đảm bảo vị trí kính lúp không bị xô lệch */
    const toggleIcon = recordEl.querySelector('.rlog-toggle-icon');
    if (toggleIcon) toggleIcon.style.visibility = 'hidden';

    /* Bản ghi thu gọn tự động mở rộng (highlight tìm kiếm cần vùng nội dung hiển thị) */
    const record = records[recordIndex];
    if (record && record.collapsed) {
        record.collapsed = false;
        recordEl.classList.add('expanded');
        recordEl.classList.remove('collapsed');
        ensureRecordBody(recordEl);
        /* Sau khi mở rộng, tạo lười thanh tiến trình cho vùng nội dung tin nhắn (chỉ tạo ngay trong viewport, còn lại trì hoãn) */
        queueScrollbarsForEls(recordEl.querySelectorAll('.rmsg-content'));
    }

    /* Xây dựng DOM hộp tìm kiếm: Nút kính lúp giữ nguyên vị trí làm điểm neo thị giác, hộp tìm kiếm mở rộng ở bên phải */
    const searchBox = document.createElement('div');
    searchBox.className = 'rlog-search-box';
    searchBox.innerHTML = `
        <div class="rlog-search-input-wrap">
            <input type="text" class="rlog-search-input" placeholder="Tìm kiếm..." autocomplete="off" spellcheck="false">
            <span class="rlog-search-count" role="group" aria-label="Thứ tự kết quả tìm kiếm">0/0</span>
        </div>
        <button class="rlog-search-next" title="Tiếp theo (Enter)" disabled>
            <i class="fa-solid fa-arrow-down"></i>
        </button>
        <button class="rlog-search-prev" title="Trước đó (Shift+Enter)" disabled>
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
    const counterEl = searchBox.querySelector('.rlog-search-count');

    bindSearchCountJump(counterEl, {
        getCurrent: () => searchState && searchState.currentIdx >= 0
            ? searchState.currentIdx + 1
            : 0,
        getTotal: () => searchState ? searchState.matches.length : 0,
        beforeEdit: () => {
            if (searchDebounceTimer === null) return;
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
            performSearch(recordIndex, input.value);
        },
        onJump: (targetIdx) => {
            const match = searchState ? searchState.matches[targetIdx] : null;
            if (match) applyCurrentMatch(match.msgIdx, targetIdx, false);
        },
    });
    updateSearchCounter();

    /* boolean: Cờ trạng thái bộ gõ IME (sự kiện input không kích hoạt tìm kiếm khi ký tự chưa được xác nhận lên màn hình) */
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

    /* Bỏ qua sự kiện input trong quá trình tổ hợp của bộ gõ IME */
    input.addEventListener('compositionstart', () => { isComposing = true; });
    /* Kết thúc tổ hợp (ký tự đã lên màn hình): Thực hiện bù một lần tìm kiếm (có thể đã bỏ lỡ input trong lúc tổ hợp) */
    input.addEventListener('compositionend', () => {
        isComposing = false;
        scheduleSearch();
    });

    /* Tìm kiếm thời gian thực khi nhập (debounce) */
    input.addEventListener('input', (e) => {
        if (isComposing || e.isComposing || e.keyCode === 229) return;
        scheduleSearch();
    });

    /* Phím tắt: Enter kế tiếp / Shift+Enter trước đó / Esc đóng */
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

/* Tên Model → Nhóm bộ lọc: DeepSeek / Claude / Gemini (gồm Gemma, Palm) cố định thành nhóm, còn lại quy về "other".
   Tách biệt và không tái sử dụng với extractModelFamily() (dùng cho phân tách từ): DeepSeek cần tạo nhóm độc lập. */
function getModelFilterGroup(modelName) {
    if (!modelName || modelName === '未知模型' || modelName === 'Model không xác định') return 'other';
    const m = modelName.toLowerCase();
    if (m.includes('deepseek')) return 'deepseek';
    if (m.includes('claude')) return 'claude';
    if (m.includes('gemini') || m.includes('gemma') || m.includes('palm')) return 'gemini';
    return 'other';
}

/* Role tin nhắn → Nhóm bộ lọc: system / user / assistant cố định, còn lại (tool, developer, v.v.) quy về "other" */
function getRoleFilterGroup(role) {
    if (role === 'system') return 'system';
    if (role === 'user') return 'user';
    if (role === 'assistant') return 'assistant';
    return 'other';
}

/* Tin nhắn con (bao gồm tin nhắn giả Response) có vượt qua bộ lọc role hay không: Bộ lọc role phán định theo từng tin nhắn, không trực tiếp quyết định toàn bộ bản ghi */
function isMessageVisible(msg) {
    if (!msg) return false;
    return !!filterState.role[getRoleFilterGroup(msg.role)];
}

/* Bản ghi có vượt qua bộ lọc hiện tại hay không:
   Nguồn/Model phán định theo toàn bộ bản ghi; role phán định theo từng tin nhắn con — bản thân bản ghi chỉ cần còn
   ít nhất một tin nhắn con hiển thị (tin nhắn thông thường hoặc phản hồi) là được giữ lại, ngược lại sẽ bị ẩn theo danh sách. */
function matchesFilter(record) {
    if (!record) return false;
    const sourceKey = record.source && record.source.type === 'native' ? 'native' : 'plugin';
    if (!filterState.source[sourceKey]) return false;
    const hasVisibleMessage = record.messages.some(isMessageVisible)
        || (record.reply ? isMessageVisible(record.reply) : false)
        || getRecordToolEntries(record).some(isMessageVisible);
    if (!hasVisibleMessage) return false;
    const modelKey = getModelFilterGroup(record.modelName);
    if (!filterState.model[modelKey]) return false;
    return true;
}

/* Danh sách bản ghi nhìn thấy (chỉ ảnh hưởng render; mảng records giữ nguyên, data-record-index trên DOM vẫn là chỉ số thực) */
function getVisibleRecords() {
    return records.filter(matchesFilter);
}

/* Đã có bộ lọc nào hiệu lực hay chưa (công tắc của bất kỳ nhóm nào bị tắt) */
function isFilterActive() {
    return Object.keys(filterState).some((group) =>
        Object.keys(filterState[group]).some((key) => !filterState[group][key])
    );
}

/* Tạo mới một trạng thái bộ lọc mặc định "mở toàn bộ" (dùng cho Product Tour tạm lưu/khôi phục) */
function createDefaultFilterState() {
    return {
        source: { native: true, plugin: true },
        role: { system: true, user: true, assistant: true, other: true },
        model: { gemini: true, claude: true, deepseek: true, other: true },
    };
}

/* Lưu trữ bền vững trạng thái bộ lọc hiện tại vào cài đặt tiện ích mở rộng ST (chỉ gọi khi bật công tắc "Lưu giữ trạng thái bộ lọc") */
function saveFilterState() {
    if (pluginSettings) pluginSettings.filterState = sanitizeFilterState(filterState);
    persistPluginSettings();
}

/* Làm sạch trạng thái bộ lọc đọc về từ cài đặt tiện ích mở rộng ST: Lấy mặc định mở toàn bộ làm chuẩn, duyệt từng nhóm từng key chỉ tiếp nhận giá trị boolean, còn lại fallback về true */
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

/* Tải trạng thái bộ lọc đã lưu bền vững trong ST và ghi đè filterState hiện tại (chỉ đọc khi bật công tắc "Lưu giữ trạng thái bộ lọc");
   không có giá trị / parse thất bại / dữ liệu không hợp lệ đều fallback về mặc định mở toàn bộ. */
function loadPersistedFilterState() {
    if (!preferences.filterPersist) return;
    filterState = sanitizeFilterState(pluginSettings && pluginSettings.filterState);
}

/* Đường dẫn SVG biểu tượng thương hiệu model (simple-icons đơn sắc 24×24, fill="currentColor", inline không dùng tệp hình ảnh) */
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

/* Cập nhật chỉ báo "N ẩn" cạnh tiêu đề (chỉ hiển thị số lượng bản ghi bị ẩn do bộ lọc) và điểm tròn kích hoạt nút bộ lọc
   @param {Array} [visibleRecords] Các bản ghi nhìn thấy đã tính toán xong (renderPanelContent đã tính một bản, truyền vào để tránh duyệt trùng lặp) */
function updateFilterIndicator(visibleRecords) {
    if (!panelEl) return;
    const active = isFilterActive();
    const indicator = panelEl.querySelector('#rlog-filter-indicator');
    if (indicator) {
        /* Chỉ hiển thị số lượng bản ghi bị ẩn do bộ lọc; không có ẩn thì giấu chỉ báo, chỉ giữ điểm tròn trên nút */
        const hiddenCount = records.length - (visibleRecords || getVisibleRecords()).length;
        const showText = active && hiddenCount > 0;
        indicator.hidden = !showText;
        if (showText) {
            const textEl = panelEl.querySelector('#rlog-filter-indicator-text');
            if (textEl) textEl.textContent = `${hiddenCount} ẩn`;
        }
    }
    const btn = panelEl.querySelector('#rlog-filter-btn');
    if (btn) btn.classList.toggle('rlog-filter-active', active);
}

/* Làm mới trạng thái thị giác bật/tắt của tất cả nút phân đoạn trong ngăn kéo (aria-pressed đồng bộ trạng thái trợ năng) */
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

/* Bộ lọc sẽ làm thay đổi phạm vi bản ghi nhìn thấy: Kết thúc tìm kiếm toàn cục trước để tránh trường hợp kết quả cũ chỉ có thể xóa bớt mà không thể bổ sung bản ghi mới.
   Các thao tác ngăn kéo thông thường đã đáp ứng ràng buộc này khi mở bộ lọc; ở đây bọc lót cho các lối vào như đặt lại cạnh tiêu đề, đặt lại ở trạng thái rỗng và khôi phục khi hướng dẫn. */
function endGlobalSearchForFilterChange() {
    if (!globalSearchOpen) return;
    setGlobalSearchDrawerOpen(false);
    scheduleBodyBandPass(panelEl ? panelEl.querySelector('#rlog-list') : null);
}

/* Chuyển đổi công tắc bộ lọc đơn lẻ và dựng lại danh sách (khi dựng lại thì tìm kiếm đơn lẻ tự động thoát, nhất quán với hành vi render hiện có) */
function toggleFilterChip(group, value) {
    if (!filterState[group] || !(value in filterState[group])) return;
    endGlobalSearchForFilterChange();
    filterState[group][value] = !filterState[group][value];
    updateFilterChipUI();
    panelContentDirty = true;
    /* Lưu vào đĩa ngay khi bật "Lưu giữ trạng thái bộ lọc" */
    if (preferences.filterPersist) saveFilterState();
    if (panelEl && isPanelExpanded) renderPanelContent();
}

/* Đặt lại toàn bộ bộ lọc thành "mở toàn bộ" và làm mới danh sách
   @param {boolean} [persist=true] Có lưu vào đĩa sau khi đặt lại hay không (người dùng đặt lại thủ công = true; các lệnh gọi theo quy trình như Product Tour truyền false,
      tránh việc hướng dẫn ghi đè bộ lọc đã lưu bền vững của người dùng thành mở toàn bộ khi bắt đầu) */
function resetFilters(persist = true) {
    endGlobalSearchForFilterChange();
    filterState = createDefaultFilterState();
    updateFilterChipUI();
    updateFilterIndicator();
    panelContentDirty = true;
    if (persist && preferences.filterPersist) saveFilterState();
    if (panelEl && isPanelExpanded) renderPanelContent();
}

/* ── Render và xây dựng HTML ──────────────────── */

function getHeaderCountText() {
    return `${records.length}/${MAX_RECORDS}`;
}

/* Cập nhật thời gian thực nhãn nguồn (gọi sau khi hiệu chỉnh nguồn / chứng cứ vị trí E3 bị hủy bỏ):
   Thuộc tính bộ lọc không đổi → Cập nhật định điểm nhãn nguồn và huy hiệu của bản ghi đó; thuộc tính bộ lọc thay đổi → Vẽ lại toàn bộ bảng và làm mới chỉ báo cùng bộ đếm;
   Panel không hiển thị / Đang trong Product Tour → Chỉ đánh dấu dirty, đưa vào lần render kế tiếp.
   @param {object} record Bản ghi mục tiêu @param {string} prevSourceType Loại nguồn trước khi thay đổi */
function refreshRecordSourceDom(record, prevSourceType) {
    panelContentDirty = true;
    if (!record) return;

    const newType = (record.source && record.source.type === 'native') ? 'native' : 'plugin';
    const membershipChanged = isFilterActive() && !!prevSourceType && prevSourceType !== newType
        && !filterState.source[newType];
    if (membershipChanged) {
        if (panelEl && isPanelExpanded && !tourActive) renderPanelContent();
        return;
    }
    if (!panelEl || !isPanelExpanded || tourActive) return;

    const idx = records.indexOf(record);
    const listEl = idx >= 0 ? panelEl.querySelector('#rlog-list') : null;
    const recordEl = listEl ? listEl.querySelector(`.rlog-record[data-record-index="${idx}"]`) : null;
    if (!recordEl) {
        /* Bản ghi không có trong DOM (bị ẩn bởi bộ lọc role / model, hoặc vẫn nằm trong hàng đợi tạm lưu của Product Tour): Chỉ cần làm mới chỉ báo và bộ đếm */
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
    const toolNameHtml = msg.role === 'tool' && typeof msg.toolName === 'string' && msg.toolName.trim()
        ? `<span class="rmsg-tool-name" title="${escapeHtml(msg.toolName)}">${escapeHtml(msg.toolName)}</span>`
        : '';
    const toolCallIdHtml = msg.role === 'tool' && typeof msg.toolCallId === 'string' && msg.toolCallId.trim()
        ? `<span class="rmsg-tool-id" title="${escapeHtml(msg.toolCallId)}">${escapeHtml(msg.toolCallId)}</span>`
        : '';
    const collapsedClass = msg.collapsed ? 'collapsed' : 'expanded';
    const tokenText = getMessageTokenText(msg);
    const displayText = getMessageDisplayText(msg);
    const readBtnHidden = shouldOfferMessageRead(msg) ? '' : ' hidden';
    /* Response cố định hiển thị chỉ số hiệu năng, TOOL cố định hiển thị tên và ID; cả hai đều không hiển thị bản xem trước chính văn. */
    const showPreview = forcePreviewState !== null ? forcePreviewState : contentPreviewEnabled;
    let previewHtml = '';
    if (msg.role === 'response') {
        previewHtml = buildResponseMetaHtml(msg, recordIdx, msgIdx);
    } else if (msg.role !== 'tool' && showPreview) {
        previewHtml = `<span class="rmsg-preview-text" title="${escapeHtml(displayText.slice(0, 200))}">${escapeHtml(getContentPreview(displayText))}</span>`;
    }
    /* Tin nhắn thu gọn không tạo chính văn: Chính văn để dành đến khi mở rộng sẽ do ensureMessageContent() dựng bổ sung, nếu không mỗi lần dựng lại toàn bộ bảng
       đều phải ghép chuỗi và phân tích lại toàn bộ chính văn prompt của tất cả bản ghi (bao gồm cả phần thu gọn).
       Đệm một dấu xuống dòng sau <pre>: Thứ bị parser nuốt là dấu này, chính văn (bao gồm dòng trống ở đầu) sẽ hiển thị nguyên vẹn */
    const contentHtml = msg.collapsed ? '' : `<pre class="rmsg-content">\n${escapeHtml(displayText)}</pre>`;
    return `
        <div class="rmsg-item ${collapsedClass} ${roleClass}" data-record="${recordIdx}" data-msg="${msgIdx}">
            <div class="rmsg-header">
                <span class="rmsg-expand-icon"><i class="fa-solid fa-chevron-right"></i></span>
                <span class="rmsg-role-badge ${roleClass}">${escapeHtml(roleLabel)}</span>
                ${toolNameHtml}
                ${toolCallIdHtml}
                ${previewHtml}
                <span class="rmsg-tokens">${tokenText}</span>
                <button class="rmsg-read-btn" data-record="${recordIdx}" data-msg="${msgIdx}" title="Xem tin nhắn" aria-label="Xem toàn văn tin nhắn này"${readBtnHidden}>
                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                </button>
                <button class="rmsg-copy-btn" data-record="${recordIdx}" data-msg="${msgIdx}" title="Sao chép tin nhắn này">
                    <i class="fa-solid fa-copy"></i>
                </button>
            </div>
            ${contentHtml}
        </div>
    `;
}

/* Ghép nối HTML chính văn bản ghi (tin nhắn con nhìn thấy + Response + TOOL): Dùng chung cho việc render toàn bộ bảng và dựng bổ sung theo nhu cầu của bản ghi thu gọn.
   Bộ lọc role lọc theo từng tin nhắn con: Chỉ ghép các tin nhắn con nhìn thấy, data-msg vẫn ghi chỉ số thực;
   Response nằm ở messages.length, TOOL được đánh số thứ tự từ messages.length + 1 trở đi.
   @param {object} rec @param {number} idx @returns {string} */
function buildRecordMessagesHtml(rec, idx) {
    let html = rec.messages
        .map((msg, mIdx) => ({ msg, mIdx }))
        .filter(({ msg }) => isMessageVisible(msg))
        .map(({ msg, mIdx }) => buildMessageHtml(msg, idx, mIdx))
        .join('');
    if (rec.reply && isMessageVisible(rec.reply)) {
        html += buildMessageHtml(rec.reply, idx, rec.messages.length);
    }
    getRecordToolEntries(rec).forEach((toolEntry, toolIdx) => {
        if (!isMessageVisible(toolEntry)) return;
        html += buildMessageHtml(toolEntry, idx, rec.messages.length + 1 + toolIdx);
    });
    return html;
}

/* Bản ghi thu gọn chỉ hiển thị thanh tiêu đề, chính văn (tiêu đề tin nhắn con + chính văn) để dành khi mở rộng sẽ dựng bổ sung theo nhu cầu; phần đã dựng sẽ tái sử dụng trực tiếp.
   Mọi luồng cần DOM chính văn (mở rộng bản ghi, tìm kiếm và highlight, mở rộng/thu gọn tất cả tin nhắn, chuyển nhanh xuống đáy) đều phải đi qua đây trước.
   Bản ghi đã được off-screen unload: Phần tử và thanh tiêu đề vẫn còn, chỉ có chữ trong chính văn bị xóa rỗng, lúc này dựa vào needText để quyết định có bù lại trước hay không —
   luồng chỉ cần phần tử và hình học (thu gọn tất cả tin nhắn của bản ghi này, chuyển nhanh xuống đáy) truyền false, tránh việc dựng uổng công toàn bộ chính văn.
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
    /* Chính văn bản ghi đã dựng, nhưng trong đó có một số chính văn tin nhắn đã bị off-screen unload: Luồng này cần đọc chính văn thì bù lại trước */
    if (needText) restoreRecordBodies(recordEl);
    return bodyEl;
}

/* Tin nhắn thu gọn chỉ hiển thị thanh tiêu đề, chính văn để dành khi mở rộng sẽ dựng bổ sung theo nhu cầu.
   Chuẩn văn bản cùng nguồn với render toàn bộ bảng (thông qua toRenderedText), nếu không độ lệch tìm kiếm bên trong bản ghi sẽ bị lệch so với văn bản trên trang.
   Phần tử chính văn đã bị off-screen unload vẫn còn (chỉ là chữ bị xóa rỗng, chiều cao bị khóa), bắt buộc phải khôi phục trước rồi mới trả về,
   nếu không "phần tử đã tồn tại" sẽ bị phán đoán nhầm thành chính văn đã sẵn sàng, mở rộng ra sẽ nhận về một khoảng trắng tinh.
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
    pre.textContent = toRenderedText(getMessageDisplayText(msg));
    msgItem.appendChild(pre);
    return pre;
}

/* Khi ngưỡng thay đổi chỉ làm mới phối màu Token của các bản ghi đang nhìn thấy, không dựng lại danh sách, tránh làm gián đoạn trạng thái cuộn, tìm kiếm và mở rộng */
function refreshTokenTierClasses() {
    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    if (!listEl) return;
    listEl.querySelectorAll('.rlog-record[data-record-index]').forEach((recordEl) => {
        const record = records[Number(recordEl.dataset.recordIndex)];
        const tokenEl = recordEl.querySelector('.rlog-token-num');
        if (!record || !tokenEl) return;
        tokenEl.className = `rlog-token-num ${getTokenTierClass(getRecordPromptTokens(record))}`;
    });
}

function renderPanelContent() {
    if (!panelEl) return;

    /* Dựng lại toàn bộ bảng sẽ thay thế điểm neo ⓘ: Thu lại phần chú thích trước, tránh lớp nổi nằm lại cạnh phần tử đã mất hiệu lực */
    hideResponseMetaTip();
    /* Trước khi dựng lại DOM bắt buộc phải dọn dẹp trạng thái tìm kiếm (highlight tìm kiếm, tham chiếu hộp tìm kiếm đến nút DOM cũ sẽ bị mất hiệu lực) */
    resetSearchIfActive();

    const listEl = panelEl.querySelector('#rlog-list');
    if (!listEl) return;

    /* Bản ghi nhìn thấy chỉ tính toán một lần: Chỉ báo "N ẩn" và danh sách render bên dưới dùng chung một bản (mỗi bản ghi đều phải duyệt tin nhắn con để phán định bộ lọc role) */
    const visibleRecords = getVisibleRecords();
    /* Tìm kiếm toàn cục độc lập với tìm kiếm đơn lẻ: Trước khi dựng lại toàn bộ bảng chỉ dọn dẹp các kết quả khớp không còn nhìn thấy, không tìm kiếm lại chính văn, không làm mất từ khóa. */
    reconcileGlobalSearchResults(true);
    updateHeaderTitle();
    updateFilterIndicator(visibleRecords);

    if (records.length === 0) {
        panelEl.classList.add('rlog-empty-list');
        const emptyMsg = masterEnabled 
            ? 'Chưa có nhật ký yêu cầu, vui lòng gửi tin nhắn rồi xem lại.'
            : 'Chức năng ghi nhật ký đã tắt, vui lòng nhấp vào biểu tượng nguồn để bật.';
        listEl.innerHTML = `<div class="rlog-empty">${escapeHtml(emptyMsg)}</div>`;
        pruneDetachedUnloadedBodies();
        panelContentDirty = false;
        return;
    }
    panelEl.classList.remove('rlog-empty-list');

    /* Sau khi lọc không có bản ghi nào hiển thị: Trạng thái rỗng chuyên dụng + đặt lại một chạm (phân biệt với "Chưa có nhật ký") */
    if (visibleRecords.length === 0) {
        panelEl.classList.add('rlog-empty-list');
        listEl.innerHTML = `<div class="rlog-empty"><div>Không có bản ghi phù hợp với điều kiện lọc</div><button id="rlog-filter-reset-empty" class="rlog-filter-reset-empty-btn">Đặt lại bộ lọc</button></div>`;
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

    /* Chiều rộng vị trí nhãn trạng thái được ghi vào biến CSS: Chỗ chiếm dụng chờ đợi và nhãn sau khi đến dùng chung, tránh layout thanh tiêu đề bị giật */
    const statusMaxW = getReplyStatusMaxWidth();
    if (statusMaxW > 0) {
        panelEl.style.setProperty('--rlog-status-w', `${statusMaxW}px`);
    }

    /* Chỉ render các bản ghi nhìn thấy; bản ghi ghim render trước, bản ghi thông thường theo sau, trong nhóm con giữ nguyên thứ tự gốc của records (mới → cũ).
       data-record-index của DOM ghi chỉ số thực trong records thay vì vị trí hiển thị, luồng lấy dữ liệu theo chỉ số không cần đổi ngữ nghĩa */
    const displayRecords = getDisplayOrderedVisibleRecords(visibleRecords);
    const displayIndexes = displayRecords.map((rec) => records.indexOf(rec));
    listEl.innerHTML = displayRecords
        .map((rec, vi) => {
            const idx = displayIndexes[vi];
            const totalTokens = getRecordPromptTokens(rec);
            const collapsedClass = rec.collapsed ? 'collapsed' : 'expanded';
            const pinnedClass = rec.pinned ? 'rlog-pinned' : '';
            const sourceLabel = getSourceLabel(rec.source);
            const sourceClass = getSourceClass(rec.source);
            const sourceType = sourceClass === 'rlog-source-native' ? 'native' : 'plugin';
            const sourceTitle = (rec.source && rec.source.detail) || sourceLabel;

            const allPrecise = rec.messages.every(m => m.tokenPrecise === true);
            const recordTokenPrefix = allPrecise ? '' : '~';

            /* Bản ghi thu gọn chỉ hiển thị thanh tiêu đề, toàn bộ chính văn để dành khi mở rộng sẽ do ensureRecordBody() dựng bổ sung */
            const messagesHtml = rec.collapsed ? '' : buildRecordMessagesHtml(rec, idx);

            /* Nhãn trạng thái phản hồi: Chỉ hiển thị giữa nhóm nút và mũi tên thu gọn khi đang thu gọn; khi phản hồi đang trên đường tới sẽ xuất chỗ chiếm dụng trong suốt trước để giữ vị trí,
               sau khi đến sẽ do appendReplyToRecordDom thay thế tại chỗ thành nhãn trạng thái, không bị xuống dòng xô lệch trên màn hình hẹp */
            const recordStatus = getRecordStatus(rec);
            const replyStatusHtml = recordStatus
                ? `<span class="rlog-reply-status rlog-reply-status-${recordStatus}" title="${escapeHtml(getReplyStatusTitle(rec))}">${getReplyStatusLabel(recordStatus)}</span>`
                : (rec.id != null && pendingReplies.has(rec.id)
                    ? '<span class="rlog-reply-status rlog-reply-status-placeholder"></span>'
                    : '');

            return `
                <div class="rlog-record ${collapsedClass} ${pinnedClass}" data-source="${sourceType}" data-record-index="${idx}">
                    <div class="rlog-record-header">
                        <div class="rlog-record-info" title="Nhấn giữ để ghim / Nhấn giữ để bỏ ghim">
                            <span class="rlog-char-name">${escapeHtml(rec.characterName)}</span>
                            <span class="rlog-source-badge ${sourceClass}" title="${escapeHtml(sourceTitle)}"><span class="rlog-status-dot"></span>${escapeHtml(sourceLabel)}</span>
                            <span class="rlog-time">${escapeHtml(rec.timestamp)}</span>
                            <span class="rlog-model-badge" title="Model yêu cầu">${escapeHtml(rec.modelName || 'Model không xác định')}</span>
                            <span class="rlog-total-tokens">${recordTokenPrefix}<span class="rlog-token-num ${getTokenTierClass(totalTokens)}">${totalTokens}</span>&nbsp;tokens [${rec.messages.length}]</span>
                        </div>
                        <div class="rlog-record-actions">
                            <div class="rlog-record-actions-inner" style="display:flex; gap:4px; align-items:center;">
                                <button class="rlog-search-btn" data-record="${idx}" title="Tìm kiếm bản ghi này">
                                    <i class="fa-solid fa-magnifying-glass"></i>
                                </button>
                                <button class="rlog-msg-expand-btn" data-record="${idx}" title="Mở rộng tất cả tin nhắn">
                                    <i class="fa-solid fa-maximize"></i>
                                </button>
                                <button class="rlog-msg-collapse-btn" data-record="${idx}" title="Thu gọn tất cả tin nhắn">
                                    <i class="fa-solid fa-minimize"></i>
                                </button>
                                <button class="rlog-jump-bottom-btn" data-record="${idx}" title="Chuyển nhanh xuống đáy">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="4" x2="12" y2="15"></line><line x1="5" y1="20" x2="19" y2="20"></line></svg>
                                </button>
                                <button class="rlog-read-full-btn" data-record="${idx}" title="Xem toàn văn">
                                    <i class="fa-solid fa-clipboard-list"></i>
                                </button>
                                <button class="rlog-delete-record-btn" data-record="${idx}" title="Xóa bản ghi này">
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

    /* Dựng lại danh sách sẽ hủy mark cũ; vẽ lại mục tiêu hiện tại và các bản ghi mở rộng mà người dùng từng mở thủ công theo object bản ghi. */
    repaintGlobalSearchHighlightsAfterRender(listEl);

    /* Off-screen unload chính văn ngoài viewport tại chỗ (lúc này danh sách đã mount, hình học có thể đo lường): Lần mở này chỉ cần trả chi phí dàn trang và vẽ cho phần nhìn thấy.
       Đặt trước syncRecordHeaderVars để việc đo lại chiều cao tiêu đề ngay sau đó rơi vào layout tinh giản khi "chính văn đã unload" */
    runBodyBandPass(listEl);
    pruneDetachedUnloadedBodies();

    /* Ghi --rlog-rec-h (chiều cao đo thực tế của thanh tiêu đề bản ghi) cho mỗi bản ghi, phục vụ định vị sticky đỉnh của thanh tiêu đề tin nhắn */
    syncRecordHeaderVars(listEl);

    /* Tạo thanh tiến trình overlay cho vùng nội dung tin nhắn */
    attachScrollIndicators(listEl);

    /* Render hoàn tất, xóa cờ dirty (lần mở panel kế tiếp không cần dựng lại DOM) */
    panelContentDirty = false;
}

/* Đồng bộ --rlog-rec-h của mỗi bản ghi = chiều cao thực tế của thanh tiêu đề bản ghi: sticky top của thanh tiêu đề tin nhắn bắt buộc phải bằng nó mới có thể dính ngay
   bên dưới thanh tiêu đề bản ghi, trong khi thanh tiêu đề bản ghi sẽ cao hơn do xuống dòng (màn hình hẹp có thể đạt 100px+), nếu hardcode chiều cao sẽ bị che khuất.
   Chỉ ghi khi bố cục thay đổi, không tham gia vào cuộn từng khung hình.
   Đọc toàn bộ chiều cao một lần rồi mới ghi biến tập trung: Ghi biến sẽ làm style mất hiệu lực, việc đọc ghi xen kẽ sẽ biến mỗi lần đọc của bản ghi thành một lần forced reflow. */
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
        /* Dùng getBoundingClientRect().height (số thập phân) thay vì offsetHeight (làm tròn số nguyên):
           Chiều cao khi xuống dòng thường là số thập phân, làm tròn sẽ để lại khe hở subpixel giữa tiêu đề tin nhắn và tiêu đề bản ghi */
        measured.push([recordEl, headerEl.getBoundingClientRect().height]);
        /* Tự động làm mới độ lệch khi chiều cao thanh tiêu đề thay đổi (xuống dòng/font chữ/viewport thay đổi) */
        if (!observedRecordHeaders.has(headerEl)) {
            observedRecordHeaders.add(headerEl);
            /* Quan sát border-box: Chiều cao mà --rlog-rec-h ghi chính là chiều cao border-box (bao gồm padding), còn content-box mặc định
               sẽ không thông báo khi "chỉ có padding thay đổi", sẽ bỏ sót loại biến thiên chiều cao này khiến độ lệch sticky đỉnh không được cập nhật */
            sharedResizeObserver.observe(headerEl, { box: 'border-box' });
        }
    });
    measured.forEach(([recordEl, height]) => {
        recordEl.style.setProperty('--rlog-rec-h', `${height.toFixed(2)}px`);
    });
}

/* boolean: Đã có yêu cầu đo lại kích thước viewport xếp hàng ở frame kế tiếp hay chưa (gộp các resize liên tiếp thành một lần mỗi frame) */
let viewportSyncQueued = false;
/* number: ID requestAnimationFrame chờ thực thi của việc đồng bộ viewport panel; 0 = hiện không xếp hàng */
let viewportSyncFrameId = 0;
/* boolean: Đã có yêu cầu hiệu chỉnh viewport nút nổi xếp hàng ở frame kế tiếp hay chưa */
let badgeViewportSyncQueued = false;
/* number: ID requestAnimationFrame chờ thực thi của việc hiệu chỉnh viewport nút nổi; 0 = hiện không xếp hàng */
let badgeViewportSyncFrameId = 0;

/* number: Chiều rộng viewport tương ứng với mốc layout mobile hiện tại; 0 = không phải layout mobile hoặc chưa thiết lập mốc */
let mobilePanelLayoutWidth = 0;
/* number: Chiều cao mốc layout mobile hiện tại (px) */
let mobilePanelLayoutHeight = 0;
/* boolean: Đã có yêu cầu kiểm tra tính hiển thị của control đang hoạt động trong danh sách bản ghi xếp hàng ở frame kế tiếp hay chưa */
let activeListControlVisibilityQueued = false;
/* number: ID requestAnimationFrame chờ thực thi của việc kiểm tra tính hiển thị control đang hoạt động; 0 = hiện không xếp hàng */
let activeListControlVisibilityFrameId = 0;
/* number: Bộ hẹn giờ gộp các thay đổi chiều cao trên mobile; 0 = không có cập nhật chờ thực thi */
let mobileLayoutHeightSyncTimer = 0;
/* number: Thời hạn ân hạn giải phóng bàn phím sau khi control nhập mất focus; 0 = không nằm trong thời hạn ân hạn giải phóng */
let mobileKeyboardReleaseUntil = 0;
/* boolean: window.resize phục vụ panel hoặc nút nổi đã được gắn hay chưa */
let pageViewportResizeBound = false;
/* boolean: Listener focus / visibility / visualViewport dành riêng cho panel mobile đã được gắn hay chưa */
let mobilePanelViewportListenersBound = false;

/* Phán định viewport mobile: Nhất quán với breakpoint của style (breakpoint duy nhất 768px) */
function isMobileViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
}

/* Nút nổi có thực sự hiển thị hay không; khi mở rộng panel thì nút nổi phải được ẩn đi. */
function isBadgeVisible() {
    return !!badgeEl && badgeEl.classList.contains('rlog-badge-active');
}

/* Hủy đồng bộ viewport panel chưa thực thi, tránh tiếp tục duy trì panel ẩn sau khi đóng hoặc vượt breakpoint. */
function cancelPanelViewportSync() {
    if (viewportSyncFrameId) cancelAnimationFrame(viewportSyncFrameId);
    viewportSyncFrameId = 0;
    viewportSyncQueued = false;
}

/* Hủy kiểm tra tính hiển thị control đang hoạt động chưa thực thi. */
function cancelActiveListControlVisibility() {
    if (activeListControlVisibilityFrameId) {
        cancelAnimationFrame(activeListControlVisibilityFrameId);
    }
    activeListControlVisibilityFrameId = 0;
    activeListControlVisibilityQueued = false;
}

/* Hủy hiệu chỉnh viewport nút nổi chưa thực thi. */
function cancelBadgeViewportSync() {
    if (badgeViewportSyncFrameId) cancelAnimationFrame(badgeViewportSyncFrameId);
    badgeViewportSyncFrameId = 0;
    badgeViewportSyncQueued = false;
}

/* Sau khi cửa sổ được focus hoặc trang hiển thị trở lại, tính bù chiều cao mobile đã bỏ lỡ trong thời gian rời đi. */
function handleMobilePanelViewportFocus() {
    if (!isPanelExpanded || !isMobileViewport()) return;
    scheduleMobilePanelLayoutHeightSync();
}

/* Khi trang khôi phục từ nền, trình duyệt mobile có thể đã điều chỉnh chiều cao vùng nhìn thấy. */
function handleMobilePanelVisibilityChange() {
    if (!isPanelExpanded || document.hidden || !isMobileViewport()) return;
    scheduleMobilePanelLayoutHeightSync();
}

/* Điều phối tập trung hai nhóm listener viewport: Listener kích thước trang phục vụ panel hoặc nút nổi, ba nhóm còn lại chỉ phục vụ panel mobile. */
function syncViewportListenerLifecycle() {
    const needsPageResize = isPanelExpanded || isBadgeVisible();
    if (needsPageResize && !pageViewportResizeBound) {
        window.addEventListener('resize', handlePageViewportResize);
        pageViewportResizeBound = true;
    } else if (!needsPageResize && pageViewportResizeBound) {
        window.removeEventListener('resize', handlePageViewportResize);
        pageViewportResizeBound = false;
    }

    const needsMobilePanelViewport = isPanelExpanded && isMobileViewport();
    if (needsMobilePanelViewport && !mobilePanelViewportListenersBound) {
        window.addEventListener('focus', handleMobilePanelViewportFocus);
        document.addEventListener('visibilitychange', handleMobilePanelVisibilityChange);
        if (window.visualViewport) {
            window.visualViewport.addEventListener(
                'resize',
                scheduleActiveListControlVisibility,
            );
        }
        mobilePanelViewportListenersBound = true;
    } else if (!needsMobilePanelViewport && mobilePanelViewportListenersBound) {
        window.removeEventListener('focus', handleMobilePanelViewportFocus);
        document.removeEventListener('visibilitychange', handleMobilePanelVisibilityChange);
        if (window.visualViewport) {
            window.visualViewport.removeEventListener(
                'resize',
                scheduleActiveListControlVisibility,
            );
        }
        mobilePanelViewportListenersBound = false;
    }

    if (!isPanelExpanded) {
        cancelPanelViewportSync();
        cancelActiveListControlVisibility();
    }
    if (!needsMobilePanelViewport) {
        clearMobileLayoutHeightSync();
        cancelActiveListControlVisibility();
    }
    if (!isBadgeVisible()) cancelBadgeViewportSync();
}

/* Các control bên trong panel có thể làm mục tiêu nhập bàn phím; số thứ tự bộ đếm là contenteditable cũng đi qua cùng bộ phán định phiên này. */
function isMobileKeyboardEditable(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/* Đọc focus hiện tại của Shadow Root, phán định phiên bàn phím có còn nằm trong panel RRL hay không. */
function hasFocusedMobilePanelEditable() {
    const activeEl = panelShadowRoot ? panelShadowRoot.activeElement : null;
    return !!(activeEl && panelEl && panelEl.contains(activeEl) && isMobileKeyboardEditable(activeEl));
}

/* Lấy mục tiêu sự kiện khi có input mới thêm vào phiên bàn phím; composedPath có thể xuyên qua Shadow Root, trả về phần tử input thực tế. */
function getShadowEventTarget(event) {
    return event && typeof event.composedPath === 'function'
        ? event.composedPath()[0]
        : event && event.target;
}

/* Dọn dẹp cập nhật chiều cao đang chờ; tránh task cũ đến trễ khi chuyển đổi breakpoint layout hoặc ẩn panel. */
function clearMobileLayoutHeightSync() {
    if (!mobileLayoutHeightSyncTimer) return;
    clearTimeout(mobileLayoutHeightSyncTimer);
    mobileLayoutHeightSyncTimer = 0;
}

/* Kết thúc thời hạn ân hạn giải phóng của phiên bàn phím mobile, không làm thay đổi mốc chiều cao hiện tại. */
function resetMobileKeyboardSession() {
    mobileKeyboardReleaseUntil = 0;
    clearMobileLayoutHeightSync();
}

/* Input mobile nhận focus: Khi bàn phím chưa bật lên thì áp dụng chiều cao thực tế hiện tại trước, sau đó việc thu hẹp chiều cao trong phiên này sẽ được giữ đóng băng. */
function handleMobileEditableFocusIn(event) {
    const target = getShadowEventTarget(event);
    if (!isMobileViewport() || !isMobileKeyboardEditable(target)) return;
    if (!panelEl || !panelEl.contains(target)) return;
    mobileKeyboardReleaseUntil = 0;
    clearMobileLayoutHeightSync();
    if (!mobilePanelLayoutHeight
        || window.innerHeight >= mobilePanelLayoutHeight - MOBILE_LAYOUT_HEIGHT_TOLERANCE) {
        refreshMobilePanelLayoutForLayoutAction();
    }
}

/* Sau khi input mất focus thì đợi focus dừng hẳn: Chuyển đổi giữa các input cùng nhóm không giải phóng; chỉ khi còn lại control không phải input mới đợi bàn phím thu lại. */
function handleMobileEditableFocusOut() {
    requestAnimationFrame(() => {
        if (!isMobileViewport() || hasFocusedMobilePanelEditable()) return;
        mobileKeyboardReleaseUntil = Date.now() + MOBILE_KEYBOARD_RELEASE_GRACE_MS;
        scheduleMobilePanelLayoutHeightSync();
    });
}

/* Tất cả input đều nằm trong cùng một Shadow Root, chỉ cần lắng nghe một lần là bao quát được hộp tìm kiếm, hộp số tùy chọn và trình chỉnh sửa bộ đếm được thêm động. */
function installMobileKeyboardSessionTracking() {
    if (!panelShadowRoot || panelShadowRoot.rlogKeyboardSessionBound) return;
    panelShadowRoot.rlogKeyboardSessionBound = true;
    panelShadowRoot.addEventListener('focusin', handleMobileEditableFocusIn, true);
    panelShadowRoot.addEventListener('focusout', handleMobileEditableFocusOut, true);
}

/* Thiết lập mốc layout pixel của panel mobile. Giới hạn trên dưới thông thường và chiều cao toàn màn hình dùng chung một nhóm biến;
   phiên bàn phím chỉ giữ giá trị cũ khi phía gọi quyết định cập nhật. */
function syncMobilePanelLayoutMetrics(force = false) {
    if (!panelEl) return false;
    if (!isMobileViewport()) {
        const changed = mobilePanelLayoutWidth !== 0;
        panelEl.style.removeProperty('--rlog-panel-layout-h');
        panelEl.style.removeProperty('--rlog-mobile-min-h');
        panelEl.style.removeProperty('--rlog-mobile-max-h');
        mobilePanelLayoutWidth = 0;
        mobilePanelLayoutHeight = 0;
        return changed;
    }

    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    if (!force
        && mobilePanelLayoutWidth === width
        && Math.abs(mobilePanelLayoutHeight - height) <= 0.5) {
        return false;
    }
    panelEl.style.setProperty('--rlog-panel-layout-h', `${height}px`);
    panelEl.style.setProperty('--rlog-mobile-min-h', `${Math.round(height * 0.5)}px`);
    panelEl.style.setProperty('--rlog-mobile-max-h', `${Math.round(height * 0.75)}px`);
    mobilePanelLayoutWidth = width;
    mobilePanelLayoutHeight = height;
    return true;
}

/* Gộp thay đổi chiều cao mobile và loại trừ phần thu hẹp trong phiên bàn phím. Việc tăng chiều cao khi input vẫn focus được coi là bàn phím thu lại,
   có thể lập tức thiết lập mốc mới; sau khi mất focus thì chừa thời hạn ân hạn giải phóng, đợi bàn phím ảo hoàn tất animation thu lại. */
function scheduleMobilePanelLayoutHeightSync(delay = MOBILE_LAYOUT_HEIGHT_DELAY_MS) {
    clearMobileLayoutHeightSync();
    mobileLayoutHeightSyncTimer = setTimeout(() => {
        mobileLayoutHeightSyncTimer = 0;
        if (!panelEl || !isPanelExpanded || !isMobileViewport()) return;

        const height = Math.max(1, window.innerHeight);
        const shrink = mobilePanelLayoutHeight - height;
        const releasePending = Date.now() < mobileKeyboardReleaseUntil;
        if (shrink > MOBILE_LAYOUT_HEIGHT_TOLERANCE && hasFocusedMobilePanelEditable()) {
            scheduleActiveListControlVisibility();
            return;
        }
        if (shrink > MOBILE_LAYOUT_HEIGHT_TOLERANCE && releasePending) {
            scheduleMobilePanelLayoutHeightSync(
                Math.max(0, mobileKeyboardReleaseUntil - Date.now()) + 20,
            );
            scheduleActiveListControlVisibility();
            return;
        }

        const changed = syncMobilePanelLayoutMetrics(true);
        if (!changed) return;
        clampPanelGeometryAfterLayoutChange();
        schedulePanelViewportSync();
    }, Math.max(0, delay));
}

/* Người dùng chủ động chuyển đổi toàn màn hình / layout thông thường sẽ áp dụng chiều cao thực tế tại thời điểm thao tác, không đợi thời hạn ân hạn giải phóng bàn phím. */
function refreshMobilePanelLayoutForLayoutAction() {
    if (!isMobileViewport()) return;
    clearMobileLayoutHeightSync();
    const changed = syncMobilePanelLayoutMetrics(true);
    if (changed && isPanelExpanded) schedulePanelViewportSync();
}

/* Sau khi xoay màn hình ngang/dọc hoặc vượt breakpoint, chỉ hiệu chỉnh hình học kéo thả/co giãn thủ công đã vượt ra ngoài viewport hiện tại; không ghi đè giá trị inline nếu chưa từng chỉnh kích thước thủ công. */
function clampPanelGeometryAfterLayoutChange() {
    if (!panelEl || !isPanelExpanded || isFullscreenActive()) return;
    const hasCustomGeometry = !!(panelEl.style.left || panelEl.style.top
        || panelEl.style.width || panelEl.style.height);
    if (!hasCustomGeometry) return;

    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, mobilePanelLayoutHeight || window.innerHeight);
    const rect = panelEl.getBoundingClientRect();
    const width = Math.min(rect.width, viewportWidth);
    const height = Math.min(rect.height, viewportHeight);

    if (panelEl.style.width && Math.abs(width - rect.width) > 0.5) {
        panelEl.style.width = `${width}px`;
    }
    if (panelEl.style.height && Math.abs(height - rect.height) > 0.5) {
        panelEl.style.height = `${height}px`;
    }

    if (panelEl.style.left) {
        const maxLeft = Math.max(0, viewportWidth - width);
        const left = Math.min(Math.max(0, rect.left), maxLeft);
        if (Math.abs(left - rect.left) > 0.5) panelEl.style.left = `${left}px`;
    }
    if (panelEl.style.top) {
        const maxTop = Math.max(0, viewportHeight - height);
        const top = Math.min(Math.max(0, rect.top), maxTop);
        if (Math.abs(top - rect.top) > 0.5) panelEl.style.top = `${top}px`;
    }
}

/* Chỉ xử lý control đang hoạt động trong danh sách bản ghi: Chỉ cuộn khi bàn phím che khuất nội dung danh sách, tìm kiếm toàn cục và lớp nổi tùy chọn không tham gia. */
function ensureActiveListControlVisible() {
    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    const activeEl = panelShadowRoot ? panelShadowRoot.activeElement : null;
    if (!activeEl || !listEl || !listEl.contains(activeEl)) return;
    const listRect = listEl.getBoundingClientRect();
    const headerEl = activeEl.closest('.rlog-record-header');
    if (!headerEl) return;
    const headerRect = headerEl.getBoundingClientRect();
    const visualHeight = window.visualViewport ? window.visualViewport.height : Infinity;
    /* Danh sách có thể kéo dài ra sau bàn phím do chiều cao ổn định của panel; biên dưới nhìn thấy lấy giá trị nhỏ nhất trong ba giá trị. */
    const visibleTop = listRect.top;
    const visibleBottom = Math.min(listRect.bottom, window.innerHeight, visualHeight);
    const margin = 8;
    /* Chỉ bù phần bị thiếu: Số dương = cuộn lên để lộ mép dưới, số âm = cuộn xuống để lộ mép trên */
    let delta = 0;
    if (headerRect.bottom > visibleBottom - margin) {
        delta = headerRect.bottom - (visibleBottom - margin);
    } else if (headerRect.top < visibleTop + margin) {
        delta = headerRect.top - (visibleTop + margin);
    }
    if (delta !== 0) listEl.scrollTop += delta;
}

/* Biến thiên chiều cao có thể kích hoạt liên tục nhiều lần, kiểm tra tính hiển thị control đang hoạt động được gộp lại thực thi ở frame tiếp theo. */
function scheduleActiveListControlVisibility() {
    if (!isPanelExpanded || !isMobileViewport() || activeListControlVisibilityQueued) return;
    activeListControlVisibilityQueued = true;
    activeListControlVisibilityFrameId = requestAnimationFrame(() => {
        activeListControlVisibilityFrameId = 0;
        activeListControlVisibilityQueued = false;
        if (!isPanelExpanded || !isMobileViewport()) return;
        ensureActiveListControlVisible();
    });
}

/* Mobile thay đổi chiều rộng sẽ lập tức dựng lại layout; thay đổi chiều cao được gộp trước, phần thu hẹp trong phiên bàn phím giữ đóng băng.
   Desktop giữ nguyên hành vi đồng bộ toàn bộ của resize ban đầu. */
function handlePanelViewportResize() {
    if (!panelEl || !isPanelExpanded) return;
    const mobile = isMobileViewport();
    const hadMobileLayout = mobilePanelLayoutWidth !== 0;
    const widthChanged = mobile && window.innerWidth !== mobilePanelLayoutWidth;

    if (mobile && (widthChanged || !hadMobileLayout)) {
        resetMobileKeyboardSession();
        syncMobilePanelLayoutMetrics(true);
        clampPanelGeometryAfterLayoutChange();
        schedulePanelViewportSync();
        return;
    }
    if (!mobile && hadMobileLayout) {
        resetMobileKeyboardSession();
        syncMobilePanelLayoutMetrics();
        clampPanelGeometryAfterLayoutChange();
        schedulePanelViewportSync();
        return;
    }
    if (mobile) {
        scheduleMobilePanelLayoutHeightSync();
        scheduleActiveListControlVisibility();
        return;
    }
    schedulePanelViewportSync();
}

/* Lối vào resize toàn trang duy nhất: Khi panel mở rộng thì xử lý layout panel, chỉ có nút nổi thì chỉ hiệu chỉnh nút nổi. */
function handlePageViewportResize() {
    if (isPanelExpanded) {
        handlePanelViewportResize();
    } else if (isBadgeVisible()) {
        scheduleBadgeViewportSync();
    }
    syncViewportListenerLifecycle();
}

/* Thay đổi kích thước layout của chính panel (chuyển đổi toàn màn hình, kéo thả co giãn, v.v.) vẫn cần làm mới đầy đủ sticky và băng thông chính văn. */
function schedulePanelViewportSync() {
    if (!isPanelExpanded || viewportSyncQueued) return;
    viewportSyncQueued = true;
    viewportSyncFrameId = requestAnimationFrame(() => {
        viewportSyncFrameId = 0;
        viewportSyncQueued = false;
        if (!isPanelExpanded) return;
        /* Chiều rộng khả dụng của gợi ý trên mobile phụ thuộc vào viewport hiện tại và vị trí ⓘ; khi đang mở sẽ tính lại theo biến thiên viewport */
        updateResponseMetaTipLayout();
        syncRecordHeaderVars(panelEl && panelEl.querySelector('#rlog-list'));
        /* Kích thước viewport thay đổi có thể làm thay đổi layout tổng thể (media query chuyển đổi padding/font size, v.v.), chưa chắc đi kèm biến thiên kích thước của chính vùng nội dung,
           ở đây giữ lại một lần cập nhật toàn diện bọc lót (cập nhật định hướng chỉ bao quát "kích thước quan sát được thay đổi") */
        requestThumbUpdate();
        /* Viewport thay đổi cũng có thể làm thay đổi độ rộng xuống dòng chính văn (breakpoint desktop ↔ mobile): Bảo trì băng thông nội bộ sẽ phát hiện độ rộng và dựng lại chiều cao giữ chỗ */
        scheduleBodyBandPass(panelEl && panelEl.querySelector('#rlog-list'));
    });
}

/* Khi nút nổi hiển thị đơn lẻ chỉ cập nhật kích thước và vị trí của chính nó, không truy cập layout của panel đang ẩn. */
function scheduleBadgeViewportSync() {
    if (!isBadgeVisible() || isPanelExpanded || badgeViewportSyncQueued) return;
    badgeViewportSyncQueued = true;
    badgeViewportSyncFrameId = requestAnimationFrame(() => {
        badgeViewportSyncFrameId = 0;
        badgeViewportSyncQueued = false;
        if (!isBadgeVisible() || isPanelExpanded) return;
        updateBadgeSize();
        const pos = clampBadgeToViewport(
            parseFloat(badgeEl.style.left) || 0,
            parseFloat(badgeEl.style.top) || 0
        );
        badgeEl.style.left = `${pos.left}px`;
        badgeEl.style.top = `${pos.top}px`;
        badgePos = pos;
    });
}

/* Neo cuộn: So sánh vị trí điểm neo trong viewport trước và sau thao tác, nếu dời lên quá 1px sẽ dùng độ lệch vị trí để hiệu chỉnh cuộn ngược chiều.
   Chỉ giữ giá trị scrollTop là chưa đủ — giá trị khôi phục sẽ bị trình duyệt lặng lẽ clamp về giới hạn trên mới, thanh tiêu đề sticky còn bị tụt xuống theo khung chứa bị lùn đi.
   Thao tác dạng thu gọn bắt buộc phải truyền anchorEl (thanh tiêu đề bản ghi/tin nhắn được nhấp), nếu không khoảng hở bị clamp sẽ đọng lại; thao tác dạng mở rộng có thể không truyền.
   @param {Function} action @param {HTMLElement|null} [anchorEl] */
function preserveScrollTop(action, anchorEl) {
    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    if (!listEl) { action(); return; }
    const saved = listEl.scrollTop;
    /* Vị trí phần tử neo so với đỉnh vùng nhìn thấy của danh sách trước khi thao tác (khi sticky chính là vị trí sticky) */
    let beforeRelTop = null;
    if (anchorEl) {
        beforeRelTop = anchorEl.getBoundingClientRect().top - listEl.getBoundingClientRect().top;
    }
    action();
    listEl.scrollTop = saved;
    /* Khi điểm neo dời lên quá 1px (do clamp hoặc tụt sticky) dùng khoảng lệch vị trí hiệu chỉnh ngược; dời xuống (bị ghim sticky) là hành vi bình thường */
    if (anchorEl && beforeRelTop !== null) {
        const curRelTop = anchorEl.getBoundingClientRect().top - listEl.getBoundingClientRect().top;
        if (curRelTop - beforeRelTop < -1) {
            listEl.scrollTop = listEl.scrollTop + (curRelTop - beforeRelTop);
        }
    }
    /* Thu gọn/mở rộng sẽ làm thay đổi chiều cao danh sách, có thể kéo nội dung ngoài viewport (ngoài băng thông) trực tiếp vào viewport — loại biến thiên này không có sự kiện scroll,
       bắt buộc phải xếp lịch bảo trì băng thông một lần, nếu không chính văn đắp vào vẫn là giữ chỗ đẳng cao (biểu hiện là "chỉ có thanh tiêu đề, chính văn trắng xóa") */
    scheduleBodyBandPass(listEl);
}

/* Gắn sự kiện tương tác cho từng mục tin nhắn đơn lẻ (thu gọn/mở rộng thanh tiêu đề + nút đọc/sao chép), dùng chung cho render toàn bảng và chèn thêm phản hồi.
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
    const readBtn = msgItem.querySelector('.rmsg-read-btn');
    if (readBtn) {
        readBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            const recIdx = Number(this.dataset.record);
            const msgIdx = Number(this.dataset.msg);
            openMessageReadOverlay(recIdx, msgIdx, this);
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
    const responseInfoBtn = msgItem.querySelector('.rmsg-response-info');
    if (responseInfoBtn) {
        responseInfoBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            const recIdx = Number(this.dataset.record);
            const msgIdx = Number(this.dataset.msg);
            toggleResponseMetaTip(this, recIdx, msgIdx);
        });
    }
}

/* Tháo bỏ điểm neo chú thích Response hiện tại; phần tử có thể đã bị xóa theo việc dựng lại toàn bảng */
function clearResponseMetaTipAnchor() {
    if (!responseMetaTipAnchorEl) return;
    responseMetaTipAnchorEl.style.removeProperty('anchor-name');
    responseMetaTipAnchorEl.setAttribute('aria-expanded', 'false');
    responseMetaTipAnchorEl = null;
}

/* Thu lại giải thích chỉ số Response và dọn dẹp điểm neo */
function hideResponseMetaTip() {
    if (responseMetaTipEl) {
        try { responseMetaTipEl.hidePopover(); } catch (e) { /* Bỏ qua khi chưa hiển thị hoặc không hỗ trợ Popover */ }
        responseMetaTipEl.style.removeProperty('--rlog-response-meta-tip-max-width');
    }
    clearResponseMetaTipAnchor();
}

/* Tính toán chiều rộng khả dụng từ gợi ý đến mép phải màn hình theo vị trí ⓘ hiện tại; chỉ áp dụng trên mobile, desktop giữ nguyên layout */
function updateResponseMetaTipLayout() {
    if (!responseMetaTipEl) return;
    responseMetaTipEl.style.removeProperty('--rlog-response-meta-tip-max-width');
    if (!responseMetaTipAnchorEl || !window.matchMedia('(max-width: 768px)').matches) return;
    const anchorRect = responseMetaTipAnchorEl.getBoundingClientRect();
    const shiftX = parseFloat(
        getComputedStyle(responseMetaTipEl).getPropertyValue('--rlog-response-meta-tip-shift-x'),
    ) || 0;
    const availableWidth = document.documentElement.clientWidth - anchorRect.left - shiftX - 8;
    responseMetaTipEl.style.setProperty(
        '--rlog-response-meta-tip-max-width',
        `${Math.max(120, availableWidth)}px`,
    );
}

/* Chiến lược hiển thị: Các trường token/chi phí có độ rộng cố định không cắt cụt, các giá trị nguyên bản khác có thể dài sẽ xử lý theo giới hạn trên. */
const RESPONSE_META_NO_TRUNCATE_KEYS = new Set([
    ...RESPONSE_META_TOKEN_FIELDS,
    ...RESPONSE_META_TOKEN_DETAIL_FIELDS.map(([name]) => name),
    ...RESPONSE_META_GEMINI_TOKEN_RULES.map(([name]) => name),
    'cost',
]);

/* Cắt cụt phục vụ hiển thị: Đếm theo ký tự Unicode, khi vượt giới hạn trên sẽ giữ lại N-3 ký tự đầu và nối thêm ... */
function truncateResponseMetaValue(text) {
    const chars = Array.from(String(text));
    if (chars.length <= RESPONSE_META_VALUE_MAX_CHARS) return chars.join('');
    return `${chars.slice(0, RESPONSE_META_VALUE_MAX_CHARS - 3).join('')}...`;
}

/* Kiểu nguyên bản chỉ thực hiện chuyển đổi văn bản cần thiết: Số/boolean hiển thị đầy đủ, chuỗi thông thường và object/array JSON bị giới hạn độ dài. */
function formatResponseMetaValue(field) {
    const value = field && field.value;
    let text;
    if (typeof value === 'string') {
        text = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
        text = String(value);
    } else {
        try {
            text = JSON.stringify(value);
        } catch (e) {
            text = String(value);
        }
        if (text == null) text = String(value);
    }
    if (field && RESPONSE_META_NO_TRUNCATE_KEYS.has(field.key)) return text;
    if (typeof value === 'number' || typeof value === 'boolean') return text;
    return truncateResponseMetaValue(text);
}

/* Chuyển kết quả thu thập thành presentation model; ở đây chỉ quyết định đường dẫn trùng tên, thứ tự và định dạng giá trị, không nhận diện interface cụ thể. */
function getResponseMetaTipPresentation(msg) {
    if (msg && msg.simulated) {
        return { simulated: 'Bản ghi mô phỏng · Chưa thực tế gửi đi', disclaimer: '', base: '', fields: [] };
    }
    const mode = msg && msg.streaming === true
        ? 'Streaming'
        : (msg && msg.streaming === false ? 'Non-streaming' : RESPONSE_META_DASH);
    const baseParts = [mode, `Hoàn tất ${formatResponseClock(msg && msg.time)}`];
    if (msg && Number.isInteger(msg.httpStatus)) baseParts.push(`HTTP ${msg.httpStatus}`);

    const fields = Array.isArray(msg && msg.upstreamMeta) ? msg.upstreamMeta.slice() : [];
    const keyCounts = new Map();
    for (const field of fields) {
        const key = String(field && field.key || '');
        keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
    }
    const rows = fields
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
        .map((field) => {
            const key = String(field.key || '');
            return {
                label: keyCounts.get(key) > 1 ? String(field.path || key) : key,
                value: formatResponseMetaValue(field),
            };
        })
        .filter((row) => row.label && row.value !== '');
    return {
        simulated: '',
        disclaimer: RESPONSE_META_DISCLAIMER,
        base: baseParts.join(' · '),
        fields: rows,
    };
}

/* Ghi presentation model vào Popover; việc điều chỉnh cấu trúc/style tập trung tại đây, không phụ thuộc vào interface nguồn trường dữ liệu. */
function renderResponseMetaTip(msg) {
    if (!responseMetaTipEl) return;
    const presentation = getResponseMetaTipPresentation(msg);
    const fragment = document.createDocumentFragment();
    if (presentation.simulated) {
        const simulatedEl = document.createElement('div');
        simulatedEl.className = 'rlog-response-tip-base';
        simulatedEl.textContent = presentation.simulated;
        fragment.appendChild(simulatedEl);
    } else {
        const disclaimerEl = document.createElement('div');
        disclaimerEl.className = 'rlog-response-tip-disclaimer';
        disclaimerEl.textContent = presentation.disclaimer;
        fragment.appendChild(disclaimerEl);

        const baseEl = document.createElement('div');
        baseEl.className = 'rlog-response-tip-base';
        baseEl.textContent = presentation.base;
        fragment.appendChild(baseEl);

        if (presentation.fields.length > 0) {
            const fieldsEl = document.createElement('div');
            fieldsEl.className = 'rlog-response-tip-fields';
            for (const row of presentation.fields) {
                const rowEl = document.createElement('div');
                rowEl.className = 'rlog-response-tip-field';
                const keyEl = document.createElement('span');
                keyEl.className = 'rlog-response-tip-key';
                keyEl.textContent = `${row.label}:`;
                const valueEl = document.createElement('span');
                valueEl.className = 'rlog-response-tip-value';
                valueEl.textContent = row.value;
                rowEl.append(keyEl, valueEl);
                fieldsEl.appendChild(rowEl);
            }
            fragment.appendChild(fieldsEl);
        }
    }
    responseMetaTipEl.replaceChildren(fragment);
}

/* Nhấp ⓘ để hiển thị/thu lại giải thích chỉ số; việc đóng nhẹ Popover, Esc và cuộn bất kỳ vị trí nào trong panel sẽ do trình duyệt/listener xử lý */
function toggleResponseMetaTip(anchorEl, recIdx, msgIdx) {
    if (!responseMetaTipEl || !anchorEl) return;
    const record = records[recIdx];
    const msg = record ? getMessageByIndex(record, msgIdx) : null;
    if (!msg) return;
    const isSameOpen = responseMetaTipAnchorEl === anchorEl
        && responseMetaTipEl.matches(':popover-open');
    if (isSameOpen) {
        hideResponseMetaTip();
        return;
    }
    clearResponseMetaTipAnchor();
    responseMetaTipAnchorEl = anchorEl;
    anchorEl.style.setProperty('anchor-name', '--rlog-response-meta-anchor');
    anchorEl.setAttribute('aria-expanded', 'true');
    renderResponseMetaTip(msg);
    updateResponseMetaTipLayout();
    try { responseMetaTipEl.showPopover(); } catch (e) { clearResponseMetaTipAnchor(); }
}

function bindListEvents(listEl) {
    listEl.querySelectorAll('.rmsg-item').forEach(bindMsgItemEvents);

    listEl.querySelectorAll('.rlog-record-header').forEach((header) => {
        /* boolean: Điểm bắt đầu nhấn lần này có nằm trong hộp tìm kiếm hay không (kéo chọn văn bản vượt biên không kích hoạt thu gọn) */
        let mouseDownInSearchBox = false;
        header.addEventListener('mousedown', (e) => {
            mouseDownInSearchBox = e.target.closest('.rlog-search-box') !== null;
        });
        header.addEventListener('touchstart', (e) => {
            mouseDownInSearchBox = e.target.closest('.rlog-search-box') !== null;
        });
        header.addEventListener('click', function (e) {
            /* Sau khi nhấn giữ ghim, click native kích hoạt lần này sẽ không thu gọn/mở rộng bản ghi nữa */
            if (suppressRecordHeaderClick) {
                suppressRecordHeaderClick = false;
                return;
            }
            if (e.target.closest('button')) return;
            /* Khu vực hộp tìm kiếm (hộp nhập/bộ đếm/khoảng trống) không kích hoạt thu gọn/mở rộng, giữ trạng thái tìm kiếm ổn định */
            if (e.target.closest('.rlog-search-box')) return;
            /* Nhấn từ bên trong hộp tìm kiếm rồi kéo ra ngoài thả tay thì target click là header tổ tiên chung, không nên kích hoạt thu gọn/mở rộng */
            if (mouseDownInSearchBox) return;
            const recordEl = this.closest('.rlog-record');
            const idx = Number(recordEl.dataset.recordIndex);
            /* Khi mở rộng/thu gọn bản ghi đơn lẻ giữ nguyên vị trí cuộn (thanh tiêu đề cố định trong viewport, nội dung chỉ mở rộng xuống dưới) */
            preserveScrollTop(() => {
                toggleRecordCollapse(idx, recordEl);
            }, this);
        });

        /* Nhấn giữ thanh tiêu đề bản ghi để chuyển đổi ghim (Pointer Events: Di chuyển quá dung sai hoặc nhấc lên sớm sẽ hủy);
           sau khi kích hoạt nhấn giữ sẽ chặn click tiếp theo, tránh xung đột với việc nhấp chuột thu gọn/mở rộng */
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
                /* Thử giải phóng capture; nuốt ngoại lệ */
                try { header.releasePointerCapture(activePointerId); } catch (err) { /* ignore */ }
            }
            activePointerId = null;
        };

        /* Nhấn giữ có nên bỏ qua hay không: Cả nút bấm thực tế và hộp tìm kiếm đều bị loại trừ, các khoảng trống/trạng thái còn lại không chặn một cách phòng thủ */
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
            /* Chuột: Capture rõ ràng để khi di chuyển quá dung sai vẫn nhận được pointermove; màn hình cảm ứng dùng capture ngầm định + touch-action kiểm soát cuộn */
            if (e.pointerType !== 'touch') {
                try { header.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            }
            longPressTimer = setTimeout(() => {
                longPressTimer = null;
                suppressRecordHeaderClick = true;
                setTimeout(() => { suppressRecordHeaderClick = false; }, 50);
                /* Chỉ trên mobile: Sau khi sắp xếp lại do nhấn giữ sẽ chặn hover mô phỏng cảm ứng của bản ghi bù vào vị trí, ngón tay nhấc lên sẽ phục hồi bình thường */
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
        /* Nhấn giữ trên mobile vào thanh tiêu đề không phải nút bấm sẽ không bật menu hệ thống (nút/hộp tìm kiếm giữ nguyên hành vi gốc) */
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
            /* Sau khi thu gọn tất cả tin nhắn cần quay về đỉnh, không thể giữ nguyên vị trí cuộn cũ (preserveScrollTop sẽ triệt tiêu việc về đỉnh) */
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
                title: 'Xóa bản ghi đơn lẻ',
                message: `Bạn có chắc chắn muốn xóa bản ghi yêu cầu này của <strong>${escapeHtml(record.characterName)}</strong> không?<br>(${escapeHtml(record.timestamp)}, tổng cộng ${record.messages.length} tin nhắn)<br>Thao tác này không thể hoàn tác.`,
                confirmText: 'Xóa',
                cancelText: 'Hủy',
                onConfirm: () => {
                    deleteRecord(idx);
                },
            });
        });
    });

}

/* ── Thu gọn mở rộng và nhấp nháy khi về đỉnh ────────────────────── */

function toggleRecordCollapse(index, recordEl) {
    /* Khi thu gọn bản ghi sẽ thoát chế độ tìm kiếm (thu gọn làm đổi tính hiển thị của vùng nội dung, không nên giữ trạng thái tìm kiếm) */
    resetSearchIfActive();
    records[index].collapsed = !records[index].collapsed;
    if (records[index].collapsed) {
        /* Sau khi thu gọn nội dung danh sách thấp đi, trình duyệt sẽ ép scrollTop về đỉnh; chỉ khi trước khi thu gọn đã cuộn,
           sau khi thu gọn thực sự chạm đỉnh thì mới coi là đã xảy ra việc về đỉnh */
        const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
        const wasScrolled = !!(listEl && listEl.scrollTop > 1);
        recordCollapseToppedEl = null;
        /* Khi thu gọn bản ghi sẽ ngắt nhịp nhấp nháy xuống đáy đang diễn ra (mở rộng ra không phát lại nữa) */
        clearHeaderFlash(recordEl);
        recordEl.classList.add('collapsed');
        recordEl.classList.remove('expanded');
        if (wasScrolled && listEl && listEl.scrollTop === 0) {
            recordCollapseToppedEl = recordEl;
        }
    } else {
        recordEl.classList.add('expanded');
        recordEl.classList.remove('collapsed');
        /* Bắt buộc phải dựng bù chính văn trước: Việc "nhấp nháy tiêu đề tin nhắn con đầu tiên sau khi về đỉnh" phải lấy mục tiêu trong cây con mới tạo này */
        ensureRecordBody(recordEl);
        /* Khi tìm kiếm toàn cục vẫn đang diễn ra, mở rộng thủ công chỉ vẽ bù highlight màu vàng, không thay đổi mục màu cam hiện tại và bộ đếm. */
        refreshGlobalSearchHighlightsForManualOpen(recordEl, records[index]);
        /* Chỉ khi việc thu gọn lần này thực sự ép danh sách về đỉnh thì mới nhấp nháy nhắc nhở thanh tiêu đề tin nhắn con đầu tiên;
           dừng ở đỉnh rồi thu gọn/mở rộng lặp lại, hay mở rộng thông thường sau khi bản ghi mới xuất hiện đều không nhấp nháy */
        if (recordCollapseToppedEl === recordEl) {
            const firstMsgHeader = recordEl.querySelector('.rmsg-item .rmsg-header');
            if (firstMsgHeader) triggerHeaderFlash(firstMsgHeader);
        }
        recordCollapseToppedEl = null;
        /* Sau khi mở rộng bản ghi, lười tạo thanh tiến trình cho vùng nội dung tin nhắn (chỉ tạo ngay trong viewport, còn lại trì hoãn) */
        queueScrollbarsForEls(recordEl.querySelectorAll('.rmsg-content'));
    }
}

/* Chuyển đổi ghim tạm thời cho bản ghi đơn lẻ: Ghim không chiếm giới hạn bản ghi thông thường, không bị dọn dẹp tự động; khi ghim sẽ thu gọn toàn bộ (trạng thái thu gọn của tin nhắn con không đổi);
   bỏ ghim không tự động mở rộng, khôi phục tham gia dọn dẹp; không chủ động cuộn, chỉ phản hồi bằng toast. */
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
    if (panelEl && isPanelExpanded) {
        renderPanelContent();
        /* Sau khi render dựng lại vẫn giữ vị trí cuộn hiện tại (ghim/bỏ ghim không chủ động nhảy tới vị trí bản ghi) */
        if (listEl && listEl.isConnected) {
            const maxScroll = Math.max(0, listEl.scrollHeight - listEl.clientHeight);
            listEl.scrollTop = Math.min(prevScrollTop, maxScroll);
        }
    }

    showPinToast(record.pinned
        ? 'Đã ghim, không bị ảnh hưởng bởi dọn dẹp bản ghi thông thường'
        : 'Đã bỏ ghim, sẽ tham gia lại vào dọn dẹp bản ghi thông thường');
}

/* Hiển thị toast gọn nhẹ (căn giữa đỉnh panel, dùng chung cho ghim/xóa sạch/theo theme và lối vào giữ chỗ, v.v.);
   nhiều lần liên tiếp chỉ thay thế văn bản, đặt lại bộ hẹn giờ, không xếp chồng.
   @param {string} text Văn bản gợi ý
   @param {{persist?: boolean}} [options] persist=true hiển thị liên tục không tự biến mất (dùng cho gợi ý trạng thái mô phỏng đang tiến hành, v.v.),
   được thay thế/triệt tiêu bởi toast kế tiếp hoặc nhấp đóng */
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

/* Trong lúc sắp xếp lại do nhấn giữ trên mobile, thêm class tạm thời cho #rlog-list để bản ghi bù vào vị trí không bị highlight vô cớ do cảm ứng mô phỏng hover */
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

    /* Class ngăn chặn không bị xóa theo pointerup/pointercancel của cử chỉ lần này (màn hình cảm ứng sẽ đọng lại :hover, sắp xếp lại còn có thể kích hoạt
       pointercancel), đổi sang xóa ở pointerdown lần kế tiếp / pointermove của chuột; không đặt timeout bọc lót,
       nếu không sau khi tự động khôi phục thì hover đọng lại sẽ lại hiện lên */
    document.addEventListener('pointerdown', end, { capture: true });
    document.addEventListener('pointermove', onMouseMove, { capture: true });
}

function toggleMessageCollapse(recIdx, msgIdx, msgItem) {
    /* Thu gọn/mở rộng tin nhắn thuộc thao tác nội bộ của bản ghi đơn lẻ, không thoát chế độ tìm kiếm (highlight tìm kiếm vẫn giữ trong DOM) */
    const record = records[recIdx];
    if (!record) return;
    const msg = getMessageByIndex(record, msgIdx);
    if (!msg) return;
    msg.collapsed = !msg.collapsed;
    if (msg.collapsed) {
        /* Khi thu gọn tin nhắn sẽ ngắt nhịp nhấp nháy xuống đáy đang diễn ra (mở rộng ra không phát lại nữa) */
        clearHeaderFlash(msgItem);
        msgItem.classList.add('collapsed');
        msgItem.classList.remove('expanded');
    } else {
        msgItem.classList.add('expanded');
        msgItem.classList.remove('collapsed');
        const contentEl = ensureMessageContent(msgItem);
        if (contentEl) {
            contentEl.scrollTop = 0; /* Khi mở rộng lại sau khi thu gọn, bắt đầu xem từ đỉnh nội dung tin nhắn */
            createScrollbarForContent(contentEl);
        }
        /* Khi bản ghi trước đó không phải đối tượng highlight tìm kiếm toàn cục, mở rộng tin nhắn thủ công cũng vẽ bù kết quả màu vàng của toàn bộ bản ghi. */
        const recordEl = msgItem.closest('.rlog-record');
        if (recordEl) refreshGlobalSearchHighlightsForManualOpen(recordEl, record);
    }
}

/* Lấy tin nhắn theo chỉ số tin nhắn: N mục đầu là tin nhắn yêu cầu, kế tiếp là Response, cuối cùng là các mục TOOL được chèn thêm.
   @param {object} record @param {number} msgIdx @returns {object|null} */
function getMessageByIndex(record, msgIdx) {
    if (!record) return null;
    if (msgIdx < record.messages.length) return record.messages[msgIdx];
    if (msgIdx === record.messages.length) return record.reply || null;
    const toolIdx = msgIdx - record.messages.length - 1;
    const toolEntries = getRecordToolEntries(record);
    return toolIdx >= 0 && toolIdx < toolEntries.length ? toolEntries[toolIdx] : null;
}

/* "Thu gọn tất cả mục" trên thanh tiêu đề: Thu gọn toàn bộ bản ghi và tất cả tin nhắn bên trong */
function collapseAllEntries() {
    resetSearchIfActive();
    if (records.length === 0) return;
    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    clearHeaderFlash(listEl);
    records.forEach((r, i) => {
        r.collapsed = true;
        r.messages.forEach(m => { m.collapsed = true; });
        if (r.reply) r.reply.collapsed = true;
        getRecordToolEntries(r).forEach(m => { m.collapsed = true; });
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
    /* Sau khi về đỉnh sẽ nhấp nháy nhắc nhở bản ghi mới nhất ở trên cùng */
    flashTopHint();
    /* Thu gọn toàn bộ bản ghi một lần sẽ làm chiều cao danh sách giảm đột ngột, nội dung dời lên toàn bộ: Xếp lịch bảo trì băng thông một lần, tránh khoảng trắng bù vào */
    scheduleBodyBandPass(listEl);
}

/* "Thu gọn tất cả tin nhắn" của bản ghi đơn lẻ: Thu gọn tin nhắn của mọi role trong bản ghi này, cuộn về thanh tiêu đề tin nhắn role trên cùng trong bản ghi và nhấp nháy
   (Mục tiêu định vị và nhấp nháy chỉ nhận diện trong bản ghi này, khác với "Thu gọn tất cả mục" trên thanh tiêu đề chính là quay về đỉnh danh sách)
   @param {number} index Chỉ số bản ghi */
function collapseRecordMessages(index) {
    /* Tin nhắn đang tìm kiếm sau khi thu gọn thì highlight không còn ý nghĩa, thoát chế độ tìm kiếm trước */
    resetSearchIfActive();
    const record = records[index];
    if (!record || !record.messages) return;

    record.messages.forEach(m => { m.collapsed = true; });
    if (record.reply) record.reply.collapsed = true;
    getRecordToolEntries(record).forEach(m => { m.collapsed = true; });

    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    const recordEl = listEl ? listEl.querySelector(`.rlog-record[data-record-index="${index}"]`) : null;
    if (recordEl) {
        /* Chỉ cần phần tử và hình học (class thu gọn + định vị + mục tiêu nhấp nháy đều là thanh tiêu đề), không cần bù chính văn về */
        ensureRecordBody(recordEl, false);
        /* Khi thu gọn tất cả tin nhắn của bản ghi này sẽ ngắt nhịp nhấp nháy xuống đáy đang diễn ra (mở rộng ra không phát lại nữa) */
        clearHeaderFlash(recordEl);
        recordEl.querySelectorAll('.rmsg-item').forEach(el => {
            el.classList.add('collapsed');
            el.classList.remove('expanded');
        });
        /* Cuộn về bản ghi này (thanh tiêu đề tin nhắn dính bên dưới thanh tiêu đề bản ghi này), không quay về đỉnh danh sách nữa */
        scrollToRecordEl(recordEl);
        /* Nhấp nháy thanh tiêu đề tin nhắn role trên cùng trong bản ghi này (mục đầu tiên theo thứ tự DOM chính là trên cùng; bộ lọc role đã có hiệu lực ở giai đoạn render) */
        triggerHeaderFlash(recordEl.querySelector('.rmsg-header'));
        /* Thu gọn tất cả tin nhắn bản ghi này sẽ làm nội dung bên dưới dời lên toàn bộ (có thể kéo vào viewport): Xếp lịch bảo trì băng thông một lần */
        scheduleBodyBandPass(listEl);
    }
}

/* "Mở rộng tất cả tin nhắn" của bản ghi đơn lẻ: Mở rộng tin nhắn của mọi role bên trong bản ghi này
   @param {number} index Chỉ số bản ghi */
function expandRecordMessages(index) {
    const record = records[index];
    if (!record || !record.messages) return;

    record.messages.forEach(m => { m.collapsed = false; });
    if (record.reply) record.reply.collapsed = false;
    getRecordToolEntries(record).forEach(m => { m.collapsed = false; });

    const recordEl = panelEl.querySelector(`.rlog-record[data-record-index="${index}"]`);
    if (recordEl) {
        ensureRecordBody(recordEl);
        recordEl.querySelectorAll('.rmsg-item').forEach(el => {
            el.classList.add('expanded');
            el.classList.remove('collapsed');
            ensureMessageContent(el);
        });
        /* "Mở rộng tất cả tin nhắn" cũng là đường dẫn duyệt thủ công, vẽ bù kết quả màu vàng nhưng không chuyển đổi mục hiện tại. */
        refreshGlobalSearchHighlightsForManualOpen(recordEl, record);
        /* Lười tạo thanh tiến trình cho vùng nội dung tin nhắn (chỉ tạo ngay trong viewport, còn lại trì hoãn) */
        queueScrollbarsForEls(recordEl.querySelectorAll('.rmsg-content'));
        /* Mở rộng sẽ làm nội dung bên dưới dời xuống toàn bộ, đẩy nội dung ngoài băng thông phía trên vào viewport: Xếp lịch bảo trì băng thông một lần */
        scheduleBodyBandPass(panelEl.querySelector('#rlog-list'));
    }
}

/* "Chuyển nhanh xuống đáy" của bản ghi đơn lẻ: Cuộn đến tin nhắn con cuối cùng trong bản ghi này (có phản hồi tức là Response) và làm nhấp nháy thanh tiêu đề của nó;
   chỉ định vị + nhấp nháy, không thay đổi bất kỳ trạng thái thu gọn/mở rộng nào. @param {number} index */
function scrollToRecordBottom(index) {
    if (!panelEl) return;
    const listEl = panelEl.querySelector('#rlog-list');
    const recordEl = listEl.querySelector(`.rlog-record[data-record-index="${index}"]`);
    if (!recordEl) return;
    /* Chỉ định vị và nhấp nháy theo thanh tiêu đề của tin nhắn con cuối cùng, không cần văn bản chính văn */
    ensureRecordBody(recordEl, false);

    const lastItemEl = recordEl.querySelector('.rmsg-item:last-child');
    if (!lastItemEl) return;
    const headerEl = lastItemEl.querySelector('.rmsg-header');
    if (!headerEl) return;

    /* Tính toán vị trí logic của thanh tiêu đề trong nội dung danh sách: Dưới trạng thái sticky thì getBoundingClientRect trả về vị trí sau khi dính
       chứ không phải vị trí tự nhiên, nên dùng hình chữ nhật item không sticky + offsetTop của thanh tiêu đề so với item để suy tính */
    const listRect = listEl.getBoundingClientRect();
    const itemRect = lastItemEl.getBoundingClientRect();
    const headerTopInList = listEl.scrollTop + itemRect.top - listRect.top + headerEl.offsetTop;

    const recordHeaderEl = recordEl.querySelector('.rlog-record-header');
    /* Điểm rơi chỉ tính theo thanh tiêu đề bản ghi (không cộng dồn thanh tiêu đề tin nhắn); offsetHeight là chiều cao của chính phần tử, không đổi theo trạng thái sticky */
    const stickyHeight = recordHeaderEl ? recordHeaderEl.offsetHeight : 0;
    /* Thanh tiêu đề mục tiêu rơi vào bên dưới thanh tiêu đề bản ghi, vị trí lấy tỷ lệ vùng nhìn thấy còn lại (càng nhỏ càng lệch lên trên) */
    const visibleHeight = Math.max(0, listEl.clientHeight - stickyHeight);
    const targetScroll = headerTopInList - stickyHeight - visibleHeight * 0.13;

    /* Kẹp vào phạm vi cuộn hợp lệ; cận dưới lấy vị trí logic của mép trên bản ghi trong danh sách — thấp hơn nó thì danh sách sẽ cuộn quá mép trên bản ghi,
       thanh tiêu đề bản ghi sẽ tụt khỏi vị trí sticky. Khi không chạm tới điểm rơi mục tiêu thì ưu tiên đảm bảo thanh tiêu đề đứng yên ở vị trí sticky */
    const maxListScroll = Math.max(0, listEl.scrollHeight - listEl.clientHeight);
    const recordTopInList = listEl.scrollTop + recordEl.getBoundingClientRect().top - listRect.top;
    const minListScroll = Math.max(0, Math.min(recordTopInList, maxListScroll));
    const clampedListScroll = Math.max(minListScroll, Math.min(targetScroll, maxListScroll));

    /* Chỉ cuộn khi cần điều chỉnh (mục tiêu đã nhìn thấy thì giữ nguyên, nhấp nháy vẫn kích hoạt bình thường) */
    if (Math.abs(clampedListScroll - listEl.scrollTop) > 1) {
        /* Cuộn mượt cần thời gian, nhấp nháy đợi sau khi cuộn tới vị trí mới kích hoạt (scrollend + timer bọc lót) */
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

/* Kích hoạt nhấp nháy xuống đáy đang chờ (gọi sau khi cuộn tới vị trí); bỏ qua trong im lặng khi thanh tiêu đề mục tiêu đã bị dựng lại/xóa bỏ */
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

/* Xóa class nhấp nháy thanh tiêu đề trong phạm vi chỉ định, đồng thời hủy nhấp nháy chờ kích hoạt trong phạm vi đó (gọi khi thu gọn bản ghi/tin nhắn).
   @param {HTMLElement} scopeEl Phạm vi tác động (bản ghi, mục tin nhắn hoặc toàn bộ danh sách) */
function clearHeaderFlash(scopeEl) {
    if (!scopeEl) return;
    scopeEl.querySelectorAll('.rmsg-header.rlog-flash-bottom, .rlog-record-header.rlog-flash-bottom')
        .forEach(el => clearFlashClasses(el));
    if (pendingFlashHeader && scopeEl.contains(pendingFlashHeader)) {
        cancelPendingFlash();
    }
}

/* Lấy phần tử DOM bản ghi trong danh sách theo chỉ số records thực tế (data-record-index luôn ghi chỉ số thực) */
function getRecordElByIndex(index) {
    if (!panelEl) return null;
    const listEl = panelEl.querySelector('#rlog-list');
    return listEl ? listEl.querySelector(`.rlog-record[data-record-index="${index}"]`) : null;
}

/* Cuộn danh sách sao cho thanh tiêu đề bản ghi chỉ định xuất hiện ở đỉnh vùng nhìn thấy (tính bằng độ lệch tọa độ view, không phụ thuộc offsetTop) */
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

/* Nhấp nháy gợi ý khi về đỉnh không dùng nút: Khi mở rộng panel sẽ nhấp nháy thanh tiêu đề tin nhắn con đầu tiên; không kích hoạt khi ẩn panel */
function flashTopHint(recordEl) {
    if (!panelEl || !isPanelExpanded) return;
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

/* Gỡ bỏ toàn bộ các class liên quan đến nhấp nháy (class đánh dấu + hai class tên animation luân phiên): Dùng chung khi ngắt nhịp nhấp nháy / đóng panel.
   Ba tên class tương ứng 1:1 với quy tắc nhấp nháy của style.css, sửa bên đó phải đồng bộ sửa ở đây */
function clearFlashClasses(el) {
    el.classList.remove('rlog-flash-bottom', 'rlog-flash-a', 'rlog-flash-b');
}

/* Nhấp nháy màu nền thanh tiêu đề: Thêm luân phiên hai tên animation có nội dung tương đồng (rlog-flash-a / -b),
   để cùng một thanh tiêu đề khi kích hoạt lại lúc animation chưa phát xong vẫn có thể phát lại từ đầu.
   Trạng thái luân phiên được ghi trong dataset chứ không nhìn class name: clearHeaderFlash() có thể vừa gỡ bỏ class,
   nếu phán đoán theo class name sẽ chọn lại cùng một tên animation, trong cùng một task coi như chưa đổi tên (không phát lại).
   @param {HTMLElement} headerEl */
function triggerHeaderFlash(headerEl) {
    if (!headerEl) return;
    /* Chế độ tối giản: Không thực hiện nhấp nháy (chỉ giữ định vị cuộn), cũng tránh việc animationend
       không kích hoạt dưới animation:none dẫn tới tồn dư class .rlog-flash-bottom */
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

/* ── Xóa và sao chép bản ghi ──────────────────────── */

/* "Xóa" bản ghi đơn lẻ: Xóa bản ghi này khỏi danh sách
   @param {number} index Chỉ số bản ghi */

function deleteRecord(index) {
    if (index < 0 || index >= records.length) return;
    const record = records[index];
    /* Khi xóa bản ghi đồng thời hủy theo dõi phản hồi đang trên đường tới của yêu cầu đó */
    if (record && record.id != null) abortPendingReply(record.id);
    records.splice(index, 1);
    panelContentDirty = true;
    if (panelEl && isPanelExpanded) {
        renderPanelContent();
    }
}

async function copyFullRecord(index, btnEl) {
    const record = records[index];
    if (!record) return;
    const text = getFullRecordText(record);
    await doCopy(text, btnEl);
}

async function copySingleMessage(recIdx, msgIdx, btnEl) {
    const msg = getMessageByIndex(records[recIdx], msgIdx);
    if (!msg) return;
    await doCopy(getMessageDisplayText(msg), btnEl);
}

/* Văn bản Android truyền qua clipboard hệ thống theo UTF-16, ước tính dung lượng an toàn bằng số ký tự × 2 */
function shouldWarnLongAndroidCopy(text) {
    return /Android/i.test(navigator.userAgent || '')
        && text.length * 2 >= ANDROID_LONG_COPY_WARN_BYTES;
}

async function doCopy(text, btnEl) {
    const warnLongContent = shouldWarnLongAndroidCopy(text);
    let copied = false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(text);
            copied = true;
        } catch (e) {
            /* Ngữ cảnh không an toàn / Người dùng từ chối quyền / Nội dung siêu dài: Tiếp tục thử đường dẫn tương thích cũ */
        }
    }
    if (!copied) {
        let textarea = null;
        try {
            textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.top = '0';
            textarea.style.left = '-9999px';
            textarea.style.opacity = '0';
            textarea.setAttribute('readonly', '');
            document.body.appendChild(textarea);
            textarea.select();
            textarea.setSelectionRange(0, textarea.value.length);
            copied = document.execCommand('copy') === true;
        } catch (e) {
            console.error(`[${PLUGIN_KEY}] Sao chép thất bại:`, e);
        } finally {
            if (textarea && textarea.parentNode) textarea.parentNode.removeChild(textarea);
        }
    }
    showCopyFeedback(btnEl, copied);
    if (warnLongContent) showPinToast(ANDROID_LONG_COPY_WARN_TEXT);
    return copied;
}

/* Trạng thái phản hồi bất đồng bộ của nút: Khi nhấp liên tục vẫn giữ icon ban đầu, tránh việc coi ✓/✕ của lần trước là icon gốc để khôi phục */
const copyFeedbackStates = new WeakMap();

function showCopyFeedback(btnEl, success, successTitle = 'Đã sao chép', failureTitle = 'Sao chép thất bại') {
    if (!btnEl) return;
    let state = copyFeedbackStates.get(btnEl);
    if (!state) {
        state = {
            originalHtml: btnEl.innerHTML,
            originalTitle: btnEl.title,
            timer: null,
        };
        copyFeedbackStates.set(btnEl, state);
    }
    if (state.timer !== null) clearTimeout(state.timer);
    btnEl.classList.remove('copy-success', 'copy-fail');
    if (success) {
        btnEl.innerHTML = '<i class="fa-solid fa-check"></i>';
        btnEl.title = successTitle;
        btnEl.classList.add('copy-success');
    } else {
        btnEl.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        btnEl.title = failureTitle;
        btnEl.classList.add('copy-fail');
    }
    state.timer = setTimeout(() => {
        btnEl.innerHTML = state.originalHtml;
        btnEl.title = state.originalTitle;
        btnEl.classList.remove('copy-success', 'copy-fail');
        state.timer = null;
    }, 1500);
}

/* ── Lớp phủ xem toàn văn ──────────────────────── */

/* Sắp xếp phản hồi JSON hợp lệ thành văn bản thụt lề; SSE hoặc văn bản thuần túy giữ nguyên nội dung gốc đọc được. */
function getRawResponseDisplayText(rawResponseText) {
    if (typeof rawResponseText !== 'string' || !rawResponseText.trim()) return '';
    const trimmed = rawResponseText.trim();
    try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch (e) {
        return rawResponseText;
    }
}

/* Lấy văn bản vùng nội dung lớp phủ: Request JSON gốc ở trước, dữ liệu Response gốc ở sau, không bọc gói đồng nhất.
   @param {object} record @param {string} format formatted hoặc raw @returns {string} */
function getReadContent(record, format) {
    if (format === 'raw') {
        let requestText;
        if (!record.rawBody) {
            requestText = '{"error": "Dữ liệu body request gốc không khả dụng"}';
        } else {
            try {
                requestText = JSON.stringify(record.rawBody, null, 2);
            } catch (e) {
                requestText = '{"error": "Dữ liệu body request gốc không khả dụng"}';
            }
        }
        const requestBlock = `----- Request gốc -----\n\n${requestText}`;
        const responseText = getRawResponseDisplayText(record.rawResponseText);
        return responseText
            ? `${requestBlock}\n\n----- Response gốc -----\n\n${responseText}`
            : requestBlock;
    }
    return getFullRecordText(record);
}

/* Lấy thời điểm bắt đầu request; bản ghi cũ không có requestStartedAt sẽ fallback về thời gian request ghi trên thanh tiêu đề */
function getRequestStartedDate(record) {
    const capturedAt = record && Number(record.requestStartedAt);
    if (Number.isFinite(capturedAt) && capturedAt > 0) return new Date(capturedAt);
    const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(
        (record && typeof record.timestamp === 'string') ? record.timestamp : '',
    );
    if (match) {
        return new Date(
            Number(match[1]), Number(match[2]) - 1, Number(match[3]),
            Number(match[4]), Number(match[5]), Number(match[6]),
        );
    }
    return new Date();
}

/* Tên tệp xuất cố định là Request_YYYYMMDD_HHmmss.txt/json, thời gian lấy theo thời điểm gửi request */
function getExportFileName(record, format) {
    const date = getRequestStartedDate(record);
    const stamp = `${date.getFullYear()}`
        + `${String(date.getMonth() + 1).padStart(2, '0')}`
        + `${String(date.getDate()).padStart(2, '0')}_`
        + `${String(date.getHours()).padStart(2, '0')}`
        + `${String(date.getMinutes()).padStart(2, '0')}`
        + `${String(date.getSeconds()).padStart(2, '0')}`;
    return `Request_${stamp}.${format === 'raw' ? 'json' : 'txt'}`;
}

/* Xuất định dạng xem hiện tại thành tệp; Blob tránh được giới hạn truyền tải đơn lẻ của data URL và clipboard hệ thống */
function exportReadContent(record, format, btnEl) {
    try {
        const content = getReadContent(record, format);
        const mime = format === 'raw' ? 'application/json' : 'text/plain';
        const blob = new Blob([content], { type: `${mime};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = getExportFileName(record, format);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showCopyFeedback(btnEl, true, 'Đã bắt đầu xuất', 'Xuất thất bại');
    } catch (e) {
        console.error(`[${PLUGIN_KEY}] Xuất thất bại:`, e);
        showCopyFeedback(btnEl, false, 'Đã bắt đầu xuất', 'Xuất thất bại');
        showPinToast('Xuất thất bại');
    }
}

function switchReadFormat(format) {
    if (!readFullOverlayEl || readOverlayMode !== 'record') return;
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

/* Lớp phủ "Xem toàn văn" về đỉnh/xuống đáy: Cuộn trực tiếp vùng nội dung (văn bản dài liên tục, chỉ cuộn chức năng, không chạy animation nhấp nháy)
   @param {'top'|'bottom'} position Mục tiêu cuộn: 'top' Đỉnh / 'bottom' Đáy */
function scrollReadContentTo(position) {
    if (!readFullOverlayEl) return;
    const contentEl = readFullOverlayEl.querySelector('.rlog-read-content');
    if (!contentEl) return;
    /* Cuộn mượt lên đỉnh/xuống đáy; mục tiêu xuống đáy gán scrollHeight, trình duyệt sẽ tự động clamp đến vị trí có thể cuộn tối đa */
    contentEl.scrollTo({
        top: position === 'bottom' ? contentEl.scrollHeight : 0,
        behavior: getScrollBehavior(),
    });
}

function closeReadFullOverlay({ restoreFocus = true } = {}) {
    const returnFocusEl = readOverlayReturnFocusEl;
    const shouldRestoreFocus = restoreFocus && readOverlayMode === 'message';
    if (readFullOverlayEl) {
        /* Dọn dẹp thanh cuộn tùy chỉnh ở vùng nội dung lớp phủ, tránh tồn dư */
        const readContentEl = readFullOverlayEl.querySelector('.rlog-read-content');
        if (readContentEl) {
            detachScrollbarForContent(readContentEl);
        }
        readFullOverlayEl.remove();
        readFullOverlayEl = null;
    }
    readFullRecordIndex = null;
    readOverlayMode = 'record';
    readOverlayReturnFocusEl = null;
    document.removeEventListener('keydown', handleReadFullEscape);
    if (shouldRestoreFocus && returnFocusEl && returnFocusEl.isConnected) {
        returnFocusEl.focus();
    }
}

/* Handler đóng lớp phủ bằng phím Escape @param {KeyboardEvent} e Sự kiện bàn phím */
function handleReadFullEscape(e) {
    if (e.key === 'Escape' && readFullOverlayEl) {
        closeReadFullOverlay();
    }
}

/* Mở lớp phủ "Xem toàn văn", hiển thị đầy đủ Request, Response và TOOL; lớp phủ che khuất hoàn toàn panel
   @param {number} index Chỉ số bản ghi */
function openReadFullOverlay(index) {
    /* Thoát chế độ tìm kiếm trước (trong thời gian mở lớp phủ thì tìm kiếm không nhìn thấy và không thể thao tác) */
    resetSearchIfActive();

    const record = records[index];
    if (!record || !panelEl) return;

    /* Đóng lớp phủ cũ (nếu có) */
    closeReadFullOverlay({ restoreFocus: false });

    readFullRecordIndex = index;
    readFullFormat = 'formatted';
    readOverlayMode = 'record';
    readOverlayReturnFocusEl = null;

    const overlay = document.createElement('div');
    overlay.className = 'rlog-read-overlay';

    overlay.innerHTML = `
        <div class="rlog-read-header">
            <span class="rlog-read-title">Xem toàn văn</span>
            <div class="rlog-read-header-actions">
                <button class="rlog-read-format-btn formatted" title="Chuyển đổi định dạng hiển thị" aria-label="Chuyển đổi định dạng hiển thị">{}</button>
                <button class="rlog-read-jump-top-btn" title="Về đỉnh">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="4" x2="19" y2="4"></line><line x1="12" y1="9" x2="12" y2="20"></line><polyline points="7 14 12 9 17 14"></polyline></svg>
                </button>
                <button class="rlog-read-jump-bottom-btn" title="Xuống đáy">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="4" x2="12" y2="15"></line><line x1="5" y1="20" x2="19" y2="20"></line></svg>
                </button>
                <button class="rlog-read-export-btn" title="Xuất nội dung hiện tại">
                    <i class="fa-solid fa-file-export"></i>
                </button>
                <button class="rlog-read-copy-btn" title="Sao chép nội dung hiện tại">
                    <i class="fa-solid fa-copy"></i>
                </button>
                <button class="rlog-read-close-btn" title="Đóng (Esc)">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </div>
        <div class="rlog-read-content"></div>
        <div class="rlog-read-footer"></div>
    `;

    /* Nội dung sử dụng textContent để thiết lập văn bản thuần túy, tránh chi phí phân tích cú pháp innerHTML */
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

    const exportBtn = overlay.querySelector('.rlog-read-export-btn');
    exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exportReadContent(record, readFullFormat, exportBtn);
    });

    const closeBtn = overlay.querySelector('.rlog-read-close-btn');
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeReadFullOverlay();
    });

    panelEl.appendChild(overlay);
    readFullOverlayEl = overlay;

    /* Tạo thanh cuộn tùy chỉnh cho vùng nội dung lớp phủ (tái sử dụng kiểu dáng và tương tác của thanh tiến trình Overlay) */
    const readContentElForScroll = overlay.querySelector('.rlog-read-content');
    if (readContentElForScroll) {
        queueScrollbarsForEls([readContentElForScroll]);
    }

    document.addEventListener('keydown', handleReadFullEscape);
}

/* Mở lớp đọc tin nhắn đơn lẻ tinh gọn: Tái sử dụng cùng trạng thái lớp phủ và thanh cuộn, nhưng giữ nguyên trạng thái tìm kiếm hiện tại và không hiển thị thanh tiêu đề */
function openMessageReadOverlay(recordIndex, msgIdx, triggerEl) {
    const record = records[recordIndex];
    const msg = getMessageByIndex(record, msgIdx);
    if (!panelEl || !record || !msg) return;

    closeReadFullOverlay({ restoreFocus: false });
    readFullRecordIndex = recordIndex;
    readOverlayMode = 'message';
    readOverlayReturnFocusEl = triggerEl || null;

    const overlay = document.createElement('div');
    overlay.className = 'rlog-read-overlay rlog-message-read-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Xem tin nhắn');
    overlay.innerHTML = `
        <button class="rlog-message-read-close-btn" title="Đóng (Esc)" aria-label="Đóng xem tin nhắn">
            <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="rlog-read-content"></div>
        <div class="rlog-read-footer"></div>
    `;

    const contentEl = overlay.querySelector('.rlog-read-content');
    contentEl.textContent = toRenderedText(getMessageDisplayText(msg));

    const closeBtn = overlay.querySelector('.rlog-message-read-close-btn');
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeReadFullOverlay();
    });

    panelEl.appendChild(overlay);
    readFullOverlayEl = overlay;
    queueScrollbarsForEls([contentEl]);
    document.addEventListener('keydown', handleReadFullEscape);
    closeBtn.focus();
}

/* ── Thanh cuộn tùy chỉnh ───────────────────────── */

/* Lưu trữ dữ liệu dọn dẹp thanh tiến trình tương ứng với mỗi .rmsg-content
   Map key: contentEl -> { scrollHandler, hitboxEl, thumbEl } */
const scrollbarCleanups = new Map();

/* Set<HTMLElement>: Tất cả phần tử .rmsg-content đã tạo thanh tiến trình (dùng cho ResizeObserver dùng chung cập nhật hàng loạt) */
const scrollbarElements = new Set();

/* Set<HTMLElement>: Các phần tử .rmsg-content chờ đi vào viewport để lười tạo thanh tiến trình */
const pendingScrollbarContentEls = new Set();

/* ResizeObserver|null: ResizeObserver dùng chung: Tất cả thanh tiến trình dùng chung một cái, thay vì mỗi phần tử một cái */
let sharedResizeObserver = null;

/* Set<HTMLElement>: Thanh tiêu đề bản ghi đã lắng nghe thay đổi chiều cao (--rlog-rec-h khoảng lệch sticky tự động làm mới theo chiều cao) */
const observedRecordHeaders = new Set();

/* IntersectionObserver|null: IntersectionObserver phục vụ việc lười tạo thanh tiến trình */
let scrollbarLazyObserver = null;

/* Array<HTMLElement>: Các vùng nội dung đã vào viewport, chờ phân bổ từng frame để tạo thanh tiến trình (khi cùng một frame trúng nhiều mục sẽ xếp hàng trải đều ra) */
const scrollbarCreateQueue = [];

/* boolean: Đã có yêu cầu "tạo thanh tiến trình phân bổ theo frame" xếp hàng ở frame kế tiếp hay chưa */
let scrollbarCreateFlushQueued = false;

/* boolean: Đã có RAF xếp hàng cập nhật con trượt (thumb) hay chưa */
let thumbUpdateQueued = false;

/* boolean: Có đang chờ cập nhật toàn diện tất cả thanh tiến trình hay không (dùng khi biến thiên hình học tổng thể, như kích thước viewport thay đổi) */
let thumbFullUpdatePending = false;

/* Set<HTMLElement>: Các vùng nội dung chờ cập nhật định hướng (sự kiện scroll, biến thiên kích thước/vị trí do ResizeObserver báo cáo).
   Callback RO chỉ chịu trách nhiệm thu thập, việc "đọc giá trị layout → ghi style" thực tế được gom chung thực hiện trong rAF của cùng một frame —
   đọc layout trong callback RO sẽ kích hoạt tính toán lại cưỡng bức, còn có thể gây cảnh báo resize loop. */
const pendingThumbElements = new Set();

/* Lấy chiều cao tự có từ callback ResizeObserver: borderBoxSize và getBoundingClientRect().height đều là
   border-box, đều là số thập phân, mà observer đã đo sẵn kích thước — đọc lại DOM chỉ kích hoạt cưỡng bức layout vô ích.
   Chỉ khi môi trường cá biệt thiếu borderBoxSize mới fallback về đọc DOM. */
function readObservedHeight(entry, el) {
    const box = entry.borderBoxSize && entry.borderBoxSize[0];
    if (box && typeof box.blockSize === 'number') return box.blockSize;
    return el.getBoundingClientRect().height;
}

/* Đảm bảo ResizeObserver dùng chung đã được tạo: Tất cả thanh tiến trình được lắng nghe tập trung bởi nó, tránh chi phí phát sinh từ hơn 100 observer độc lập */
function ensureSharedResizeObserver() {
    if (sharedResizeObserver) return;
    sharedResizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            const entryEl = entry.target;
            if (!entryEl || !entryEl.classList) continue;
            /* Chiều cao thanh tiêu đề bản ghi thay đổi (xuống dòng/font chữ/viewport thay đổi) → Làm mới thời gian thực khoảng lệch sticky */
            if (entryEl.classList.contains('rlog-record-header')) {
                const recordEl = entryEl.closest('.rlog-record');
                if (recordEl) {
                    recordEl.style.setProperty('--rlog-rec-h', `${readObservedHeight(entry, entryEl).toFixed(2)}px`);
                }
                continue;
            }
            /* Bản thân vùng nội dung thay đổi kích thước → Chỉ đưa "duy nhất cái này" vào tập hợp chờ cập nhật */
            if (entryEl.classList.contains('rmsg-content') || entryEl.classList.contains('rlog-read-content')) {
                requestThumbUpdate(entryEl);
                continue;
            }
            /* Chiều cao thanh tiêu đề tin nhắn thay đổi: Chính văn của cùng một tin nhắn sẽ bị đẩy lên/đẩy xuống, bản thân kích thước chính văn không đổi (observer sẽ không báo nó),
               nhưng độ lệch của nó so với mục tin nhắn đã thay đổi → Lấy lại chính văn theo mục tin nhắn, đi qua cùng bộ cập nhật định hướng */
            if (entryEl.classList.contains('rmsg-header')) {
                const itemEl = entryEl.closest('.rmsg-item');
                const contentEl = itemEl ? itemEl.querySelector('.rmsg-content') : null;
                if (contentEl) requestThumbUpdate(contentEl);
            }
        }
    });
}

/* IntersectionObserver lười tạo: Thanh tiến trình chỉ được tạo khi vùng nội dung đến gần viewport (rootMargin 200px),
   tránh việc mở rộng hơn 100 tin nhắn lập tức tạo hàng loạt thanh tiến trình gây giật lag do layout đồng bộ. */
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

/* Trải đều việc "tạo thanh tiến trình" ra các frame liên tiếp: Một frame xử lý tối đa SCROLLBAR_CREATE_PER_FRAME mục, phần còn lại tiếp tục ở frame sau.
   Chỉ thay đổi phân bổ thời điểm tạo, điều kiện tạo, phán định và hành vi của thanh tiến trình đều không đổi. */
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
        /* Đã tách khỏi tài liệu / Đã có thanh tiến trình / Đã dỡ tải thành giữ chỗ / Quay lại hàng đợi lười quan sát, đều không xử lý ở đây:
           Giữ chỗ không có tràn viền, khôi phục và đưa lại vào hàng đợi do các đường dẫn hiện có chịu trách nhiệm */
        if (!contentEl || !contentEl.isConnected) continue;
        if (scrollbarCleanups.has(contentEl) || unloadedBodies.has(contentEl)) continue;
        if (pendingScrollbarContentEls.has(contentEl)) continue;
        batch.push(contentEl);
    }
    if (batch.length > 0) {
        /* Đọc hết giá trị layout của đợt này trước, rồi mới tạo DOM tập trung: Bản thân việc tạo sẽ thay đổi DOM, nếu "tạo một cái đọc một cái"
           mỗi lần tạo đều khiến lần đọc kế tiếp va phải layout mất hiệu lực, buộc phải chịu thêm N lần layout cưỡng bức */
        const measured = batch.map((contentEl) => ({ contentEl, m: measureScrollbarCreation(contentEl) }));
        measured.forEach(({ contentEl, m }) => {
            /* Cấu trúc container bất thường (phần tử đã tách khỏi quan hệ contentEl → container): Không thu dọn cũng không đăng ký lại, giao cho isConnected dọn dẹp */
            if (!m) return;
            /* "Chưa đo được" ≠ "Không tràn viền": Hiện tại không nhìn thấy / Không có layout thì clientHeight bằng 0, đo ra "không tràn viền" là giả tượng.
               Đăng ký lại vào hàng đợi lười quan sát, đợi khi nó thực sự nhìn thấy observer báo lại một lần nữa → Frame sau đo lại.
               observe lại do observer tự khử trùng (đã trong danh sách quan sát thì không đăng ký lặp), pending là Set cũng không thêm trùng;
               Chưa đo được ⇒ Phần tử hiện có kích thước bằng 0, observer sẽ không phán định giao nhau, do đó không tạo vòng lặp thử lại chạy không tải mỗi frame */
            if (!m.measurable) {
                queueScrollbarsForEls([contentEl]);
                return;
            }
            /* Đo được và thực sự tràn viền → Dựng thanh; đo được nhưng không cần cuộn (tin nhắn ngắn) là trạng thái cuối, không thử lại */
            if (m.hasOverflow) buildScrollbar(contentEl, m);
        });
    }
    if (scrollbarCreateQueue.length > 0) scheduleScrollbarCreateFlush();
}

/* Yêu cầu cập nhật vị trí con trượt (thumb) của thanh tiến trình (batching qua RAF): Không truyền tham số = Cập nhật toàn diện (bọc lót khi biến thiên hình học tổng thể),
   truyền contentEl = Chỉ cập nhật thanh tiến trình tương ứng của phần tử đó; nhiều yêu cầu trong cùng một frame được gộp thành một lần.
   Yêu cầu định hướng sau khi khử trùng theo phần tử sẽ cập nhật từng cái một (không thể chỉ giữ lại cái cuối: Nhiều phần tử thay đổi trong cùng frame sẽ bị sót).
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

/* Giai đoạn đọc: Một lần đọc hết toàn bộ giá trị layout cần thiết cho vùng nội dung này (bốn giá trị không phụ thuộc lẫn nhau, và style ghi sau đó chỉ tác động lên
   vùng chạm (hitbox)/con trượt (thumb) — chúng là các node anh em có position:absolute, sẽ không quay ngược lại làm đổi các giá trị này)
   @param {HTMLElement} contentEl Phần tử vùng nội dung @returns {object} */
function measureScrollbarThumb(contentEl) {
    const scrollHeight = contentEl.scrollHeight;
    const clientHeight = contentEl.clientHeight;
    const scrollTop = contentEl.scrollTop;
    const contentTop = contentEl.offsetTop;
    return { scrollHeight, clientHeight, scrollTop, contentTop, maxScroll: scrollHeight - clientHeight };
}

/* Giai đoạn ghi: Ghi style thanh tiến trình theo số liệu đã đo được (trong hàm này không đọc lại giá trị layout nữa)
   @param {object} cleanup Dữ liệu dọn dẹp của thanh tiến trình này (bao gồm hitboxEl/thumbEl)
   @param {object} m Giá trị trả về của measureScrollbarThumb */
function applyScrollbarThumb(cleanup, m) {
    const hitbox = cleanup.hitboxEl;
    const thumb = cleanup.thumbEl;
    if (!hitbox || !thumb) return;

    const { scrollHeight, clientHeight, scrollTop, contentTop, maxScroll } = m;

    /* Đồng bộ hình học trước, sau đó ẩn theo nhu cầu: Khi nội dung không cần cuộn (tin nhắn thu gọn, giữ chỗ đẳng cao bị dỡ tải ngoài màn hình)
       vùng chạm (hitbox) vẫn nằm trong DOM nhưng không nhìn thấy, vị trí và chiều cao cũng phải đi theo nội dung, tránh để lại số liệu hết hạn */
    hitbox.style.top = contentTop + 'px';
    hitbox.style.height = clientHeight + 'px';
    if (maxScroll <= 0) {
        hitbox.style.display = 'none';
        return;
    }
    hitbox.style.display = '';

    /* Chiều cao khả dụng của rãnh cuộn (track): Khấu trừ độ co thụt vào trên dưới của rãnh cuộn so với vùng chạm (hitbox) */
    const trackHeight = clientHeight - SCROLLBAR_TRACK_PADDING * 2;

    const thumbRatio = clientHeight / scrollHeight;
    const thumbHeight = Math.max(20, thumbRatio * trackHeight);
    thumb.style.height = thumbHeight + 'px';

    const thumbRange = trackHeight - thumbHeight;

    const thumbTop = maxScroll > 0 ? (scrollTop / maxScroll) * thumbRange : 0;
    thumb.style.top = thumbTop.toFixed(1) + 'px';
}

/* Cập nhật thanh tiến trình cho một nhóm vùng nội dung: Cả đợt đọc xong trước (giá trị layout), rồi cả đợt mới ghi style.
   Việc "ghi một cái, đọc cái tiếp theo" tuần tự sẽ khiến mỗi lần đọc đều va phải tình trạng mất hiệu lực style/layout do lần ghi trước gây ra, buộc phải thực hiện thêm layout cưỡng bức.
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

/* Lười tạo thanh tiến trình cho một nhóm .rmsg-content (chỉ dựng khi vào/gần viewport; bỏ qua nếu đã trong hàng đợi quan sát hoặc đã có thanh tiến trình)
   @param {NodeListOf<HTMLElement>|HTMLElement[]} contentEls */
function queueScrollbarsForEls(contentEls) {
    ensureScrollbarLazyObserver();
    /* Hỗ trợ .rmsg-content (vùng nội dung tin nhắn) và .rlog-read-content (vùng nội dung lớp phủ xem toàn văn) */
    const SCROLLABLE_CONTENT_CLASSES = ['rmsg-content', 'rlog-read-content'];
    contentEls.forEach((contentEl) => {
        if (!contentEl || !contentEl.classList) return;
        if (!SCROLLABLE_CONTENT_CLASSES.some(c => contentEl.classList.contains(c))) return;
        /* Giữ chỗ bị dỡ tải ngoài màn hình không có nội dung, cũng không nên có thanh tiến trình; hơn nữa một khi bị observer lười tiêu thụ sẽ bị gỡ khỏi hàng đợi quan sát,
           sau khi khôi phục tin nhắn này sẽ vĩnh viễn không có thanh tiến trình — thống nhất do restoreBody() xếp lại hàng sau khi khôi phục */
        if (unloadedBodies.has(contentEl)) return;
        if (pendingScrollbarContentEls.has(contentEl)) return;
        if (scrollbarCleanups.has(contentEl)) return;
        pendingScrollbarContentEls.add(contentEl);
        scrollbarLazyObserver.observe(contentEl);
    });
}

/* Lấy thanh tiêu đề liền kề mà "chiều cao thay đổi sẽ đẩy vùng nội dung này lên/xuống": Chỉ vùng nội dung tin nhắn (bên trong .rmsg-item) mới có —
   Vùng nội dung của lớp phủ "Xem toàn văn" cuộn trong popup cố định, vị trí không bị ảnh hưởng bởi phần tử đồng cấp, trả về null.
   @param {HTMLElement} contentEl @returns {HTMLElement|null} */
function getContentAnchorHeaderEl(contentEl) {
    const container = contentEl.parentElement;
    if (!container || !container.classList.contains('rmsg-item')) return null;
    return container.querySelector('.rmsg-header');
}

/* Giai đoạn đọc: Giá trị layout/style cần đọc trước khi tạo thanh tiến trình. Tách riêng ra để việc tạo hàng loạt có thể "đọc xong một đợt trước, rồi dựng đồng loạt",
   tránh lặp đi lặp lại việc kích hoạt layout cưỡng bức kiểu "dựng một cái đọc một cái".
   @param {HTMLElement} contentEl Phần tử .rmsg-content @returns {object|null} */
function measureScrollbarCreation(contentEl) {
    /* Gắn trên container cha của contentEl (không phải bên trong contentEl):
       .rmsg-content → .rmsg-item; .rlog-read-content → .rlog-read-overlay */
    /* Như vậy vùng chạm (hitbox) khi định vị bằng position: absolute sẽ không bị dời khỏi viewport theo việc cuộn của contentEl */
    const container = contentEl.parentElement;
    if (!container) return null;
    const isRmsgItem = container.classList.contains('rmsg-item');
    const isReadOverlay = container.classList.contains('rlog-read-overlay');
    if (!isRmsgItem && !isReadOverlay) return null;
    const clientHeight = contentEl.clientHeight;
    return {
        container,
        /* Có đo được layout hợp lệ hay không: Khi vùng nội dung bị thu gọn / ẩn toàn bộ thì clientHeight bằng 0,
           lúc này "không tràn viền" là giả tượng, không thể coi là "không cần thanh tiến trình" để kết thúc (sẽ làm sót thanh vĩnh viễn),
           cần giữ lại trong danh sách chờ để thử lại sau khi nhìn thấy. Vùng nội dung hiển thị bình thường có padding, clientHeight chắc chắn > 0 */
        measurable: clientHeight > 0,
        /* Nội dung không cần cuộn thì không cần thanh tiến trình; đọc giá trị layout scrollHeight ở đây là không thể tránh khỏi,
           nhưng chỉ thực hiện khi đi vào viewport (lười tạo + theo đợt) */
        hasOverflow: contentEl.scrollHeight > clientHeight,
        /* Container cần position: relative làm mốc định vị cho vùng chạm (hitbox) */
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

/* Giai đoạn ghi: Dựng DOM và listener theo kết quả của measureScrollbarCreation (trong hàm này không đọc lại giá trị layout nữa)
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

    /* Điểm tròn (dot) làm phần tử con trực tiếp của vùng chạm (hitbox) (đồng cấp với rãnh cuộn track), tránh bị overflow:hidden của rãnh cuộn cắt cụt */
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

    /* Đăng ký cleanup trước rồi mới yêu cầu cập nhật ban đầu (khi cập nhật sẽ tra cứu cleanup theo vùng nội dung để tìm hitbox/thumb) */
    scrollbarCleanups.set(contentEl, cleanup);
    requestThumbUpdate(contentEl);

    /* Lắng nghe sự kiện scroll (batching qua RAF, tránh cuộn tần suất cao kích hoạt layout cưỡng bức liên tục) */
    const onScroll = () => requestThumbUpdate(contentEl);
    cleanup.scrollHandler = onScroll;
    contentEl.addEventListener('scroll', onScroll, { passive: true });

    ensureSharedResizeObserver();
    if (sharedResizeObserver) {
        try {
            sharedResizeObserver.observe(contentEl);
        } catch (e) { /* ignore */ }
        /* Đồng thời quan sát thanh tiêu đề tin nhắn phía trên: Nó cao lên sẽ đẩy chính văn xuống, trong khi bản thân kích thước chính văn không đổi
           (observer sẽ không báo chính văn) — giao cho callback RO ánh xạ ngược lại chính văn này để cập nhật định hướng */
        const anchorHeaderEl = getContentAnchorHeaderEl(contentEl);
        if (anchorHeaderEl) {
            try {
                sharedResizeObserver.observe(anchorHeaderEl, { box: 'border-box' });
            } catch (e) { /* ignore */ }
        }
    }

    /* --- Tương tác: Điểm tròn (dot) đi theo vị trí ngón tay (không đi theo con trượt thumb), có thể chạm tới hai đầu rãnh cuộn --- */
    /* boolean: Có đang kéo thả hay không */
    let dragging = false;
    /* number|null: pointerId hiện tại (dùng cho pointer capture) */
    let capturedPointerId = null;

    /* Tính toán giá trị top của điểm tròn (dot) trong vùng chạm (hitbox) dựa theo clientY (giới hạn trong phạm vi rãnh cuộn)
       @param {number} clientY Tọa độ Y trên trang của con trỏ
       @returns {number} Giá trị style.top của dot (tương đối so với hitbox) */
    function clientYToDotTop(clientY) {
        const hitboxRect = hitbox.getBoundingClientRect();
        /* Độ lệch Y của ngón tay so với đỉnh vùng chạm (hitbox) (dot là phần tử con của hitbox, style.top tương đối so với hitbox) */
        let relativeY = clientY - hitboxRect.top;

        const trackTop = SCROLLBAR_TRACK_PADDING;
        const trackBottom = hitboxRect.height - SCROLLBAR_TRACK_PADDING;
        relativeY = Math.max(trackTop, Math.min(trackBottom, relativeY));

        /* Một nửa chiều cao điểm tròn: Làm cho giá trị trả về hướng vào tâm điểm tròn (top của dot là góc trên bên trái).
           Giá trị lấy phải bằng một nửa chiều cao thực tế của .rlog-scroll-dot trong CSS, khi điều chỉnh kích thước điểm tròn phải đồng bộ sửa ở đây */
        const DOT_HALF = 2.5;
        return (relativeY - DOT_HALF) + 'px';
    }

    /* Suy tính ngược vị trí cuộn nội dung dựa theo vị trí điểm tròn
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
        /* Chỉ xử lý nút chính (chuột trái hoặc cảm ứng) */
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
    /* lostpointercapture dùng làm dọn dẹp bọc lót */
    hitbox.addEventListener('lostpointercapture', onPointerUp);

}

/* Gỡ bỏ thanh tiến trình overlay của một .rmsg-content đơn lẻ và dọn dẹp tài nguyên
   @param {HTMLElement} contentEl Phần tử .rmsg-content */
function detachScrollbarForContent(contentEl) {
    /* Việc hủy đăng ký phía ghi nhận được thực hiện vô điều kiện: Bất kể thanh tiến trình đã dựng ra hay chưa, đều phải dọn sạch đăng ký "chờ tạo".
       Nếu không khi chính văn bị dỡ tải trong thời gian xếp hàng, pending / observer sẽ để lại đăng ký hết hạn,
       sau đó khôi phục đi qua queueScrollbarsForEls() sẽ bị "đã có trong danh sách chờ" chặn lại → Vĩnh viễn thiếu thanh.
       Tiện thể đưa các phần tử vẫn còn trong hàng đợi tạo phân bổ theo frame ra ngoài, tránh xung đột với lần dọn dẹp này hoặc lần đưa lại vào hàng đợi sau đó */
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

/* Xóa các phần tử đã rời khỏi tài liệu trong hàng đợi "xếp hàng chờ vào viewport mới tạo thanh tiến trình" (các phần tử cũ đã bị hủy sau khi dựng lại toàn bảng).
   Hàng đợi quan sát và Set đều tham chiếu mạnh tới phần tử, nếu không cắt đứt thì mỗi vòng dựng lại sẽ giữ nguyên toàn bộ DOM danh sách của vòng trước trong bộ nhớ;
   Các phần tử vẫn còn trong tài liệu (như vùng nội dung lớp phủ "Xem toàn văn", dựng lại không hủy nó) vẫn được giữ lại trong hàng đợi, hành vi không đổi. */
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

/* Tạo/làm mới thanh tiến trình cho tất cả .rmsg-content trong danh sách (gọi sau khi dựng lại DOM và sau khi mở rộng/thu gọn), lười tạo để tránh giật lag hàng loạt
   @param {HTMLElement} listEl */
function attachScrollIndicators(listEl) {
    /* Dọn dẹp thanh tiến trình đã bị tiêu hủy cùng với việc dựng lại: Chỉ xử lý các phần tử đã rời khỏi tài liệu.
       renderPanelContent dùng innerHTML dựng lại DOM, phần tử cũ trong danh sách chắc chắn đã tách khỏi tài liệu;
       Trong khi vùng nội dung của lớp phủ "Xem toàn văn" đồng cấp với danh sách, việc dựng lại không hủy nó (thanh tiến trình của nó chỉ gắn một lần khi mở lớp phủ),
       nếu gỡ bỏ cùng thì sẽ không còn ai dựng lại nữa, do đó giữ lại. */
    scrollbarCleanups.forEach((_, contentEl) => {
        if (contentEl.isConnected) return;
        detachScrollbarForContent(contentEl);
    });
    /* Các phần tử cũ xếp hàng chờ tạo thanh tiến trình của vòng trước cũng bị hủy cùng với việc dựng lại, ở đây đưa ra khỏi hàng đợi tập trung */
    clearDetachedPendingScrollbarEls();

    /* Tất cả đi vào hàng đợi quan sát lười tạo, do IntersectionObserver tạo theo nhu cầu dựa vào viewport */
    queueScrollbarsForEls(listEl.querySelectorAll('.rmsg-content'));
}

/* ── Dỡ tải và khôi phục chính văn theo nhu cầu ─────────────────── */

/* Map<HTMLElement, {scrollTop:number}>: Các phần tử chính văn tin nhắn đã bị dỡ tải ngoài màn hình (văn bản đã xóa rỗng, chiều cao đã khóa).
   Văn bản chính văn không sao lưu ở đây — records[].messages[].content chính là nguồn duy nhất, khi khôi phục sẽ ghi lại theo toRenderedText,
   dùng chung cùng một mốc văn bản với highlight tìm kiếm; ở đây chỉ cần ghi lại vị trí cuộn bên trong phần tử. */
const unloadedBodies = new Map();

/* number: Chiều rộng danh sách trong lần bảo trì băng thông trước (px). Panel co giãn/toàn màn hình trên mobile/chuyển đổi desktop ↔ mobile đều thay đổi độ rộng xuống dòng của chính văn,
   chiều cao giữ chỗ đã khóa lập tức mất hiệu lực — khi phát hiện thay đổi chiều rộng sẽ khôi phục toàn bộ chính văn trước, frame sau đo lại theo hình học mới rồi dỡ tải lại. */
let lastBandListWidth = 0;

/* boolean: Đã có một lần bảo trì băng thông xếp hàng ở frame kế tiếp hay chưa (các kích hoạt liên tiếp như cuộn/dựng lại được gộp thành một lần mỗi frame) */
let bodyBandPassQueued = false;

/* Thống kê dỡ tải chính văn (giao diện debug chỉ đọc __rlogDebug.getBodyUnloadStats dùng; assertion hồi quy và probe hiệu năng cũng đọc nó) */
const bodyUnloadStats = { passes: 0, lastPassMs: 0, restoreAllCount: 0 };

/* Khởi tạo việc bảo trì dải cuộn của danh sách: Khi cuộn sẽ khôi phục theo nhu cầu chính văn đi vào băng thông, dỡ tải chính văn rời khỏi băng thông.
   Chỉ gắn một lần sau khi buildUI dựng xong danh sách (bản thân phần tử #rlog-list không bị thay thế khi dựng lại toàn bảng). */
function initBodyBandMaintenance(listEl) {
    if (!listEl || listEl.dataset.rlogBandBound === '1') return;
    listEl.dataset.rlogBandBound = '1';
    listEl.addEventListener('scroll', () => scheduleBodyBandPass(listEl), { passive: true });
}

/* Băng thông nhìn thấy của danh sách: Trên dưới viewport mỗi bên BODY_KEEP_SCREENS màn hình. Danh sách bị panel cắt cụt, dùng chính hình chữ nhật của danh sách là chuẩn nhất */
function getBodyBand(listEl) {
    const rect = listEl.getBoundingClientRect();
    const margin = rect.height * BODY_KEEP_SCREENS;
    return { top: rect.top - margin, bottom: rect.bottom + margin };
}

/* Chính văn này có bị "ghim" không cho phép dỡ tải hay không: Phần tử chứa thẻ highlight tìm kiếm <mark>, cũng như bản ghi đang được tìm kiếm.
   Highlight tìm kiếm và bước nhảy trúng đích đều phụ thuộc vào text node thực tế, dỡ tải chúng sẽ làm mất hiệu lực highlight. */
function isBodyPinned(contentEl) {
    if (contentEl.querySelector('mark.rlog-search-mark, mark.rlog-search-mark-current')) return true;
    if (!searchState) return false;
    const recordEl = contentEl.closest('.rlog-record');
    return !!recordEl && Number(recordEl.dataset.recordIndex) === searchState.recordIndex;
}

/* Dỡ tải chính văn đơn lẻ: Xóa rỗng văn bản, khóa cứng chiều cao thành chiều cao đo thực tế (giữ chỗ đẳng cao), và ghi lại vị trí cuộn trong phần tử.
   height do phía gọi đo sẵn trong "giai đoạn đọc" truyền vào; khi không truyền mới tự đọc một lần (tránh kích hoạt thêm layout cưỡng bức trong giai đoạn ghi).
   Lưu ý không ghi contentEl.scrollTop ở đây: Sau khi xóa rỗng phần tử không còn cuộn được nữa, nó sẽ tự động về 0,
   mà việc gán giá trị sẽ ép một lần layout (đo thực tế mỗi mục khoảng 1ms, 400 mục là vài trăm mili-giây). */
function unloadBody(contentEl, height) {
    if (!contentEl || unloadedBodies.has(contentEl)) return false;
    const measuredHeight = typeof height === 'number' ? height : contentEl.getBoundingClientRect().height;
    if (measuredHeight <= 0) return false;
    unloadedBodies.set(contentEl, { scrollTop: contentEl.scrollTop });
    contentEl.textContent = '';
    contentEl.style.height = `${measuredHeight}px`;
    contentEl.dataset.rlogUnloaded = '1';
    /* Giữ chỗ không còn cần thanh tiến trình nội bộ: Tiện thể dọn sạch DOM vùng chạm (hitbox), listener scroll và đăng ký observer, tài nguyên giải phóng cùng với giữ chỗ.
       Khi khôi phục do restoreBody đưa lại vào hàng đợi theo cơ chế hiện có, tạo lại, vị trí cuộn đã ghi vào unloadedBodies ở phía trên. */
    detachScrollbarForContent(contentEl);
    return true;
}

/* Khôi phục chính văn đơn lẻ: Ghi lại văn bản từ tầng dữ liệu, gỡ bỏ khóa chiều cao, hoàn nguyên vị trí cuộn bên trong phần tử, và xếp lại vào hàng đợi lười tạo thanh tiến trình.
   Khi phần tử đã tách khỏi tài liệu (node cũ sau khi dựng lại toàn bảng) sẽ trực tiếp vứt bỏ mục bảng, tránh giữ nguyên cả cây con danh sách cũ trong bộ nhớ. */
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
    contentEl.textContent = toRenderedText(getMessageDisplayText(msg));
    contentEl.style.height = '';
    delete contentEl.dataset.rlogUnloaded;
    if (state.scrollTop) contentEl.scrollTop = state.scrollTop;
    /* Thanh tiến trình bắt buộc phải đưa lại vào hàng đợi: Giữ chỗ không có tràn viền, nếu observer lười thấy nó dưới trạng thái giữ chỗ sẽ trả về sớm và gỡ phần tử khỏi hàng đợi quan sát,
       như vậy sau khi khôi phục tin nhắn này sẽ vĩnh viễn không có thanh tiến trình (xem phán định cùng loại trong queueScrollbarsForEls) */
    queueScrollbarsForEls([contentEl]);
    return true;
}

/* Khôi phục tất cả chính văn đã dỡ tải trong một bản ghi (bước bắt buộc trước khi mở rộng bản ghi này và thực hiện tìm kiếm trên bản ghi đó) */
function restoreRecordBodies(recordEl) {
    if (!recordEl) return 0;
    let count = 0;
    recordEl.querySelectorAll('.rmsg-content').forEach((contentEl) => {
        if (restoreBody(contentEl)) count++;
    });
    return count;
}

/* Khôi phục toàn diện: Dùng khi thay đổi chiều rộng panel làm mất hiệu lực chiều cao giữ chỗ (đường dẫn hiếm gặp, chi phí chấp nhận được) */
function restoreAllBodies() {
    [...unloadedBodies.keys()].forEach((contentEl) => restoreBody(contentEl));
}

/* Vứt bỏ các mục đã tách khỏi tài liệu (sau khi dựng lại toàn bảng dùng innerHTML thay thế toàn bộ danh sách, node cũ bắt buộc phải kịp thời ra khỏi bảng,
   nếu không Map sẽ tham chiếu mạnh tới chúng, giữ cả cây con danh sách của vòng trước trong bộ nhớ) */
function pruneDetachedUnloadedBodies() {
    if (unloadedBodies.size === 0) return;
    unloadedBodies.forEach((_, contentEl) => {
        if (!contentEl.isConnected) unloadedBodies.delete(contentEl);
    });
}

/* Một lần bảo trì băng thông. Giai đoạn đọc trước tiên đọc xong toàn bộ hình học và trạng thái của chính văn (không ghi DOM), sau đó mới thực thi khôi phục và dỡ tải tập trung:
   Ghi một cái đọc một cái sẽ khiến mỗi lần đọc va phải tình trạng mất hiệu lực style vừa ghi xong, buộc phải thực hiện thêm layout cưỡng bức. */
function runBodyBandPass(listEl) {
    if (!listEl || !listEl.isConnected) return;
    /* Khi panel ẩn / Danh sách không có layout thực tế thì không thực hiện: Lúc này rect toàn bộ là 0, phán định băng thông không có ý nghĩa */
    if (!isPanelExpanded || listEl.clientHeight === 0) return;

    const startedAt = performance.now();

    /* Chiều rộng thay đổi → Chiều cao giữ chỗ đo theo chiều rộng cũ, khôi phục toàn bộ trước, frame sau đo lại theo hình học mới rồi dỡ tải lại */
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

    /* Giai đoạn đọc: Hình chữ nhật vùng nội dung + Có bị ghim không + Đã dỡ tải chưa (toàn bộ không ghi DOM) */
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

    /* Giai đoạn ghi: Khôi phục trước (khôi phục ưu tiên hơn dỡ tải, tránh rung lắc qua lại ở mép băng thông), sau đó mới dỡ tải */
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

/* Gộp việc bảo trì băng thông vào frame kế tiếp (khi cuộn/viewport thay đổi kích hoạt liên tục, một frame chạy tối đa một lần) */
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

/* ── Điều khiển panel ─────────────────────────── */

/* Cạnh thực tế của nút nổi: Desktop BADGE_SIZE (34×34), mobile (≤768px) BADGE_SIZE_MOBILE (30×30);
   Kích thước đi qua inline style (định vị nút nổi và hiệu chỉnh vượt biên cần giá trị pixel cụ thể), trong style.css chỉ chỉnh cỡ chữ icon */
function getBadgeSize() {
    return window.matchMedia('(max-width: 768px)').matches ? BADGE_SIZE_MOBILE : BADGE_SIZE;
}

/* Vị trí hợp lệ của nút nổi trong viewport: Tham số đầu vào là tọa độ góc trên bên trái của nút nổi, clamp vào trong viewport (đảm bảo nút nổi hoàn toàn nhìn thấy).
   Cận dưới top lấy chiều cao thực tế của thanh cài đặt đỉnh ST: Thứ tự layer của nút nổi thấp hơn thanh cài đặt đỉnh, nếu đi vào độ cao đó sẽ bị che mất không nhấp được,
   do đó cấm nút nổi đi vào khu vực thanh đỉnh, đảm bảo mọi vị trí đều nhìn thấy và nhấp được. */
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

/* Vị trí rơi mặc định của "Lối vào nút nổi mặc định": Cách mép phải BADGE_DEFAULT_MARGIN_RIGHT, mép dưới thanh đỉnh ST xuống tiếp
   BADGE_DEFAULT_MARGIN_TOP, cuối cùng qua clampBadgeToViewport bọc lót; sau khi kéo thả do badgePos tiếp quản. */
function getDefaultBadgePos() {
    const size = getBadgeSize();
    const topBarEl = document.getElementById('top-settings-holder');
    const minTop = topBarEl ? Math.ceil(topBarEl.getBoundingClientRect().height) : 0;
    return clampBadgeToViewport(
        window.innerWidth - size - BADGE_DEFAULT_MARGIN_RIGHT,
        minTop + BADGE_DEFAULT_MARGIN_TOP
    );
}

/* Đồng bộ kích thước nút nổi: Rộng/cao của host chuyển đổi theo breakpoint, gọi khi khởi tạo và resize */
function updateBadgeSize() {
    if (!badgeEl) return;
    const size = getBadgeSize();
    badgeEl.style.width = size + 'px';
    badgeEl.style.height = size + 'px';
}

/* ST hiện tại có phải dark theme hay không: Đọc --SmartThemeBlurTintColor tính độ sáng cảm nhận tương đối < ngưỡng phán định là dark theme;
   Không đọc được/Không nhận diện được/Phân tích cú pháp thất bại đều mặc định là dark theme (quay về nút nổi màu sáng). @returns {boolean} */
function isStThemeDark() {
    let raw = '';
    try {
        raw = getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBlurTintColor').trim();
    } catch (e) { /* Đọc thất bại: Xử lý theo dark theme */ }
    const channels = parseCssColorChannels(raw);
    if (!channels) return true;
    return relativeLuminance(channels.r, channels.g, channels.b) < ST_THEME_DARK_LUMINANCE;
}

/* Đồng bộ phối màu nút nổi: ST màu sáng → Nút nổi màu tối, ST màu tối → Nút nổi màu sáng (luôn ngược lại để đảm bảo độ tương phản).
   Chỉ thêm bớt .rlog-badge-light trên host của nút nổi (số liệu phối màu nằm ở bảng tổng); khi kết quả phán định không đổi thì không động vào DOM, tránh làm đứt đoạn transition. */
function syncBadgeTheme() {
    if (!badgeEl) return;
    const isDark = isStThemeDark();
    /* Trạng thái và class của host đều đã nhất quán mới bỏ qua (thêm một bước kiểm tra class: Host dựng lại cũng có thể tự lành) */
    if (isDark === stThemeIsDark && badgeEl.classList.contains('rlog-badge-light') === isDark) return;
    stThemeIsDark = isDark;
    badgeEl.classList.toggle('rlog-badge-light', isDark);
}

/* Trong thời gian nút nổi hiển thị, lắng nghe thuộc tính style của <html> (ST không có sự kiện thay đổi theme);
   Điểm gắn sau này nếu mất hiệu lực chỉ biểu hiện là phối màu nút nổi không cập nhật nữa */
function activateBadgeThemeFollow() {
    if (!badgeEl || isPanelExpanded || !badgeEl.classList.contains('rlog-badge-active')) return;
    if (!badgeThemeObserver) {
        badgeThemeObserver = new MutationObserver(() => {
            if (isPanelExpanded || !badgeEl.classList.contains('rlog-badge-active')) return;
            syncBadgeTheme();
        });
    }
    badgeThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
}

/* Khi ẩn nút nổi sẽ gỡ bỏ observer theme, trước lần hiển thị tiếp theo sẽ đồng bộ lại một lần theo theme ST hiện tại. */
function deactivateBadgeThemeFollow() {
    if (!badgeThemeObserver) return;
    badgeThemeObserver.disconnect();
    badgeThemeObserver = null;
}

/* Đặt lại panel về định vị/kích thước mặc định: Xóa inline style do kéo thả/co giãn ghi vào, để giá trị mặc định của style.css có hiệu lực
   (Định vị mặc định vốn đã nằm trong viewport, không cần hiệu chỉnh biên phụ trợ) */
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

/* Chuyển đổi ẩn/hiện nút nổi: Nút nổi là lối vào dùng chung khi ẩn panel, không phân biệt hiển thị tạm thời hay hiển thị thường trực.
   Observer theme chỉ tồn tại trong thời gian nút nổi thực sự hiển thị; trước khi hiển thị sẽ bù lại một lần phối màu hiện tại. */
function setBadgeActive(active) {
    if (!badgeEl) return;
    if (!active) {
        deactivateBadgeThemeFollow();
        badgeEl.classList.remove('rlog-badge-active');
        badgeEl.style.display = 'none';
        return;
    }
    syncBadgeTheme();
    badgeEl.classList.add('rlog-badge-active');
    /* host là light DOM, dùng inline display là ổn định nhất, tránh việc theme bên thứ ba ảnh hưởng ẩn hiện qua CSS thông thường */
    badgeEl.style.display = 'flex';
    activateBadgeThemeFollow();
}

/* Hiển thị nút nổi tại vị trí phiên; khi chưa thiết lập vị trí thì dùng vị trí mặc định ở góc trên bên phải. */
function showBadgeAtStoredPosition() {
    if (!badgeEl) return;
    /* Trong thời gian ẩn có thể đã vượt qua breakpoint desktop/mobile; hiệu chỉnh kích thước theo viewport hiện tại trước, rồi clamp vị trí ghi nhận. */
    updateBadgeSize();
    if (!badgePos) badgePos = getDefaultBadgePos();
    else badgePos = clampBadgeToViewport(badgePos.left, badgePos.top);
    badgeEl.style.left = badgePos.left + 'px';
    badgeEl.style.top = badgePos.top + 'px';
    setBadgeActive(true);
    syncViewportListenerLifecycle();
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
    toggleBtn.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> Nhật ký yêu cầu gần đây';
    toggleBtn.addEventListener('click', togglePanel);
    menu.appendChild(toggleBtn);
    syncMenuEntryVisibility();

    /* Trì hoãn append lại, đảm bảo xếp sau tất cả tiện ích khởi tạo đồng bộ (appendChild sẽ di chuyển node đã có) */
    setTimeout(() => {
        if (toggleBtn && toggleBtn.parentNode) {
            toggleBtn.parentNode.appendChild(toggleBtn);
        }
    }, MENU_REORDER_DELAY_MS);
}

/* Hiển thị hoặc ẩn tức thì lối vào menu tiện ích mở rộng theo tùy chọn; giữ lại node và sự kiện, không đụng chạm các mục menu tiện ích mở rộng khác. */
function syncMenuEntryVisibility() {
    if (!toggleBtn) return;
    toggleBtn.style.display = preferences.hideExtensionEntry ? 'none' : '';
}

/* Lấy nút QR native của tiện ích (tập hợp chỉ giữ lại một mục, tiêu đề dùng để phân biệt với QR của chính người dùng). */
function getQuickReplyEntryButtonEl() {
    const set = window.quickReplyApi?.getSetByName(QUICK_REPLY_ENTRY_SET_NAME);
    if (!set?.dom) return null;
    return Array.from(set.dom.querySelectorAll('.qr--button'))
        .find(button => button.title === QUICK_REPLY_ENTRY_LABEL && button.isConnected) ?? null;
}

/* Chỉ coi tập hợp có cả tên và nội dung đều khớp quy ước là dữ liệu của chính tiện ích, tránh xóa nhầm tập hợp trùng tên của người dùng. */
function isQuickReplyEntrySetOwned(set) {
    if (!set) return false;
    if (set.qrList.length === 0) return true;
    if (set.qrList.length !== 1) return false;
    const item = set.qrList[0];
    return item.label === QUICK_REPLY_ENTRY_LABEL
        || item.message === `/${QUICK_REPLY_ENTRY_COMMAND}`;
}

/* Đăng ký lệnh slash thường trực của tiện ích; sau khi làm mới trang sẽ do tiện ích này đăng ký lại. */
async function ensureToggleCommand() {
    if (toggleCommandReady) return;
    const [{ SlashCommandParser }, { SlashCommand }] = await Promise.all([
        import('/scripts/slash-commands/SlashCommandParser.js'),
        import('/scripts/slash-commands/SlashCommand.js'),
    ]);
    const existing = SlashCommandParser.commands[QUICK_REPLY_ENTRY_COMMAND];
    if (existing) {
        if (existing.source !== PLUGIN_KEY) {
            throw new Error(`Slash command conflict: ${QUICK_REPLY_ENTRY_COMMAND}`);
        }
        toggleCommandReady = true;
        return;
    }
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: QUICK_REPLY_ENTRY_COMMAND,
        helpString: 'Chuyển đổi bảng điều khiển Nhật ký yêu cầu gần đây; vẫn dùng được khi lối vào tiện ích bị ẩn.',
        returns: 'Chuỗi rỗng',
        callback: () => {
            togglePanel();
            return '';
        },
    }));
    toggleCommandReady = true;
}

/* Xóa bỏ tham chiếu đang hoạt động của tập hợp tiện ích trong cấu hình toàn cục, chat và nhân vật. */
function removeQuickReplyEntryLinks(api, set) {
    if (!api || !set) return;
    const configs = [
        api.settings.config,
        api.settings.chatConfig,
        api.settings.charConfig,
    ].filter(Boolean);
    configs.forEach((config) => {
        if (config.hasSet(set)) config.removeSet(set);
    });
}

/* Tạo hoặc sửa chữa tập hợp chuyên dụng của tiện ích; khi cấu hình đã chính xác thì không ghi đè vào đĩa. */
async function ensureQuickReplyEntrySet(api) {
    let set = api.getSetByName(QUICK_REPLY_ENTRY_SET_NAME);
    if (!set) {
        set = await api.createSet(QUICK_REPLY_ENTRY_SET_NAME, {
            disableSend: false,
            placeBeforeInput: false,
            injectInput: false,
        });
    }

    if (set.qrList.length > 1) {
        throw new Error(`QR entry set contains unexpected items: ${QUICK_REPLY_ENTRY_SET_NAME}`);
    }
    let item = set.qrList[0];
    if (item && item.label !== QUICK_REPLY_ENTRY_LABEL
        && item.message !== `/${QUICK_REPLY_ENTRY_COMMAND}`) {
        throw new Error(`QR entry set name conflict: ${QUICK_REPLY_ENTRY_SET_NAME}`);
    }

    if (set.disableSend || set.placeBeforeInput || set.injectInput) {
        await api.updateSet(QUICK_REPLY_ENTRY_SET_NAME, {
            disableSend: false,
            placeBeforeInput: false,
            injectInput: false,
        });
    }

    if (!item) {
        item = api.createQuickReply(QUICK_REPLY_ENTRY_SET_NAME, QUICK_REPLY_ENTRY_LABEL, {
            icon: '',
            showLabel: true,
            message: `/${QUICK_REPLY_ENTRY_COMMAND}`,
            title: QUICK_REPLY_ENTRY_LABEL,
            isHidden: false,
        });
    } else if (item.label !== QUICK_REPLY_ENTRY_LABEL
        || item.message !== `/${QUICK_REPLY_ENTRY_COMMAND}`
        || item.title !== QUICK_REPLY_ENTRY_LABEL
        || item.icon
        || !item.showLabel
        || item.isHidden
        || item.executeOnStartup
        || item.executeOnUser
        || item.executeOnAi
        || item.executeOnChatChange
        || item.executeOnGroupMemberDraft
        || item.executeOnNewChat
        || item.executeBeforeGeneration
        || item.automationId) {
        item = api.updateQuickReply(QUICK_REPLY_ENTRY_SET_NAME, item.label, {
            icon: '',
            showLabel: true,
            newLabel: QUICK_REPLY_ENTRY_LABEL,
            message: `/${QUICK_REPLY_ENTRY_COMMAND}`,
            title: QUICK_REPLY_ENTRY_LABEL,
            isHidden: false,
            executeOnStartup: false,
            executeOnUser: false,
            executeOnAi: false,
            executeOnChatChange: false,
            executeOnGroupMemberDraft: false,
            executeOnNewChat: false,
            executeBeforeGeneration: false,
            automationId: '',
        });
    }

    return set;
}

/* Tập hợp tiện ích chỉ giữ lại một tham chiếu nhìn thấy toàn cục, tránh việc xếp chồng cấu hình phạm vi chat/nhân vật tạo ra các nút trùng lặp. */
function ensureQuickReplyEntryLink(api, set) {
    [api.settings.chatConfig, api.settings.charConfig]
        .filter(Boolean)
        .forEach((config) => {
            if (config.hasSet(set)) config.removeSet(set);
        });
    const globalConfig = api.settings.config;
    const link = globalConfig.setList.find(entry => entry.set === set);
    if (!link) {
        api.addGlobalSet(QUICK_REPLY_ENTRY_SET_NAME, true);
    } else if (!link.isVisible) {
        link.isVisible = true;
        globalConfig.update();
    }
}

/* Thêm/bớt tham chiếu tập hợp QR native theo tùy chọn; render, gộp, popup và thu gọn toàn bộ giao cho ST. */
async function reconcileQuickReplyEntry(enabled) {
    const api = window.quickReplyApi;
    if (!api?.settings) return;
    const existingSet = api.getSetByName(QUICK_REPLY_ENTRY_SET_NAME);
    if (!enabled) {
        if (isQuickReplyEntrySetOwned(existingSet)) {
            removeQuickReplyEntryLinks(api, existingSet);
        } else if (existingSet) {
            console.warn(`[${PLUGIN_KEY}] Bỏ qua việc gỡ bỏ tập hợp QR trùng tên`, QUICK_REPLY_ENTRY_SET_NAME);
        }
        return;
    }
    await ensureToggleCommand();
    const set = await ensureQuickReplyEntrySet(api);
    ensureQuickReplyEntryLink(api, set);
}

/* Áp dụng tuần tự trạng thái lối vào QR, tránh việc bật/tắt nhanh gây đan xen tạo và gỡ bất đồng bộ. */
function syncQuickReplyEntry() {
    const enabled = preferences.quickReplyEntry;
    quickReplyEntrySyncQueue = quickReplyEntrySyncQueue
        .catch(() => null)
        .then(() => reconcileQuickReplyEntry(enabled))
        .catch((error) => {
            console.warn(`[${PLUGIN_KEY}] Đồng bộ lối vào QR thất bại`, error);
        });
    return quickReplyEntrySyncQueue;
}

/* Dọn dẹp tập hợp QR chuyên dụng của tiện ích và tất cả tham chiếu đang hoạt động của nó; dùng cho việc dọn dẹp khi gỡ cài đặt. */
async function removeQuickReplyEntrySet() {
    const api = window.quickReplyApi;
    const set = api?.getSetByName(QUICK_REPLY_ENTRY_SET_NAME);
    if (!isQuickReplyEntrySetOwned(set)) return;
    removeQuickReplyEntryLinks(api, set);
    await api.deleteSet(QUICK_REPLY_ENTRY_SET_NAME);
}

/* Khi chuyển từ một ngăn kéo đang mở sang ngăn kéo khác, giữ cho màn che bên ngoài nguyên vẹn; frame tiếp theo mới thu hồi đánh dấu, không làm trễ thêm animation nội dung. */
function markHeaderDrawerSwap(targetDrawer) {
    if (!panelEl || !targetDrawer) return;
    const drawerSelectors = [
        '#rlog-more-drawer',
        '#rlog-filter-drawer',
        '#rlog-global-search-drawer',
    ];
    const replacingOpenDrawer = drawerSelectors.some((selector) => {
        const drawer = panelEl.querySelector(selector);
        return drawer && drawer !== targetDrawer && drawer.classList.contains('expanded');
    });
    if (!replacingOpenDrawer) return;

    if (headerDrawerSwapClearFrame) cancelAnimationFrame(headerDrawerSwapClearFrame);
    panelEl.classList.add('rlog-drawer-switching');
    headerDrawerSwapClearFrame = requestAnimationFrame(() => {
        headerDrawerSwapClearFrame = 0;
        if (panelEl) panelEl.classList.remove('rlog-drawer-switching');
    });
}

/* Quản lý tập trung ngăn kéo "Thêm"; khi mở sẽ đóng hai ngăn kéo còn lại, cả ba dùng chung một hàng bên dưới thanh tiêu đề. */
function setMoreDrawerOpen(open) {
    if (!panelEl) return;
    const nextOpen = !!open;
    const drawer = panelEl.querySelector('#rlog-more-drawer');
    const btn = panelEl.querySelector('#rlog-more-btn');
    if (nextOpen) {
        markHeaderDrawerSwap(drawer);
        setGlobalSearchDrawerOpen(false);
        setFilterDrawerOpen(false);
    }
    if (drawer) {
        drawer.classList.toggle('expanded', nextOpen);
        drawer.setAttribute('aria-hidden', nextOpen ? 'false' : 'true');
        drawer.inert = !nextOpen;
    }
    if (btn) {
        btn.classList.toggle('active-drawer-btn', nextOpen);
        btn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    }
}

/* Thu lại ngăn kéo "Thêm" (dùng cho bật tắt, thoát panel, hướng dẫn) */
function closeMoreDrawer() {
    setMoreDrawerOpen(false);
}

/* Lớp chống chạm nhầm không nằm trong phạm vi cắt cụt của màn che, căn chỉnh độc lập theo vị trí và độ rộng thực tế của control tìm kiếm. */
function syncGlobalSearchGuard() {
    if (!globalSearchOpen || !panelEl) return;
    const drawer = panelEl.querySelector('#rlog-global-search-drawer');
    const controls = panelEl.querySelector('.rlog-global-search-controls');
    const guard = panelEl.querySelector('.rlog-global-search-guard');
    if (!drawer || !controls || !guard) return;
    const drawerRect = drawer.getBoundingClientRect();
    const controlsRect = controls.getBoundingClientRect();
    guard.style.width = `${controlsRect.width}px`;
    guard.style.right = `${Math.max(0, drawerRect.right - controlsRect.right)}px`;
    guard.style.top = `${Math.max(0, controlsRect.bottom - drawerRect.top)}px`;
}

/* Observer chống chạm nhầm chỉ quan sát control khi ngăn kéo tìm kiếm toàn cục mở rộng; instance được tái sử dụng, đóng mở nhiều lần không cộng dồn observer. */
function activateGlobalSearchGuardObserver() {
    if (!globalSearchOpen || !panelEl || typeof ResizeObserver !== 'function') return;
    const drawer = panelEl.querySelector('#rlog-global-search-drawer');
    const controls = panelEl.querySelector('.rlog-global-search-controls');
    if (!drawer || !controls) return;
    if (!globalSearchGuardObserver) {
        globalSearchGuardObserver = new ResizeObserver(syncGlobalSearchGuard);
    }
    if (!globalSearchGuardObserverActive) {
        globalSearchGuardObserver.observe(controls);
        globalSearchGuardObserver.observe(drawer);
        globalSearchGuardObserverActive = true;
    }
    syncGlobalSearchGuard();
}

/* Ngắt quan sát ngay sau khi đóng ngăn kéo; lần mở rộng sau sẽ do cùng một instance kết nối lại. */
function deactivateGlobalSearchGuardObserver() {
    if (!globalSearchGuardObserver || !globalSearchGuardObserverActive) return;
    globalSearchGuardObserver.disconnect();
    globalSearchGuardObserverActive = false;
}

/* Quản lý tập trung việc đóng mở và trạng thái phiên của ngăn kéo tìm kiếm toàn cục (khi đóng panel cũng tái sử dụng ở đây) */
function setGlobalSearchDrawerOpen(open) {
    globalSearchOpen = !!open;
    if (!panelEl) return;
    const drawer = panelEl.querySelector('#rlog-global-search-drawer');
    const btn = panelEl.querySelector('#rlog-global-search-btn');
    /* Ba ngăn kéo dưới thanh tiêu đề loại trừ lẫn nhau; khi đóng tìm kiếm toàn cục vẫn giữ lại điều kiện lọc hiện tại. */
    if (globalSearchOpen) {
        markHeaderDrawerSwap(drawer);
        setMoreDrawerOpen(false);
        setFilterDrawerOpen(false);
    }
    if (drawer) {
        drawer.classList.toggle('expanded', globalSearchOpen);
        drawer.setAttribute('aria-hidden', globalSearchOpen ? 'false' : 'true');
        drawer.inert = !globalSearchOpen;
    }
    if (!globalSearchOpen) {
        deactivateGlobalSearchGuardObserver();
        resetGlobalSearch();
        const activeEl = panelShadowRoot ? panelShadowRoot.activeElement : null;
        if (drawer && activeEl && drawer.contains(activeEl) && activeEl.blur) activeEl.blur();
    }
    if (btn) {
        btn.classList.toggle('active-drawer-btn', globalSearchOpen);
        btn.setAttribute('aria-expanded', globalSearchOpen ? 'true' : 'false');
    }
    if (globalSearchOpen) activateGlobalSearchGuardObserver();
}

/* Quản lý tập trung việc mở rộng, trạng thái nút kích hoạt và trạng thái accessibility của ngăn kéo bộ lọc; khi mở sẽ kết thúc tìm kiếm toàn cục và giữ lại điều kiện lọc. */
function setFilterDrawerOpen(open) {
    if (!panelEl) return;
    const nextOpen = !!open;
    const drawer = panelEl.querySelector('#rlog-filter-drawer');
    const btn = panelEl.querySelector('#rlog-filter-btn');
    if (nextOpen) {
        markHeaderDrawerSwap(drawer);
        setGlobalSearchDrawerOpen(false);
        setMoreDrawerOpen(false);
    }
    if (!drawer) return;
    drawer.classList.toggle('expanded', nextOpen);
    drawer.setAttribute('aria-hidden', nextOpen ? 'false' : 'true');
    drawer.inert = !nextOpen;
    if (btn) {
        btn.classList.toggle('active-drawer-btn', nextOpen);
        btn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    }
}

/* Thu lại ngăn kéo "Bộ lọc" (dùng cho chuyển đổi lối vào, thoát panel, hướng dẫn) */
function closeFilterDrawer() {
    setFilterDrawerOpen(false);
}

/* Định vị địa chỉ thực tế của tệp style.css của chính tiện ích này: Ưu tiên dùng thẻ <link> kiểu dáng tiện ích đã được ST chèn (id có dạng "<thư mục>-css"),
   khi không tìm thấy sẽ fallback về đường dẫn hardcode. Không dùng import.meta: ST khi tải dưới dạng ES Module thì document.currentScript là null,
   và kiểm thử logic dùng Node VM để nạp tệp này (không phải module). */
function getSelfCssUrl() {
    try {
        const link = [...document.querySelectorAll('link[rel="stylesheet"]')].find(l => l.id && l.id.endsWith('RecentRequestLog-css'));
        if (link) return link.href;
    } catch (e) { /* Không có document (như VM kiểm thử logic không chạy tới đây) hoặc ngoại lệ, đi đường bọc lót */ }
    return '/scripts/extensions/third-party/RecentRequestLog/style.css';
}

/* Nguồn kiểu dáng trong shadow (ưu tiên): Sao chép đồng bộ các quy tắc từ <link> style.css của tiện ích này đã được ST nạp thành <style> bên trong shadow,
   tránh việc <link> nạp bất đồng bộ khiến các phép đo sớm (như đầu dò độ rộng giữ chỗ trạng thái) không lấy được kiểu dáng class.
   Shadow root của panel và shadow root của nút nổi mỗi bên cần một bản; việc tuần tự hóa quy tắc đi qua selfCssTextCache chỉ thực hiện một lần. */
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
        /* Xuyên domain (CORS) hoặc stylesheet chưa sẵn sàng, v.v.: Đi theo đường <link> bọc lót bên dưới */
    }
    return buildSelfCssLink();
}

/* Nguồn kiểu dáng trong shadow (bọc lót): Tham chiếu trực tiếp tệp style.css của chính tiện ích này (tái sử dụng bộ nhớ đệm trình duyệt, không tải lặp lại nội dung) */
function buildSelfCssLink() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = getSelfCssUrl();
    return link;
}

/* Shim cố định FA trong shadow: Các quy tắc cấp tài liệu @font-face / .fa không thể đi vào shadow, ở đây bù đắp một lớp tối thiểu khả dụng trong shadow.
   - @font-face tái sử dụng tệp font fa-solid-900 hiện có của ST (địa chỉ tuyệt đối, không tải xuống, không sao chép)
   - Chỉ ghi ::before content cho 34 biểu tượng thực tế mà tiện ích sử dụng; khi thêm biểu tượng mới thì thêm một dòng trong FA_SOLID_CONTENT */
function buildFaShimStyle() {
    const style = document.createElement('style');
    const faWoff2 = new URL('webfonts/fa-solid-900.woff2', location.href).href;
    const faTtf = new URL('webfonts/fa-solid-900.ttf', location.href).href;
    const rules = [
        /* Mốc cơ bản dùng chung trong shadow: box-sizing/font-smoothing toàn cục * của ST không vào được shadow, ở đây bổ sung;
           text-shadow là thuộc tính kế thừa, * toàn cục của ST sẽ qua shadow host làm rò rỉ ánh sáng mờ của chủ đề vào, bắt buộc phải reset về none. */
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

/* Kiểu dáng "Chế độ tối giản" trong shadow: Dùng :host(.rlog-minimal) tắt một lượt toàn bộ transition và animation của panel/hộp thoại
   (hộp thoại đồng cấp với #rlog-panel, chỉ có :host mới bọc lót được cả hai), giữ lại phản hồi trạng thái tức thì; bỏ hiệu ứng làm mờ của lớp phủ cài đặt ưu tiên;
   miễn trừ rõ ràng cho hướng dẫn sử dụng (.rlog-tour-*). Các quy tắc :host loại này chỉ có thể inject trong JS lúc runtime, viết vào style.css sẽ bị loại bỏ. */
function buildMinimalShimStyle() {
    const style = document.createElement('style');
    const rules = [
        ':host(.rlog-minimal){transition:none!important;animation:none!important}',
        ':host(.rlog-minimal) *,:host(.rlog-minimal) *::before,:host(.rlog-minimal) *::after{transition:none!important;animation:none!important}',
        ':host(.rlog-minimal) .rlog-global-search-update-border-glow{display:none!important}',
        ':host(.rlog-minimal) .rlog-total-tokens .rlog-token-warning{animation:rlog-token-warning 1.6s linear infinite!important}',
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

    /* Tải cài đặt tiện ích mở rộng ST (lần đầu nâng cấp sẽ hoàn thành việc di chuyển cấu hình trình duyệt cũ và dọn dẹp tại đây) */
    loadPluginSettings();
    /* Lối vào menu cần đọc trước tùy chọn "Ẩn lối vào tiện ích mở rộng", tránh chớp nháy ngắn ngủi trong lần render đầu tiên */
    addMenuEntry();
    isLightTheme = loadTheme();
    MAX_RECORDS = loadMaxRecords();
    masterEnabled = pluginSettings ? pluginSettings.masterEnabled : true;

    panelEl = document.createElement('div');
    panelEl.id = 'rlog-panel';
    panelEl.style.display = 'none';

    applyTheme();

    panelEl.innerHTML = `
        <div class="rlog-panel-header">
            <h4>
                <span class="rlog-title-text">Nhật ký yêu cầu gần đây</span>
                <span class="rlog-title-count" title="Số bản ghi hiện tại / Giới hạn bản ghi thông thường">${getHeaderCountText()}</span>
                <span class="rlog-filter-indicator" id="rlog-filter-indicator" hidden>
                    <span id="rlog-filter-indicator-text"></span>
                    <button id="rlog-filter-reset-btn" title="Đặt lại bộ lọc" aria-label="Đặt lại bộ lọc"><i class="fa-solid fa-rotate-left"></i></button>
                </span>
            </h4>
            <div class="rlog-header-drag-space" style="flex: 1; height: 28px; margin: 0 10px;"></div>
            <div class="rlog-header-actions">
                <span class="rlog-ui-divider" aria-hidden="true"></span>
                <button id="rlog-filter-btn" class="rlog-header-btn" title="Lọc bản ghi"
                        aria-controls="rlog-filter-drawer" aria-expanded="false">
                    <i class="fa-solid fa-filter"></i>
                    <span class="rlog-filter-dot"></span>
                </button>
                <button id="rlog-global-search-btn" class="rlog-header-btn" title="Tìm kiếm tất cả bản ghi"
                        aria-controls="rlog-global-search-drawer" aria-expanded="false">
                    <i class="fa-solid fa-magnifying-glass"></i>
                </button>
                <button id="rlog-more-btn" class="rlog-header-btn" title="Tùy chọn khác"
                        aria-controls="rlog-more-drawer" aria-expanded="false">
                    <i class="fa-solid fa-ellipsis"></i>
                </button>
                <span class="rlog-ui-divider" aria-hidden="true"></span>
                <button id="rlog-minimize-btn" class="rlog-header-btn" title="Thu nhỏ"
                        aria-label="Thu nhỏ">
                    <i class="fa-solid fa-minus"></i>
                </button>
                <button id="rlog-fullscreen-btn" class="rlog-header-btn" title="Phóng to">
                    <i class="fa-solid fa-window-maximize"></i>
                </button>
                <button id="rlog-close-btn" class="rlog-close-btn" title="Đóng"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div class="rlog-more-drawer" id="rlog-more-drawer" aria-hidden="true" inert>
            <div class="rlog-drawer-surface">
                <div class="rlog-more-controls" role="group" aria-label="Tùy chọn khác">
                    <button id="rlog-master-toggle" class="rlog-header-btn rlog-master-on" title="Công tắc chính: Đã bật — Nhấp để tắt">
                        <i class="fa-solid fa-power-off"></i>
                    </button>
                    <button id="rlog-help-btn" class="rlog-header-btn" title="Xem hướng dẫn sử dụng">
                        <i class="fa-solid fa-question"></i>
                    </button>
                    <span class="rlog-ui-divider" aria-hidden="true"></span>
                    <button id="rlog-pref-btn" class="rlog-header-btn" title="Cài đặt ưu tiên">
                        <i class="fa-solid fa-heart"></i>
                    </button>
                    <button id="rlog-preview-btn" class="rlog-header-btn" title="Xem trước nội dung - Đã tắt">
                        <i class="fa-solid fa-eye-slash"></i>
                    </button>
                    <button id="rlog-theme-btn" class="rlog-header-btn" title="Chuyển đổi chế độ ngày/đêm">
                        <i class="fa-solid fa-sun"></i>
                    </button>
                    <span class="rlog-ui-divider" aria-hidden="true"></span>
                    <button id="rlog-collapse-all-btn" class="rlog-header-btn" title="Thu gọn tất cả mục">
                        <i class="fa-solid fa-minimize"></i>
                    </button>
                    <button id="rlog-clear-btn" class="rlog-header-btn" title="Xóa sạch tất cả bản ghi">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        </div>
        <div class="rlog-filter-drawer" id="rlog-filter-drawer" aria-hidden="true" inert>
            <div class="rlog-drawer-surface">
                <div class="rlog-filter-controls" role="group" aria-label="Lọc bản ghi">
                    <span class="rlog-filter-group">
                        <button class="rlog-filter-chip rlog-filter-chip-on" data-filter-group="source" data-filter-value="native" title="Yêu cầu Native"><i class="fa-solid fa-paper-plane"></i></button>
                        <button class="rlog-filter-chip rlog-filter-chip-on" data-filter-group="source" data-filter-value="plugin" title="Yêu cầu từ tiện ích mở rộng/Không phải Native"><i class="fa-solid fa-puzzle-piece"></i></button>
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
                    <button id="rlog-filter-drawer-reset-btn" class="rlog-search-text-btn"
                            type="button" title="Đặt lại bộ lọc" aria-label="Đặt lại bộ lọc">Đặt lại</button>
                </div>
            </div>
        </div>
        <div class="rlog-global-search-drawer" id="rlog-global-search-drawer" aria-hidden="true" inert>
            <div class="rlog-drawer-surface">
                <div class="rlog-global-search-controls" role="search" aria-label="Tìm kiếm tất cả bản ghi">
                    <div class="rlog-global-search-input-wrap">
                        <input id="rlog-global-search-input" class="rlog-global-search-input" type="text"
                               placeholder="Tìm kiếm tất cả bản ghi..." aria-label="Tìm kiếm tất cả bản ghi"
                               autocomplete="off" spellcheck="false">
                        <span class="rlog-global-search-count" role="group" aria-label="Thứ tự kết quả tìm kiếm toàn cục">0/0</span>
                    </div>
                    <button id="rlog-global-search-submit" type="button" class="rlog-search-text-btn"
                            title="Tìm kiếm">
                        <svg class="rlog-global-search-update-border" viewBox="0 0 30 20"
                             aria-hidden="true" focusable="false">
                            <defs>
                                <mask id="rlog-global-search-update-border-mask"
                                      maskUnits="userSpaceOnUse" x="0" y="0" width="30" height="20">
                                    <rect x="0.5" y="0.5" width="29" height="19" rx="3.5" ry="3.5"
                                          class="rlog-global-search-update-border-mask-shape"
                                          fill="none" stroke-width="1"></rect>
                                </mask>
                            </defs>
                            <rect class="rlog-global-search-update-border-base"
                                  x="0.5" y="0.5" width="29" height="19" rx="3.5" ry="3.5" pathLength="100"></rect>
                            <foreignObject class="rlog-global-search-update-border-paint"
                                          x="0" y="0" width="30" height="20"
                                          mask="url(#rlog-global-search-update-border-mask)">
                                <div xmlns="http://www.w3.org/1999/xhtml"
                                     class="rlog-global-search-update-border-glow"></div>
                            </foreignObject>
                        </svg>
                        <span class="rlog-global-search-submit-label">Tìm kiếm</span>
                    </button>
                    <button id="rlog-global-search-reset" type="button" class="rlog-search-text-btn"
                            title="Đặt lại">Đặt lại</button>
                    <button class="rlog-global-search-next" type="button" title="Tiếp theo" disabled>
                        <i class="fa-solid fa-arrow-down"></i>
                    </button>
                    <button class="rlog-global-search-prev" type="button" title="Trước đó" disabled>
                        <i class="fa-solid fa-arrow-up"></i>
                    </button>
                </div>
            </div>
            <div class="rlog-global-search-guard" aria-hidden="true"></div>
        </div>
        <div class="rlog-panel-body">
            <div id="rlog-list" class="rlog-list">
                <div class="rlog-empty">${escapeHtml(masterEnabled ? 'Chưa có nhật ký yêu cầu, vui lòng gửi tin nhắn rồi xem lại.' : 'Chức năng ghi nhật ký đã tắt, vui lòng nhấp vào biểu tượng nguồn để bật.')}</div>
            </div>
            <div class="rlog-resize-grip" title="Kéo để điều chỉnh kích thước cửa sổ"></div>
        </div>
        <div id="rlog-pin-toast" class="rlog-pin-toast" aria-live="polite"></div>
        <div id="rlog-response-meta-tip" class="rlog-response-meta-tip" popover="auto"></div>
        <div class="rlog-pref-overlay" id="rlog-pref-overlay">
            <div class="rlog-pref-panel">
                <div class="rlog-pref-header">
                    <div class="rlog-pref-header-text">
                        <span class="rlog-pref-title">Cài đặt ưu tiên</span>
                        <div class="rlog-pref-sub">Một số cài đặt lưu trữ cho tùy chọn cụ thể</div>
                    </div>
                    <button class="rlog-pref-close" title="Đóng"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="rlog-pref-divider"></div>
                <div class="rlog-pref-list-wrap">
                    <i class="rlog-pref-scroll rlog-pref-scroll-up fa-solid fa-chevron-up"></i>
                    <div class="rlog-pref-list">
                        <div class="rlog-pref-item">
                            <div class="rlog-pref-item-text">
                                <span class="rlog-pref-label">Giới hạn bản ghi</span>
                                <div class="rlog-pref-item-desc">Phạm vi 10～100, mặc định 10</div>
                            </div>
                            <input id="rlog-max-records-input" class="rlog-pref-number-input"
                                   type="text" inputmode="numeric" pattern="[0-9]*"
                                   autocomplete="off" spellcheck="false"
                                   value="${MAX_RECORDS}" aria-label="Giới hạn bản ghi">
                        </div>
                        <div class="rlog-pref-item">
                            <div class="rlog-pref-item-text">
                                <span class="rlog-pref-label">Thời gian chờ phản hồi timeout (giây)</span>
                                <div class="rlog-pref-item-desc">Chỉ ảnh hưởng việc ghi nhật ký của tiện ích, không làm gián đoạn request thực tế<br>Phạm vi 0～3600, mặc định 300, 0 = không giới hạn</div>
                            </div>
                            <input id="rlog-reply-timeout-input" class="rlog-pref-number-input"
                                   type="text" inputmode="numeric" pattern="[0-9]*"
                                   autocomplete="off" spellcheck="false"
                                   value="${replyTimeoutSec}" aria-label="Thời gian chờ phản hồi timeout (giây)">
                        </div>
                        <div class="rlog-pref-item">
                            <div class="rlog-pref-item-text">
                                <span class="rlog-pref-label">Ngưỡng nhắc nhở nhấp nháy</span>
                                <div class="rlog-pref-item-desc">Khi đạt số token chỉ định, đổi màu đỏ và nhấp nháy<br>Phạm vi 0～1M, 0 = tắt nhấp nháy</div>
                            </div>
                            <input id="rlog-token-warning-input" class="rlog-pref-number-input"
                                   type="text" inputmode="numeric" pattern="[0-9]*"
                                   autocomplete="off" spellcheck="false"
                                   value="${tokenWarningThreshold}" aria-label="Ngưỡng nhắc nhở nhấp nháy">
                        </div>
                        <div class="rlog-pref-item rlog-pref-item-divided">
                            <div class="rlog-pref-item-text">
                                <span class="rlog-pref-label">Nút nổi làm lối vào mặc định</span>
                                <div class="rlog-pref-item-desc">Sau khi bật, khởi động tiện ích sẽ hiển thị nút nổi theo mặc định<br>Nếu không, nút nổi chỉ xuất hiện khi thu nhỏ</div>
                            </div>
                            <button class="rlog-toggle" data-pref-key="badgeDefault" role="switch" aria-checked="false" aria-label="Nút nổi làm lối vào mặc định"></button>
                        </div>
                        <div class="rlog-pref-item">
                            <div class="rlog-pref-item-text">
                                <span class="rlog-pref-label">Hiển thị nút QR làm lối vào</span>
                            </div>
                            <button class="rlog-toggle" data-pref-key="quickReplyEntry" role="switch" aria-checked="false" aria-label="Hiển thị nút QR làm lối vào"></button>
                        </div>
                        <div class="rlog-pref-item">
                            <div class="rlog-pref-item-text">
                                <span class="rlog-pref-label">Ẩn lối vào tiện ích mở rộng (đũa phép)</span>
                            </div>
                            <button class="rlog-toggle" data-pref-key="hideExtensionEntry" role="switch" aria-checked="false" aria-label="Ẩn lối vào tiện ích mở rộng (đũa phép)"></button>
                        </div>
                        <div class="rlog-pref-item rlog-pref-item-divided">
                            <div class="rlog-pref-item-text">
                                <span class="rlog-pref-label">Chế độ ngày/đêm đi theo theme ST</span>
                                <div class="rlog-pref-item-desc">Sau khi bật, chế độ ngày/đêm tự động đi theo chuyển đổi theme sáng/tối<br>Ở chế độ này nút chuyển đổi thủ công không có hiệu lực</div>
                            </div>
                            <button class="rlog-toggle" data-pref-key="followStTheme" role="switch" aria-checked="false" aria-label="Chế độ ngày/đêm đi theo theme ST"></button>
                        </div>
                        <div class="rlog-pref-item">
                            <div class="rlog-pref-item-text">
                                <span class="rlog-pref-label">Mặc định toàn màn hình trên mobile</span>
                                <div class="rlog-pref-item-desc">Tối đa hóa vùng đọc, ghi đè cài đặt tiếp theo<br>Vì không còn vùng bên ngoài panel nữa</div>
                            </div>
                            <button class="rlog-toggle" data-pref-key="mobileFull" role="switch" aria-checked="false" aria-label="Mặc định toàn màn hình trên mobile"></button>
                        </div>
                        <div class="rlog-pref-item">
                            <div class="rlog-pref-item-text">
                                <span class="rlog-pref-label">Nhấp bên ngoài panel để đóng</span>
                                <div class="rlog-pref-item-desc">Không cần phải canh nút x nữa, nhấp đâu cũng đóng được</div>
                            </div>
                            <button class="rlog-toggle" data-pref-key="clickOutside" role="switch" aria-checked="false" aria-label="Nhấp bên ngoài panel để đóng"></button>
                        </div>
                        <div class="rlog-pref-item">
                            <div class="rlog-pref-item-text">
                                <span class="rlog-pref-label">Lưu giữ trạng thái bộ lọc</span>
                                <div class="rlog-pref-item-desc">Các mục lọc không còn tự động đặt lại<br>Sau khi bật nếu không tìm thấy nội dung hãy nhớ đặt lại bộ lọc trước</div>
                            </div>
                            <button class="rlog-toggle" data-pref-key="filterPersist" role="switch" aria-checked="false" aria-label="Lưu giữ trạng thái bộ lọc"></button>
                        </div>
                        <div class="rlog-pref-item">
                            <div class="rlog-pref-item-text">
                                <span class="rlog-pref-label">Chế độ tối giản</span>
                                <div class="rlog-pref-item-desc">Loại bỏ toàn bộ cuộn mượt mà, hover, gợi ý nhấp nháy<br>và các hiệu ứng thị giác khác, cực kỳ trực tiếp</div>
                            </div>
                            <button class="rlog-toggle" data-pref-key="minimal" role="switch" aria-checked="false" aria-label="Chế độ tối giản"></button>
                        </div>
                    </div>
                    <i class="rlog-pref-scroll rlog-pref-scroll-down fa-solid fa-chevron-down"></i>
                </div>
            </div>
        </div>
    `;

    /* Bảo trì băng thông chính văn trong thời gian mở panel: Khi cuộn sẽ bù lại theo nhu cầu chính văn đi vào viewport, dỡ tải chính văn rời khỏi viewport */
    initBodyBandMaintenance(panelEl.querySelector('#rlog-list'));

    /* Cô lập Shadow DOM: Host + Shadow root, panel cùng kiểu dáng của nó được đặt vào shadow, không bị CSS theme bên thứ ba ghi đè */
    shadowHostEl = document.createElement('div');
    shadowHostEl.id = 'rlog-shadow-host';
    panelShadowRoot = shadowHostEl.attachShadow({ mode: 'open' });
    panelShadowRoot.appendChild(buildSelfCssElement());
    panelShadowRoot.appendChild(buildFaShimStyle());
    panelShadowRoot.appendChild(buildMinimalShimStyle());
    panelShadowRoot.appendChild(panelEl);
    installMobileKeyboardSessionTracking();
    document.body.appendChild(shadowHostEl);

    /* Nút nổi: Host light DOM độc lập (#rlog-badge-host) + Shadow root riêng của nó.
       Host hiển thị trong DOM thông thường (kèm script_id/role/title/class/định vị cố định) phục vụ việc nhận diện của các tiện ích thu gọn bên thứ ba;
       Phần hiển thị trực quan nằm trong shadow root của host (.rlog-badge-visual), theme bên thứ ba không thể chạm tới. */
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
    /* Biểu tượng light DOM: Dành cho tiện ích thu gom bên thứ ba querySelector(i) đọc biểu tượng lối vào. Host có shadow root riêng,
       phần tử con light vốn dĩ không tham gia render; hidden chỉ là khai báo chủ đích — CSS FA của ST sẽ gán display cho .fa-solid. */
    badgeEl.innerHTML = '<i class="fa-solid fa-clock-rotate-left" hidden></i>';

    const badgeShadowRoot = badgeEl.attachShadow({ mode: 'open' });
    /* Nguồn kiểu dáng phần nhìn thấy của nút nổi: Cách làm tương tự shadow root của panel, sao chép cùng một tệp style.css vào shadow root */
    badgeShadowRoot.appendChild(buildSelfCssElement());
    badgeShadowRoot.appendChild(buildFaShimStyle());
    badgeVisualEl = document.createElement('div');
    badgeVisualEl.className = 'rlog-badge-visual';
    badgeVisualEl.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i>';
    badgeShadowRoot.appendChild(badgeVisualEl);
    document.body.appendChild(badgeEl);

    /* Đồng bộ kích thước hiện tại của nút nổi, sau đó bàn giao cho tương tác con trỏ (phối màu do các biến gán #rlog-badge-host trong style.css cung cấp) */
    updateBadgeSize();
    initBadgeInteraction();
    /* Áp dụng lại class chủ đề sau khi host đã sẵn sàng (dùng cho panel/hộp thoại; phối màu nút nổi ở trên đi theo theme ST riêng) */
    applyTheme();

    const moreBtn = panelEl.querySelector('#rlog-more-btn');
    const moreDrawer = panelEl.querySelector('#rlog-more-drawer');
    const filterBtn = panelEl.querySelector('#rlog-filter-btn');
    const filterDrawer = panelEl.querySelector('#rlog-filter-drawer');
    moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setMoreDrawerOpen(!moreDrawer.classList.contains('expanded'));
        /* Đóng mở ngăn kéo sẽ làm thay đổi chiều cao khả dụng của danh sách: Chỉ xếp hàng một lần việc bảo trì băng thông chính văn hiện có. */
        scheduleBodyBandPass(panelEl.querySelector('#rlog-list'));
    });

    moreDrawer.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        closeMoreDrawer();
        scheduleBodyBandPass(panelEl.querySelector('#rlog-list'));
    });

    filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setFilterDrawerOpen(!filterDrawer.classList.contains('expanded'));
        scheduleBodyBandPass(panelEl.querySelector('#rlog-list'));
    });

    filterDrawer.querySelectorAll('.rlog-filter-chip').forEach((chip) => {
        chip.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFilterChip(chip.dataset.filterGroup, chip.dataset.filterValue);
        });
    });

    const filterDrawerResetBtn = panelEl.querySelector('#rlog-filter-drawer-reset-btn');
    if (filterDrawerResetBtn) {
        filterDrawerResetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetFilters();
        });
    }

    /* Ở panel cực hẹp điều khiển có thể cuộn ngang: Trên mobile vuốt trực tiếp, chuột máy tính thông thường chuyển cuộn dọc thành cuộn ngang. */
    const filterControls = filterDrawer.querySelector('.rlog-filter-controls');
    if (filterControls) {
        filterControls.addEventListener('wheel', (e) => {
            const maxScroll = filterControls.scrollWidth - filterControls.clientWidth;
            if (maxScroll <= 0 || e.deltaY === 0) return;
            const before = filterControls.scrollLeft;
            filterControls.scrollLeft = Math.max(0, Math.min(
                maxScroll,
                before + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY),
            ));
            if (filterControls.scrollLeft !== before) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, { passive: false });
    }

    filterDrawer.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        closeFilterDrawer();
        scheduleBodyBandPass(panelEl.querySelector('#rlog-list'));
    });

    const filterResetBtn = panelEl.querySelector('#rlog-filter-reset-btn');
    if (filterResetBtn) {
        filterResetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetFilters();
        });
    }

    /* Lối vào tìm kiếm toàn cục chịu trách nhiệm đóng mở ngăn kéo, và loại trừ lẫn nhau với tìm kiếm bản ghi đơn lẻ */
    const globalSearchBtn = panelEl.querySelector('#rlog-global-search-btn');
    if (globalSearchBtn) {
        globalSearchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = !globalSearchOpen;
            if (willOpen) resetSearchIfActive();
            setGlobalSearchDrawerOpen(willOpen);
            /* Đóng mở ngăn kéo sẽ làm thay đổi chiều cao khả dụng của danh sách: Chỉ xếp hàng một lần việc bảo trì băng thông chính văn hiện có */
            scheduleBodyBandPass(panelEl.querySelector('#rlog-list'));
        });
    }
    installSearchCountEditDismissal(panelEl);
    const globalSearchCounter = panelEl.querySelector('.rlog-global-search-count');
    bindSearchCountJump(globalSearchCounter, {
        getCurrent: () => globalSearchState && globalSearchState.currentIdx >= 0
            ? globalSearchState.currentIdx + 1
            : 0,
        getTotal: () => globalSearchState ? globalSearchState.matches.length : 0,
        prepareCommit: () => reconcileGlobalSearchResults(false, false),
        onJump: (targetIdx) => {
            const match = globalSearchState ? globalSearchState.matches[targetIdx] : null;
            if (match) applyGlobalCurrentMatch(targetIdx);
        },
    });
    updateGlobalSearchControls();

    /* Tìm kiếm toàn cục: Nhập dữ liệu chỉ cập nhật trạng thái nút, tìm kiếm chỉ thực thi khi nhấp chuột hoặc Enter. */
    const globalSearchInput = panelEl.querySelector('#rlog-global-search-input');
    if (globalSearchInput) {
        /* Trong quá trình gõ bộ gõ tiếng Trung (composition) không xử lý Enter, tránh kích hoạt nhầm tìm kiếm khi đang chọn chữ. */
        let isComposing = false;
        globalSearchInput.addEventListener('compositionstart', () => { isComposing = true; });
        globalSearchInput.addEventListener('compositionend', () => { isComposing = false; });
        globalSearchInput.addEventListener('input', updateGlobalSearchSubmitState);
        globalSearchInput.addEventListener('keydown', (e) => {
            if (isComposing || e.isComposing || e.keyCode === 229) return;
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const needsSearch = !globalSearchState
                || globalSearchInput.value !== globalSearchState.keyword
                || globalSearchState.hasNewData;
            if (needsSearch) {
                performGlobalSearch();
            } else {
                navigateGlobalSearch(e.shiftKey ? -1 : 1);
            }
        });
    }
    const globalSearchDrawer = panelEl.querySelector('#rlog-global-search-drawer');
    if (globalSearchDrawer) {
        globalSearchDrawer.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            setGlobalSearchDrawerOpen(false);
            scheduleBodyBandPass(panelEl.querySelector('#rlog-list'));
        });
    }

    const globalSearchSubmit = panelEl.querySelector('#rlog-global-search-submit');
    if (globalSearchSubmit) {
        globalSearchSubmit.addEventListener('click', (e) => {
            e.stopPropagation();
            performGlobalSearch();
        });
    }
    const globalSearchReset = panelEl.querySelector('#rlog-global-search-reset');
    if (globalSearchReset) {
        globalSearchReset.addEventListener('click', (e) => {
            e.stopPropagation();
            resetGlobalSearch();
        });
    }
    const globalSearchNext = panelEl.querySelector('.rlog-global-search-next');
    if (globalSearchNext) {
        globalSearchNext.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateGlobalSearch(1);
        });
    }
    const globalSearchPrev = panelEl.querySelector('.rlog-global-search-prev');
    if (globalSearchPrev) {
        globalSearchPrev.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateGlobalSearch(-1);
        });
    }

    panelEl.querySelector('#rlog-close-btn').addEventListener('click', () => hidePanel());

    panelEl.querySelector('#rlog-minimize-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        /* Không thu gọn trong thời gian hướng dẫn: Nút nổi sẽ làm mục tiêu highlight hướng dẫn (phần tử trong panel) biến mất, phá vỡ luồng hướng dẫn */
        if (tourActive) return;
        minimizePanel();
    });

    panelEl.querySelector('#rlog-fullscreen-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFullscreen();
    });

    panelEl.querySelector('#rlog-collapse-all-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        collapseAllEntries();
    });

    panelEl.querySelector('#rlog-clear-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const normalCount = getNormalRecords().length;
        const pinnedCount = records.length - normalCount;
        if (normalCount === 0) {
            /* Không có bản ghi thông thường: Chỉ đưa ra thông báo nhẹ, không bật hộp thoại xác nhận, không xóa bất kỳ bản ghi nào */
            showPinToast(pinnedCount > 0
                ? 'Không có bản ghi thông thường để xóa sạch, các bản ghi được ghim sẽ không bị xóa'
                : 'Không có bản ghi để xóa sạch');
            return;
        }
        /* Khi bộ lọc đang có hiệu lực, chú thích rõ trong nội dung xác nhận rằng các bản ghi thông thường bị ẩn cũng sẽ bị xóa sạch */
        const visibleNormalCount = getVisibleRecords().filter(r => !r.pinned).length;
        const hiddenNormalCount = normalCount - visibleNormalCount;
        const pinnedNote = pinnedCount > 0
            ? `<br>(Sẽ giữ lại <strong>${pinnedCount}</strong> bản ghi được ghim)`
            : '<br>(Không có bản ghi được ghim)';
        showConfirmDialog({
            title: 'Xóa sạch tất cả bản ghi',
            message: hiddenNormalCount > 0
                ? `Xác nhận xóa sạch toàn bộ <strong>${normalCount}</strong> bản ghi request thông thường chứ? (Trong đó có <strong>${hiddenNormalCount}</strong> bản ghi bị bộ lọc ẩn đi, cũng sẽ bị xóa sạch cùng lúc)${pinnedNote}<br>Thao tác này không thể hoàn tác.`
                : `Xác nhận xóa sạch toàn bộ <strong>${normalCount}</strong> bản ghi request thông thường chứ?${pinnedNote}<br>Thao tác này không thể hoàn tác.`,
            confirmText: 'Xóa sạch',
            cancelText: 'Hủy',
            onConfirm: () => {
                clearAllRecords();
            },
        });
    });

    panelEl.querySelector('#rlog-help-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.__RLogTour && typeof window.__RLogTour.start === 'function') {
            /* Đảm bảo panel đã mở rộng và cả ba ngăn kéo dùng chung vị trí đều thu lại */
            setGlobalSearchDrawerOpen(false);
            closeMoreDrawer();
            closeFilterDrawer();
            window.__RLogTour.start();
        }
    });

    buildSimulatePromptButton(panelEl);

    /* Cài đặt ưu tiên: Nút lối vào + Lớp phủ */
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
        /* Dấu × ở góc trên bên phải là cách đóng duy nhất của lớp phủ */
        const prefCloseEl = prefOverlayEl.querySelector('.rlog-pref-close');
        if (prefCloseEl) {
            prefCloseEl.addEventListener('click', (e) => {
                e.stopPropagation();
                closePrefPanel();
                e.currentTarget.blur();
            });
        }

        /* Mỗi Toggle: Nhấp chuột đảo trạng thái + Lưu trữ lâu dài + Cập nhật trạng thái icon lối vào */
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

        bindPrefIntegerInput(prefOverlayEl.querySelector('#rlog-max-records-input'), {
            min: MIN_MAX_RECORDS,
            max: MAX_MAX_RECORDS,
            getCurrent: () => MAX_RECORDS,
            unit: ' bản ghi',
            invalidText: 'Giới hạn bản ghi chỉ có thể là số nguyên từ 10～100',
        });
        bindPrefIntegerInput(prefOverlayEl.querySelector('#rlog-reply-timeout-input'), {
            min: MIN_REPLY_TIMEOUT_SEC,
            max: MAX_REPLY_TIMEOUT_SEC,
            getCurrent: () => replyTimeoutSec,
            unit: ' giây',
            invalidText: 'Chỉ có thể nhập số nguyên từ 0～3600 giây',
        });
        bindPrefIntegerInput(prefOverlayEl.querySelector('#rlog-token-warning-input'), {
            min: MIN_TOKEN_WARNING_THRESHOLD,
            max: MAX_TOKEN_WARNING_THRESHOLD,
            getCurrent: () => tokenWarningThreshold,
            unit: ' tokens',
            invalidText: 'Ngưỡng nhắc nhở nhấp nháy chỉ có thể là số nguyên từ 0～1000000',
        });

        const prefListEl = prefOverlayEl.querySelector('.rlog-pref-list');
        if (prefListEl) {
            prefListEl.addEventListener('scroll', () => updatePrefScrollArrows(), { passive: true });
        }

        /* Nhấp vào backdrop không làm gì cả: Nó chỉ chịu trách nhiệm che panel, chặn tương tác tầng dưới, lớp phủ chỉ có thể đóng qua dấu × góc trên phải */
    }

    /* Nạp cài đặt ưu tiên lâu dài và đồng bộ icon lối vào + Giao diện thị giác công tắc */
    loadPreferences();
    syncMenuEntryVisibility();
    updatePrefButtonIcon();
    syncPrefToggleUI();
    syncMaxRecordsInputUI();
    syncReplyTimeoutInputUI();
    syncTokenWarningThresholdInputUI();
    /* Lối vào QR: Khi bật tùy chọn sẽ kết nối vào tập hợp QR native chuyên dụng của tiện ích, render và thu gọn giao cho ST */
    syncQuickReplyEntry();
    /* Lệnh slash thường trực bọc lót: Không phụ thuộc vào việc lối vào QR hoặc menu có bật hay không */
    ensureToggleCommand().catch((error) => {
        console.warn(`[${PLUGIN_KEY}] Đăng ký lệnh rlog-toggle thất bại`, error);
    });
    /* Chiều cao bố cục mobile và trạng thái toàn màn hình cùng được xác định khi khởi tạo UI; bàn phím sau đó chỉ ảnh hưởng việc che khuất, không tính toán lại bố cục */
    syncMobilePanelLayoutMetrics(true);
    /* Trạng thái toàn màn hình mặc định chỉ đóng băng một lần tại đây theo tùy chọn + viewport hiện tại; sau đó chỉ bị ghi đè bởi trạng thái thủ công của người dùng */
    initFullscreenState();
    syncFullscreenUI();
    /* Khi trang nạp lại trình duyệt có thể đưa ra chiều cao ban đầu tạm thời: Toàn màn hình mặc định đợi thêm một frame để lấy chiều cao thực tế hiện tại. */
    if (isFullscreenActive()) {
        requestAnimationFrame(() => {
            refreshMobilePanelLayoutForLayoutAction();
            syncFullscreenUI();
        });
    }
    /* Chế độ tối giản: Thêm/xóa class cho shadow host theo tùy chọn (kích hoạt quy tắc :host tối giản) */
    updateMinimalClass();
    /* Lưu giữ trạng thái bộ lọc: Khi bật sẽ đọc bộ lọc đã lưu lần trước ghi đè giá trị mặc định (phải có hiệu lực trước updateFilterChipUI) */
    loadPersistedFilterState();
    /* "Nút nổi làm lối vào mặc định": Khi bật khởi động sẽ hiển thị nút nổi thường trực; badgePos vẫn không lưu lâu dài */
    if (preferences.badgeDefault) showBadgeAtStoredPosition();

    panelEl.querySelector('#rlog-theme-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        /* Khi "Chế độ ngày/đêm đi theo theme ST" bật, chuyển đổi thủ công không có hiệu lực: Tương tác nút không đổi, chỉ bật toast nêu lý do */
        if (preferences.followStTheme) {
            showPinToast('Vui lòng tắt tự động đi theo theme trước');
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

    panelHeaderDragBinding = makeDraggable(panelEl);
    panelResizeBinding = makeResizable(panelEl);

    /* UI ban đầu khi ẩn không gắn listener viewport; khi hiển thị panel hoặc nút nổi sẽ do lối vào điều phối chung khôi phục theo nhu cầu. */
    syncViewportListenerLifecycle();

    /* Cài đặt listener nhận diện nguồn (chỉ ghi nhận lối vào native của người dùng, không chịu ảnh hưởng của công tắc chính) */
    installSourceTracking();

    /* Cài đặt theo dõi lượt tạo chính (điểm neo nhận diện chuẩn của RQ-32) */
    installGenerationPassTracking();
    /* Cài đặt theo dõi sửa đổi nguồn (RQ-32: Thăng cấp có hạn "tiện ích → native" sau khi phản hồi hoàn tất) */
    installSourceCorrectionTracking();

    /* Cài đặt đánh chặn request (fetch + XHR; bên trong dựa theo masterEnabled để quyết định có ghi nhật ký hay không) */
    installRequestHooks();
    /* Cài đặt đánh chặn request iframe cùng nguồn */
    installIframeRequestHooks();

    /* Đồng bộ trạng thái trực quan của các nút chip phân đoạn bộ lọc (khi hướng dẫn/API thay đổi trạng thái sẽ lấy trạng thái thực tế làm chuẩn) */
    updateFilterChipUI();

    /* Thông báo ghim/bỏ ghim: Nhấp vào có thể loại bỏ sớm (chặn nổi bọt sự kiện tránh kích hoạt "nhấp bên ngoài panel để đóng" cấp tài liệu) */
    const pinToast = panelEl.querySelector('#rlog-pin-toast');
    if (pinToast) {
        pinToast.addEventListener('click', (e) => {
            e.stopPropagation();
            hidePinToast();
        });
    }

    /* Giải thích chỉ số Response: Sau khi Popover bị đóng nhẹ (nhấp chỗ khác / Esc) sẽ reset điểm neo;
       Lắng nghe toàn bộ thao tác cuộn trong panel ở capture phase (danh sách, cuộn nhúng chính văn, v.v.), tránh lớp nổi dừng ở vị trí cũ */
    responseMetaTipEl = panelEl.querySelector('#rlog-response-meta-tip');
    if (responseMetaTipEl) {
        responseMetaTipEl.addEventListener('toggle', (event) => {
            if (event.newState === 'closed') clearResponseMetaTipAnchor();
        });
    }
    panelEl.addEventListener('scroll', hideResponseMetaTip, { capture: true, passive: true });

    renderPanelContent();
}

function updateThemeButtonIcon() {
    const btn = panelEl ? panelEl.querySelector('#rlog-theme-btn') : null;
    if (!btn) return;
    btn.innerHTML = isLightTheme
        ? '<i class="fa-solid fa-moon"></i>'
        : '<i class="fa-solid fa-sun"></i>';
}

/* Animation chuyển đổi chủ đề ngày/đêm (nhịp thở co giãn + đổi màu chủ đề tức thì): Nút ngày/đêm và tự động chuyển đổi của "Đi theo theme ST" tái sử dụng cùng một kịch bản dàn dựng.
   Tiền đề: Trước khi gọi isLightTheme đã được cập nhật, class chủ đề đã được áp dụng.
   Màu chủ đề đổi tức thì thay vì fade từng phần tử một: Các phần tử và pseudo-element cấp tin nhắn trong panel đều có chuyển tiếp màu 0.35s riêng,
   fade từng cái một sẽ tạo ra lượng lớn transition ngay trong frame chuyển đổi, gây sụt giảm khung hình liên tục; phản hồi thị giác của việc chuyển đổi do animation nhịp thở co giãn đảm nhiệm. */
function playThemeSwitchAnimation() {
    if (!panelEl) return;
    panelEl.classList.remove('rlog-anim-light', 'rlog-anim-dark');

    /* Chế độ tối giản: Chủ đề đã được chuyển đổi tức thời qua applyTheme(), bỏ qua dàn dựng animation (đồng thời tránh sót class animation) */
    if (preferences.minimal) return;

    /* Vô hiệu hóa trước toàn bộ hiệu ứng chuyển tiếp màu trong panel: Trải qua hai frame để màu chủ đề được commit thành màu cuối cùng trong hai frame này,
       sau đó mới gỡ bỏ class vô hiệu hóa, chạy animation nhịp thở co giãn */
    panelEl.classList.add('rlog-theme-transitioning');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            panelEl.classList.remove('rlog-theme-transitioning');
            /* Trong hai frame này panel có thể đã bị ẩn (đóng / thu nhỏ thành nút nổi): Trong thời gian ẩn không thêm class animation,
               nếu không khi hiển thị lại sẽ phát bù lại từ đầu */
            if (!isPanelExpanded) return;
            if (isLightTheme) {
                panelEl.classList.add('rlog-anim-light');
            } else {
                panelEl.classList.add('rlog-anim-dark');
            }
            /* Xóa class animation sau khi animation kết thúc, ngăn phát lại khi đóng rồi mở lại cửa sổ */
            const onAnimEnd = () => {
                panelEl.classList.remove('rlog-anim-light', 'rlog-anim-dark');
                panelEl.removeEventListener('animationend', onAnimEnd);
            };
            panelEl.addEventListener('animationend', onAnimEnd);
        });
    });
}

/* Lắng nghe cú nhấp chuột bên ngoài thực tế của người dùng trong thời gian panel mở rộng; sau khi ẩn không giữ lại listener toàn cục. */
function handlePanelOutsideClick(e) {
    /* Cú click theo chương trình (như duy trì tiêu điểm, kích hoạt nội bộ của bên thứ ba) không phải là cú nhấp chuột mới của người dùng, không tham gia vào việc nhấp bên ngoài để đóng */
    if (!e.isTrusted) return;
    if (!preferences.clickOutside || !isPanelExpanded) return;
    const insidePanel = e.target === shadowHostEl || e.composedPath().includes(panelEl);
    if (insidePanel) return;
    hidePanel();
}

function stopPanelOutsideCloseListener() {
    if (panelOutsideCloseArmTimer !== null) {
        clearTimeout(panelOutsideCloseArmTimer);
        panelOutsideCloseArmTimer = null;
    }
    document.removeEventListener('click', handlePanelOutsideClick);
}

/* Cú click của lối vào mở nổi bọt hoàn toàn trước, sau đó mới đăng ký listener nhấp bên ngoài ở lượt tác vụ kế tiếp */
function schedulePanelOutsideCloseListener() {
    stopPanelOutsideCloseListener();
    if (!preferences.clickOutside || !isPanelExpanded || !panelEl) return;
    panelOutsideCloseArmTimer = setTimeout(() => {
        panelOutsideCloseArmTimer = null;
        if (!preferences.clickOutside || !isPanelExpanded || !panelEl) return;
        document.addEventListener('click', handlePanelOutsideClick);
    }, 0);
}

function togglePanel() {
    isPanelExpanded ? hidePanel() : showPanel();
}

/* Trước khi ẩn panel (đóng thông thường / thu nhỏ) dọn sạch các class animation đang phát, hủy bỏ nhấp nháy chờ kích hoạt.
   Trong thời gian phần tử bị ẩn animation không tiến triển, cũng không phát animationend, giữ lại class sẽ phát bù từ đầu khi hiển thị lại;
   Hai phương thức ẩn dùng chung ở đây, đảm bảo hành vi dọn dẹp đồng nhất.
   rlog-theme-transitioning vốn được gỡ bỏ bằng rAF kép, nếu đúng lúc bị ẩn trong hai frame này thì cũng dọn dẹp luôn. */
function clearPanelAnimations() {
    if (!panelEl) return;
    clearHeaderFlash(panelEl);   /* Xóa class nhấp nháy + Hủy nhấp nháy xuống đáy chờ kích hoạt trong panel */
    cancelPendingFlash();        /* Bọc lót: Khi mục tiêu chờ kích hoạt đã được dựng lại/chuyển ra khỏi panel thì cũng xóa timer */
    panelEl.classList.remove('rlog-anim-light', 'rlog-anim-dark', 'rlog-theme-transitioning');
}

function showPanel({ resetPosition = null } = {}) {
    if (!panelEl) buildUI();
    /* Nút nổi chỉ đóng vai trò là lối vào mở; khi mở rộng sẽ thống nhất ẩn nút nổi */
    setBadgeActive(false);
    /* Biến thiên chủ đề bị bỏ lỡ trong thời gian đóng cần được commit trước khi hiển thị; nếu không khi chuyển từ chủ đề cũ sang mới sẽ khởi động một đợt chuyển tiếp màu sắc.
       Tại đây chỉ đồng bộ class, không phát animation chuyển đổi chủ đề; observer được khôi phục sau khi panel mở rộng. */
    if (preferences.followStTheme) syncPanelThemeToSt(false);
    if (resetPosition ?? preferences.badgeDefault) resetPanelToDefault();
    panelEl.style.display = 'flex';
    isPanelExpanded = true;
    /* Panel đã được bù đắp theo chủ đề hiện tại; khôi phục quan sát biến thiên chủ đề trong thời gian hiển thị. */
    activatePanelThemeFollow(false);
    activatePanelPointerListeners();
    /* Mở panel áp dụng chiều cao viewport hiện tại, sau đó đồng bộ trạng thái toàn màn hình hiện có; giá trị mặc định vẫn chỉ tính toán lúc khởi tạo */
    resetMobileKeyboardSession();
    refreshMobilePanelLayoutForLayoutAction();
    syncFullscreenUI();
    if (toggleBtn) toggleBtn.classList.add('active');
    /* Chỉ khi dữ liệu/cài đặt render thay đổi mới dựng lại DOM; nếu không giữ nguyên DOM cũ, tránh giật lag khi mở panel có lượng lớn tin nhắn đang mở rộng */
    if (panelContentDirty) {
        renderPanelContent();
    }
    /* Đo lại chiều cao thanh tiêu đề bản ghi sau khi panel hiển thị: Dưới trạng thái ẩn offsetHeight bằng 0, khoảng lệch sticky cần dựa theo chiều cao hiển thị thực tế */
    syncRecordHeaderVars(panelEl.querySelector('#rlog-list'));
    /* Trong thời gian đóng panel có bản ghi mới đến, sau khi mở lại sẽ quay về mục mới nhất trên đỉnh danh sách */
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

    /* Hiển thị lại panel sẽ không kích hoạt sự kiện scroll, chủ động chạy một lần bảo trì băng thông:
       Dựa theo viewport hiện tại (bao gồm việc về đỉnh vừa thực hiện ở trên) bù lại các chính văn cần thiết, dỡ tải các phần ở xa */
    runBodyBandPass(panelEl.querySelector('#rlog-list'));
    schedulePanelOutsideCloseListener();

    /* Kiểm tra xem có cần tiến hành hướng dẫn sau khi panel hiển thị hay không */
    if (window.__RLogTour && typeof window.__RLogTour.check === 'function') {
        setTimeout(() => window.__RLogTour.check(), 300);
    }
    syncViewportListenerLifecycle();
}

function hidePanel({ forceBadge = false } = {}) {
    deactivatePanelThemeFollow();
    deactivatePanelPointerListeners();
    stopPanelOutsideCloseListener();
    resetMobileKeyboardSession();
    /* Thoát chế độ tìm kiếm khi đóng panel */
    resetSearchIfActive();
    /* Tất cả các lối vào đóng panel (nút đóng, chuyển đổi menu / QR, nhấp bên ngoài panel, v.v.) thống nhất thoát khỏi tìm kiếm toàn cục */
    setGlobalSearchDrawerOpen(false);
    /* Ngăn kéo bộ lọc thu gọn cùng với panel; các điều kiện lọc đã chọn giữ nguyên */
    closeFilterDrawer();
    /* Ngăn kéo "Thêm" dùng chung một hàng với hai ngăn kéo còn lại, không lưu lại khi đóng panel. */
    closeMoreDrawer();
    /* Ẩn toast ghim/bỏ ghim khi đóng panel */
    hidePinToast();
    /* Thu lại giải thích chỉ số Response khi đóng panel, tránh lớp nổi cấp cao nhất bị tồn dư */
    hideResponseMetaTip();
    /* Dọn dẹp ngầm lớp phủ "Xem toàn văn" khi đóng panel (nếu tồn tại) */
    closeReadFullOverlay({ restoreFocus: false });
    /* Đồng thời thu lại lớp phủ "Cài đặt ưu tiên" khi đóng panel, tránh việc đóng panel khi lớp phủ đang mở, lúc mở lại vẫn còn tồn dư trạng thái mở */
    closePrefPanel();
    /* Nhân lúc layout vẫn còn hiệu lực trước khi đóng, dỡ tải một lần toàn bộ chính văn ngoài viewport (đo thực tế khoảng 3ms):
       Khi mở lại chỉ cần chịu chi phí dàn trang và vẽ cho phần hiển thị, không còn phải gánh toàn bộ các chính văn đã mở rộng.
       Bắt buộc phải xếp sau resetSearchIfActive() — highlight tìm kiếm hoàn nguyên về văn bản thuần túy trước, ở đây mới không dỡ tải chính văn có chứa thẻ <mark> */
    runBodyBandPass(panelEl ? panelEl.querySelector('#rlog-list') : null);
    if (panelEl) {
        /* Dọn dẹp các class animation đang chạy (nhấp nháy / chuyển đổi chủ đề), tránh phát lại khi mở lần sau */
        clearPanelAnimations();
        panelEl.style.display = 'none';
    }
    isPanelExpanded = false;
    if (toggleBtn) toggleBtn.classList.remove('active');
    /* Thu nhỏ bắt buộc hiển thị nút nổi tạm thời; đóng bình thường dựa theo tùy chọn lối vào mặc định để quyết định có thường trực hay không */
    if (forceBadge || preferences.badgeDefault) showBadgeAtStoredPosition();
    else setBadgeActive(false);
    syncViewportListenerLifecycle();
}

function minimizePanel() {
    hidePanel({ forceBadge: true });
}


/* ── Kéo thả và co giãn ────────────────────────── */

/* Kéo thả thanh tiêu đề và co giãn chỉ lắng nghe di chuyển/thả tay toàn trang khi panel mở rộng. */
function activatePanelPointerListeners() {
    if (panelPointerListenersBound) return;
    if (!panelHeaderDragBinding || !panelResizeBinding) return;
    panelPointerListenersBound = true;
    panelHeaderDragBinding.bind();
    panelResizeBinding.bind();
}

/* Tháo bỏ listener toàn trang khi ẩn panel, đồng thời dọn dẹp trạng thái kéo thả/co giãn có thể chưa kết thúc. */
function deactivatePanelPointerListeners() {
    panelPointerListenersBound = false;
    if (panelHeaderDragBinding) panelHeaderDragBinding.unbind();
    if (panelResizeBinding) panelResizeBinding.unbind();
}

function makeResizable(el) {
    const grip = el.querySelector('.rlog-resize-grip');
    if (!grip) return null;

    grip.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (isFullscreenActive()) return;
        panelResizing = true;
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        resizeStartW = el.offsetWidth;
        resizeStartH = el.offsetHeight;
        /* Neo mép trái/trên: Mặc định panel căn giữa ngang (left:50% + translateX(-50%)), chỉ sửa width sẽ dịch chuyển
           đối xứng hai bên trái phải; chuyển sang định vị left/top thì co giãn chỉ ảnh hưởng mép phải/dưới */
        const rect = el.getBoundingClientRect();
        el.style.transform = 'none';
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top}px`;
        el.style.transition = 'none';
    });

    grip.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (isFullscreenActive()) return;
        panelResizing = true;
        resizeStartX = e.touches[0].clientX;
        resizeStartY = e.touches[0].clientY;
        resizeStartW = el.offsetWidth;
        resizeStartH = el.offsetHeight;
        /* Giống mousedown: Neo mép trái/trên, co giãn chỉ ảnh hưởng mép phải/dưới */
        const rect = el.getBoundingClientRect();
        el.style.transform = 'none';
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top}px`;
        el.style.transition = 'none';
    });

    function applyResize(clientX, clientY) {
        const dx = clientX - resizeStartX;
        const dy = clientY - resizeStartY;
        const newW = Math.max(350, resizeStartW + dx);
        const newH = Math.max(200, resizeStartH + dy);
        panelEl.style.width = `${newW}px`;
        panelEl.style.height = `${newH}px`;
        panelEl.style.maxHeight = 'none';
    }

    function handleResizeMouseMove(e) {
        if (!panelResizing || !panelEl) return;
        applyResize(e.clientX, e.clientY);
    }

    function handleResizeTouchMove(e) {
        if (!panelResizing || !panelEl) return;
        e.preventDefault();
        applyResize(e.touches[0].clientX, e.touches[0].clientY);
    }

    function finishResize() {
        if (!panelResizing) return;
        panelResizing = false;
        if (panelEl) panelEl.style.transition = '';
        /* Biến thiên chiều rộng panel có thể thay đổi chiều cao xuống dòng của thanh tiêu đề bản ghi, đo lại khoảng lệch sticky */
        syncRecordHeaderVars(panelEl && panelEl.querySelector('#rlog-list'));
        /* Biến thiên chiều rộng panel cũng làm thay đổi độ rộng xuống dòng của chính văn → Để việc bảo trì băng thông dựng lại chiều cao giữ chỗ theo hình học mới */
        scheduleBodyBandPass(panelEl && panelEl.querySelector('#rlog-list'));
    }

    return {
        bind() {
            document.addEventListener('mousemove', handleResizeMouseMove);
            document.addEventListener('mouseup', finishResize);
            document.addEventListener('touchmove', handleResizeTouchMove, { passive: false });
            document.addEventListener('touchend', finishResize);
            document.addEventListener('touchcancel', finishResize);
        },
        unbind() {
            document.removeEventListener('mousemove', handleResizeMouseMove);
            document.removeEventListener('mouseup', finishResize);
            document.removeEventListener('touchmove', handleResizeTouchMove, { passive: false });
            document.removeEventListener('touchend', finishResize);
            document.removeEventListener('touchcancel', finishResize);
            if (panelResizing) {
                panelResizing = false;
                if (panelEl) panelEl.style.transition = '';
            }
        },
    };
}

/* Tương tác kéo thả/nhấp của nút nổi (Pointer Events thống nhất chuột và màn cảm ứng): Độ dịch chuyển > BADGE_DRAG_THRESHOLD được tính là kéo thả,
   khi pointerup không khôi phục panel; chưa đạt ngưỡng tính là nhấp, khôi phục panel */
function initBadgeInteraction() {
    if (!badgeEl) return;
    let dragActive = false;
    let dragged = false;
    let startX = 0, startY = 0, origLeft = 0, origTop = 0;
    let badgeClickGuardTimer = null;

    function handleBadgeDragClickGuard(e) {
        e.stopPropagation();
        e.preventDefault();
        disarmBadgeDragClickGuard();
    }

    /* Trạng thái click sau khi kéo và listener đánh chặn chỉ tồn tại trong thời gian ngắn; khi không có click thì lượt tác vụ tiếp theo lập tức hủy bỏ. */
    function disarmBadgeDragClickGuard() {
        if (badgeClickGuardTimer !== null) {
            clearTimeout(badgeClickGuardTimer);
            badgeClickGuardTimer = null;
        }
        document.removeEventListener('click', handleBadgeDragClickGuard, true);
        badgeSuppressNextClick = false;
    }

    /* Nút nổi có thể phát ngay click gốc sau pointerup; lúc này mới đăng ký guard đánh chặn document dùng một lần. */
    function armBadgeDragClickGuard() {
        disarmBadgeDragClickGuard();
        badgeSuppressNextClick = true;
        document.addEventListener('click', handleBadgeDragClickGuard, true);
        badgeClickGuardTimer = setTimeout(() => {
            badgeClickGuardTimer = null;
            disarmBadgeDragClickGuard();
        }, 0);
    }

    badgeEl.addEventListener('pointerdown', (e) => {
        disarmBadgeDragClickGuard();
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
            /* Cập nhật vị trí ghi nhận trong phiên sau khi kéo, dùng để tái sử dụng cho lần thu gọn sau */
            badgePos = pos;
        }
    });

    const onBadgeUp = (e) => {
        if (!dragActive) return;
        dragActive = false;
        e.stopPropagation();
        try { badgeEl.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        const wasDrag = dragged;
        if (e.type === 'pointercancel') {
            /* Con trỏ bị hủy (như chạm cảm ứng bị hệ thống làm gián đoạn): Không phát sinh click, kết thúc trực tiếp */
            disarmBadgeDragClickGuard();
            dragged = false;
            return;
        }
        if (wasDrag) {
            /* Kéo thả: Trình duyệt vẫn sẽ phát bổ sung click native sau pointerup, tạm thời chặn lại để tránh bị hiểu nhầm là "nhấp mở panel" */
            armBadgeDragClickGuard();
        }
        /* Chưa kéo: Việc mở panel giao cho giai đoạn click sau đó xử lý — để nút nổi duy trì hiển thị trong toàn bộ thời gian phát click,
           việc mở panel được trì hoãn đến sau click, cả hai sẽ không nhận nhầm cùng một click của nhau */
        dragged = false;
    };
    badgeEl.addEventListener('pointerup', onBadgeUp);
    badgeEl.addEventListener('pointercancel', onBadgeUp);
    /* Click nút nổi (bao gồm click native do bên thứ ba kích hoạt trực tiếp lên host): Trì hoãn việc "mở panel" đến sau khi click lần này
       được phát hoàn toàn, giữ cho nút nổi hiển thị trong giai đoạn đó; không chủ động stopPropagation */
    badgeEl.addEventListener('click', (e) => {
        /* Bọc lót: Nếu click sau khi kéo không bị chặn bởi tầng trên (rất hiếm), ở đây chặn thêm lần nữa */
        if (badgeSuppressNextClick) return;
        setTimeout(() => showPanel({ resetPosition: true }), 0);
    });
}

function makeDraggable(el) {
    const header = el.querySelector('.rlog-panel-header');
    if (!header) return null;

    let startX, startY, origX, origY;
    let dragPending = false;
    let dragging = false;

    /* Các control tương tác và phần tử con của chúng không tham gia kéo thả thanh tiêu đề */
    function isDragBlocked(target) {
        return target instanceof Element
            && !!target.closest(PANEL_HEADER_DRAG_BLOCK_SELECTOR);
    }

    function prepareDrag(clientX, clientY) {
        const rect = el.getBoundingClientRect();
        startX = clientX;
        startY = clientY;
        origX = rect.left;
        origY = rect.top;
        dragPending = true;
    }

    function moveDrag(clientX, clientY) {
        if (!dragPending) return false;
        const dx = clientX - startX;
        const dy = clientY - startY;
        if (!dragging) {
            if (Math.hypot(dx, dy) < PANEL_HEADER_DRAG_THRESHOLD) return false;
            dragging = true;
            header.classList.add('rlog-header-dragging');
            el.style.transform = 'none';
            el.style.left = `${origX}px`;
            el.style.top = `${origY}px`;
            el.style.transition = 'none';
        }
        el.style.left = `${origX + dx}px`;
        el.style.top = `${origY + dy}px`;
        el.style.bottom = 'auto';
        el.style.right = 'auto';
        return true;
    }

    function finishDrag() {
        if (!dragPending && !dragging) return;
        const didDrag = dragging;
        dragPending = false;
        dragging = false;
        header.classList.remove('rlog-header-dragging');
        if (didDrag) {
            el.style.transition = '';
            /* Kéo thả không làm thay đổi độ rộng, nhưng giữ lại việc đo lại để bao quát trường hợp xuống dòng ngẫu nhiên */
            syncRecordHeaderVars(panelEl && panelEl.querySelector('#rlog-list'));
        }
    }

    header.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || isDragBlocked(e.target)) return;
        if (isFullscreenActive()) return;
        prepareDrag(e.clientX, e.clientY);
        e.preventDefault();
    });

    header.addEventListener('touchstart', (e) => {
        if (isDragBlocked(e.target)) return;
        if (isFullscreenActive()) return;
        prepareDrag(e.touches[0].clientX, e.touches[0].clientY);
    });

    function handleDragMouseMove(e) {
        moveDrag(e.clientX, e.clientY);
    }

    function handleDragTouchMove(e) {
        if (moveDrag(e.touches[0].clientX, e.touches[0].clientY)) e.preventDefault();
    }

    return {
        bind() {
            document.addEventListener('mousemove', handleDragMouseMove);
            document.addEventListener('touchmove', handleDragTouchMove, { passive: false });
            document.addEventListener('mouseup', finishDrag);
            document.addEventListener('touchend', finishDrag);
            document.addEventListener('touchcancel', finishDrag);
        },
        unbind() {
            document.removeEventListener('mousemove', handleDragMouseMove);
            document.removeEventListener('touchmove', handleDragTouchMove, { passive: false });
            document.removeEventListener('mouseup', finishDrag);
            document.removeEventListener('touchend', finishDrag);
            document.removeEventListener('touchcancel', finishDrag);
            finishDrag();
        },
    };
}

/* ── Khởi tạo ──────────────────────────── */

function init() {
    if (!window.SillyTavern || typeof window.SillyTavern.getContext !== 'function') {
        console.debug(`[${PLUGIN_KEY}] Đang chờ SillyTavern khởi tạo...`);
        setTimeout(init, INIT_RETRY_ST_MS);
        return;
    }

    const ctx = window.SillyTavern.getContext();
    if (!ctx || !ctx.eventSource || !ctx.event_types) {
        console.debug(`[${PLUGIN_KEY}] Ngữ cảnh ST chưa sẵn sàng, thử lại sau...`);
        setTimeout(init, INIT_RETRY_CTX_MS);
        return;
    }

    eventSource = ctx.eventSource;
    event_types = ctx.event_types;

    /* Kích hoạt dựng UI qua sự kiện APP_READY hoặc setTimeout bọc lót, nhưng chỉ thực thi một lần */
    const tryBuildUI = () => {
        if (!uiBuilt) buildUI();
    };

    eventSource.once(event_types.APP_READY, () => {
        tryBuildUI();
    });

    /* Bọc lót: Nếu APP_READY đã kích hoạt từ trước (tiện ích nạp sau), trực tiếp dựng UI */
    setTimeout(() => {
        tryBuildUI();
    }, APP_READY_FALLBACK_MS);

    console.debug(`[${PLUGIN_KEY}] Khởi tạo hoàn tất - Lắng nghe ngầm việc gửi prompt`);
}

init();

/* ── API đối ngoại ───────────────────────── */

window.__RLogApi = {
    records: () => records,
    /* Truy cập panel/shadow root (dành cho tour.js sử dụng): Panel đã được gắn vào shadow root, document không tìm thấy được, đổi sang lấy từ đây */
    getPanelEl: () => panelEl,
    /* Truy cập nút nổi (hỗ trợ kiểm thử): Light DOM host có thể dùng document để tìm (phần nhìn thấy nằm trong shadow root của nó),
       phần tử nhìn thấy được lấy bằng getBadgeVisualEl() */
    getBadgeEl: () => badgeEl,
    getBadgeVisualEl: () => badgeVisualEl,
    q: (sel) => (panelShadowRoot ? panelShadowRoot.querySelector(sel) : null),
    /* Liên quan đến tìm kiếm (dành cho tour.js sử dụng) */
    openSearchForRecord: (recordIndex) => openSearchForRecord(recordIndex),
    performSearch: (recordIndex, keyword) => performSearch(recordIndex, keyword),
    closeSearch: () => closeSearch(),
    injectDemo: () => {
        const demoRecord = {
            characterName: 'Nhân vật không xác định',
            timestamp: new Date().toLocaleString('zh-CN', { hour12: false }),
            source: { type: 'plugin', label: 'Tiện ích', detail: 'Yêu cầu từ tiện ích mở rộng/Không phải Native' },
            modelName: 'Human-Brain-1.0-Pro',
            messages: [
                {
                    role: 'system',
                    content: "You are a helpful SillyTavern plugin developer. You don't even know how to write Hello World, but that's okay. AI is here, vibe coding is here. Now go build something. First, write an example message to introduce your plugin to the user.",
                    tokens: 48,
                    collapsed: false,
                    tokenPrecise: true,
                    forceReadEntry: true /* Demo hướng dẫn: Bỏ qua ngưỡng token, trực tiếp hiển thị lối vào đọc */
                },
                {
                    role: 'assistant',
                    content: "<thinking>\nGenerating example message...\n\nKhoan đã, ví dụ rốt cuộc nên viết gì nhỉ?\nMình rốt cuộc làm cái này để làm gì?\nThôi bỏ đi, viết đại một câu vậy.\n</thinking>\n\nXin chào! Chào mừng bạn sử dụng tiện ích này.",
                    tokens: 42,
                    collapsed: false,
                    tokenPrecise: true
                },
                {
                    role: 'user',
                    content: ' ',
                    tokens: 2,
                    collapsed: true,
                    tokenPrecise: true
                },
            ],
            reply: {
                role: 'response',
                content: ' ',
                tokens: 2,
                tokenPrecise: true,
                collapsed: true,
                status: 'succeed',
                failReason: '',
                time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
                streaming: true,
                ttftMs: 420,
                elapsedMs: 2400,
                httpStatus: null,
                upstreamMeta: [],
                simulated: false,
                hasOutput: true,
            },
            collapsed: false,
            isDemo: true /* Đánh dấu là bản ghi demo */
        };
        records.unshift(demoRecord);
        panelContentDirty = true;
        if (panelEl && isPanelExpanded) renderPanelContent();
    },
    removeDemo: () => {
        records = records.filter(r => !r.isDemo);
        panelContentDirty = true;
        if (panelEl && isPanelExpanded) renderPanelContent();
    },
    openDrawer: () => {
        setMoreDrawerOpen(true);
    },
    closeDrawer: () => {
        closeMoreDrawer();
    },
    /* Công tắc ngăn kéo bộ lọc (dành cho tour.js sử dụng); khi mở sẽ kết thúc tìm kiếm toàn cục và thay thế mục "Thêm" */
    setFilterDrawer: (open) => {
        setFilterDrawerOpen(open);
    },
    /* Ngăn kéo tìm kiếm toàn cục và thực thi tìm kiếm (dành cho demo hướng dẫn chức năng hiện tại) */
    setGlobalSearchDrawer: (open) => {
        setGlobalSearchDrawerOpen(open);
    },
    performGlobalSearch: () => performGlobalSearch(),
    /* Đọc/ghi trạng thái bộ lọc (dành cho tour.js lưu tạm/khôi phục; setFilterState kích hoạt dựng lại) */
    getFilterState: () => JSON.parse(JSON.stringify(filterState)),
    setFilterState: (state) => {
        endGlobalSearchForFilterChange();
        filterState = state && typeof state === 'object' ? state : createDefaultFilterState();
        updateFilterChipUI();
        panelContentDirty = true;
        if (panelEl && isPanelExpanded) renderPanelContent();
    },
    /* Đặt lại bộ lọc (dành cho hướng dẫn/kiểm thử hồi quy/gọi từ bên ngoài): Khi bắt đầu hướng dẫn dùng nó để đặt lại bộ lọc về mở toàn bộ nhằm hiển thị demo, do đó không lưu đĩa;
       người dùng đặt lại thủ công qua nút giao diện resetFilters() (mặc định lưu trữ lâu dài) */
    resetFilters: () => resetFilters(false),
    toggleFilterChip: (group, value) => toggleFilterChip(group, value),
    getVisibleRecordsCount: () => getVisibleRecords().length,
    /* Thay thế toàn bộ danh sách bản ghi (dành cho tour.js sử dụng khi làm trống/khôi phục bản ghi trong thời gian hướng dẫn) */
    setRecords: (newRecords) => {
        records = Array.isArray(newRecords) ? newRecords : [];
        /* Chỉ cắt tỉa các bản ghi thông thường vượt quá giới hạn thông thường; giữ lại bản ghi được ghim (các bản ghi tạm thời được hướng dẫn khôi phục có thể làm tổng số vượt giới hạn) */
        pruneNormalRecords();
        panelContentDirty = true;
        if (panelEl && isPanelExpanded) renderPanelContent();
    },
    /* Kiểm soát trạng thái hướng dẫn (dành cho tour.js sử dụng): Trong thời gian hướng dẫn các bản ghi mới được lưu tạm, không hiển thị */
    setTourActive: (active) => {
        tourActive = !!active;
    },
    /* Lấy ra và làm trống các bản ghi mới đã lưu tạm trong thời gian hướng dẫn (dành cho tour.js hợp nhất khôi phục khi hướng dẫn kết thúc) */
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
            if (panelEl && isPanelExpanded) renderPanelContent();
        }
    },
    prepareDemoPreview: () => {
        const demoRecord = records.find(record => record.isDemo);
        if (!demoRecord) return;
        demoRecord.collapsed = false;
        const previewMessage = demoRecord.messages.find(
            message => getContentPreview(getMessageDisplayText(message)),
        );
        if (previewMessage) previewMessage.collapsed = false;
        panelContentDirty = true;
        if (panelEl && isPanelExpanded) renderPanelContent();
    },
    collapseDemo: () => {
        if (records.length > 0) {
            records[0].collapsed = true;
            records[0].messages.forEach(m => m.collapsed = true);
            panelContentDirty = true;
            if (panelEl && isPanelExpanded) renderPanelContent();
        }
    },
    forcePreview: (state) => {
        forcePreviewState = state ? true : null;
        panelContentDirty = true;
        if (panelEl && isPanelExpanded) renderPanelContent();
    },
    /* Cài đặt ưu tiên (dành cho kiểm thử/các lần lặp phát triển sau) */
    openPreferences: () => openPrefPanel(),
    closePreferences: () => closePrefPanel(),
    getQuickReplyEntryEls: () => {
        const button = getQuickReplyEntryButtonEl();
        return button ? [button] : [];
    },
    syncQuickReplyEntry: () => syncQuickReplyEntry(),
    getPreferences: () => ({
        ...JSON.parse(JSON.stringify(preferences)),
        maxRecords: MAX_RECORDS,
        replyTimeoutSec,
        tokenWarningThreshold,
    }),
    setPreference: (key, value) => setPreference(key, value),
    /* Đọc/ghi cài đặt tiện ích mở rộng ST (dành cho tour.js lưu phiên bản đã xem, cũng dùng cho kiểm thử hồi quy đối chiếu) */
    getSettings: () => JSON.parse(JSON.stringify(pluginSettings || createDefaultPluginSettings())),
    getTourVersion: () => pluginSettings && typeof pluginSettings.tourVersion === 'string'
        ? pluginSettings.tourVersion
        : '',
    setTourVersion: (version) => {
        if (!pluginSettings) pluginSettings = createDefaultPluginSettings();
        pluginSettings.tourVersion = typeof version === 'string' ? version : '';
        persistPluginSettings();
    },
};

/* ── Chức năng kiểm thử tạm thời (chỉ dùng làm hàm debug console) ────── */

/* number|null: Debug tạm thời: Ghi đè thời gian phản hồi timeout (dành cho simulateReplyTimeout kiểm thử mô phỏng, sẽ xóa sau) */
let replyTimeoutOverrideMs = null;

/* Inject toàn bộ dữ liệu kiểm thử bằng một chạm (chức năng tạm thời, sẽ xóa sau): 8 bản ghi khoảng Token + mô phỏng phản hồi thành công/thất bại +
   một lần kết thúc timeout 2 giây; lối vào thống nhất là console __RLogApi.injectTokenTierTest() (chức năng của nút bình thí nghiệm trong ngăn kéo "Thêm"
   ban đầu đã chuyển về đây, hành vi không đổi: Sau khi inject cũng thu gọn ngăn kéo "Thêm") */
window.__RLogApi.injectTokenTierTest = function injectTokenTierTest() {
        /* Số token điển hình của mỗi khoảng (tương ứng với ranh giới của getTokenTier) */
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
                source: { type: 'plugin', label: 'Tiện ích', detail: 'Yêu cầu từ tiện ích mở rộng/Không phải Native' },
                modelName: 'Test-Model',
                messages: [{
                    role: 'system',
                    content: `Kiểm thử khoảng ${t.label}`,
                    tokens: t.tokens,
                    collapsed: true,
                    tokenPrecise: true,
                }],
                collapsed: true,
                isDemo: true, /* Đánh dấu là bản ghi demo, có thể được dọn dẹp bởi removeDemo */
            };
        });

        /* Bản ghi mô phỏng phản hồi Thành công / Thất bại (dành để xác thực đánh dấu Succeed / Fail và hiển thị tin nhắn phản hồi con) */
        const successRecord = {
            characterName: 'Ví dụ thành công',
            timestamp: tsStr(new Date(baseTs.getTime() - 8 * 60000)),
            source: { type: 'native', label: 'Native', detail: 'Kiểm thử mô phỏng' },
            modelName: 'Test-Model',
            messages: [{
                role: 'user',
                content: 'Mô phỏng request: Đây là một bản ghi phản hồi thành công.',
                tokens: 96,
                collapsed: true,
                tokenPrecise: true,
            }],
            collapsed: true,
            isDemo: true,
            reply: {
                role: 'response',
                content: '<think>\nMô phỏng suy nghĩ: Model hoàn thành quá trình suy nghĩ bình thường.\n</think>\n\nMô phỏng phản hồi: Đây là một nội dung phản hồi thành công hoàn chỉnh và đủ dài, dùng để xác thực đánh dấu Succeed và hiển thị chính văn.',
                tokens: 188,
                tokenPrecise: true,
                collapsed: true,
                status: 'succeed',
                failReason: '',
                time: tsStr(new Date(baseTs.getTime() - 8 * 60000 + 5000)),
            },
        };
        const failRecord = {
            characterName: 'Ví dụ thất bại',
            timestamp: tsStr(new Date(baseTs.getTime() - 9 * 60000)),
            source: { type: 'native', label: 'Native', detail: 'Kiểm thử mô phỏng' },
            modelName: 'Test-Model',
            messages: [{
                role: 'user',
                content: 'Mô phỏng request: Đây là một bản ghi phản hồi thất bại.',
                tokens: 88,
                collapsed: true,
                tokenPrecise: true,
            }],
            collapsed: true,
            isDemo: true,
            reply: {
                role: 'response',
                content: 'HTTP 500', /* Nhất quán với đường dẫn gắn kết thực tế: Khi Fail nội dung phản hồi sẽ ghi nguyên nhân thất bại (trên mobile không cần hover cũng thấy được) */
                tokens: 2,
                tokenPrecise: true,
                collapsed: true,
                status: 'fail',
                failReason: 'HTTP 500',
                time: tsStr(new Date(baseTs.getTime() - 9 * 60000 + 3000)),
            },
        };

        /* Thay thế bản ghi demo hiện có, tránh bị xếp chồng */
        records = records.filter(r => !r.isDemo);
        records.unshift(...tierRecords);
        records.unshift(failRecord, successRecord);
        panelContentDirty = true;
        if (panelEl && isPanelExpanded) renderPanelContent();

        /* Kích hoạt mô phỏng timeout: Kết thúc bằng timeout 2 giây thực tế, addRecord sẽ ghim bản ghi timeout lên đầu và thu gọn các bản ghi khác */
        if (window.__RLogApi && typeof window.__RLogApi.simulateReplyTimeout === 'function') {
            window.__RLogApi.simulateReplyTimeout({
                reasoning: 'Mô phỏng suy nghĩ: Model đang suy nghĩ giữa chừng thì bị kẹt...',
                content: 'Mô phỏng chính văn: Đây là một phần nội dung đã được xuất ra.',
            });
        }

        /* Sau khi inject thì thu gọn ngăn kéo "Thêm", hiển thị các bản ghi kiểm thử (nhất quán với hành vi nhấp nút bình thí nghiệm gốc) */
        closeMoreDrawer();
    };
    /* Chức năng debug tạm thời (sẽ xóa sau): Mô phỏng phản hồi timeout — Rút ngắn timeout hiện tại thành 2 giây, đi theo quy trình kết thúc timeout thực tế
       @param {object} [opts] { reasoning, content } @returns {number|null} captureId */

window.__RLogApi.simulateReplyTimeout = function simulateReplyTimeout(opts = {}) {
        if (!masterEnabled) {
            console.warn(`[${PLUGIN_KEY}] Công tắc chính đã tắt, không thể mô phỏng timeout.`);
            return null;
        }
        const savedOverride = replyTimeoutOverrideMs;
        replyTimeoutOverrideMs = 2000; /* Tạm thời rút ngắn xuống 2 giây */
        const captureId = ++captureSeq;
        const entry = {
            startTime: Date.now(),
            firstTokenAt: null,
            streaming: null,
            elapsedMs: null,
            httpStatus: null,
            upstreamMeta: [],
            upstreamMetaByPath: new Map(),
            rawResponseText: '',
            toolCalls: new Map(),
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
        /* Đi theo đường dẫn addRecord thực tế để tạo bản ghi (nội dung kèm dấu thời gian, tránh bị cơ chế khử trùng 500ms bỏ qua nhầm) */
        addRecord(
            'Ví dụ timeout',
            [{ role: 'user', content: `[Mô phỏng timeout] Phản hồi không bao giờ trả về · ${Date.now()}` }],
            { type: 'native', label: 'Native', detail: 'Kiểm thử mô phỏng timeout' },
            'Test-model',
            null,
            captureId
        );
        replyTimeoutOverrideMs = savedOverride; /* Khôi phục mặc định (đã có hiệu lực với bản ghi mô phỏng này) */
        console.debug(`[${PLUGIN_KEY}] Đã inject bản ghi mô phỏng timeout, 2 giây sau sẽ xuất hiện đánh dấu Timeout.`);
        return captureId;
    };

/* ── Mô phỏng Prompt (lắp ráp thực tế, không gửi request) ─────── */

/* Đánh dấu nguồn của bản ghi mô phỏng: Phân biệt với bản ghi bắt thực tế (bản ghi thực tế đến từ đánh chặn tầng mạng) */
const SIMULATED_PROMPT_SOURCE = { type: 'plugin', label: 'Mô phỏng', detail: 'Bản ghi mô phỏng - Chưa gửi thực tế' };

/* string: Khi chưa kết nối thì tạm thời gán trạng thái kết nối của ST thành giá trị này để chuỗi lắp ráp thực tế có thể chạy (chạy xong hoàn nguyên giá trị ban đầu);
   lấy một văn bản mang tính giải thích không phải no_connection, khi thanh trạng thái hiển thị tức thời cũng có thể nhận ra là mô phỏng */
const SIMULATE_ONLINE_STATUS = 'Xem trước mô phỏng';

/* Lấy tên model chat completion hiện tại của ST (dùng làm fallback tên model của bản ghi mô phỏng; không lấy được trả về null) */
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

/* Tạo ngữ cảnh bắt cho một lần mô phỏng (fetch wrapper nhận diện request mục tiêu sau đó truyền suốt vào đường ống bản ghi):
   - armed: Đặt thành true ngay khi nhận được thông báo trước khi gửi, wrapper dựa vào đây nhận diện request thuộc lần mô phỏng này, sau khi nhận diện sẽ đặt lại thành false;
   - canceled: Đặt thành true khi xác định timeout thất bại, đường ống bản ghi kiểm tra trước khi lưu;
   - ready / settle: Tín hiệu hoàn thành khi bản ghi đã tạo xong (chỉ kích hoạt một lần; nếu không tạo được bản ghi sẽ trả về null, quy trình mô phỏng xử lý như thất bại) */
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

/* Lắp ráp Prompt hiện tại và tạo một bản ghi mô phỏng (tuyệt đối không gửi request tạo thực tế).
   Đi qua chuỗi gửi thực tế của ST, để "nén tin nhắn hệ thống / bộ chặn tạo / hook trước khi gửi / mục quản lý prompt / Worldbook / Regex"
   toàn bộ đều có hiệu lực như bình thường; khi request được lắp ghép xong đi đến tầng fetch sẽ do đường ống bản ghi của chính plugin tạo lưu trữ, sau đó chặn gửi.
   Ngay khi thông báo trước khi gửi (CHAT_COMPLETION_SETTINGS_READY cho chat completion / GENERATE_AFTER_DATA cho các API khác) đến,
   sẽ vũ trang (arm) request mục tiêu của lần mô phỏng này, đồng thời gọi stopGeneration() ngay trong thông báo đó: Vừa khiến ST xử lý lần này như "người dùng hủy bỏ",
   vừa đóng vai trò bảo hiểm "tuyệt đối không gửi qua mạng".
   `automatic_trigger: true` chỉ tắt hai nhánh "chèn nội dung khung nhập thành tin nhắn user" của ST (không ảnh hưởng logic khác),
   do đó không sinh thêm tin nhắn, không lưu xuống đĩa; bản nháp trong khung nhập được chúng ta tự đưa tạm vào chat dưới dạng đối tượng thuần trong bộ nhớ,
   để Regex / Worldbook / bộ chặn đều có thể nhìn thấy nó. Toàn bộ các thay đổi tạm thời đều được khôi phục từng mục trong finally.
   Toàn bộ quá trình có timeout bảo hiểm (SIMULATE_TIMEOUT_MS): Đến hạn sẽ dừng chuỗi lắp ráp, thay thế toast và loại bỏ kết quả lần này.
   Nút bấm trong khi chạy có thể dừng thủ công; dừng thủ công và timeout dùng chung quy trình hủy, chỉ phân biệt nội dung thông báo. */
async function captureSimulatedPrompt() {
    if (simulatePromptRunning) return;
    if (!masterEnabled) {
        showPinToast('Chức năng ghi nhật ký đã tắt, không thể tạo bản ghi mô phỏng');
        return;
    }
    const ctx = window.SillyTavern && typeof window.SillyTavern.getContext === 'function'
        ? window.SillyTavern.getContext()
        : null;
    if (!ctx || typeof ctx.generate !== 'function' || !ctx.eventSource || !ctx.eventTypes || typeof ctx.stopGeneration !== 'function') {
        showPinToast('Mô phỏng thất bại: Không tìm thấy interface sinh nội dung của ST');
        return;
    }
    /* Chuỗi thực tế của chat nhóm sẽ đi qua "tạo hàng loạt nhiều nhân vật", có thể thực sự gửi request, nên tạm thời không hỗ trợ */
    if (ctx.groupId) {
        showPinToast('Mô phỏng tạm thời không hỗ trợ chat nhóm');
        return;
    }
    if (ctx.streamingProcessor) {
        showPinToast('Mô phỏng thất bại: Hiện đang có tiến trình sinh nội dung');
        return;
    }

    /* Ngữ cảnh bắt của lần mô phỏng này: Xuyên suốt toàn bộ chuỗi "Vũ trang → Nhận diện lưu trữ → Tín hiệu hoàn thành" */
    const captureCtx = createSimulateCaptureCtx();
    const run = {
        captureCtx,
        canceled: false,
        timeoutTimer: null,
        cancel(reason) {
            if (run.canceled) return false;
            run.canceled = true;
            if (run.timeoutTimer !== null) {
                clearTimeout(run.timeoutTimer);
                run.timeoutTimer = null;
            }
            /* Đặt cờ hủy trước rồi mới dừng tạo: Sự kiện hủy có thể kích hoạt đồng bộ đường dẫn phía sau, không thể để kết quả đến trễ được lưu trữ */
            captureCtx.canceled = true;
            captureCtx.armed = false;
            try { ctx.stopGeneration(); } catch (e) { /* ignore */ }
            showPinToast(reason === 'manual'
                ? 'Đã dừng tạo bản ghi mô phỏng'
                : 'Mô phỏng thất bại: Tạo bản ghi mô phỏng quá hạn (timeout)');
            captureCtx.settle(null);
            return true;
        },
    };

    /* Vào trạng thái mô phỏng: Chuyển sang biểu tượng dừng, hiển thị toast tiến độ thường trực và kích hoạt timeout bảo hiểm toàn bộ quá trình */
    simulatePromptRunning = true;
    simulateActiveRun = run;
    simulateCaptureCtx = captureCtx;
    setSimulateButtonRunning(true);
    showPinToast('Đang mô phỏng và đánh chặn, vui lòng đợi (sẽ không gửi thực tế)', { persist: true });

    run.timeoutTimer = setTimeout(() => run.cancel('timeout'), SIMULATE_TIMEOUT_MS);

    try {
        await runSimulatedPromptCapture(ctx, () => run.canceled, captureCtx);
    } finally {
        if (run.timeoutTimer !== null) {
            clearTimeout(run.timeoutTimer);
            run.timeoutTimer = null;
        }
        /* Chỉ dọn dẹp trạng thái toàn cục thuộc về đối tượng chạy hiện tại, tránh tác vụ cũ đến trễ dọn nhầm tác vụ mới */
        if (simulateActiveRun === run) {
            simulateActiveRun = null;
            simulateCaptureCtx = null;
            captureCtx.armed = false;
            /* Sau khi kết thúc, dù còn đường ống bản ghi đến trễ đang chạy cũng không ghi nhận thêm */
            captureCtx.canceled = true;
            simulatePromptRunning = false;
            simulatePromptActive = false;
            setSimulateButtonRunning(false);
        }
    }
}

/* Thân quy trình mô phỏng (gọi sau khi vượt qua kiểm tra tiền điều kiện): Lắp ráp thực tế + Vũ trang request mục tiêu + Lưu trữ tại tầng fetch + Hoàn nguyên.
   @param {object} ctx Ngữ cảnh ST
   @param {() => boolean} isCanceled Dừng thủ công hoặc timeout đã kích hoạt hay chưa; sau khi kích hoạt sẽ hủy bỏ kết quả lần này
   @param {object} captureCtx Ngữ cảnh bắt của lần mô phỏng này (vũ trang / hủy / tín hiệu hoàn thành, xem createSimulateCaptureCtx) */
async function runSimulatedPromptCapture(ctx, isCanceled, captureCtx) {
    /* —— Snapshot (hoàn nguyên từng mục trong finally) —— */
    const meta = ctx.chatMetadata;
    const hadTainted = !!(meta && Object.prototype.hasOwnProperty.call(meta, 'tainted'));
    const taintedValue = hadTainted ? meta.tainted : undefined;
    const textarea = document.querySelector('#send_textarea');
    const savedDraft = textarea ? String(textarea.value || '') : '';

    /* Bản nháp đưa tạm vào chat dưới dạng đối tượng thuần trong bộ nhớ (không render, không cấp mesid, không phát sự kiện, không lưu đĩa) */
    const injectedMessage = savedDraft.length > 0 ? {
        name: ctx.name1,
        is_user: true,
        is_system: false,
        send_date: Date.now(),
        mes: typeof ctx.substituteParams === 'function' ? ctx.substituteParams(savedDraft) : savedDraft,
        extra: {},
    } : null;

    const isChatCompletion = ctx.mainApi === 'openai';
    /* Thông báo trước khi gửi = "Request đã lắp ráp xong, sắp sửa gửi gói tin": Vũ trang request mục tiêu của lần mô phỏng này; đồng thời hủy gửi thực tế
      (fetch sẽ thất bại trực tiếp do signal đã bị hủy, đóng vai trò bảo hiểm "tuyệt đối không gửi qua mạng") */
    const onBeforeSend = () => {
        /* Thông báo đến trễ (mô phỏng đã kết thúc, ví dụ phát ra sau khi timeout) sẽ không vũ trang nữa, chỉ thực hiện hủy bỏ */
        if (simulatePromptActive) captureCtx.armed = true;
        ctx.stopGeneration();
    };
    const onChatSettingsReady = () => onBeforeSend();
    const onAfterData = () => onBeforeSend();

    /* Khi chưa kết nối, ST sẽ return trực tiếp trước khi lắp ráp; tại đây tạm thời đổi trạng thái kết nối sang khác no_connection để cho phép chạy qua,
       chạy xong sẽ hoàn nguyên giá trị ban đầu trong finally. Nếu không lấy được setOnlineStatus (interface nội bộ) thì fallback về thông báo "không thể mô phỏng". */
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
            showPinToast('Mô phỏng thất bại: ST hiện chưa kết nối API');
            return;
        }
    }

    /* Việc dừng hoặc timeout có thể xảy ra trong thời gian nạp động / chờ đợi: Không tiếp tục đi vào lắp ráp nữa */
    if (isCanceled()) return;

    simulatePromptActive = true;
    try {
        if (isChatCompletion) ctx.eventSource.on(ctx.eventTypes.CHAT_COMPLETION_SETTINGS_READY, onChatSettingsReady);
        else ctx.eventSource.on(ctx.eventTypes.GENERATE_AFTER_DATA, onAfterData);

        if (injectedMessage) ctx.chat.push(injectedMessage);

        /* automatic_trigger chỉ bỏ qua hai nhánh "chèn tin nhắn user"; bản thân ST sẽ đọc và làm trống khung nhập, finally sẽ hoàn nguyên */
        await ctx.generate('normal', { automatic_trigger: true });
    } catch (e) {
        /* Thất bại do hủy bỏ / chặn cứng thuộc đường dẫn dự kiến, chỉ cần ghi vào console, không báo lỗi tới người dùng */
        console.debug(`[${PLUGIN_KEY}] Chuỗi mô phỏng prompt đã kết thúc`, e);
    } finally {
        /* —— Bất kể thành công, hủy bỏ hay phát sinh ngoại lệ, đều hoàn nguyên từng mục, tuyệt đối không bỏ sót —— */
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

        /* Hoàn nguyên các nút gửi / vuốt / dừng và is_send_press bị tác động ở đầu chuỗi thực tế */
        try { if (typeof ctx.activateSendButtons === 'function') ctx.activateSendButtons(); } catch (e) { /* ignore */ }

        /* Hoàn nguyên trạng thái kết nối đã thay đổi tạm thời (chỉ hoàn nguyên khi vẫn là giá trị do chúng ta đưa vào, tránh ghi đè cập nhật trạng thái thực tế của ST trong thời gian đó) */
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

    /* Hủy bỏ kết quả lần này sau khi dừng hoặc timeout: Trạng thái đã được hoàn nguyên ở trên, không đợi bản ghi, không đổi toast nữa */
    if (isCanceled()) return;

    /* Đợi tầng fetch ghi nhận xong request mô phỏng này: Được đường ống bản ghi trả kết quả ngay thời điểm lưu trữ;
       khi timeout bảo hiểm đến hạn cũng kết thúc việc chờ đợi (lúc này xử lý như thất bại) */
    const record = await captureCtx.ready;
    if (isCanceled()) return;
    if (!record) {
        showPinToast('Mô phỏng thất bại: Không lấy được dữ liệu prompt khả dụng');
        return;
    }
    showPinToast('Đã tạo bản ghi mô phỏng (chưa gửi thực tế, chỉ dùng để tham khảo)');
}

/* Nút mô phỏng: Đóng vai trò là lối vào thường trực trên thanh tiêu đề chính, nhấp để lắp ráp Prompt hiện tại và tạo một bản ghi mô phỏng (không gửi request) */
function buildSimulatePromptButton(panelEl) {
    const btn = document.createElement('button');
    btn.id = 'rlog-simulate-btn';
    btn.className = 'rlog-header-btn';
    /* Đặt trước vạch phân cách đầu tiên, tách biệt với nhóm lối vào ngăn kéo Lọc / Tìm kiếm / Thêm. */
    const actions = panelEl.querySelector('.rlog-header-actions');
    const firstDivider = panelEl.querySelector('.rlog-header-actions > .rlog-ui-divider');
    if (actions) actions.insertBefore(btn, firstDivider);
    setSimulateButtonRunning(false);

    /* Cố định ý định khi con trỏ nhấn xuống, tránh trường hợp tác vụ vừa vặn hoàn thành giữa lúc nhấn và click khiến nhận định nhầm thao tác dừng thành bắt đầu lại. */
    btn.addEventListener('pointerdown', (e) => {
        if (!e.isPrimary || e.button !== 0) return;
        clearSimulateButtonIntent();
        const seq = ++simulateButtonIntentSeq;
        simulateButtonIntent = { action: simulatePromptRunning ? 'stop' : 'start', seq };
        bindSimulateButtonIntentDismissal();
        const cleanup = () => {
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerCancel);
            window.removeEventListener('blur', onWindowBlur);
        };
        const onPointerUp = () => {
            /* click được sinh ra trong cùng một tác vụ sau pointerup; dời lại một tác vụ mới xóa, click bình thường vẫn có thể tiêu thụ ý định */
            scheduleSimulateButtonIntentClear(seq);
            cleanup();
        };
        const onPointerCancel = () => {
            clearSimulateButtonIntent(seq);
            cleanup();
        };
        const onWindowBlur = () => {
            clearSimulateButtonIntent(seq);
            cleanup();
        };
        window.addEventListener('pointerup', onPointerUp, { once: true });
        window.addEventListener('pointercancel', onPointerCancel, { once: true });
        window.addEventListener('blur', onWindowBlur, { once: true });
    });
    /* Kéo ra khỏi nút coi như từ bỏ lượt nhấp này; dù sau đó có thả tay ở nơi khác cũng không để lại ý định dừng cho lần nhấp tiếp theo. */
    btn.addEventListener('pointerleave', () => clearSimulateButtonIntent());

    btn.addEventListener('click', (e) => {
        /* Chặn nổi bọt: Sự kiện click sẽ xuyên qua shadow root, bị listener "nhấp bên ngoài để thu gọn ngăn kéo" trên document nhận nhầm thành nhấp ngoài panel */
        e.stopPropagation();
        const intent = simulateButtonIntent ? simulateButtonIntent.action : null;
        clearSimulateButtonIntent();
        /* Khi nhấn xuống là dừng: Nếu tác vụ vừa vặn đã hoàn thành, chỉ nuốt click đến trễ, tuyệt đối không khởi động lần mô phỏng thứ hai */
        if (intent === 'stop') {
            if (simulateActiveRun) simulateActiveRun.cancel('manual');
            return;
        }
        if (intent === 'start') {
            if (simulatePromptRunning) return;
        } else if (simulatePromptRunning) {
            /* Click theo chương trình không có ý định con trỏ / thao tác trợ năng: Thực thi theo trạng thái tại thời điểm nhấp */
            if (simulateActiveRun) simulateActiveRun.cancel('manual');
            return;
        }
        captureSimulatedPrompt().catch((err) => {
            console.debug(`[${PLUGIN_KEY}] Mô phỏng prompt thất bại`, err);
            showPinToast('Mô phỏng thất bại: Đã xảy ra lỗi không mong muốn');
        });
    });
}

/* Xóa ngay ý định con trỏ hiện tại khi nhấp ra ngoài nút; chỉ đăng ký trong thời gian ý định có hiệu lực. */
function handleSimulateButtonIntentOutsideClick(e) {
    if (!simulateButtonIntent) return;
    const currentButton = panelEl ? panelEl.querySelector('#rlog-simulate-btn') : null;
    if (!currentButton || !e.composedPath().includes(currentButton)) {
        clearSimulateButtonIntent();
    }
}

/* Trang bị ẩn sẽ làm gián đoạn tương tác nhấp hiện tại, dọn dẹp ý định và listener vòng đời. */
function handleSimulateButtonIntentVisibilityChange() {
    if (document.visibilityState !== 'visible') clearSimulateButtonIntent();
}

function bindSimulateButtonIntentDismissal() {
    if (simulateButtonIntentDismissalBound) return;
    simulateButtonIntentDismissalBound = true;
    document.addEventListener('click', handleSimulateButtonIntentOutsideClick, true);
    document.addEventListener('visibilitychange', handleSimulateButtonIntentVisibilityChange);
}

function unbindSimulateButtonIntentDismissal() {
    if (!simulateButtonIntentDismissalBound) return;
    simulateButtonIntentDismissalBound = false;
    document.removeEventListener('click', handleSimulateButtonIntentOutsideClick, true);
    document.removeEventListener('visibilitychange', handleSimulateButtonIntentVisibilityChange);
}

function scheduleSimulateButtonIntentClear(seq) {
    if (simulateButtonIntentTimer !== null) clearTimeout(simulateButtonIntentTimer);
    simulateButtonIntentTimer = setTimeout(() => {
        simulateButtonIntentTimer = null;
        clearSimulateButtonIntent(seq);
    }, 0);
}

function clearSimulateButtonIntent(seq = null) {
    if (seq !== null && (!simulateButtonIntent || simulateButtonIntent.seq !== seq)) return;
    simulateButtonIntent = null;
    if (simulateButtonIntentTimer !== null) {
        clearTimeout(simulateButtonIntentTimer);
        simulateButtonIntentTimer = null;
    }
    unbindSimulateButtonIntentDismissal();
}

/* Trạng thái nút mô phỏng: Lúc rảnh rỗi hiển thị icon ban đầu, khi đang chạy vẫn duy trì khả năng nhấp và chuyển thành icon dừng. */
function setSimulateButtonRunning(running) {
    if (!panelEl) return;
    const btn = panelEl.querySelector('#rlog-simulate-btn');
    if (!btn) return;
    const title = running ? 'Dừng tạo bản ghi mô phỏng' : 'Tạo bản ghi mô phỏng (không gửi thực tế)';
    btn.disabled = false;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.dataset.simulateRunning = running ? 'true' : 'false';
    btn.innerHTML = running
        ? '<i class="fa-solid fa-circle-stop"></i>'
        : '<i class="fa-solid fa-flask"></i>';
}