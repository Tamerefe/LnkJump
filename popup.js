const hoverPopupEl = document.getElementById("hoverPopup");

function send(msg) {
    return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

async function init() {
    const { settings } = await send({ type: "GET_SETTINGS" });

    // Hover popup varsayılan olarak açık
    hoverPopupEl.checked = settings.hoverPopup !== false;

    console.log('LnkJump Popup: Settings loaded', settings);
}

// Settings değiştiğinde kaydet
hoverPopupEl.addEventListener("change", async () => {
    await send({ type: "SET_SETTINGS", payload: { hoverPopup: hoverPopupEl.checked } });
    console.log('LnkJump: Hover popup', hoverPopupEl.checked ? 'enabled' : 'disabled');
});

init();
