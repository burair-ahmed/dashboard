/**
 * Injected Page Script:
 * Runs directly inside TradingView's execution environment (window context).
 * Combines:
 * 1. Silent automated sync into GEX Levels Pro (GEX_Levels_Pro_v15.pine)
 * 2. Layer 1 Native Line Drawings (when indicator is not present)
 * 3. Layer 2 Canvas Overlay Fallback
 */

(function initGEXInjectedEngine() {
  console.log("[GEX Injected] Engine initialized in TradingView page context.");

  const drawnShapeIds = {
    call_wall: null,
    put_wall: null,
    gamma_flip: null,
    top_strikes: []
  };

  let overlayCanvas = null;
  let overlayCtx = null;
  let currentLevels = null;

  function getActiveChart() {
    if (typeof window.TradingViewApi !== "undefined" && typeof window.TradingViewApi.activeChart === "function") {
      return window.TradingViewApi.activeChart();
    }
    if (typeof window.tvWidget !== "undefined" && typeof window.tvWidget.activeChart === "function") {
      return window.tvWidget.activeChart();
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════
  // 1. AUTOMATED GEX LEVELS PRO SYNC (Zero-Interruption)
  // ══════════════════════════════════════════════════════════
  function syncGexProIndicator(chart, gexProText) {
    if (!chart || !gexProText) return false;

    let synced = false;

    // Strategy A: chart.getAllStudies() + getStudyById().applyOverrides()
    try {
      if (typeof chart.getAllStudies === "function") {
        const studies = chart.getAllStudies();
        const gexStudy = studies.find(s => {
          const n = (s.name || "").toLowerCase();
          const d = (s.description || "").toLowerCase();
          return n.includes("gex pro") || n.includes("gex levels") || d.includes("gex pro") || d.includes("gex levels");
        });

        if (gexStudy && typeof chart.getStudyById === "function") {
          const studyApi = chart.getStudyById(gexStudy.id);
          if (studyApi && typeof studyApi.applyOverrides === "function") {
            studyApi.applyOverrides({
              "levelsTxt": gexProText,
              "levels": gexProText,
              "Levels (price | type | GEX M | description)": gexProText
            });
            synced = true;
            console.log("[GEX Injected] GEX Levels Pro synced via studyApi.applyOverrides");
          }
        }
      }
    } catch (errA) {
      console.warn("[GEX Injected] Study API override attempt:", errA);
    }

    // Strategy B: Direct reactive model property mutation
    if (!synced) {
      try {
        const model = chart._model || (window._chartWidget && window._chartWidget._model);
        if (model && model._panes) {
          for (const pane of model._panes) {
            if (!pane._sources) continue;
            for (const src of pane._sources) {
              const meta = src._metaInfo || {};
              const desc = (meta.description || meta.shortDescription || "").toLowerCase();
              if (desc.includes("gex pro") || desc.includes("gex levels")) {
                if (src._properties && src._properties.inputs) {
                  const inputs = src._properties.inputs;
                  for (const key of Object.keys(inputs)) {
                    const prop = inputs[key];
                    if (prop && typeof prop.setValue === "function") {
                      const currVal = typeof prop.value === "function" ? prop.value() : "";
                      if (typeof currVal === "string" && (currVal.includes("|") || key.toLowerCase().includes("level"))) {
                        prop.setValue(gexProText);
                        synced = true;
                        console.log("[GEX Injected] GEX Levels Pro synced via reactive model property:", key);
                        break;
                      }
                    }
                  }
                }
              }
              if (synced) break;
            }
            if (synced) break;
          }
        }
      } catch (errB) {
        console.warn("[GEX Injected] Model property mutation attempt:", errB);
      }
    }

    // Notify content script about GEX Pro sync status
    window.postMessage({
      type: "GEX_PRO_SYNC_STATUS",
      synced: synced
    }, "*");

    return synced;
  }

  // ══════════════════════════════════════════════════════════
  // 2. LAYER 1: Native TradingView Shapes
  // ══════════════════════════════════════════════════════════
  function renderNativeLines(chart, levels) {
    try {
      const shapeFn = chart.createShape || chart.createMultipointShape;
      if (typeof shapeFn !== "function") return false;

      clearNativeShapes(chart);

      const drawLine = (price, label, color) => {
        try {
          return shapeFn.call(chart, { price: price }, {
            shape: "horizontal_line",
            lock: true,
            disableSelection: true,
            overrides: {
              linecolor: color,
              linewidth: 2,
              linestyle: 0,
              showLabel: true,
              text: label
            }
          });
        } catch (err) {
          return null;
        }
      };

      if (levels.call_wall) {
        drawnShapeIds.call_wall = drawLine(levels.call_wall, `Call Wall: ${levels.call_wall}`, "#FF007F");
      }
      if (levels.put_wall) {
        drawnShapeIds.put_wall = drawLine(levels.put_wall, `Put Wall: ${levels.put_wall}`, "#00E676");
      }
      if (levels.gamma_flip) {
        drawnShapeIds.gamma_flip = drawLine(levels.gamma_flip, `Gamma Flip: ${levels.gamma_flip}`, "#FFD600");
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  function clearNativeShapes(chart) {
    if (!chart || typeof chart.removeEntity !== "function") return;
    ["call_wall", "put_wall", "gamma_flip"].forEach(key => {
      if (drawnShapeIds[key]) {
        try { chart.removeEntity(drawnShapeIds[key]); } catch (e) {}
        drawnShapeIds[key] = null;
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  // 3. LAYER 2: Canvas Overlay Fallback
  // ══════════════════════════════════════════════════════════
  function ensureOverlayCanvas() {
    if (!overlayCanvas) {
      const container = document.querySelector('.chart-gui-wrapper, [class*="chartContainer-"]');
      if (!container) return false;

      overlayCanvas = document.createElement("canvas");
      overlayCanvas.id = "gex-overlay-canvas";
      overlayCanvas.style.position = "absolute";
      overlayCanvas.style.top = "0";
      overlayCanvas.style.left = "0";
      overlayCanvas.style.width = "100%";
      overlayCanvas.style.height = "100%";
      overlayCanvas.style.pointerEvents = "none";
      overlayCanvas.style.zIndex = "10";
      container.appendChild(overlayCanvas);
      overlayCtx = overlayCanvas.getContext("2d");

      window.addEventListener("resize", syncCanvasSize);
    }
    syncCanvasSize();
    return true;
  }

  function syncCanvasSize() {
    if (overlayCanvas && overlayCanvas.parentElement) {
      const rect = overlayCanvas.parentElement.getBoundingClientRect();
      overlayCanvas.width = rect.width * window.devicePixelRatio;
      overlayCanvas.height = rect.height * window.devicePixelRatio;
    }
  }

  function renderCanvasOverlay(chart, levels) {
    if (!ensureOverlayCanvas() || !overlayCtx) return;

    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    const dpr = window.devicePixelRatio || 1;

    const getCoordinateForPrice = (price) => {
      if (chart && typeof chart.priceToCoordinate === "function") {
        return chart.priceToCoordinate(price) * dpr;
      }
      return null;
    };

    const drawOverlayLine = (price, label, color) => {
      const y = getCoordinateForPrice(price);
      if (y === null || isNaN(y)) return;

      overlayCtx.save();
      overlayCtx.strokeStyle = color;
      overlayCtx.lineWidth = 2 * dpr;
      overlayCtx.setLineDash([6 * dpr, 4 * dpr]);
      overlayCtx.beginPath();
      overlayCtx.moveTo(0, y);
      overlayCtx.lineTo(overlayCanvas.width - (80 * dpr), y);
      overlayCtx.stroke();

      overlayCtx.fillStyle = color;
      overlayCtx.font = `bold ${11 * dpr}px sans-serif`;
      overlayCtx.fillText(`${label}: ${price}`, overlayCanvas.width - (220 * dpr), y - (5 * dpr));
      overlayCtx.restore();
    };

    if (levels.call_wall) drawOverlayLine(levels.call_wall, "Call Wall", "#FF007F");
    if (levels.put_wall) drawOverlayLine(levels.put_wall, "Put Wall", "#00E676");
    if (levels.gamma_flip) drawOverlayLine(levels.gamma_flip, "Gamma Flip", "#FFD600");
  }

  // ══════════════════════════════════════════════════════════
  // 4. Message Receiver
  // ══════════════════════════════════════════════════════════
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;

    if (event.data.type === "RENDER_GEX_LEVELS") {
      currentLevels = event.data.levels;
      const chart = getActiveChart();

      if (chart) {
        // 1. Try syncing GEX Levels Pro indicator silently
        const gexProSynced = syncGexProIndicator(chart, currentLevels.gex_pro_text);

        // 2. If GEX Levels Pro is NOT on chart, render native shapes or canvas
        if (!gexProSynced) {
          const nativeOk = renderNativeLines(chart, currentLevels);
          if (!nativeOk) {
            renderCanvasOverlay(chart, currentLevels);
          }
        } else {
          // If GEX Pro is active, clear native shapes to avoid double drawing
          clearNativeShapes(chart);
          if (overlayCtx && overlayCanvas) {
            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
          }
        }
      } else {
        renderCanvasOverlay(null, currentLevels);
      }
    }
  });

})();
