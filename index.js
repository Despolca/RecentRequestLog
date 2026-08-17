/* ============================================================
   Lịch sử Request gần đây (Recent Request Log) — Module logic chính (index.js)
   ============================================================ */

/* [Mục lục các khối] (Theo thứ tự từ trên xuống dưới trong file)
   1. Tải động tour.js         Load module hướng dẫn sử dụng khi plugin khởi động (Luôn để ở trên cùng)
   2. Tham số tùy chỉnh & Hằng Toàn bộ các giá trị có thể chỉnh/key lưu trữ/pattern đường dẫn, chỉnh thông số chỉ sửa ở đây
   3. Biến trạng thái          Trạng thái bộ nhớ lúc chạy của bảng/dữ liệu/tìm kiếm/theo dõi phản hồi...
   4. Hàm tiện ích (Utils)     Các hàm thuần túy không side-effect (escape/tên model/token/map vai trò...)
   5. Check cấu trúc AI body   Phán đoán xem request body có đúng là request gửi cho AI không
   6. Nhận diện nguồn request  Lắng nghe đầu vào gốc (native) và suy luận nguồn (native/plugin)
   7. Đánh chặn Fetch          Bắt request body ở tầng mạng (parse/process/install)
   8. Theo dõi & Phân tích reply Bắt phản hồi/Phân tích SSE/Trích xuất lỗi/Gắn trạng thái cuối
   9. Quản lý dữ liệu          Thêm xóa log, dấu vân tay chống trùng, giới hạn số lượng
   10. Lưu trữ thiết lập       Đọc/Ghi công tắc tổng/xem trước nội dung/theme/số log tối đa
   11. Popup dùng chung        Popup cài đặt số log tối đa + Popup xác nhận đa năng
   12. Tìm kiếm                Trạng thái tìm kiếm/khớp/highlight/điều hướng
   13. Render & Build HTML     Build HTML cho log/tin nhắn, renderPanelContent, gắn sự kiện
   14. Gập mở & Nháy Lên đầu   Gập/Mở, neo cuộn, nhảy Xuống cuối/Lên đầu, chớp nháy báo hiệu
   15. Xóa & Copy log          Xóa lẻ, copy nguyên cục/copy lẻ tin nhắn, phản hồi khi copy
   16. Lớp phủ Xem toàn văn    Đóng mở lớp phủ, chuyển đổi định dạng, cuộn, nhấn Esc để tắt
   17. Thanh cuộn tự chế       Dùng chung Observer, tạo/update/kéo thả thanh cuộn, indicator
   18. Điều khiển bảng (Panel) Lối vào menu, buildUI, nút đóng mở/thu gọn/đổi theme
   19. Kéo thả & Thu phóng     Kéo bảng đi muôn nơi / Nắm góc phải dưới để thu phóng
   20. Khởi tạo (Init)         Chờ ST sẵn sàng rồi mới build UI
   21. API ra bên ngoài         window.__RLogApi mở interface cho tour.js gọi
   22. Tính năng test tạm      Nút bình chứa cồn và bơm data giả (Sau này sẽ xóa)
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

/* ── Tham số tùy chỉnh & Hằng số ──────────────────────── */

const PLUGIN_KEY = 'RecentRequestLog';
const DEFAULT_MAX_RECORDS = 10;         /* Số log tối đa mặc định */
const MIN_MAX_RECORDS = 10;              /* Giá trị nhỏ nhất user có thể cài */
const MAX_MAX_RECORDS = 100;            /* Giá trị lớn nhất user có thể cài (Ngăn phá game) */
const DOUBLE_CLICK_THRESHOLD = 350;     /* Ngưỡng thời gian phán đoán nháy đúp(ms), hẹp hơn mức này thì tính là nháy đúp */
const STORAGE_THEME_KEY = `${PLUGIN_KEY}_theme`;
const STORAGE_MASTER_KEY = `${PLUGIN_KEY}_masterEnabled`;
const STORAGE_MAX_RECORDS_KEY = `${PLUGIN_KEY}_maxRecords`;  /* Lưu số log tối đa xuống local */
const STORAGE_PREVIEW_KEY = `${PLUGIN_KEY}_contentPreview`;  /* Lưu công tắc xem trước nội dung xuống local */
const NATIVE_INTENT_WINDOW_MS = 5000;

/* number: Giới hạn log tối đa đang có hiệu lực, load từ localStorage hoặc xài số mặc định */
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

/* number: Timeout khi theo dõi reply (5 phút): Quá hạn mà chưa xong thì ngắt theo dõi và cắm biển Timeout */
const REPLY_TIMEOUT_MS = 5 * 60 * 1000;

/* number: Thời gian giữ lại reply lâu nhất sau khi nó đạt trạng thái cuối mà log vẫn chưa kịp tạo (Chờ addRecord ra đời để treo lên) */
const PENDING_REPLY_KEEP_MS = 60 * 1000;
/* number: Số lượng reply tối đa nằm trong hàng chờ (Tránh dội bom request làm phình RAM) */
const MAX_PENDING_REPLIES = 100;

/* number: Độ trễ chống dội (debounce) cho ô tìm kiếm(ms), ngưng gõ một lúc rồi mới chạy tìm kiếm */
const SEARCH_DEBOUNCE_MS = 120;

/* Giới hạn đọc body của những lỗi không phải 2xx (byte): Tràn số này là ngưng đọc, tránh mấy trang báo lỗi bự chà bá làm phí tài nguyên */
const MAX_ERROR_BODY_BYTES = 8192;

/* Hẹn giờ phòng hờ cho hiệu ứng chớp lúc nhảy Xuống cuối(ms): Nếu nhảy mượt xong mà event scrollend bị xịt thì lấy cái này đỡ đạn */
const SCROLLEND_FALLBACK_MS = 2000;
/* Độ trễ đẻ thanh cuộn lười biếng(ms): Đợi khu nội dung lòi ra rồi mới thủng thẳng đẻ thanh tiến độ, tránh reflow đồng bộ bóp chết UI */
const SCROLLBAR_CREATE_DELAY_MS = 50;
/* Độ trễ xếp lại nút menu(ms): Đảm bảo thằng này chốt sổ nằm ở chót sau khi mọi plugin đồng bộ khác đã yên vị */
const MENU_REORDER_DELAY_MS = 100;
/* Độ trễ thử lại lúc khởi tạo(ms): Khoảng thời gian chờ mỏi mòn khi object global của ST chưa chịu lên mâm */
const INIT_RETRY_ST_MS = 200;
/* Độ trễ thử lại lúc khởi tạo(ms): Khoảng thời gian chờ khi ST context vẫn chưa sẵn sàng */
const INIT_RETRY_CTX_MS = 300;
/* Chờ phòng hờ APP_READY(ms): Event có khi bắn rồi mà ta không biết, vác cái này ra ép build UI luôn */
const APP_READY_FALLBACK_MS = 500;
/* Cạnh trên của các mốc Token (Xếp lùi, tính bằng token): getTokenTier dựa vào mức >= biên để trả về mốc từ 1-7 */
const TOKEN_TIER_BOUNDARIES = [200000, 128000, 64000, 32000, 16000, 8000, 4000];

/* ── Biến trạng thái ─────────────────────────── */

/* object|null: eventSource của ST */
let eventSource = null;
/* object|null: event_types của ST */
let event_types = null;

/* Array: Danh sách các log đã vớt được */
let records = [];

/* boolean: Hướng dẫn sử dụng có đang chạy không (Lúc đang chạy thì log mới chỉ giam tạm chứ không show, tránh phá hỏng tọa độ DOM của bài hướng dẫn) */
let tourActive = false;

/* Array: Đám log mới bị tạm giam trong lúc chạy hướng dẫn (Xong hướng dẫn thì endTour sẽ vác ra nhập bầy lại, khỏi lo mất mát) */
let tourPendingRecords = [];

/* HTMLElement|null: Phần tử DOM của bảng điều khiển (Panel) */
let panelEl = null;

/* HTMLElement|null: Nút bấm nằm trong menu Extensions */
let toggleBtn = null;

/* boolean: Bảng điều khiển có đang lòi mặt ra không */
let isPanelVisible = false;

/* @type {boolean} Có cần đập đi xây lại nội dung bảng không (Dữ liệu đổi thì bật true, render xong thì dập về false)
   Lúc giấu bảng đi thì DOM vẫn nguyên vẹn; chỉ khi dữ liệu/setting render có biến thì lần mở sau mới xây lại DOM,
   Chống vụ lúc đang banh chành cả núi tin nhắn mà tắt mở lại nó build lại từ đầu làm giật tung nóc. */
let panelContentDirty = true;

/* boolean: Đang ở chế độ Sáng hả? */
let isLightTheme = false;

/* boolean: Cửa sổ bảng điều khiển có đang thu gọn lại không */
let isPanelCollapsed = false;

/* boolean: Có log mới lọt hố trong lúc bảng đang ẩn/thu gọn không, nếu có thì lúc mở ra phải vút lên đầu bảng liền */
let pendingScrollToTop = false;

/* boolean: Công tắc tổng của plugin có đang bật không (Lưu xuống localStorage, cài lần đầu là auto bật) */
let masterEnabled = true;

/* HTMLElement|null: Phần tử DOM của popup chỉnh giới hạn log */
let maxRecordsDialog = null;

/* Đám cặn bã liên quan đến kéo thả/thu phóng Panel */
let panelResizing = false;
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartW = 0;
let resizeStartH = 0;

/* Function|null: Thánh chỉ gốc của window.fetch */
let originalFetch = null;

/* Function|null: Đồ giả (hook) đang đội lốt fetch hiện tại */
let currentHook = null;

/* boolean: Cờ chống kẹt đạn (re-entrancy) lúc hook fetch đang chạy */
let fetchHookInFlight = false;

/* number: Số thứ tự bắt request cứ thế tăng dần, dùng để treo đúng cái reply vào đúng cái log */
let captureSeq = 0;

/* Khu đợi reply chưa có chỗ dung thân (key: captureId)
   value: {
   startTime,   Giờ bắt đầu ngóng (Date.now())
   timer,       Id của đồng hồ đếm ngược (Quá giờ → Treo biển Timeout)
   expireTimer, Id đồng hồ dọn rác giữ chân xíu xiu sau khi đã xong xuôi (Đợi log sinh ra để bấu vào)
   status,      Trạng thái chót: 'succeed' | 'fail' | 'timeout'
   content,     Mớ text chính đã gom nhặt được
   reasoning,   Mớ text suy nghĩ đã gom nhặt được (reasoning/thinking/thought)
   failReason,  Lý do tạch/timeout (Để lúc hover chuột vào nó hiện lên)
   time,        Giờ đạt trạng thái chót (Format giống y chang timestamp của log)
   reader,      Đầu đọc dòng stream (Lúc timeout/dọn dẹp thì cancel quăng đi)
   finished,    Đã xong xuôi chưa (Chặn trò finalize nhiều lần)
   } */
const pendingReplies = new Map();

/* string|null: Vân tay messages của cái log trước đó, dùng để tống cổ mấy đứa sinh đôi */
let lastRecordFingerprint = null;

/* number: Dấu thời gian của cái log trước đó */
let lastRecordTime = 0;

/* { timestamp: number, target: string, source: 'click'|'pointerdown'|'keydown' : |null} Đầu vào sinh text gốc (native) của ST gần đây nhất */
let lastNativeIntent = null;

/* boolean: Đã gắn tai nghe trộm đầu vào native chưa */
let sourceTrackingInstalled = false;

/* boolean: UI đã build xong chưa (Ngăn vụ init() rồ lên build hai lần do kẹt xe) */
let uiBuilt = false;

/* boolean: Công tắc xem trước nội dung, mặc định tắt (Lưu xuống localStorage) */
let contentPreviewEnabled = false;

/* boolean|null: Cưỡng chế đè bẹp công tắc xem trước (Phục vụ cho bài múa hướng dẫn) */
let forcePreviewState = null;

/* @type {object|null} Trạng thái đang tìm kiếm hiện tại (Cùng lúc chỉ bới móc được một log thôi nha)
   Cấu trúc: { recordIndex, keyword, matches, currentIdx, searchEl }
   - recordIndex: Số nhà của log đang bị soi
   - keyword: Từ khóa đang kiếm (Để coi có cần bới lại từ đầu không)
   - matches: Array<{ msgIdx, start, end }> Tọa độ của mấy chỗ bắt được
   - currentIdx: Đang chiếu đèn vào chỗ thứ mấy (-1 là tạch, không trúng cái nào)
   - searchEl: Phần tử DOM chứa cái ô tìm kiếm */
let searchState = null;

/* number|null: ID đồng hồ chống dội (debounce) cho ô tìm kiếm */
let searchDebounceTimer = null;

/* HTMLElement|null: Thanh tiêu đề nằm chờ chớp sáng sau khi phi xuống đáy (Cuộn êm ru xong mới giật chớp) */
let pendingFlashHeader = null;
/* number|null: Đồng hồ dự bị chờ chớp chớp (Lỡ scrollend bị xịt thì mang ra xài) */
let pendingFlashTimer = null;
/* number: Giờ chớp Lên đầu gần nhất (Lỡ bị màn render đắp reply cắt ngang thì xài để chớp bù) */
let lastTopHintFlashAt = 0;
/* HTMLElement|null: Cái log kích hoạt vụ Lên đầu do bị cụp lại (Chỉ chớp nếu mở đúng lại cái log đó thôi) */
let recordCollapseToppedEl = null;

/* HTMLElement|null: Phần tử DOM lớp phủ "Xem toàn văn" hiện tại */
let readFullOverlayEl = null;

/* number|null: Số nhà của cái log đang bị phanh thui trên lớp phủ */
let readFullRecordIndex = null;

/* string: Định dạng đang chưng ra: 'formatted' (Đã tỉa tót) hoặc 'raw' (JSON nguyên thủy) */
let readFullFormat = 'formatted';

/* ── Hàm tiện ích (Utils) ─────────────────────────── */

/* Móc "hệ tư tưởng" (family) ra khỏi tên Model
   Mấy cái Model cùng họ sẽ xài chung máy thái chữ (tokenizer) (Ví dụ: gemini-3.1-pro-preview với gemini-3.6-flash đều là con nhà gemini).
   Luật bắt chữ ăn theo luật của hàm getTokenizerModel() bên file tokenizers.js của ST.
   @param {string} modelName Tên Model
   @returns {string} Dấu hiệu nhận biết hệ tư tưởng, nếu nhìn ếu ra thì quăng về cái tên gốc viết thường */
function extractModelFamily(modelName) {
    if (!modelName || modelName === '未知模型') return '';
    const m = modelName.toLowerCase();

    /* Bọn nhà GPT: gpt, o1, o3, o4, davinci, turbo */
    if (m.includes('gpt') || m.includes('o1-') || m.includes('o3-') || m.includes('o4-') || m.includes('davinci')) return 'gpt';

    /* Dòng họ Claude */
    if (m.includes('claude')) return 'claude';

    /* Bà con Gemini/Gemma (Bọn model nhà Google toàn xài máy thái chữ của Gemma) */
    if (m.includes('gemini') || m.includes('gemma') || m.includes('palm')) return 'gemini';

    /* Hang ổ Llama: llama, mistral, mixtral, qwen, deepseek, yi, command-r, command-a, nemo, pixtral, jamba */
    if (m.includes('llama') || m.includes('mistral') || m.includes('mixtral') || m.includes('qwen') || m.includes('deepseek') || m.includes('command-r') || m.includes('command-a') || m.includes('yi-') || m.includes('nemo') || m.includes('pixtral') || m.includes('jamba')) return 'llama';

    /* Dòng dõi NovelAI */
    if (m.includes('kayra') || m.includes('clio') || m.includes('erato')) return 'novelai';

    /* Mù tịt, nhả lại cái tên gốc làm mác (So chính xác từng chữ cũng được) */
    return m;
}

/* Xem thử 2 cái Model có cùng chung dòng họ không (Xài chung máy thái chữ)
   Chỉ cần extractModelFamily phán là cùng họ thì chốt là true
   @param {string} modelA Tên Model A (Móc từ body của request)
   @param {string} modelB Tên Model B (Bóc từ API chính của ST)
   @returns {boolean} Cùng họ hay không */
function isSameModelFamily(modelA, modelB) {
    if (!modelA || modelA === '未知模型' || !modelB) return true; /* Bí quá không phán được thì cứ mặc định là tương thích */
    return extractModelFamily(modelA) === extractModelFamily(modelB);
}

/* Kêu máy thái chữ xịn của ST cọc cạch đếm số Token cho từng tin nhắn (Bất đồng bộ)
   Ưu tiên moi hàm getTokenCountAsync từ ST context ra xài, tịt thì đành tự đếm byte ước lượng
   Đếm từng cái một, xong thì nhét thẳng số token vào cục tin nhắn luôn
   @param {Array} messages Bầy tin nhắn, mỗi tin phải có cái mỏ content
   @param {string} modelName Tên model rạch từ request ra, dùng để đọ với model của API chính xem máy thái chữ có hợp gu không */
async function computeTokensForMessages(messages, modelName) {
    const ctx = window.SillyTavern && typeof window.SillyTavern.getContext === 'function'
        ? window.SillyTavern.getContext()
        : null;
    const getTokenCountAsync = ctx && ctx.getTokenCountAsync;

    if (!getTokenCountAsync) {
        /* Phế võ công: ST context tịt ngòi, xài trò đếm byte ước lượng cho giống ST (BYTES_PER_TOKEN = 3.35) */
        const textEncoder = new TextEncoder();
        for (const msg of messages) {
            const byteLength = textEncoder.encode(msg.content).length;
            msg.tokens = Math.ceil(byteLength / 3.35);
            msg.tokenPrecise = false; /* Treo biển hàng ước lượng, UI sẽ đính thêm dấu ~ */
        }
        return;
    }

    /* Mò tên model hiện tại của API chính ST, so với model của request xem máy thái chữ có hợp nhãn không */
    let stModelName = '';
    try {
        if (ctx && typeof ctx.getChatCompletionModel === 'function') {
            stModelName = ctx.getChatCompletionModel();
        }
    } catch (e) { /* Kệ xác nó */ }

    /* Đọ theo dòng họ (Chứ không đọ y nguyên cái tên): Cùng họ là xài chung máy thái chữ, không cần treo dấu ~ nữa */
    const tokenizerCompatible = isSameModelFamily(modelName, stModelName);

    /* Cầm máy thái chữ xịn của ST thái cẩn thận từng tin nhắn (Gọi từng phát một, ST nó có bài cache nội bộ rồi) */
    for (const msg of messages) {
        try {
            msg.tokens = await getTokenCountAsync(msg.content, 0);
            msg.tokenPrecise = tokenizerCompatible; /* Model phải môn đăng hộ đối thì mới dám dán mác chuẩn xác */
        } catch (e) {
            /* Máy thái gãy dao thì lôi trò đếm byte ra xài đỡ */
            const byteLength = new TextEncoder().encode(msg.content).length;
            msg.tokens = Math.ceil(byteLength / 3.35);
            msg.tokenPrecise = false;
        }
    }
}

/* Lục lọi tên Model từ trong xác request body của AI
   Mỗi cái API nó vứt tên model ở một góc khác nhau, phải bới theo thứ tự ưu tiên
   @param {object} body Cái cục JSON body đã bị giải phẫu
   @returns {string} Tên model, kiếm không ra thì phán '未知模型' (Model vô danh) */
function extractModelName(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return '未知模型';

    /* 1. Moi thẳng từ mặt tiền (OpenAI và lũ tương thích đa phần để đây) */
    if (typeof body.model === 'string' && body.model) return body.model;

    /* 2. Style của Gemini: generationConfig.model */
    if (body.generationConfig && typeof body.generationConfig.model === 'string' && body.generationConfig.model) {
        return body.generationConfig.model;
    }

    /* 3. Đánh lụi vào mấy cái key phổ biến khác ngoài mặt tiền */
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

/* Dựa vào tổng token mà xếp hạng từ 0-7
   @param {number} tokens Tổng số token
   @returns {number} Hạng từ 0-7 */
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

/* Xẻo khúc đầu của tin nhắn làm text xem trước (Dán vô kế bên tên nhân vật)
   Bê nguyên vẹn chữ nghĩa (Ôm luôn mấy cái tag XML), lấy cho bằng hết dù có lố hàng, cố nhét càng nhiều chữ vào preview càng tốt.
   Dấu xuống dòng thì biến thành khoảng trắng (Nhờ quả CSS white-space: nowrap nên nó xếp thành một hàng tuốt tuồn tuột).
   JS sẽ chém gọn phần còn lại từ ký tự 200 cho an toàn, còn trên UI thì CSS sẽ căn theo chiều rộng mà rải ba chấm tự động.
   @param {string} content Nguyên cái nội dung chà bá của tin nhắn
   @returns {string} Text xem trước, lỡ rỗng thì quăng về chuỗi rỗng */
function getContentPreview(content) {
    if (!content || typeof content !== 'string') return '';
    /* Phù phép biến dấu xuống dòng thành khoảng trắng, xong gọt 2 đầu */
    const collapsed = content.replace(/\n/g, ' ').trim();
    if (!collapsed) return '';
    /* Chém đầu từ ký tự 200 làm chốt an toàn, CSS tự biết đường bồi thêm ba chấm tùy độ rộng */
    return collapsed.length > 200 ? collapsed.slice(0, 200) + '…' : collapsed;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/* ── Check cấu trúc AI body ───────────────────── */

/* Chân tướng của Object tin nhắn nội bộ ST — Dùng để vạch mặt mấy cái request mạng không phải của AI
   Object gửi cho AI hàng Auth: { role, content }
   Object do ST ngâm trong ruột: { chat_metadata, mes, swipe_id, send_date, is_user, is_system, ... } */
const ST_INTERNAL_MSG_KEYS = new Set([
    'chat_metadata', 'mes', 'swipe_id', 'send_date', 'is_user', 'is_system',
    'extra', 'gen_id', 'gen_start', 'gen_finished', 'swipes', 'swipe_info',
    'fork', 'fork_id', 'ch_name', 'file_name', 'integrity', 'note_prompt',
    'note_interval', 'note_position', 'note_depth', 'note_role',
    'timedWorldInfo', 'LWB_PENDING_VAREVENT_BLOCKS',
]);

/* Soi URL của fetch input. */
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

function hasGenerationRequestHints(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
    return Object.keys(body).some(k => AI_GENERATION_BODY_KEYS.has(k));
}

/* Áp dụng luật thép để check một Object có chuẩn là tin nhắn AI không.
   Ở đây cố tình chỉ tiếp nhận mỗi role + content, chặn cửa mấy cái log chat nội bộ ST, thẻ nhân vật hay đống data tải lên hệ thống để không bị nhận vơ thành request AI. */
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

/* Chẩn bệnh xem request body có đúng là request gửi API đẻ chữ của AI không.
   Chủ yếu là mổ xẻ cấu trúc, lấy URL với tham số generation làm công cụ phụ trợ để bóc tách mấy cái API nội bộ của ST lúc load giao diện/bay vào phòng chat.
   
   Tối ưu: Múa từ chiêu rẻ rúng nhất tới đắt đỏ nhất ——
   1. Check type cơ bản (Xài chùa)
   2. Loại URL bị cấm (Check chuỗi mộc)
   3. Soi key mặt tiền (hasGenerationRequestHints + generationUrl)
   4. Bươi mảng + chọc từng phần tử (Hao mana nhất, chỉ tung chiêu khi đặc điểm mặt tiền đã khớp) */
function isAiRequestBody(body, requestUrl) {
    /* Món rẻ rề 1: Type cơ bản */
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;

    /* Món rẻ rề 2: Chặn thẳng cổ URL (Chỉ rà chuỗi, khỏi lội mảng) */
    if (isExplicitNonGenerationUrl(requestUrl)) return false;

    /* Món rẻ rề 3: Quét đặc điểm mặt tiền — Chỉ rà mấy cái key của body thôi */
    const generationUrl = isPotentialGenerationUrl(requestUrl);
    const hasHints = hasGenerationRequestHints(body);

    /* Nếu URL không giống đi đẻ chữ mà đặc điểm generation cũng vắng bóng, thêm cái mặt tiền chả có mống messages/chat/contents/system+prompt nào, */
    /* thì sút thẳng cổ, khỏi phải banh mảng ra săm soi từng tí một chi cho mệt */
    if (!generationUrl && !hasHints) {
        /* Ngó nhanh xem mặt tiền có rớt cái mảng nào chứa tin nhắn không */
        const hasMessagesArray = Array.isArray(body.messages) && body.messages.length > 0;
        const hasChatArray = Array.isArray(body.chat) && body.chat.length > 0;
        const hasContentsArray = Array.isArray(body.contents) && body.contents.length > 0;
        const hasSystemPrompt = typeof body.system === 'string' && body.system.length > 0;
        const hasPlainPrompt = typeof body.prompt === 'string' && body.prompt.length > 0;

        /* Mặt tiền trống hoác, chả có gì chứa tin nhắn, lượn liền */
        if (!hasMessagesArray && !hasChatArray && !hasContentsArray && !hasSystemPrompt && !hasPlainPrompt) {
            return false;
        }

        /* Lỡ có prompt nhưng tịt ngòi generationUrl/hasHints, thì chắc là mớm text thuần (Text Completion) */
        if (hasPlainPrompt && !hasMessagesArray && !hasChatArray && !hasContentsArray && !hasSystemPrompt) {
            /* Duyệt cho Text Completion đi qua (Xuống parseFetchRequestBody sẽ chăm sóc ẻm) */
            return true;
        }

        /* Trường hợp khác: Có mảng nhưng lại tịt đặc điểm đẻ chữ, chẩn đoán 99% là ST load data nội bộ, té */
        return false;
    }

    /* Món hao mana: Chỉ xài khi mặt tiền đã khớp, bắt đầu bươi mảng săm soi từng đứa */
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

/* ── Nhận diện nguồn request ───────────────────────── */

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
        { selector: '.swipe_right, .mes_swipe_right, [data-action="swipe-right"], [title="Swipe right"]', label: 'Tạo reply phương án 2 (Swipe)' },
    ];

    /* ── Chống mù: Thu thập phốt click gần đây (Tối đa 30 phốt) ── */
    const recentClicks = [];
    const MAX_CLICK_LOG = 30;
    function logClick(action, detail) {
        recentClicks.push({ ts: Date.now(), action, detail });
        if (recentClicks.length > MAX_CLICK_LOG) recentClicks.shift();
    }

    const onNativeClickIntent = (e) => {
        const targetEl = e.target instanceof Element ? e.target : null;
        if (!targetEl) return;

        /* ── Sàng lọc khu vực sương sương: Chỉ săm soi trong khu vực chat, bơ đi mấy vùng râu ria như menu/cài đặt ── */
        /* #sheld là sào huyệt chính của ST, ôm cả giao diện chat lẫn thanh công cụ dưới đáy */
        const chatZone = document.getElementById('sheld') || document.getElementById('chat') || document.getElementById('send_form');
        if (chatZone && !chatZone.contains(targetEl)) {
            return;
        }

        /* Hộp đen: Đánh dấu event mỗi lần tóm, thộp luôn tag/id/class với tình trạng match */
        const tagId = targetEl.tagName + (targetEl.id ? '#' + targetEl.id : '') + (targetEl.className && typeof targetEl.className === 'string' ? '.' + targetEl.className.split(' ').slice(0, 3).join('.') : '');
        let matched = null;

        for (const item of nativeTargets) {
            if (targetEl.closest(item.selector)) {
                matched = item;
                break;
            }
        }

        if (matched) {
            logClick('NATIVE_MATCH', `${matched.label} via ${e.type} on ${tagId}`);
            rememberNativeIntent(matched.label, e.type === 'pointerdown' ? 'pointerdown' : 'click');
        } else {
            /* Hộp đen: Ghi lại mấy cú click trật lất nhưng lờ mờ liên quan (Như mấy cục có chứa keyword mes_, swipe, regenerate...) */
            const cls = (typeof targetEl.className === 'string' ? targetEl.className : '') + ' ' + (targetEl.getAttribute('title') || '') + ' ' + (targetEl.getAttribute('data-action') || '');
            const hints = ['mes_swipe', 'regenerate', 'swipe', 'mes_continue', 'impersonate', 'send_but'];
            if (hints.some(h => cls.toLowerCase().indexOf(h) !== -1 || tagId.toLowerCase().indexOf(h) !== -1)) {
                logClick('NATIVE_MISS', `Trật lất nhưng có từ khóa: ${tagId} cls="${cls.slice(0, 100)}"`);
            }
        }
    };

    document.addEventListener('pointerdown', onNativeClickIntent, true);
    document.addEventListener('click', onNativeClickIntent, true);

    /* Mấy cú vuốt Swipe / Tạo lại đôi khi không chịu đi ngõ pointerdown/click, đành gài thêm GENERATION_STARTED làm ngõ hậu */
    if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
        const stCtx = window.SillyTavern.getContext();
        if (stCtx && stCtx.eventSource && stCtx.event_types) {
            const onGenStarted = (type) => {
                const typeStr = String(type != null ? type : '');
                logClick('GEN_STARTED', `type=${typeStr}`);
                /* Chỉ khi DOM click bị mù, mới nhờ vả GEN_STARTED gắn cờ bổ sung */
                /* Dành cho mấy event native rành rành như Swipe / Tạo lại. */
                /* normal/quiet thường là đám plugin hoặc thế lực vô hình kích hoạt, chặn cửa luôn. */
                if (!lastNativeIntent || (Date.now() - lastNativeIntent.timestamp) > NATIVE_INTENT_WINDOW_MS) {
                    if (typeStr === 'impersonate') {
                        rememberNativeIntent('Đóng vai (Event ST)', 'generationStarted');
                    } else if (typeStr === 'continue') {
                        rememberNativeIntent('Tiếp tục (Event ST)', 'generationStarted');
                    } else if (typeStr === 'regenerate') {
                        rememberNativeIntent('Tạo lại (Event ST)', 'generationStarted');
                    } else if (typeStr === 'swipe') {
                        rememberNativeIntent('Tạo reply phương án 2 (Event ST)', 'generationStarted');
                    }
                    /* send / quiet / normal / Tạp nham — Khỏi gắn cờ, lỡ chém nhầm plugin */
                }
            };
            try {
                stCtx.eventSource.on(stCtx.event_types.GENERATION_STARTED, onGenStarted);
                logClick('SETUP', 'Đã gài hàng GENERATION_STARTED (Phương án ngõ hậu)');
            } catch (err) {
                logClick('SETUP_ERR', 'Gài GENERATION_STARTED tịt ngòi: ' + String(err));
            }
        } else {
            logClick('SETUP', 'ST context đang ốm, khỏi gài GENERATION_STARTED');
        }
    }

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        if (e.isComposing || e.keyCode === 229) return;
        if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;

        const targetEl = e.target;
        if (!(targetEl instanceof HTMLTextAreaElement)) return;
        if (targetEl.id !== 'send_textarea') return;

        logClick('NATIVE_ENTER', 'Gõ Enter ở khung text');
        rememberNativeIntent('Enter khung text', 'keydown');
    }, true);

    /* Phơi mặt interface hộp đen ra window cho dễ soi */
    window.__rlogDebug = {
        getRecentClicks: () => recentClicks.slice(),
        getLastNativeIntent: () => lastNativeIntent,
        getRecords: () => records,
        dumpClicks: () => {
            console.table(recentClicks.map(c => ({ time: new Date(c.ts).toISOString().slice(11, 23), ...c })));
            return recentClicks;
        },
    };

    console.debug(`[${PLUGIN_KEY}] Nhận diện nguồn request đã lên nòng (Lắng nghe ST native + Ngõ hậu GENERATION_STARTED). Đồ chơi soi bug: window.__rlogDebug`);
}

function inferRequestSource() {
    const now = Date.now();
    if (lastNativeIntent && (now - lastNativeIntent.timestamp) <= NATIVE_INTENT_WINDOW_MS) {
        /* Khoan vội xé vé native, lỡ có request ảo bay ra xen ngang lúc đang Tạo lại/Swipe thì cờ native bị cướp mất oan. */
        /* Cứ để hết cửa sổ thời gian thì cờ tự rụng bên dưới. */
        return {
            type: 'native',
            label: getSourceLabel({ type: 'native' }),
            detail: `Request Native-${lastNativeIntent.target}`,
        };
    }

    /* Đóng cửa sổ là tịch thu cờ native liền */
    if (lastNativeIntent && (now - lastNativeIntent.timestamp) > NATIVE_INTENT_WINDOW_MS) {
        lastNativeIntent = null;
    }

    return {
        type: 'plugin',
        label: getSourceLabel({ type: 'plugin' }),
        detail: 'Request Plugin/Không phải Native',
    };
}

function getSourceLabel(source) {
    if (source && source.type === 'native') return 'Gốc (Native)';
    return 'Plugin';
}

function getSourceClass(source) {
    if (source && source.type === 'native') return 'rlog-source-native';
    return 'rlog-source-plugin';
}

/* ── Đánh chặn Fetch ───────────────────── */

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
    return 'Nhân vật vô danh';
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

/* Rã xác request body của đủ loại API AI, bòn rút mảng tin nhắn gom về một mối
   Tạch (return null) thì cứ im ru cho qua, khỏi đẻ log làm gì */
function parseFetchRequestBody(json) {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return null;

    const messages = [];

    /* 1. Đội OpenAI / Phái tương thích — Bày sẵn mảng messages */
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
                    tokens: 0, /* Số token thì đẩy ra ngoài cho computeTokensForMessages lo đếm bất đồng bộ sau */
                    collapsed: true,
                });
            }
        }
    }

    /* 2. Đội mảng chat — Data sự kiện ruột của ST (Thi thoảng bị thằng fetch chộp được) */
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
                    tokens: 0, /* Chờ computeTokensForMessages đếm bất đồng bộ */
                    collapsed: true,
                });
            }
        }
    }

    /* 3. Phái Google Gemini */
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
                    tokens: 0, /* Chờ computeTokensForMessages đếm bất đồng bộ */
                    collapsed: true,
                });
            }
        }
    }

    /* 4. Môn đồ Anthropic */
    if (messages.length === 0 && typeof json.system === 'string' && Array.isArray(json.messages)) {
        if (json.system) {
            messages.push({
                role: 'system',
                content: json.system,
                tokens: 0, /* Chờ computeTokensForMessages đếm bất đồng bộ */
                collapsed: true,
            });
        }
        for (const m of json.messages) {
            if (!isAiMessageObject(m)) continue;
            if (typeof m.content === 'string' && m.content) {
                messages.push({
                    role: normalizeRole(m.role),
                    content: m.content,
                    tokens: 0, /* Chờ computeTokensForMessages đếm bất đồng bộ */
                    collapsed: true,
                });
            }
        }
    }

    /* 5. Mớm chữ thuần túy (Text Completion) */
    if (messages.length === 0 && typeof json.prompt === 'string' && json.prompt.length > 0) {
        messages.push({
            role: 'user',
            content: json.prompt,
            tokens: 0, /* Chờ computeTokensForMessages đếm bất đồng bộ */
            collapsed: false,
        });
    }

    if (messages.length === 0) return null;
    return messages;
}

/* Xử lý ngầm body của AI request đã tóm được: Rã tin nhắn, đếm token, tống vào kho log.
   Ông kẹ này hoàn toàn độc lập với việc bắn fetch request, chả cản đường thằng originalFetch miếng nào.
   @param {object} body Cái json body đã lột xác
   @param {string} requestUrl Cái URL của request */
async function processCapturedBody(body, requestUrl, captureId) {
    /* Màng lọc khắt khe: Bỏ qua đống API dỏm như load ST/đổi khung chat, vớt đúng mẻ request đẻ text thôi */
    if (!body || !isAiRequestBody(body, requestUrl)) return;

    const messages = parseFetchRequestBody(body);
    if (!messages) return;

    const characterName = getCurrentCharacterName();
    const source = inferRequestSource();
    const modelName = extractModelName(body); /* Bới móc tên model từ trong body */
    /* Lôi máy thái thịt của ST ra đo lượng token chuẩn cho từng tin nhắn ở hậu trường */
    /* Chọi cái modelName vào để so kè với API của ST xem máy thái có hợp không */
    await computeTokensForMessages(messages, modelName);
    /* Gài cái captureId vô để lát nữa lôi được chính xác cọng reply gắn vào đúng log này */
    addRecord(characterName, messages, source, modelName, body, captureId); /* Tuồn luôn cục body thô vô để "Xem toàn văn" xài định dạng thô */
}

function installFetchHook() {
    if (currentHook) return; /* Lắp rồi khỏi lắp nữa */

    originalFetch = window.fetch;
    currentHook = async function hookedFetch(input, init) {
        /* ── Lối tắt 0: Giáp chống phản đòn (Re-entrancy) ── */
        /* Nhỡ có plugin nào khác cũng cướp cò fetch tạo ra nguyên cái đu quay vòng tròn dội lại cục hook này, */
        /* thì bơ đi, đá thẳng cho originalFetch chạy, không bu vào hố đen. */
        if (fetchHookInFlight) {
            return originalFetch.apply(window, [input, init]);
        }

        /* ── Lối tắt 1: Cúp cầu dao thì xả trạm, không thèm soi body luôn ── */
        if (!masterEnabled) {
            return originalFetch.apply(window, [input, init]);
        }

        /* ── Lối tắt 2: Không phải POST/PUT/PATCH thì lướt ── */
        let method = init && init.method ? init.method.toUpperCase() : 'GET';
        if (input instanceof Request && method === 'GET') {
            try { method = input.method.toUpperCase(); } catch (e) { /* ignore */ }
        }
        if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') {
            return originalFetch.apply(window, [input, init]);
        }

        /* ── Lối tắt 3: Nhìn URL là biết chắc đíu phải điểm nhả chữ của AI, lướt luôn (Khỏi rã body cho đỡ mệt) ── */
        const requestUrl = getFetchRequestUrl(input);
        const path = getUrlPathForMatch(requestUrl);
        if (path && !pathMatchesAny(path, AI_GENERATION_PATH_PATTERNS)
            && (path.startsWith('/api/') || path.startsWith('/assets/') || path.startsWith('/backgrounds/'))) {
            return originalFetch.apply(window, [input, init]);
        }

        /* ── Bật khiên bảo kê lúc bú body đồng bộ, khóa lại trong tíc tắc thôi ── */
        /* Bên trong khóa chỉ lượm lặt init.body (Parse JSON hoặc lấy nguyên cái vỏ), tuyệt đối không đụng I/O hay await. */
        /* Nhỡ init.body tịt ngòi, phải đi lấy body bất đồng bộ từ Request —— */
        /* Đề máy phát là tháo khiên chạy lẹ, để originalFetch kịp lăn bánh ngoài khóa. */
        fetchHookInFlight = true;
        /* object|null: Body múc được từ init.body chạy đồng bộ (Khỏi xài đồ bất đồng bộ) */
        let syncBody = null;
        /* Promise<object|null>|null: Kèo móc body bất đồng bộ từ Request.clone() */
        let asyncBodyPromise = null;
        try {
            if (init && init.body) {
                if (typeof init.body === 'string') {
                    try { syncBody = JSON.parse(init.body); } catch (e) { syncBody = null; }
                } else if (typeof init.body === 'object' && !Array.isArray(init.body)) {
                    /* Chôm thẳng (Khỏi clone, vì processCapturedBody chỉ hóng hớt chứ không làm hỏng) */
                    syncBody = init.body;
                }
            }

            if (!syncBody && input instanceof Request) {
                try {
                    const clonedReq = input.clone();
                    /* Khởi động máy rút body bất đồng bộ, nhả hàng ở ngoài khóa */
                    asyncBodyPromise = clonedReq.text().then(text => {
                        if (text) {
                            try { return JSON.parse(text); } catch (e) { return null; }
                        }
                        return null;
                    }).catch(() => null);
                } catch (e) {
                    /* Copy hụt (Chắc body bị nuốt rồi), bơ đi */
                }
            }
        } finally {
            fetchHookInFlight = false;
            /* Tháo khiên — originalFetch tha hồ tung hoành */
        }

        /* ── Kêu gọi cụ tổ fetch (Đứng ngoài khóa, thúc cho bay ra mạng càng sớm càng tốt) ── */
        /* Ép gọi qua cụ tổ, cấm táy máy window.fetch kẻo tự cắn đuôi mình */
        const fetchPromise = originalFetch.apply(window, [input, init]);

        /* ── Bê body ra sau hè xử lý bất đồng bộ (Chả bận tâm fetch có về hay chưa) ── */
        if (syncBody || asyncBodyPromise) {
            /* Mã vạch cho phi vụ này: Gắn reply hay dọn dẹp đều tra theo nó */
            const captureId = ++captureSeq;
            /* Nhét thêm radar theo dõi vào cái fetchPromise vừa trả về (Chuẩn 1-1, mạng lag cũng không bị chéo luồng) */
            captureResponseForRequest(fetchPromise, requestUrl, captureId);
            if (syncBody) {
                /* Bắt được cục đồng bộ rồi, ném cho xử lý luôn */
                processCapturedBody(syncBody, requestUrl, captureId).catch(() => { /* Ngậm miệng ăn tiền */ });
            } else if (asyncBodyPromise) {
                /* Đang kẹt cái còng bất đồng bộ, đợi nó bung ra rồi mới xử */
                asyncBodyPromise.then(body => {
                    if (body) {
                        return processCapturedBody(body, requestUrl, captureId);
                    }
                }).catch(() => { /* Ngậm miệng ăn tiền */ });
            }
        }

        return fetchPromise;
    };
    window.fetch = currentHook;

    console.debug(`[${PLUGIN_KEY}] Lưới giăng fetch đã căng (Kiểu chặn họng từ tầng mạng)`);
}

/* ── Theo dõi & Phân tích reply ──────────────────────── */

/* Thời hạn cắt cầu reply đang chạy (Bị debug can thiệp thì lấy mức mới, không thì 5 phút mặc định)
   @returns {number} */
function getReplyTimeoutMs() {
    return replyTimeoutOverrideMs != null ? replyTimeoutOverrideMs : REPLY_TIMEOUT_MS;
}

/* Chữ nhãn trạng thái (Tiếng Anh, In hoa chữ đầu)
   @param {string} status 'succeed' | 'fail' | 'timeout'
   @returns {string} */
function getReplyStatusLabel(status) {
    if (status === 'fail') return 'Fail';
    if (status === 'timeout') return 'Timeout';
    return 'Succeed';
}

/* Chỗ chứa chiều rộng (px) của nhãn trạng thái: Được getReplyStatusMaxWidth đo đúng một lần, đem xài ké cho cả lúc ngâm dấm lẫn lúc dán mác */
let replyStatusMaxWidth = null;

/* Vác thước ra đo bề rộng cực đại (px) của 3 cái chữ trạng thái đắp lên font của Panel.
   Nhái style của .rlog-reply-status đắp lên thẻ giả tàng hình vứt ra rìa body để đo đạc,
   Kết quả dọng thẳng vào biến CSS của panel --rlog-status-w (Được renderPanelContent rinh ra xài),
   Để lúc giữ chỗ đợi tới lúc cái nhãn rớt xuống thì độ rộng chả sứt mẻ li nào, đỡ phải giật lùi giao diện.
   Cái thẻ dò mìn này bám vô body, xài ké y nguyên font chữ Panel, Panel có tịt ngòi tàng hình (.rlog-panel-body display:none) vẫn rà ra size thật;
   Chỉ khi nào body xịt (như display:none) đo ra số 0 thì trả về 0 (Chỗ giữ chỗ sẽ teo lại mất hút),
   Và chỉ lưu số vô sổ khi đo ra số > 0, tránh bị kẹt 0 vĩnh viễn lúc xui rủi.
   @returns {number} */
function getReplyStatusMaxWidth() {
    if (replyStatusMaxWidth !== null) return replyStatusMaxWidth;
    /* Font Panel với document.body coi chừng lệch nhau (Lệch vài px là có), ép cái thẻ dò xài y font Panel; */
    /* Ném vào body đo: Panel dẹp lép hay tàng hình (display:none) vẫn vớt được số size chuẩn */
    if (!panelEl || !panelEl.isConnected) return 0;
    const probe = document.createElement('span');
    probe.className = 'rlog-reply-status';
    probe.style.fontFamily = getComputedStyle(panelEl).fontFamily;
    probe.style.position = 'fixed';
    probe.style.left = '-9999px';
    probe.style.top = '0';
    probe.style.visibility = 'hidden';
    probe.style.display = 'inline-flex';
    probe.style.minWidth = '0px'; /* Bức tử lệnh var() trong class, triệt tiêu đụng hàng lúc rà size */
    probe.style.pointerEvents = 'none';
    probe.style.whiteSpace = 'nowrap';
    let max = 0;
    for (const status of ['succeed', 'fail', 'timeout']) {
        probe.textContent = getReplyStatusLabel(status);
        document.body.appendChild(probe);
        max = Math.max(max, probe.offsetWidth);
        probe.remove();
    }
    /* Số lớn hơn 0 mới hốt vô bộ nhớ: Đề phòng body tịt ngòi nhả ra số 0, bộ nhớ gặm số 0 là đi đứt chỗ giữ chỗ luôn */
    if (max > 0) replyStatusMaxWidth = max;
    return max;
}

/* Tooltip nổi lên lúc rê chuột vô trạng thái: Tình trạng + Nguyên cớ + Giờ chót
   Tình trạng đã in lù lù trên nhãn rồi, không ca lại nữa; Chỉ mớm cái nguyên cớ biến thiên + Giờ giấc thôi.
   Succeed (Thành công) thì chả có cớ gì đặc biệt, đóng chốt luôn dòng Succeed.
   @param {object} record Bê nguyên log có ôm record.reply vào đây
   @returns {string} */
function getReplyStatusTitle(record) {
    const reply = record && record.reply;
    if (!reply) return '';
    let reason;
    if (reply.status === 'succeed') {
        reason = 'Succeed'; /* Ngon lành thì khỏi châm biếm, fix cứng chữ */
    } else {
        reason = reply.failReason || getReplyStatusLabel(reply.status);
        if (reason === 'timeout') reason = 'Timeout'; /* Bị timeout thì nguyên cớ với trạng thái là một, xài chung kiểu viết hoa viết thường cho khớp nhãn */
    }
    return `${reason} · ${reply.time || ''}`;
}

/* Trộn gỏi reply trước khi dọn ra dĩa: Đám xám ngoét suy nghĩ thì tọng vô `<think>...</think>`, chừa một dòng rồi tống đám text xịn vào (Text xịn thì khỏi rào dậu).
   Nếu chỉ có suy nghĩ hay chỉ có text xịn thì dọn mỗi món đó ra thôi.
   @param {object} replyData { reasoning, content }
   @returns {string} */
function buildReplyContent(replyData) {
    const reasoning = (replyData.reasoning || '').trim();
    const content = (replyData.content || '').trim();
    const parts = [];
    if (reasoning) parts.push(`<think>\n${reasoning}\n</think>`);
    if (content) parts.push(content);
    return parts.join('\n\n');
}

/* Đút thêm thịt/não vào khu tích cóp.
   Nhập gia tùy tục, "Trích nhồi" (OpenAI/Anthropic, nhả từng miếng) hay "Gôm nguyên đống" (Gemini...,
   cục mới vác theo y nguyên đống chữ cũ): Thấy cục mới là tiền bối của đống cũ mà bự hơn → Thay máu; Ngược lại thì nện thêm vào.
   Nếu cục mới y chang cục cũ (Trùng độ dài) thì coi như chả có mống nào, bơ.
   @param {object} entry Thằng khách đang ở trong pendingReplies
   @param {string} text Thịt/não nhồi thêm
   @param {boolean} isReasoning Bật true nếu đó là chất xám (reasoning/thinking/thought) */
function appendReplyText(entry, text, isReasoning) {
    if (!text) return;
    const key = isReasoning ? 'reasoning' : 'content';
    const acc = entry[key] || '';
    if (!acc) {
        entry[key] = text; /* Khai mạc thì đổ đống vào */
        return;
    }
    if (text.startsWith(acc) && text.length > acc.length) {
        entry[key] = text; /* Xài đồ Gemini (Gôm nguyên đống): Hất cẳng đồ cũ */
    } else if (!text.startsWith(acc)) {
        entry[key] = acc + text; /* Hàng nhồi (Trích nhồi): Tọng thêm vào đuôi */
    }
    /* text === acc (Bằng chằn chặn) coi như nhồi nước, vứt */
}

/* Chích thịt/não ra từ một mẩu JSON cụt.
   Chơi láng phái OpenAI (Rơi rớt delta / ôm cả cục message / text + reasoning_content/reasoning),
   Anthropic (delta.text / delta.thinking / mảng content),
   Gemini (candidates[0].content.parts, thought thì quy vào kho não).
   @param {object} chunk Khúc data cắn từ response
   @param {number} captureId */
function extractReplyFromChunk(chunk, captureId) {
    const entry = pendingReplies.get(captureId);
    if (!entry || entry.finished) return;
    if (!chunk || typeof chunk !== 'object') return;

    /* Ôm nhánh OpenAI (Nhỏ giọt delta / Cục bự message / text) */
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

    /* Tia nhánh Anthropic nhỏ giọt (delta.thinking / delta.text) */
    if (chunk.delta && typeof chunk.delta === 'object') {
        if (typeof chunk.delta.thinking === 'string') appendReplyText(entry, chunk.delta.thinking, true);
        if (typeof chunk.delta.text === 'string') appendReplyText(entry, chunk.delta.text, false);
        return;
    }

    /* Mỏ Gemini (candidates[0].content.parts) */
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

    /* Nhánh Anthropic quăng cục (Mảng content) */
    if (Array.isArray(chunk.content)) {
        for (const part of chunk.content) {
            if (!part || typeof part !== 'object') continue;
            if (part.type === 'text' && typeof part.text === 'string') appendReplyText(entry, part.text, false);
            if (part.type === 'thinking' && typeof part.thinking === 'string') appendReplyText(entry, part.thinking, true);
        }
    }
}

/* Xé mảng SSE text (Toàn sọc rỗng chắn ngang), thọt thịt từ từng mẩu một.
   Bú hết mẻ `data:`, chốt chặn `[DONE]` với đám lỗi kẹp trong event.
   @param {string} text SSE Text
   @param {number} captureId */
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

/* Múc response body lên nhấm nháp (Cóc cần quan tâm Content-Type là cái giống gì):
   - Ngó thấy dòng `data:` phát là gồng SSE lên rã thịt ngay (Chống lưng cho bọn proxy khoái đội lốt application/json lên đầu SSE);
   - Éo thấy tăm hơi SSE thì húp cạn dòng rồi đem JSON (Hoặc text thuần) ra ngâm cứu;
   - Đứt gánh giữa đường thì SSE vẫn kịp ém đống chữ đã rã (Có cả não thừa), JSON thì móm.
   Thứ đưa lên mâm là bản clone của response, ST hay plugin khác cứ việc chén bản gốc.
   @param {Response} clone Bản response.clone()
   @param {number} captureId
   @param {string|null} hintMode 'sse' (Content-Type oang oang báo text/event-stream) hoặc null (Tự ngửi mùi) */
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
    let mode = hintMode; /* null=Đéo biết, 'sse', 'json' */

    function finalizeDone() {
        const cur = pendingReplies.get(captureId);
        if (!cur || cur.finished) return;
        if (mode === 'sse') {
            /* Xử vụ mẩu cuối thiếu dòng rỗng chốt hạ */
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
                    /* Chơi text chay: Quăng cả cục vào dạ dày text xịn */
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
            /* Chả biết mode gì thì đi đánh hơi: Thấy `data:` bốc mùi SSE ngay */
            if (!mode && /^data:|\ndata:/.test(buffer)) {
                mode = 'sse';
            }
            if (mode === 'sse') {
                const parts = buffer.split(/\r\n\r\n|\r\r|\n\n/);
                buffer = parts.pop();
                processSseText(parts.join('\n\n'), captureId);
                /* Lỡ nốt chunk lỗi nó cho thăng thiên rồi, dừng cuộc chơi */
                const after = pendingReplies.get(captureId);
                if (after && !after.finished) pump();
            } else {
                pump();
            }
        }).catch(() => {
            /* Vỡ ống / Bạo bệnh: SSE tranh thủ nuốt tàn dư (Não húp dở); JSON thì móp mỏ */
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

/* Khoét ruột cục JSON lỗi tìm cho ra dòng chửi rủa xịn (Bới theo những slot mà giang hồ hay vứt lỗi vào).
   @param {object} data Cục JSON lỗi đã lột xác
   @returns {string} Dòng chửi rủa moi được, không có thì nhả chuỗi rỗng */
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

/* Nai lưng ra húp body của mấy mẻ lỗi (Khác 2xx), đặng lòi ra lý do tạch thật (Tỉ như "Model mất tích").
   Body bú được mỗi một lần, nên đành chơi chiêu clone ra mà bú, chừa bản gốc cho ST/Đảng phái khác húp;
   Mọi thứ hỏng hóc (Clone xịt / Đứt ống / Rỗng tuếch / Đéo phải JSON / Bới đéo ra mớ lỗi) đều bị đạp về xài Status code baseReason.
   @param {Response} response Bản lỗi gốc (Không phải 2xx)
   @param {number} captureId
   @param {string} baseReason Cứu sinh bèo bọt (Vd `HTTP 500`) */
function readErrorResponseBody(response, captureId, baseReason) {
    let clone = null;
    try {
        /* Phải clone trong tíc tắc (Lúc ST chưa kịp thò mỏ vào), chậm chân là body bị xơi tái rồi clone ăn mìn */
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
    if (entry) entry.reader = reader; /* Ký gửi cho abortPendingReply xử trảm */
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
                done(); /* Bụng trương lên rồi: Moi từ mớ đã húp, kiếu húp thêm */
                return;
            }
            pump();
        }).catch(() => {
            finalizeReply(captureId, 'fail', baseReason);
        });
    }
    pump();
}

/* Đóng kịch cho một phi vụ AI vừa thộp được: Kẹp lén vô cái fetchPromise sắp phọt ra,
   Thề không táy máy vô cái Promise gốc; Húp bản clone tuyệt nhiên chả xước móng tay bản chính.
   @param {Promise<Response>} fetchPromise Bản Promise gốc từ fetch
   @param {string} requestUrl Cái đường link URL
   @param {number} captureId Mã vạch phi vụ */
function captureResponseForRequest(fetchPromise, requestUrl, captureId) {
    if (!isPotentialGenerationUrl(requestUrl)) return;

    /* Kho quá tải: Tiễn dong hồ sơ cũ rích nhất (Đá luôn cái reader theo), đặng đỡ trương phềnh RAM */
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

    /* Đồng hồ bom nổ: Cắm 5 phút chưa xong → Cúp điện quăng bảng Timeout (Chất xám moi được vứt lại) */
    entry.timer = setTimeout(() => {
        finalizeReply(captureId, 'timeout', 'timeout');
    }, getReplyTimeoutMs());

    fetchPromise.then(response => {
        try {
            if (!response || !response.ok) {
                if (response) {
                    /* Chệch 2xx: Vắt óc húp error body kiếm chửi rủa thật, không thì xách mông chạy về status code */
                    readErrorResponseBody(response, captureId, `HTTP ${response.status}`);
                } else {
                    finalizeReply(captureId, 'fail', 'no response');
                }
                return;
            }
            /* Phải clone trong tíc tắc (Lúc ST chưa kịp thò mỏ vào), chậm chân là body bị xơi tái rồi clone ăn mìn */
            const clone = response.clone();
            const contentType = (response.headers.get('content-type') || '').toLowerCase();
            /* Content-Type vứt cho cẩu xơi; Lôi trò húp tăng dần, ngửi mùi bằng text, */
            /* Kẻo vớ trúng thằng "proxy khoác áo application/json cho SSE" là đổ sông đổ biển */
            readResponseBody(clone, captureId, contentType.includes('text/event-stream') ? 'sse' : null);
        } catch (e) {
            finalizeReply(captureId, 'fail', 'response clone failed');
        }
    }, err => {
        /* Bệnh mạng / Bị đày (AbortError) */
        const reason = (err && err.name === 'AbortError') ? 'aborted' : 'network error';
        finalizeReply(captureId, 'fail', reason);
    });
}

/* Đóng hòm vụ reply: Ký giấy xong, thả reader, buộc lên log có sẵn;
   Log mà lặn mất tiêu thì neo tạm ở kho, đợi addRecord quăng ra bấu (Tre treo mõm 60s).
   @param {number} captureId
   @param {string} status 'succeed' | 'fail' | 'timeout'
   @param {string} failReason Lý do rớt đài/quá giờ */
function finalizeReply(captureId, status, failReason) {
    const entry = pendingReplies.get(captureId);
    if (!entry || entry.finished) return;
    entry.finished = true;
    clearTimeout(entry.timer);
    if (entry.reader) {
        try { Promise.resolve(entry.reader.cancel()).catch(() => { /* ignore */ }); } catch (e) { /* ignore */ }
    }

    /* Đầu xuôi mà đít lọt thỏm/tịt ngòi → Đánh rớt (Khúc não không gỡ được chiều dài) */
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
        /* Log biệt vô âm tín: Treo tạm đợi addRecord hứng, quá giờ thì quăng sọt rác */
        entry.expireTimer = setTimeout(() => {
            pendingReplies.delete(captureId);
        }, PENDING_REPLY_KEEP_MS);
    }
}

/* Xóa sổ mẻ cày reply giữa chừng: Quăng đồng hồ, thả reader, đá bay hồ sơ (Không đẻ thêm mác nào).
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

/* Móc và dọn dẹp cặn bã reply (Mồi cho addRecord ngoạm).
   Hàng chưa chín (chưa finished) thì dứt khoát không đưa, kẻo móc nhầm cái cục chưa xong lên log rỗng tuếch.
   @param {number} captureId
   @returns {object|null} */
function consumePendingReply(captureId) {
    const entry = pendingReplies.get(captureId);
    if (!entry || !entry.finished) return null;
    clearTimeout(entry.timer);
    clearTimeout(entry.expireTimer);
    pendingReplies.delete(captureId);
    return entry;
}

/* Khui log theo captureId: Nắm đầu từ bầy thường lẫn trại giam Hướng dẫn.
   @param {number} captureId
   @returns {object|null} */
function findRecordByCaptureId(captureId) {
    const found = records.find(r => r.id === captureId);
    if (found) return found;
    return tourPendingRecords.find(r => r.id === captureId) || null;
}

/* Gắn mớ data chốt sổ vào log (record.reply), xong lẳng lặng gọi đếm token sau rèm.
   Đứa mới cập bến thì cấm có đập nát list DOM xây lại: Tọng luôn bé Response vào chót log,
   Bảo bối đang cày dở (Con lăn, kéo dọc, ngắm nghía tìm kiếm) yên thân chả hề hấn gì.
   @param {object} record Log bị tóm
   @param {object} replyData Đống data đã vắt khô (Kho pendingReplies)
   @param {boolean} [skipRender=false] Nhét true vô là khỏi tọng (Log còn chưa vô DOM, thằng gọi hàm tự bế đi mà render) */
function attachReplyToRecord(record, replyData, skipRender = false) {
    if (!record || record.reply) return;
    /* Xịt/Bay màu thì xăm câu chửi lên chóp reply: Có hàng (như húp cạn nửa đường) thì chừa 1 dòng hẵng tọng; */
    /* Ruột trống trơn thì ị chửi thẳng vô. Điện thoại thì ếu có hover, nên cứ thả thẳng ruột để bấm rớt/copy/vọc bới còn biết đường ngó. */
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
    /* Điếm token ngầm cho sạch sẽ (Đếm xong thì quẹt con số lên chóp reply, khỏi làm phiền list) */
    computeTokensForMessages([record.reply], record.modelName || '').then(() => {
        updateReplyTokenInDom(record);
    }).catch(() => { /* Đơ đi */ });
    if (!skipRender) appendReplyToRecordDom(record);
}

/* Hàng cập bến: Tọng pé Response vào cái đít của cục log đó.
   Chỉ táy máy "Cái đít + Cục chớp chóp", tha cho mớ list khỏi bị đồ sát xây lại ——
   Đang xem say sưa thì cuộn chả bị tung, dòm ngó chả bị rớt, sục sạo chả bị bay.
   Bảng tàng hình / Log lơ lửng / Bị nhốt lúc Tour thì xăm cờ Dirty, lúc nào ngoi lên thì tự có đồ đút.
   @param {object} record Log bị tóm */
function appendReplyToRecordDom(record) {
    panelContentDirty = true;
    if (!panelEl || !isPanelVisible || tourActive) return;
    const listEl = panelEl.querySelector('#rlog-list');
    const recordEl = listEl ? listEl.querySelector(`.rlog-record[data-record-index="${records.indexOf(record)}"]`) : null;
    const bodyEl = recordEl ? recordEl.querySelector('.rlog-record-body') : null;
    if (!recordEl || !bodyEl) return;

    const idx = Number(recordEl.dataset.recordIndex);
    const replyMsgIdx = record.messages.length;
    /* Đề kháng: Trót tọng rồi thì dẹp (Phòng bệnh giật động kinh nhét hai lỗ) */
    if (bodyEl.querySelector(`.rmsg-item[data-record="${idx}"][data-msg="${replyMsgIdx}"]`)) return;

    bodyEl.insertAdjacentHTML('beforeend', buildMessageHtml(record.reply, idx, replyMsgIdx));
    const replyItemEl = bodyEl.querySelector(`.rmsg-item[data-record="${idx}"][data-msg="${replyMsgIdx}"]`);
    if (replyItemEl) bindMsgItemEvents(replyItemEl);

    /* Con dấu trên chóp (Chỉ khoe mẽ lúc ngậm miệng, ngoác mỏ ra là CSS bịt lại): Không thấy thì nặn, thấy thì bơm chữ mới */
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

/* Đếm token xong thì quệt lên chóp reply con số thôi, thả list bình yên vô sự.
   Log mà lặn mất tăm (Bảng xịt/Bị nhốt) thì mặc xác nó, lúc ló mặt ra render lại thì ngậm đúng số sẵn rồi.
   @param {object} record Log bị tóm */
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

/* Cài cắm móng vuốt (hook) chặn họng fetch
   Gói cái window.fetch lại thành một cục đơn giản. Vì loading_order của plugin này là 999 (xếp chót),
   nên lúc cài hook thì mớ hook của đám plugin khác đã chễm chệ hết rồi, originalFetch vớt được nguyên bộ sậu gọi dây chuyền ở dưới.
   
   Tối ưu: Mở luồng xanh (early return), khỏi mắc công request JSON POST nào cũng đè ra 
   mổ xẻ cấu trúc với quét isAiRequestBody sâu hoắm.
   1. Đéo phải POST/PUT/PATCH thì thả cho đi luôn
   2. Đường link (URL path) rành rành là của API nội bộ ST (/api/, /assets/, /backgrounds/) mà chả ăn nhập gì với đường link AI, thả luôn
   3. Qua ải lọt sàng rồi mới đè ra mổ body
   
   Luật khóa cửa (Quy tắc 5): fetchHookInFlight chỉ canh chừng khúc chộp body đồng bộ (húp init.body),
   khóa cực ngắn (tính bằng micro giây). originalFetch được kích hoạt ngay tắp lự sau khi tháo khóa,
   Việc chẻ chữ đếm token với addRecord được ném ra đằng sau chạy bất đồng bộ qua Promise, chả cản bước bánh xe mạng.
   Làm vầy để né cái vụ đắp mền await nặng nề trong khóa (nhất là quả computeTokensForMessages lôi máy thái chữ ra xẻ từng mẩu)
   làm kẹt xe originalFetch, phá banh chành định mức thời gian của đám plugin khác (tỉ như plugin trí nhớ). */

/* ── Quản lý dữ liệu ─────────────────────────── */

/* Đúc vân tay cho danh sách tin nhắn để diệt trùng lặp
   Bằng cách nặn role + content của từng tin nhắn nối lại thành một mã băm (hash) cùi bắp, dùng để soi xem hai log có giống y xì nhau không */
function computeMessagesFingerprint(messages) {
    if (!messages || messages.length === 0) return '';
    /* Xén lấy 50 tin nhắn đầu + mỗi tin nhắn chặt khúc 500 chữ đầu làm vân tay thôi, kẻo tin nhắn bự quá cắn hết hiệu năng */
    return messages.slice(0, 50).map(m => {
        const role = m.role || '';
        const content = typeof m.content === 'string' ? m.content.slice(0, 500) : '';
        return `${role}:${content}`;
    }).join('|');
}

function addRecord(characterName, messages, source, modelName, rawBody, captureId) {
    if (!masterEnabled) return;
    if (!characterName || !messages || messages.length === 0) return;

    /* Diệt trùng lặp: Trùng y đúc nội dung messages của log ngay trước đó mà khoảng cách chưa tới 500ms thì vứt sọt rác */
    const fingerprint = computeMessagesFingerprint(messages);
    const now = Date.now();
    if (fingerprint && fingerprint === lastRecordFingerprint && (now - lastRecordTime) < 500) {
        /* Request tịt ngòi không đẻ ra log được, lôi luôn cái còng theo dõi reply của nó ném đi, cho khỏi kẹt rác ở khu đợi */
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
        source: source || { type: 'plugin', label: 'Plugin', detail: 'Request Plugin/Không phải Native' },
        modelName: modelName || '未知模型',
        messages,
        rawBody: rawBody || null,   /* Xác ướp JSON của request body gốc (Dành cho định dạng thô của "Xem toàn văn") */
        collapsed: true,
        id: captureId != null ? captureId : null, /* Mã vạch phi vụ request, dùng để treo reply vào */
        reply: null,                 /* Bụng chứa reply (Lưu xé lẻ ra, không tính vào số tin nhắn của request/xem toàn văn) */
    };

    /* Có khi reply bay tới nơi cắm trại trước khi log kịp đẻ ra (Lúc finalize thì log lặn đâu mất tăm): Treo nó lên ngay và luôn, */
    /* Ném cho luồng render đồng quy của addRecord gánh vác (skipRender=true, chống bị render trùng) */
    /* Chỉ móc lên khi reply đã chín (đạt trạng thái cuối); Hàng đang dở dang thì cứ ngâm ở khu đợi, chờ finalizeReply móc lên sau */
    if (captureId != null) {
        const replyData = consumePendingReply(captureId);
        if (replyData) attachReplyToRecord(record, replyData, true);
    }

    /* Đang múa hướng dẫn: Log mới chỉ nhốt tạm, cấm cản không cho ùa ra list render (Kẻo phá đám tọa độ DOM của bài hướng dẫn), */
    /* Hướng dẫn xong thì endTour sẽ gom tụi nó lại nhả ra, khỏi lo rớt mất. Đương nhiên vẫn bị trói bởi giới hạn max log. */
    if (tourActive) {
        tourPendingRecords.unshift(record);
        if (tourPendingRecords.length > MAX_RECORDS) {
            const evicted = tourPendingRecords.pop();
            if (evicted && evicted.id != null) abortPendingReply(evicted.id);
        }
        return;
    }

    /* Đón log mới cập bến, cụp hết đuôi mấy log cũ lại (Chỉ gập nguyên cái log thôi, ruột tin nhắn con đang há hay gập thì kệ nó) */
    records.forEach(r => { r.collapsed = true; });

    records.unshift(record);
    if (records.length > MAX_RECORDS) {
        const evicted = records.pop();
        /* Log bị đá đít văng ra mà reply còn đang nặn dở, bẻ cổ gỡ theo dõi luôn cho đỡ chật bộ đọc */
        if (evicted && evicted.id != null) abortPendingReply(evicted.id);
    }

    panelContentDirty = true;
    if (panelEl && isPanelVisible) {
        renderPanelContent();
        /* Bảng đang banh chành lồ lộ: Log mới ném vô là vút lên ngọn liền */
        /* (Cái ngã rẽ này lúc đập đi xây lại pendingScrollToTop lỡ tay chém nhầm, làm bị bệnh "Chỉ gập không chịu leo top", nay đắp lại rồi) */
        if (!isPanelCollapsed) {
            const listEl = panelEl.querySelector('#rlog-list');
            if (listEl) listEl.scrollTop = 0;
            /* Tin nhắn mới auto leo đỉnh: Gõ boong boong phát chớp chớp báo hiệu cho cái tin trên cùng */
            flashTopHint();
        }
    }
    /* Bảng mà không ở trạng thái "Banh chành lồ lộ" (Bị thu gọn/Đóng kín mít), */
    /* Chờ lúc nào ló mặt ra mới leo đỉnh (Ngó pendingScrollToTop bên trong togglePanelWindow / showPanel) */
    if (!(panelEl && isPanelVisible && !isPanelCollapsed)) {
        pendingScrollToTop = true;
    }
}

function clearAllRecords() {
    /* Lúc dọn sạch log thì đập luôn mớ theo dõi reply đang chạy, dọn rác cặn kẽ */
    pendingReplies.forEach((_, captureId) => abortPendingReply(captureId));
    records = [];
    panelContentDirty = true;
    if (panelEl && isPanelVisible) {
        renderPanelContent();
    }
}

/* ── Lưu trữ thiết lập ────────────────────────── */

function setMasterEnabled(enabled) {
    masterEnabled = enabled;
    try {
        localStorage.setItem(STORAGE_MASTER_KEY, enabled ? '1' : '0');
    } catch (e) { /* ignore */ }
    updateMasterToggleUI();
    
    if (panelEl && isPanelVisible) {
        /* Bảng đang trống trơn mà còn phơi mặt ra, thay liền dòng chữ báo trống */
        if (records.length === 0) {
            panelContentDirty = true;
            renderPanelContent();
        }
    }
    
    /* Hook đóng cọc luôn (Bên trong installFetchHook xài masterEnabled để coi có cho qua hay không), */
    /* Cấm trò bật/tắt công tắc lại đi đục tháo/lắp hook, dễ làm sụm dây chuyền fetch wrapper của plugin khác. */
}

function updateMasterToggleUI() {
    if (!panelEl) return;
    
    const btn = panelEl.querySelector('#rlog-master-toggle');
    if (btn) {
        if (masterEnabled) {
            btn.classList.add('rlog-master-on');
            btn.classList.remove('rlog-master-off');
            btn.style.color = '#4caf50'; /* [Dán nhãn] Màu icon lúc công tắc tổng bật (JS nội soi đè luôn CSS .rlog-master-on) */
            btn.querySelector('i').className = 'fa-solid fa-power-off';
            btn.title = 'Plugin đang mở-Tự động hốt log';
        } else {
            btn.classList.add('rlog-master-off');
            btn.classList.remove('rlog-master-on');
            btn.style.color = '#999'; /* [Dán nhãn] Màu icon lúc công tắc tổng cụp (JS nội soi đè luôn CSS .rlog-master-off) */
            btn.querySelector('i').className = 'fa-solid fa-power-off';
            btn.title = 'Plugin đã tắt-Ngưng hốt log';
        }
    }

    /* Nhìn sắc mặt công tắc tổng mà kéo/cuốn màng che cho bảng */
    if (!masterEnabled) {
        panelEl.classList.add('rlog-disabled');
    } else {
        panelEl.classList.remove('rlog-disabled');
    }
}

/* Lục lọi xem trước nội dung từ localStorage
   Mặc định tắt ngúm (Mới cài hoặc chưa mâm me gì thì quăng false)
   @returns {boolean} Có đang bật xem trước không */
function loadContentPreview() {
    try { return localStorage.getItem(STORAGE_PREVIEW_KEY) === '1'; } catch (e) { return false; }
}

/* Đóng mộc cất tình trạng công tắc xem trước nội dung vào localStorage
   @param {boolean} enabled Có bật hay không */
function saveContentPreview(enabled) {
    try { localStorage.setItem(STORAGE_PREVIEW_KEY, enabled ? '1' : '0'); } catch (e) { /* ignore */ }
}

/* Gạt công tắc xem trước nội dung
   Phết màu lại biến toàn cục, cất vô kho, sơn lại mặt tiền nút, rồi quậy banh chành render lại bảng */
function toggleContentPreview() {
    contentPreviewEnabled = !contentPreviewEnabled;
    saveContentPreview(contentPreviewEnabled);
    updatePreviewToggleUI();
    /* Cái nút này thọc sâu vào ruột từng tin nhắn, nên phải đập DOM xây lại */
    panelContentDirty = true;
    if (panelEl && isPanelVisible) {
        renderPanelContent();
    }
}

/* Mông má lại mặt tiền nút xem trước trên thanh tiêu đề (Lúc bật/tắt)
   Bật thì cục trượt phi sang phải lên đèn, tắt thì thụt lùi về trái trả lại màu mốc */
function updatePreviewToggleUI() {
    const toggleEl = panelEl ? panelEl.querySelector('#rlog-preview-toggle') : null;
    if (!toggleEl) return;
    if (contentPreviewEnabled) {
        toggleEl.classList.add('rlog-preview-on');
        toggleEl.classList.remove('rlog-preview-off');
        toggleEl.title = 'Xem trước nội dung-Đã bật';
    } else {
        toggleEl.classList.remove('rlog-preview-on');
        toggleEl.classList.add('rlog-preview-off');
        toggleEl.title = 'Xem trước nội dung-Đã tắt';
    }
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
}

/* Lục lọi xem số log tối đa user đòi set là bao nhiêu từ localStorage
   Không có đồ hoặc ghi bậy bạ thì nhả số mặc định DEFAULT_MAX_RECORDS */
function loadMaxRecords() {
    try {
        const raw = localStorage.getItem(STORAGE_MAX_RECORDS_KEY);
        if (raw !== null && raw !== undefined) {
            const num = parseInt(raw, 10);
            /* Trạm kiểm soát: Phải là số nguyên ngay thẳng và nằm trong vùng phủ sóng */
            if (!isNaN(num) && num >= MIN_MAX_RECORDS && num <= MAX_MAX_RECORDS) {
                return num;
            }
        }
    } catch (e) { /* ignore */ }
    return DEFAULT_MAX_RECORDS;
}

/* Đóng mộc cất số log tối đa user set vào localStorage
   @param {number} value Số log cực hạn mới */
function saveMaxRecords(value) {
    try {
        localStorage.setItem(STORAGE_MAX_RECORDS_KEY, String(value));
    } catch (e) { /* ignore */ }
}

/* Phê chuẩn mức giới hạn log mới
   Nhấn ga update biến toàn cục, cất kho, lôi log cũ ra chém bỏ cho vừa mức mới, chưng số mới lên tiêu đề
   @param {number} newMax Mức trần mới */
function setMaxRecords(newMax) {
    /* Trạm kiểm soát */
    if (typeof newMax !== 'number' || isNaN(newMax) || newMax < MIN_MAX_RECORDS || newMax > MAX_MAX_RECORDS) {
        return false;
    }
    MAX_RECORDS = newMax;
    saveMaxRecords(MAX_RECORDS);

    /* Log mà lố trần mới thì lôi đám cũ mốc meo ra chém đầu */
    while (records.length > MAX_RECORDS) {
        records.pop();
    }

    /* Đắp số mới lên chóp tiêu đề */
    updateHeaderTitle();

    /* Đụng vô số lượng, phải đập DOM làm lại */
    panelContentDirty = true;

    /* Bảng đang chưng ra thì quét lại mặt tiền (Cái mớ log sau khi bị chém) */
    if (panelEl && isPanelVisible) {
        renderPanelContent();
    }

    return true;
}

/* Chỗ duy nhất đẻ ra dòng chữ đếm số: Dãy "Số log hiện tại / Trần" trên thanh tiêu đề bảng điều khiển.
   Mốt muốn vẽ vời lại style đếm số thì cắm trại sửa chỗ này là đủ (Render với template gốc đều chầu chực hàm này). */

/* ── Popup dùng chung ─────────────────────────── */

/* Nặn và chưng cái popup chỉnh số log lên
   Nháy đúp dô mấy con số trên tiêu đề là nó lòi ra */
function showMaxRecordsDialog() {
    /* Có cái popup nào lởn vởn thì đấm phát chết luôn */
    if (maxRecordsDialog) {
        maxRecordsDialog.remove();
    }

    /* Bung mùng chăn cho popup */
    /* Xài style inline dán tọa độ với kích thước, đề phòng CSS của thằng cha (vd transform) bẻ cong cái cọc position:fixed */
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
        /* Chọt trật ra mùng chăn là tắt */
        if (e.target === overlay) {
            closeMaxRecordsDialog();
        }
    });

    /* Nặn xác popup */
    const dialog = document.createElement('div');
    dialog.className = 'rlog-dialog';

    /* Dòm sắc trời mà đắp theme cho popup */
    if (isLightTheme) {
        dialog.classList.add('rlog-dialog-light');
    }

        dialog.innerHTML = `
        <div class="rlog-dialog-header">
            <span>Cài đặt số lượng tối đa</span>
            <button class="rlog-dialog-close" title="Đóng"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="rlog-dialog-body">
            <p class="rlog-dialog-desc">
                Nhập số lượng log muốn lưu, nằm trong khoảng ${MIN_MAX_RECORDS} ~ ${MAX_MAX_RECORDS}.
            </p>
            <div class="rlog-dialog-input-row">
                <input type="number" class="rlog-dialog-input" 
                       id="rlog-max-records-input" 
                       min="${MIN_MAX_RECORDS}" max="${MAX_MAX_RECORDS}" 
                       value="${MAX_RECORDS}" 
                       placeholder="${MAX_RECORDS}">
                <button class="rlog-dialog-btn rlog-dialog-btn-confirm" id="rlog-dialog-confirm">OK nè</button>
            </div>

        </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    maxRecordsDialog = overlay;

    /* Nối dây điện cho nút Đóng */
    dialog.querySelector('.rlog-dialog-close').addEventListener('click', closeMaxRecordsDialog);

    /* Nối dây điện cho nút Xác nhận */
    dialog.querySelector('#rlog-dialog-confirm').addEventListener('click', () => {
        const input = dialog.querySelector('#rlog-max-records-input');
        const rawValue = parseInt(input.value, 10);
        if (!isNaN(rawValue)) {
            /* Kẹp cổ (clamp) nhét vào đúng vùng cho phép */
            const clamped = Math.max(MIN_MAX_RECORDS, Math.min(MAX_MAX_RECORDS, rawValue));
            setMaxRecords(clamped);
        }
        closeMaxRecordsDialog();
    });

    /* Gõ Enter trên ô nhập là ăn luôn */
    dialog.querySelector('#rlog-max-records-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            dialog.querySelector('#rlog-dialog-confirm').click();
        } else if (e.key === 'Escape') {
            closeMaxRecordsDialog();
        }
    });

    /* Tự động focus vào ô nhập */
    setTimeout(() => {
        const input = dialog.querySelector('#rlog-max-records-input');
        if (input) {
            input.focus();
            input.select();
        }
    }, 100);
}

/* Đá đít popup chỉnh giới hạn */
function closeMaxRecordsDialog() {
    if (maxRecordsDialog) {
        maxRecordsDialog.remove();
        maxRecordsDialog = null;
    }
}

/* HTMLElement|null: Xác của popup xác nhận hiện tại */
let confirmDialogEl = null;

/* Đúc và chưng cái popup xác nhận đa di năng (Dành cho mấy trò nguy hiểm như dẹp hết log, xóa log lẻ)
   @param {object} options Bảng tùy chọn
   @param {string} [options.title='Xác nhận thao tác'] Tên tiêu đề
   @param {string} [options.message=''] Chữ trong bụng (Bao ăn HTML)
   @param {string} [options.confirmText='OK'] Chữ trên nút chốt
   @param {string} [options.cancelText='Hủy'] Chữ trên nút de
   @param {Function} [options.onConfirm] Hàm mồi khi bấm chốt
   @param {Function} [options.onCancel] Hàm mồi khi bấm de/đóng */
function showConfirmDialog(options) {
    const {
        title = 'Xác nhận thao tác',
        message = '',
        confirmText = 'OK nè',
        cancelText = 'Hủy',
        onConfirm = null,
        onCancel = null,
    } = options || {};

    /* Lỡ có cái nào đang chình ình thì dọn trước */
    closeConfirmDialog();

    /* Băng mùng chăn */
    /* Xài style inline dán tọa độ với kích thước, đề phòng CSS của thằng cha (vd transform) bẻ cong cái cọc position:fixed */
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
        /* Chọt trật ra mùng chăn là tắt */
        if (e.target === overlay) {
            closeConfirmDialog();
            if (typeof onCancel === 'function') onCancel();
        }
    });

    /* Nặn xác popup */
    const dialog = document.createElement('div');
    dialog.className = 'rlog-dialog rlog-confirm-dialog';

    /* Dòm sắc trời mà đắp theme */
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
    document.body.appendChild(overlay);
    confirmDialogEl = overlay;

    /* Nối dây nút đóng */
    dialog.querySelector('.rlog-dialog-close').addEventListener('click', () => {
        closeConfirmDialog();
        if (typeof onCancel === 'function') onCancel();
    });

    /* Nối dây nút Hủy */
    dialog.querySelector('#rlog-confirm-cancel').addEventListener('click', () => {
        closeConfirmDialog();
        if (typeof onCancel === 'function') onCancel();
    });

    /* Nối dây nút Chốt */
    dialog.querySelector('#rlog-confirm-ok').addEventListener('click', () => {
        closeConfirmDialog();
        if (typeof onConfirm === 'function') onConfirm();
    });

    /* Hỗ trợ gõ phím: Enter là chốt, Esc là de */
    dialog.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            dialog.querySelector('#rlog-confirm-ok').click();
        } else if (e.key === 'Escape') {
            closeConfirmDialog();
            if (typeof onCancel === 'function') onCancel();
        }
    });

    /* Đẩy focus vô nút Hủy cho an toàn (Tránh user spam phím chốt bậy) */
    setTimeout(() => {
        const cancelBtn = dialog.querySelector('#rlog-confirm-cancel');
        if (cancelBtn) cancelBtn.focus();
    }, 100);
}

/* Đá đít popup xác nhận đa năng */
function closeConfirmDialog() {
    if (confirmDialogEl) {
        confirmDialogEl.remove();
        confirmDialogEl = null;
    }
}

/* ── Tìm kiếm ───────────────────────────── */

/* Gột sạch sành sanh trạng thái tìm kiếm (Dẹp ô nhập, quét từ khóa, tẩy highlight, reset số đếm)
   Dùng cho mấy vụ gập/xóa/dọn/đẻ log mới... lôi thôi làm vỡ trận, bắt buộc thoát tìm kiếm.
   Thiết kế bao an toàn: Cóc thèm quan tâm ô UI đẻ ra chưa, ngó thấy trong DOM mới mổ. */
function resetSearchIfActive() {
    /* Đập vỡ đồng hồ chống dội (debounce) */
    if (searchDebounceTimer !== null) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
    }

    /* Đánh tẩy hết mọi cờ highlight (Màu vàng rỗ hay màu cam đang soi) */
    if (searchState) {
        const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
        if (listEl) {
            listEl.querySelectorAll('mark.rlog-search-mark, mark.rlog-search-mark-current').forEach(mark => {
                const parent = mark.parentNode;
                if (parent) {
                    /* Nhả thẻ mark ra thành đoạn text trần truồng, hồi phục nguyên hình */
                    parent.replaceChild(document.createTextNode(mark.textContent), mark);
                    /* Vuốt lại mấy đoạn text dính chùm cho nuột, tránh chẻ node lắt nhắt */
                    parent.normalize();
                }
            });
        }

        /* Thấy cái xác ô tìm kiếm thì mang đi chôn, trả lại hiện trường */
        const searchEl = searchState.searchEl;
        if (searchEl && searchEl.parentNode) {
            searchEl.parentNode.removeChild(searchEl);
        }
        /* Lôi kéo mấy cái nút, mũi tên thu gọn với cờ tìm kiếm của log trả về vị trí cũ */
        if (panelEl && searchState.recordIndex !== undefined) {
            const recordEl = panelEl.querySelector(`.rlog-record[data-record-index="${searchState.recordIndex}"]`);
            if (recordEl) {
                /* Bóc nhãn "Đang tìm" (CSS nhè cái nhãn này để nhả đám nút ra) */
                recordEl.classList.remove('rlog-searching');
                /* Hiện hồn lại mũi tên gập/mở (▾) */
                const toggleIcon = recordEl.querySelector('.rlog-toggle-icon');
                if (toggleIcon) toggleIcon.style.visibility = '';
            }
        }

        searchState = null;
    }
}

/* Set<string>: Bầy ký tự khoảng trắng y chang \s (Né cái vụ quăng vô vòng lặp regex bào CPU) */
const WHITESPACE_CHARS = new Set([' ', '\t', '\n', '\r', '\f', '\v', '\u00a0', '\u1680',
    '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006', '\u2007',
    '\u2008', '\u2009', '\u200a', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff']);

/* Hóa phép nhào nặn chữ để tìm cho mướt: Mọi ký tự khoảng trắng (Space, enter, tab, khoảng trắng chà bá...) kẹp nách lại thành một khoảng trắng duy nhất.
   Bắn luôn theo một cái bản đồ dò đường để lát nữa nhét chữ highlight về lại đúng chỗ cũ.
   
   Tại sao phải bày trò này: User hay bê chữ từ ngoài dán vào, cái dấu enter dọc đường bị tráo thành khoảng trắng.
   Nếu đoạn tin nhắn bị chia rẽ bởi dấu enter (\n hay \r\n), bưng chữ nguyên xi ra so là tạch.
   Hóa phép xong là "enter/dấu cách trong tin nhắn" = "khoảng trắng trong từ khóa", đâm xuyên qua mấy chỗ xuống dòng ngọt sớt.
   
   @param {string} text Đống chữ nguyên bản
   @returns {{normalized: string, map: number[]}}
   normalized: Chữ đã bị đè bẹp khoảng trắng (Độ dài ≤ Hàng gốc)
   map: Dài bằng normalized.length, map[i] = Thằng chữ thứ i của normalized nằm ở vị trí nào trong bản gốc */
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
            /* Khoảng trắng kéo bầy thì vứt, chừa đúng một cái space */
        } else {
            normalized += ch;
            map.push(i);
            lastWasSpace = false;
        }
    }
    return { normalized, map };
}

/* Cắm cọc đánh dấu mọi chỗ dính đạn của từ khóa bên trong các tin nhắn của một log
   Chỉ lướt index chuỗi thuần, cấm táy máy vô DOM, đảm bảo text có dài ngoằng cũng chạy mướt rượt.
   Trước khi đo ván thì lôi chữ với từ khóa ra hóa phép đè bẹp (Chuẩn hóa khoảng trắng), nhờ vậy:
   - Dán một nùi chữ từ nơi khác vào (Enter bị luộc thành space) vẫn dính chấu bình thường
   - Mấy cái \n / \r\n / dòng trống trong tin nhắn coi như là space trong từ khóa luôn
   - Bảng start/end bắn ra là tọa độ của chữ gốc (đã phiên dịch qua map), tha hồ móc DOM quất highlight
   @param {number} recordIndex Số nhà của log
   @param {string} keyword Từ khóa lục lọi
   @returns {Array<{msgIdx: number, start: number, end: number}>} Nguyên một mảng các tọa độ dính đạn */
function findMatchesInRecord(recordIndex, keyword) {
    const record = records[recordIndex];
    if (!record || !record.messages || !keyword) return [];

    /* Ép khuôn từ khóa: Gom bầy khoảng trắng thành một, gọt luôn đầu đuôi */
    const normalizedKeyword = keyword.replace(/\s+/g, ' ').trim();
    if (!normalizedKeyword) return [];
    /* Chấp luôn chữ hoa chữ thường */
    const lowerKeyword = normalizedKeyword.toLowerCase();

    const matches = [];

    record.messages.forEach((msg, msgIdx) => {
        addContentMatches(msg.content, msgIdx, normalizedKeyword, lowerKeyword, matches);
    });
    /* Lôi luôn em reply ra tính là tin nhắn chót (msgIdx = messages.length) đặng tìm cho vui */
    if (record.reply) {
        addContentMatches(record.reply.content, record.messages.length, normalizedKeyword, lowerKeyword, matches);
    }

    return matches;
}

/* Gom chài tất cả tọa độ dính đạn của từ khóa trong một cọng tin nhắn/reply (Có bản đồ dịch tọa độ, chấp luôn trò CRLF).
   @param {string} content Chữ nghĩa của tin nhắn/reply
   @param {number} msgIdx Đời thứ mấy của tin nhắn (Reply thì lãnh số messages.length)
   @param {string} normalizedKeyword Từ khóa đã đè bẹp
   @param {string} lowerKeyword Từ khóa viết thường
   @param {Array} matches Rổ đựng kết quả */
function addContentMatches(content, msgIdx, normalizedKeyword, lowerKeyword, matches) {
    if (typeof content !== 'string' || !content) return;
    /* Rập khuôn với trò render DOM: Trình duyệt bú innerHTML sẽ tự biến \r\n / \r thành \n, */
    /* Phải uốn nắn đống xuống dòng cho y chang thì tọa độ mới lắp khít vào DOM highlight được; */
    /* Chứ xệch một dấu \r thôi là lệch tông, đánh highlight ra chỗ khác ngay tắp lự. */
    const normalizedContent = content.replace(/\r\n?/g, '\n');
    /* Đè bẹp chữ nghĩa (Gom khoảng trắng + Lập bản đồ tọa độ) */
    const { normalized, map } = normalizeTextWithMap(normalizedContent);
    const lowerContent = normalized.toLowerCase();

    let pos = 0;
    /* Cao tốc: Ngửi mà không thấy hơi từ khóa thì phắn luôn cho gọn */
    const firstIdx = lowerContent.indexOf(lowerKeyword);
    if (firstIdx === -1) return;

    /* Càn quét bắt cho bằng hết (Khống chế 5000 lỗ, lỡ nó copy paste văn mẫu khùng điên thì sụm máy) */
    let count = 0;
    while (pos <= normalized.length && count < 5000) {
        const idx = lowerContent.indexOf(lowerKeyword, pos);
        if (idx === -1) break;
        /* Móc bản đồ ra dịch tọa độ đè bẹp về lại tọa độ chữ gốc */
        const origStart = map[idx];
        const normEnd = idx + normalizedKeyword.length;
        const origEnd = map[normEnd - 1] + 1;
        matches.push({ msgIdx, start: origStart, end: origEnd });
        pos = idx + normalizedKeyword.length;
        count++;
    }
}

/* Tẩy sạch sẽ đống highlight <mark> đang bám (Vàng rỗ của đám thường + Cam chóe của đứa đang soi), nhả lại chữ nguyên thủy */
function clearSearchHighlights() {
    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    if (!listEl) return;
    listEl.querySelectorAll('mark.rlog-search-mark, mark.rlog-search-mark-current').forEach(mark => {
        const parent = mark.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(mark.textContent), mark);
            parent.normalize();
        }
    });
}

/* Lột áo cam của đứa đang bị soi xuống thành màu vàng rỗ bình dân (Vẫn giữ xác trên DOM)
   Dành cho trò mượn xác lúc nhảy kết quả: Xài lại mấy cục vàng đã vẽ, đỡ phải bôi ra vẽ lại nguyên mảng cho cực máy.
   Khác với clearSearchHighlights: Thằng này không đấm chết <mark>, nó chỉ giật cái mác class ra thay thôi,
   nhờ vậy thằng cũ rớt xuống vàng, mà mấy thằng nằm trong ruột tin nhắn bị gập, lúc mở ra vẫn giữ được màu vàng khè.
   Lúc lột áo thì đính luôn thẻ matchIdx của đời cũ vào, để sau này có trèo lên lại thì removeYellowMarkByMatchIdx biết đường mà moi xác.
   @param {number} [oldMatchIdx] Điểm mặt gọi tên đứa cũ (Optional, ném vào để vớt lại) */
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

/* Phanh thây cái cục mark vàng khè ngay tại vị trí matchIdx (Dọn dẹp mặt bằng để đắp áo cam lên)
   @param {number} matchIdx Cột mốc của mục tiêu trong bầy matches */
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

/* Cắm cọc tạo áo <mark> cho cái khúc chữ nằm từ [start, end) bên trong nội dung tin nhắn
   Lôi TreeWalker ra lội rừng text node để tóm đúng ngay chóc cái khoảng cách.
   @param {HTMLElement} contentEl Cục DOM .rmsg-content
   @param {number} start Vạch xuất phát (So với bộ chữ thuần túy của mẩu tin)
   @param {number} end Vạch đích
   @param {string} [className='rlog-search-mark-current'] Tên class khoác cho <mark> (Rỗ thường thì Vàng, đang tia thì Cam)
   @returns {HTMLElement|null} Lòi ra cục <mark>, xịt thì ném null */
function highlightRange(contentEl, start, end, className = 'rlog-search-mark-current') {
    if (!contentEl || start < 0 || end <= start) return null;

    const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
    let currentOffset = 0;
    let node = null;

    /* Đi lùng cái text node nào nuốt trọn được vạch xuất phát */
    while ((node = walker.nextNode())) {
        const nodeLen = node.textContent.length;
        if (currentOffset + nodeLen > start) break;
        currentOffset += nodeLen;
    }
    if (!node) return null;

    /* Chặt khúc text node ra: Khúc trước / Khúc bị khoác áo / Khúc sau */
    const nodeStart = currentOffset;
    const splitStart = start - nodeStart;
    const splitEnd = end - nodeStart;

    if (splitEnd > node.textContent.length) {
        /* Lỡ dại vướng từ khóa chẻ đôi ngã ba text node, chơi trò ăn gian: Chỉ khoác áo cho khúc nào kẹt trong node hiện tại thôi */
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

/* Rải bomb áo Vàng cho TẤT CẢ mục tiêu trúng đạn trong nguyên cái log này, nhưng tha cho thằng mục tiêu đang bị soi (Thằng đó có trò applyCurrentMatch vẽ áo Cam đắp lên rồi)
   Làm theo nguyên tắc "từ ngọn xuống rễ" (start lùi dần) cho một cục tin nhắn, kẻo nhét mark vào làm đẩy số offset chạy lung tung xà bần.
   @param {HTMLElement} recordEl Cái cục DOM log đang ngâm
   @param {number} recordIndex Số nhà của log */
function highlightAllMatches(recordEl, recordIndex) {
    if (!searchState || !recordEl) return;
    const record = records[recordIndex];
    if (!record) return;

    /* Buột bầy lại theo mẩu tin nhắn (Đá thằng Cam ra) */
    /* Nhét luôn cái mác index của rổ matches vào, để bộ áo Vàng có biển data-match-idx xưng danh */
    const matchesByMsg = new Map();
    searchState.matches.forEach((match, idx) => {
        if (idx === searchState.currentIdx) return;
        if (!matchesByMsg.has(match.msgIdx)) matchesByMsg.set(match.msgIdx, []);
        matchesByMsg.get(match.msgIdx).push({ match, idx });
    });

    matchesByMsg.forEach((msgMatches, msgIdx) => {
        const msg = getMessageByIndex(record, msgIdx);
        if (!msg) return;
        /* Kéo banh tin nhắn ra (Phải thấy mặt chữ thì mới vạch áo cho người xem lưng được) */
        if (msg.collapsed) {
            msg.collapsed = false;
            const msgItem = recordEl.querySelector(`.rmsg-item[data-msg="${msgIdx}"]`);
            if (msgItem) {
                msgItem.classList.add('expanded');
                msgItem.classList.remove('collapsed');
            }
        }
        const contentEl = recordEl.querySelector(`.rmsg-item[data-msg="${msgIdx}"] .rmsg-content`);
        if (!contentEl) return;

        /* Rải từ dưới lên trên, tránh việc nhét áo vào làm thay đổi số đo khúc dưới */
        msgMatches.sort((a, b) => b.match.start - a.match.start);
        msgMatches.forEach(({ match, idx }) => {
            const markEl = highlightRange(contentEl, match.start, match.end, 'rlog-search-mark');
            /* Bấm mác cho áo Vàng, lát nữa removeYellowMarkByMatchIdx biết đường mà gỡ */
            if (markEl) markEl.dataset.matchIdx = String(idx);
        });
    });
}

/* Kéo cuộn sương sương đưa em mục tiêu vào chỗ dễ nhìn nhất
   Chiêu thức:
   1. Bới cuộn bên trong .rmsg-content, nâng mục tiêu lọt vào vùng nhìn thấy của cái khung đó
   2. Tự tính toán và nhích cái scrollTop của .rlog-list, để kéo cái vùng đó ngoi lên nằm tọt xuống ngay dưới nách thanh tiêu đề
   Chỉ điểm: Tuyệt nhiên cấm cửa chiêu scrollIntoView——thằng quỷ đó nó bứng cả sậu cha ông kéo theo,
   đụng điện thoại là nó lôi tuột cả mặt tiền của ST (body/#sheld...) rớt xuống hố luôn.
   @param {HTMLElement} markEl Em mục tiêu đang mang áo <mark>
   @param {HTMLElement} contentEl Cục ruột .rmsg-content chứa ẻm */
function scrollToMatch(markEl, contentEl) {
    if (!markEl || !contentEl) return;

    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    if (!listEl) return;

    /* 1. Moi ruột: Kéo cho em mark ló mặt lên tầm 1/4 khung hình (Chỗ nhìn phê nhất) */
    const contentRect = contentEl.getBoundingClientRect();
    const markRect = markEl.getBoundingClientRect();
    const contentScrollTop = contentEl.scrollTop;
    const relativeTop = markRect.top - contentRect.top + contentScrollTop;
    /* Đích đến: Nằm hở đỉnh tầm 25% */
    const targetScroll = relativeTop - contentRect.height * 0.25;
    const clampedContentScroll = Math.max(0, targetScroll);
    contentEl.scrollTo({ top: clampedContentScroll, behavior: 'smooth' });

    /* 2. Cuộn ngoài: Tự xử vị trí, miễn bàn giao cho scrollIntoView kéo lê lết giao diện chính */
    /* Ruột trơn chưa trượt xong, nhưng chỗ của em mark thì cứ lấy toán học mà dằn ra: */
    /*   Kéo ruột lên khúc delta > 0, mâm mark trồi lên một khoảng y chóc */
    /*   Tọa độ top của mark sau khi cuộn = markRect.top - delta */
    /* Tham vọng là kéo ẻm xuống luồn nách đám thanh tiêu đề sticky (Tiêu đề log + Tiêu đề tin) hở 8px */
    const delta = clampedContentScroll - contentScrollTop;
    const markFinalTop = markRect.top - delta;
    const listRect = listEl.getBoundingClientRect();

    /* Đắp dồn bề dày của hai khúc thanh tiêu đề (Cái khúc ăn bám trên trần ấy), cấm lấy số 48px chết: */
    /* - .rlog-record-header: Nằm dính trên ngọn (dày cỡ 40px) */
    /* - .rmsg-header: Đu bám ngay dưới đít thanh tiêu đề log (dày cỡ 32px+) */
    /* Lôi offsetHeight ra đong mới hốt trọn đủ thứ form desktop/di động, với cả lúc bị văng dòng nó phình lên. */
    /* Ghi lòng tạc dạ: Đừng có lấy tọa độ bottom của getBoundingClientRect() mà phang—— */
    /* Lỡ cái tin chưa bò vào màn hình thì cái header nó đã dính đỉnh đâu, bottom nó bay tận đẩu tận đâu, */
    /* Kéo cái rụp scrollTop lùi về 0 luôn (Bắn mịa nó lên đầu danh sách). Lấy offsetHeight thì nó nằm yên chả lo. */
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

    /* Đóng cọc vị trí logic cho em mark (Có trượt kiểu gì thì cọc vẫn cắm đó) */
    const markInList = listEl.scrollTop + markFinalTop - listRect.top;
    /* Đích đến: Lấp ló hở đỉnh tầm 1/3 (Vùng vàng của mắt nhìn) dưới đám thanh tiêu đề */
    /* Vùng thả rông = Tổng cao - Khúc bị thanh tiêu đề ăn gian */
    const visibleHeight = Math.max(0, listEl.clientHeight - stickyHeight);
    const targetListScroll = markInList - stickyHeight - visibleHeight * 0.33;

    /* Ghì đầu nó vô khuôn khổ, lỡ trình duyệt nó tự xén là giật tưng bừng */
    const maxListScroll = Math.max(0, listEl.scrollHeight - listEl.clientHeight);
    const clampedListScroll = Math.max(0, Math.min(targetListScroll, maxListScroll));

    /* Chỉ cựa mình khi nào thật sự phải nhích (Nằm trúng phóc rồi thì nằm im, khỏi khua chiêng gõ mỏ) */
    if (Math.abs(clampedListScroll - listEl.scrollTop) > 1) {
        listEl.scrollTo({ top: clampedListScroll, behavior: 'smooth' });
    }
}

/* Đập đi xây lại cái mặt đồng hồ điểm số (Tỉ như 3/18) */
function updateSearchCounter() {
    if (!searchState || !searchState.searchEl) return;
    const counter = searchState.searchEl.querySelector('.rlog-search-count');
    if (!counter) return;

    const total = searchState.matches.length;
    const current = total > 0 ? searchState.currentIdx + 1 : 0;
    counter.textContent = `${current}/${total}`;

    /* Móm hoặc có mỗi một mống thì xích cổ mấy cái mũi tên lại */
    const prevBtn = searchState.searchEl.querySelector('.rlog-search-prev');
    const nextBtn = searchState.searchEl.querySelector('.rlog-search-next');
    if (prevBtn) prevBtn.disabled = total <= 1;
    if (nextBtn) nextBtn.disabled = total <= 1;
}

/* Sủi vào đúng số phòng của tin nhắn để lục đồ, khoác áo Cam rồi kéo nó văng vào màn hình
   @param {number} msgIdx Đời thứ mấy của mẩu tin
   @param {number} matchIdx Cột mốc nằm ở ổ matches nào
   @param {boolean} [redrawYellowHighlights=true] Có cần tô Vàng lại đám quần chúng không
   - true (Lúc đổi chữ tìm kiếm): Phủi bụi toàn bộ (Cả Vàng cả Cam) xong vẽ lại đám Vàng một lượt
   - false (Lúc bấm mũi tên chạy lên xuống): Lột áo Cam thôi, xài lại đồ Vàng cũ cho đỡ mỏi CPU */
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
        /* Đổi từ khóa: Tẩy bay mớ highlight cặn (Vàng rỗ + Cam chóe) rồi vẽ mới từ đầu */
        clearSearchHighlights();

        /* Lôi cổ cái log banh ra cho rõ */
        if (record.collapsed) {
            record.collapsed = false;
            recordEl.classList.add('expanded');
            recordEl.classList.remove('collapsed');
        }

        /* Phủ Vàng đám rỗ trong đống này (Nhớ né cái mặt mốc của đứa áo Cam) */
        /* Mấy cái tin nhắn mà gập lại chứa chữ cũng bị xé toạc ra hết */
        highlightAllMatches(recordEl, recordIndex);
    } else {
        /* Lướt phím: Đạp áo Cam thành áo Vàng rỗ (Đổi bảng tên class thôi, đừng nhổ gốc) */
        /* Mượn đồ Vàng cũ xài đỡ, tránh bung bét làm máy giật lag */
        const oldIdx = searchState.currentIdx;
        clearCurrentHighlight(oldIdx);

        /* Vặt luôn cục Vàng án ngữ ở đúng vị trí (Tại lỡ lướt qua lướt lại nó dính cặn) */
        /* Phải vặt trước, để áo Cam vẽ lên không bị chệch tọa độ */
        removeYellowMarkByMatchIdx(matchIdx);

        /* Ban lệnh cấm gập log (Đang soi mà bị thằng nào đó nhấn gập là móp mỏ) */
        if (record.collapsed) {
            record.collapsed = false;
            recordEl.classList.add('expanded');
            recordEl.classList.remove('collapsed');
        }
    }

    /* Kéo banh háng cái tin nhắn ra (Gập lại thì chữ nghĩa bay hết lấy gì mà mò) */
    if (msg.collapsed) {
        msg.collapsed = false;
        const msgItem = recordEl.querySelector(`.rmsg-item[data-msg="${msgIdx}"]`);
        if (msgItem) {
            msgItem.classList.add('expanded');
            msgItem.classList.remove('collapsed');
        }
    }

    const contentEl = recordEl.querySelector(`.rmsg-item[data-msg="${msgIdx}"] .rmsg-content`);
    if (!contentEl) return;

    /* Ném cục hẹn giờ tạo thanh cuộn (Tin vừa bị kéo banh, chờ layout nó thở cái đã) */
    setTimeout(() => createScrollbarForContent(contentEl), SCROLLBAR_CREATE_DELAY_MS);

    const match = searchState.matches[matchIdx];
    if (!match) return;

    /* Phủ áo Cam chóe cho mục tiêu */
    const markEl = highlightRange(contentEl, match.start, match.end, 'rlog-search-mark-current');

    /* Lên bảng điểm */
    searchState.currentIdx = matchIdx;
    updateSearchCounter();

    if (markEl) {
        scrollToMatch(markEl, contentEl);
    }
}

/* Đốt đuốc lên đi tìm (Cục debounce sẽ triệu hồi sau khi ngưng gõ)
   @param {number} recordIndex Số nhà của log
   @param {string} keyword Khẩu quyết tìm kiếm */
function performSearch(recordIndex, keyword) {
    if (!searchState || !panelEl) return;

    /* Dọn bát đĩa cũ */
    searchState.matches = findMatchesInRecord(recordIndex, keyword);
    searchState.currentIdx = -1;
    searchState.keyword = keyword;

    if (!keyword) {
        clearSearchHighlights();
        updateSearchCounter();
        return;
    }

    if (searchState.matches.length > 0) {
        /* Phóng lẹ thẳng vào mục tiêu đầu tiên */
        searchState.currentIdx = 0;
        applyCurrentMatch(searchState.matches[0].msgIdx, 0);
    } else {
        /* Chả có vẹo gì: Lau sạch sành sanh, điểm hiện 0/0 */
        clearSearchHighlights();
        updateSearchCounter();
    }
}

/* Nhảy cóc Tới/Lui
   @param {number} direction 1=Tới, -1=Lui */
function navigateSearch(direction) {
    if (!searchState || !searchState.matches || searchState.matches.length === 0) return;

    const total = searchState.matches.length;
    let nextIdx = searchState.currentIdx + direction;
    /* Xoay vòng tròn trượt */
    if (nextIdx >= total) nextIdx = 0;
    if (nextIdx < 0) nextIdx = total - 1;

    const match = searchState.matches[nextIdx];
    /* Thông số false: Nhảy tàu thì chỉ rinh áo Cam theo thôi, chừa bầy áo Vàng lại xài đồ cũ (Cao kiến tối ưu) */
    applyCurrentMatch(match.msgIdx, nextIdx, false);
}

/* Dẹp tiệm ổ tìm kiếm */
function closeSearch() {
    resetSearchIfActive();
}

/* Mở rạp tìm kiếm cho đúng một cái log (Chân lý độc tôn: Có đứa này thì đéo có đứa kia)
   Chọt ngón vô cái Kính lúp của log là gọi ra trò này.
   @param {number} recordIndex Số nhà của log */
function openSearchForRecord(recordIndex) {
    if (!panelEl) return;
    /* Độc tôn: Đạp đổ tất cả các ổ tìm kiếm khác (Kể cả của chính nó) */
    resetSearchIfActive();

    const listEl = panelEl.querySelector('#rlog-list');
    const recordEl = listEl.querySelector(`.rlog-record[data-record-index="${recordIndex}"]`);
    if (!recordEl) return;

    const actionsEl = recordEl.querySelector('.rlog-record-actions');
    const actionsInner = recordEl.querySelector('.rlog-record-actions-inner');
    if (!actionsEl || !actionsInner) return;

    /* Dán bùa "Đang lục" (CSS dòm thấy là nó chôn hết đám nút xung quanh trừ Kính lúp, */
    /* Nhường khoảng trống cho ổ tìm kiếm bung bét về bên phải) */
    recordEl.classList.add('rlog-searching');

    /* Tàng hình cái mũi tên thu gọn (▾) —— Xài visibility để nó câm nhưng vẫn phải đứng chôn chân đấy, */
    /* Chống lưng cho CSS khóa mỏ thằng actions-inner, giữ Kính lúp đứng im phăng phắc */
    const toggleIcon = recordEl.querySelector('.rlog-toggle-icon');
    if (toggleIcon) toggleIcon.style.visibility = 'hidden';

    /* Lỡ cái log đang co ro thì vạch nó ra (Lục chữ thì bắt buộc phải thấy chữ chứ) */
    const record = records[recordIndex];
    if (record && record.collapsed) {
        record.collapsed = false;
        recordEl.classList.add('expanded');
        recordEl.classList.remove('collapsed');
        /* Vạch ra rồi thì phái thợ tới gắn thanh cuộn lười biếng cho đám nội dung (Đứa nào lọt vô tròng mắt thì làm lẹ, còn lại cứ chờ đó) */
        queueScrollbarsForEls(recordEl.querySelectorAll('.rmsg-content'));
    }

    /* Đắp xác ổ tìm kiếm (Không thèm nhét Kính lúp vô: Cái kính lúp gốc cứ để đó làm cọc tiêu, */
    /* Ổ tìm kiếm mọc mầm từ nách phải của nó chĩa ra, nuốt chửng đất của đám nút bị chôn) */
    const searchBox = document.createElement('div');
    searchBox.className = 'rlog-search-box';
    searchBox.innerHTML = `
        <div class="rlog-search-input-wrap">
            <input type="text" class="rlog-search-input" placeholder="Tìm kiếm..." autocomplete="off" spellcheck="false">
            <span class="rlog-search-count">0/0</span>
        </div>
        <button class="rlog-search-next" title="Tiếp theo (Enter)" disabled>
            <i class="fa-solid fa-arrow-down"></i>
        </button>
        <button class="rlog-search-prev" title="Trước đó (Shift+Enter)" disabled>
            <i class="fa-solid fa-arrow-up"></i>
        </button>
    `;

    /* Chêm vào nách phải Kính lúp (Kính lúp cắm rễ, ổ tìm kiếm dạt phải) */
    const searchBtn = actionsInner.querySelector('.rlog-search-btn');
    if (searchBtn) {
        searchBtn.insertAdjacentElement('afterend', searchBox);
    } else {
        actionsInner.appendChild(searchBox);
    }

    /* Bày binh bố trận cho ổ tìm kiếm */
    searchState = {
        recordIndex,
        keyword: '',
        matches: [],
        currentIdx: -1,
        searchEl: searchBox,
    };

    /* Câu dây điện cho đám nút với ổ nhập */
    const input = searchBox.querySelector('.rlog-search-input');
    const prevBtn = searchBox.querySelector('.rlog-search-prev');
    const nextBtn = searchBox.querySelector('.rlog-search-next');

    /* boolean: Cờ bắt trạng thái gõ telex/pinyin (Chữ chưa lọt vô khuôn thì khoan rống lên báo input) */
    let isComposing = false;
    /* Trạm điều phối chống dội (debounce): Input và compositionend xài chung cục này */
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

    /* Bắt đầu gõ telex: Phất cờ, phớt lờ ráo mọi tiếng la hét input */
    input.addEventListener('compositionstart', () => { isComposing = true; });
    /* Chốt gõ telex (Chữ rớt vô ổ): Rút cờ, nện cho phát tìm kiếm bù (Lỡ có sót thì nay lôi ra chém) */
    input.addEventListener('compositionend', () => {
        isComposing = false;
        scheduleSearch();
    });

    /* Hứng input real-time (Có kềm phanh debounce), lúc đang múa phím telex thì miễn bàn */
    input.addEventListener('input', (e) => {
        if (isComposing || e.isComposing || e.keyCode === 229) return;
        scheduleSearch();
    });

    /* Lướt phím tắt: Enter là Tới / Shift+Enter là Lui / Esc dẹp tiệm */
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

    /* Hút nhãn quang vào ổ nhập */
    setTimeout(() => {
        if (input && searchState && searchState.searchEl === searchBox) {
            input.focus();
        }
    }, 50);
}

/* ── Render & Build HTML ──────────────────── */

function getHeaderCountText() {
    return `${records.length}/${MAX_RECORDS}`;
}

/* Ép tiêu đề vác cờ đếm mới (Dựa hơi getHeaderCountText, gộp format vào chung một rọ) */
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
    /* tokenPrecise = true là đã ngậm máy thái chữ xịn của ST, khỏi vẽ thêm râu ria ~ bốc phét */
    const tokenPrefix = msg.tokenPrecise ? '' : '~';
    /* Chữ xem trước (Chỉ lòi mặt khi bật nút xem trước, hoặc bị ép cung lúc múa hướng dẫn) */
    const showPreview = forcePreviewState !== null ? forcePreviewState : contentPreviewEnabled;
    const previewHtml = showPreview
        ? `<span class="rmsg-preview-text" title="${escapeHtml(msg.content.slice(0, 200))}">${escapeHtml(getContentPreview(msg.content))}</span>`
        : '';
    return `
        <div class="rmsg-item ${collapsedClass} ${roleClass}" data-record="${recordIdx}" data-msg="${msgIdx}">
            <div class="rmsg-header">
                <span class="rmsg-expand-icon"><i class="fa-solid fa-chevron-right"></i></span>
                <span class="rmsg-role-badge ${roleClass}">${escapeHtml(roleLabel)}</span>
                ${previewHtml}
                <span class="rmsg-tokens">${tokenPrefix}${msg.tokens} tokens</span>
                <button class="rmsg-copy-btn" data-record="${recordIdx}" data-msg="${msgIdx}" title="Copy tin nhắn này">
                    <i class="fa-solid fa-copy"></i>
                </button>
            </div>
            <pre class="rmsg-content">${escapeHtml(msg.content)}</pre>
        </div>
    `;
}

function renderPanelContent() {
    if (!panelEl) return;

    /* Muốn phá nhà xây lại thì phải nhổ sạch rễ ổ tìm kiếm (Cờ highlight với mớ rễ nhợ sẽ thối rữa nếu bám xác DOM cũ) */
    resetSearchIfActive();

    const listEl = panelEl.querySelector('#rlog-list');
    if (!listEl) return;

    /* Lôi mặt getHeaderCountText ra chốt định dạng đếm qua updateHeaderTitle */
    updateHeaderTitle();

    if (records.length === 0) {
        panelEl.classList.add('rlog-empty-list');
        const emptyMsg = masterEnabled 
            ? 'Trống trơn à, gõ gì đó vô chat đi rồi quay lại xem nha (๑•̀ㅂ•́)و✧'
            : 'Plugin tắt ngúm rồi, bấm nút nguồn bật lên đi chứ!';
        listEl.innerHTML = `<div class="rlog-empty">${escapeHtml(emptyMsg)}</div>`;
        panelContentDirty = false;
        return;
    }
    panelEl.classList.remove('rlog-empty-list');

    /* Lỗ nhét nhãn trạng thái: Cân bề rộng bự nhất rồi quăng vào CSS, */
    /* Ghế dự bị với nhãn thật chung một size, rớt xuống là vừa vặn khỏi lo sụp mâm */
    const statusMaxW = getReplyStatusMaxWidth();
    if (statusMaxW > 0) {
        panelEl.style.setProperty('--rlog-status-w', `${statusMaxW}px`);
    }

    listEl.innerHTML = records
        .map((rec, idx) => {
            const totalTokens = getTotalTokens(rec.messages);
            const collapsedClass = rec.collapsed ? 'collapsed' : 'expanded';
            const sourceLabel = getSourceLabel(rec.source);
            const sourceClass = getSourceClass(rec.source);
            const sourceType = sourceClass === 'rlog-source-native' ? 'native' : 'plugin';
            const sourceTitle = (rec.source && rec.source.detail) || sourceLabel;

            /* Check coi cả nguyên ổ tin nhắn có đứa nào ăn gian bằng số ước tính không */
            const allPrecise = rec.messages.every(m => m.tokenPrecise === true);
            const recordTokenPrefix = allPrecise ? '' : '~';

            const messagesHtml = rec.messages
                .map((msg, mIdx) => buildMessageHtml(msg, idx, mIdx))
                .join('')
                /* Đu theo đít bầy tin nhắn là em reply giả mạo (data-msg = messages.length), khoác chung một lớp da */
                + (rec.reply ? buildMessageHtml(rec.reply, idx, rec.messages.length) : '');

            /* Đánh dấu trạng thái reply: Chui rúc ngay chỗ nút bấm với mũi tên gập lúc bị cụp xuống (Lúc banh ra là lặn mất, chừa sân khấu cho bầy nút bấm). */
            /* Đang mỏi mòn ngóng reply (Có tên sổ Nam Tào mà chưa ra hồn) thì thả hồn ma trong suốt ra, chiếm sẵn hố để đồ bự nhất, */
            /* Lúc nào hàng dạt vô bến thì kêu appendReplyToRecordDom hô biến hồn ma thành nhãn, vầy điện thoại hẹp xé màn chả bị đẩy dòng. */
            const replyStatusHtml = rec.reply
                ? `<span class="rlog-reply-status rlog-reply-status-${rec.reply.status}" title="${escapeHtml(getReplyStatusTitle(rec))}">${getReplyStatusLabel(rec.reply.status)}</span>`
                : (rec.id != null && pendingReplies.has(rec.id)
                    ? '<span class="rlog-reply-status rlog-reply-status-placeholder"></span>'
                    : '');

            return `
                <div class="rlog-record ${collapsedClass}" data-source="${sourceType}" data-record-index="${idx}">
                    <div class="rlog-record-header">
                        <div class="rlog-record-info">
                            <span class="rlog-char-name">${escapeHtml(rec.characterName)}</span>
                            <span class="rlog-source-badge ${sourceClass}" title="${escapeHtml(sourceTitle)}"><span class="rlog-status-dot"></span>${escapeHtml(sourceLabel)}</span>
                            <span class="rlog-time">${escapeHtml(rec.timestamp)}</span>
                            <span class="rlog-model-badge" title="Model Request">${escapeHtml(rec.modelName || '未知模型')}</span>
                            <span class="rlog-total-tokens">${recordTokenPrefix}<span class="rlog-token-num rlog-token-tier-${getTokenTier(totalTokens)}">${totalTokens}</span>&nbsp;tokens [${rec.messages.length}]</span>
                        </div>
                        <div class="rlog-record-actions">
                            <div class="rlog-record-actions-inner" style="display:flex; gap:4px; align-items:center;">
                                <button class="rlog-search-btn" data-record="${idx}" title="Tìm kiếm trong log này">
                                    <i class="fa-solid fa-magnifying-glass"></i>
                                </button>
                                <button class="rlog-msg-expand-btn" data-record="${idx}" title="Banh hết mọi tin nhắn">
                                    <i class="fa-solid fa-expand"></i>
                                </button>
                                <button class="rlog-msg-collapse-btn" data-record="${idx}" title="Cụp hết mọi tin nhắn">
                                    <i class="fa-solid fa-compress-alt"></i>
                                </button>
                                <button class="rlog-jump-bottom-btn" data-record="${idx}" title="Nhảy phốc xuống đáy">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="4" x2="12" y2="15"></line><line x1="5" y1="20" x2="19" y2="20"></line></svg>
                                </button>
                                <button class="rlog-read-full-btn" data-record="${idx}" title="Xem toàn văn">
                                    <i class="fa-solid fa-file-lines"></i>
                                </button>
                                <button class="rlog-delete-record-btn" data-record="${idx}" title="Xóa quách cái log này">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>
                            ${replyStatusHtml}
                            <span class="rlog-toggle-icon"><i class="fa-solid fa-chevron-down"></i></span>
                        </div>
                    </div>
                    <div class="rlog-record-body">
                        ${messagesHtml}
                    </div>
                </div>
            `;
        })
        .join('');

    bindListEvents(listEl);

    /* Nhồi bùa --rlog-rec-h vào mông từng log (Size bề dọc thực chiến của thanh tiêu đề), mớm cho thanh tiêu đề tin nhắn biết đường mà bu vào */
    syncRecordHeaderVars(listEl);

    /* Đẻ ra con giun trượt (overlay) cho bãi ruột tin nhắn */
    attachScrollIndicators(listEl);

    /* Múa xong, rửa tay (Lần sau mở bảng khỏi nhọc công đổ mồ hôi đập đi xây lại) */
    panelContentDirty = false;
}

/* Luộc số đo --rlog-rec-h của từng log: Size dọc 100% auth của thanh tiêu đề log (.rlog-record-header).
   
   Quả sticky top của thanh tiêu đề tin (.rmsg-header) bắt buộc phải y hệt bề dọc của thanh tiêu đề log, thì mới bu sát nách được.
   Bề dọc này dãn nở thất thường theo chiều ngang (Địu lên điện thoại bị văng dòng, có khi phình 100px+),
   Ghim mác 40px/36px là thanh tiêu đề tin móp mỏ vì bị đè bẹp. Rút thước đo từng em rồi phết vào biến CSS,
   Bọn sticky của trình duyệt sẽ khều biến đó ra cắm cọc; Biến này chỉ ngoe nguẩy lúc layout bẻ lái, chả buồn tham dự tiết mục lăn bi chuột. */
function syncRecordHeaderVars(listEl) {
    if (!listEl) return;
    ensureSharedResizeObserver();
    /* Đá văng bớt mớ đồ rởm không còn lòi mặt trên list (renderPanelContent phá nát bét cái cũ bằng innerHTML rồi) */
    const currentHeaders = new Set(listEl.querySelectorAll('.rlog-record-header'));
    observedRecordHeaders.forEach((headerEl) => {
        if (!currentHeaders.has(headerEl)) {
            sharedResizeObserver.unobserve(headerEl);
            observedRecordHeaders.delete(headerEl);
        }
    });
    listEl.querySelectorAll('.rlog-record').forEach((recordEl) => {
        const headerEl = recordEl.querySelector('.rlog-record-header');
        if (headerEl) {
            /* Lấy số lẻ tẻ getBoundingClientRect().height chứ cạch mặt offsetHeight (Xén mẹ nó phần lẻ): */
            /* Bị văng dòng thường nảy mầm số lẻ (tỉ như 65.59px), xén đi làm thanh tiêu đề 2 bên cắn nhau lòi mương */
            /* (Nét căng trên màn nét cao lộ cả 1px hở mương) */
            recordEl.style.setProperty('--rlog-rec-h', `${headerEl.getBoundingClientRect().height.toFixed(2)}px`);
            /* Lay động độ dọc (văng dòng/font/đổi khổ màn) là auto múc lại offset mới */
            if (!observedRecordHeaders.has(headerEl)) {
                observedRecordHeaders.add(headerEl);
                sharedResizeObserver.observe(headerEl);
            }
        }
    });
}

/* Áo giáp neo cuộn: Trước sau trò bẻ cụp banh chành nhớ cắm cái cọc tọa độ phần tử,
   Xong bồi thêm quả bù lùi cuộn, ép cái cọc (thanh tiêu đề) nằm chết dí một góc màn hình.
   Bẻ cụp làm cái cọc dội ngược lên: Một là ruột ngắn lại ép trình duyệt vặn cổ scrollTop dập xuống ngưỡng mới,
   Hai là cái thanh đang bám dính bị hụt chân té rớt về ổ gốc ——
   Hai đường này đều sút văng thanh tiêu đề lên ngọn cây. Lườm thấy cọc bay vút quá 1px,
   Lấy phép trừ đắp lại quả cuộn lùi, hãm đầu thanh tiêu đề về đúng vị trí lúc chưa bẻ;
   Còn rớt xuống (Do bám dính) thì cho qua (Hợp luân lý), cấm nhúng tay vào 1 pixel nào.
   Nhớ kỹ: Chơi trò bẻ cụp thì dứt khoát phải ẵm theo anchorEl (Cái thanh tiêu đề vừa bị chọt),
   Không thì nó dính hố; Còn trò banh háng thì chỉ nở ra chả có teo lại, bơ luôn cũng chả chết ai.
   @param {Function} action Ác mộng chọc chành DOM gây sóng gió chiều dọc
   @param {HTMLElement|null} [anchorEl] Cái cọc cần cắm chết dí */
function preserveScrollTop(action, anchorEl) {
    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    if (!listEl) { action(); return; }
    const saved = listEl.scrollTop;
    /* Tọa độ của cọc so với chóp (Trừ bì cái chóp list, lúc dính thì bằng tọa độ dính) */
    let beforeRelTop = null;
    if (anchorEl) {
        beforeRelTop = anchorEl.getBoundingClientRect().top - listEl.getBoundingClientRect().top;
    }
    action();
    listEl.scrollTop = saved;
    /* Cọc giật ngược lên hơn 1px (Vì đụng trần hoặc rớt hố) thì vác cái hiệu số ra kéo lùi nó lại, */
    /* Ghì đầu nó về đúng ổ cũ; Còn rớt xuống (Chuyện thường ngày của dính) thì bơ */
    if (anchorEl && beforeRelTop !== null) {
        const curRelTop = anchorEl.getBoundingClientRect().top - listEl.getBoundingClientRect().top;
        if (curRelTop - beforeRelTop < -1) {
            listEl.scrollTop = listEl.scrollTop + (curRelTop - beforeRelTop);
        }
    }
}

/* Tiêm độc dược hành xử vào một cuộn tin nhắn lẻ (Nhấn tiêu đề gập/banh + Nút copy).
   Phục vụ cho trò lót ổ lúc khởi tạo, lẫn lúc nhét thêm cái Response ất ơ vào.
   @param {HTMLElement} msgItem Cái mẩu DOM .rmsg-item */
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
        /* boolean: Vệt ngón tay đầu tiên có rơi trúng ổ tìm kiếm không (Lúc quét bôi đen chữ lòi ra ngoài cấm nhúc nhích gập/mở) */
        let mouseDownInSearchBox = false;
        header.addEventListener('mousedown', (e) => {
            mouseDownInSearchBox = e.target.closest('.rlog-search-box') !== null;
        });
        header.addEventListener('touchstart', (e) => {
            mouseDownInSearchBox = e.target.closest('.rlog-search-box') !== null;
        });
        header.addEventListener('click', function (e) {
            if (e.target.closest('button')) return;
            /* Lãnh địa tìm kiếm (Ô nhập/Chữ đếm/Chỗ trống) là vùng cấm, đụng vào không nhúc nhích, bảo kê tuyệt đối */
            if (e.target.closest('.rlog-search-box')) return;
            /* Đè móng trong ổ tìm kiếm rồi vuốt xệch ra ngoài mới buông, đích chọt sẽ là thằng tổ tiên (header), */
            /* Cấm nhảy dựng gập/mở, để user lỡ quét bôi đen chữ vuột tay không bị sập tiệm tìm kiếm */
            if (mouseDownInSearchBox) return;
            const recordEl = this.closest('.rlog-record');
            const idx = Number(recordEl.dataset.recordIndex);
            /* Banh/Cụp log lẻ thì ghim cứng tọa độ cuộn (Tiêu đề chôn chân, ruột chỉ bung xệ xuống dưới) */
            preserveScrollTop(() => {
                toggleRecordCollapse(idx, recordEl);
            }, this);
        });
    });

    listEl.querySelectorAll('.rlog-search-btn').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const idx = Number(this.dataset.record);
            /* Thuật toán Kính lúp: */
            /* - Ổ nhện chưa ló ra → Bày ổ nhện */
            /* - Ổ nhện của cái log này đang bày → Dẹp ổ nhện */
            /* - Ổ nhện của đứa khác đang bày → Trảm ổ đứa khác, bày ổ của log này */
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
            /* Cụp bẹp hết tin nhắn là xác định phải lên đỉnh, cấm cắm cọc tọa độ cũ (Cái preserveScrollTop nó vặn cổ hãm lại đấy) */
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

            /* Hỏi cưới đàng hoàng rồi mới trảm, khỏi bóp dái click nhầm */
            showConfirmDialog({
                title: 'Xóa một mẩu log',
                message: `Chắc kèo chém bay cái log của <strong>${escapeHtml(record.characterName)}</strong> chưa?<br>（${escapeHtml(record.timestamp)}，cõng theo ${record.messages.length} đoạn tin nhắn）<br>Chém là mất xác không cứu được đâu nha.`,
                confirmText: 'Chém nó',
                cancelText: 'Hủy',
                onConfirm: () => {
                    deleteRecord(idx);
                },
            });
        });
    });

}

/* ── Gập mở & Nháy Lên đầu ────────────────────── */

function toggleRecordCollapse(index, recordEl) {
    /* Cụp log thì vứt cái ổ tìm kiếm luôn (Cụp vào tối thui thì tìm chữ ý nghĩa gì) */
    resetSearchIfActive();
    records[index].collapsed = !records[index].collapsed;
    if (records[index].collapsed) {
        /* Phán xét xem đợt cụp này có kéo nhau "Lên đầu" không: Cụp lại thì ruột bị xén, trình duyệt tự ghì đầu scrollTop */
        /* rớt xuống mốc mới; Chỉ khi nào trước cụp bị cuộn đi rồi, mà sau cụp thấy nẩy lên chạm đỉnh thì mới gọi là lên đỉnh */
        const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
        const wasScrolled = !!(listEl && listEl.scrollTop > 1);
        recordCollapseToppedEl = null;
        /* Lúc đang cụp mà có đứa nào đang chớp lóa (Lúc nãy phóng xuống đáy) thì dập điện luôn (Khỏi chiếu lại lúc banh ra) */
        clearHeaderFlash(recordEl);
        recordEl.classList.add('collapsed');
        recordEl.classList.remove('expanded');
        if (wasScrolled && listEl && listEl.scrollTop === 0) {
            recordCollapseToppedEl = recordEl;
        }
    } else {
        recordEl.classList.add('expanded');
        recordEl.classList.remove('collapsed');
        /* Cụp → Banh ra thì nguyên rổ tin con bò tót lên đỉnh log: Chỉ khi cái cú cụp lúc nãy nó đẩy lên tuốt ngọn */
        /* thì tao mới vác mỏ lết đánh chớp cho cái tin đầu tiên; Cứ đứng ỳ ở trển gập gập mở mở, */
        /* với lại cái kiểu banh háng bình dân sau vụ hốt log mới, dẹp mẹ đánh chớp */
        if (recordCollapseToppedEl === recordEl) {
            const firstMsgHeader = recordEl.querySelector('.rmsg-item .rmsg-header');
            if (firstMsgHeader) triggerHeaderFlash(firstMsgHeader);
        }
        recordCollapseToppedEl = null;
        /* Banh cái log ra rồi thì lùa thợ đi rải giun cuộn cho ổ tin nhắn (Đứa nào lọt vô màn thì rải liền, mấy đứa kia ngâm) */
        queueScrollbarsForEls(recordEl.querySelectorAll('.rmsg-content'));
    }
}

function toggleMessageCollapse(recIdx, msgIdx, msgItem) {
    /* Banh/Cụp mẩu tin con chỉ là việc nhà, khỏi đánh sập ổ tìm kiếm */
    /* (Đồ highlight vẫn bám đó, cụp vô là câm thôi, banh ra nó lại rực sáng) */
    const record = records[recIdx];
    if (!record) return;
    const msg = getMessageByIndex(record, msgIdx);
    if (!msg) return;
    msg.collapsed = !msg.collapsed;
    if (msg.collapsed) {
        /* Cụp thì phang bỏ cục nhấp nháy đáy đi (Khỏi nhai lại lúc banh ra) */
        clearHeaderFlash(msgItem);
        msgItem.classList.add('collapsed');
        msgItem.classList.remove('expanded');
    } else {
        msgItem.classList.add('expanded');
        msgItem.classList.remove('collapsed');
        /* Banh ra thì bốc ổ ruột bò ngược lên chóp */
        const contentEl = msgItem.querySelector('.rmsg-content');
        if (contentEl) {
            contentEl.scrollTop = 0; /* Cụp banh ra thì đọc từ mỏ đọc xuống */
            createScrollbarForContent(contentEl);
        }
    }
}

/* Vét tin nhắn theo số chỉ điểm: Chừa đám đầu cho record.messages, khúc cuối thì tặng thằng reply (data-msg = messages.length).
   @param {object} record Cục log to bự
   @param {number} msgIdx Mốc chỉ điểm (Nuốt luôn thằng ngụy trang reply)
   @returns {object|null} */
function getMessageByIndex(record, msgIdx) {
    if (!record) return null;
    if (msgIdx < record.messages.length) return record.messages[msgIdx];
    if (msgIdx === record.messages.length) return record.reply || null;
    return null;
}

/* Nút "Cụp ráo" nằm trên băng trán — Đè hết bầy log lại, đồng thời đè luôn cả bầy tin nhắn con bên trong nốt */
function collapseAllEntries() {
    /* Trước khi đè bẹp dí thì sập mẹ cái ổ tìm kiếm đi */
    resetSearchIfActive();
    if (records.length === 0) return;
    /* Đè hết thì dập tắt ngay ba cái trò nháy nhó ở đáy (Mở ra khỏi nháy) */
    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    clearHeaderFlash(listEl);
    records.forEach((r, i) => {
        r.collapsed = true;
        /* Quất sập bầy tin nhắn con luôn */
        r.messages.forEach(m => { m.collapsed = true; });
        if (r.reply) r.reply.collapsed = true;
        const recordEl = panelEl.querySelector(`.rlog-record[data-record-index="${i}"]`);
        if (recordEl) {
            recordEl.classList.add('collapsed');
            recordEl.classList.remove('expanded');
            /* Tắt nắng DOM bầy tin nhắn */
            recordEl.querySelectorAll('.rmsg-item').forEach(el => {
                el.classList.add('collapsed');
                el.classList.remove('expanded');
            });
        }
    });
    /* Cụp ráo xong thì xốc nguyên băng lên nốc ao đầu bảng */
    if (listEl) listEl.scrollTop = 0;
    /* Cụp lên đầu: Điểm nháy sáng chót vót cho đứa mới nứt mắt ra */
    flashTopHint();
}

/* Nút "Cụp tất cả tin nhắn" của một cái log — Bẻ cổ tụi tin nhắn các nhà, xong đu dây lên đỉnh bảng
   Kèm chớp bóng chót vót cho đứa vắt vẻo trên đầu (Y xì vụ "Cụp ráo" ở trên)
   @param {number} index Số nhà của log */
function collapseRecordMessages(index) {
    /* Đục ổ tìm kiếm trước (Tin mà thụt vô thì chữ sáng lên chả giải quyết cái đếch gì) */
    resetSearchIfActive();
    const record = records[index];
    if (!record || !record.messages) return;

    /* Cập nhật não trạng: Ngậm hết */
    record.messages.forEach(m => { m.collapsed = true; });
    if (record.reply) record.reply.collapsed = true;

    /* Nắm đầu cái DOM */
    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    const recordEl = listEl ? listEl.querySelector(`.rlog-record[data-record-index="${index}"]`) : null;
    if (recordEl) {
        /* Bóp họng trò nháy đáy (Đứa nào chớp chớp là đập) */
        clearHeaderFlash(recordEl);
        recordEl.querySelectorAll('.rmsg-item').forEach(el => {
            el.classList.add('collapsed');
            el.classList.remove('expanded');
        });
    }
    /* Gập cổ tụi nhóc xong thì phốc thẳng lên nóc bảng */
    if (listEl) listEl.scrollTop = 0;
    /* Phi lên nóc thì nháy sáng mồi mắt thằng nhãi đỉnh bảng */
    flashTopHint();
}

/* Nút "Banh tất cả tin nhắn" của một cái log — Lột tuốt tuồn tuột mấy ẻm tin nhắn trong log này
   @param {number} index Số nhà của log */
function expandRecordMessages(index) {
    const record = records[index];
    if (!record || !record.messages) return;

    /* Cập nhật não trạng: Banh ráo */
    record.messages.forEach(m => { m.collapsed = false; });
    if (record.reply) record.reply.collapsed = false;

    /* Nắm đầu cái DOM */
    const recordEl = panelEl.querySelector(`.rlog-record[data-record-index="${index}"]`);
    if (recordEl) {
        recordEl.querySelectorAll('.rmsg-item').forEach(el => {
            el.classList.add('expanded');
            el.classList.remove('collapsed');
        });
        /* Ốp dây chuyền đẻ thanh cuộn giun lười cho khu nội dung (Trong tầm nhìn thì nặn ngay, xa tít tắp thì ngâm đó) */
        queueScrollbarsForEls(recordEl.querySelectorAll('.rmsg-content'));
    }
}

/* Nút "Bay nhanh xuống đáy" của một cái log — Cuộn lèo một phát tới khúc cuối cùng (Nếu có reply thì dừng ở Response,
   không có thì dừng ở tin nhắn thường cuối cùng), chốt hạ bằng cú chớp sáng thanh tiêu đề cho dễ nhìn.
   Trò này chỉ lo vị trí + chớp sáng, cấm cản việc làm thay đổi trạng thái gập/mở của bất kỳ tin nhắn nào.
   @param {number} index Số nhà của log */
function scrollToRecordBottom(index) {
    if (!panelEl) return;
    const listEl = panelEl.querySelector('#rlog-list');
    const recordEl = listEl.querySelector(`.rlog-record[data-record-index="${index}"]`);
    if (!recordEl) return;

    const lastItemEl = recordEl.querySelector('.rmsg-item:last-child');
    if (!lastItemEl) return;
    const headerEl = lastItemEl.querySelector('.rmsg-header');
    if (!headerEl) return;

    /* Tính toán tọa độ logic của thanh tiêu đề nằm bên trong list. Cấm đọc tọa độ ảo của sticky: */
    /* Lúc đang bám trần thì getBoundingClientRect trả về tọa độ bị dính, không phải tọa độ thật. */
    /* Thằng item không phải là sticky, lấy tọa độ nó + offsetTop của thanh tiêu đề là ra số chuẩn. */
    const listRect = listEl.getBoundingClientRect();
    const itemRect = lastItemEl.getBoundingClientRect();
    const headerTopInList = listEl.scrollTop + itemRect.top - listRect.top + headerEl.offsetTop;

    /* Đích đến: Thanh tiêu đề nằm chễm chệ ngay dưới nách thanh tiêu đề log (đang dính trần), hở ra 8px */
    const recordHeaderEl = recordEl.querySelector('.rlog-record-header');
    const stickyHeight = recordHeaderEl ? recordHeaderEl.getBoundingClientRect().height : 40;
    const targetScroll = Math.max(0, headerTopInList - stickyHeight - 8);

    /* Ghì cổ (clamp) vào đúng vùng cuộn hợp lệ (Chống vụ trình duyệt tự ép ngầm làm giật cục giao diện) */
    const maxListScroll = Math.max(0, listEl.scrollHeight - listEl.clientHeight);
    const clampedListScroll = Math.max(0, Math.min(targetScroll, maxListScroll));

    /* Chỉ cuộn khi thật sự cần (Nếu đích đã nằm chình ình trong mắt rồi thì đứng im, chỉ chớp sáng thôi) */
    if (Math.abs(clampedListScroll - listEl.scrollTop) > 1) {
        /* Cuộn mượt cần thời gian, phải đợi tới nơi rồi mới chớp (xài scrollend + hẹn giờ dự phòng), */
        /* Tránh tình trạng "Vừa bấm nút xong thì animation chớp đã tắt ngúm": Log mà dài / Đang mở toang thì rất dễ bị */
        cancelPendingFlash();
        pendingFlashHeader = headerEl;
        listEl.scrollTo({ top: clampedListScroll, behavior: 'smooth' });
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

/* Kích nổ quả chớp sáng dưới đáy (Gọi ra sau khi cuộn tới bến).
   Nếu mục tiêu bị đập đi xây lại hoặc bốc hơi rồi thì im ru (Không chớp), tiện tay dọn luôn cái hẹn giờ dự phòng. */
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

/* Hủy kèo chớp sáng đang ấp ủ (Dùng cho lúc bấm nút liên tọi, gập log hoặc đóng bảng...). */
function cancelPendingFlash() {
    if (pendingFlashTimer !== null) {
        clearTimeout(pendingFlashTimer);
        pendingFlashTimer = null;
    }
    pendingFlashHeader = null;
}

/* Lột sạch mác chớp sáng của các thanh tiêu đề trong phạm vi, hủy luôn kèo chớp đang ủ.
   Xài lúc gập log/tin nhắn: Bóp chết animation cái rụp, bung ra cũng không thèm chớp lại.
   @param {HTMLElement} scopeEl Tầm ảnh hưởng (Log, mẩu tin hoặc nguyên cái list) */
function clearHeaderFlash(scopeEl) {
    if (!scopeEl) return;
    let cleared = false;
    scopeEl.querySelectorAll('.rmsg-header.rlog-flash-bottom, .rlog-record-header.rlog-flash-bottom').forEach(el => {
        el.classList.remove('rlog-flash-bottom');
        cleared = true;
    });
    /* Bóp chết chủ động (Cụp log/Tắt bảng) xong thì xóa luôn sổ nợ thời gian: Reply có chui vô render lại cũng cấm chớp bù; */
    /* Còn nếu chưa bóp chết đứa nào thì giữ nguyên sổ, đường chớp bù cứ y án mà làm */
    if (cleared) lastTopHintFlashAt = 0;
    if (pendingFlashHeader && scopeEl.contains(pendingFlashHeader)) {
        cancelPendingFlash();
    }
}

/* Nháy mồi "Lên Đầu" khi không bấm nút: Lúc list tự trôi tuột lên đỉnh, nhá sáng nhẹ một cái
   cho cái log mới nhất (nằm trên cùng) y như lúc xuống đáy, báo hiệu "Lên tới ngọn rồi nha".
   Log mà đang há miệng thì chớp ở tin nhắn đầu tiên (Như soi gương với lúc xuống đáy), gập lại/khuất mắt thì chớp ở tiêu đề log
   (Đảm bảo kiểu gì cũng lọt vào mắt). Bảng mà tàng hình (Đang chạy ngầm) hoặc bị thu nhỏ thì dẹp, không chớp. */
function flashTopHint() {
    if (!panelEl || !isPanelVisible || isPanelCollapsed) return;
    const listEl = panelEl.querySelector('#rlog-list');
    const firstRecord = listEl ? listEl.querySelector('.rlog-record') : null;
    if (!firstRecord) return;
    let target = firstRecord.querySelector('.rmsg-header');
    if (!target || !target.offsetParent) {
        target = firstRecord.querySelector('.rlog-record-header');
    }
    if (target) {
        triggerHeaderFlash(target);
        lastTopHintFlashAt = Date.now();
    }
}

/* Kích nổ chớp sáng nền cho thanh tiêu đề tin nhắn con (Để hù user "Tin chót nằm đây nè").
   Chiêu trò: Giật mác ra + Ép reflow + Dán mác lại, đảm bảo nhấp click liên tọi vẫn chớp lại mượt mà;
   Mỗi cái thanh chỉ móc 1 còng nghe ngóng animationend (Lọc theo tên animation), chớp xong tự rụng mác.
   @param {HTMLElement} headerEl Đứa .rmsg-header ngáo ngơ dính đạn */
function triggerHeaderFlash(headerEl) {
    if (!headerEl) return;
    headerEl.classList.remove('rlog-flash-bottom');
    void headerEl.offsetWidth; /* Ép reflow bằng bạo lực, ép vòng đời animation chạy lại từ đầu */
    headerEl.classList.add('rlog-flash-bottom');
    if (!headerEl.dataset.rlogFlashBound) {
        headerEl.dataset.rlogFlashBound = '1';
        headerEl.addEventListener('animationend', function onFlashEnd(e) {
            /* Theme Sáng/Tối xài tên animation khác nhau (rlog-flash-bottom / rlog-flash-bottom-dark), bắt mào đầu là được */
            if (e.animationName.startsWith('rlog-flash-bottom')) {
                this.classList.remove('rlog-flash-bottom');
            }
        });
    }
}

/* ── Xóa và Copy ──────────────────────── */

/* Nút "Xóa" một mẩu log — Đạp văng log ra khỏi danh sách
   @param {number} index Số nhà của log */

function deleteRecord(index) {
    if (index < 0 || index >= records.length) return;
    const record = records[index];
    /* Trảm log thì chặt luôn đường hóng reply đang chạy của cái request đó */
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
            console.error(`[${PLUGIN_KEY}] Copy xịt rồi:`, e);
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

/* ── Lớp phủ Xem Toàn Văn ──────────────────────── */

/* Múc chữ bỏ vào mồm lớp phủ
   @param {object} record Cái log
   @param {string} format Định dạng: 'formatted' (gọn gàng) hay 'raw' (thô)
   @returns {string} Chữ nghĩa tuôn ra */
function getReadContent(record, format) {
    if (format === 'raw') {
        if (!record.rawBody) {
            return '{"error": "Không đào ra xác JSON thô của request"}';
        }
        try {
            return JSON.stringify(record.rawBody, null, 2);
        } catch (e) {
            return '{"error": "Không đào ra xác JSON thô của request"}';
        }
    }
    return getFullPromptText(record);
}

/* Gạt công tắc đổi định dạng rồi xả lại chữ
   @param {string} format 'formatted' hoặc 'raw' */
function switchReadFormat(format) {
    if (!readFullOverlayEl) return;
    readFullFormat = format;
    const record = records[readFullRecordIndex];
    if (!record) return;

    const contentEl = readFullOverlayEl.querySelector('.rlog-read-content');
    if (contentEl) {
        contentEl.textContent = getReadContent(record, format);
        contentEl.scrollTop = 0; /* Đổi mâm là phải kéo về đầu bảng */
    }

    /* Vẽ lại màu cho nút công tắc */
    const toggleEl = readFullOverlayEl.querySelector('.rlog-read-format-toggle');
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

/* Kéo Lên đầu/Xuống cuối trên lớp phủ "Xem toàn văn": Cuộn sấp mặt cái cục ruột đi lên/xuống.
   Lớp phủ này chứa nguyên cục chữ dài thoòng (Chả có dòng nào), chỉ cuộn thuần túy chứ đéo rảnh làm chớp sáng.
   @param {'top'|'bottom'} position Hướng cuộn: 'top' Lên Đỉnh / 'bottom' Xuống Đáy */
function scrollReadContentTo(position) {
    if (!readFullOverlayEl) return;
    const contentEl = readFullOverlayEl.querySelector('.rlog-read-content');
    if (!contentEl) return;
    /* Cuộn lướt nhẹ nhàng; Kéo xuống đáy thì nhét đại scrollHeight vào, trình duyệt nó tự biết kẹp (clamp) lại mốc tối đa */
    contentEl.scrollTo({
        top: position === 'bottom' ? contentEl.scrollHeight : 0,
        behavior: 'smooth',
    });
}

/* Dẹp tiệm lớp phủ "Xem toàn văn", tháo nhổ khỏi DOM */
function closeReadFullOverlay() {
    if (readFullOverlayEl) {
        /* Tiêu hủy thanh cuộn tự chế trên lớp phủ, đỡ để lại rác rưởi */
        const readContentEl = readFullOverlayEl.querySelector('.rlog-read-content');
        if (readContentEl) {
            detachScrollbarForContent(readContentEl);
        }
        readFullOverlayEl.remove();
        readFullOverlayEl = null;
    }
    readFullRecordIndex = null;
    /* Rút tai nghe phím Esc */
    document.removeEventListener('keydown', handleReadFullEscape);
}

/* Lính gác bắt phím Esc để dẹp lớp phủ
   @param {KeyboardEvent} e Cái sự kiện bàn phím */
function handleReadFullEscape(e) {
    if (e.key === 'Escape' && readFullOverlayEl) {
        closeReadFullOverlay();
    }
}

/* Bung lớp phủ "Xem toàn văn", vạch áo cho xem trọn bộ prompt của log
   Lớp phủ này đè thẳng vào ruột #rlog-panel, che mù mẹ mặt tiền (Đè luôn cái thanh tiêu đề chính).
   @param {number} index Số nhà của log */
function openReadFullOverlay(index) {
    /* Đạp văng cái ổ tìm kiếm ra trước (Đang xem toàn văn thì cấm có mò mẫm gì) */
    resetSearchIfActive();

    const record = records[index];
    if (!record || !panelEl) return;

    /* Dọn rác lười: Có cái lớp phủ cũ nào thì đấm chết mọe đi */
    closeReadFullOverlay();

    readFullRecordIndex = index;
    readFullFormat = 'formatted';

    /* Khởi tạo xác lớp phủ */
    const overlay = document.createElement('div');
    overlay.className = 'rlog-read-overlay';

    overlay.innerHTML = `
        <div class="rlog-read-header">
            <span class="rlog-read-title">Xem Toàn Văn</span>
            <div class="rlog-read-header-actions">
                <div class="rlog-read-format-toggle formatted" title="Chuyển đổi định dạng">
                    <span class="rlog-read-seg-slider"></span>
                    <span class="rlog-read-seg-option rlog-read-seg-formatted">Dọn dẹp</span>
                    <span class="rlog-read-seg-option rlog-read-seg-raw">JSON thô</span>
                </div>
                <button class="rlog-read-jump-top-btn" title="Vút lên đỉnh">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="4" x2="19" y2="4"></line><line x1="12" y1="9" x2="12" y2="20"></line><polyline points="7 14 12 9 17 14"></polyline></svg>
                </button>
                <button class="rlog-read-jump-bottom-btn" title="Chìm xuống đáy">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="4" x2="12" y2="15"></line><line x1="5" y1="20" x2="19" y2="20"></line></svg>
                </button>
                <button class="rlog-read-copy-btn" title="Lụm hết đống này">
                    <i class="fa-solid fa-copy"></i>
                </button>
                <button class="rlog-read-close-btn" title="Tắt đi (Esc)">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </div>
        <div class="rlog-read-content"></div>
        <div class="rlog-read-footer"></div>
    `;

    /* Đập chữ thẳng vô textContent cho nhẹ nợ, chơi innerHTML nó parse vỡ mặt */
    const contentEl = overlay.querySelector('.rlog-read-content');
    contentEl.textContent = getReadContent(record, 'formatted');

    /* Mắc điện cho thanh tiêu đề */
    const toggleEl = overlay.querySelector('.rlog-read-format-toggle');
    toggleEl.addEventListener('click', (e) => {
        e.stopPropagation();
        /* Gạt công tắc: Đang gọn gàng (formatted) thì xổ thô (raw); Đang thô thì túm lại */
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

    /* Tọng vào họng Panel, chèn mù mịt hết */
    panelEl.appendChild(overlay);
    readFullOverlayEl = overlay;

    /* Mướn thợ đắp thanh cuộn tự chế vô bụng lớp phủ (Mượn style với đồ của Overlay Progress) */
    const readContentElForScroll = overlay.querySelector('.rlog-read-content');
    if (readContentElForScroll) {
        queueScrollbarsForEls([readContentElForScroll]);
    }

    /* Gắn lính gác phím Esc */
    document.addEventListener('keydown', handleReadFullEscape);
}

/* ── Thanh Cuộn Tự Chế ───────────────────────── */

/* Hòm chứa đồ nghề dọn dẹp thanh cuộn cho từng cái .rmsg-content
   Map key: contentEl -> { scrollHandler, hitboxEl, thumbEl } */
const scrollbarCleanups = new Map();

/* Set<HTMLElement>: Điểm danh bọn .rmsg-content đang xài thanh cuộn (Đưa cho ResizeObserver lùa nguyên bầy làm một mẻ) */
const scrollbarElements = new Set();

/* Set<HTMLElement>: Đám .rmsg-content lót dép chờ chui vô khung hình để lột xác đẻ thanh cuộn (Nặn kiểu lười biếng) */
const pendingScrollbarContentEls = new Set();

/* ResizeObserver|null: Con mắt thần xài chung: Nguyên bầy thanh cuộn xài chung một con mắt, hốt nguyên ổ thumb đắp lại một lượt, đẻ ra 100+ con mắt riêng là vỡ mồm */
let sharedResizeObserver = null;

/* Set<HTMLElement>: Đám thanh tiêu đề log đã bị gắn mắt theo dõi (Sửa chiều cao cái là --rlog-rec-h giật số mới liền) */
const observedRecordHeaders = new Set();

/* IntersectionObserver|null: Mắt thần canh lười nặn thanh cuộn */
let scrollbarLazyObserver = null;

/* boolean: Khóa cửa xem đã có thằng RAF nào đang xếp hàng chờ update thumb chưa */
let thumbUpdateQueued = false;

/* boolean: Còi báo động update toàn lực mọi thanh cuộn (Do thằng ResizeObserver kéo còi) */
let thumbFullUpdatePending = false;

/* HTMLElement|null: Đứa contentEl lẻ tẻ đang cần sửa lại cái thumb (Do cuộn chuột kích hoạt) */
let thumbPendingElement = null;

/* Răn đe cho con mắt thần ResizeObserver xài chung thức dậy
   Giao trọn bộ thanh cuộn cho nó canh, có biến là đắp thumb tập thể, đẻ ra trăm cái ngóng trăm hướng ăn hành ngập mặt */
function ensureSharedResizeObserver() {
    if (sharedResizeObserver) return;
    sharedResizeObserver = new ResizeObserver((entries) => {
        /* Bề dọc thanh tiêu đề log co dãn (Xuống dòng/Đổi font/Đổi màn hình) → Ép mốc dính trần nảy số mới tắp lự */
        for (const entry of entries) {
            const headerEl = entry.target;
            if (headerEl && headerEl.classList && headerEl.classList.contains('rlog-record-header')) {
                const recordEl = headerEl.closest('.rlog-record');
                if (recordEl) {
                    recordEl.style.setProperty('--rlog-rec-h', `${headerEl.getBoundingClientRect().height.toFixed(2)}px`);
                }
            }
        }
        /* Chỉ cần một cục ruột đổi size: Nện cái rụp bắt update toàn bộ bầy thumb */
        /* Cái mớ hỗn độn này bị trình duyệt nhồi vào một cục sau lúc layout, nên cứ lùa tụi nó vào chung một khung RAF luôn */
        requestThumbUpdate();
    });
}

/* Đảm bảo mắt thần IntersectionObserver (canh lười) đã lên nòng
   Lúc nào thấy cái bụng chữ lọt vào màn hình (Hay mé mé lọt vào) thì mới ỉn thanh cuộn ra,
   Banh 100+ cái mẩu tin ra một phát mà nặn 100+ thanh cuộn là layout nó đứng cmn hình luôn.
   rootMargin 200px: Đẻ trước từ xa, cuộn tới là có đồ xài liền. */
function ensureScrollbarLazyObserver() {
    if (scrollbarLazyObserver) return;
    scrollbarLazyObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const contentEl = entry.target;
                pendingScrollbarContentEls.delete(contentEl);
                scrollbarLazyObserver.unobserve(contentEl);
                createScrollbarForContent(contentEl);
            }
        });
    }, { root: null, rootMargin: '200px 0px', threshold: 0 });
}

/* Xin lệnh vá lại vị trí thumb (Ném vô máy bào RAF)
   - Đéo truyền cờ: Nện toàn bộ các thumb đang sống (Do ResizeObserver gọi hồn)
   - Quăng cái contentEl vô: Vá đúng cái thumb của em nó thôi (Cuộn chuột đẻ ra)
   Nhồi chung mấy cú vã vào một khung hình, đỡ bị layout nó vả ngược vô mặt.
   @param {HTMLElement} [contentEl] Cục ruột cần vá; Bỏ trống là đánh bầy */
function requestThumbUpdate(contentEl) {
    if (contentEl) {
        thumbPendingElement = contentEl;
    } else {
        thumbFullUpdatePending = true;
    }
    if (thumbUpdateQueued) return;
    thumbUpdateQueued = true;
    requestAnimationFrame(() => {
        thumbUpdateQueued = false;
        if (thumbFullUpdatePending) {
            thumbFullUpdatePending = false;
            thumbPendingElement = null;
            scrollbarElements.forEach((el) => {
                const cleanup = scrollbarCleanups.get(el);
                if (cleanup) updateScrollbarThumb(el, cleanup);
            });
        } else if (thumbPendingElement) {
            const el = thumbPendingElement;
            thumbPendingElement = null;
            const cleanup = scrollbarCleanups.get(el);
            if (cleanup) updateScrollbarThumb(el, cleanup);
        }
    });
}

/* Nhìn vị trí cuộn của contentEl mà bứng cái thumb vào đúng chỗ
   @param {HTMLElement} contentEl Cục bụng chữ
   @param {object} cleanup Mớ giẻ lau nhà của thanh cuộn này (Có hitboxEl/thumbEl trỏng) */
function updateScrollbarThumb(contentEl, cleanup) {
    const hitbox = cleanup.hitboxEl;
    const thumb = cleanup.thumbEl;
    if (!hitbox || !thumb) return;

    const scrollHeight = contentEl.scrollHeight;
    const clientHeight = contentEl.clientHeight;
    const scrollTop = contentEl.scrollTop;
    const maxScroll = scrollHeight - clientHeight;

    if (maxScroll <= 0) {
        hitbox.style.display = 'none';
        return;
    }
    hitbox.style.display = '';

    /* Ép hitbox bu cứng vào contentEl (Tại vì nó bị treo trên .rmsg-item chứ đéo nằm trong ruột contentEl) */
    const contentTop = contentEl.offsetTop;
    hitbox.style.top = contentTop + 'px';
    hitbox.style.height = clientHeight + 'px';

    /* Chiều dài mương chạy (Cái track chừa đầu đuôi top:4px, bottom:4px) */
    const trackHeight = clientHeight - 8;

    /* Bề dọc cục thumb = Tỉ lệ thấy chữ × Bề dọc cái mương, cho lùn nhất là 20px thôi */
    const thumbRatio = clientHeight / scrollHeight;
    const thumbHeight = Math.max(20, thumbRatio * trackHeight);
    thumb.style.height = thumbHeight + 'px';

    /* Sân chơi của cục thumb */
    const thumbRange = trackHeight - thumbHeight;

    /* Vị trí thumb = Tỉ lệ đoạn đường đã lăn × Sân chơi */
    const thumbTop = maxScroll > 0 ? (scrollTop / maxScroll) * thumbRange : 0;
    thumb.style.top = thumbTop.toFixed(1) + 'px';
}

/* Quăng một mẻ .rmsg-content vô lò chờ đẻ thanh cuộn (Đẻ lười biếng)
   Bọn nó lết vô màn hình (hoặc lân la lọt mép) thì mới bắt đầu nặn.
   Đứa nào vô lò rồi hoặc đã có thanh cuộn thì đá ra ngoài.
   @param {NodeListOf<HTMLElement>|HTMLElement[]|Array} contentEls Bầy bụng chữ */
function queueScrollbarsForEls(contentEls) {
    ensureScrollbarLazyObserver();
    /* Hỗ trợ ôm sô cả .rmsg-content (Tin nhắn mẻ) lẫn .rlog-read-content (Ruột của Xem Toàn Văn) */
    const SCROLLABLE_CONTENT_CLASSES = ['rmsg-content', 'rlog-read-content'];
    contentEls.forEach((contentEl) => {
        if (!contentEl || !contentEl.classList) return;
        if (!SCROLLABLE_CONTENT_CLASSES.some(c => contentEl.classList.contains(c))) return;
        if (pendingScrollbarContentEls.has(contentEl)) return;
        if (scrollbarCleanups.has(contentEl)) return;
        pendingScrollbarContentEls.add(contentEl);
        scrollbarLazyObserver.observe(contentEl);
    });
}

/* Ép đẻ thanh cuộn (overlay) cho duy nhất một bụng chữ .rmsg-content
   @param {HTMLElement} contentEl Đứa .rmsg-content xui xẻo */
function createScrollbarForContent(contentEl) {
    /* Đập dẹp cái thanh cũ trước (Chống đẻ sinh đôi) */
    detachScrollbarForContent(contentEl);

    /* Chữ ngắn tũn đéo cần cuộn thì nặn thanh làm cái lờ gì */
    /* Ghi nhớ: Đo scrollHeight thì kiểu gì cũng kẹt layout, nhưng chỉ bị lúc thò mặt vô màn hình (Nặn lười + Chơi trò đánh lẻ) */
    if (contentEl.scrollHeight <= contentEl.clientHeight) return;

    /* Chốt điểm đáp (Móc lên cổ thằng cha của contentEl, chứ cấm đút vào ruột nó): */
    /* - .rmsg-content → Treo vào cổ .rmsg-item (Trò cũ, đéo có gì mới) */
    /* - .rlog-read-content → Treo vào rọ .rlog-read-overlay (Trò mới) */
    /* Cột kiểu này thì kéo cuộn cái hitbox không bị trôi tuột theo con nước (Nó xài position: absolute mà) */
    const container = contentEl.parentElement;
    if (!container) return;

    const isRmsgItem = container.classList.contains('rmsg-item');
    const isReadOverlay = container.classList.contains('rlog-read-overlay');
    if (!isRmsgItem && !isReadOverlay) return;

    /* Trói mộc position: relative vô làm rốn tọa độ */
    /* Bọn .rmsg-item thì đồ cổ cứ thế xài; Bọn .rlog-read-overlay thì dán đè hờ (Tại gốc nó là absolute rồi) */
    const currentPosition = getComputedStyle(container).position;
    if (currentPosition === 'static') {
        container.style.position = 'relative';
    }

    /* --- Khởi công đổ Bê Tông --- */
    const hitbox = document.createElement('div');
    hitbox.className = 'rlog-scroll-hitbox';

    const track = document.createElement('div');
    track.className = 'rlog-scroll-track';

    const thumb = document.createElement('div');
    thumb.className = 'rlog-scroll-thumb';

    const dot = document.createElement('div');
    dot.className = 'rlog-scroll-dot';

    /* Cái chấm nằm ké ngang hàng với track (Con ruột của hitbox), chứ nhét vô track nó bị overflow:hidden chém bay đầu */
    track.appendChild(thumb);
    hitbox.appendChild(track);
    hitbox.appendChild(dot);
    container.appendChild(hitbox);

    /* Chép tên vô sổ sinh tử (Để mắt thần ResizeObserver điểm danh) */
    scrollbarElements.add(contentEl);

    /* Xếp giẻ lau dọn dẹp (Nhét vô scrollbarCleanups xong thì requestThumbUpdate xách ra xài được ngay) */
    const cleanup = {
        scrollHandler: null,
        hitboxEl: hitbox,
        thumbEl: thumb,
    };

    /* Cú vá màng trinh đầu tiên: Nhồi vô cối RAF (Đợi frame sau rảnh rỗi mới quất một thể) */
    /* Bôi đậm: Đăng ký mớ giẻ lau vô list trước thì thằng updateScrollbarThumb mới đánh hơi ra */
    scrollbarCleanups.set(contentEl, cleanup);
    requestThumbUpdate(contentEl);

    /* Vểnh tai nghe cuộn chuột (Đút vô RAF nhai, kéo chuột điên cuồng cũng không bắt layout khạc ra liên tục) */
    const onScroll = () => requestThumbUpdate(contentEl);
    cleanup.scrollHandler = onScroll;
    contentEl.addEventListener('scroll', onScroll, { passive: true });

    /* Kêu con mắt thần ResizeObserver lại ngó thằng này đi */
    ensureSharedResizeObserver();
    if (sharedResizeObserver) {
        try {
            sharedResizeObserver.observe(contentEl);
        } catch (e) { /* Kệ mẹ nó */ }
    }

    /* --- Cọ xát: Pointer chọc ngoáy --- */
    /* Cái chấm (dot) bám riết lấy ngón tay (Nó khinh cái thumb ra mặt), chạy dọc từ đầu đến đít mương */
    /* boolean: Đang lôi xềnh xệch hay không */
    let dragging = false;
    /* number|null: pointerId giữ chốt (Cột chặt sự kiện pointer) */
    let capturedPointerId = null;

    /* Bấm độ Y của ngón tay đẻ ra tọa độ top của cái chấm (Giam trong ranh giới cái mương)
       @param {number} clientY Tọa độ Y chọc trên web
       @returns {number} Chỉ số style.top của dot (Bấu vào hitbox) */
    function clientYToDotTop(clientY) {
        const hitboxRect = hitbox.getBoundingClientRect();
        /* Khoảng lệch của ngón tay tính từ nóc hitbox (Dot là con hitbox nên style.top ăn theo hitbox) */
        let relativeY = clientY - hitboxRect.top;

        /* [Núm vặn chỉnh] TRACK_PADDING — Khe hở từ mương đến mép hitbox */
        /* Phải đúc y khuôn đống top/bottom của .rlog-scroll-track bên mâm CSS */
        const TRACK_PADDING = 4;          /* CSS: .rlog-scroll-track { top: 4px; bottom: 4px; } */
        const trackTop = TRACK_PADDING;
        const trackBottom = hitboxRect.height - TRACK_PADDING;
        relativeY = Math.max(trackTop, Math.min(trackBottom, relativeY));

        /* [Núm vặn chỉnh] DOT_HALF — Lấy bề dọc cái chấm cưa đôi */
        /* Đúc y khuôn mâm CSS .rlog-scroll-dot height (height/2) */
        const DOT_HALF = 2.5;               /* CSS: .rlog-scroll-dot { height: 6px; } → 6/2=3 */
        return (relativeY - DOT_HALF) + 'px';
    }

    /* Nhìn vị trí cái chấm mà phán coi cuộn tới đâu
       @param {number} clientY Tọa độ Y chọc trên web
       @returns {number} scrollTop đút túi */
    function dotPositionToScroll(clientY) {
        const hitboxRect = hitbox.getBoundingClientRect();
        const clientHeight = contentEl.clientHeight;
        const maxScroll = contentEl.scrollHeight - clientHeight;
        if (maxScroll <= 0) return 0;

        let relativeY = clientY - hitboxRect.top;
        const trackHeight = clientHeight - 8;
        const trackTop = 4;
        const trackBottom = trackTop + trackHeight;
        relativeY = Math.max(trackTop, Math.min(trackBottom, relativeY));

        /* Tỉ lệ đời cái chấm trong lòng mương (0~1) */
        const ratio = (relativeY - trackTop) / trackHeight;
        return Math.round(ratio * maxScroll);
    }

    function onPointerDown(e) {
        /* Bỏ qua mấy thằng bấm bậy (Chỉ chơi nút chuột trái/Chọt ngón tay) */
        if (e.button !== undefined && e.button !== 0) return;

        dragging = true;
        capturedPointerId = e.pointerId;
        hitbox.setPointerCapture(e.pointerId);
        hitbox.classList.add('active');

        /* Dịch chuyển tức thời cái chấm tới chỗ ấn tay, kéo luôn ruột chạy theo */
        dot.style.top = clientYToDotTop(e.clientY);
        contentEl.scrollTop = dotPositionToScroll(e.clientY);
        e.preventDefault();
    }

    function onPointerMove(e) {
        if (!dragging) return;

        const maxScroll = contentEl.scrollHeight - contentEl.clientHeight;
        if (maxScroll <= 0) return;

        /* Chấm lẽo đẽo theo tay */
        dot.style.top = clientYToDotTop(e.clientY);
        /* Cuộn lết theo chấm */
        contentEl.scrollTop = dotPositionToScroll(e.clientY);

        e.preventDefault();
    }

    function onPointerUp(e) {
        if (!dragging) return;
        dragging = false;
        hitbox.classList.remove('active');
        if (capturedPointerId !== null) {
            try { hitbox.releasePointerCapture(capturedPointerId); } catch (err) { /* Bơ đi mà sống */ }
            capturedPointerId = null;
        }
    }

    hitbox.addEventListener('pointerdown', onPointerDown);
    hitbox.addEventListener('pointermove', onPointerMove);
    hitbox.addEventListener('pointerup', onPointerUp);
    hitbox.addEventListener('pointercancel', onPointerUp);
    /* Lạc mất trói buộc thì tự nhả (Vé vớt) */
    hitbox.addEventListener('lostpointercapture', onPointerUp);

}

/* Nhổ cái thanh cuộn của một con .rmsg-content ném sọt rác, quét dọn sạch sẽ
   @param {HTMLElement} contentEl Đứa .rmsg-content xui xẻo */
function detachScrollbarForContent(contentEl) {
    const cleanup = scrollbarCleanups.get(contentEl);
    if (!cleanup) return;

    /* Bịt tai đéo nghe cuộn nữa */
    contentEl.removeEventListener('scroll', cleanup.scrollHandler);
    /* Rút tên khỏi sổ sinh tử của con mắt thần ResizeObserver */
    if (sharedResizeObserver) {
        try { sharedResizeObserver.unobserve(contentEl); } catch (e) { /* Im re */ }
    }
    /* Đá văng khỏi bầy đàn và danh sách ngâm lười */
    scrollbarElements.delete(contentEl);
    pendingScrollbarContentEls.delete(contentEl);
    if (scrollbarLazyObserver) {
        try { scrollbarLazyObserver.unobserve(contentEl); } catch (e) { /* Im re */ }
    }
    /* Giật sập hitbox trên DOM */
    if (cleanup.hitboxEl && cleanup.hitboxEl.parentNode) {
        cleanup.hitboxEl.remove();
    }
    scrollbarCleanups.delete(contentEl);
}

/* Lùa bầy quất hết một lượt thanh cuộn (overlay) cho ráo trọi .rmsg-content trong list
   Nhét vô xài lúc múa xong renderPanelContent, hay đắp đi xây lại lúc cụp/banh.
   Lột xác sang kiểu Đẻ Lười (Lazy Load): Nguyên bầy .rmsg-content ló mặt (hay léng phéng chực lọt) vào màn mới nặn ra thanh cuộn,
   Kéo một lèo 100+ tin nhắn ra mà nặn cức đái 100+ cái thanh cuộn thì máy văng mẹ lên nóc.
   @param {HTMLElement} listEl Cái thúng chứa bầy log */
function attachScrollIndicators(listEl) {
    /* Đập nát đám thanh cuộn cũ (Tại vì cái thằng renderPanelContent nó đái innerHTML bẩn tưởi DOM hết cmnr) */
    scrollbarCleanups.forEach((_, contentEl) => {
        detachScrollbarForContent(contentEl);
    });

    /* Tống hết đám .rmsg-content vào hầm ngâm lười (Mắt thần IntersectionObserver sẽ tự móc ra nặn khi đủ điều kiện) */
    queueScrollbarsForEls(listEl.querySelectorAll('.rmsg-content'));
}

/* ── Bảng điều khiển (Panel Control) ─────────────────────────── */

function togglePanelWindow() {
    isPanelCollapsed = !isPanelCollapsed;
    if (isPanelCollapsed) {
        const rect = panelEl.getBoundingClientRect();
        panelEl.dataset.rlogSavedWidth = rect.width;
        panelEl.dataset.rlogSavedHeight = rect.height;
        panelEl.classList.add('rlog-window-collapsed');
        panelEl.style.width = rect.width + 'px';
        panelEl.style.height = 'auto';
        panelEl.style.minHeight = '0';
        panelEl.style.maxHeight = 'none';
    } else {
        const savedW = panelEl.dataset.rlogSavedWidth;
        if (savedW) panelEl.style.width = savedW + 'px';
        /* Bung ra thì xả lỏng chiều cao auto, cho bụng ruột nó nẩy nở tùy nghi (Cái min/max-height CSS trói lại là được), */
        /* Không xả lỏng thì đóng cứng size làm log nặn ra không lấn ranh được */
        panelEl.style.height = 'auto';
        panelEl.style.minHeight = '';
        panelEl.style.maxHeight = '80vh';
        delete panelEl.dataset.rlogSavedWidth;
        delete panelEl.dataset.rlogSavedHeight;
        panelEl.classList.remove('rlog-window-collapsed');
        /* Banh bảng ra lại thì đem thước đo lại thanh tiêu đề (Lúc gập lại thì offsetHeight đo ra 0, hụt mốc dính) */
        syncRecordHeaderVars(panelEl.querySelector('#rlog-list'));
        /* Bị gập mà có rớt log mới vô, lúc banh ra thì auto đội lên nóc */
        /* (DOM tái sinh lúc nhắm mắt, mở ra thì trình duyệt rinh luôn view về chỗ cũ, nên phải đạp nó lòi lên) */
        if (pendingScrollToTop) {
            pendingScrollToTop = false;
            const listEl = panelEl.querySelector('#rlog-list');
            if (listEl) listEl.scrollTop = 0;
            /* Đang gập mà vớ được của chua, bung ra phi lên nóc thì nháy sáng mồi cái cho biết */
            flashTopHint();
        }
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
    toggleBtn.innerHTML = '<i class="fa-solid fa-book"></i> Lịch sử Request gần đây';
    toggleBtn.addEventListener('click', togglePanel);
    menu.appendChild(toggleBtn);

    /* Ngâm dấm một tí rồi nhét vô lại, đảm bảo chen lấn xuống chót mâm sau khi bọn lóc cóc kia đã chễm chệ */
    /* Dùng appendChild với thằng có mặt rồi thì chỉ tổ móc đít nó ra chót thôi */
    setTimeout(() => {
        if (toggleBtn && toggleBtn.parentNode) {
            toggleBtn.parentNode.appendChild(toggleBtn);
        }
    }, MENU_REORDER_DELAY_MS);
}

function buildUI() {
    if (uiBuilt) return;
    uiBuilt = true;

    addMenuEntry();

    /* Bốc cờ thiết lập đem treo */
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
                <span class="rlog-title-text" title="Click để Thu gọn/Mở rộng">Lịch sử Request gần đây</span>
                <span class="rlog-title-count" title="Nháy đúp sửa giới hạn">${getHeaderCountText()}</span>
            </h4>
            <div class="rlog-header-drag-space" style="flex: 1; height: 28px; cursor: move; margin: 0 10px;"></div>
            <div class="rlog-header-actions">
                <div class="rlog-more-drawer" id="rlog-more-drawer">
                    <div class="rlog-preview-segmented" id="rlog-preview-toggle" title="Công tắc xem trước nội dung">
                        <span class="rlog-seg-slider"></span>
                        <span class="rlog-seg-option rlog-seg-off">Giấu</span>
                        <span class="rlog-seg-option rlog-seg-on">Xem trước</span>
                    </div>
                    <button id="rlog-master-toggle" class="rlog-header-btn rlog-master-on" title="Công tắc Tổng: Đang bật — Bấm để dẹp">
                        <i class="fa-solid fa-power-off"></i>
                    </button>
                    <button id="rlog-help-btn" class="rlog-header-btn" title="Coi hướng dẫn sử dụng">
                        <i class="fa-solid fa-question"></i>
                    </button>
                    <button id="rlog-clear-btn" class="rlog-header-btn" title="Quét sạch mọi mẩu log">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                    <button id="rlog-theme-btn" class="rlog-header-btn" title="Chuyển Ngày/Đêm">
                        <i class="fa-solid fa-sun"></i>
                    </button>
                </div>
                <button id="rlog-more-btn" class="rlog-header-btn" title="Thêm Đồ chơi">
                    <i class="fa-solid fa-ellipsis"></i>
                </button>
                <button id="rlog-collapse-all-btn" class="rlog-header-btn" title="Bẹp nhí tất cả mẩu tin">
                    <i class="fa-solid fa-compress-alt"></i>
                </button>
                <button id="rlog-close-btn" class="rlog-close-btn" title="Cút luôn"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div class="rlog-panel-body">
            <div id="rlog-list" class="rlog-list">
                <div class="rlog-empty">${escapeHtml(masterEnabled ? 'Trống huơ, bắn gì đi rồi quay lại xem mậy.' : 'Chết ngỏm rồi, chọt icon nguồn để bật.')}</div>
            </div>
            <div class="rlog-resize-grip" title="Nắm kéo thả ga"></div>
        </div>
    `;

    panelEl.classList.remove('rlog-window-collapsed');

    document.body.appendChild(panelEl);

    /* Chia phe tiêu đề H4: Chữ thì chọt gập/mở, Số thì băm đúp xổ bảng cài số */
    {
        const textEl = panelEl.querySelector('.rlog-title-text');
        const countEl = panelEl.querySelector('.rlog-title-count');
        /* number|null: Bom hẹn giờ ngâm đếm nháy đúp (Chỉ cài cho cục số) */
        let countClickTimer = null;

        /* Mặt chữ: Chọt là gập/mở tức thì (Éo đợi chớp mắt) */
        textEl.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePanelWindow();
        });

        /* Mặt số: Đập đúp 2 cái thì ói hộp cài đặt (Chọt 1 cái chả có vẹo gì) */
        countEl.addEventListener('click', (e) => {
            e.stopPropagation();

            if (countClickTimer) {
                /* Bấm nhát thứ hai —— Duyệt, mài là nháy đúp */
                clearTimeout(countClickTimer);
                countClickTimer = null;
                showMaxRecordsDialog();
                return;
            }

            /* Bấm nhát đầu —— Gài bom, nín thở đợi cái nhát thứ hai */
            countClickTimer = setTimeout(() => {
                countClickTimer = null;
                /* Hết giờ mà đéo có nhát thứ hai thì câm như hến */
            }, DOUBLE_CLICK_THRESHOLD);
        });
    }

    const moreBtn = panelEl.querySelector('#rlog-more-btn');
    const moreDrawer = panelEl.querySelector('#rlog-more-drawer');
    moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moreDrawer.classList.toggle('expanded');
        if (moreDrawer.classList.contains('expanded')) {
            moreBtn.classList.add('active-drawer-btn');
        } else {
            moreBtn.classList.remove('active-drawer-btn');
        }
    });

    /* Giăng lính gác toàn vũ trụ, hễ đụng ra ngoài thì thu cái hộc "Nhiều Hơn" lại */
    if (!document.rlogMoreDrawerListenerInstalled) {
        document.rlogMoreDrawerListenerInstalled = true;
        document.addEventListener('click', (e) => {
            if (panelEl && isPanelVisible) {
                const drawer = panelEl.querySelector('#rlog-more-drawer');
                const btn = panelEl.querySelector('#rlog-more-btn');
                if (drawer && drawer.classList.contains('expanded')) {
                    /* Nếu dấu tay chọt đéo rớt vào hộc, cũng đéo dính nút mồi, thì rụt hộc vào */
                    if (!drawer.contains(e.target) && !btn.contains(e.target)) {
                        drawer.classList.remove('expanded');
                        btn.classList.remove('active-drawer-btn');
                    }
                }
            }
        });
    }

    panelEl.querySelector('#rlog-close-btn').addEventListener('click', hidePanel);

    panelEl.querySelector('#rlog-collapse-all-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        collapseAllEntries();
    });

    panelEl.querySelector('#rlog-clear-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (records.length === 0) {
            /* Vườn không nhà trống thì dẹp, chả ai hơi đâu đi xác nhận đấm khí */
            return;
        }
        showConfirmDialog({
            title: 'Quét sạch cả lò',
            message: `Quyết tâm tiễn dong cả lò <strong>${records.length}</strong> khúc log xuống suối vàng chưa?<br>Không hối hận được đâu nha con.`,
            confirmText: 'Sạch sẽ đi',
            cancelText: 'Hủy',
            onConfirm: () => {
                clearAllRecords();
            },
        });
    });

    panelEl.querySelector('#rlog-help-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.__RLogTour && typeof window.__RLogTour.start === 'function') {
            /* Nhét hộc về chỗ cũ rồi mới diễn trò */
            const moreDrawer = panelEl.querySelector('#rlog-more-drawer');
            const moreBtn = panelEl.querySelector('#rlog-more-btn');
            moreDrawer.classList.remove('expanded');
            moreBtn.classList.remove('active-drawer-btn');
            
            if (isPanelCollapsed) togglePanelWindow();
            
            window.__RLogTour.start();
        }
    });

    buildTempTestButton(panelEl);

    panelEl.querySelector('#rlog-theme-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        isLightTheme = !isLightTheme;
        saveTheme(isLightTheme);
        applyTheme();
        updateThemeButtonIcon();
        
        /* Bắn ma pháp thu phóng độc quyền của trò đổi mâm (Éo xài lúc cạy bảng lên) */
        panelEl.classList.remove('rlog-anim-light', 'rlog-anim-dark');

        /* Di động (Sân hẹp) bị cấm bùa đổi màu lướt mượt: Banh cả rổ tin mà dội 0.35s thì FPS lết bánh, */
        /* Áo đổi cái rụp trong hai shot RAF rồi mới quăng bùa thu phóng; */
        /* Mâm Desktop đại gia thì cứ giữ nguyên bùa mướt rượt (void offsetWidth dằn reflow ép nổ bùa lại). */
        /* Chú thích: Ép cái này éo hỏng màu gốc, chỉ là lột xác chớp nhoáng thôi. */
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        if (isMobile) {
            panelEl.classList.add('rlog-theme-transitioning');
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    panelEl.classList.remove('rlog-theme-transitioning');
                    if (isLightTheme) {
                        panelEl.classList.add('rlog-anim-light');
                    } else {
                        panelEl.classList.add('rlog-anim-dark');
                    }
                });
            });
        } else {
            /* Mâm Desktop: Vuốt mượt + Ép reflow xé vé múa bùa lại */
            void panelEl.offsetWidth;
            if (isLightTheme) {
                panelEl.classList.add('rlog-anim-light');
            } else {
                panelEl.classList.add('rlog-anim-dark');
            }
        }

        /* Múa may quay cuồng xong tự nhổ cờ dọn bãi, lỡ đóng ra mở vào nó múa lại nhức mắt */
        const onAnimEnd = () => {
            panelEl.classList.remove('rlog-anim-light', 'rlog-anim-dark');
            panelEl.removeEventListener('animationend', onAnimEnd);
        };
        panelEl.addEventListener('animationend', onAnimEnd);
    });
    updateThemeButtonIcon();

    /* Nối dây công tắc tông */
    const masterToggleBtn = panelEl.querySelector('#rlog-master-toggle');
    if (masterToggleBtn) {
        masterToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setMasterEnabled(!masterEnabled);
            e.target.blur();
        });
    }
    updateMasterToggleUI();

    /* Móc setting cũ của công tắc xem trước nội dung ra (Cắm xuống disk rồi) */
    contentPreviewEnabled = loadContentPreview();
    updatePreviewToggleUI();

    /* Gắn dây công tắc xem trước */
    const previewToggleEl = panelEl.querySelector('#rlog-preview-toggle');
    if (previewToggleEl) {
        previewToggleEl.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleContentPreview();
        });
    }

    makeDraggable(panelEl);
    makeResizable(panelEl);

    /* Co dãn viewport/panel ngang (Gồm trò xách Đt lật xoay hay kéo núm bên góc) làm xô bồ độ cao thanh tiêu đề log, */
    /* Mang thước ra đo đạc cọc ghim (--rlog-rec-h) */
    if (!window.rlogHeaderVarResizeInstalled) {
        window.rlogHeaderVarResizeInstalled = true;
        window.addEventListener('resize', () => {
            syncRecordHeaderVars(panelEl && panelEl.querySelector('#rlog-list'));
        });
    }

    /* Gắn lính gác nghe hơi nồi chõ nguồn vào (Thích nghe ai thì nghe, éo ngán công tắc tổng) */
    installSourceTracking();

    /* Bắn lưới fetch cắm cọc (Hook nằm im một chỗ, masterEnabled mới là thằng gác cửa xem có mổ xẻ không) */
    installFetchHook();

    renderPanelContent();
}

function updateThemeButtonIcon() {
    const btn = panelEl ? panelEl.querySelector('#rlog-theme-btn') : null;
    if (!btn) return;
    btn.innerHTML = isLightTheme
        ? '<i class="fa-solid fa-moon"></i>'
        : '<i class="fa-solid fa-sun"></i>';
}

function togglePanel() {
    isPanelVisible ? hidePanel() : showPanel();
}

function showPanel() {
    if (!panelEl) buildUI();
    panelEl.style.display = 'flex';
    isPanelVisible = true;
    if (toggleBtn) toggleBtn.classList.add('active');
    /* Rác rưởi thay đổi tao mới cất công quét dọn đắp lại DOM; Ngoan ngoãn thì giữ y mặt cũ, đỡ giật khi kéo nguyên bầy tin nhắn */
    if (panelContentDirty) {
        renderPanelContent();
    }
    /* Tháo bạt ra thì móc thước đo lại trần tiêu đề log: Lúc nhắm mắt render thì offsetHeight = 0 tròn trĩnh, */
    /* Cọc ghim của thanh tiêu đề con (--rlog-rec-h) phải bú size thực lúc ló mặt ra */
    syncRecordHeaderVars(panelEl.querySelector('#rlog-list'));
    /* Trong lúc bưng bít mà có thằng lọt hố, mở ra phi lên cắm chóp ngay tắp lự */
    if (pendingScrollToTop && !isPanelCollapsed) {
        pendingScrollToTop = false;
        const listEl = panelEl.querySelector('#rlog-list');
        if (listEl) listEl.scrollTop = 0;
        /* Đắp chăn mà vớ bẫm, mở ra vuốt lên nóc thì nháy nhá cái cho biết hàng mới */
        flashTopHint();
    }

    /* Mở bạt lật thảm rồi ngó coi có cần chăn dắt lùa vào bài hướng dẫn không */
    if (window.__RLogTour && typeof window.__RLogTour.check === 'function') {
        setTimeout(() => window.__RLogTour.check(), 300);
    }
}

function hidePanel() {
    /* Úp bạt vô mặt thì giải tán gánh hát tìm kiếm */
    resetSearchIfActive();
    /* Úp bạt thì dập mấy thằng chớp chớp mỏi mắt đang chờ (Kẻo úp rồi tí sau nó chớp chớp trên cái bóng ma DOM) */
    cancelPendingFlash();
    /* Úp bạt thì lén tháo luôn cái màn "Xem Toàn Văn" (Nếu có đang vắt vẻo) */
    closeReadFullOverlay();
    if (panelEl) {
        /* Bóc gỡ tàn tích chớp lóa đáy nhảy, cấm cửa chuyện ngứa đít chớp lại lúc phanh ra */
        let cleared = false;
        panelEl.querySelectorAll('.rmsg-header.rlog-flash-bottom, .rlog-record-header.rlog-flash-bottom').forEach(el => {
            el.classList.remove('rlog-flash-bottom');
            cleared = true;
        });
        /* Đóng sập = Phanh thây chủ động: Dẹp mẹ bảng thời gian, mở lại reply éo được chớp bù */
        if (cleared) lastTopHintFlashAt = 0;
        panelEl.style.display = 'none';
        /* Đắp mền thì gọt sạch dăm ba cái ma pháp theme lởn vởn, tránh giật mòng mòng lúc tháo mền */
        panelEl.classList.remove('rlog-anim-light', 'rlog-anim-dark');
    }
    isPanelVisible = false;
    if (toggleBtn) toggleBtn.classList.remove('active');
}


/* ── Kéo thả & Thu phóng ────────────────────────── */

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
        /* Dập ghim lề Trái/Trên: Tướng tá bảng nguyên thủy nằm giữa (left:50% + translateX(-50%)), */
        /* Chọt ngang mỗi cái width thì hai lề nó dạng rộng ra hai bên; Bắt chước múa kéo thanh tiêu đề, cột cứng left/top thì */
        /* Kéo núm chỉ thò thụt rìa Phải/Dưới thôi (Đúng form của mấy cục tam giác kéo dưới góc). */
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
        /* Rập khuôn y chang mousedown: Ghim lề Trái/Trên, bành chướng Phải/Dưới */
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
            /* Kéo bành ra bóp vô làm mớ chữ bị tống xuống/trồi lên cộm chiều cao, đem thước ra phang lại */
            syncRecordHeaderVars(panelEl && panelEl.querySelector('#rlog-list'));
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
        }
    });
})();

function makeDraggable(el) {
    const header = el.querySelector('.rlog-panel-header');
    if (!header) return;

    let startX, startY, origX, origY;
    let dragging = false;

    header.style.cursor = 'move';

    header.addEventListener('mousedown', (e) => {
        /* Miễn táy máy vô bầy nút, chữ H4 với công tắc xem trước (Mấy cục này có sân chơi riêng, đéo chịu hầu kèo lôi xềnh xệch) */
        if (e.target.tagName === 'BUTTON' || e.target.closest('h4') || e.target.closest('#rlog-preview-toggle')) return;
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
        if (e.target.tagName === 'BUTTON' || e.target.closest('h4') || e.target.closest('#rlog-preview-toggle')) return;
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
            /* Kéo lê không móp méo chiều ngang, nhưng cứ lôi thước đo phủ đầu cho hên xui mấp mé nhích qua dòng */
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

/* ── Khởi tạo (Init) ──────────────────────────── */

function init() {
    if (!window.SillyTavern || typeof window.SillyTavern.getContext !== 'function') {
        console.debug(`[${PLUGIN_KEY}] Nín thở nằm chờ SillyTavern trỗi dậy...`);
        setTimeout(init, INIT_RETRY_ST_MS);
        return;
    }

    const ctx = window.SillyTavern.getContext();
    if (!ctx || !ctx.eventSource || !ctx.event_types) {
        console.debug(`[${PLUGIN_KEY}] Bộ sậu ST chưa tề tựu, lát hóng tiếp...`);
        setTimeout(init, INIT_RETRY_CTX_MS);
        return;
    }

    eventSource = ctx.eventSource;
    event_types = ctx.event_types;

    /* Gọi mộc APP_READY lên dập hoặc xài đồng hồ chọt đít để build UI, rặn một lần thôi */
    const tryBuildUI = () => {
        if (!uiBuilt) buildUI();
    };

    eventSource.once(event_types.APP_READY, () => {
        tryBuildUI();
    });

    /* Phòng hờ: Mẹ kiếp nhỡ APP_READY nó bắn qua mặt rồi (Kiểu plugin vào trễ mâm), phang luôn hàm build */
    setTimeout(() => {
        tryBuildUI();
    }, APP_READY_FALLBACK_MS);

    console.debug(`[${PLUGIN_KEY}] Ngóc đầu lên rồi - Giấu mặt nghe lén prompt bay`);
}

init();

/* ── API ra bên ngoài ───────────────────────── */

window.__RLogApi = {
    records: () => records,
    /* Mớ hầm bà lằng Tìm Kiếm (Phục vụ tận răng cho tour.js) */
    openSearchForRecord: (recordIndex) => openSearchForRecord(recordIndex),
    performSearch: (recordIndex, keyword) => performSearch(recordIndex, keyword),
    closeSearch: () => closeSearch(),
    injectDemo: () => {
        const demoRecord = {
            characterName: 'Nhân vật vô danh',
            timestamp: new Date().toLocaleString('zh-CN', { hour12: false }),
            source: { type: 'plugin', label: 'Plugin', detail: 'Request Plugin/Không phải Native' },
            modelName: 'Human-Brain-1.0-Pro',
            messages: [
                { 
                    role: 'assistant', 
                    content: '<thinking>\nĐang ấp ủ rặn mẫu tin nhắn...\n\nKhoan, điền mẹ gì vô mẫu cho ngầu ta?\nỦa rảnh háng đi múa cái trò này làm gì?\nThôi, chém đại một mớ đi cho lẹ.\n</thinking>\n\nXin chào! Chào mừng tới cái ổ chứa plugin này.', 
                    tokens: 42, 
                    collapsed: false, 
                    tokenPrecise: true 
                }
            ],
            collapsed: false,
            isDemo: true /* Lấy bút xóa đỏ khoanh lại làm đồ mượn (để lát xóa) */
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
    /* Bứng trọn ổ nhét lại bầy log mới (Phục vụ tour.js quét rác lúc lột đồ / dọn đồ vào) */
    setRecords: (newRecords) => {
        records = Array.isArray(newRecords) ? newRecords : [];
        /* Giữ lề lối "Đừng húp lố hạn ngạch" (Lúc nhét trả có khi ních lố ổ) */
        if (records.length > MAX_RECORDS) {
            records.length = MAX_RECORDS;
        }
        panelContentDirty = true;
        if (panelEl && isPanelVisible) renderPanelContent();
    },
    /* Cầm chốt màn Hướng dẫn (Phục vụ tour.js): Lúc múa thì hốt giam hết log mới nhú, không cho ra chầu chực */
    setTourActive: (active) => {
        tourActive = !!active;
    },
    /* Vắt cạn ổ giam nhốt đám log đẻ lúc dở màn hướng dẫn (Để endTour xách ra ghép vào) */
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
};

/* ── Tính năng test tạm (Bình chứa cồn) ───────────────────────── */

/* number|null: Dụng cụ tuồn xén gầm: Đạp lún mốc timeout (Cho simulateReplyTimeout phô diễn múa may, dọn dẹp sau) */
let replyTimeoutOverrideMs = null;

/* Chọc ngoáy bom nổ tất tần tật mớ test (Đồ bỏ đi, làm xong xóa):
   1. Đẻ 8 thằng Token lởm để đọ mốc màu (tier 0-7, test màu mẻ)
   2. Nặn 1 mẩu xạo chó reply Suôn Sẻ (Khoe nhãn Succeed)
   3. Ị ra 1 cục xịt ngỏm (Khoe nhãn Fail, khạc HTTP 500)
   4. Bấm bom đếm giờ ngỏm (Thở thoi thóp 2 giây hẻo → Nảy nhãn Timeout)
   Mâm Di động: Lọt vô hộc "Nhiều hơn" đâm cái bình thí nghiệm là ọe ra liền;
   Mâm Desktop: Cứ băm window.__RLogApi.injectTokenTierTest() trong F12 mà húp. */
window.__RLogApi.injectTokenTierTest = function injectTokenTierTest() {
        /* Barem cân đo đong đếm cho mấy em màu mè (Tương đương mấy ngưỡng getTokenTier) */
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
                characterName: 'Mẩu ví dụ lởm',
                timestamp: tsStr(ts),
                source: { type: 'plugin', label: 'Plugin', detail: 'Request Plugin/Không phải Native' },
                modelName: 'Model-Mù-Mờ',
                messages: [{
                    role: 'system',
                    content: `Nếm mùi chênh mốc ${t.label}`,
                    tokens: t.tokens,
                    collapsed: true,
                    tokenPrecise: true,
                }],
                collapsed: true,
                isDemo: true, /* Dán chữ đỏ cảnh báo xạo l, removeDemo móc ra chém được */
            };
        });

        /* Khạc log mốc họng Thành/Bại (Xài test rà mặt Succeed/Fail với đụ chạc nhồi Response) */
        const successRecord = {
            characterName: 'Mẫu Tốt Lành',
            timestamp: tsStr(new Date(baseTs.getTime() - 8 * 60000)),
            source: { type: 'native', label: 'Gốc (Native)', detail: 'Tự sướng thôi' },
            modelName: 'Model-Mù-Mờ',
            messages: [{
                role: 'user',
                content: 'Gửi request điu điu: Khúc này làm nền múa nhãn Thành Công.',
                tokens: 96,
                collapsed: true,
                tokenPrecise: true,
            }],
            collapsed: true,
            isDemo: true,
            reply: {
                role: 'response',
                content: '<think>\nĐộng não lỏm: Thằng não tàn suy nghĩ tàm tạm nặn ra cức.\n</think>\n\nRep lỏm: Khúc này tuôn chữ ào ạt dài thòng để phô cái màu Succeed thơm phức.',
                tokens: 188,
                tokenPrecise: true,
                collapsed: true,
                status: 'succeed',
                failReason: '',
                time: tsStr(new Date(baseTs.getTime() - 8 * 60000 + 5000)),
            },
        };
        const failRecord = {
            characterName: 'Mẫu Oẳng Chó',
            timestamp: tsStr(new Date(baseTs.getTime() - 9 * 60000)),
            source: { type: 'native', label: 'Gốc (Native)', detail: 'Tự sướng thôi' },
            modelName: 'Model-Mù-Mờ',
            messages: [{
                role: 'user',
                content: 'Gửi request điu điu: Nặn cục này rớt đài thê thảm nè.',
                tokens: 88,
                collapsed: true,
                tokenPrecise: true,
            }],
            collapsed: true,
            isDemo: true,
            reply: {
                role: 'response',
                content: 'HTTP 500', /* Y chang đường lối thật: Tạch là phết mực chửi thẳng vô mâm chính (Trên Đt lướt thấy ngay đéo cần rờ vô) */
                tokens: 2,
                tokenPrecise: true,
                collapsed: true,
                status: 'fail',
                failReason: 'HTTP 500',
                time: tsStr(new Date(baseTs.getTime() - 9 * 60000 + 3000)),
            },
        };

        /* Đá bạt đám demo cũ đi, khỏi nằm chất đống lên nhau dơ dáy */
        records = records.filter(r => !r.isDemo);
        records.unshift(...tierRecords);
        records.unshift(failRecord, successRecord);
        panelContentDirty = true;
        if (panelEl && isPanelVisible) renderPanelContent();

        /* Chọt đít nhử trò Time Out: 2s đứt bóng thoi thóp, cắn vào gót addRecord nặn nhãn Timeout */
        if (window.__RLogApi && typeof window.__RLogApi.simulateReplyTimeout === 'function') {
            window.__RLogApi.simulateReplyTimeout({
                reasoning: 'Lão não lỏm đút: Ngâm mớ não thúi đâm ra đơ luôn...',
                content: 'Cức phọt rưỡi: Đây là dòng chữ đang khạc dở.',
            });
        }
    };
    /* Hàng mã múa may (Tính năng 1 lấn): Múa trò "Ngâm 5 phút sủi tăm".
       Chờ 5 phút thực chiến vêu mỏ, ép số hẹp xuống 2s múa liền:
       Múa con đường ngó bộ nhú request, reply bặt tăm, canh 2s nứt mác chốt hạ Timeout,
       Lượm nhãn vô và găm y nguyên đống cứt đái nửa mùa (Nếu có rặn được xíu).
       @param {object} [opts] { reasoning, content } Cứt đái mô phỏng
       @returns {number|null} Mã tem nhồi xảo captureId (Chốt tổng khóa mỏ thì nhổ null) */

window.__RLogApi.simulateReplyTimeout = function simulateReplyTimeout(opts = {}) {
        if (!masterEnabled) {
            console.warn(`[${PLUGIN_KEY}] Kéo sập cầu dao rồi, múa mụ nội mài à.`);
            return null;
        }
        const savedOverride = replyTimeoutOverrideMs;
        replyTimeoutOverrideMs = 2000; /* Bấm thụt lùi xuống 2s test cho lẹ */
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
        /* Khều y luồng đẻ log thực chiến (Nhét timestamp cho khỏi dính bẫy 500ms chống chép bài) */
        addRecord(
            'Mẫu Hết Giờ',
            [{ role: 'user', content: `[Thử Kéo Giờ] Đợi mõm đéo ra bọt · ${Date.now()}` }],
            { type: 'native', label: 'Gốc (Native)', detail: 'Kéo giờ lỏm' },
            'Model-Mù-Mờ',
            null,
            captureId
        );
        replyTimeoutOverrideMs = savedOverride; /* Nhả phanh về nguyên trạng (Éo ném vào quả log vừa đâm đâu) */
        console.debug(`[${PLUGIN_KEY}] Bơm ống thuốc nhử Timeout thành công, chờ 2s trổ mác. `);
        return captureId;
    };

function buildTempTestButton(panelEl) {
    const btn = document.createElement('button');
    btn.id = 'rlog-test-btn';
    btn.className = 'rlog-header-btn';
    btn.title = 'Bơm data rác lởm (Dải màu Token / Trơn Tuột / Sấp Mặt / Hết Giờ)';
    btn.innerHTML = '<i class="fa-solid fa-vial"></i>';
    const helpBtn = panelEl.querySelector('#rlog-help-btn');
    if (helpBtn) {
        helpBtn.insertAdjacentElement('afterend', btn);
    } else {
        const drawer = panelEl.querySelector('#rlog-more-drawer');
        if (drawer) drawer.appendChild(btn);
    }
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.__RLogApi && typeof window.__RLogApi.injectTokenTierTest === 'function') {
            window.__RLogApi.injectTokenTierTest();
            /* Tiêm đồ lỏm xong cụp hộc "Thêm đồ chơi" lôi mẹt đống rác ra khoe */
            const moreDrawer = panelEl.querySelector('#rlog-more-drawer');
            const moreBtn = panelEl.querySelector('#rlog-more-btn');
            moreDrawer.classList.remove('expanded');
            moreBtn.classList.remove('active-drawer-btn');
        }
    });
}