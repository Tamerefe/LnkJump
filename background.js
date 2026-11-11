// --- Config ---
console.log('LnkJump Background: Service worker started');

// Not: linkedin.com / x.com kısa link servisi değil; normal sayfalarda gereksiz
// yönlendirmeye yol açıyordu. LinkedIn "safety/go" linkleri unwrapRedirectParam ile çözülür.
const SHORT_HOSTS = [
    "tr.ee", "linktr.ee",
    "bit.ly", "t.co", "tinyurl.com", "goo.gl", "ow.ly", "buff.ly", "shorturl.at",
    "lnkd.in", "is.gd", "t.ly", "cutt.ly", "rebrand.ly", "shrtco.de", "rb.gy",
    "s.id", "v.gd", "u.to", "soo.gd", "adf.ly", "bc.vc", "t2mio.com", "bl.ink",
    "youtu.be", "ouo.io", "dlvr.it", "amzn.to", "fb.me", "trib.al", "short.gy",
    "tiny.cc", "shorturl.gg", "lnk.to", "spoti.fi", "apple.co", "g.co", "forms.gle",
    "maps.app.goo.gl", "goo.su", "clck.ru", "qr.ae", "wp.me", "ift.tt"
];

const DEFAULT_SETTINGS = {
    hoverPopup: true,           // Hover popup açık
    autoResolve: true,          // Auto navigate açık
    maxHops: 10
};

const state = {
    settings: { ...DEFAULT_SETTINGS },
    // Aynı sekmede döngü/çakışmaları önlemek için:
    resolvingTabs: new Set()
};

// --- Storage helpers ---
// shortHosts artık kaydedilmiyor: eski kayıtlı listeler (linkedin.com, x.com) yeni listeyi ezmesin
async function loadSettings() {
    const res = await chrome.storage.sync.get("settings");
    const { shortHosts, ...saved } = res.settings || {};
    state.settings = { ...DEFAULT_SETTINGS, ...saved };
}
async function saveSettings(next) {
    const { shortHosts, ...rest } = next || {};
    state.settings = { ...state.settings, ...rest };
    await chrome.storage.sync.set({ settings: state.settings });
}
const settingsReady = loadSettings().catch(() => { });

// --- URL helpers ---
function getHost(u) {
    try {
        // Protokol yoksa https ekle
        let normalizedUrl = u;
        if (!u.match(/^https?:\/\//)) {
            normalizedUrl = 'https://' + u.replace(/^\/\//, '');
        }
        return new URL(normalizedUrl).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
        return "";
    }
}
function isShortHost(urlStr) {
    if (!urlStr) return false;

    // file:// test sayfaları: .../bit.ly/abc gibi yol parçası
    if (urlStr.startsWith('file://')) {
        const lowerUrl = urlStr.toLowerCase();
        return SHORT_HOSTS.some(sh => lowerUrl.includes('/' + sh + '/') || lowerUrl.includes('\\' + sh + '\\'));
    }

    if (!/^https?:\/\//i.test(urlStr) && !/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(urlStr)) return false;

    // Tam hostname eşleşmesi (alt alan adları dahil); substring eşleşmesi "netflix.com" -> "x.com" gibi hatalara yol açıyordu
    const h = getHost(urlStr);
    return SHORT_HOSTS.some(sh => h === sh || h.endsWith("." + sh)) || !!unwrapRedirectParam(urlStr);
}

function decodeHtml(s) {
    return s
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&#x27;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#x2F;|&#47;/gi, "/");
}

function toAbsolute(target, baseUrl) {
    try {
        const u = new URL(target.trim(), baseUrl);
        return /^https?:$/.test(u.protocol) ? u.toString() : null;
    } catch { return null; }
}

// HTML sayfa içindeki yönlendirme hedefini bul (meta refresh, JS redirect, ara sayfalar)
function extractHtmlRedirectTarget(html, baseUrl) {
    // <meta http-equiv="refresh" content="0; url=https://example.com"> (attribute sırası farketmez)
    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
        if (!/http-equiv\s*=\s*["']?refresh/i.test(tag)) continue;
        const content = tag.match(/content\s*=\s*("([^"]*)"|'([^']*)')/i);
        const value = content ? decodeHtml(content[2] ?? content[3]) : "";
        const m = value.match(/url\s*=\s*['"]?([^'"]+)/i);
        if (m) {
            const abs = toAbsolute(m[1], baseUrl);
            if (abs) return abs;
        }
    }

    // location.replace("..."), location.href = "...", window.location = "..."
    const js = html.match(/location(?:\.href)?\s*(?:=|\.replace\(|\.assign\()\s*["']([^"']+)["']/i);
    if (js) {
        const abs = toAbsolute(js[1].replace(/\\\//g, "/"), baseUrl);
        if (abs) return abs;
    }

    // LinkedIn (lnkd.in) "bu link LinkedIn dışına gidiyor" ara sayfası
    const li = html.match(/<a\b[^>]*data-tracking-control-name=["']external_url_click["'][^>]*>/i);
    if (li) {
        const href = li[0].match(/href\s*=\s*["']([^"']+)["']/i);
        if (href) {
            const abs = toAbsolute(decodeHtml(href[1]), baseUrl);
            if (abs) return abs;
        }
    }

    return null;
}

// linkedin.com/safety/go?url=..., google.com/url?q=... gibi sarmalayıcı linkler
function unwrapRedirectParam(urlStr) {
    try {
        const u = new URL(urlStr);
        const h = u.hostname.toLowerCase();
        let param = null;
        if (h.endsWith("linkedin.com") && u.pathname.startsWith("/safety/go")) param = "url";
        else if (/(^|\.)google\.[a-z.]+$/.test(h) && u.pathname === "/url") param = u.searchParams.has("q") ? "q" : "url";
        else if (/^l[m]?\.facebook\.com$/.test(h) && u.pathname === "/l.php") param = "u";
        if (!param) return null;
        const target = u.searchParams.get(param);
        return target ? toAbsolute(target, urlStr) : null;
    } catch { return null; }
}

async function fetchWithTimeout(url, ms = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fetch(url, {
            method: "GET",
            redirect: "follow",
            credentials: "omit",
            cache: "no-store",
            signal: ctrl.signal
        });
    } finally {
        clearTimeout(timer);
    }
}

// Asıl resolve
async function resolveUrl(url, maxHops = 10) {
    // file:// protokolünü normalize et
    if (url.startsWith('file://')) {
        console.log(`LnkJump: Processing file:// URL: ${url}`);
        // file:///C:/Users/polis/Desktop/Test/bit.ly/4mbM8Qr -> https://bit.ly/4mbM8Qr
        // Daha esnek regex pattern kullan
        const patterns = [
            /file:\/\/\/[A-Z]:.*?([a-z0-9.-]+\.[a-z]{2,}\/[^\/\s?#\\]+)/i,  // Windows C:/ pattern
            /file:\/\/.*?\/([a-z0-9.-]+\.[a-z]{2,}\/[^\/\s?#\\]+)/i,        // Genel pattern
            /file:\/\/.*\\([a-z0-9.-]+\.[a-z]{2,}\\[^\s?#\\]+)/i,           // Windows backslash
            /([a-z0-9.-]+\.[a-z]{2,}[\/\\][^\/\s?#\\]+)/i                   // Sadece domain kısmı
        ];

        for (let i = 0; i < patterns.length; i++) {
            const pattern = patterns[i];
            const match = url.match(pattern);
            console.log(`LnkJump: Trying pattern ${i + 1}: ${pattern} on ${url}`);
            if (match) {
                const normalized = 'https://' + match[1].replace(/\\/g, '/');  // Backslash'leri forward slash'e çevir
                console.log(`LnkJump: SUCCESS! Converted file:// URL: ${url} -> ${normalized}`);
                url = normalized;
                break;
            } else {
                console.log(`LnkJump: Pattern ${i + 1} did not match`);
            }
        }

        if (url.startsWith('file://')) {
            console.log(`LnkJump: Could not normalize file:// URL: ${url}`);
            return url; // Eğer normalize edemiyorsak, orijinal URL'i döndür
        }
    }

    // Protokol yoksa https ekle
    let current = url;
    if (!current.match(/^https?:\/\//)) {
        current = 'https://' + current.replace(/^\/\//, '');
    }

    console.log(`LnkJump: Starting resolution for: ${url} -> normalized: ${current}`);

    // YouTube kısa linklerini özel olarak çöz
    if (current.includes('youtu.be/')) {
        const videoId = current.split('youtu.be/')[1]?.split('?')[0]?.split('&')[0];
        if (videoId) {
            const resolved = `https://www.youtube.com/watch?v=${videoId}`;
            console.log(`LnkJump: YouTube resolved: ${resolved}`);
            return resolved;
        }
    }

    // HEAD yerine GET + redirect:"follow" kullan:
    // - birçok servis HEAD'e 405 veya yönlendirmesiz 200 döner (tr.ee, t.co)
    // - redirect:"manual" eklentilerde opak yanıt verir (status 0, header yok), işe yaramaz
    const seen = new Set();
    for (let i = 0; i < maxHops; i++) {
        if (seen.has(current)) break;
        seen.add(current);

        const unwrapped = unwrapRedirectParam(current);
        if (unwrapped) {
            console.log(`LnkJump: Unwrapped redirect param: ${unwrapped}`);
            current = unwrapped;
            continue;
        }

        let resp;
        try {
            console.log(`LnkJump: Resolve step ${i + 1}: ${current}`);
            resp = await fetchWithTimeout(current);
        } catch (e) {
            console.warn(`LnkJump: Fetch failed at step ${i + 1}:`, e.message);
            break;
        }

        // HTTP yönlendirmeleri tarayıcı tarafından takip edildi
        if (resp.url) current = resp.url;
        console.log(`LnkJump: Status ${resp.status}, landed on: ${current}`);

        // Kısa link servisinin kendisinde kaldıysak sayfa içi yönlendirmeyi ara
        const contentType = resp.headers.get("content-type") || "";
        if (!isShortHost(current) || !contentType.includes("html")) break;

        let html = "";
        try {
            html = (await resp.text()).slice(0, 200000);
        } catch (e) {
            console.log(`LnkJump: Error reading HTML: ${e.message}`);
            break;
        }

        const next = extractHtmlRedirectTarget(html, current);
        if (!next || next === current) break;
        console.log(`LnkJump: In-page redirect found: ${next}`);
        current = next;
    }

    console.log(`LnkJump: Final resolved URL: ${current}`);
    return current;
}

// --- WebNavigation: otomatik yönlendirme ---
// Tek dinleyici yeterli (eskiden onBeforeNavigate + onCommitted + tabs.onUpdated aynı işi 3 kez yapıyordu)
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return; // sadece ana frame
    const { tabId, url } = details;

    await settingsReady;
    if (!state.settings.autoResolve) return;
    if (!isShortHost(url)) return;
    if (state.resolvingTabs.has(tabId)) return;

    console.log(`LnkJump: Auto-redirect starting for: ${url}`);
    state.resolvingTabs.add(tabId);
    try {
        const finalUrl = await resolveUrl(url, state.settings.maxHops);
        if (!finalUrl || finalUrl === url || finalUrl.startsWith('file://')) return;

        // Tarayıcı bu sırada HTTP yönlendirmesini kendisi tamamladıysa sekmeyi tekrar yükleme
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        const tabUrl = tab?.pendingUrl || tab?.url || "";
        if (tab && tabUrl !== url && !isShortHost(tabUrl)) {
            console.log(`LnkJump: Tab already left the short link (${tabUrl}), skipping`);
            return;
        }

        console.log(`LnkJump: Redirecting tab ${tabId} to: ${finalUrl}`);
        await chrome.tabs.update(tabId, { url: finalUrl });
    } catch (e) {
        console.warn("LnkJump: Auto redirect failed:", e);
    } finally {
        state.resolvingTabs.delete(tabId);
    }
});

// --- Context Menus ---
chrome.runtime.onInstalled.addListener(async () => {
    await loadSettings();
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: "resolve-open",
            title: "Resolve and open →",
            contexts: ["link"]
        });
        chrome.contextMenus.create({
            id: "resolve-copy",
            title: "Resolve and copy",
            contexts: ["link"]
        });
    });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!info.linkUrl) return;
    await settingsReady;
    const final = await resolveUrl(info.linkUrl, state.settings.maxHops);
    if (info.menuItemId === "resolve-open") {
        chrome.tabs.create({ url: final });
    } else if (info.menuItemId === "resolve-copy") {
        // Service worker'da navigator.clipboard yok; kopyalamayı sayfadaki content script yapar
        let copied = false;
        try {
            const res = await chrome.tabs.sendMessage(tab.id, { type: "COPY_TEXT", text: final }, { frameId: info.frameId ?? 0 });
            copied = !!res?.ok;
        } catch (e) {
            console.warn("LnkJump: Copy failed:", e);
        }
        chrome.notifications?.create({
            type: "basic",
            iconUrl: "icons/128.png",
            title: copied ? "Copied" : "Could not copy",
            message: final
        });
    }
});

// Popup'tan gelen mesajlar
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "SET_SETTINGS") {
        (async () => {
            try {
                await saveSettings(msg.payload || {});
                sendResponse({ ok: true, settings: state.settings });
            } catch (e) {
                sendResponse({ ok: false, error: e.message });
            }
        })();
        return true; // async response
    } else if (msg?.type === "GET_SETTINGS") {
        (async () => {
            try {
                await loadSettings();
                sendResponse({ ok: true, settings: { ...state.settings, shortHosts: SHORT_HOSTS } });
            } catch (e) {
                sendResponse({ ok: false, error: e.message });
            }
        })();
        return true; // async response
    } else if (msg?.type === "RESOLVE_URL") {
        console.log(`LnkJump Background: Received RESOLVE_URL request for: ${msg.url}`);
        (async () => {
            try {
                await settingsReady;
                const resolvedUrl = await resolveUrl(msg.url, state.settings.maxHops);
                console.log(`LnkJump Background: Resolved ${msg.url} -> ${resolvedUrl}`);
                sendResponse({ ok: true, resolvedUrl: resolvedUrl });
            } catch (e) {
                console.error('LnkJump Background: resolve error:', e);
                sendResponse({ ok: false, resolvedUrl: msg.url, error: e.message });
            }
        })();
        return true; // async response
    }
});
