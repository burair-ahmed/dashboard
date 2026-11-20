document.addEventListener("DOMContentLoaded", () => {
  const CLOUD_URL = "https://burair-ahmed-gex-backend.hf.space";
  const LOCAL_URL = "http://127.0.0.1:7860";

  const connStatus = document.getElementById("conn-status");
  const backendUrlInput = document.getElementById("backend-url");
  const saveUrlBtn = document.getElementById("save-url-btn");
  const presetCloud = document.getElementById("preset-cloud");
  const presetLocal = document.getElementById("preset-local");
  const connMode = document.getElementById("conn-mode");
  const activeSymbol = document.getElementById("active-symbol");
  const cwVal = document.getElementById("cw-val");
  const gfVal = document.getElementById("gf-val");
  const pwVal = document.getElementById("pw-val");
  const pineString = document.getElementById("pine-string");
  const copyBtn = document.getElementById("copy-btn");
  const copyProBtn = document.getElementById("copy-pro-btn");
  const reconnectBtn = document.getElementById("reconnect-btn");

  let currentGexProText = "";
  let isEditingUrl = false;

  backendUrlInput.addEventListener("focus", () => { isEditingUrl = true; });
  backendUrlInput.addEventListener("blur", () => { isEditingUrl = false; });

  function setBackendUrl(url) {
    backendUrlInput.value = url;
    saveUrlBtn.textContent = "Saved";
    chrome.runtime.sendMessage({ action: "UPDATE_BACKEND_URL", url: url }, () => {
      setTimeout(() => { saveUrlBtn.textContent = "Set"; }, 1500);
      updateUI();
    });
  }

  function highlightPresets(currentUrl) {
    const isCloud = currentUrl && currentUrl.includes("hf.space");
    const isLocal = currentUrl && (currentUrl.includes("127.0.0.1") || currentUrl.includes("localhost"));
    presetCloud.classList.toggle("active", isCloud);
    presetLocal.classList.toggle("active", isLocal);
  }

  function updateUI() {
    chrome.runtime.sendMessage({ action: "GET_STATUS" }, (response) => {
      if (!response) return;

      if (response.connected) {
        connStatus.textContent = "Connected";
        connStatus.className = "status-badge connected";
      } else {
        connStatus.textContent = "Disconnected";
        connStatus.className = "status-badge disconnected";
      }

      if (!isEditingUrl && response.backendUrl) {
        backendUrlInput.value = response.backendUrl;
      }

      highlightPresets(response.backendUrl);
      connMode.textContent = `Mode: ${response.mode || "--"}`;

      activeSymbol.textContent = response.currentSymbol || "SPY";

      if (response.lastLevels) {
        const l = response.lastLevels;
        cwVal.textContent = l.call_wall;
        gfVal.textContent = l.gamma_flip;
        pwVal.textContent = l.put_wall;
        pineString.value = l.compact_string || "";
        currentGexProText = l.gex_pro_text || "";
      }
    });
  }

  presetCloud.addEventListener("click", () => { setBackendUrl(CLOUD_URL); });
  presetLocal.addEventListener("click", () => { setBackendUrl(LOCAL_URL); });

  saveUrlBtn.addEventListener("click", () => {
    const newUrl = backendUrlInput.value.trim();
    if (!newUrl) return;
    setBackendUrl(newUrl);
  });

  copyBtn.addEventListener("click", () => {
    if (pineString.value) {
      navigator.clipboard.writeText(pineString.value).then(() => {
        copyBtn.textContent = "Copied!";
        setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
      });
    }
  });

  copyProBtn.addEventListener("click", () => {
    if (currentGexProText) {
      navigator.clipboard.writeText(currentGexProText).then(() => {
        copyProBtn.textContent = "Plan Copied to Clipboard! ✅";
        setTimeout(() => { copyProBtn.textContent = "Copy Full GEX Pro Plan 📋"; }, 1800);
      });
    }
  });

  reconnectBtn.addEventListener("click", () => {
    reconnectBtn.textContent = "Reconnecting...";
    chrome.runtime.sendMessage({ action: "RECONNECT_WS" }, () => {
      setTimeout(() => {
        reconnectBtn.textContent = "Force Reconnect";
        updateUI();
      }, 1000);
    });
  });

  updateUI();
  setInterval(updateUI, 2500);
});
