// --- Config ---
console.log('LnkJump Background: Service worker started');

const DEFAULT_SETTINGS = {
    hoverPopup: true,           // Hover popup açık
    autoResolve: true,          // Auto navigate her zaman açık
    shortHosts: [
        "tr.ee", "linktr.ee",
        "bit.ly", "t.co", "tinyurl.com", "goo.gl", "ow.ly", "buff.ly", "shorturl.at",
        "lnkd.in", "is.gd", "t.ly", "cutt.ly", "rebrand.ly", "shrtco.de", "rb.gy",
        "s.id", "v.gd", "u.to", "soo.gd", "adf.ly", "bc.vc", "t2mio.com", "bl.ink",
        "youtu.be", "linkedin.com", "ouo.io", "x.com"
    ],
    maxHops: 10
};

const state = {
    settings: { ...DEFAULT_SETTINGS },
    // Aynı sekmede döngü/çakışmaları önlemek için:
    resolvingTabs: new Set()
};

// Service worker başlatıldığında
console.log('LnkJump Background: Service worker started');

// --- Storage helpers ---
async function loadSettings() {
    const res = await chrome.storage.sync.get("settings");
    state.settings = { ...DEFAULT_SETTINGS, ...(res.settings || {}) };
}
async function saveSettings(next) {
    state.settings = { ...state.settings, ...next };
    await chrome.storage.sync.set({ settings: state.settings });
}

// --- URL helpers ---
function getHost(u) {
    try {
        // Protokol yoksa https ekle
        let normalizedUrl = u;
        if (!u.match(/^https?:\/\//)) {
            normalizedUrl = 'https://' + u.replace(/^\/\//, '');
        }
        return new URL(normalizedUrl).hostname.toLowerCase();
    } catch {
        return "";
    }
}
function isShortHost(urlStr) {
    console.log(`LnkJump: Checking if short host: ${urlStr}`);

    // file:// protokolü için özel kontrol
    if (urlStr.startsWith('file://')) {
        const lowerUrl = urlStr.toLowerCase();
        const isShort = state.settings.shortHosts.some(sh => {
            const matches = lowerUrl.includes('/' + sh + '/') ||
                lowerUrl.includes(sh + '/') ||
                lowerUrl.includes('\\' + sh + '\\') ||  // Windows path için
                lowerUrl.match(new RegExp('\\b' + sh.replace('.', '\\.') + '[/\\\\]'));

            if (matches) {
                console.log(`LnkJump: Found short host "${sh}" in file:// URL: ${urlStr}`);
            }
            return matches;
        });
        console.log(`LnkJump: file:// URL isShort result: ${isShort} for ${urlStr}`);
        return isShort;
    }

    const h = getHost(urlStr);
    const isShort = state.settings.shortHosts.some(sh => h === sh || h.endsWith("." + sh));

    // Fallback: basit string kontrolü
    if (!isShort && urlStr) {
        const lowerUrl = urlStr.toLowerCase();
        const fallbackResult = state.settings.shortHosts.some(sh =>
            lowerUrl.includes(sh + '/') ||
            lowerUrl.includes('www.' + sh + '/') ||
            lowerUrl.includes('//' + sh + '/') ||
            lowerUrl.endsWith(sh)
        );
        console.log(`LnkJump: Regular URL isShort result: ${fallbackResult || isShort} for ${urlStr}`);
        return fallbackResult;
    }

    console.log(`LnkJump: Regular URL isShort result: ${isShort} for ${urlStr}`);
    return isShort;
}

// Meta refresh yakalama
function extractMetaRefreshTarget(html, baseUrl) {
    // <meta http-equiv="refresh" content="0; url=https://example.com">
    const m = html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["']?[^"'>]*url\s*=\s*([^"'>\s]+)["']?[^>]*>/i);
    if (!m) return null;
    try {
        const target = m[1].trim();
        return new URL(target, baseUrl).toString();
    } catch { return null; }
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

    // Önce otomatik redirect ile dene
    try {
        console.log(`LnkJump: Trying automatic redirect for: ${current}`);
        const resp = await fetch(current, {
            method: "HEAD",
            redirect: "follow",          // Otomatik redirect takibi
            credentials: "omit",
            cache: "no-store",
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        console.log(`LnkJump: HEAD result - Status: ${resp.status}, Final URL: ${resp.url}`);

        if (resp.url && resp.url !== current) {
            console.log(`LnkJump: Resolved via HEAD redirect: ${resp.url}`);
            return resp.url;
        }
    } catch (e) {
        console.log(`LnkJump: HEAD method failed: ${e.message}`);
    }

    // HEAD başarısızsa GET ile manuel kontrol
    for (let i = 0; i < maxHops; i++) {
        try {
            console.log(`LnkJump: Manual resolve step ${i + 1}: ${current}`);

            const resp = await fetch(current, {
                method: "GET",
                redirect: "manual",
                credentials: "omit",
                cache: "no-store",
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            console.log(`LnkJump: Response status: ${resp.status}`);

            // Redirect durumları
            if (resp.status >= 300 && resp.status < 400) {
                const location = resp.headers.get('location');
                console.log(`LnkJump: Location header: ${location}`);
                if (location) {
                    try {
                        current = new URL(location, current).toString();
                        console.log(`LnkJump: Redirected to: ${current}`);
                        continue;
                    } catch (e) {
                        console.log(`LnkJump: Invalid redirect URL: ${location}`);
                        break;
                    }
                }
            }

            // 200 OK durumunda meta refresh kontrol et
            if (resp.status === 200) {
                const contentType = resp.headers.get("content-type") || "";
                if (contentType.includes("text/html")) {
                    try {
                        const text = await resp.text();
                        const viaMeta = extractMetaRefreshTarget(text, current);
                        if (viaMeta && viaMeta !== current) {
                            console.log(`LnkJump: Meta refresh found: ${viaMeta}`);
                            current = viaMeta;
                            continue;
                        }
                    } catch (e) {
                        console.log(`LnkJump: Error reading HTML: ${e.message}`);
                    }
                }

                console.log(`LnkJump: Final resolved URL: ${current}`);
                return current;
            }

            console.log(`LnkJump: Unexpected status ${resp.status}, stopping`);
            break;

        } catch (e) {
            console.warn(`LnkJump: Error at step ${i + 1}:`, e.message);
            break;
        }
    }

    console.log(`LnkJump: Returning original URL: ${current}`);
    return current;
}// --- WebNavigation: otomatik yönlendirme ---
// onBeforeNavigate - file:// URL'leri için daha erken yakalama
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return; // sadece ana frame
    const { tabId, url } = details;

    console.log(`LnkJump: onBeforeNavigate - Checking: ${url}`);

    if (!isShortHost(url)) {
        console.log(`LnkJump: onBeforeNavigate - Not a short host: ${url}`);
        return;
    }

    if (state.resolvingTabs.has(tabId)) {
        console.log(`LnkJump: onBeforeNavigate - Already resolving tab ${tabId}`);
        return;
    }

    console.log(`LnkJump: onBeforeNavigate - Starting auto-redirect for: ${url}`);
    state.resolvingTabs.add(tabId);
    try {
        const finalUrl = await resolveUrl(url, state.settings.maxHops);
        console.log(`LnkJump: onBeforeNavigate - Resolved ${url} -> ${finalUrl}`);

        if (finalUrl && finalUrl !== url && !finalUrl.startsWith('file://')) {
            console.log(`LnkJump: onBeforeNavigate - Redirecting tab ${tabId} to: ${finalUrl}`);
            await chrome.tabs.update(tabId, { url: finalUrl });
        } else {
            console.log(`LnkJump: onBeforeNavigate - No redirect needed for: ${url}`);
        }
    } catch (e) {
        console.warn("LnkJump: onBeforeNavigate - Auto redirect failed:", e);
    } finally {
        state.resolvingTabs.delete(tabId);
    }
});

chrome.webNavigation.onCommitted.addListener(async (details) => {
    // Auto navigate her zaman aktif
    if (details.frameId !== 0) return; // sadece ana frame
    const { tabId, url } = details;

    console.log(`LnkJump: onCommitted - Checking navigation to: ${url}`);

    if (!isShortHost(url)) {
        console.log(`LnkJump: onCommitted - Not a short host: ${url}`);
        return;
    }

    if (state.resolvingTabs.has(tabId)) {
        console.log(`LnkJump: onCommitted - Already resolving tab ${tabId}`);
        return;
    }

    console.log(`LnkJump: onCommitted - Starting auto-redirect for: ${url}`);
    state.resolvingTabs.add(tabId);
    try {
        const finalUrl = await resolveUrl(url, state.settings.maxHops);
        console.log(`LnkJump: onCommitted - Resolved ${url} -> ${finalUrl}`);

        if (finalUrl && finalUrl !== url && !finalUrl.startsWith('file://')) {
            console.log(`LnkJump: onCommitted - Redirecting tab ${tabId} to: ${finalUrl}`);
            await chrome.tabs.update(tabId, { url: finalUrl });
        } else {
            console.log(`LnkJump: onCommitted - No redirect needed for: ${url}`);
        }
    } catch (e) {
        console.warn("LnkJump: onCommitted - Auto redirect failed:", e);
    } finally {
        state.resolvingTabs.delete(tabId);
    }
});

// --- Tabs: file:// URL'leri için ek yakalama ---
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Sadece URL değişikliklerini dinle
    if (!changeInfo.url) return;

    const url = changeInfo.url;
    console.log(`LnkJump: onUpdated - Tab ${tabId} URL changed to: ${url}`);

    if (!isShortHost(url)) {
        console.log(`LnkJump: onUpdated - Not a short host: ${url}`);
        return;
    }

    if (state.resolvingTabs.has(tabId)) {
        console.log(`LnkJump: onUpdated - Already resolving tab ${tabId}`);
        return;
    }

    console.log(`LnkJump: onUpdated - Starting auto-redirect for: ${url}`);
    state.resolvingTabs.add(tabId);
    try {
        const finalUrl = await resolveUrl(url, state.settings.maxHops);
        console.log(`LnkJump: onUpdated - Resolved ${url} -> ${finalUrl}`);

        if (finalUrl && finalUrl !== url && !finalUrl.startsWith('file://')) {
            console.log(`LnkJump: onUpdated - Redirecting tab ${tabId} to: ${finalUrl}`);
            await chrome.tabs.update(tabId, { url: finalUrl });
        } else {
            console.log(`LnkJump: onUpdated - No redirect needed for: ${url}`);
        }
    } catch (e) {
        console.warn("LnkJump: onUpdated - Auto redirect failed:", e);
    } finally {
        state.resolvingTabs.delete(tabId);
    }
});

// --- Context Menus ---
chrome.runtime.onInstalled.addListener(async () => {
    await loadSettings();
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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!info.linkUrl) return;
    const final = await resolveUrl(info.linkUrl, state.settings.maxHops);
    if (info.menuItemId === "resolve-open") {
        chrome.tabs.create({ url: final });
    } else if (info.menuItemId === "resolve-copy") {
        try {
            await navigator.clipboard.writeText(final);
            chrome.notifications?.create({
                type: "basic",
                iconUrl: "icons/128.png",
                title: "Copied",
                message: final
            });
        } catch {
            // Fallback: popup üzerinden kopyalanabilir
        }
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
                sendResponse({ ok: true, settings: state.settings });
            } catch (e) {
                sendResponse({ ok: false, error: e.message });
            }
        })();
        return true; // async response
    } else if (msg?.type === "RESOLVE_URL") {
        console.log(`LnkJump Background: Received RESOLVE_URL request for: ${msg.url}`);
        (async () => {
            try {
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
