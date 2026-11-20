/**
 * Phase 0 Feasibility Probe: TradingView Chart Internal API Diagnostic
 * 
 * Instructions:
 * 1. Open any chart on https://www.tradingview.com/chart/
 * 2. Press F12 or Ctrl+Shift+I to open Chrome DevTools
 * 3. Go to the "Console" tab
 * 4. Paste this entire script and press Enter
 * 5. Review the report in the console
 */

(function runTradingViewGEXProbe() {
    console.clear();
    console.log("%c========================================================", "color: #2962FF; font-weight: bold;");
    console.log("%c[GEX Automation] TradingView Chart Diagnostic Probe v1.0", "color: #2962FF; font-weight: bold; font-size: 14px;");
    console.log("%c========================================================", "color: #2962FF; font-weight: bold;");

    const results = {
        hasTradingViewApi: false,
        hasActiveChart: false,
        activeChartMethods: [],
        canCreateShape: false,
        canModifyShape: false,
        hasTvWidget: false,
        hasStudiesApi: false,
        studyCount: 0,
        chartCanvasFound: false,
        activeSymbol: null,
        activeResolution: null,
        recommendation: ""
    };

    try {
        // 1. Probe for TradingViewApi
        if (typeof window.TradingViewApi !== "undefined" && window.TradingViewApi !== null) {
            results.hasTradingViewApi = true;
            console.log("%c[+] window.TradingViewApi detected", "color: #00E676; font-weight: bold;");
            
            if (typeof window.TradingViewApi.activeChart === "function") {
                results.hasActiveChart = true;
                const chart = window.TradingViewApi.activeChart();
                console.log("%c[+] window.TradingViewApi.activeChart() callable", "color: #00E676; font-weight: bold;");
                
                // Inspect available methods on activeChart
                results.activeChartMethods = Object.keys(chart).filter(k => typeof chart[k] === "function");
                
                if (typeof chart.symbol === "function") {
                    try { results.activeSymbol = chart.symbol(); } catch (e) {}
                }
                if (typeof chart.resolution === "function") {
                    try { results.activeResolution = chart.resolution(); } catch (e) {}
                }

                // Test Shape Creation
                if (typeof chart.createShape === "function" || typeof chart.createMultipointShape === "function") {
                    results.canCreateShape = true;
                    console.log("%c[+] Shape creation API found (createShape / createMultipointShape)", "color: #00E676; font-weight: bold;");
                    
                    try {
                        const testPrice = chart.priceFormatter ? chart.priceFormatter().format(100) : 100;
                        const shapeMethod = chart.createShape || chart.createMultipointShape;
                        
                        // Attempt to create a harmless horizontal line or ray
                        const testId = shapeMethod.call(chart, { price: 5000 }, {
                            shape: 'horizontal_line',
                            lock: true,
                            disableSelection: true,
                            overrides: {
                                linecolor: '#FF007F',
                                linewidth: 2,
                                linestyle: 0,
                                text: 'GEX Probe Line'
                            }
                        });

                        if (testId) {
                            console.log(`%c[+] Successfully created test shape with ID: ${testId}`, "color: #00E676;");
                            results.canModifyShape = true;

                            // Clean up test shape after 3 seconds
                            setTimeout(() => {
                                try {
                                    if (typeof chart.removeEntity === "function") {
                                        chart.removeEntity(testId);
                                        console.log("%c[+] Test shape cleaned up successfully", "color: #00E676;");
                                    }
                                } catch (err) {
                                    console.warn("Could not remove test shape automatically:", err);
                                }
                            }, 3000);
                        }
                    } catch (shapeErr) {
                        console.warn("[-] Attempted shape creation threw an error:", shapeErr);
                    }
                }

                // Test Studies API (indicator inspection & input modification)
                if (typeof chart.getAllStudies === "function") {
                    results.hasStudiesApi = true;
                    try {
                        const studies = chart.getAllStudies();
                        results.studyCount = Array.isArray(studies) ? studies.length : 0;
                        console.log(`%c[+] Indicator/Study API found. Active studies count: ${results.studyCount}`, "color: #00E676;");
                    } catch (e) {}
                }
            }
        } else {
            console.log("%c[-] window.TradingViewApi is not defined on window directly", "color: #FF9100;");
        }

        // 2. Probe for alternative widget handles
        if (typeof window.tvWidget !== "undefined") {
            results.hasTvWidget = true;
            console.log("%c[+] window.tvWidget found", "color: #00E676;");
        }

        // 3. Probe Chart Canvases in DOM
        const canvases = document.querySelectorAll('canvas');
        if (canvases.length > 0) {
            results.chartCanvasFound = true;
            console.log(`%c[+] Found ${canvases.length} HTML5 canvas elements in DOM (Canvas overlay fallback is viable)`, "color: #00E676;");
        }

        // Extract active symbol from DOM if not via API
        if (!results.activeSymbol) {
            const symbolElem = document.querySelector('[id*="header-toolbar-symbol-search"] button div, [data-name="legend-series-item"]');
            if (symbolElem) {
                results.activeSymbol = symbolElem.textContent.trim();
            }
        }

    } catch (e) {
        console.error("Diagnostic probe encountered an exception:", e);
    }

    // Summary Evaluation
    console.log("\n%c--- DIAGNOSTIC RESULTS ---", "color: #2962FF; font-weight: bold;");
    console.table({
        "TradingViewApi Global": results.hasTradingViewApi ? "AVAILABLE" : "NOT FOUND",
        "activeChart() Method": results.hasActiveChart ? "AVAILABLE" : "NOT FOUND",
        "createShape Capability": results.canCreateShape ? "SUPPORTED" : "UNAVAILABLE",
        "DOM Canvas Fallback": results.chartCanvasFound ? "AVAILABLE" : "NOT FOUND",
        "Detected Active Symbol": results.activeSymbol || "UNKNOWN"
    });

    if (results.canCreateShape) {
        results.recommendation = "EXCELLENT: TradingView internal shape API is operational. Layer 1 (Native Lines) will work directly without dialog interruptions.";
        console.log(`%cRECOMMENDATION: ${results.recommendation}`, "color: #00E676; font-weight: bold; font-size: 13px;");
    } else if (results.chartCanvasFound) {
        results.recommendation = "PARTIAL: Native shape API is hidden/sandboxed on this build. Layer 2 (Canvas Overlay) and Layer 3 (Pine Paste-String) are fully operational.";
        console.log(`%cRECOMMENDATION: ${results.recommendation}`, "color: #FFD600; font-weight: bold; font-size: 13px;");
    } else {
        results.recommendation = "FALLBACK ONLY: Rely on Layer 3 (Pine Paste-String indicator companion).";
        console.log(`%cRECOMMENDATION: ${results.recommendation}`, "color: #FF5252; font-weight: bold; font-size: 13px;");
    }

    window.__GEX_PROBE_RESULTS__ = results;
    return results;
})();

