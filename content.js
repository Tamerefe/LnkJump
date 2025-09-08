// LnkJump: Hover popup for short links

// Global ayarlar
let lnkJumpSettings = { hoverPopup: true };

// Ayarları yükle
async function loadSettings() {
    try {
        const response = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
        if (response && response.settings) {
            lnkJumpSettings = response.settings;
            console.log('LnkJump: Settings loaded', lnkJumpSettings);
        }
    } catch (e) {
        console.log('LnkJump: Using default settings');
    }
}

// Kısa link domainleri
const shortHosts = [
    "tr.ee", "linktr.ee",
    "bit.ly", "t.co", "tinyurl.com", "goo.gl", "ow.ly", "buff.ly", "shorturl.at",
    "lnkd.in", "is.gd", "t.ly", "cutt.ly", "rebrand.ly", "shrtco.de", "rb.gy",
    "s.id", "v.gd", "u.to", "soo.gd", "adf.ly", "bc.vc", "t2mio.com", "bl.ink",
    "youtu.be", "linkedin.com", "ouo.io", "x.com"
];

// Kısa link kontrolü
function isShortHost(href) {
    try {
        // file:// protokolü için özel kontrol
        if (href.startsWith('file://')) {
            const lowerHref = href.toLowerCase();
            return shortHosts.some(sh => {
                return lowerHref.includes('/' + sh + '/') ||
                    lowerHref.includes(sh + '/') ||
                    lowerHref.match(new RegExp('\\b' + sh.replace('.', '\\.') + '/'));
            });
        }

        // Önce kısa domain kontrolü yap
        const lowerHref = href.toLowerCase();
        const directMatch = shortHosts.some(sh => {
            return lowerHref.includes(sh + '/') ||
                lowerHref.startsWith(sh + '/') ||
                lowerHref.includes('/' + sh + '/') ||
                lowerHref.match(new RegExp('\\b' + sh.replace('.', '\\.') + '/'));
        });

        if (directMatch) {
            console.log(`LnkJump: Direct domain match found in ${href}`);
            return true;
        }

        // Protokol yoksa https ekle
        let normalizedHref = href;
        if (!href.match(/^https?:\/\//)) {
            normalizedHref = 'https://' + href.replace(/^\/\//, '');
        }

        const u = new URL(normalizedHref);
        const h = u.hostname.toLowerCase();
        const isShort = shortHosts.some(sh => h === sh || h.endsWith("." + sh));
        console.log(`LnkJump: Checking ${href} -> normalized: ${normalizedHref} -> hostname: ${h}, isShort: ${isShort}`);
        return isShort;
    } catch {
        // Son çare: basit string kontrolü
        const lowerHref = href.toLowerCase();
        const isShort = shortHosts.some(sh =>
            lowerHref.includes(sh + '/') ||
            lowerHref.includes('www.' + sh + '/') ||
            lowerHref.includes('//' + sh + '/') ||
            lowerHref.startsWith(sh + '/') ||
            lowerHref.match(new RegExp('\\b' + sh.replace('.', '\\.') + '/'))
        );
        console.log(`LnkJump: Fallback check for ${href}, isShort: ${isShort}`);
        return isShort;
    }
}

// URL çözme fonksiyonu - background script üzerinden
async function resolveUrl(url) {
    try {
        // URL'yi normalize et
        let normalizedUrl = url;

        // file:// protokolünü düzelt
        if (url.startsWith('file://')) {
            // file:///C:/Users/polis/Desktop/Test/bit.ly/4mbM8Qr -> https://bit.ly/4mbM8Qr
            // Daha esnek regex pattern kullan
            const patterns = [
                /file:\/\/.*?\/([a-z0-9.-]+\.[a-z]{2,}\/[^\/\s?#]+)/i,  // Orijinal pattern
                /file:\/\/.*\/([a-z0-9.-]+\.[a-z]{2,}\/[^\s?#]+)/i,     // / olmadan da çalışsın
                /\/([a-z0-9.-]+\.[a-z]{2,}\/[^\/\s?#]+)/i               // Sadece path kısmı
            ];

            for (const pattern of patterns) {
                const match = url.match(pattern);
                if (match) {
                    normalizedUrl = 'https://' + match[1];
                    console.log(`LnkJump: Fixed file:// URL: ${url} -> ${normalizedUrl}`);
                    break;
                }
            }
        }
        // Protokol yoksa https ekle
        else if (!normalizedUrl.match(/^https?:\/\//)) {
            normalizedUrl = 'https://' + normalizedUrl.replace(/^\/\//, '');
        }

        console.log('LnkJump: Resolving URL via background:', normalizedUrl);

        // YouTube kısa linklerini önce burada çöz
        if (normalizedUrl.includes('youtu.be/')) {
            const videoId = normalizedUrl.split('youtu.be/')[1]?.split('?')[0]?.split('&')[0];
            if (videoId) {
                const fullUrl = `https://www.youtube.com/watch?v=${videoId}`;
                console.log('LnkJump: YouTube link resolved locally:', fullUrl);
                return fullUrl;
            }
        }

        // Background script'e mesaj gönder
        const response = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Message timeout after 5 seconds'));
            }, 5000);

            chrome.runtime.sendMessage({
                type: "RESOLVE_URL",
                url: normalizedUrl
            }, (response) => {
                clearTimeout(timeout);
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });

        console.log('LnkJump: Background response:', response);

        if (response && response.ok && response.resolvedUrl) {
            console.log('LnkJump: Resolved to:', response.resolvedUrl);
            return response.resolvedUrl;
        } else {
            console.log('LnkJump: No resolution or failed, returning original');
            console.log('LnkJump: Response details:', response);
            return url;
        }
    } catch (e) {
        console.error('LnkJump: Error resolving URL:', e);

        // YouTube linkleri için fallback
        if (url.includes('youtu.be/')) {
            const videoId = url.split('youtu.be/')[1]?.split('?')[0]?.split('&')[0];
            if (videoId) {
                return `https://www.youtube.com/watch?v=${videoId}`;
            }
        }

        return url;
    }
}

// Popup elementi oluştur
function createPopup() {
    const popup = document.createElement('div');
    popup.id = 'lnkjump-popup';
    popup.style.cssText = `
        position: fixed;
        z-index: 2147483647;
        background: #1a1b26;
        color: #c0caf5;
        border: 1px solid #414868;
        border-radius: 8px;
        padding: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        max-width: 400px;
        min-width: 200px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(8px);
        opacity: 0;
        transform: translateY(10px);
        transition: all 0.2s ease;
        pointer-events: none;
        word-break: break-all;
        visibility: hidden;
    `;

    popup.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="color: #7aa2f7; font-weight: bold;">🔗 LnkJump</span>
            <span id="lnkjump-status" style="color: #f7768e; font-size: 12px;">Resolving...</span>
        </div>
        <div id="lnkjump-popup-content" style="color: #9ece6a;"></div>
        <div style="margin-top: 8px; font-size: 12px; color: #565f89;">
            Click to open resolved link
        </div>
    `;

    document.body.appendChild(popup);
    return popup;
}

// Popup'ı güncelle
function updatePopup(popup, resolvedUrl, originalUrl, isLoading = false) {
    // Popup'ın var olduğunu ve DOM'da olduğunu kontrol et
    if (!popup || !document.body.contains(popup)) {
        console.warn('LnkJump: Popup element not found or not in DOM');
        return;
    }

    const statusEl = popup.querySelector('#lnkjump-status');
    const contentEl = popup.querySelector('#lnkjump-popup-content');

    // Elementlerin varlığını kontrol et
    if (!statusEl || !contentEl) {
        console.warn('LnkJump: Popup child elements not found');
        return;
    }

    if (isLoading) {
        statusEl.textContent = 'Resolving...';
        statusEl.style.color = '#f7768e';
        contentEl.textContent = 'Please wait...';
        popup.style.pointerEvents = 'none';
    } else {
        // Eğer URL çözüldüyse ve farklıysa göster
        if (resolvedUrl && resolvedUrl !== originalUrl && resolvedUrl !== 'undefined') {
            statusEl.textContent = 'Resolved';
            statusEl.style.color = '#9ece6a';

            // URL'yi kısalt (çok uzunsa)
            let displayUrl = resolvedUrl;
            if (displayUrl.length > 60) {
                displayUrl = displayUrl.substring(0, 57) + '...';
            }

            contentEl.innerHTML = `<strong>${displayUrl}</strong>`;
            popup.style.pointerEvents = 'auto';
            popup.style.cursor = 'pointer';

            // Hover efekti ekle (sadece bir kez)
            if (!popup.hasAttribute('data-hover-added')) {
                popup.setAttribute('data-hover-added', 'true');
                popup.style.transition = 'all 0.2s ease, background-color 0.1s ease';
                popup.addEventListener('mouseenter', () => {
                    popup.style.backgroundColor = '#24283b';
                });
                popup.addEventListener('mouseleave', () => {
                    popup.style.backgroundColor = '#1a1b26';
                });
            }
        } else {
            // URL çözülemediyse veya aynıysa
            statusEl.textContent = 'Unable to resolve';
            statusEl.style.color = '#f7768e';
            contentEl.innerHTML = `<em>Could not resolve this short link</em><br><small style="color: #565f89;">Original: ${originalUrl}</small>`;
            popup.style.pointerEvents = 'none';
        }
    }
}

// Popup'ı göster/gizle
function showPopup(popup, x, y) {
    // Ekran sınırlarını kontrol et
    const popupWidth = 400;
    const popupHeight = 120; // Biraz daha büyük

    // X pozisyonunu ayarla
    let finalX = Math.max(10, Math.min(x - popupWidth / 2, window.innerWidth - popupWidth - 10));

    // Y pozisyonunu ayarla (link üstünde göster) - scrollY ekleme çünkü rect.top viewport koordinatı
    let finalY = y - popupHeight - 10;
    if (finalY < 10) {
        finalY = y + 30; // Link altında göster
    }

    popup.style.left = finalX + 'px';
    popup.style.top = finalY + 'px';
    popup.style.visibility = 'visible';
    popup.style.opacity = '1';
    popup.style.transform = 'translateY(0)';

    console.log('LnkJump: Popup shown at', finalX, finalY, 'for link at', x, y);
}

function hidePopup(popup) {
    if (!popup || !document.body.contains(popup)) {
        console.warn('LnkJump: Trying to hide non-existent popup');
        return;
    }

    popup.style.opacity = '0';
    popup.style.transform = 'translateY(10px)';
    popup.style.visibility = 'hidden';
    console.log('LnkJump: Popup hidden');
}

// Ana fonksiyon
function initLnkJump() {
    console.log('LnkJump: Initializing hover popup system');
    let popup = null;
    let currentTarget = null;
    let resolveTimeout = null;
    let resolvedUrl = null;

    // Tüm linkleri dinle
    document.addEventListener('mouseover', async (e) => {
        // Hover popup kapalıysa hiçbir şey yapma
        if (!lnkJumpSettings.hoverPopup) return;

        const link = e.target.closest('a[href]');
        if (!link) return;

        console.log('LnkJump: Mouse over link:', link.href);

        if (!isShortHost(link.href)) {
            console.log('LnkJump: Not a short host');
            return;
        }

        console.log('LnkJump: Short host detected!');

        if (currentTarget === link) return;

        currentTarget = link;
        resolvedUrl = null;

        // Popup oluştur veya temizle
        if (!popup || !document.body.contains(popup)) {
            // Eski popup varsa temizle
            const oldPopup = document.getElementById('lnkjump-popup');
            if (oldPopup) {
                oldPopup.remove();
            }

            popup = createPopup();
            console.log('LnkJump: Popup created');
        }

        // Popup pozisyonunu ayarla ve göster
        const rect = link.getBoundingClientRect();
        showPopup(popup, rect.left + rect.width / 2, rect.top);
        updatePopup(popup, '', link.href, true);

        // URL'yi çöz
        clearTimeout(resolveTimeout);
        resolveTimeout = setTimeout(async () => {
            try {
                console.log('LnkJump: Starting to resolve:', link.href);
                resolvedUrl = await resolveUrl(link.href);
                console.log('LnkJump: Resolved to:', resolvedUrl);
                if (currentTarget === link) {
                    updatePopup(popup, resolvedUrl, link.href, false);
                }
            } catch (e) {
                console.error('LnkJump resolve error:', e);
                if (currentTarget === link) {
                    updatePopup(popup, 'Error resolving link', link.href, false);
                }
            }
        }, 300);
    });

    // Mouse ayrıldığında popup'ı gizle
    document.addEventListener('mouseout', (e) => {
        const link = e.target.closest('a[href]');
        if (!link || !isShortHost(link.href)) return;

        // Mouse popup'a gittiyse gizleme
        if (popup && popup.contains(e.relatedTarget)) return;

        setTimeout(() => {
            if (!popup || !popup.matches(':hover')) {
                if (popup) hidePopup(popup);
                currentTarget = null;
                clearTimeout(resolveTimeout);
            }
        }, 100);
    });

    // Popup'a tıklandığında çözülmüş URL'yi aç
    document.addEventListener('click', (e) => {
        if (e.target.closest('#lnkjump-popup') && resolvedUrl) {
            e.preventDefault();
            window.open(resolvedUrl, '_blank');
            if (popup) hidePopup(popup);
        }
    });

    // Popup'tan mouse ayrıldığında gizle
    document.addEventListener('mouseout', (e) => {
        if (e.target.closest('#lnkjump-popup') && !e.relatedTarget?.closest('#lnkjump-popup')) {
            setTimeout(() => {
                if (popup && !popup.matches(':hover')) {
                    hidePopup(popup);
                    currentTarget = null;
                }
            }, 100);
        }
    });
}

// Sayfa yüklendiğinde başlat
async function start() {
    await loadSettings();
    initLnkJump();
}

if (document.readyState === 'loading') {
    console.log('LnkJump: Document loading, waiting for DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', start);
} else {
    console.log('LnkJump: Document ready, initializing immediately');
    start();
}
