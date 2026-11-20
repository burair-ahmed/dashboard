document.addEventListener("DOMContentLoaded", () => {
  const connStatus = document.getElementById("conn-status");
  const activeSymbol = document.getElementById("active-symbol");
  const cwVal = document.getElementById("cw-val");
  const gfVal = document.getElementById("gf-val");
  const pwVal = document.getElementById("pw-val");
  const pineString = document.getElementById("pine-string");
  const copyBtn = document.getElementById("copy-btn");
  const copyProBtn = document.getElementById("copy-pro-btn");
  const reconnectBtn = document.getElementById("reconnect-btn");

  let currentGexProText = "";

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
        reconnectBtn.textContent = "Reconnect Backend";
        updateUI();
      }, 1000);
    });
  });

  updateUI();
  setInterval(updateUI, 2000);
});
