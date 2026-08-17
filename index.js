/**
 * Plugin bên thứ 3 cho SillyTavern: Nhật ký yêu cầu gần đây (Recent Request Log) ✨
 *
 * Cách cài đặt: Copy nguyên cái thư mục RecentRequestLog ném vào đường dẫn
 * SillyTavern/public/scripts/extensions/third-party/ nha!
 * Xong rồi khởi động hoặc f5 lại SillyTavern là lụm. (๑•̀ㅂ•́)و✧
 *
 * Tính năng siêu việt của Tawa:
 *  - Âm thầm cào sạch sành sanh toàn bộ prompt gửi cho AI mỗi lần. 🥷
 *  - Trưng bày tin nhắn theo từng role, tiện thể nhẩm tính luôn token. 🧠
 *  - Mặc định là gập gọn log lại, chọt vô là bung/gập nha.
 *  - Tin nhắn cũng gập sẵn, chọt vô tiêu đề là bung/gập từng cái.
 *  - Hỗ trợ copy 1 click cho từng tin nhắn lẻ hoặc nguyên một cục log. 📋
 *  - Nhớ dai tối đa 10 log (cũ quá thì bị đè bẹp).
 *  - Chỉ lưu tạm trong RAM thôi, f5 hoặc tắt tab là bay màu sạch sẽ. 💨
 *  - Có nút clear thanh tẩy toàn bộ log.
 *  - Chơi trò đổi màu Sáng/Tối (Nhớ dai qua mùa quýt). ☀️🌙
 *  - Chọt thanh tiêu đề là bung/gập toàn bộ log trong 1 nốt nhạc.
 *  - Hack thẳng vào tầng network chặn cổ lệnh fetch để tóm gọn prompt gửi cho AI. 🕸️
 */

// ── Gọi hồn tour.js bằng ma pháp động ──────────────────────────────
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

// ── Hằng số cõi toàn cục ──────────────────────────────────────
const PLUGIN_KEY = 'RecentRequestLog';
const DEFAULT_MAX_RECORDS = 10;         // Giới hạn log mặc định
const MIN_MAX_RECORDS = 10;              // Mức thấp nhất Editor được set
const MAX_MAX_RECORDS = 100;            // Mức chạm nóc (Khóa mỏm tụi spam lạm dụng) 🛑
const DOUBLE_CLICK_THRESHOLD = 350;     // Tốc độ click đúp (ms), bấm lẹ hơn cái này mới tính là double click 🖱️
const STORAGE_THEME_KEY = `${PLUGIN_KEY}_theme`;
const STORAGE_MASTER_KEY = `${PLUGIN_KEY}_masterEnabled`;
const STORAGE_MAX_RECORDS_KEY = `${PLUGIN_KEY}_maxRecords`;  // Nhớ dai số log tối đa
const STORAGE_PREVIEW_KEY = `${PLUGIN_KEY}_contentPreview`;  // Nhớ dai cái công tắc soi trước nội dung 👀
const NATIVE_INTENT_WINDOW_MS = 5000;

// ── Số log tối đa biến ảo (Nhớ dai + Đổi được lúc đang chạy) ──────────
/** @type {number} Giới hạn log đang kích hoạt, bới từ localStorage ra hoặc xài hàng mặc định */
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

// ── Mấy cái tham chiếu ST ngâm lâu mới chịu khởi tạo ──────────────────────────
/** @type {object|null} ST eventSource */
let eventSource = null;
/** @type {object|null} ST event_types */
let event_types = null;

// ── Kho biến trạng thái ──────────────────────────────────────
/** @type {Array} Danh sách chiến lợi phẩm cào được */
let records = [];

/** @type {boolean} Cẩm nang tân thủ có đang chạy hông (Lúc chạy thì log mới tới bị nhốt lại, hông cho lên sóng để khỏi phá DOM nha) */
let tourActive = false;

/** @type {Array} Đống log bị nhốt lúc đi tour (Đi xong thì endTour lôi ra trộn lại, bao hông mất 1 cọng lông) */
let tourPendingRecords = [];

/** @type {HTMLElement|null} Cục DOM của bảng điều khiển */
let panelEl = null;

/** @type {HTMLElement|null} Cái nút bấm trong menu extension */
let toggleBtn = null;

/** @type {boolean} Bảng điều khiển có đang lòi mặt ra hông */
let isPanelVisible = false;

/** @type {boolean} Ruột gan bảng điều khiển có cần đập đi xây lại hông (Có data mới thì gán true, render xong xõa về false)
 * Đóng bảng thì DOM vẫn sống nhăn; chừng nào data/style đổi thì lần mở sau mới thèm xây lại DOM,
 * Né ba cái trò giật lag cùi bắp khi phải vẽ lại ngàn cái tin nhắn lúc mở bảng. 🧠✨ */
let panelContentDirty = true;

/** @type {boolean} Có đang bật Mode Ánh Sáng hông ☀️ */
let isLightTheme = false;

/** @type {boolean} Cái bảng có đang bị cuộn tròn lại hông */
let isPanelCollapsed = false;

/** @type {boolean} Lúc tàng hình/cuộn tròn mà có log mới tới, lúc hiện lại phải bay lên đỉnh danh sách nha 🔝 */
let pendingScrollToTop = false;

/** @type {boolean} Cầu dao tổng có đang bật hông (Nhớ dai qua localStorage, mới cài là bật luôn) 🔌 */
let masterEnabled = true;

/** @type {HTMLElement|null} Cục DOM của cái bảng chưởng set số log tối đa */
let maxRecordsDialog = null;

// Đồ nghề cho trò kéo lê/thu phóng bảng 🐾📐
let panelResizing = false;
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartW = 0;
let resizeStartH = 0;

// ── Đồ nghề phục vụ chặn cổ fetch ─────────────────────────
/** @type {Function|null} Bức tranh gốc của window.fetch */
let originalFetch = null;

/** @type {Function|null} Lớp ngụy trang fetch đang gắn vô */
let currentHook = null;

/** @type {boolean} Bùa chống dội ngược lúc hook fetch đang múa 🛡️ */
let fetchHookInFlight = false;

/** @type {string|null} Dấu vân tay của đống messages lần trước, dùng để triệt tiêu hàng clone 🔍 */
let lastRecordFingerprint = null;

/** @type {number} Dấu ấn thời gian của log trước */
let lastRecordTime = 0;

/** @type {{ timestamp: number, target: string, source: 'click'|'pointerdown'|'keydown' }|null} Dấu vết chọt tay vào nút sinh text Native của ST gần đây nhất 🐾 */
let lastNativeIntent = null;

/** @type {boolean} Đã gắn đồ nghe lén nút bấm Native chưa */
let sourceTrackingInstalled = false;

/** @type {boolean} UI xây xong chưa (Chống lại trò gọi init() 2 lần đẻ ra sinh đôi) */
let uiBuilt = false;

/** @type {boolean} Công tắc soi trước nội dung, mặc định là tắt (Nhớ dai qua localStorage) 👀 */
let contentPreviewEnabled = false;

/** @type {boolean|null} Bạo chúa đè bẹp công tắc soi trước (Để diễn trò lúc đi tour) */
let forcePreviewState = null;

/** @type {object|null} Trạng thái dò mìn hiện tại (Mỗi lần chỉ soi được 1 log thôi nha)
 * Cấu trúc: { recordIndex, keyword, matches, currentIdx, searchEl }
 * - recordIndex: Số báo danh của log đang bị soi
 * - keyword: Từ khóa đang tra (Để coi có cần tìm lại hông)
 * - matches: Array<{ msgIdx, start, end }> Tọa độ của đống mìn
 * - currentIdx: Đang tô sáng cục mìn thứ mấy (-1 là hông có mìn)
 * - searchEl: Cục DOM chứa cái ô gõ chữ tìm kiếm
 */
let searchState = null;

/** @type {number|null} ID của cái đồng hồ cát debounce gõ tìm kiếm */
let searchDebounceTimer = null;

/** @type {number} Độ trễ chống rung gõ tìm kiếm (ms), gõ xong nín thở chút mới tìm nha */
const SEARCH_DEBOUNCE_MS = 120;

/**
 * Lột mặt nạ "gia tộc" từ tên model 🕵️‍♀️
 * Anh em cùng nhà xài chung 1 máy chém token (tokenizer) (Kiểu như gemini-3.1-pro-preview với gemini-3.6-flash đều là con cháu nhà gemini).
 * Logic bắt mạch y xì đúc hàm getTokenizerModel() trong tokenizers.js của ST nha.
 * @param {string} modelName Tên model
 * @returns {string} Mã gia tộc, nhận hông ra thì ném trả cái tên gốc viết thường
 */
function extractModelFamily(modelName) {
    if (!modelName || modelName === 'Model ẩn danh') return '';
    const m = modelName.toLowerCase();

    // Gia tộc GPT: gpt, o1, o3, o4, davinci, turbo
    if (m.includes('gpt') || m.includes('o1-') || m.includes('o3-') || m.includes('o4-') || m.includes('davinci')) return 'gpt';

    // Gia tộc Claude
    if (m.includes('claude')) return 'claude';

    // Gia tộc Gemini/Gemma (Hàng nhà Google xài tokenizer của Gemma hết)
    if (m.includes('gemini') || m.includes('gemma') || m.includes('palm')) return 'gemini';

    // Gia tộc Llama: llama, mistral, mixtral, qwen, deepseek, yi, command-r, command-a, nemo, pixtral, jamba
    if (m.includes('llama') || m.includes('mistral') || m.includes('mixtral') || m.includes('qwen') || m.includes('deepseek') || m.includes('command-r') || m.includes('command-a') || m.includes('yi-') || m.includes('nemo') || m.includes('pixtral') || m.includes('jamba')) return 'llama';

    // Gia tộc NovelAI
    if (m.includes('kayra') || m.includes('clio') || m.includes('erato')) return 'novelai';

    // Hông biết con nhà ai, quăng tên gốc ra làm mã gia tộc luôn (Khớp y chang cũng được) 🤷‍♀️
    return m;
}

/**
 * Coi bói xem hai cái model có cùng 1 giuộc hông (Share chung tokenizer)
 * Chỉ cần extractModelFamily phán là cùng nhà thì quất true nha.
 * @param {string} modelA Tên model A (Bắt từ body của request)
 * @param {string} modelB Tên model B (Móc từ API chính của ST)
 * @returns {boolean} Có cùng gia tộc hông
 */
function isSameModelFamily(modelA, modelB) {
    if (!modelA || modelA === 'Model ẩn danh' || !modelB) return true; // Hông bói ra thì Tawa nhắm mắt cho qua là tương thích tuốt 🙈
    return extractModelFamily(modelA) === extractModelFamily(modelB);
}

/**
 * Gọi hồn tokenizer Native của ST ra để tính Token cho đống tin nhắn (Bất đồng bộ nha) 🪄
 * Ưu tiên bú ké getTokenCountAsync của ST context, tạch thì xài trò đếm byte bói mò.
 * Tính từng dòng một, ra số thì nhét thẳng vô cục tokens của tin nhắn luôn.
 * @param {Array} messages Đống tin nhắn, mỗi tin phải có cái ruột content
 * @param {string} modelName Tên model móc từ request, đem khè với model của ST API coi tokenizer có chịu hông
 */
async function computeTokensForMessages(messages, modelName) {
    const ctx = window.SillyTavern && typeof window.SillyTavern.getContext === 'function'
        ? window.SillyTavern.getContext()
        : null;
    const getTokenCountAsync = ctx && ctx.getTokenCountAsync;

    if (!getTokenCountAsync) {
        // Bí quá hóa liều: ST context ngủm thì chơi trò đếm byte y như ST (BYTES_PER_TOKEN = 3.35) 📉
        const textEncoder = new TextEncoder();
        for (const msg of messages) {
            const byteLength = textEncoder.encode(msg.content).length;
            msg.tokens = Math.ceil(byteLength / 3.35);
            msg.tokenPrecise = false; // Đóng mác đồ fake, UI sẽ thảy thêm dấu ~ lên đầu
        }
        return;
    }

    // Thó tên model hiện tại của ST API, đem khè với model của request coi tokenizer có chung mâm hông
    let stModelName = '';
    try {
        if (ctx && typeof ctx.getChatCompletionModel === 'function') {
            stModelName = ctx.getChatCompletionModel();
        }
    } catch (e) { /* ignore */ }

    // Đọ theo gia tộc (chứ hông thèm chơi tên full): Anh em cùng nhà xài chung tokenizer, khỏi cần hiện dấu ~ 😤
    const tokenizerCompatible = isSameModelFamily(modelName, stModelName);

    // Dùng tokenizer Native của ST chém từng dòng một (Tách lẻ request ra, ST có bộ nhớ đệm xịn lắm) 🪓
    for (const msg of messages) {
        try {
            msg.tokens = await getTokenCountAsync(msg.content, 0);
            msg.tokenPrecise = tokenizerCompatible; // Chỉ khi tên model khớp gia phả mới tính là hàng Auth nha
        } catch (e) {
            // Kêu tokenizer hông thưa thì lôi trò đếm byte ra xài đỡ
            const byteLength = new TextEncoder().encode(msg.content).length;
            msg.tokens = Math.ceil(byteLength / 3.35);
            msg.tokenPrecise = false;
        }
    }
}

// ── Kiểm duyệt cơ thể của cái Request AI ────────────────────────────

/**
 * Đặc điểm nhận dạng cục chat nội bộ của ST — Dùng để sút bay mấy cái data chat hông phải AI
 * Hàng Real gửi cho AI cấu trúc vầy nè: { role, content }
 * Còn kho cất chat của ST thì tạp nham thế này: { chat_metadata, mes, swipe_id, send_date, is_user, is_system, ... }
 */
const ST_INTERNAL_MSG_KEYS = new Set([
    'chat_metadata', 'mes', 'swipe_id', 'send_date', 'is_user', 'is_system',
    'extra', 'gen_id', 'gen_start', 'gen_finished', 'swipes', 'swipe_info',
    'fork', 'fork_id', 'ch_name', 'file_name', 'integrity', 'note_prompt',
    'note_interval', 'note_position', 'note_depth', 'note_role',
    'timedWorldInfo', 'LWB_PENDING_VAREVENT_BLOCKS',
]);

/**
 * Đoán mò xem cái đầu vào fetch đang trỏ tới URL nào.
 */
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

/**
 * Khám xét cực kỳ nghiêm ngặt coi có phải hàng chuẩn AI hông. 🕵️‍♀️
 * Tawa cố tình chỉ vớt role + content thôi, chống chỉ định túm nhầm đống lịch sử chat ST, thẻ nhân vật hay mớ data khởi động hệ thống! 🛑
 */
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

/**
 * Đoán xem body request có phải là lệnh bắt AI nhả chữ hông.
 * Lấy form làm chuẩn, URL với thông số sinh text chỉ làm bia đỡ đạn, cốt để đá đít mấy cái API nội bộ của ST lúc load game/vô chat.
 * 
 * Tối ưu hóa hóa: Khám từ rẻ rúng tới đắt đỏ nha—— 💰
 *   1. Check kiểu dữ liệu cơ bản (Hàng Free)
 *   2. Đá văng URL cấm (Soi chuỗi)
 *   3. Quét key ngoài da (hasGenerationRequestHints + generationUrl)
 *   4. Lục tung array + khám từng em (Hút máu nhất, chỉ làm khi da lông có dấu hiệu khả nghi)
 */
function isAiRequestBody(body, requestUrl) {
    // Check rẻ 1: Kiểu cơ bản
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;

    // Check rẻ 2: URL nằm trong blacklist (Soi chuỗi cái rẹt, khỏi lướt array)
    if (isExplicitNonGenerationUrl(requestUrl)) return false;

    // Check rẻ 3: Quét ngoài da — Chỉ ngó cái dàn key của body
    const generationUrl = isPotentialGenerationUrl(requestUrl);
    const hasHints = hasGenerationRequestHints(body);

    // Nếu chả thấy URL sinh text mà thông số cũng bặt vô âm tín, cộng thêm ngoài da chả có messages/chat/contents/system+prompt,
    // Thì sủi lẹ đi, rảnh đâu mà lặn hụp vô array khám từng em cho tốn kém 💨
    if (!generationUrl && !hasHints) {
        // Coi thử ngoài da có mấy cái array hay chứa tin nhắn hông
        const hasMessagesArray = Array.isArray(body.messages) && body.messages.length > 0;
        const hasChatArray = Array.isArray(body.chat) && body.chat.length > 0;
        const hasContentsArray = Array.isArray(body.contents) && body.contents.length > 0;
        const hasSystemPrompt = typeof body.system === 'string' && body.system.length > 0;
        const hasPlainPrompt = typeof body.prompt === 'string' && body.prompt.length > 0;

        // Hông có cái túi nào đựng tin nhắn thì té lẹ
        if (!hasMessagesArray && !hasChatArray && !hasContentsArray && !hasSystemPrompt && !hasPlainPrompt) {
            return false;
        }

        // Nếu có prompt nhưng thiếu generationUrl/hasHints, thì chắc là mồi chữ thuần (plain prompt)
        if (hasPlainPrompt && !hasMessagesArray && !hasChatArray && !hasContentsArray && !hasSystemPrompt) {
            // Thả cửa cho plain text (Lát parseFetchRequestBody xử đẹp nó sau)
            return true;
        }

        // Đám còn lại: Có array nhưng thiếu chất AI, chắc mẩm là data nội bộ ST, lướt! 🛹
        return false;
    }

    // Check đại gia: Chỉ khi vòng ngoài khả nghi thì mới bung array ra khám thân thể từng em một 🧐
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


// ── Soi coi cái Request chui từ lỗ nẻo nào ra ────────────────────────────────

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
        { selector: '#option_regenerate', label: 'Sinh lại' },
        { selector: '#option_continue, #mes_continue', label: 'Tiếp tục' },
        { selector: '#mes_impersonate', label: 'Nhập vai' },
        { selector: '.swipe_right, .mes_swipe_right, [data-action="swipe-right"], [title="Swipe right"]', label: 'Sinh câu trả lời thay thế' },
    ];

    // ── Debug: Hốt đống lịch sử chọt chuột gần đây (Kịch trần 30 nháy nha) ──
    const recentClicks = [];
    const MAX_CLICK_LOG = 30;
    function logClick(action, detail) {
        recentClicks.push({ ts: Date.now(), action, detail });
        if (recentClicks.length > MAX_CLICK_LOG) recentClicks.shift();
    }

    const onNativeClickIntent = (e) => {
        const targetEl = e.target instanceof Element ? e.target : null;
        if (!targetEl) return;

        // ── Lọc vùng thần tốc: Chỉ quét trong địa bàn chat thôi, rảnh đâu mò ra menu/setting cho tốn sức ──
        // #sheld là cái rọ bự nhất của ST, nhét vừa giao diện chat với cái thanh chọc phá bên dưới
        const chatZone = document.getElementById('sheld') || document.getElementById('chat') || document.getElementById('send_form');
        if (chatZone && !chatZone.contains(targetEl)) {
            return;
        }

        // Debug: Ghi chép mọi động tĩnh lúc giăng lưới, ôm luôn tag/id/class của con mồi coi có trúng mánh hông
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
            // Debug: Note lại mấy cú chọt hụt nhưng đáng ngờ (Kiểu như lòi ra chữ mes_, swipe, regenerate...) 🕵️‍♀️
            const cls = (typeof targetEl.className === 'string' ? targetEl.className : '') + ' ' + (targetEl.getAttribute('title') || '') + ' ' + (targetEl.getAttribute('data-action') || '');
            const hints = ['mes_swipe', 'regenerate', 'swipe', 'mes_continue', 'impersonate', 'send_but'];
            if (hints.some(h => cls.toLowerCase().indexOf(h) !== -1 || tagId.toLowerCase().indexOf(h) !== -1)) {
                logClick('NATIVE_MISS', `Trượt rồi nhưng có mùi: ${tagId} cls="${cls.slice(0, 100)}"`);
            }
        }
    };

    document.addEventListener('pointerdown', onNativeClickIntent, true);
    document.addEventListener('click', onNativeClickIntent, true);

    // Trò tráo hàng / Đẻ lại text có khi hông thèm xài pointerdown/click, Tawa cài cắm luôn GENERATION_STARTED làm phao cứu sinh 🛟
    if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
        const stCtx = window.SillyTavern.getContext();
        if (stCtx && stCtx.eventSource && stCtx.event_types) {
            const onGenStarted = (type) => {
                const typeStr = String(type != null ? type : '');
                logClick('GEN_STARTED', `type=${typeStr}`);
                // Chỉ khi màn bắt click DOM xịt ngòi, thì GEN_STARTED mới nhào vô gắn mác
                // Bắt mấy loại sinh text Native rõ mồn một như tráo hàng / đẻ lại.
                // Còn normal/quiet đa phần là do plugin hoặc ma xui quỷ khiến tự sinh, cấm cửa hông cho qua! 🛑
                if (!lastNativeIntent || (Date.now() - lastNativeIntent.timestamp) > NATIVE_INTENT_WINDOW_MS) {
                    if (typeStr === 'impersonate') {
                        rememberNativeIntent('Nhập vai (Event ST)', 'generationStarted');
                    } else if (typeStr === 'continue') {
                        rememberNativeIntent('Tiếp tục (Event ST)', 'generationStarted');
                    } else if (typeStr === 'regenerate') {
                        rememberNativeIntent('Sinh lại (Event ST)', 'generationStarted');
                    } else if (typeStr === 'swipe') {
                        rememberNativeIntent('Sinh câu trả lời thay thế (Event ST)', 'generationStarted');
                    }
                    // send / quiet / normal / Khác — Khỏi gắn mác, lỡ phang nhầm hàng của plugin
                }
            };
            try {
                stCtx.eventSource.on(stCtx.event_types.GENERATION_STARTED, onGenStarted);
                logClick('SETUP', 'Đã gài bẫy GENERATION_STARTED (Phao cứu sinh)');
            } catch (err) {
                logClick('SETUP_ERR', 'Gài bẫy GENERATION_STARTED xịt: ' + String(err));
            }
        } else {
            logClick('SETUP', 'ST context đang ngái ngủ, hông gắn GENERATION_STARTED được');
        }
    }

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        if (e.isComposing || e.keyCode === 229) return;
        if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;

        const targetEl = e.target;
        if (!(targetEl instanceof HTMLTextAreaElement)) return;
        if (targetEl.id !== 'send_textarea') return;

        logClick('NATIVE_ENTER', 'Đập Enter vô ô chat');
        rememberNativeIntent('Đập Enter vô ô chat', 'keydown');
    }, true);

    // Xì cái lỗ debug ra window cho dễ chọt
    window.__rlogDebug = {
        getRecentClicks: () => recentClicks.slice(),
        getLastNativeIntent: () => lastNativeIntent,
        getRecords: () => records,
        dumpClicks: () => {
            console.table(recentClicks.map(c => ({ time: new Date(c.ts).toISOString().slice(11, 23), ...c })));
            return recentClicks;
        },
    };

    console.debug(`[${PLUGIN_KEY}] Bộ soi nguồn request lên đèn rồi nha (Nghe lén Native ST + Phao cứu sinh GENERATION_STARTED). Ổ cắm debug: window.__rlogDebug`);
}

function inferRequestSource() {
    const now = Date.now();
    if (lastNativeIntent && (now - lastNativeIntent.timestamp) <= NATIVE_INTENT_WINDOW_MS) {
        // Khoan vội xé vé cái dấu Native, để ngừa mấy cái request tạp nham chen ngang lúc đẻ lại/tráo hàng nó ăn cắp mất cái mác.
        // Dấu này hết hạn là tự động bay màu ở khúc dưới nha.
        return {
            type: 'native',
            label: 'Native',
            detail: `Yêu cầu Native-${lastNativeIntent.target}`,
        };
    }

    // Hết hạn thì lột cái mác Native đi
    if (lastNativeIntent && (now - lastNativeIntent.timestamp) > NATIVE_INTENT_WINDOW_MS) {
        lastNativeIntent = null;
    }

    return {
        type: 'plugin',
        label: 'Plugin',
        detail: 'Yêu cầu Plugin/Hông phải Native',
    };
}

function getSourceLabel(source) {
    if (source && source.type === 'native') return 'Native';
    return 'Plugin';
}

function getSourceClass(source) {
    if (source && source.type === 'native') return 'rlog-source-native';
    return 'rlog-source-plugin';
}


// ── Xì đồ chơi cho mấy đứa khác xài ké (Như ông tour.js nè) ────────
window.__RLogApi = {
    records: () => records,
    // Đồ nghề tìm kiếm (Dành cho tour.js múa) 🔍
    openSearchForRecord: (recordIndex) => openSearchForRecord(recordIndex),
    performSearch: (recordIndex, keyword) => performSearch(recordIndex, keyword),
    closeSearch: () => closeSearch(),
    injectDemo: () => {
        const demoRecord = {
            characterName: 'Nhân vật ẩn danh',
            timestamp: new Date().toLocaleString('zh-CN', { hour12: false }),
            source: { type: 'plugin', label: 'Plugin', detail: 'Yêu cầu Plugin/Hông phải Native' },
            modelName: 'Human-Brain-1.0-Pro',
            messages: [
                { 
                    role: 'assistant', 
                    content: '<thinking>\nGenerating example message...\n\nKhoan đã, cái ví dụ rốt cuộc phải ghi mọe gì?\nTawa tại sao lại phải làm cái trò này?\nThôi bỏ đi, viết đại một câu cho có lệ.\n</thinking>\n\nXin chào! Chào mừng xài ké plugin của Tawa.', 
                    tokens: 42, 
                    collapsed: false, 
                    tokenPrecise: true 
                }
            ],
            collapsed: false,
            isDemo: true // Gắn mác đây là hàng mồi chài
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
    // Đập đi xây lại nguyên cái list (Để tour.js xài trò dọn dẹp/hồi sinh lúc đi tour) 🏗️
    setRecords: (newRecords) => {
        records = Array.isArray(newRecords) ? newRecords : [];
        // Nhớ kỹ quy củ "Ép số log dưới trần" nha (Lúc hồi sinh lỡ nhét thêm log tạm nó trào bọt ra ngoài) 🛑
        if (records.length > MAX_RECORDS) {
            records.length = MAX_RECORDS;
        }
        panelContentDirty = true;
        if (panelEl && isPanelVisible) renderPanelContent();
    },
    // Cầm trịch cái tour (tour.js xài): Đang đi tour là log mới vô khám tạm giam, cấm ló mặt ra
    setTourActive: (active) => {
        tourActive = !!active;
    },
    // Khui kho đem mấy cái log bị nhốt lúc đi tour ra xử (Cho tour.js gom xác lúc tàn tiệc) 📦
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
    /**
     * Bơm 8 cái log test vô, trải đều 8 kiếp nạn token (tier 0-7)
     * Để check màu mè cho lẹ, khỏi mắc công hì hục đi gõ từng size một. 💅
     * Mobile: Chọt vô cái bình thuốc lắc trong khay "Tùy chọn khác" là bom rớt; 🧪
     * PC: Thích thì mở F12 phang câu lệnh window.__RLogApi.injectTokenTierTest() cũng được 💻
     */
    injectTokenTierTest: () => {
        // Số token đại diện cho mỗi kiếp nạn (Bám theo lề của getTokenTier)
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
        const testRecords = tierValues.map((t, i) => {
            const ts = new Date(baseTs.getTime() - i * 60000);
            const tsStr = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')} ${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}:${String(ts.getSeconds()).padStart(2, '0')}`;
            return {
                characterName: 'Nhân vật test',
                timestamp: tsStr,
                source: { type: 'plugin', label: 'Plugin', detail: 'Yêu cầu Plugin/Hông phải Native' },
                modelName: 'Test-Model',
                messages: [{
                    role: 'system',
                    content: `Test phân khúc ${t.label}`,
                    tokens: t.tokens,
                    collapsed: true,
                    tokenPrecise: true,
                }],
                collapsed: true,
                isDemo: true, // Gắn mác đây là hàng mồi chài, removeDemo tự động dọn
            };
        });
        // Đá văng mấy cái demo cũ đi, chồng đống lên nhau làm gì
        records = records.filter(r => !r.isDemo);
        records.unshift(...testRecords);
        panelContentDirty = true;
        if (panelEl && isPanelVisible) renderPanelContent();
    }
};

// ── Kho quản lý dữ liệu ────────────────────────────────────

/**
 * Đúc dấu vân tay cho đống tin nhắn để chống hàng nhái 🐾
 * Dán cái role với content của từng tin lại làm cái mã băm cùi bắp, soi coi 2 log có y xì đúc hông
 */
function computeMessagesFingerprint(messages) {
    if (!messages || messages.length === 0) return '';
    // Cắt đúng 50 tin nhắn đầu + 500 chữ mỗi tin lấy vân tay thôi, ham hố xài cục chà bá nó lag máy chết! 📉
    return messages.slice(0, 50).map(m => {
        const role = m.role || '';
        const content = typeof m.content === 'string' ? m.content.slice(0, 500) : '';
        return `${role}:${content}`;
    }).join('|');
}

function addRecord(characterName, messages, source, modelName, rawBody) {
    if (!masterEnabled) return;
    if (!characterName || !messages || messages.length === 0) return;

    // Triệt tiêu hàng nhái: Nếu bộ đồ lòng (messages) y hệt log trước đó mà rớt xuống chưa đầy 500ms thì đá văng 🛑
    const fingerprint = computeMessagesFingerprint(messages);
    const now = Date.now();
    if (fingerprint && fingerprint === lastRecordFingerprint && (now - lastRecordTime) < 500) {
        return;
    }
    lastRecordFingerprint = fingerprint;
    lastRecordTime = now;

    const date = new Date();
    const ts = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;

    const record = {
        characterName,
        timestamp: ts,
        source: source || { type: 'plugin', label: 'Plugin', detail: 'Yêu cầu Plugin/Hông phải Native' },
        modelName: modelName || 'Model ẩn danh',
        messages,
        rawBody: rawBody || null,   // Xác ướp nguyên thủy của cái body request (Để dành cho "Soi Sạch Nội Y" ngắm đồ thô) 🧟‍♀️
        collapsed: true,
    };

    // Đang đi tour: Hàng mới tới quăng vô kho tạm, cấm ló mặt ra chật chội (Để DOM đi tour hông bị chệch nhịp),
    // Hết tour thì endTour lôi ra trộn vô lại, bao hông sứt mẻ. Lệnh cấm trần log tối đa vẫn có hiệu lực đàng hoàng nha. ⚖️
    if (tourActive) {
        tourPendingRecords.unshift(record);
        if (tourPendingRecords.length > MAX_RECORDS) {
            tourPendingRecords.pop();
        }
        return;
    }

    // Lộc mới rớt xuống thì gập cổ hết đám cũ lại (Gập cái vỏ thôi, ruột gan tin nhắn vẫn y nguyên) 📦
    records.forEach(r => { r.collapsed = true; });

    records.unshift(record);
    if (records.length > MAX_RECORDS) {
        records.pop();
    }

    panelContentDirty = true;
    if (panelEl && isPanelVisible) {
        renderPanelContent();
        // Bảng điều khiển đang mở toang hoác: Log mới rớt là đá đít lên đỉnh lẹ 🚀
        // (Lúc trước xào lại cái pendingScrollToTop lỡ tay chém nhầm nhánh này, làm nó "gập mà hông thèm lên đỉnh", Tawa vá lại rồi đó)
        if (!isPanelCollapsed) {
            const listEl = panelEl.querySelector('#rlog-list');
            if (listEl) listEl.scrollTop = 0;
        }
    }
    // Nếu cái bảng hông ở trạng thái "toang hoác" (Bị cuộn mẹ rồi hay đóng chặt cửa),
    // Thì chừng nào ló mặt ra mới đá lên đỉnh (Ngó pendingScrollToTop trong togglePanelWindow / showPanel nha) 🔝
    if (!(panelEl && isPanelVisible && !isPanelCollapsed)) {
        pendingScrollToTop = true;
    }
}

function clearAllRecords() {
    records = [];
    panelContentDirty = true;
    if (panelEl && isPanelVisible) {
        renderPanelContent();
    }
}


// ── Móc tên Model ra ───────────────────────────────

/**
 * Lôi cổ cái tên Model ra từ cái request của AI 🤖
 * Mỗi nhà API giấu tên một kiểu, Tawa mò theo độ ưu tiên nha
 * @param {object} body Cái xác JSON đã bị mổ xẻ
 * @returns {string} Tên model, mò hông ra thì phán 'Model ẩn danh'
 */
function extractModelName(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Model ẩn danh';

    // 1. Chọt thẳng vô tầng chóp kiếm cục model (OpenAI với mấy đám bú frame y chang) 🔍
    if (typeof body.model === 'string' && body.model) return body.model;

    // 2. Hàng nhà Gemini: generationConfig.model
    if (body.generationConfig && typeof body.generationConfig.model === 'string' && body.generationConfig.model) {
        return body.generationConfig.model;
    }

    // 3. Cố bới bèo ra bọ từ mấy cái field quen mặt trên đỉnh
    const modelKeys = ['model_name', 'modelName', 'name', 'engine'];
    for (const key of modelKeys) {
        if (typeof body[key] === 'string' && body[key]) return body[key];
    }

    return 'Model ẩn danh';
}

// ── Chặn họng cái Fetch ──────────────────────────────

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
    return 'Nhân vật ẩn danh';
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

/**
 * Banh xác request của mấy nhà AI ra, vắt kiệt lấy đống tin nhắn 🔪
 * Nhả null là bó tay (Im ru mà lượn đi, khỏi lưu log) 🤫
 */
function parseFetchRequestBody(json) {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return null;

    const messages = [];

    // 1. OpenAI / Đám xài ké — Cái mâm messages
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
                    tokens: 0, // Điểm token sẽ do computeTokensForMessages tính ngầm ở ngoài vòng pháp luật của parseFetchRequestBody nha 🧮
                    collapsed: true,
                });
            }
        }
    }

    // 2. Cái mâm chat — Style nội bộ của ST (Chắc bị fetch túm nhầm) 🎭
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
                    tokens: 0, // Điểm token sẽ do computeTokensForMessages tính ngầm ở ngoài vòng pháp luật của parseFetchRequestBody nha 🧮
                    collapsed: true,
                });
            }
        }
    }

    // 3. Phái Google Gemini
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
                    tokens: 0, // Điểm token sẽ do computeTokensForMessages tính ngầm ở ngoài vòng pháp luật của parseFetchRequestBody nha 🧮
                    collapsed: true,
                });
            }
        }
    }

    // 4. Phái Anthropic
    if (messages.length === 0 && typeof json.system === 'string' && Array.isArray(json.messages)) {
        if (json.system) {
            messages.push({
                role: 'system',
                content: json.system,
                tokens: 0, // Điểm token sẽ do computeTokensForMessages tính ngầm ở ngoài vòng pháp luật của parseFetchRequestBody nha 🧮
                collapsed: true,
            });
        }
        for (const m of json.messages) {
            if (!isAiMessageObject(m)) continue;
            if (typeof m.content === 'string' && m.content) {
                messages.push({
                    role: normalizeRole(m.role),
                    content: m.content,
                    tokens: 0, // Điểm token sẽ do computeTokensForMessages tính ngầm ở ngoài vòng pháp luật của parseFetchRequestBody nha 🧮
                    collapsed: true,
                });
            }
        }
    }

    // 5. Mồi chữ thuần (Plain text)
    if (messages.length === 0 && typeof json.prompt === 'string' && json.prompt.length > 0) {
        messages.push({
            role: 'user',
            content: json.prompt,
            tokens: 0, // Điểm token sẽ do computeTokensForMessages tính ngầm ở ngoài vòng pháp luật của parseFetchRequestBody nha 🧮
            collapsed: false,
        });
    }

    if (messages.length === 0) return null;
    return messages;
}

/**
 * Ép chạy ngầm vắt kiệt cái body request cào được: Mổ xẻ tin nhắn, bấm token, ném vô kho log. 🏃‍♀️💨
 * Hàm này đoạn tuyệt quan hệ với thằng fetch gửi đi, cấm có ngáng đường originalFetch! 🛑
 * @param {object} body Cái xác JSON đã lột đồ
 * @param {string} requestUrl Cái link bị gọi hồn
 */
async function processCapturedBody(body, requestUrl) {
    // Khám nghiệm gắt gao: Sút mấy cái API load đồ/đổi phòng chat của ST ra chuồng gà trước, rồi mới rước chân mệnh thiên tử (hàng sinh text) vô! 🕵️‍♀️
    if (!body || !isAiRequestBody(body, requestUrl)) return;

    const messages = parseFetchRequestBody(body);
    if (!messages) return;

    const characterName = getCurrentCharacterName();
    const source = inferRequestSource();
    const modelName = extractModelName(body); // Bứng cái tên model từ body ra
    // Kêu gọi máy chém Token Native của ST chạy ngầm để đo token chuẩn đét cho từng dòng một 🪓
    // Quăng cái modelName vô khè với model API chính của ST, coi tụi tokenizer có ưa nhau hông 🤜🤛
    await computeTokensForMessages(messages, modelName);
    addRecord(characterName, messages, source, modelName, body); // Nhét cái xác body nguyên thủy vô để "Soi Sạch Nội Y" còn có hàng thô mà xài 📦
}

/**
 * Lắp mìn chặn họng fetch 💣
 * Gói ghém thằng window.fetch lại. Tại plugin này ôm con loading_order 999 to đùng,
 * Nên lúc cài mìn là đám đệ tử plugin khác dọn cỗ xong hết rồi, originalFetch tóm trọn nguyên dây chuyền phía dưới luôn. 😎
 * 
 * Độ máy: Trải thảm đỏ (early return) cho lẹ, khỏi bắt cái JSON POST nào cũng phải
 * lột đồ khám sét isAiRequestBody từ đầu chí cuối. 🏎️
 *   1. Mấy cái hông phải POST/PUT/PATCH thì biến 🚪
 *   2. URL lòi đuôi API ruột của ST (/api/, /assets/, /backgrounds/) mà hông dính dáng AI thì sút luôn ⚽
 *   3. Lọt qua vòng gửi xe này mới thèm xé áo cái body ra coi 👙
 * 
 * Bí kíp khóa mõm (Luật 5): fetchHookInFlight chỉ canh me lúc cướp xác body kiểu đồng bộ (đọc init.body thôi),
 * Ôm khóa nháy mắt là thả (chưa tới 1 phần ngàn giây). Nhả khóa cái là đấm cho originalFetch chạy liền,
 * Trò chém token với addRecord cứ chui xuống gầm giường Promise mà chạy ngầm, cấm cản đường mạng mẽo! 🛑
 * Chiêu này để né cái phốt ôm khóa mà còn đi khấn await (Nhất là cái trò computeTokensForMessages bắt tokenizer chém từng dòng)
 * Làm originalFetch mọc râu chờ, chọc ngoáy mấy plugin khác (như plugin trí nhớ) bể mẹ nó kịch bản thời gian. 🧠💥
 */
function installFetchHook() {
    if (currentHook) return; // Gắn rồi cha nội

    originalFetch = window.fetch;
    currentHook = async function hookedFetch(input, init) {
        // ── Thảm đỏ 0: Áo giáp chống dội ngược ──
        // Lỡ đám plugin khác múa múa cái fetch hijack thành cái vòng luẩn quẩn bắt Tawa chui lại vô hook,
        // Thì đá thẳng qua originalFetch luôn, rảnh đâu chơi trò đuổi bắt vô tận! 🏃‍♀️💨
        if (fetchHookInFlight) {
            return originalFetch.apply(window, [input, init]);
        }

        // ── Thảm đỏ 1: Cúp cầu dao tổng thì mở cửa thả chó, khỏi soi body ──
        if (!masterEnabled) {
            return originalFetch.apply(window, [input, init]);
        }

        // ── Thảm đỏ 2: Không phải POST/PUT/PATCH thì lượn ──
        let method = init && init.method ? init.method.toUpperCase() : 'GET';
        if (input instanceof Request && method === 'GET') {
            try { method = input.method.toUpperCase(); } catch (e) { /* ignore */ }
        }
        if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') {
            return originalFetch.apply(window, [input, init]);
        }

        // ── Thảm đỏ 3: Cái URL bói hông ra chữ AI sinh text nào thì sút lẹ (Đỡ mất công banh xác body) ──
        const requestUrl = getFetchRequestUrl(input);
        const path = getUrlPathForMatch(requestUrl);
        if (path && !pathMatchesAny(path, AI_GENERATION_PATH_PATTERNS)
            && (path.startsWith('/api/') || path.startsWith('/assets/') || path.startsWith('/backgrounds/'))) {
            return originalFetch.apply(window, [input, init]);
        }

        // ── Chơi xích chó chỉ để cướp xác body đồng bộ thôi, khóa 1 giây là thả ──
        // Trong chuồng khóa chỉ đọc init.body kiểu chớp nhoáng (JSON.parse hoặc hốt cái reference), cấm tuyệt đối I/O hay await! 🛑
        // Lỡ init.body tàng hình, thì phải bới móc body bất đồng bộ từ cái Request ——
        // Lúc này kích hoạt máy bới xong là quăng chìa khóa chạy liền, chừa đường cho originalFetch tung hoành bên ngoài! 💨
        fetchHookInFlight = true;
        /** @type {object|null} Cái body vớt được đồng bộ từ init.body (Dành cho đứa nào hông cần đợi) */
        let syncBody = null;
        /** @type {Promise<object|null>|null} Cuộn giấy hứa hẹn (Promise) đào body bất đồng bộ từ Request.clone() */
        let asyncBodyPromise = null;
        try {
            if (init && init.body) {
                if (typeof init.body === 'string') {
                    try { syncBody = JSON.parse(init.body); } catch (e) { syncBody = null; }
                } else if (typeof init.body === 'object' && !Array.isArray(init.body)) {
                    // Quăng cái sợi xích vô (Khỏi clone, vì processCapturedBody chỉ ngắm chứ hông sờ) 🔗
                    syncBody = init.body;
                }
            }

            if (!syncBody && input instanceof Request) {
                try {
                    const clonedReq = input.clone();
                    // Bấm nút đào body ngầm, Promise sẽ tự nổ ngoài vòng khóa 💥
                    asyncBodyPromise = clonedReq.text().then(text => {
                        if (text) {
                            try { return JSON.parse(text); } catch (e) { return null; }
                        }
                        return null;
                    }).catch(() => null);
                } catch (e) {
                    // Clone xịt ngòi (Chắc body bị nhai mất rồi), kệ tía nó 🤷‍♀️
                }
            }
        } finally {
            fetchHookInFlight = false;
            // Nhả khóa — originalFetch tự do múa múa được rồi nha 🕊️
        }

        // ── Thả xích cho original fetch (Nằm ngoài vùng khóa, quất cho mạng bay lẹ) ──
        // Gọi hồn bằng cái reference giấu trong túi (closure), chứ thò tay vô window.fetch là nó đẻ ra ma trận đệ quy đó 👻
        const fetchPromise = originalFetch.apply(window, [input, init]);

        // ── Lùa đệ tử đi xử lý body ngầm (Cấm cản đường fetch về đích) ──
        if (syncBody) {
            // Bắt được body sống rồi, lôi ra xẻo thịt ngầm thôi
            processCapturedBody(syncBody, requestUrl).catch(() => { /* Xử lý câm lặng */ });
        } else if (asyncBodyPromise) {
            // Đợi móc được body từ Request lên, mầm nụ Promise nở hoa rồi thì đem chém
            asyncBodyPromise.then(body => {
                if (body) {
                    return processCapturedBody(body, requestUrl);
                }
            }).catch(() => { /* Xử lý câm lặng */ });
        }

        return fetchPromise;
    };
    window.fetch = currentHook;

    console.debug(`[${PLUGIN_KEY}] Mìn chặn fetch đã thả (Thống nhất mạng lưới chặn cổ)`);
}

/**
 * Gỡ mìn chặn fetch 💣
 */
function uninstallFetchHook() {
    if (!currentHook) return;

    // Chừng nào window.fetch vẫn còn dính bùa của Tawa thì mới được tháo, lỡ plugin khác đè lên rồi mà tháo là ăn cám cả lũ! 😱
    if (window.fetch === currentHook && originalFetch) {
        window.fetch = originalFetch;
    }
    originalFetch = null;
    currentHook = null;

    console.debug(`[${PLUGIN_KEY}] Đã phế võ công mìn chặn fetch`);
}


// ── Cầu Dao Tổng ──────────────────────────────────────

function setMasterEnabled(enabled) {
    masterEnabled = enabled;
    try {
        localStorage.setItem(STORAGE_MASTER_KEY, enabled ? '1' : '0');
    } catch (e) { /* ignore */ }
    updateMasterToggleUI();
    
    if (panelEl && isPanelVisible) {
        // Nếu cái kho đang trống hoác mà cửa vẫn mở, quất luôn dòng chữ mắng mỏ cho nóng 💬
        if (records.length === 0) {
            panelContentDirty = true;
            renderPanelContent();
        }
    }
    
    // Mìn hook cứ cắm chết ở đó (Lát vô ruột installFetchHook lấy masterEnabled làm thước đo coi có hốt log hông),
    // Chứ đem công tắc đi tháo/lắp hook là băm nát cái vỏ bọc fetch của tụi plugin khác đó nha! 💥
}

function updateMasterToggleUI() {
    if (!panelEl) return;
    
    const btn = panelEl.querySelector('#rlog-master-toggle');
    if (btn) {
        if (masterEnabled) {
            btn.classList.add('rlog-master-on');
            btn.classList.remove('rlog-master-off');
            btn.style.color = '#4caf50';
            btn.querySelector('i').className = 'fa-solid fa-power-off';
            btn.title = 'Bật rồi nè - Đang cào log mỏi tay nha';
        } else {
            btn.classList.add('rlog-master-off');
            btn.classList.remove('rlog-master-on');
            btn.style.color = '#999';
            btn.querySelector('i').className = 'fa-solid fa-power-off';
            btn.title = 'Tắt ngủ gật - Dừng cào log rồi';
        }
    }

    // Úp sọt cái màng đen che mặt dựa vào sắc mặt của cầu dao tổng 🌑
    if (!masterEnabled) {
        panelEl.classList.add('rlog-disabled');
    } else {
        panelEl.classList.remove('rlog-disabled');
    }
}


// ── Công tắc Soi Trước Nội Y (Nhớ dai nè) ────────────────────────

/**
 * Bới localStorage lôi cái công tắc soi trước ra
 * Mặc định là tắt đài (Mới cài hay chưa đụng tới thì vứt cái false vô mặt) 🙈
 * @returns {boolean} Có xé màn che soi hông
 */
function loadContentPreview() {
    try { return localStorage.getItem(STORAGE_PREVIEW_KEY) === '1'; } catch (e) { return false; }
}

/**
 * Khắc cốt ghi tâm cái công tắc vô localStorage
 * @param {boolean} enabled Có xé màn che hông
 */
function saveContentPreview(enabled) {
    try { localStorage.setItem(STORAGE_PREVIEW_KEY, enabled ? '1' : '0'); } catch (e) { /* ignore */ }
}

/**
 * Gạt cái công tắc soi trước
 * Cập nhật biến số cho thiên hạ biết, khắc vô xương tủy, thay áo mới cho nút bấm, rồi tô lại cái bảng! 💅
 */
function toggleContentPreview() {
    contentPreviewEnabled = !contentPreviewEnabled;
    saveContentPreview(contentPreviewEnabled);
    updatePreviewToggleUI();
    // Công tắc này thọc gậy bánh xe vô giao diện tin nhắn, buộc phải đập DOM xây lại nha 🔨
    panelContentDirty = true;
    if (panelEl && isPanelVisible) {
        renderPanelContent();
    }
}

/**
 * Độ lại nhan sắc cho cái công tắc soi trước trên thanh tiêu đề (Bật/Tắt)
 * Bật thì cục trượt lết sang phải đổi màu, tắt thì lùi về trái lột xác 🎨
 */
function updatePreviewToggleUI() {
    const toggleEl = panelEl ? panelEl.querySelector('#rlog-preview-toggle') : null;
    if (!toggleEl) return;
    if (contentPreviewEnabled) {
        toggleEl.classList.add('rlog-preview-on');
        toggleEl.classList.remove('rlog-preview-off');
        toggleEl.title = 'Soi trước - Mở toang ra rồi';
    } else {
        toggleEl.classList.remove('rlog-preview-on');
        toggleEl.classList.add('rlog-preview-off');
        toggleEl.title = 'Soi trước - Mặc áo kín mít';
    }
}

// ── Kho chứa Theme ────────────────────────────────────

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


// ── Găm chặt cái trần số log ─────────────────────────────

/**
 * Móc cái nóc nhà (số log tối đa) của Editor từ localStorage ra
 * Đào hông ra hoặc số bậy bạ thì thảy vô mặt con số mặc định DEFAULT_MAX_RECORDS nha 📦
 */
function loadMaxRecords() {
    try {
        const raw = localStorage.getItem(STORAGE_MAX_RECORDS_KEY);
        if (raw !== null && raw !== undefined) {
            const num = parseInt(raw, 10);
            // Cảnh sát chính tả: Phải là số nguyên xịn xò nằm trong vùng phủ sóng 👮‍♀️
            if (!isNaN(num) && num >= MIN_MAX_RECORDS && num <= MAX_MAX_RECORDS) {
                return num;
            }
        }
    } catch (e) { /* ignore */ }
    return DEFAULT_MAX_RECORDS;
}

/**
 * Ụp cái nóc nhà vô localStorage cho nhớ đời
 * @param {number} value Nóc nhà mới
 */
function saveMaxRecords(value) {
    try {
        localStorage.setItem(STORAGE_MAX_RECORDS_KEY, String(value));
    } catch (e) { /* ignore */ }
}

/**
 * Dựng cái trần số log mới
 * Update biến, khắc vô não, xẻo bớt đống log thừa, đắp lại mặt tiền tiêu đề! 🛠️
 * @param {number} newMax Cái nóc mới
 */
function setMaxRecords(newMax) {
    // Check coi có ngoan hông
    if (typeof newMax !== 'number' || isNaN(newMax) || newMax < MIN_MAX_RECORDS || newMax > MAX_MAX_RECORDS) {
        return false;
    }
    MAX_RECORDS = newMax;
    saveMaxRecords(MAX_RECORDS);

    // Lỡ xài lố quota rồi thì xách dao chém bớt mấy cái log già khú đế đi 🔪
    while (records.length > MAX_RECORDS) {
        records.pop();
    }

    // Rửa mặt cho thanh tiêu đề
    updateHeaderTitle();

    // Số log biến động, đập DOM đi chát lại 🧱
    panelContentDirty = true;

    // Nếu cửa sổ đang mở toang, ốp luôn nội dung mới (Đã bị kiểm duyệt) vô 🖼️
    if (panelEl && isPanelVisible) {
        renderPanelContent();
    }

    return true;
}

/**
 * Make-up lại cái chữ trên tiêu đề, khai báo số đo 3 vòng của đống log hiện tại với cái nóc nhà 📏
 */
function updateHeaderTitle() {
    if (!panelEl) return;
    const countEl = panelEl.querySelector('.rlog-title-count');
    if (countEl) {
        countEl.textContent = `${records.length} / ${MAX_RECORDS}`;
    }
}


// ── Bảng chưởng cài đặt Nóc Nhà Log ─────────────────────────────

/**
 * Luyện đan đẻ ra cái bảng chưởng set trần số log
 * Đập hai nhát (Double-click) vô tiêu đề là nó lòi mặt ra nha 👊
 */
function showMaxRecordsDialog() {
    // Có bảng chưởng rồi thì đá bay cái cũ đi
    if (maxRecordsDialog) {
        maxRecordsDialog.remove();
    }

    // Đan cái màng bọc cho bảng chưởng
    // Tawa ép chết cứng cái tọa độ bằng inline style rồi nha, chống chỉ định bọn phụ huynh CSS (như transform) đâm sau lưng phá vỡ định vị position:fixed! 🛡️
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
        // Chọt ra ngoài vùng phủ sóng là giải tán
        if (e.target === overlay) {
            closeMaxRecordsDialog();
        }
    });

    // Nặn xác cho bảng chưởng
    const dialog = document.createElement('div');
    dialog.className = 'rlog-dialog';

    // Tùy mặt gửi vàng, coi theme gì ụp class đó vô 👗
    if (isLightTheme) {
        dialog.classList.add('rlog-dialog-light');
    }

        dialog.innerHTML = `
        <div class="rlog-dialog-header">
            <span>Cài Đặt Trần Log</span>
            <button class="rlog-dialog-close" title="Dẹp"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="rlog-dialog-body">
            <p class="rlog-dialog-desc">
                Ném con số vô đây, cho phép từ ${MIN_MAX_RECORDS} ~ ${MAX_MAX_RECORDS}.
            </p>
            <div class="rlog-dialog-input-row">
                <input type="number" class="rlog-dialog-input" 
                       id="rlog-max-records-input" 
                       min="${MIN_MAX_RECORDS}" max="${MAX_MAX_RECORDS}" 
                       value="${MAX_RECORDS}" 
                       placeholder="${MAX_RECORDS}">
                <button class="rlog-dialog-btn rlog-dialog-btn-confirm" id="rlog-dialog-confirm">Chốt Đơn</button>
            </div>

        </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    maxRecordsDialog = overlay;

    // Trói sự kiện vô nút đóng
    dialog.querySelector('.rlog-dialog-close').addEventListener('click', closeMaxRecordsDialog);

    // Trói sự kiện vô nút Chốt Đơn
    dialog.querySelector('#rlog-dialog-confirm').addEventListener('click', () => {
        const input = dialog.querySelector('#rlog-max-records-input');
        const rawValue = parseInt(input.value, 10);
        if (!isNaN(rawValue)) {
            // Kẹp cổ nó vô đúng vùng quy định 🗜️
            const clamped = Math.max(MIN_MAX_RECORDS, Math.min(MAX_MAX_RECORDS, rawValue));
            setMaxRecords(clamped);
        }
        closeMaxRecordsDialog();
    });

    // Lấy đà phang Enter là chốt luôn
    dialog.querySelector('#rlog-max-records-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            dialog.querySelector('#rlog-dialog-confirm').click();
        } else if (e.key === 'Escape') {
            closeMaxRecordsDialog();
        }
    });

    // Ép con trỏ nhảy ngay vô ô gõ chữ 🎯
    setTimeout(() => {
        const input = dialog.querySelector('#rlog-max-records-input');
        if (input) {
            input.focus();
            input.select();
        }
    }, 100);
}

/**
 * Đóng sập cái bảng chưởng cài nóc nhà lại
 */
function closeMaxRecordsDialog() {
    if (maxRecordsDialog) {
        maxRecordsDialog.remove();
        maxRecordsDialog = null;
    }
}


// ── Bảng Chưởng Cảnh Báo Xài Chung ─────────────────────────────

/** @type {HTMLElement|null} Thể xác của bảng chưởng hiện tại */
let confirmDialogEl = null;

/**
 * Nặn ra cái bảng chưởng cảnh báo (Xài cho mấy trò hủy diệt như tẩy não toàn bộ/xóa 1 log) ⚠️
 * @param {object} options Đồ nghề
 * @param {string} [options.title='Xác nhận nhé'] Cái trán của bảng chưởng
 * @param {string} [options.message=''] Ruột gan (Nhét HTML vô tư)
 * @param {string} [options.confirmText='Chốt'] Tên nút Chốt
 * @param {string} [options.cancelText='Bỏ qua'] Tên nút Quay Xe
 * @param {Function} [options.onConfirm] Bấm Chốt xong làm gì
 * @param {Function} [options.onCancel] Bấm Quay Xe xong làm gì
 */
function showConfirmDialog(options) {
    const {
        title = 'Xác nhận nhé',
        message = '',
        confirmText = 'Chốt',
        cancelText = 'Bỏ qua',
        onConfirm = null,
        onCancel = null,
    } = options || {};

    // Có bảng chưởng rồi thì đá bay cái cũ đi
    closeConfirmDialog();

    // Đan cái màng bọc cho bảng chưởng
    // Tawa ép chết cứng cái tọa độ bằng inline style rồi nha, chống chỉ định bọn phụ huynh CSS (như transform) đâm sau lưng phá vỡ định vị position:fixed! 🛡️
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
        // Chọt ra ngoài vùng phủ sóng là giải tán
        if (e.target === overlay) {
            closeConfirmDialog();
            if (typeof onCancel === 'function') onCancel();
        }
    });

    // Nặn xác cho bảng chưởng
    const dialog = document.createElement('div');
    dialog.className = 'rlog-dialog rlog-confirm-dialog';

    // Tùy mặt gửi vàng, coi theme gì ụp class đó vô 👗
    if (isLightTheme) {
        dialog.classList.add('rlog-dialog-light');
    }

    dialog.innerHTML = `
        <div class="rlog-dialog-header">
            <span>${escapeHtml(title)}</span>
            <button class="rlog-dialog-close" title="Dẹp"><i class="fa-solid fa-xmark"></i></button>
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

    // Trói sự kiện vô nút đóng
    dialog.querySelector('.rlog-dialog-close').addEventListener('click', () => {
        closeConfirmDialog();
        if (typeof onCancel === 'function') onCancel();
    });

    // Trói sự kiện vô nút Quay Xe
    dialog.querySelector('#rlog-confirm-cancel').addEventListener('click', () => {
        closeConfirmDialog();
        if (typeof onCancel === 'function') onCancel();
    });

    // Trói sự kiện vô nút Chốt Đơn
    dialog.querySelector('#rlog-confirm-ok').addEventListener('click', () => {
        closeConfirmDialog();
        if (typeof onConfirm === 'function') onConfirm();
    });

    // Bật hack phím: Phang Enter là chốt, Escape là sủi lẹ ⌨️
    dialog.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            dialog.querySelector('#rlog-confirm-ok').click();
        } else if (e.key === 'Escape') {
            closeConfirmDialog();
            if (typeof onCancel === 'function') onCancel();
        }
    });

    // Ép con trỏ nhảy vô nút Quay Xe (Cho chắc ăn, lỡ tay bấm lộn thì mỏ máu) 🛡️
    setTimeout(() => {
        const cancelBtn = dialog.querySelector('#rlog-confirm-cancel');
        if (cancelBtn) cancelBtn.focus();
    }, 100);
}

/**
 * Đóng sập bảng chưởng cảnh báo lại
 */
function closeConfirmDialog() {
    if (confirmDialogEl) {
        confirmDialogEl.remove();
        confirmDialogEl = null;
    }
}


// ── Nặn Giao Diện (Render) ───────────────────────────────────────

/**
 * Đập nát cái trạng thái dò mìn hiện tại (Dẹp hộp tìm kiếm, xé nháp từ khóa, tẩy vết highlight, reset bộ đếm) 💥
 * Xài cho ba cái vụ gập/xóa/tẩy não/add thêm log... nói chung là cút khỏi mode dò mìn.
 * Bùa hộ mệnh: Hông thèm quan tâm cái UI dò mìn xây xong chưa, thấy mặt nó trong DOM mới đập nha. 🛡️
 */
function resetSearchIfActive() {
    // Đập nát cái đồng hồ cát debounce ⏳
    if (searchDebounceTimer !== null) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
    }

    // Tẩy sạch sành sanh vết sáng (Kể cả vết hồng tâm hiện tại với mấy vết vàng ố còn dính lại) 🧽
    if (searchState) {
        const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
        if (listEl) {
            listEl.querySelectorAll('mark.rlog-search-mark, mark.rlog-search-mark-current').forEach(mark => {
                const parent = mark.parentNode;
                if (parent) {
                    // Lột xác cái mark trả lại hình hài text gốc cho nó 🔄
                    parent.replaceChild(document.createTextNode(mark.textContent), mark);
                    // Gắn kết mấy cục text hàng xóm lại, hông cho chúng nó xé lẻ đẻ thêm rác 🧩
                    parent.normalize();
                }
            });
        }

        // Lỡ cục DOM hộp tìm kiếm còn thoi thóp thì bế nó về vị trí ban đầu 🚑
        const searchEl = searchState.searchEl;
        if (searchEl && searchEl.parentNode) {
            searchEl.parentNode.removeChild(searchEl);
        }
        // Trả lại nhân phẩm cho đống nút thao tác, mũi tên bung/gập, tháo mác "đang dò mìn" của cái log đó ra 🎭
        if (panelEl && searchState.recordIndex !== undefined) {
            const recordEl = panelEl.querySelector(`.rlog-record[data-record-index="${searchState.recordIndex}"]`);
            if (recordEl) {
                // Tháo mác "đang dò mìn" (Bọn CSS đang chờ tháo cái này mới nhả mấy cái nút ra đó) 🏷️
                recordEl.classList.remove('rlog-searching');
                // Trả lại cái mũi tên bung/gập log nha (▾)
                const toggleIcon = recordEl.querySelector('.rlog-toggle-icon');
                if (toggleIcon) toggleIcon.style.visibility = '';
            }
        }

        searchState = null;
    }
}

/** @type {Set<string>} Hàng cấm \s (Đống khoảng trắng các loại) (Gom vô Set né cái trò regex quét từng chữ lòi bản họng) 🚷 */
const WHITESPACE_CHARS = new Set([' ', '\t', '\n', '\r', '\f', '\v', '\u00a0', '\u1680',
    '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006', '\u2007',
    '\u2008', '\u2009', '\u200a', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff']);

/**
 * Xài phép đồng hóa văn bản để dò mìn: Bắt mấy cái khoảng trắng (space, enter, tab, space bự...) tụm năm tụm ba thì ép thành 1 khoảng trắng duy nhất! 🪄
 * Khuyến mãi thêm cái bản đồ gốc, chữ nào ở bản fake ứng với chữ nào ở bản real, để lát ụp highlight lên cho chuẩn đét.
 *
 * Cớ sao phải xài trò này: Editor copy cả đống chữ bên ngoài ném vô ô tìm kiếm, hệ thống nó ăn gian đổi mẹ hết \n thành khoảng trắng. 😤
 * Mà trong tin nhắn rớt dòng toàn \n với \r\n, rinh qua dò nguyên xi là tịt ngòi ngay.
 * Đồng hóa xong thì "xuống dòng/khoảng trắng trong log" = "khoảng trắng trong từ khóa", dò xuyên lục địa luôn! (๑•̀ㅂ•́)و✧
 *
 * @param {string} text Bức thư gốc
 * @returns {{normalized: string, map: number[]}}
 *   normalized: Bản đồng hóa (Size ≤ bản gốc)
 *   map: Trục hoành bằng size của normalized, map[i] = Chữ thứ i ở bản fake đang đứng số mấy ở bản real
 */
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
            // Mấy cục khoảng trắng sáp vô nhau thì ép thành 1 thôi (Đồng hóa) 🗜️
        } else {
            normalized += ch;
            map.push(i);
            lastWasSpace = false;
        }
    }
    return { normalized, map };
}

/**
 * Đào bới mọi ngóc ngách trong 1 log để kiếm chỗ dính mìn 🕵️‍♀️
 * Chỉ chơi trò quét chuỗi chay, cấm đụng vô DOM, bao mượt dù đoạn chat có dài như sớ táo quân! 📜
 * Trước khi bới là ép đồng hóa (bóp nghẹt khoảng trắng) cả từ khóa lẫn nội dung, thành ra:
 *   - Lụm text copy ném vô (xuống dòng bị đổi thành khoảng trắng) vẫn bắt dính 🎣
 *   - Ba cái \n / \r\n / dòng trống trong tin nhắn bị đánh đồng bằng khoảng trắng hết
 *   - Tọa độ start/end nôn ra là của bản real (Qua bản đồ dịch lại rồi), lấy đắp highlight thẳng vô DOM luôn 🎯
 * @param {number} recordIndex Số báo danh của log
 * @param {string} keyword Từ khóa dò mìn
 * @returns {Array<{msgIdx: number, start: number, end: number}>} Cuốn sổ địa chỉ bãi mìn
 */
function findMatchesInRecord(recordIndex, keyword) {
    const record = records[recordIndex];
    if (!record || !record.messages || !keyword) return [];

    // Đồng hóa từ khóa: Bóp nghẹt khoảng trắng dính chùm, xén bớt râu ria hai đầu ✂️
    const normalizedKeyword = keyword.replace(/\s+/g, ' ').trim();
    if (!normalizedKeyword) return [];
    // Dò mìn bất chấp viết hoa viết thường nha 🙈
    const lowerKeyword = normalizedKeyword.toLowerCase();

    const matches = [];

    record.messages.forEach((msg, msgIdx) => {
        if (typeof msg.content !== 'string') return;
        const content = msg.content;
        // Đồng hóa nội dung chat (Bóp nghẹt khoảng trắng + Nhả bản đồ tọa độ) 🗺️
        const { normalized, map } = normalizeTextWithMap(content);
        const lowerContent = normalized.toLowerCase();

        let pos = 0;
        // Đường tắt: Bản đồng hóa mà hông ngửi thấy mùi mìn thì sủi lẹ khỏi cái tin nhắn này 💨
        const firstIdx = lowerContent.indexOf(lowerKeyword);
        if (firstIdx === -1) return;

        // Lùng sục khắp nơi (Phòng hờ sập nguồn thì khóa mõm ở mức 5000 bãi mìn, đứa nào chat lặp đi lặp lại tốn tài nguyên quá!) 🛡️
        let count = 0;
        while (pos <= normalized.length && count < 5000) {
            const idx = lowerContent.indexOf(lowerKeyword, pos);
            if (idx === -1) break;
            // Đem tọa độ bản fake dò bản đồ quy ra tọa độ bản real 🗺️
            const origStart = map[idx];
            const normEnd = idx + normalizedKeyword.length;
            const origEnd = map[normEnd - 1] + 1;
            matches.push({ msgIdx, start: origStart, end: origEnd });
            pos = idx + normalizedKeyword.length;
            count++;
        }
    });

    return matches;
}

/**
 * Tẩy sạch bách mấy cái highlight <mark> (Cả vàng khè lẫn cam lè), hoàn lương trả lại text nguyên thủy 🧽
 */
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

/**
 * Lột lon cái hồng tâm cam lè xuống thành mìn vàng khè bình thường (Vẫn ghim trong DOM nha)
 * Để dành lúc nhảy cóc thì xài lại luôn cái cục vàng, khỏi mắc công bôi lại từ đầu cho đỡ giật. ♻️
 * Éo giống clearSearchHighlights đâu: Hông thèm giết mark, chỉ lột áo CSS thôi,
 * Nhờ rứa hồng tâm cũ biến thành vàng khè, lỡ tin nhắn bị gập thì mỏ vàng vẫn nằm đó chờ bung lụa. ✨
 * Lúc lột lon nhớ khắc vô não cái matchIdx cũ, đặng lát nhảy về còn lôi đầu removeYellowMarkByMatchIdx ra kiếm được. 🧠
 * @param {number} [oldMatchIdx] Số thứ tự hồng tâm cũ (Tùy hỉ, để khắc dấu)
 */
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

/**
 * Trảm cái cục vàng khè có cái mác matchIdx y xì (Chỗ này chuẩn bị trải thảm cam lè lên rồi) 🔪
 * @param {number} matchIdx Số thứ tự trong bãi mìn
 */
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

/**
 * Chui vô ruột tin nhắn, ốp cái màng <mark> đè lên khúc chữ từ tọa độ [start, end) 🌯
 * Xài bạch cốt trảo TreeWalker luồn lách kiếm text node cho chuẩn đét. 🕵️‍♀️
 * @param {HTMLElement} contentEl Cục DOM .rmsg-content
 * @param {number} start Mốc bắt đầu (So với text chay của tin đó)
 * @param {number} end Mốc dứt điểm
 * @param {string} [className='rlog-search-mark-current'] Tên áo CSS cho <mark> (Vàng khè là lính, Cam lè là tướng)
 * @returns {HTMLElement|null} Nặn ra được cái <mark> hông, xịt thì nhả null
 */
function highlightRange(contentEl, start, end, className = 'rlog-search-mark-current') {
    if (!contentEl || start < 0 || end <= start) return null;

    const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
    let currentOffset = 0;
    let node = null;

    // Lùng cho ra cái text node đang ngậm cái mốc start 🔍
    while ((node = walker.nextNode())) {
        const nodeLen = node.textContent.length;
        if (currentOffset + nodeLen > start) break;
        currentOffset += nodeLen;
    }
    if (!node) return null;

    // Đem con bỏ chợ đập ra: Khúc đầu / mark / Khúc đuôi 🪓
    const nodeStart = currentOffset;
    const splitStart = start - nodeStart;
    const splitEnd = end - nodeStart;

    if (splitEnd > node.textContent.length) {
        // Vụ mà chân đạp hai thuyền (Cái chữ vắt ngang 2 text node), Tawa dẹp luôn: Chỉ hốt khúc nào nằm trong node hiện tại thôi 🤷‍♀️
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

/**
 * Ụp highlight (vàng khè) lên toàn bộ bãi mìn trong log này, trừ thằng hồng tâm ra (Thằng đó để applyCurrentMatch vẽ màu cam riêng) 🎨
 * Bắt buộc xử lý từ đuôi lên đầu (start giảm dần) trong 1 tin nhắn, để mark đẻ ra hông phá vỡ tọa độ mấy đứa đi sau! 🧠
 * @param {HTMLElement} recordEl Cục DOM của log
 * @param {number} recordIndex Số báo danh của log
 */
function highlightAllMatches(recordEl, recordIndex) {
    if (!searchState || !recordEl) return;
    const record = records[recordIndex];
    if (!record) return;

    // Chia mâm theo tin nhắn (Né thằng hồng tâm ra, nó VIP được vẽ cam riêng)
    // Kẹp theo số thứ tự của từng bãi mìn, đặng lát cho cục vàng khắc dấu data-match-idx 🏷️
    const matchesByMsg = new Map();
    searchState.matches.forEach((match, idx) => {
        if (idx === searchState.currentIdx) return;
        if (!matchesByMsg.has(match.msgIdx)) matchesByMsg.set(match.msgIdx, []);
        matchesByMsg.get(match.msgIdx).push({ match, idx });
    });

    matchesByMsg.forEach((msgMatches, msgIdx) => {
        const msg = record.messages[msgIdx];
        if (!msg) return;
        // Ép tin nhắn bung lụa (Giấu dốt sao mà ụp highlight được) 🌸
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

        // Quất từ đít lên đầu, cấm để mấy mark đẻ ra phá hư tọa độ! 🛑
        msgMatches.sort((a, b) => b.match.start - a.match.start);
        msgMatches.forEach(({ match, idx }) => {
            const markEl = highlightRange(contentEl, match.start, match.end, 'rlog-search-mark');
            // Khắc dấu số thứ tự, nộp mạng cho removeYellowMarkByMatchIdx biết đường mà trảm cục vàng 🎯
            if (markEl) markEl.dataset.matchIdx = String(idx);
        });
    });
}

/**
 * Quăng cái hồng tâm vào đúng chỗ bành trướng thoải mái nhất trên màn hình 🛋️
 * Quy trình:
 *   1. Lăn cuộn ruột gan cái .rmsg-content, bắt thằng hồng tâm lòi mặt ra trong hộp đó
 *   2. Tự lấy não bám tay tính toán scrollTop của .rlog-list, dời cái hộp tin nhắn lọt thỏm ngay dưới thanh tiêu đề dính dính
 * Giải oan: Tawa hông xài scrollIntoView đâu nha—— nó ngu lắm, lăn luôn cả lò tông môn họ hàng cái hộp,
 * Lên điện thoại là nó quậy banh cái giao diện ST (body/#sheld) luôn, lệch pha toàn tập! 🙅‍♀️
 * @param {HTMLElement} markEl Cục DOM <mark> đang rực sáng
 * @param {HTMLElement} contentEl Cục DOM .rmsg-content đang nhốt nó
 */
function scrollToMatch(markEl, contentEl) {
    if (!markEl || !contentEl) return;

    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    if (!listEl) return;

    // 1. Quậy trong ruột tin nhắn: Treo cái mark nằm chơi vơi cỡ khúc giữa nhích lên trên của hộp content
    const contentRect = contentEl.getBoundingClientRect();
    const markRect = markEl.getBoundingClientRect();
    const contentScrollTop = contentEl.scrollTop;
    const relativeTop = markRect.top - contentRect.top + contentScrollTop;
    // Điểm G ướm chừng: Cách nóc hộp tầm 25% (Nhìn cho sướng con mắt) 👀
    const targetScroll = relativeTop - contentRect.height * 0.25;
    const clampedContentScroll = Math.max(0, targetScroll);
    contentEl.scrollTo({ top: clampedContentScroll, behavior: 'smooth' });

    // 2. Lăn cuộn vòng ngoài: Đích thân Tawa nắn tọa độ, sút bay cái scrollIntoView phá hoại 🦶
    // Dù ruột gan chưa lăn xong, nhưng nhắm mắt tính cua trong lỗ là ra tọa độ tương lai của mark trong list liền:
    //   Ruột lăn delta > 0 tức là chữ trôi lên, mark cũng lết lên một khúc delta
    //   Chốt sổ tọa độ top của mark = markRect.top - delta
    // Muốn thằng mark đậu ngoan ngoãn dưới mông đống tiêu đề dính dính (Tiêu đề log + Tiêu đề tin nhắn) tầm 8px 🍒
    const delta = clampedContentScroll - contentScrollTop;
    const markFinalTop = markRect.top - delta;
    const listRect = listEl.getBoundingClientRect();

    // Gom rác chiều cao của 2 cái tiêu đề dính (Độ dày nó chiếm lúc đu trần), dẹp cái tư tưởng chốt cứng 48px đi:
    // - .rlog-record-header: Đu trên nóc list (Cao sương sương 40px)
    // - .rmsg-header: Bú liếm dưới đít tiêu đề log (Cao cỡ 32px+)
    // Thảy offsetHeight vô đo tận tay là bao tương thích PC/điện thoại, chấp luôn vụ điện thoại mập lên rớt dòng. 📏
    // Tối kỵ: Cấm đo bottom bằng getBoundingClientRect() nha——
    // Lúc cái mark khuất bóng, header của nó hông có đu trần, bottom tuột tuốt luốt ra ngoài hệ mặt trời,
    // Làm scrollTop bị ép về 0 (Trượt thẳng lên đỉnh list luôn). offsetHeight là chân ái, hông thèm quan tâm có đu trần hay hông. 🧠✨
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

    // Tọa độ tư duy của mark trong list (Hông bị trò lăn cuộn làm lu mờ)
    const markInList = listEl.scrollTop + markFinalTop - listRect.top;
    // Đích đến: Mark núp bóng tiêu đề, neo ở độ cao 1/3 vùng nhìn thấy (Trải nghiệm quý tộc) 👑
    // Vùng nhìn thấy = Tầm nhìn của list - Bề dày đống tiêu đề dính
    const visibleHeight = Math.max(0, listEl.clientHeight - stickyHeight);
    const targetListScroll = markInList - stickyHeight - visibleHeight * 0.33;

    // Khóa cổ trong phạm vi hợp pháp (Đừng để trình duyệt nhúng tay ép ép rồi giật lùi nhảy cóc) 🛑
    const maxListScroll = Math.max(0, listEl.scrollHeight - listEl.clientHeight);
    const clampedListScroll = Math.max(0, Math.min(targetListScroll, maxListScroll));

    // Thấy chướng mắt mới thèm lăn vòng ngoài (Mark lù lù ra đó rồi thì im đi, chọt vô nó giật bung nóc ST) 🤫
    if (Math.abs(clampedListScroll - listEl.scrollTop) > 1) {
        listEl.scrollTo({ top: clampedListScroll, behavior: 'smooth' });
    }
}

/**
 * Úm ba la update cái bảng đếm số hit (Kiểu 3/18 nè) 🔢
 */
function updateSearchCounter() {
    if (!searchState || !searchState.searchEl) return;
    const counter = searchState.searchEl.querySelector('.rlog-search-count');
    if (!counter) return;

    const total = searchState.matches.length;
    const current = total > 0 ? searchState.currentIdx + 1 : 0;
    counter.textContent = `${current}/${total}`;

    // Đói kém hoặc có mỗi 1 cái thì xé cmn cặp mũi tên lên xuống đi ❌
    const prevBtn = searchState.searchEl.querySelector('.rlog-search-prev');
    const nextBtn = searchState.searchEl.querySelector('.rlog-search-next');
    if (prevBtn) prevBtn.disabled = total <= 1;
    if (nextBtn) nextBtn.disabled = total <= 1;
}

/**
 * Triển khai dò mìn ở cái tin nhắn chỉ định, quất màu cam lên hồng tâm + bay thẳng tới đó luôn 🚀
 * @param {number} msgIdx Mật danh tin nhắn
 * @param {number} matchIdx Số thứ tự trong bãi mìn
 * @param {boolean} [redrawYellowHighlights=true] Có chơi sang tô lại hết đống mìn vàng hông?
 *   - true (Lúc đổi từ khóa): Tẩy sạch hết rồi ốp nguyên bộ áo vàng mới 💛
 *   - false (Lúc bấm lên xuống nhảy cóc): Chỉ gỡ mác cam của thằng hiện tại thôi, xài lại đống mìn vàng có sẵn (Hack tốc độ chạy cho mướt) 🏎️💨
 */
function applyCurrentMatch(msgIdx, matchIdx, redrawYellowHighlights = true) {
    if (!searchState) return;
    const recordIndex = searchState.recordIndex;
    const record = records[recordIndex];
    if (!record || !record.messages[msgIdx]) return;

    const listEl = panelEl.querySelector('#rlog-list');
    const recordEl = listEl.querySelector(`.rlog-record[data-record-index="${recordIndex}"]`);
    if (!recordEl) return;

    if (redrawYellowHighlights) {
        // Đổi từ khóa: Diệt sạch mìn (Vàng lẫn Cam) rồi trải lại từ đầu 🧨
        clearSearchHighlights();

        // Bắt cái log phải phanh ngực ra nha 👕
        if (record.collapsed) {
            record.collapsed = false;
            recordEl.classList.add('expanded');
            recordEl.classList.remove('collapsed');
        }

        // Rắc mìn vàng đầy cái log (Né thằng hồng tâm ra)
        // Lột sạch sành sanh mấy tin nhắn đang giấu dốt luôn 🌸
        highlightAllMatches(recordEl, recordIndex);
    } else {
        // Nhảy cóc: Lột lon cái hồng tâm cam cũ xuống thành vàng (Giữ nguyên mark trong DOM, chỉ đổi class áo thôi)
        // Húp trọn cái đống mìn vàng vẽ sẵn, ngó lơ chuyện vẽ lại từ đầu cho máy bớt thở dốc 😮‍💨
        const oldIdx = searchState.currentIdx;
        clearCurrentHighlight(oldIdx);

        // Nhổ cái mìn vàng mọc sẵn ngay đích đến đi (Lỡ trước đó ghé chơi rồi thì mìn vàng vẫn mọc rễ ở đó)
        // Ép phải nhổ, hông nhổ là lúc vẽ mìn cam nó tính nhầm tọa độ ngu người luôn! 🛑
        removeYellowMarkByMatchIdx(matchIdx);

        // Bắt cái log phải phanh ngực ra (Lúc tra chữ lỡ tay gập lại mất)
        if (record.collapsed) {
            record.collapsed = false;
            recordEl.classList.add('expanded');
            recordEl.classList.remove('collapsed');
        }
    }

    // Đảm bảo tin nhắn lòi trần trụi ra (Nhét mặt vô gầm giường sao mà bắt tọa độ) 🛏️
    const msg = record.messages[msgIdx];
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

    // Ụp thanh cuộn ma pháp vô (Tin mới bung ra, ráng đợi CSS uốn éo xíu rồi hẳn nặn thanh) 🪄
    setTimeout(() => createScrollbarForContent(contentEl), 50);

    const match = searchState.matches[matchIdx];
    if (!match) return;

    // Ốp mìn cam lên hồng tâm 🍊
    const markEl = highlightRange(contentEl, match.start, match.end, 'rlog-search-mark-current');

    // Cập nhật số má 🧮
    searchState.currentIdx = matchIdx;
    updateSearchCounter();

    if (markEl) {
        scrollToMatch(markEl, contentEl);
    }
}

/**
 * Quất phép dò mìn (Debounce gọi đò sau khi từ khóa biến hình) 🔍
 * @param {number} recordIndex Số báo danh của log
 * @param {string} keyword Từ khóa dò mìn
 */
function performSearch(recordIndex, keyword) {
    if (!searchState || !panelEl) return;

    // Tiêu hủy chứng cứ vụ dò mìn đợt trước (matches với highlight bay sạch) 🗑️
    searchState.matches = findMatchesInRecord(recordIndex, keyword);
    searchState.currentIdx = -1;
    searchState.keyword = keyword;

    if (!keyword) {
        clearSearchHighlights();
        updateSearchCounter();
        return;
    }

    if (searchState.matches.length > 0) {
        // Cưỡng ép bay thẳng tới bãi mìn đầu tiên luôn 🎯
        searchState.currentIdx = 0;
        applyCurrentMatch(searchState.matches[0].msgIdx, 0);
    } else {
        // Thất thu: Cạo sạch highlight, reset bộ đếm về cái máng lợn 0/0 🐖
        clearSearchHighlights();
        updateSearchCounter();
    }
}

/**
 * Nhảy cóc sang bãi mìn trước/sau
 * @param {number} direction 1=Phóng tới, -1=Lùi bước
 */
function navigateSearch(direction) {
    if (!searchState || !searchState.matches || searchState.matches.length === 0) return;

    const total = searchState.matches.length;
    let nextIdx = searchState.currentIdx + direction;
    // Nhảy vòng tròn địa ngục 🔄
    if (nextIdx >= total) nextIdx = 0;
    if (nextIdx < 0) nextIdx = total - 1;

    const match = searchState.matches[nextIdx];
    // Tham số thứ 3 thảy false vô: Đi bụi nhảy cóc thì chỉ gỡ lon cam thôi, xài lại đồ nghề mìn vàng (Hack tốc độ) 🏎️💨
    applyCurrentMatch(match.msgIdx, nextIdx, false);
}

/**
 * Đóng sập ô gõ chữ, reset về thời kỳ đồ đá 🗿
 */
function closeSearch() {
    resetSearchIfActive();
}

/**
 * Gọi hồn chế độ dò mìn cho log được chọn (Luật độc tôn: Mỗi lần 1 log được tỏa sáng thôi nha) 🌟
 * Chọt kính lúp là hiện hình.
 * @param {number} recordIndex Số báo danh của log
 */
function openSearchForRecord(recordIndex) {
    if (!panelEl) return;
    // Luật độc tôn: Đập chết mọi cuộc dò mìn đang hoành hành (Của giang hồ hay của bản thân đều chết) 🔪
    resetSearchIfActive();

    const listEl = panelEl.querySelector('#rlog-list');
    const recordEl = listEl.querySelector(`.rlog-record[data-record-index="${recordIndex}"]`);
    if (!recordEl) return;

    const actionsEl = recordEl.querySelector('.rlog-record-actions');
    const actionsInner = recordEl.querySelector('.rlog-record-actions-inner');
    if (!actionsEl || !actionsInner) return;

    // Đính mác "đang dò mìn" (Cho bọn CSS che khuất hết đống nút thừa thải với cái mũi tên xuống,
    // Xả mặt bằng cho cái hộp chữ bành trướng sang phải nuốt chửng) 🏗️
    recordEl.classList.add('rlog-searching');

    // Giấu luôn cái mũi tên gập/bung (▾)—— Thẩy cục visibility vô để nó tàng hình mà vẫn chiếm cái lỗ đó,
    // Trộn chung với chiêu khóa cứng bề ngang của actions-inner, ếm bùa cho cái kính lúp dính chặt hông trôi tuột! 🧠✨
    const toggleIcon = recordEl.querySelector('.rlog-toggle-icon');
    if (toggleIcon) toggleIcon.style.visibility = 'hidden';

    // Lỡ log nó đang ngậm mỏ thì bóp cổ bắt nó há ra (Dò mìn mà chữ trốn mất thì dò niềm tin) 😤
    const record = records[recordIndex];
    if (record && record.collapsed) {
        record.collapsed = false;
        recordEl.classList.add('expanded');
        recordEl.classList.remove('collapsed');
        // Bung lụa xong thì lười biếng nặn từ từ cái thanh cuộn ma pháp (Thấy trên màn hình mới nặn, chưa thấy thì cất kho) 🐌
        queueScrollbarsForEls(recordEl.querySelectorAll('.rmsg-content'));
    }

    // Nặn cái hộp gõ chữ (Thẩy kính lúp ra rìa: Cái kính lúp cùi bắp cứ đứng yên làm mỏ neo định vị đi,
    // Hộp chữ sẽ chui từ nách phải của mỏ neo bung ra, nuốt trọn cái hố do mấy nút kia tàng hình để lại) 🎪
    const searchBox = document.createElement('div');
    searchBox.className = 'rlog-search-box';
    searchBox.innerHTML = `
        <div class="rlog-search-input-wrap">
            <input type="text" class="rlog-search-input" placeholder="Tìm kiếm..." autocomplete="off" spellcheck="false">
            <span class="rlog-search-count">0/0</span>
        </div>
        <button class="rlog-search-next" title="Kế tiếp (Enter)" disabled>
            <i class="fa-solid fa-arrow-down"></i>
        </button>
        <button class="rlog-search-prev" title="Trở lại (Shift+Enter)" disabled>
            <i class="fa-solid fa-arrow-up"></i>
        </button>
    `;

    // Nhét vô hông bên phải kính lúp (Kính lúp cắm rễ, hộp gõ chữ bành trướng qua phải) 👉
    const searchBtn = actionsInner.querySelector('.rlog-search-btn');
    if (searchBtn) {
        searchBtn.insertAdjacentElement('afterend', searchBox);
    } else {
        actionsInner.appendChild(searchBox);
    }

    // Cài số dặm cho bộ dò mìn
    searchState = {
        recordIndex,
        keyword: '',
        matches: [],
        currentIdx: -1,
        searchEl: searchBox,
    };

    // Xích cổ mấy sự kiện vô hộp chữ 🪢
    const input = searchBox.querySelector('.rlog-search-input');
    const prevBtn = searchBox.querySelector('.rlog-search-prev');
    const nextBtn = searchBox.querySelector('.rlog-search-next');

    /** @type {boolean} Cờ báo hiệu đang gõ telex/pinyin (Chữ chưa rớt xuống mâm thì cấm kích hoạt input event dò mìn nha) 🚩 */
    let isComposing = false;
    /** Hàm điều phối chống run tay: Cho input event với compositionend xài chung đồ 🤝 */
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

    // Đang gõ dấu: Dựng cờ lên, mọi tiếng kêu gào của input event khúc này đều bị bịt miệng 🤫
    input.addEventListener('compositionstart', () => { isComposing = true; });
    // Gõ dấu xong (Chữ rớt xuống mâm): Hạ cờ xuống rồi chêm 1 cú dò mìn bù lỗ (Khúc nãy bịt miệng nên sót input event) 補
    input.addEventListener('compositionend', () => {
        isComposing = false;
        scheduleSearch();
    });

    // Vừa gõ vừa dò (Debounce dằn mặt), lúc đang gõ dấu thì bơ đi nha 💅
    input.addEventListener('input', (e) => {
        if (isComposing || e.isComposing || e.keyCode === 229) return;
        scheduleSearch();
    });

    // Hack phím tắt: Enter phóng tới / Shift+Enter giật lùi / Esc sủi kèo ⌨️
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

    // Ấn đầu con trỏ vô ô gõ chữ 🎯
    setTimeout(() => {
        if (input && searchState && searchState.searchEl === searchBox) {
            input.focus();
        }
    }, 50);
}

function getFullPromptText(record) {
    return record.messages
        .map((m) => `[${m.role}]\n${m.content}`)
        .join('\n\n');
}

function getTotalTokens(messages) {
    return messages.reduce((sum, m) => sum + m.tokens, 0);
}

/**
 * Bói ra kiếp nạn token (Từ 0 tới 7) dựa vô tổng số nha 🔢
 * @param {number} tokens Lượng token
 * @returns {number} Level kiếp nạn 0-7
 */
function getTokenTier(tokens) {
    if (tokens >= 200000) return 7;
    if (tokens >= 128000) return 6;
    if (tokens >= 64000) return 5;
    if (tokens >= 32000) return 4;
    if (tokens >= 16000) return 3;
    if (tokens >= 8000) return 2;
    if (tokens >= 4000) return 1;
    return 0;
}

function getRoleClass(role) {
    const map = {
        'system': 'role-system',
        'user': 'role-user',
        'assistant': 'role-assistant',
        'tool': 'role-tool',
    };
    return map[role] || 'role-other';
}

function getRoleLabel(role) {
    const map = {
        'system': 'System',
        'user': 'User',
        'assistant': 'Assistant',
        'tool': 'Tool',
    };
    return map[role] || role;
}

/**
 * Nạo khúc đầu của tin nhắn làm mồi chữ (Cho nó lách vô đứng cạnh nhãn nhân vật dòm cho xịn) 👀
 * Hốt trọn ổ text (Kể cả ba cái mác XML), múc xuyên ranh giới dòng chữ, moi càng nhiều chữ đưa lên sóng càng tốt.
 * Đè đứt cổ mấy cái \n biến nó thành khoảng trắng hết (CSS white-space: nowrap ép sống trên 1 dòng nha).
 * JS tự xử trảm ở mốc 200 chữ làm phao an toàn, còn chuyện che lấp bằng ba chấm thì quăng cho CSS nhìn mặt bề ngang panel mà bắt hình dong. ✂️
 * @param {string} content Ruột gan tin nhắn
 * @returns {string} Mồi chữ, ruột rỗng thì nôn ra chuỗi rỗng
 */
function getContentPreview(content) {
    if (!content || typeof content !== 'string') return '';
    // Đập chết \n đổi thành khoảng trắng, xong lột sạch râu ria hai đầu 🪒
    const collapsed = content.replace(/\n/g, ' ').trim();
    if (!collapsed) return '';
    // Cấm vượt biên ở mốc 200 chữ, đưa CSS múa tiếp phần cắt cúp bằng mắt thường ✂️
    return collapsed.length > 200 ? collapsed.slice(0, 200) + '…' : collapsed;
}

function buildMessageHtml(msg, recordIdx, msgIdx) {
    const roleClass = getRoleClass(msg.role);
    const roleLabel = getRoleLabel(msg.role);
    const collapsedClass = msg.collapsed ? 'collapsed' : 'expanded';
    // tokenPrecise = true là hàng Auth xài máy chém Native của ST, quăng mẹ cái dấu ~ bói mò đi 😤
    const tokenPrefix = msg.tokenPrecise ? '' : '~';
    // Mồi chữ xem trước (Chỉ lòi ra lúc mở công tắc, hoặc bị ép cung lúc đang đi tour) 👀
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
                <button class="rmsg-copy-btn" data-record="${recordIdx}" data-msg="${msgIdx}" title="Copy tin này">
                    <i class="fa-solid fa-copy"></i>
                </button>
            </div>
            <pre class="rmsg-content">${escapeHtml(msg.content)}</pre>
        </div>
    `;
}

function renderPanelContent() {
    if (!panelEl) return;

    // Đập đi xây lại DOM thì phải tẩy uế cái vụ dò mìn trước (Mấy cái highlight với hộp tìm kiếm ôm DOM cũ là ngỏm hết) 🧹
    resetSearchIfActive();

    const listEl = panelEl.querySelector('#rlog-list');
    if (!listEl) return;

    const countEl = panelEl.querySelector('.rlog-title-count');
    if (countEl) {
        countEl.textContent = `${records.length} / ${MAX_RECORDS}`;
    }

    if (records.length === 0) {
        panelEl.classList.add('rlog-empty-list');
        const emptyMsg = masterEnabled 
            ? 'Kho vắng hoe à, gửi thử vài dòng rồi vô đây dòm nha. 💨'
            : 'Đã rút phích cắm cào log rồi, chọt lại cái nút Nguồn giùm đi! 🔌';
        listEl.innerHTML = `<div class="rlog-empty">${escapeHtml(emptyMsg)}</div>`;
        panelContentDirty = false;
        return;
    }
    panelEl.classList.remove('rlog-empty-list');

    listEl.innerHTML = records
        .map((rec, idx) => {
            const totalTokens = getTotalTokens(rec.messages);
            const collapsedClass = rec.collapsed ? 'collapsed' : 'expanded';
            const sourceLabel = getSourceLabel(rec.source);
            const sourceClass = getSourceClass(rec.source);
            const sourceTitle = (rec.source && rec.source.detail) || sourceLabel;

            // Check coi nguyên bầy tin nhắn có phải đứa nào cũng chơi hàng Auth token hông (Cấm bói mò)
            const allPrecise = rec.messages.every(m => m.tokenPrecise === true);
            const recordTokenPrefix = allPrecise ? '' : '~';

            const messagesHtml = rec.messages
                .map((msg, mIdx) => buildMessageHtml(msg, idx, mIdx))
                .join('');

            return `
                <div class="rlog-record ${collapsedClass}" data-record-index="${idx}">
                    <div class="rlog-record-header">
                        <div class="rlog-record-info">
                            <span class="rlog-char-name">${escapeHtml(rec.characterName)}</span>
                            <span class="rlog-source-badge ${sourceClass}" title="${escapeHtml(sourceTitle)}"><span class="rlog-status-dot"></span>${escapeHtml(sourceLabel)}</span>
                            <span class="rlog-time">${escapeHtml(rec.timestamp)}</span>
                            <span class="rlog-model-badge" title="Tên model xài ké">${escapeHtml(rec.modelName || 'Model ẩn danh')}</span>
                            <span class="rlog-total-tokens">${recordTokenPrefix}<span class="rlog-token-num rlog-token-tier-${getTokenTier(totalTokens)}">${totalTokens}</span>&nbsp;tokens / ${rec.messages.length} đoạn chữ</span>
                        </div>
                        <div class="rlog-record-actions">
                            <div class="rlog-record-actions-inner" style="display:flex; gap:4px; align-items:center;">
                                <button class="rlog-search-btn" data-record="${idx}" title="Lục lọi log này">
                                    <i class="fa-solid fa-magnifying-glass"></i>
                                </button>
                                <button class="rlog-msg-expand-btn" data-record="${idx}" title="Banh chành ra hết">
                                    <i class="fa-solid fa-expand"></i>
                                </button>
                                <button class="rlog-msg-collapse-btn" data-record="${idx}" title="Gập lại cho gọn">
                                    <i class="fa-solid fa-compress-alt"></i>
                                </button>
                                <button class="rlog-read-full-btn" data-record="${idx}" title="Soi Sạch Nội Y (Xem Full)">
                                    <i class="fa-solid fa-file-lines"></i>
                                </button>
                                <button class="rlog-delete-record-btn" data-record="${idx}" title="Tiễn em đi xa">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>
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

    // Bơm cái --rlog-rec-h (Chiều cao thật của mâm tiêu đề) vô từng log, để cái tiêu đề tin nhắn biết đường mà bấu víu trần nhà 📐
    syncRecordHeaderVars(listEl);

    // Nặn thanh cuộn ma pháp overlay cho mấy cục chữ tin nhắn 🪄
    attachScrollIndicators(listEl);

    // Chát vữa xong xuôi, xóa cái mác bẩn đi (Lần sau mở cửa khỏi tốn công đập lại) ✨
    panelContentDirty = false;
}

/**
 * Đu bám chiều cao cho cái --rlog-rec-h: Đo tận tay cái mâm tiêu đề log (.rlog-record-header) cao bao nhiêu. 📏
 *
 * Cái khoảng dính trần (sticky top) của tiêu đề tin nhắn (.rmsg-header) phải khít rịt bằng chiều cao tiêu đề log, thì nó mới chui tọt vô núp lùm ngay dưới đít được.
 * Cái mâm tiêu đề log nó nhạy cảm bề ngang lắm (Ép màn hình vô là chữ rớt đài phình ra, đo thử có khi hơn 100px luôn 😱),
 * Tawa mà lười chốt cứng 40px/36px là thằng tiêu đề tin nhắn bị đè bẹp xí cmnl. Chỗ này là Tawa tự tay đo từng log rồi nhét vô biến CSS,
 * Để cho phép sticky nguyên thủy của trình duyệt cắn cái biến đó mà định vị; Biến này chỉ nhảy số lúc có biến đổi layout thôi, cấm xen vô lúc đang lăn cuộn! 🧠✨
 */
function syncRecordHeaderVars(listEl) {
    if (!listEl) return;
    ensureSharedResizeObserver();
    // Rút phép mấy đứa bị ném ra khỏi list (renderPanelContent nó phang innerHTML đập nát DOM cũ rồi) 🗑️
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
            // Bứng cái getBoundingClientRect().height (Lấy số lẻ) dẹp mẹ cái offsetHeight (Lấy chẵn) đi: 🔢
            // Chiều cao lúc rớt dòng hay ra số lẻ (Cỡ 65.59px), chẻ tròn số là lòi ra cái rãnh nứt giữa hai thằng tiêu đề
            // (Màn xịn soi kỹ là thấy hở 1px tởm lắm) 🤮
            recordEl.style.setProperty('--rlog-rec-h', `${headerEl.getBoundingClientRect().height.toFixed(2)}px`);
            // Mâm tiêu đề mà mập ốm (Rớt dòng/đổi font/zoom) là tự động update tọa độ 🔄
            if (!observedRecordHeaders.has(headerEl)) {
                observedRecordHeaders.add(headerEl);
                sharedResizeObserver.observe(headerEl);
            }
        }
    });
}

/**
 * Hộp kẹp phanh cuộn: Me lúc trước/sau khi múa múa bung/gập thì lấy sổ ghi lại tọa độ,
 * Bơm ngược lại cho thanh cuộn để giữ cái cục DOM dính rịt một chỗ giữa màn hình, hông bị nhảy lambada. 🕺
 * @param {HTMLElement} anchorEl Con mồi phải bị trói dính màn hình
 * @param {Function} action Cú chưởng làm thay đổi chiều cao DOM
 */
function preserveScrollTop(action) {
    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    if (!listEl) { action(); return; }
    const saved = listEl.scrollTop;
    action();
    listEl.scrollTop = saved;
}

function bindListEvents(listEl) {
    listEl.querySelectorAll('.rmsg-header').forEach((header) => {
        header.addEventListener('click', function (e) {
            if (e.target.closest('button')) return;
            const msgItem = this.closest('.rmsg-item');
            const recIdx = Number(msgItem.dataset.record);
            const msgIdx = Number(msgItem.dataset.msg);
            preserveScrollTop(() => {
                toggleMessageCollapse(recIdx, msgIdx, msgItem);
            });
        });
    });

    listEl.querySelectorAll('.rlog-record-header').forEach((header) => {
        /** @type {boolean} Bãi đáp đầu tiên lúc chọt tay có nằm trong ô gõ chữ hông (Kéo bôi đen lố tay cũng cấm gập log) 🛡️ */
        let mouseDownInSearchBox = false;
        header.addEventListener('mousedown', (e) => {
            mouseDownInSearchBox = e.target.closest('.rlog-search-box') !== null;
        });
        header.addEventListener('touchstart', (e) => {
            mouseDownInSearchBox = e.target.closest('.rlog-search-box') !== null;
        });
        header.addEventListener('click', function (e) {
            if (e.target.closest('button')) return;
            // Đụng vô ranh giới dò mìn (Ô chữ/Bộ đếm/Lỗ hở) thì bơ cái trò gập/bung đi, giữ nguyên hiện trường cho êm đẹp 🤫
            if (e.target.closest('.rlog-search-box')) return;
            // Nhấn từ trong ô chữ kéo lết ra ngoài rồi thả, thằng ăn đòn là ông nội của 2 đứa (header),
            // Khúc này cấm đụng chạm bung/gập, hông là đang bôi đen chữ lố tay mà sập mẹ nó ô tìm kiếm thì chửi Tawa! 🛑
            if (mouseDownInSearchBox) return;
            const recordEl = this.closest('.rlog-record');
            const idx = Number(recordEl.dataset.recordIndex);
            // Lật/đắp log mà vẫn dìm cứng tọa độ cuộn (Tiêu đề ghim chết trần nhà, ruột cứ thế bung xuống dưới thôi) ⚓
            preserveScrollTop(() => {
                toggleRecordCollapse(idx, recordEl);
            });
        });
    });

    listEl.querySelectorAll('.rlog-search-btn').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const idx = Number(this.dataset.record);
            // Luật chơi của Kính lúp:
            // - Chưa bày mâm dò mìn → Khui mâm 🔍
            // - Đang bày mâm của mình → Dẹp mâm ❌
            // - Đang bày mâm của nhà hàng xóm → Đập mâm nhà nó, giành mâm cho mình! 🥊
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
            preserveScrollTop(() => {
                collapseRecordMessages(idx);
            });
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

    listEl.querySelectorAll('.rlog-delete-record-btn').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const idx = Number(this.dataset.record);
            const record = records[idx];
            if (!record) return;

            // Ép ký giấy sinh tử trước khi trảm, lỡ chọt nhầm thì mỏ máu nha 🔪
            showConfirmDialog({
                title: 'Trảm một mạng log',
                message: `Muốn tiễn <strong>${escapeHtml(record.characterName)}</strong> đi bán muối thật hả? <br>(${escapeHtml(record.timestamp)}, ôm theo ${record.messages.length} đoạn chữ) <br>Xóa là bay màu vĩnh viễn, khỏi khóc lóc kêu Tawa đền nha! 💀`,
                confirmText: 'Trảm',
                cancelText: 'Quay xe',
                onConfirm: () => {
                    deleteRecord(idx);
                },
            });
        });
    });

    listEl.querySelectorAll('.rmsg-copy-btn').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const recIdx = Number(this.dataset.record);
            const msgIdx = Number(this.dataset.msg);
            copySingleMessage(recIdx, msgIdx, this);
        });
    });
}

function toggleRecordCollapse(index, recordEl) {
    // Gập log thì dẹp luôn trò dò mìn nha (Gập lại giấu hết mìn rồi dò cái nỗi gì nữa, dẹp đi) 🧹
    resetSearchIfActive();
    records[index].collapsed = !records[index].collapsed;
    if (records[index].collapsed) {
        recordEl.classList.add('collapsed');
        recordEl.classList.remove('expanded');
    } else {
        recordEl.classList.add('expanded');
        recordEl.classList.remove('collapsed');
        // 展开记录后，为消息内容区懒创建进度条（仅视口内立即创建，其余延迟）
        queueScrollbarsForEls(recordEl.querySelectorAll('.rmsg-content'));
    }
}

function toggleMessageCollapse(recIdx, msgIdx, msgItem) {
    // Đóng/mở tin nhắn là chuyện nhà kín cửa cao của cái log đó, cấm dẹp đồ nghề dò mìn 🛑
    // (Mìn cứ gài sẵn trong DOM, gập lại chỉ giấu đi thôi, lát banh ra thì mìn vẫn vàng khè ở đó)
    records[recIdx].messages[msgIdx].collapsed = !records[recIdx].messages[msgIdx].collapsed;
    if (records[recIdx].messages[msgIdx].collapsed) {
        msgItem.classList.add('collapsed');
        msgItem.classList.remove('expanded');
    } else {
        msgItem.classList.add('expanded');
        msgItem.classList.remove('collapsed');
        // Banh tin nhắn ra là ép cuộn lên đỉnh đầu
        const contentEl = msgItem.querySelector('.rmsg-content');
        if (contentEl) {
            contentEl.scrollTop = 0; // Gập lại rồi banh ra thì phải ngắm từ đỉnh xuống đáy mới đã con mắt ⛰️
            createScrollbarForContent(contentEl);
        }
    }
}

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
        // Lúc hồi sinh thì xài chiều cao auto, cho ruột gan tự phình tự ép (Chịu phép của min/max-height bên CSS),
        // Hông thôi đóng đinh con số là log đẻ thêm mà cửa sổ ốm nhom hông chịu giãn ra là toang 🍔
        panelEl.style.height = 'auto';
        panelEl.style.minHeight = '';
        panelEl.style.maxHeight = '80vh';
        delete panelEl.dataset.rlogSavedWidth;
        delete panelEl.dataset.rlogSavedHeight;
        panelEl.classList.remove('rlog-window-collapsed');
        // Mở lại cửa sổ là Tawa xách thước đi đo lại cái mâm tiêu đề (Lúc trốn trong xó thì offsetHeight = 0, hông đo là lệch pha dính trần ráng chịu) 📏
        syncRecordHeaderVars(panelEl.querySelector('#rlog-list'));
        // Đang gập mà lộc mới rớt xuống, thì lúc bung ra phải sút lên đỉnh coi hàng nóng liền 🚀
        // (DOM lén lút xây lại trong bóng tối, trình duyệt lôi ra chưng diện hay bị kẹt tọa độ cũ, Tawa phải đá đích thân lên đỉnh) 🔝
        if (pendingScrollToTop) {
            pendingScrollToTop = false;
            const listEl = panelEl.querySelector('#rlog-list');
            if (listEl) listEl.scrollTop = 0;
        }
    }
}

/**
 * Nút trên trán "Ép bẹp vạn vật" — Cuộn tròn toàn bộ log lại, tiện tay nhồi nhét đống tin nhắn bên trong gập lại hết luôn 🗜️
 */
function collapseAllEntries() {
    // Bẹp hết thì dẹp cmn trò dò mìn đi 🧹
    resetSearchIfActive();
    if (records.length === 0) return;
    records.forEach((r, i) => {
        r.collapsed = true;
        // Bắt mấy đứa tin nhắn chui vô vỏ ốc hết
        r.messages.forEach(m => { m.collapsed = true; });
        const recordEl = panelEl.querySelector(`.rlog-record[data-record-index="${i}"]`);
        if (recordEl) {
            recordEl.classList.add('collapsed');
            recordEl.classList.remove('expanded');
            // Gập đống DOM tin nhắn lại nè 🐌
            recordEl.querySelectorAll('.rmsg-item').forEach(el => {
                el.classList.add('collapsed');
                el.classList.remove('expanded');
            });
        }
    });
    // Dọn bãi xong thì phắn lên đỉnh ngắm nghía hàng mới 🔝
    const listEl = panelEl ? panelEl.querySelector('#rlog-list') : null;
    if (listEl) listEl.scrollTop = 0;
}

/**
 * Nút "Tém gọn ruột gan" của 1 log — Bắt tụi tin nhắn của đủ thứ role chui vô vỏ hết 🐌
 * @param {number} index Số báo danh của log
 */
function collapseRecordMessages(index) {
    // Tém hết lại thì dẹp trò dò mìn giùm (Tin nhắn gập hết rồi vẽ mìn lên vỏ ốc coi được hông?) 🛑
    resetSearchIfActive();
    const record = records[index];
    if (!record || !record.messages) return;

    // Chọt data: Ép bẹp hết 🗜️
    record.messages.forEach(m => { m.collapsed = true; });

    // Táng vữa vô DOM 🧱
    const recordEl = panelEl.querySelector(`.rlog-record[data-record-index="${index}"]`);
    if (recordEl) {
        recordEl.querySelectorAll('.rmsg-item').forEach(el => {
            el.classList.add('collapsed');
            el.classList.remove('expanded');
        });
    }
}

/**
 * Nút "Phanh ngực tung tóe" của 1 log — Kéo bung hết đống tin nhắn của các role ra 🌸
 * @param {number} index Số báo danh của log
 */
function expandRecordMessages(index) {
    const record = records[index];
    if (!record || !record.messages) return;

    // Sửa data: Bung lụa hết 🎀
    record.messages.forEach(m => { m.collapsed = false; });

    // Đắp vô DOM 🧱
    const recordEl = panelEl.querySelector(`.rlog-record[data-record-index="${index}"]`);
    if (recordEl) {
        recordEl.querySelectorAll('.rmsg-item').forEach(el => {
            el.classList.add('expanded');
            el.classList.remove('collapsed');
        });
        // Rảnh rỗi đắp thanh cuộn ma pháp cho mấy khung chữ (Lòi mặt ra màn hình mới nặn, chưa thấy thì ngâm đó) 🪄
        queueScrollbarsForEls(recordEl.querySelectorAll('.rmsg-content'));
    }
}

/**
 * Nút "Trảm" 1 log — Đá bay cái log này khỏi cuốn sổ tử thần 🔪
 * @param {number} index Số báo danh
 */
function deleteRecord(index) {
    if (index < 0 || index >= records.length) return;
    records.splice(index, 1);
    panelContentDirty = true;
    if (panelEl && isPanelVisible) {
        renderPanelContent();
    }
}

// ── Tính năng Móc Túi (Copy) 📋 ────────────────────────────────────

async function copyFullRecord(index, btnEl) {
    const record = records[index];
    if (!record) return;
    const text = getFullPromptText(record);
    await doCopy(text, btnEl);
}

async function copySingleMessage(recIdx, msgIdx, btnEl) {
    const msg = records[recIdx] && records[recIdx].messages ? records[recIdx].messages[msgIdx] : null;
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
            // Ném cái log báo lỗi xịt copy ra cho thiên hạ ngắm
            console.error(`[${PLUGIN_KEY}] Copy hụt rồi cưng ơi:`, e);
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


// ── Tấm màn "Soi Sạch Nội Y" (Xem toàn văn) 🔞 ────────────────────────────────

/** @type {HTMLElement|null} Cục DOM của tấm màn Soi Sạch Nội Y hiện tại */
let readFullOverlayEl = null;

/** @type {number|null} Số báo danh của cái log đang bị lột sạch đồ */
let readFullRecordIndex = null;

/** @type {string} Form dáng đang khoe: 'formatted' (Makeup đàng hoàng) hay 'raw' (Lột trần JSON nguyên thủy) 👗👙 */
let readFullFormat = 'formatted';

/**
 * Móc mớ chữ trong cái màn che ra
 * @param {object} record Cái log bị nhắm tới
 * @param {string} format Form dáng: 'formatted' hay 'raw'
 * @returns {string} Đống chữ moi ra được
 */
function getReadContent(record, format) {
    if (format === 'raw') {
        if (!record.rawBody) {
            return '{"error": "Cái xác JSON gốc bị thất lạc rồi, hông có hàng thô mà coi đâu nha"}';
        }
        try {
            return JSON.stringify(record.rawBody, null, 2);
        } catch (e) {
            return '{"error": "Cái xác JSON gốc bị thất lạc rồi, hông có hàng thô mà coi đâu nha"}';
        }
    }
    return getFullPromptText(record);
}

/**
 * Đổi lốp form dáng rồi hắt nước tắm lại khu vực chữ nghĩa 🚿
 * @param {string} format 'formatted' hay 'raw'
 */
function switchReadFormat(format) {
    if (!readFullOverlayEl) return;
    readFullFormat = format;
    const record = records[readFullRecordIndex];
    if (!record) return;

    const contentEl = readFullOverlayEl.querySelector('.rlog-read-content');
    if (contentEl) {
        contentEl.textContent = getReadContent(record, format);
        // Xoay form dáng thì tự động bắn lên đỉnh ngắm nha 🚀
        contentEl.scrollTop = 0; 
    }

    // Tút lại nhan sắc cho cái công tắc gạt 💅
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

/**
 * Sập tấm màn Soi Sạch Nội Y lại rồi đá bay khỏi DOM luôn 💥
 */
function closeReadFullOverlay() {
    if (readFullOverlayEl) {
        // Vét rác cái thanh cuộn ma pháp trong màng che, lỡ nó thành cô hồn rớt lại thì khổ 🧹
        const readContentEl = readFullOverlayEl.querySelector('.rlog-read-content');
        if (readContentEl) {
            detachScrollbarForContent(readContentEl);
        }
        readFullOverlayEl.remove();
        readFullOverlayEl = null;
    }
    readFullRecordIndex = null;
    // Xé bùa nghe lén phím Escape ✂️
    document.removeEventListener('keydown', handleReadFullEscape);
}

/**
 * Lính canh phím Escape: Gõ cái là sập màn che liền 🛡️
 * @param {KeyboardEvent} e Sự kiện đập phím
 */
function handleReadFullEscape(e) {
    if (e.key === 'Escape' && readFullOverlayEl) {
        closeReadFullOverlay();
    }
}

/**
 * Rút chốt bung cái màn Soi Sạch Nội Y ra, khỏa thân toàn bộ prompt của log đó cho thiên hạ ngắm 👀
 * Màn che này kí sinh vô cái #rlog-panel, đè bẹp dí toàn bộ (Nuốt luôn thanh tiêu đề mẹ).
 * @param {number} index Số báo danh
 */
function openReadFullOverlay(index) {
    // Phắn khỏi trò dò mìn đã (Che kín mít rồi dò cục cức à, dẹp) 🛑
    resetSearchIfActive();

    const record = records[index];
    if (!record || !panelEl) return;

    // Mèo lười: Sập cái màng cũ lại trước (Nếu còn xót) 🧹
    closeReadFullOverlay();

    readFullRecordIndex = index;
    readFullFormat = 'formatted';

    // Trải màng che ra 🕸️
    const overlay = document.createElement('div');
    overlay.className = 'rlog-read-overlay';

    overlay.innerHTML = `
        <div class="rlog-read-header">
            <span class="rlog-read-title">Soi Sạch Nội Y</span>
            <div class="rlog-read-header-actions">
                <div class="rlog-read-format-toggle formatted" title="Đổi form áo">
                    <span class="rlog-read-seg-slider"></span>
                    <span class="rlog-read-seg-option rlog-read-seg-formatted">Makeup</span>
                    <span class="rlog-read-seg-option rlog-read-seg-raw">Hàng Thô</span>
                </div>
                <button class="rlog-read-copy-btn" title="Móc túi nguyên cục này">
                    <i class="fa-solid fa-copy"></i>
                </button>
                <button class="rlog-read-close-btn" title="Kéo mùng (Bấm Esc)">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </div>
        <div class="rlog-read-content"></div>
        <div class="rlog-read-footer"></div>
    `;

    // Quăng chữ vô bằng textContent thôi, xài innerHTML nó parse ì ạch lắm 🐢
    const contentEl = overlay.querySelector('.rlog-read-content');
    contentEl.textContent = getReadContent(record, 'formatted');

    // Cột thừng bùa chú vô mấy cái nút trên thanh tiêu đề 🪢
    const toggleEl = overlay.querySelector('.rlog-read-format-toggle');
    toggleEl.addEventListener('click', (e) => {
        e.stopPropagation();
        // Xoay trục format: formatted ↔ raw qua lại 🔄
        switchReadFormat(readFullFormat === 'formatted' ? 'raw' : 'formatted');
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

    // Dán vô ruột panel, ụp sọt toàn tập 📦
    panelEl.appendChild(overlay);
    readFullOverlayEl = overlay;

    // Đúc thanh cuộn ma pháp cho cái lồng chứa chữ (Xài ké công nghệ của Overlay 🪄)
    const readContentElForScroll = overlay.querySelector('.rlog-read-content');
    if (readContentElForScroll) {
        queueScrollbarsForEls([readContentElForScroll]);
    }

    // Gài bẫy phím Esc đập vỡ màn che ⌨️
    document.addEventListener('keydown', handleReadFullEscape);
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}


// ── Thanh cuộn ma pháp Overlay (Hàng Custom xịn xò) 🪄 ──────────────────

/**
 * Bao đựng rác dọn dẹp thanh cuộn cho từng cái .rmsg-content 🗑️
 * Map key: contentEl -> { scrollHandler, hitboxEl, thumbEl }
 */
const scrollbarCleanups = new Map();

/** @type {Set<HTMLElement>} Nguyên ổ mấy cái .rmsg-content đã đúc thanh cuộn rồi (Cho thằng ResizeObserver bự xài chung để ụp date nguyên lô) */
const scrollbarElements = new Set();

/** @type {Set<HTMLElement>} Đám .rmsg-content đang há mỏ chờ rớt vô màn hình để được đúc thanh cuộn 🐌 */
const pendingScrollbarContentEls = new Set();

/** @type {ResizeObserver|null} Đôi mắt thần ResizeObserver xài chung: Bao thầu hết mọi thanh cuộn, dẹp cái trò nhét mỗi cục một con mắt tốn tài nguyên! 👁️ */
let sharedResizeObserver = null;

/** @type {Set<HTMLElement>} Bọn tiêu đề log đã bị gắn máy nghe lén đo chiều cao (--rlog-rec-h giật lên giật xuống theo size) 📏 */
const observedRecordHeaders = new Set();

/** @type {IntersectionObserver|null} Con mắt dòm coi đứa nào trồi lên màn hình để nặn thanh cuộn */
let scrollbarLazyObserver = null;

/** @type {boolean} Có xếp hàng đòi update cục trượt (thumb) trong RAF chưa? 🏃‍♀️ */
let thumbUpdateQueued = false;

/** @type {boolean} Có đang hóng bão update toàn bộ thanh cuộn hông? (ResizeObserver gõ kẻng) 🌪️ */
let thumbFullUpdatePending = false;

/** @type {HTMLElement|null} Lẻ tẻ một mạng contentEl gào thét đòi update thumb (Do trò lăn cuộn gọi) 🙋‍♀️ */
let thumbPendingElement = null;

/**
 * Phép bùa chắc cốp gọi hồn con mắt ResizeObserver xài chung lên 👁️
 * Tụi thanh cuộn giao hết sinh mạng cho nó, gõ mõ phát là gom một bầy thumb ra đập đi xây lại, diệt trừ mầm mống lag lòi khi đẻ ra cả trăm con mắt lẻ tẻ! 💥
 */
function ensureSharedResizeObserver() {
    if (sharedResizeObserver) return;
    sharedResizeObserver = new ResizeObserver((entries) => {
        // Mâm tiêu đề trồi sụt chiều cao (Do rớt dòng/đổi font/bóp màn hình) → Update gấp tọa độ dính trần liền! ⚡
        for (const entry of entries) {
            const headerEl = entry.target;
            if (headerEl && headerEl.classList && headerEl.classList.contains('rlog-record-header')) {
                const recordEl = headerEl.closest('.rlog-record');
                if (recordEl) {
                    recordEl.style.setProperty('--rlog-rec-h', `${headerEl.getBoundingClientRect().height.toFixed(2)}px`);
                }
            }
        }
        // Khúc chữ nào mà bị bóp méo size: Đè hết đám thumb của vạn vật ra mông má lại 💄
        // Lệnh triệu tập này do trình duyệt tự tống ra sau khi nặn layout, Tawa ném hết vô 1 mẻ RAF xào chung luôn cho mướt! 🍳
        requestThumbUpdate();
    });
}

/**
 * Điểm danh con mắt IntersectionObserver lười biếng 👁️
 * Chỉ chịu nặn thanh cuộn khi đống chữ bắt đầu lòi ra (hay ngấp nghé) trên màn hình thôi,
 * Chứ phanh ngực 100+ tin nhắn ra mà ép nó đúc 100+ thanh cuộn cùng 1 giây là nó đứng máy ngỏm củ tỏi! 💀
 * Cho cái rootMargin 200px rào trước: Nặn trước 1 đoạn, Editor lăn tới nơi là hàng đã chưng sẵn. 🥂
 */
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

/**
 * Giựt dây đòi mông má lại cái cục trượt thumb (Gom cục ném vô RAF xử 1 lần) 🧶
 * - Hông nói gì: Đè hết nguyên dàn thanh cuộn đang sống ra tút lại (Mắt thần ResizeObserver sai khiến)
 * - Khai tên contentEl: Chỉ xách đầu đúng cái thanh của mạng đó ra xử thôi (Lăn cuộn kêu gọi)
 * Hét hò bao nhiêu lần trong 1 frame cũng gom lại dập 1 nhát thôi, né ba cái trò spam sự kiện bắt máy nặn layout liên tọi. 🛑
 * @param {HTMLElement} [contentEl] Thằng đệ cần tút lại; móm thì dẹp hết làm nguyên bầy
 */
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

/**
 * Moi tọa độ lăn cuộn của contentEl ra để dịch chuyển cục trượt thumb cho vừa vặn 📏
 * @param {HTMLElement} contentEl Khung chứa chữ
 * @param {object} cleanup Túi rác của thanh cuộn này (có hitboxEl/thumbEl trỏng)
 */
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

    // Nắm đầu điểm G hitbox ịn vô đúng chỗ contentEl (Tại vì nó đu bám trên .rmsg-item chứ hông phải chui rúc trong contentEl) 📌
    const contentTop = contentEl.offsetTop;
    hitbox.style.top = contentTop + 'px';
    hitbox.style.height = clientHeight + 'px';

    // Đất diễn của đường ray (Đã bị xén top:4px, bottom:4px bên CSS) 🛤️
    const trackHeight = clientHeight - 8;

    // Độ cao cục trượt = Phần lòi ra / Tổng chiều cao × Đất diễn, lùn nhất cấm dưới 20px 📐
    const thumbRatio = clientHeight / scrollHeight;
    const thumbHeight = Math.max(20, thumbRatio * trackHeight);
    thumb.style.height = thumbHeight + 'px';

    // Khoảng không cho cục trượt tung tăng 🕊️
    const thumbRange = trackHeight - thumbHeight;

    // Tọa độ trượt = (Khúc đã lăn / Khúc còn lại) × Khoảng không 📍
    const thumbTop = maxScroll > 0 ? (scrollTop / maxScroll) * thumbRange : 0;
    thumb.style.top = thumbTop.toFixed(1) + 'px';
}

/**
 * Vứt một bầy .rmsg-content vô chuồng cho nặn thanh cuộn kiểu lười (Bao giờ cần mới làm) 🐌
 * Hễ ngó thấy lòi mặt ra màn hình (hay mon men tới gần) là lôi ra đúc thanh cuộn liền.
 * Đứa nào đang xếp hàng hay có hàng rồi thì sút ra chỗ khác chơi. ⚽
 * @param {NodeListOf<HTMLElement>|HTMLElement[]|Array} contentEls Nguyên bầy chứa chữ
 */
function queueScrollbarsForEls(contentEls) {
    ensureScrollbarLazyObserver();
    // Bao thầu luôn đám .rmsg-content (Ruột tin nhắn) với .rlog-read-content (Cái màn mờ Soi Sạch Nội Y) nha 📦
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

/**
 * Nặn ra thanh cuộn ma pháp cho 1 mạng .rmsg-content bơ vơ 🪄
 * @param {HTMLElement} contentEl Cục DOM chứa chữ
 */
function createScrollbarForContent(contentEl) {
    // Vét máng cạo sạch mớ thanh cuộn cũ cặn bã đi (Cấm đẻ sinh đôi nha) 🧹
    detachScrollbarForContent(contentEl);

    // Chữ ít tí tẹo hông bõ lăn cuộn thì dẹp thanh cuộn đi
    // Chú ý: Phải đi mò mẫm cái scrollHeight thì máy nó nặn layout xíu, nhưng vì Tawa chơi hệ lười (lòi ra mới nặn 1 cái) nên đíu sợ lag đâu! 😎
    if (contentEl.scrollHeight <= contentEl.clientHeight) return;

    // Tới khúc tìm bãi đáp cắm dùi (Đu bám vô ông can cha của contentEl, chứ hông chui vô ruột nó):
    // - Của .rmsg-content → Bám vô .rmsg-item (Đường xưa lối cũ, hông đụng chạm gì)
    // - Của .rlog-read-content → Bám thẳng vô .rlog-read-overlay (Đất mới mở)
    // Làm trò này để cái điểm G hitbox có giăng absolute cũng hông bị cuộn tuột mất xác theo mớ chữ ⚓
    const container = contentEl.parentElement;
    if (!container) return;

    const isRmsgItem = container.classList.contains('rmsg-item');
    const isReadOverlay = container.classList.contains('rlog-read-overlay');
    if (!isRmsgItem && !isReadOverlay) return;

    // Bắt cái hộp cha phải đính thêm position: relative làm la bàn dẫn đường 🧭
    // Bên .rmsg-item thì xào lại kiểu cũ; bên .rlog-read-overlay thì đắp thêm áo giáp (Tuy bản thân nó đã là absolute rồi)
    const currentPosition = getComputedStyle(container).position;
    if (currentPosition === 'static') {
        container.style.position = 'relative';
    }

    // --- Nặn cốt tạo hình DOM ---
    const hitbox = document.createElement('div');
    hitbox.className = 'rlog-scroll-hitbox';

    const track = document.createElement('div');
    track.className = 'rlog-scroll-track';

    const thumb = document.createElement('div');
    thumb.className = 'rlog-scroll-thumb';

    const dot = document.createElement('div');
    dot.className = 'rlog-scroll-dot';

    // Bé chấm dot phải chui thẳng vô làm con ruột của hitbox (Ngồi chung mâm với track), hông là bị thằng track nhẫn tâm lấy overflow:hidden xẻo đầu! 😱
    track.appendChild(thumb);
    hitbox.appendChild(track);
    hitbox.appendChild(dot);
    container.appendChild(hitbox);

    // Khắc tên vô danh sách thẻ sống (Giao cho Đại lão ResizeObserver gom đi độ body 1 mẻ) 📋
    scrollbarElements.add(contentEl);

    // Đúc cái bao rác (Phải dán tên vô sổ scrollbarCleanups thì thằng requestThumbUpdate mới mò ra móc rác được) 🗑️
    const cleanup = {
        scrollHandler: null,
        hitboxEl: hitbox,
        thumbEl: thumb,
    };

    // Mông má lần đầu: Tống hết vô lò mổ RAF (Bao nhiêu đồ lặt vặt của frame này quăng qua frame sau nặn 1 nhát)
    // Lời nguyền: Phải đóng dấu bao rác cleanup trước thì updateScrollbarThumb mới có cửa kiếm ra nha 🧠
    scrollbarCleanups.set(contentEl, cleanup);
    requestThumbUpdate(contentEl);

    // Áp bùa nghe lén lúc lăn chuột (Vẫn nhét vô lò mổ RAF, cấm tụi event spam lệnh nặn layout mệt nghỉ) 👂
    const onScroll = () => requestThumbUpdate(contentEl);
    cleanup.scrollHandler = onScroll;
    contentEl.addEventListener('scroll', onScroll, { passive: true });

    // Chắc cú là Đại lão ResizeObserver đã giăng mắt che chở mạng này 👁️
    ensureSharedResizeObserver();
    if (sharedResizeObserver) {
        try {
            sharedResizeObserver.observe(contentEl);
        } catch (e) { /* ignore */ }
    }

    // --- Múa múa: Pointer lướt ---
    // Chấm tròn múa lượn theo ngón tay (Bơ luôn cục trượt thumb đi), múa tuốt ra 2 đầu đường ray cũng được 💅
    /** @type {boolean} Có đang lôi đầu kéo lê hông */
    let dragging = false;
    /** @type {number|null} Số còng số 8 của ngón tay (Để xài trò pointer capture khóa dính ngón tay vô) 🔗 */
    let capturedPointerId = null;

    /**
     * Đem tọa độ Y của ngón tay bói ra tọa độ top của bé chấm dot nằm lọt thỏm trong điểm G (Cấm bay ra khỏi đường ray nha) 📏
     * @param {number} clientY Tọa độ ngón tay đâm xuống màn hình
     * @returns {number} style.top của bé chấm (Bám theo mốc điểm G hitbox)
     */
    function clientYToDotTop(clientY) {
        const hitboxRect = hitbox.getBoundingClientRect();
        // Khoảng cách từ ngón tay tới nóc điểm G (Chấm dot là con của hitbox, nên tọa độ mốc phải canh theo hitbox nha) 👆
        let relativeY = clientY - hitboxRect.top;

        // [Luật chơi] TRACK_PADDING — Bề dày lớp đệm từ đường ray ra mép điểm G
        // Đứa nào chọt CSS đổi top/bottom của .rlog-scroll-track thì thò tay vô đây sửa số theo cho đồng bộ, cấm cãi! 🛑
        const TRACK_PADDING = 4;          // CSS: .rlog-scroll-track { top: 4px; bottom: 4px; }
        const trackTop = TRACK_PADDING;
        const trackBottom = hitboxRect.height - TRACK_PADDING;
        relativeY = Math.max(trackTop, Math.min(trackBottom, relativeY));

        // [Luật chơi] DOT_HALF — Bán kính bé chấm
        // Y xì trên, CSS .rlog-scroll-dot mà mập ốm thì chia 2 ra phang vô đây 🔴
        const DOT_HALF = 2.5;               // CSS: .rlog-scroll-dot { height: 6px; } → 6/2=3
        return (relativeY - DOT_HALF) + 'px';
    }

    /**
     * Nhìn tọa độ bé chấm bói ngược ra cục chữ bên trong lăn tới khúc nào rồi 🔮
     * @param {number} clientY Tọa độ ngón tay đâm xuống
     * @returns {number} Tọa độ scrollTop chuẩn đét của chữ
     */
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

        // Tỷ lệ chiếm đóng của chấm trên đường ray (Từ 0 tới 1)
        const ratio = (relativeY - trackTop) / trackHeight;
        return Math.round(ratio * maxScroll);
    }

    function onPointerDown(e) {
        // Chỉ tiếp mấy ngón chánh thất (Chuột trái hoặc quẹt màn hình) thôi, ngón phụ dẹp ☝️
        if (e.button !== undefined && e.button !== 0) return;

        dragging = true;
        capturedPointerId = e.pointerId;
        hitbox.setPointerCapture(e.pointerId);
        hitbox.classList.add('active');

        // Ép chấm nhảy cóc tới ngay chỗ chọt tay, và sút chữ cuộn theo ngay lập tức 💥
        dot.style.top = clientYToDotTop(e.clientY);
        contentEl.scrollTop = dotPositionToScroll(e.clientY);
        e.preventDefault();
    }

    function onPointerMove(e) {
        if (!dragging) return;

        const maxScroll = contentEl.scrollHeight - contentEl.clientHeight;
        if (maxScroll <= 0) return;

        // Bé chấm lẽo đẽo theo ngón tay
        dot.style.top = clientYToDotTop(e.clientY);
        // Chữ nghĩa lết theo bé chấm
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
    // Phao cứu sinh rớt còng số 8 lỡ tụi pointer up tạch
    hitbox.addEventListener('lostpointercapture', onPointerUp);

}

/**
 * Bứng cái thanh cuộn overlay của 1 mạng .rmsg-content quăng sọt rác, tẩy uế đồ đạc 🗑️
 * @param {HTMLElement} contentEl Khung chứa chữ
 */
function detachScrollbarForContent(contentEl) {
    const cleanup = scrollbarCleanups.get(contentEl);
    if (!cleanup) return;

    // Cắt cầu dao nghe lén vụ lăn cuộn 🔌
    contentEl.removeEventListener('scroll', cleanup.scrollHandler);
    // Đang bị Đại lão ResizeObserver dòm ngó thì móc mắt ổng ra khỏi thằng này 👀
    if (sharedResizeObserver) {
        try { sharedResizeObserver.unobserve(contentEl); } catch (e) { /* ignore */ }
    }
    // Đuổi cổ khỏi danh sách sống với danh sách hóng nặn thanh 📜
    scrollbarElements.delete(contentEl);
    pendingScrollbarContentEls.delete(contentEl);
    if (scrollbarLazyObserver) {
        try { scrollbarLazyObserver.unobserve(contentEl); } catch (e) { /* ignore */ }
    }
    // Cắt cổ điểm G hitbox ném khỏi DOM 🔪
    if (cleanup.hitboxEl && cleanup.hitboxEl.parentNode) {
        cleanup.hitboxEl.remove();
    }
    scrollbarCleanups.delete(contentEl);
}

/**
 * Đúc một bầy thanh cuộn overlay cho toàn bộ .rmsg-content trong list 🪄
 * Phục vụ lúc render xong thì gắn vô, hoặc xài tút lại lúc bung/gập.
 * Tawa chuyển qua xài trò lười nhác: Lòi mặt vô màn hình (hoặc gần mấp mé) mới thèm đúc thanh cuộn,
 * Ép nặn 1 phát cả trăm thanh lúc bung mở chục tin nhắn là nó giật banh xác đó nha! 🐢
 * @param {HTMLElement} listEl Cái rọ bự chứa list
 */
function attachScrollIndicators(listEl) {
    // Vét rác dọn sạch thanh cuộn cũ (Tại thằng renderPanelContent nó ụp mắm innerHTML phá nát DOM rồi) 🧹
    scrollbarCleanups.forEach((_, contentEl) => {
        detachScrollbarForContent(contentEl);
    });

    // Lùa hết đám .rmsg-content vô chuồng chờ nặn lười (Cho con mắt IntersectionObserver ngó mặt đứa nào thì đúc đứa đó) 👀
    queueScrollbarsForEls(listEl.querySelectorAll('.rmsg-content'));
}


// ── Nắm thóp Bảng Điều Khiển ────────────────────────────────────

function addMenuEntry() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) {
        setTimeout(addMenuEntry, 300);
        return;
    }

    toggleBtn = document.createElement('div');
    toggleBtn.id = 'prompt-capture-toggle';
    toggleBtn.className = 'list-group-item';
    toggleBtn.innerHTML = '<i class="fa-solid fa-book"></i> Nhật ký yêu cầu gần đây';
    toggleBtn.addEventListener('click', togglePanel);
    menu.appendChild(toggleBtn);

    // Gồng thêm xíu đắp vô lần nữa, chắc cú chui xuống bét hàng (Đợi tụi plugin loi nhoi khởi động xong hết đã)
    // Quăng appendChild vô đứa đang có mặt là bế cổ nó quăng tuốt luốt xuống đít mâm liền 👢
    setTimeout(() => {
        if (toggleBtn && toggleBtn.parentNode) {
            toggleBtn.parentNode.appendChild(toggleBtn);
        }
    }, 100);
}

function buildUI() {
    if (uiBuilt) return;
    uiBuilt = true;

    addMenuEntry();

    // Móc đống đồ lề khắc vô não từ kiếp trước ra xài 🧠
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
                <span class="rlog-title-text" title="Chọt nhẹ bung/gập">Nhật ký yêu cầu gần đây</span>
                <span class="rlog-title-count" title="Double click đập đi xây lại trần log">${records.length} / ${MAX_RECORDS}</span>
            </h4>
            <div class="rlog-header-drag-space" style="flex: 1; height: 28px; cursor: move; margin: 0 10px;"></div>
            <div class="rlog-header-actions">
                <div class="rlog-more-drawer" id="rlog-more-drawer">
                    <div class="rlog-preview-segmented" id="rlog-preview-toggle" title="Công tắc soi trước nội y">
                        <span class="rlog-seg-slider"></span>
                        <span class="rlog-seg-option rlog-seg-off">Gài mút</span>
                        <span class="rlog-seg-option rlog-seg-on">Banh lụa</span>
                    </div>
                    <button id="rlog-master-toggle" class="rlog-header-btn rlog-master-on" title="Cầu dao tổng: Đang xõa — Chọt vô cúp điện">
                        <i class="fa-solid fa-power-off"></i>
                    </button>
                    <button id="rlog-help-btn" class="rlog-header-btn" title="Dòm Cẩm nang Tân thủ">
                        <i class="fa-solid fa-question"></i>
                    </button>
                    <button id="rlog-test-btn" class="rlog-header-btn" title="Bơm thuốc lắc test dạo (Coi màu token nó rực cỡ nào)">
                        <i class="fa-solid fa-vial"></i>
                    </button>
                    <button id="rlog-clear-btn" class="rlog-header-btn" title="Tẩy não mọi thứ">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                    <button id="rlog-theme-btn" class="rlog-header-btn" title="Biến hình Ngày/Đêm">
                        <i class="fa-solid fa-sun"></i>
                    </button>
                </div>
                <button id="rlog-more-btn" class="rlog-header-btn" title="1001 phép màu khác">
                    <i class="fa-solid fa-ellipsis"></i>
                </button>
                <button id="rlog-collapse-all-btn" class="rlog-header-btn" title="Ép bẹp vạn vật">
                    <i class="fa-solid fa-compress-alt"></i>
                </button>
                <button id="rlog-close-btn" class="rlog-close-btn" title="Dẹp cái bảng vô"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div class="rlog-panel-body">
            <div id="rlog-list" class="rlog-list">
                <div class="rlog-empty">${escapeHtml(masterEnabled ? 'Kho vắng hoe à, gửi thử vài dòng rồi vô đây dòm nha. 💨' : 'Đã rút phích cắm cào log rồi, chọt lại cái nút Nguồn giùm đi! 🔌')}</div>
            </div>
            <div class="rlog-resize-grip" title="Nắm đầu xé rách khung hình"></div>
        </div>
    `;

    panelEl.classList.remove('rlog-window-collapsed');

    document.body.appendChild(panelEl);

    // Mổ xẻ cái chữ trên trán H4: Chữ thì chọt 1 cái bung/gập, Cục số thì nhồi 2 cái đẻ ra mâm cài đặt 🔪
    {
        const textEl = panelEl.querySelector('.rlog-title-text');
        const countEl = panelEl.querySelector('.rlog-title-count');
        /** @type {number|null} Cái đồng hồ cát câu giờ đếm xem có nhồi cú đúp hông (Chỉ xài cho cục số nha) ⌛ */
        let countClickTimer = null;

        // Khúc chữ: Chọt phát bung bét nát luôn (Hông thèm đợi chớp mắt) 💥
        textEl.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePanelWindow();
        });

        // Khúc số: Đập đúp 2 nhát nôn ra bảng chưởng (Chọt 1 cái thì nằm im phăng phắc) 👊👊
        countEl.addEventListener('click', (e) => {
            e.stopPropagation();

            if (countClickTimer) {
                // Đập nhát 2 —— Tuyên án Double Click dính chưởng! 🎯
                clearTimeout(countClickTimer);
                countClickTimer = null;
                showMaxRecordsDialog();
                return;
            }

            // Đập nhát 1 —— Lật đồng hồ cát, hóng mỏ chờ nhát 2 rớt xuống ⌛
            countClickTimer = setTimeout(() => {
                countClickTimer = null;
                // Chọt 1 cái như gãi ngứa, Tawa bơ luôn 💅
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

    // Rải rập trên thiên la địa võng, hễ có đứa chọt chọt ở ngoài là đạp cửa thu cái ngăn kéo "Hơn thế nữa" về 🕸️
    if (!document.rlogMoreDrawerListenerInstalled) {
        document.rlogMoreDrawerListenerInstalled = true;
        document.addEventListener('click', (e) => {
            if (panelEl && isPanelVisible) {
                const drawer = panelEl.querySelector('#rlog-more-drawer');
                const btn = panelEl.querySelector('#rlog-more-btn');
                if (drawer && drawer.classList.contains('expanded')) {
                    // Nếu mà chọt vô khoảng không (hông trúng ngăn kéo cũng hông trúng cái nút Hơn Thế Nữa), thì bóp cổ lôi cái ngăn vô lẹ! 🤛
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
            // Khố rách áo ôm (0 log) thì miễn ký giấy sinh tử, bơ luôn đi nha 🤷‍♀️
            return;
        }
        showConfirmDialog({
            title: 'Tẩy não sạch bách',
            message: `Chắc kèo muốn đốt sạch sành sanh <strong>${records.length}</strong> cái log dơ dáy này hông? <br>Tội nghiệt này hông có thuốc hối hận đâu nha! 🔥`,
            confirmText: 'Đốt',
            cancelText: 'Quay xe',
            onConfirm: () => {
                clearAllRecords();
            },
        });
    });

    panelEl.querySelector('#rlog-help-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.__RLogTour && typeof window.__RLogTour.start === 'function') {
            // Bắt cái mâm phải banh chành ra, và sập mỏ cái ngăn kéo chứa mớ nút lại 🚪
            const moreDrawer = panelEl.querySelector('#rlog-more-drawer');
            const moreBtn = panelEl.querySelector('#rlog-more-btn');
            moreDrawer.classList.remove('expanded');
            moreBtn.classList.remove('active-drawer-btn');
            
            if (isPanelCollapsed) togglePanelWindow();
            
            window.__RLogTour.start();
        }
    });

    panelEl.querySelector('#rlog-test-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.__RLogApi && typeof window.__RLogApi.injectTokenTierTest === 'function') {
            window.__RLogApi.injectTokenTierTest();
            // Tiêm mồi xong đá văng cái ngăn kéo đi, nhường chỗ cho hàng test bung lụa 💉
            const moreDrawer = panelEl.querySelector('#rlog-more-drawer');
            const moreBtn = panelEl.querySelector('#rlog-more-btn');
            moreDrawer.classList.remove('expanded');
            moreBtn.classList.remove('active-drawer-btn');
        }
    });

    panelEl.querySelector('#rlog-theme-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        isLightTheme = !isLightTheme;
        saveTheme(isLightTheme);
        applyTheme();
        updateThemeButtonIcon();
        
        // Kích nổ ảo ảnh thu phóng hàng limited khi thay áo (Cấm tiệt hông cho văng ra lúc mới bung cửa sổ) 💥
        panelEl.classList.remove('rlog-anim-light', 'rlog-anim-dark');

        // Dế yêu màn hình hẹp thì dẹp mẹ cái trò múa màu từ từ đi: Cả đống chữ ùa ra mà bắt tụi nó pha màu 0.35s là máy cà giựt rớt hàm! 🐢
        // Áo mới đắp vô tắp lự sau 2 nhịp RAF, rồi mới quăng bùa thu phóng vô diễn ảo thuật; 🪄
        // Đám PC tay to thì Tawa vẫn thả cho tụi nó ngâm màu sướng mắt (Thẩy bùa void offsetWidth vắt kiệt để reset đồng hồ múa). 🖥️
        // Chú ý nhỏ: Cắt cái trò ngâm màu hông làm hư cái áo đâu nha, chỉ là hông cho thiên hạ coi quá trình thay đồ thôi 👗
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
            // PC mạnh bạo: Vẫn ôm ấp múa màu + Cưỡng ép tụi CSS ói layout ra để giật ngược đồng hồ 🔄
            void panelEl.offsetWidth;
            if (isLightTheme) {
                panelEl.classList.add('rlog-anim-light');
            } else {
                panelEl.classList.add('rlog-anim-dark');
            }
        }

        // Múa lượn xong xuôi thì xé cái mác múa đi, cấm để tụi nó ám vô cửa sổ lỡ lần sau khui ra lại diễn lại trò lố 👻
        const onAnimEnd = () => {
            panelEl.classList.remove('rlog-anim-light', 'rlog-anim-dark');
            panelEl.removeEventListener('animationend', onAnimEnd);
        };
        panelEl.addEventListener('animationend', onAnimEnd);
    });
    updateThemeButtonIcon();

    // Cột dây dắt cổ Cầu Dao Tổng 🔌
    const masterToggleBtn = panelEl.querySelector('#rlog-master-toggle');
    if (masterToggleBtn) {
        masterToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setMasterEnabled(!masterEnabled);
            e.target.blur();
        });
    }
    updateMasterToggleUI();

    // Lôi từ tiền kiếp ra xài cái công tắc Soi Trứơc 🧠
    contentPreviewEnabled = loadContentPreview();
    updatePreviewToggleUI();

    // Trói bùa vô công tắc Soi Trước 🪢
    const previewToggleEl = panelEl.querySelector('#rlog-preview-toggle');
    if (previewToggleEl) {
        previewToggleEl.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleContentPreview();
        });
    }

    makeDraggable(panelEl);
    makeResizable(panelEl);

    // Khung cửa sổ mà nới ra kẹp vô (Kiểu nhảy từ ĐT qua PC, hay đưa tay bóp hông cửa sổ) thì đám chữ tiêu đề log nó nhào lộn đẻ thêm bề dày,
    // Phải lôi thước đo lại khoảng đu trần (--rlog-rec-h) nghe chưa! 📏
    if (!window.rlogHeaderVarResizeInstalled) {
        window.rlogHeaderVarResizeInstalled = true;
        window.addEventListener('resize', () => {
            syncRecordHeaderVars(panelEl && panelEl.querySelector('#rlog-list'));
        });
    }

    // Lắp tai nghe lén dò nguồn request (Bám chặt gót tụi Native, cấm có bú liếm gì cái Cầu Dao Tổng) 🎧
    installSourceTracking();

    // Chôn mìn chặn họng fetch (Mìn cứ chôn cứng ở đó, vô trong mới đem Cầu Dao Tổng ra coi có giật sập hông) 💣
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
    // Đồ đạc/Màu mè có xê dịch thì mới đập ra xây lại DOM; Còn hông cứ ốp y xì đúc đồ cũ, dẹp cái bệnh đơ máy khi banh cả ngàn tin nhắn! 🧠
    if (panelContentDirty) {
        renderPanelContent();
    }
    // Trưng mặt ra rồi mới đi đo chiều cao tiêu đề nha: Hồi tàng hình mà bắt render thì offsetHeight = 0 tròn trĩnh,
    // Khoảng đu trần (--rlog-rec-h) của tiêu đề tin nhắn bắt buộc phải đo bằng thân hình thật lúc lòi mặt ra màn hình mới chuẩn! 📏
    syncRecordHeaderVars(panelEl.querySelector('#rlog-list'));
    // Đang đi vắng mà có lộc rớt xuống, khui cửa sổ ra là sút lên đỉnh coi hàng liền 🚀
    if (pendingScrollToTop && !isPanelCollapsed) {
        pendingScrollToTop = false;
        const listEl = panelEl.querySelector('#rlog-list');
        if (listEl) listEl.scrollTop = 0;
    }

    // Hú hồn lên sóng xong là check xem lính mới có cần dắt đi tour hông 🐾
    if (window.__RLogTour && typeof window.__RLogTour.check === 'function') {
        setTimeout(() => window.__RLogTour.check(), 300);
    }
}

function hidePanel() {
    // Sập cửa là dẹp loạn trò dò mìn ngay 🛑
    resetSearchIfActive();
    // Dập cửa là ám sát luôn cái màng che Soi Sạch Nội Y (Nếu còn lảng vảng) 🗡️
    closeReadFullOverlay();
    if (panelEl) {
        panelEl.style.display = 'none';
        // Sập cửa phát là xé sạch mấy cái mác múa theme còn dính lại, dẹp chuyện ma nhập tự múa lúc mở cửa lần sau 👻
        panelEl.classList.remove('rlog-anim-light', 'rlog-anim-dark');
    }
    isPanelVisible = false;
    if (toggleBtn) toggleBtn.classList.remove('active');
}


// ── Trò lôi kéo/Bóp méo body 🐾 ──────────────────────────────────

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
        // Đóng cọc mép trái/trên: Bình thường cái panel này ỷ mình ở giữa (left:50% + translateX(-50%)),
        // Chọt vô bóp width 1 phát là 2 bên thóp lại 1 lượt đều rang; Tawa chỉnh lại ép chết left/top y xì trò lôi đầu tiêu đề,
        // Rứa là bóp méo gì thì chỉ có mép phải/dưới rên la thôi (Cái tam giác chóp dưới chọt vô y xì). 📍
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
        // Copy y chang trò mousedown: Đóng cọc mép trái/trên, bóp méo văng mép phải/dưới 📌
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
            // Bụng panel bự ra nhỏ lại làm chữ tiêu đề log nhảy nhót lộn xộn, xách thước đo lại khoảng đu trần lẹ 📏
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
        // Né mặt đám nút bấm, trán H4 với ổ con cháu nhà nó, chừa luôn cái công tắc soi trước ra (Tụi này có nghiệp vụ riêng, cấm kéo lê tụi nó) 🛑
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
            // Kéo đi dạo hông làm mập ốm gì đâu, nhưng cứ ếm bùa đo lại phòng hờ rớt dòng quái thai 🛡️
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


// ── Gọi hồn (Khởi động) ──────────────────────────────────────

function init() {
    if (!window.SillyTavern || typeof window.SillyTavern.getContext !== 'function') {
        console.debug(`[${PLUGIN_KEY}] Ngáp chờ SillyTavern trang điểm xong...`);
        setTimeout(init, 200);
        return;
    }

    const ctx = window.SillyTavern.getContext();
    if (!ctx || !ctx.eventSource || !ctx.event_types) {
        console.debug(`[${PLUGIN_KEY}] ST context đang đắp mền, xíu quay lại chọt tiếp...`);
        setTimeout(init, 300);
        return;
    }

    eventSource = ctx.eventSource;
    event_types = ctx.event_types;

    // Ăn ké tiếng hét APP_READY hoặc quăng bùa setTimeout để nặn UI, mà cấm nặn đúp đẻ sinh đôi nha! 🚧
    const tryBuildUI = () => {
        if (!uiBuilt) buildUI();
    };

    eventSource.once(event_types.APP_READY, () => {
        tryBuildUI();
    });

    // Phao cứu sinh: Lỡ tiếng hét APP_READY bay màu lâu rồi (Plugin tới trễ), thì nhào vô nặn UI đại luôn 🛟
    setTimeout(() => {
        tryBuildUI();
    }, 500);

    console.debug(`[${PLUGIN_KEY}] Lên đồ xong xuôi - Ôm cây đợi thỏ rình mồi prompt nha 😎`);
}

init();
