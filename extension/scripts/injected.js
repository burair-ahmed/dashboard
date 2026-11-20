/**
 * Injected Page Script:
 * Runs directly inside TradingView's execution environment (window context).
 * Implements Layer 1 (Native Shapes via internal API) and Layer 2 (Canvas Overlay Fallback).
 */

(function initGEXInjectedEngine() {
  console.log("[GEX Injected] Engine initialized in TradingView page context.");

  // Drawing state
  const drawnShapeIds = {
    call_wall: null,
    put_wall: null,
    gamma_flip: null,
    top_strikes: []
  };

  let overlayCanvas = null;
  let overlayCtx = null;
  let currentLevels = null;

  // 1. Get TradingView Chart Object
  function getActiveChart() {
    if (typeof window.TradingViewApi !== "undefined" && typeof window.TradingViewApi.activeChart === "function") {
      return window.TradingViewApi.activeChart();
    }
    if (typeof window.tvWidget !== "undefined" && typeof window.tvWidget.activeChart === "function") {
      return window.tvWidget.activeChart();
    }
    return null;
  }

  // 2. LAYER 1: Native TradingView Shapes
  function renderNativeLines(chart, levels) {
    try {
      const shapeFn = chart.createShape || chart.createMultipointShape;
      if (typeof shapeFn !== "function") {
        return false;
      }

      // Cleanup prior shapes
      clearNativeShapes(chart);

      // Helper to draw a single line
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
          console.warn(`[GEX Injected] Error drawing ${label}:`, err);
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

      console.log("[GEX Injected] Rendered native lines successfully:", drawnShapeIds);
      return true;
    } catch (e) {
      console.warn("[GEX Injected] Native line rendering encountered error, falling back to overlay:", e);
      return false;
    }
  }

  function clearNativeShapes(chart) {
    if (!chart || typeof chart.removeEntity !== "function") return;
    
    ["call_wall", "put_wall", "gamma_flip"].forEach(key => {
      if (drawnShapeIds[key]) {
        try {
          chart.removeEntity(drawnShapeIds[key]);
        } catch (e) {}
        drawnShapeIds[key] = null;
      }
    });
  }

  // 3. LAYER 2: Canvas Overlay Fallback
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

    // Helper to calculate pixel coordinate from price
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

      // Label Pill
      overlayCtx.fillStyle = color;
      overlayCtx.font = `bold ${11 * dpr}px sans-serif`;
      overlayCtx.fillText(`${label}: ${price}`, overlayCanvas.width - (220 * dpr), y - (5 * dpr));
      overlayCtx.restore();
    };

    if (levels.call_wall) drawOverlayLine(levels.call_wall, "Call Wall", "#FF007F");
    if (levels.put_wall) drawOverlayLine(levels.put_wall, "Put Wall", "#00E676");
    if (levels.gamma_flip) drawOverlayLine(levels.gamma_flip, "Gamma Flip", "#FFD600");
  }

  // 4. Message Receiver from content script
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.type !== "RENDER_GEX_LEVELS") {
      return;
    }

    currentLevels = event.data.levels;
    const chart = getActiveChart();

    if (chart) {
      // Try Layer 1 (Native Shapes)
      const nativeOk = renderNativeLines(chart, currentLevels);
      if (!nativeOk) {
        // Fallback to Layer 2 (Canvas Overlay)
        renderCanvasOverlay(chart, currentLevels);
      }
    } else {
      console.warn("[GEX Injected] No active chart found via window.TradingViewApi. Attempting canvas overlay fallback.");
      renderCanvasOverlay(null, currentLevels);
    }
  });

})();

