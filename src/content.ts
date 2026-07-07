// @ts-nocheck
(function() {
  if (window.hasScreenRecorderOverlay) {
    let isOldContextValid = false;
    try {
      isOldContextValid = typeof window.srContextIsValid === 'function' && window.srContextIsValid();
    } catch (e) {
      isOldContextValid = false;
    }

    if (isOldContextValid) {
      chrome.runtime.sendMessage({ type: "GET_RECORDING_STATE" }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.isRecording) {
          if (window.srInitOverlay) window.srInitOverlay();
        }
      });
      return;
    } else {
      // Old context is dead/invalidated. Clean up old elements and run fresh.
      const oldOverlayHost = document.getElementById('screen-recorder-overlay-host');
      if (oldOverlayHost) {
        try { oldOverlayHost.remove(); } catch (e) {}
      }
      const oldDrawingHost = document.getElementById('screen-recorder-drawing-host');
      if (oldDrawingHost) {
        try { oldDrawingHost.remove(); } catch (e) {}
      }
      window.hasScreenRecorderOverlay = false;
      window.srInitOverlay = undefined;
      window.srRemoveOverlay = undefined;
      window.srContextIsValid = undefined;
    }
  }

  window.hasScreenRecorderOverlay = true;
  window.srContextIsValid = () => {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  };

  let isRecording = false;
  let isInitializing = false;
  let isMicActive = false;
  let showHighlight = true;
  let showClickRipple = true;
  let showCaptureBtn = true;
  let showDrawingBar = true;

  function getMicIconHtml(active) {
    if (active) {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
      `;
    } else {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M18.63 16.51L15.6 13.48c.27-.47.4-.99.4-1.52v-1.5M12 18.75v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3zM3 3l18 18" />
        </svg>
      `;
    }
  }
  let currentTool = 'none'; // 'none', 'pencil', 'highlighter', 'eraser', 'square', 'circle', 'line', 'arrow', 'laser', 'text', 'magnifier'
  let isDrawingMode = false;
  let currentColor = '#eab308'; // Default yellow
  let brushSize = 8; // Default medium preset
  let isDrawing = false;
  let cursorPos = { x: 0, y: 0 };
  let ripples = [];
  let laserPoints = []; // Tracks recent laser pointer coordinates
  let magnifierImage = null; // Caches the viewport capture image for magnifying
  let magnifierImageLoaded = false;
  let lastX = 0;
  let lastY = 0;
  let animationFrameId = null;
  let resizeObserver = null;
  let magnifierMoveTimeout = null;

  // History stacks for Undo / Redo
  let undoStack = [];
  let redoStack = [];
  let currentStroke = null;

  let shadowRoot = null;
  let overlayHost = null;
  let drawingHost = null;
  let drawingShadowRoot = null;
  let drawingCanvas = null;
  let interactionCanvas = null;
  let drawingCtx = null;
  let interactionCtx = null;
  let toolbarEl = null;
  let minimizedTrigger = null;

  function getEffectiveBrushSize() {
    if (currentTool === 'pencil') return brushSize;
    if (currentTool === 'highlighter') return brushSize * 2.5;
    if (currentTool === 'eraser') return brushSize * 4;
    return brushSize;
  }

  function showMicPermissionModal() {
    if (!shadowRoot) return;
    let modal = shadowRoot.getElementById('sr-mic-permission-modal');
    if (modal) return; // Already exists

    modal = document.createElement('div');
    modal.id = 'sr-mic-permission-modal';
    modal.style.position = 'fixed';
    modal.style.top = '50%';
    modal.style.left = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.backgroundColor = 'rgba(15, 23, 42, 0.92)';
    modal.style.border = '1px solid rgba(255, 255, 255, 0.15)';
    modal.style.borderRadius = '16px';
    modal.style.padding = '24px 32px';
    modal.style.color = '#f8fafc';
    modal.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    modal.style.fontSize = '14px';
    modal.style.lineHeight = '1.6';
    modal.style.textAlign = 'center';
    modal.style.zIndex = '2147483647';
    modal.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)';
    modal.style.pointerEvents = 'auto';
    modal.style.maxWidth = '320px';
    modal.style.backdropFilter = 'blur(12px)';

    modal.innerHTML = `
      <div style="margin-bottom: 16px;">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 48px; height: 48px; color: #3b82f6; margin: 0 auto; animation: pulse 2s infinite;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
      </div>
      <h3 style="font-size: 18px; font-weight: 600; margin: 0 0 8px 0; color: #ffffff;">Microphone Access</h3>
      <p style="margin: 0 0 16px 0; color: #94a3b8; font-size: 13px;">
        Please click <strong>Allow</strong> in the chrome permission window that just opened in the recording tab.
      </p>
      <div style="font-size: 11px; color: #3b82f6; font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase;">
        Waiting for approval...
      </div>
    `;

    // Add keyframe animation if not already injected
    if (!shadowRoot.getElementById('sr-mic-animation-style')) {
      const animStyle = document.createElement('style');
      animStyle.id = 'sr-mic-animation-style';
      animStyle.textContent = `
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: .5; transform: scale(1.05); }
        }
      `;
      shadowRoot.appendChild(animStyle);
    }

    shadowRoot.appendChild(modal);
  }

  function hideMicPermissionModal() {
    if (!shadowRoot) return;
    const modal = shadowRoot.getElementById('sr-mic-permission-modal');
    if (modal) {
      modal.remove();
    }
  }

  function initOverlay() {
    if (overlayHost || isInitializing) return; // Already initialized or initializing
    isInitializing = true;

    // Clean up any stray elements in the DOM to prevent duplicates
    const strayDrawingHost = document.getElementById('screen-recorder-drawing-host');
    if (strayDrawingHost) {
      try { strayDrawingHost.remove(); } catch (e) {}
    }
    const strayOverlayHost = document.getElementById('screen-recorder-overlay-host');
    if (strayOverlayHost) {
      try { strayOverlayHost.remove(); } catch (e) {}
    }

    loadSettingsFromStorage(() => {
      isInitializing = false;

      // Double check if recording was stopped while loading settings
      if (!isRecording) {
        return;
      }

      // Double check overlayHost was not created by another call in the meantime
      if (overlayHost) {
        return;
      }

      // Create drawingHost for absolute elements (drawing canvas)
      drawingHost = document.createElement('div');
      drawingHost.id = 'screen-recorder-drawing-host';
      drawingHost.style.position = 'absolute';
      drawingHost.style.top = '0';
      drawingHost.style.left = '0';
      drawingHost.style.width = '100%';
      drawingHost.style.height = '100%';
      drawingHost.style.zIndex = '2147483646';
      drawingHost.style.pointerEvents = 'none';
      drawingHost.style.overflow = 'visible';

      drawingShadowRoot = drawingHost.attachShadow({ mode: 'open' });
      document.body.appendChild(drawingHost);

      // Create overlayHost for fixed elements (interaction canvas, toolbar, minimized trigger)
      overlayHost = document.createElement('div');
      overlayHost.id = 'screen-recorder-overlay-host';
      overlayHost.style.position = 'fixed';
      overlayHost.style.top = '0';
      overlayHost.style.left = '0';
      overlayHost.style.width = '100vw';
      overlayHost.style.height = '100vh';
      overlayHost.style.zIndex = '2147483647';
      overlayHost.style.pointerEvents = 'none';

      shadowRoot = overlayHost.attachShadow({ mode: 'open' });
      document.body.appendChild(overlayHost);

      // Inject styles
      const style = document.createElement('style');
      style.textContent = getShadowStyles();
      shadowRoot.appendChild(style);

      // Create container wrapper
      const container = document.createElement('div');
      container.className = 'sr-overlay-container';
      shadowRoot.appendChild(container);

      // Create Drawing Canvas inside drawingShadowRoot
      drawingCanvas = document.createElement('canvas');
      drawingCanvas.className = 'sr-canvas sr-drawing-canvas';
      drawingCanvas.style.position = 'absolute';
      drawingCanvas.style.top = '0';
      drawingCanvas.style.left = '0';
      drawingCanvas.style.margin = '0';
      drawingCanvas.style.padding = '0';
      drawingCanvas.style.pointerEvents = 'none';
      drawingCanvas.style.zIndex = '1';
      drawingShadowRoot.appendChild(drawingCanvas);
      drawingCtx = drawingCanvas.getContext('2d');

      // Create Interaction Canvas (Mouse Highlight, Ripples)
      interactionCanvas = document.createElement('canvas');
      interactionCanvas.className = 'sr-canvas sr-interaction-canvas';
      container.appendChild(interactionCanvas);
      interactionCtx = interactionCanvas.getContext('2d');

      resizeCanvases();
      createToolbar(container);
      applyInitialToolVisibility();
      setupEvents();
      startLoop();

      // Apply initial values
      updateToolbarUI();
      // If currentTool is not 'none', make sure it is selected!
      if (currentTool !== 'none') {
        const toolToSelect = currentTool;
        currentTool = 'none'; // reset so selectTool sets it correctly
        selectTool(toolToSelect, false);
      }
    });
  }

  function removeOverlay() {
    hideMicPermissionModal();
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    window.removeEventListener('resize', resizeCanvases);
    document.removeEventListener('mousemove', handleMouseMoveGlobal);
    document.removeEventListener('mousedown', handleMouseDownGlobal);
    document.removeEventListener('keydown', handleKeyDownGlobal);

    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    if (drawingHost) {
      if (drawingShadowRoot) {
        drawingShadowRoot.querySelectorAll('.sr-text-input').forEach(el => el.remove());
      }
      drawingHost.remove();
      drawingHost = null;
      drawingShadowRoot = null;
    }

    if (overlayHost) {
      overlayHost.remove();
      overlayHost = null;
      shadowRoot = null;
      drawingCanvas = null;
      interactionCanvas = null;
      drawingCtx = null;
      interactionCtx = null;
      toolbarEl = null;
      undoStack = [];
      redoStack = [];
      currentStroke = null;
      laserPoints = [];
    }

    currentTool = 'none';
    isDrawingMode = false;
    isDrawing = false;
    isInitializing = false;
    isMicActive = false;
  }

  // Expose functions for subsequent script runs
  window.srInitOverlay = initOverlay;
  window.srRemoveOverlay = removeOverlay;

  function loadSettingsFromStorage(callback) {
    const defaults = {
      showHighlight: true,
      showClickRipple: true,
      showCaptureBtn: true,
      showDrawingBar: true,
      currentColor: '#eab308',
      brushSize: 8,
      currentTool: 'none',
      recordMic: false
    };

    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(defaults, (res) => {
          const data = res || defaults;
          showHighlight = data.showHighlight !== false;
          showClickRipple = data.showClickRipple !== false;
          showCaptureBtn = data.showCaptureBtn !== false;
          showDrawingBar = data.showDrawingBar !== false;
          currentColor = data.currentColor || '#eab308';
          brushSize = data.brushSize || 8;
          currentTool = data.currentTool || 'none';
          isMicActive = !!data.recordMic;
          console.log("[SR Overlay] Settings loaded from storage:", data);
          if (callback) callback();
        });
        return;
      }
    } catch (err) {
      console.warn("[SR Overlay] Failed to load settings from storage:", err);
    }

    // Fallback if chrome.storage is not available
    showHighlight = defaults.showHighlight;
    showClickRipple = defaults.showClickRipple;
    showCaptureBtn = defaults.showCaptureBtn;
    showDrawingBar = defaults.showDrawingBar;
    currentColor = defaults.currentColor;
    brushSize = defaults.brushSize;
    currentTool = defaults.currentTool;
    isMicActive = defaults.recordMic;
    if (callback) callback();
  }

  function saveAndBroadcastSettings(settings) {
    console.log("[SR Overlay] saveAndBroadcastSettings called:", settings);
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(settings, () => {
          if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
              type: "SETTINGS_CHANGED",
              ...settings
            }).catch(() => {});
          }
        });
      }
    } catch (err) {
      console.warn("[SR Overlay] Failed to save/broadcast settings:", err);
    }
  }

  function updateToolbarUI() {
    if (!shadowRoot) return;

    // Highlight Toggle
    const btnHighlight = shadowRoot.getElementById('sr-btn-highlight');
    if (btnHighlight) {
      btnHighlight.classList.toggle('sr-active', showHighlight);
    }

    // Ripple Toggle
    const btnRipple = shadowRoot.getElementById('sr-btn-ripple');
    if (btnRipple) {
      btnRipple.classList.toggle('sr-active', showClickRipple);
    }

    // Colors
    const colorsContainer = shadowRoot.querySelector('.sr-colors');
    if (colorsContainer) {
      const colorsList = [
        { value: '#eab308', name: 'yellow' },
        { value: '#ef4444', name: 'red' },
        { value: '#3b82f6', name: 'blue' },
        { value: '#22c55e', name: 'green' }
      ];
      
      const isCustomColor = !colorsList.some(c => c.value === currentColor);
      
      colorsContainer.querySelectorAll('.sr-color-btn').forEach(btn => {
        if (btn.classList.contains('sr-color-custom')) {
          btn.classList.toggle('sr-selected', isCustomColor);
          if (isCustomColor) {
            btn.style.background = currentColor;
            btn.style.color = currentColor;
          } else {
            btn.style.background = 'linear-gradient(135deg, #ff0000, #00ff00, #0000ff)';
            btn.style.color = 'transparent';
          }
          const pickerInput = btn.querySelector('input');
          if (pickerInput) {
            pickerInput.value = currentColor;
          }
        } else {
          // Standard colors
          const colorValue = colorsList.find(c => btn.classList.contains(`sr-color-${c.name}`))?.value;
          btn.classList.toggle('sr-selected', colorValue === currentColor);
        }
      });
    }

    // Sizes
    const sizesContainer = shadowRoot.querySelector('.sr-sizes');
    if (sizesContainer) {
      const sizesMap = { 4: 'small', 8: 'medium', 12: 'large' };
      sizesContainer.querySelectorAll('.sr-size-btn').forEach(btn => {
        const sizeClass = sizesMap[brushSize];
        btn.classList.toggle('sr-selected', btn.classList.contains(`sr-size-${sizeClass}`));
      });
    }

    // Capture Button
    updateCaptureButtonVisibility(showCaptureBtn);

    // Drawing Bar Visibility
    updateDrawingBarVisibility(showDrawingBar);
  }

  function redrawCanvas() {
    if (!drawingCtx) return;
    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);

    const prevComposite = drawingCtx.globalCompositeOperation;
    const prevAlpha = drawingCtx.globalAlpha;
    const prevStrokeStyle = drawingCtx.strokeStyle;
    const prevLineWidth = drawingCtx.lineWidth;
    const prevLineCap = drawingCtx.lineCap;
    const prevLineJoin = drawingCtx.lineJoin;

    undoStack.forEach((stroke) => {
      if (stroke.tool !== 'text' && (!stroke.points || stroke.points.length === 0)) return;

      drawingCtx.lineWidth = stroke.size;
      drawingCtx.lineCap = 'round';
      drawingCtx.lineJoin = 'round';

      if (stroke.tool === 'pencil') {
        drawingCtx.globalCompositeOperation = 'source-over';
        drawingCtx.globalAlpha = 1.0;
        drawingCtx.strokeStyle = stroke.color;
        
        drawingCtx.beginPath();
        drawingCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
        if (stroke.points.length === 1) {
          drawingCtx.lineTo(stroke.points[0].x, stroke.points[0].y);
        } else {
          for (let i = 1; i < stroke.points.length; i++) {
            drawingCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
          }
        }
        drawingCtx.stroke();
      } else if (stroke.tool === 'highlighter') {
        drawingCtx.globalCompositeOperation = 'source-over';
        drawingCtx.globalAlpha = 0.45;
        drawingCtx.strokeStyle = stroke.color;

        drawingCtx.beginPath();
        drawingCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
        if (stroke.points.length === 1) {
          drawingCtx.lineTo(stroke.points[0].x, stroke.points[0].y);
        } else {
          for (let i = 1; i < stroke.points.length; i++) {
            drawingCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
          }
        }
        drawingCtx.stroke();
      } else if (stroke.tool === 'eraser') {
        drawingCtx.globalCompositeOperation = 'destination-out';
        drawingCtx.globalAlpha = 1.0;

        drawingCtx.beginPath();
        drawingCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
        if (stroke.points.length === 1) {
          drawingCtx.lineTo(stroke.points[0].x, stroke.points[0].y);
        } else {
          for (let i = 1; i < stroke.points.length; i++) {
            drawingCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
          }
        }
        drawingCtx.stroke();
      } else if (stroke.tool === 'square') {
        drawingCtx.globalCompositeOperation = 'source-over';
        drawingCtx.globalAlpha = 1.0;
        drawingCtx.strokeStyle = stroke.color;

        const start = stroke.points[0];
        const end = stroke.points[1] || start;
        drawingCtx.beginPath();
        drawingCtx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
        drawingCtx.stroke();
      } else if (stroke.tool === 'circle') {
        drawingCtx.globalCompositeOperation = 'source-over';
        drawingCtx.globalAlpha = 1.0;
        drawingCtx.strokeStyle = stroke.color;

        const start = stroke.points[0];
        const end = stroke.points[1] || start;
        const rx = (end.x - start.x) / 2;
        const ry = (end.y - start.y) / 2;
        const cx = start.x + rx;
        const cy = start.y + ry;
        drawingCtx.beginPath();
        drawingCtx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, 2 * Math.PI);
        drawingCtx.stroke();
      } else if (stroke.tool === 'line') {
        drawingCtx.globalCompositeOperation = 'source-over';
        drawingCtx.globalAlpha = 1.0;
        drawingCtx.strokeStyle = stroke.color;

        const start = stroke.points[0];
        const end = stroke.points[1] || start;
        drawingCtx.beginPath();
        drawingCtx.moveTo(start.x, start.y);
        drawingCtx.lineTo(end.x, end.y);
        drawingCtx.stroke();
      } else if (stroke.tool === 'arrow') {
        drawingCtx.globalCompositeOperation = 'source-over';
        drawingCtx.globalAlpha = 1.0;
        drawingCtx.strokeStyle = stroke.color;
        drawingCtx.fillStyle = stroke.color;

        const start = stroke.points[0];
        const end = stroke.points[1] || start;
        
        drawingCtx.beginPath();
        drawingCtx.moveTo(start.x, start.y);
        drawingCtx.lineTo(end.x, end.y);
        drawingCtx.stroke();

        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const arrowLength = Math.max(10, stroke.size * 2);
        drawingCtx.beginPath();
        drawingCtx.moveTo(end.x, end.y);
        drawingCtx.lineTo(end.x - arrowLength * Math.cos(angle - Math.PI / 6), end.y - arrowLength * Math.sin(angle - Math.PI / 6));
        drawingCtx.lineTo(end.x - arrowLength * Math.cos(angle + Math.PI / 6), end.y - arrowLength * Math.sin(angle + Math.PI / 6));
        drawingCtx.closePath();
        drawingCtx.fill();
      } else if (stroke.tool === 'text') {
        drawingCtx.globalCompositeOperation = 'source-over';
        drawingCtx.globalAlpha = 1.0;
        drawingCtx.fillStyle = stroke.color;
        const fontSize = Math.max(14, stroke.size * 2 + 10);
        drawingCtx.font = `600 ${fontSize}px 'Outfit', sans-serif`;
        drawingCtx.textBaseline = 'top';
        drawingCtx.fillText(stroke.text, stroke.x, stroke.y);
      }
    });

    drawingCtx.globalCompositeOperation = prevComposite;
    drawingCtx.globalAlpha = prevAlpha;
    drawingCtx.strokeStyle = prevStrokeStyle;
    drawingCtx.lineWidth = prevLineWidth;
    drawingCtx.lineCap = prevLineCap;
    drawingCtx.lineJoin = prevLineJoin;
  }

  function resizeCanvases() {
    if (!drawingCanvas || !interactionCanvas) return;

    interactionCanvas.width = window.innerWidth;
    interactionCanvas.height = window.innerHeight;

    const docWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
      document.documentElement.clientWidth
    );
    const docHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      document.documentElement.clientHeight
    );

    drawingCanvas.width = docWidth;
    drawingCanvas.height = docHeight;

    if (drawingHost) {
      drawingHost.style.width = docWidth + 'px';
      drawingHost.style.height = docHeight + 'px';
    }

    redrawCanvas();
  }

  function setupEvents() {
    window.addEventListener('resize', resizeCanvases);
    document.addEventListener('mousemove', handleMouseMoveGlobal);
    document.addEventListener('mousedown', handleMouseDownGlobal);
    document.addEventListener('keydown', handleKeyDownGlobal);

    // Canvas drawing mouse events
    interactionCanvas.addEventListener('mousedown', startDrawing);
    interactionCanvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDrawing);

    // Watch for document size changes
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        resizeCanvases();
      });
      resizeObserver.observe(document.body);
    }

    // Touch support for drawings
    interactionCanvas.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
          clientX: touch.clientX,
          clientY: touch.clientY
        });
        interactionCanvas.dispatchEvent(mouseEvent);
      }
    });
    interactionCanvas.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
          clientX: touch.clientX,
          clientY: touch.clientY
        });
        interactionCanvas.dispatchEvent(mouseEvent);
      }
    });
    window.addEventListener('touchend', () => {
      const mouseEvent = new MouseEvent('mouseup', {});
      window.dispatchEvent(mouseEvent);
    });
  }

  function handleMouseMoveGlobal(e) {
    cursorPos.x = e.clientX;
    cursorPos.y = e.clientY;

    if (currentTool === 'laser') {
      laserPoints.push({
        x: e.clientX,
        y: e.clientY,
        time: Date.now()
      });
    }

    if (currentTool === 'magnifier') {
      // Debounce magnifier screenshot refresh when mouse stops moving
      if (magnifierMoveTimeout) clearTimeout(magnifierMoveTimeout);
      magnifierMoveTimeout = setTimeout(() => {
        refreshMagnifierImage();
      }, 150);
    }
  }

  function handleMouseDownGlobal(e) {
    if (isDrawingMode || !showClickRipple) return;

    // Add ripple effect
    ripples.push({
      x: e.clientX,
      y: e.clientY,
      radius: 0,
      maxRadius: 30,
      alpha: 0.8,
      speed: 1.5
    });

    if (currentTool === 'magnifier') {
      setTimeout(refreshMagnifierImage, 100);
    }
  }

  function handleKeyDownGlobal(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
      return;
    }

    const key = e.key.toLowerCase();

    // Undo / Redo
    if (key === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.shiftKey) {
        executeRedo();
      } else {
        executeUndo();
      }
      return;
    }
    if (key === 'y' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      executeRedo();
      return;
    }

    // Toggle Pen Tool (D)
    if (key === 'd') {
      e.preventDefault();
      selectTool(currentTool === 'pencil' ? 'none' : 'pencil');
    }
    // Toggle Highlighter (H)
    else if (key === 'h') {
      e.preventDefault();
      selectTool(currentTool === 'highlighter' ? 'none' : 'highlighter');
    }
    // Toggle Eraser (E)
    else if (key === 'e') {
      e.preventDefault();
      selectTool(currentTool === 'eraser' ? 'none' : 'eraser');
    }
    // Clear All (C)
    else if (key === 'c') {
      e.preventDefault();
      executeClear();
    }
    // Select 1st Color (1) - Yellow
    else if (key === '1') {
      e.preventDefault();
      currentColor = '#eab308';
      saveAndBroadcastSettings({ currentColor });
      updateToolbarUI();
    }
    // Select 2nd Color (2) - Red
    else if (key === '2') {
      e.preventDefault();
      currentColor = '#ef4444';
      saveAndBroadcastSettings({ currentColor });
      updateToolbarUI();
    }
    // Select 3rd Color (3) - Blue
    else if (key === '3') {
      e.preventDefault();
      currentColor = '#3b82f6';
      saveAndBroadcastSettings({ currentColor });
      updateToolbarUI();
    }
    // Stop recording: Ctrl+Shift+S or Cmd+Shift+S
    else if (key === 's' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault();
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
        }
      } catch (err) {}
    }
  }

  function startDrawing(e) {
    if (currentTool === 'none' || currentTool === 'laser') return;

    if (currentTool === 'text') {
      isDrawing = false;
      const existingInput = drawingShadowRoot.querySelector('.sr-text-input');
      if (existingInput) {
        existingInput.blur();
      }

      const clickX = e.clientX;
      const clickY = e.clientY;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'sr-text-input';
      input.placeholder = 'Type text here...';
      input.style.position = 'absolute';
      input.style.left = `${clickX + window.scrollX}px`;
      input.style.top = `${clickY + window.scrollY}px`;
      
      const fontSize = Math.max(14, brushSize * 2 + 10);
      input.style.font = `600 ${fontSize}px 'Outfit', sans-serif`;
      input.style.color = currentColor;
      input.style.background = 'transparent';
      input.style.border = 'none';
      input.style.outline = 'none';
      input.style.padding = '0';
      input.style.margin = '0';
      input.style.zIndex = '2147483647';
      input.style.pointerEvents = 'auto';
      input.style.minWidth = '150px';

      drawingShadowRoot.appendChild(input);

      setTimeout(() => {
        input.focus();
      }, 50);

      const commitText = () => {
        const val = input.value.trim();
        if (val) {
          const textStroke = {
            tool: 'text',
            color: currentColor,
            size: brushSize,
            text: val,
            x: clickX + window.scrollX,
            y: clickY + window.scrollY
          };
          undoStack.push(textStroke);
          redoStack = [];
          redrawCanvas();
          updateUndoRedoButtons();
        }
        input.remove();
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitText();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          input.remove();
        }
      });

      input.addEventListener('blur', () => {
        commitText();
      });

      return;
    }

    isDrawing = true;
    lastX = e.clientX + window.scrollX;
    lastY = e.clientY + window.scrollY;

    currentStroke = {
      tool: currentTool,
      color: currentColor,
      size: getEffectiveBrushSize(),
      points: [{ x: lastX, y: lastY }, { x: lastX, y: lastY }]
    };

    if (currentTool === 'pencil' || currentTool === 'highlighter' || currentTool === 'eraser') {
      drawingCtx.lineWidth = getEffectiveBrushSize();
      drawingCtx.lineCap = 'round';
      drawingCtx.lineJoin = 'round';

      if (currentTool === 'pencil') {
        drawingCtx.globalCompositeOperation = 'source-over';
        drawingCtx.globalAlpha = 1.0;
        drawingCtx.strokeStyle = currentColor;
      } else if (currentTool === 'highlighter') {
        drawingCtx.globalCompositeOperation = 'source-over';
        drawingCtx.globalAlpha = 0.45;
        drawingCtx.strokeStyle = currentColor;
      } else if (currentTool === 'eraser') {
        drawingCtx.globalCompositeOperation = 'destination-out';
        drawingCtx.globalAlpha = 1.0;
      }

      drawingCtx.beginPath();
      drawingCtx.moveTo(lastX, lastY);
      drawingCtx.lineTo(lastX, lastY);
      drawingCtx.stroke();
    }
  }

  function draw(e) {
    if (!isDrawing || currentTool === 'none' || !currentStroke) return;

    const pageX = e.clientX + window.scrollX;
    const pageY = e.clientY + window.scrollY;

    if (currentTool === 'pencil' || currentTool === 'highlighter' || currentTool === 'eraser') {
      currentStroke.points.push({ x: pageX, y: pageY });

      drawingCtx.lineWidth = getEffectiveBrushSize();
      drawingCtx.lineCap = 'round';
      drawingCtx.lineJoin = 'round';

      if (currentTool === 'pencil') {
        drawingCtx.globalCompositeOperation = 'source-over';
        drawingCtx.globalAlpha = 1.0;
        drawingCtx.strokeStyle = currentColor;
      } else if (currentTool === 'highlighter') {
        drawingCtx.globalCompositeOperation = 'source-over';
        drawingCtx.globalAlpha = 0.45;
        drawingCtx.strokeStyle = currentColor;
      } else if (currentTool === 'eraser') {
        drawingCtx.globalCompositeOperation = 'destination-out';
        drawingCtx.globalAlpha = 1.0;
      }

      drawingCtx.beginPath();
      drawingCtx.moveTo(lastX, lastY);
      drawingCtx.lineTo(pageX, pageY);
      drawingCtx.stroke();

      lastX = pageX;
      lastY = pageY;
    } else {
      // Shape / Line / Arrow preview updates
      currentStroke.points[1] = { x: pageX, y: pageY };
    }
  }

  function stopDrawing() {
    if (isDrawing && currentStroke) {
      undoStack.push(currentStroke);
      redoStack = []; // Clear redo history
      updateUndoRedoButtons();
      redrawCanvas();
    }
    isDrawing = false;
    currentStroke = null;
  }

  function startLoop() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    function tick() {
      renderInteraction();
      animationFrameId = requestAnimationFrame(tick);
    }

    tick();
  }

  function renderInteraction() {
    if (!interactionCtx) return;

    interactionCtx.clearRect(0, 0, interactionCanvas.width, interactionCanvas.height);

    // 1. Draw Laser Trail
    if (laserPoints.length > 1) {
      laserPoints = laserPoints.filter(p => Date.now() - p.time < 800);
      const rgb = hexToRgb(currentColor);
      for (let i = 1; i < laserPoints.length; i++) {
        const p = laserPoints[i];
        const prev = laserPoints[i - 1];
        const age = Date.now() - p.time;
        const opacity = 1 - (age / 800);
        if (opacity <= 0) continue;

        interactionCtx.beginPath();
        interactionCtx.moveTo(prev.x, prev.y);
        interactionCtx.lineTo(p.x, p.y);
        interactionCtx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
        interactionCtx.lineWidth = brushSize * opacity;
        interactionCtx.lineCap = 'round';
        interactionCtx.lineJoin = 'round';
        interactionCtx.stroke();
      }
    }

    // 2. Draw Active Shape/Line Preview
    if (isDrawing && currentStroke && ['square', 'circle', 'line', 'arrow'].includes(currentTool)) {
      const start = currentStroke.points[0];
      const end = currentStroke.points[1] || start;
      const startViewport = { x: start.x - window.scrollX, y: start.y - window.scrollY };
      const endViewport = { x: end.x - window.scrollX, y: end.y - window.scrollY };
      const rgb = hexToRgb(currentColor);
      interactionCtx.lineWidth = currentStroke.size;
      interactionCtx.lineCap = 'round';
      interactionCtx.lineJoin = 'round';
      interactionCtx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1.0)`;
      interactionCtx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1.0)`;

      if (currentTool === 'square') {
        interactionCtx.beginPath();
        interactionCtx.rect(startViewport.x, startViewport.y, endViewport.x - startViewport.x, endViewport.y - startViewport.y);
        interactionCtx.stroke();
      } else if (currentTool === 'circle') {
        const rx = (endViewport.x - startViewport.x) / 2;
        const ry = (endViewport.y - startViewport.y) / 2;
        const cx = startViewport.x + rx;
        const cy = startViewport.y + ry;
        interactionCtx.beginPath();
        interactionCtx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, 2 * Math.PI);
        interactionCtx.stroke();
      } else if (currentTool === 'line') {
        interactionCtx.beginPath();
        interactionCtx.moveTo(startViewport.x, startViewport.y);
        interactionCtx.lineTo(endViewport.x, endViewport.y);
        interactionCtx.stroke();
      } else if (currentTool === 'arrow') {
        interactionCtx.beginPath();
        interactionCtx.moveTo(startViewport.x, startViewport.y);
        interactionCtx.lineTo(endViewport.x, endViewport.y);
        interactionCtx.stroke();

        const angle = Math.atan2(endViewport.y - startViewport.y, endViewport.x - startViewport.x);
        const arrowLength = Math.max(10, currentStroke.size * 2);
        interactionCtx.beginPath();
        interactionCtx.moveTo(endViewport.x, endViewport.y);
        interactionCtx.lineTo(endViewport.x - arrowLength * Math.cos(angle - Math.PI / 6), endViewport.y - arrowLength * Math.sin(angle - Math.PI / 6));
        interactionCtx.lineTo(endViewport.x - arrowLength * Math.cos(angle + Math.PI / 6), endViewport.y - arrowLength * Math.sin(angle + Math.PI / 6));
        interactionCtx.closePath();
        interactionCtx.fill();
      }
    }

    // 3. Draw Mouse Assist (Highlight or active Brush outline)
    if (currentTool !== 'none' && currentTool !== 'laser' && currentTool !== 'text' && currentTool !== 'magnifier') {
      interactionCtx.beginPath();
      interactionCtx.arc(cursorPos.x, cursorPos.y, getEffectiveBrushSize() / 2, 0, Math.PI * 2);
      
      interactionCtx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      interactionCtx.lineWidth = 2.5;
      interactionCtx.stroke();

      if (currentTool === 'eraser') {
        interactionCtx.strokeStyle = '#ffffff';
        interactionCtx.lineWidth = 1;
        interactionCtx.setLineDash([4, 4]);
        interactionCtx.stroke();
        interactionCtx.setLineDash([]);
      } else {
        const rgb = hexToRgb(currentColor);
        interactionCtx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`;
        interactionCtx.lineWidth = 1.25;
        interactionCtx.stroke();
      }
    } else if (showHighlight && !isDrawing && currentTool !== 'laser' && currentTool !== 'text' && currentTool !== 'magnifier') {
      // Standard Cursor Highlight Halo
      interactionCtx.beginPath();
      interactionCtx.arc(cursorPos.x, cursorPos.y, 25, 0, Math.PI * 2);
      const rgb = hexToRgb(currentColor);
      interactionCtx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`;
      interactionCtx.fill();

      interactionCtx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
      interactionCtx.lineWidth = 2.5;
      interactionCtx.stroke();

      interactionCtx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.65)`;
      interactionCtx.lineWidth = 1;
      interactionCtx.stroke();
    }

    // 5. Draw Magnifier Lens (Zoom effect)
    if (currentTool === 'magnifier') {
      const lensRadius = 100;
      const zoomFactor = 2.25;
      const x = cursorPos.x;
      const y = cursorPos.y;

      interactionCtx.save();
      
      // Create circular clipping path for the lens
      interactionCtx.beginPath();
      interactionCtx.arc(x, y, lensRadius, 0, Math.PI * 2);
      interactionCtx.clip();

      if (magnifierImageLoaded && magnifierImage) {
        const srcSize = (2 * lensRadius) / zoomFactor;
        const srcX = x - srcSize / 2;
        const srcY = y - srcSize / 2;
        const dpr = window.devicePixelRatio || 1;

        // Destination rect: center is (x, y), size is 2 * lensRadius
        const destX = x - lensRadius;
        const destY = y - lensRadius;
        const destSize = 2 * lensRadius;

        interactionCtx.drawImage(
          magnifierImage,
          srcX * dpr, srcY * dpr, srcSize * dpr, srcSize * dpr,
          destX, destY, destSize, destSize
        );
      } else {
        // Draw a dark premium backdrop with loading indicator
        interactionCtx.fillStyle = 'rgba(17, 24, 39, 0.95)';
        interactionCtx.fill();
        
        interactionCtx.fillStyle = '#ffffff';
        interactionCtx.font = "600 12px 'Outfit', sans-serif";
        interactionCtx.textAlign = 'center';
        interactionCtx.textBaseline = 'middle';
        interactionCtx.fillText('Loading Lens...', x, y);
      }
      interactionCtx.restore();

      // Shiny double-ring glass bezel
      interactionCtx.beginPath();
      interactionCtx.arc(x, y, lensRadius + 2, 0, Math.PI * 2);
      interactionCtx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      interactionCtx.lineWidth = 1;
      interactionCtx.stroke();

      interactionCtx.beginPath();
      interactionCtx.arc(x, y, lensRadius, 0, Math.PI * 2);
      interactionCtx.strokeStyle = '#ffffff';
      interactionCtx.lineWidth = 4;
      interactionCtx.stroke();

      interactionCtx.beginPath();
      interactionCtx.arc(x, y, lensRadius - 2, 0, Math.PI * 2);
      interactionCtx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
      interactionCtx.lineWidth = 1.5;
      interactionCtx.stroke();
    }

    // 4. Draw Ripples
    if (showClickRipple) {
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.radius += r.speed;
        r.alpha -= 0.03;

        if (r.alpha <= 0) {
          ripples.splice(i, 1);
          continue;
        }

        interactionCtx.beginPath();
        interactionCtx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        const rgb = hexToRgb(currentColor);
        interactionCtx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${r.alpha})`;
        interactionCtx.lineWidth = 2.5;
        interactionCtx.stroke();
      }
    }
  }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  function refreshMagnifierImage() {
    if (currentTool !== 'magnifier') return;
    magnifierImageLoaded = false;
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: "CAPTURE_ACTIVE_TAB" }, (response) => {
          if (chrome.runtime.lastError) return;
          if (response && response.dataUrl) {
            const img = new Image();
            img.onload = () => {
              magnifierImage = img;
              magnifierImageLoaded = true;
            };
            img.src = response.dataUrl;
          }
        });
      }
    } catch (err) {
      console.warn("[SR Overlay] Failed to capture active tab for magnifier:", err);
    }
  }

  function executeCapture() {
    if (!toolbarEl) return;
    
    toolbarEl.style.display = 'none';
    if (minimizedTrigger) minimizedTrigger.style.display = 'none';
    
    setTimeout(() => {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: "CAPTURE_ACTIVE_TAB" }, (response) => {
            toolbarEl.style.display = '';
            if (minimizedTrigger) {
              minimizedTrigger.style.display = '';
            }
            
            if (chrome.runtime.lastError) return;
            if (response && response.dataUrl) {
              const link = document.createElement('a');
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              link.download = `cappl_screenshot_${timestamp}.png`;
              link.href = response.dataUrl;
              if (shadowRoot) {
                shadowRoot.appendChild(link);
              } else {
                document.body.appendChild(link);
              }
              link.click();
              link.remove();
            }
          });
          return;
        }
      } catch (err) {
        console.warn("[SR Overlay] Failed to capture screen:", err);
      }
      
      // Fallback if chrome.runtime is not available
      toolbarEl.style.display = '';
      if (minimizedTrigger) {
        minimizedTrigger.style.display = '';
      }
    }, 100);
  }

  function updateCaptureButtonVisibility(isVisible) {
    if (!shadowRoot) return;
    const btn = shadowRoot.getElementById('sr-btn-capture');
    if (btn) {
      if (isVisible) {
        btn.classList.remove('sr-hidden');
      } else {
        btn.classList.add('sr-hidden');
      }
    }
  }

  function updateDrawingBarVisibility(isVisible) {
    showDrawingBar = isVisible;
    if (!toolbarEl) return;
    if (isVisible) {
      const isCollapsed = minimizedTrigger && !minimizedTrigger.classList.contains('sr-hidden');
      if (isCollapsed) {
        minimizedTrigger.classList.remove('sr-hidden');
        toolbarEl.classList.add('sr-hidden');
      } else {
        toolbarEl.classList.remove('sr-hidden');
        if (minimizedTrigger) minimizedTrigger.classList.add('sr-hidden');
        ensureElementInBounds(toolbarEl);
      }
    } else {
      toolbarEl.classList.add('sr-hidden');
      if (minimizedTrigger) minimizedTrigger.classList.add('sr-hidden');
    }
  }

  let scrollTimeout = null;
  function handleScrollThrottled() {
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(() => {
      scrollTimeout = null;
      refreshMagnifierImage();
    }, 100);
  }

  function selectTool(toolName, shouldBroadcast = true, isDirectSet = false) {
    console.log("[SR Overlay] selectTool called with toolName:", toolName, "shouldBroadcast:", shouldBroadcast, "isDirectSet:", isDirectSet, "currentTool was:", currentTool);
    // Clean up magnifier if switching away
    if (currentTool === 'magnifier') {
      window.removeEventListener('scroll', handleScrollThrottled);
      magnifierImage = null;
      magnifierImageLoaded = false;
      if (magnifierMoveTimeout) {
        clearTimeout(magnifierMoveTimeout);
        magnifierMoveTimeout = null;
      }
    }

    if (isDirectSet) {
      currentTool = toolName;
    } else {
      if (currentTool === toolName) {
        currentTool = 'none';
      } else {
        currentTool = toolName;
      }
    }

    // Initialize magnifier if switching to it
    if (currentTool === 'magnifier') {
      window.addEventListener('scroll', handleScrollThrottled);
      refreshMagnifierImage();
    }

    // Update active state on all tool buttons
    const allTools = ['pencil', 'highlighter', 'eraser', 'square', 'circle', 'line', 'arrow', 'laser', 'text', 'magnifier'];
    allTools.forEach(t => {
      const btn = shadowRoot.getElementById(`sr-btn-${t}`);
      if (btn) btn.classList.toggle('sr-active', currentTool === t);
    });

    if (currentTool === 'none' || currentTool === 'laser' || currentTool === 'magnifier') {
      interactionCanvas.style.pointerEvents = 'none';
      interactionCanvas.style.cursor = 'default';
      isDrawingMode = false;
      isDrawing = false;
    } else {
      interactionCanvas.style.pointerEvents = 'auto';
      isDrawingMode = true;
      if (currentTool === 'eraser') {
        interactionCanvas.style.cursor = 'cell';
      } else if (currentTool === 'text') {
        interactionCanvas.style.cursor = 'text';
      } else {
        interactionCanvas.style.cursor = 'crosshair';
      }
    }

    if (shouldBroadcast) {
      saveAndBroadcastSettings({ currentTool });
    }
  }

  function executeUndo() {
    if (undoStack.length === 0) return;
    const stroke = undoStack.pop();
    redoStack.push(stroke);
    redrawCanvas();
    updateUndoRedoButtons();
  }

  function executeRedo() {
    if (redoStack.length === 0) return;
    const stroke = redoStack.pop();
    undoStack.push(stroke);
    redrawCanvas();
    updateUndoRedoButtons();
  }

  function executeClear() {
    undoStack = [];
    redoStack = [];
    redrawCanvas();
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    const btnUndo = shadowRoot.getElementById('sr-btn-undo');
    const btnRedo = shadowRoot.getElementById('sr-btn-redo');
    if (!btnUndo || !btnRedo) return;

    if (undoStack.length === 0) {
      btnUndo.classList.add('sr-disabled');
      btnUndo.disabled = true;
    } else {
      btnUndo.classList.remove('sr-disabled');
      btnUndo.disabled = false;
    }

    if (redoStack.length === 0) {
      btnRedo.classList.add('sr-disabled');
      btnRedo.disabled = true;
    } else {
      btnRedo.classList.remove('sr-disabled');
      btnRedo.disabled = false;
    }
  }

  function createToolbar(parent) {
    toolbarEl = document.createElement('div');
    toolbarEl.className = 'sr-toolbar';
    toolbarEl.style.bottom = '30px';
    toolbarEl.style.right = '30px';

    // Drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'sr-drag-handle';
    dragHandle.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path d="M7 2a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM5 6a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM5 10a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM5 14a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
      </svg>
    `;
    toolbarEl.appendChild(dragHandle);

    // Highlight Toggle
    const btnHighlight = document.createElement('button');
    btnHighlight.className = 'sr-btn' + (showHighlight ? ' sr-active' : '');
    btnHighlight.id = 'sr-btn-highlight';
    btnHighlight.title = 'Toggle Cursor Highlight';
    btnHighlight.dataset.tooltip = 'Cursor Highlight';
    btnHighlight.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 12l4 8-2.5 1-1.5-3.5-3 3V3l11 11h-8z"/>
      </svg>
    `;
    btnHighlight.addEventListener('click', () => {
      showHighlight = !showHighlight;
      btnHighlight.classList.toggle('sr-active', showHighlight);
      saveAndBroadcastSettings({ showHighlight });
    });
    toolbarEl.appendChild(btnHighlight);

    // Ripple Toggle
    const btnRipple = document.createElement('button');
    btnRipple.className = 'sr-btn' + (showClickRipple ? ' sr-active' : '');
    btnRipple.id = 'sr-btn-ripple';
    btnRipple.title = 'Toggle Click Ripple';
    btnRipple.dataset.tooltip = 'Click Ripple';
    btnRipple.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3" />
        <circle cx="12" cy="12" r="7" stroke-opacity="0.6"/>
        <circle cx="12" cy="12" r="10" stroke-opacity="0.3"/>
      </svg>
    `;
    btnRipple.addEventListener('click', () => {
      showClickRipple = !showClickRipple;
      btnRipple.classList.toggle('sr-active', showClickRipple);
      saveAndBroadcastSettings({ showClickRipple });
    });
    toolbarEl.appendChild(btnRipple);

    // Microphone Toggle
    const btnMic = document.createElement('button');
    btnMic.className = 'sr-btn' + (isMicActive ? ' sr-active' : '');
    btnMic.id = 'sr-btn-mic';
    btnMic.title = 'Toggle Microphone';
    btnMic.dataset.tooltip = 'Microphone';
    btnMic.innerHTML = getMicIconHtml(isMicActive);
    btnMic.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: "TOGGLE_MIC_RUNTIME", enabled: !isMicActive }).catch(() => {});
    });
    toolbarEl.appendChild(btnMic);

    const divTools = document.createElement('div');
    divTools.className = 'sr-divider';
    toolbarEl.appendChild(divTools);

    // Pencil Tool
    const btnPencil = document.createElement('button');
    btnPencil.className = 'sr-btn';
    btnPencil.id = 'sr-btn-pencil';
    btnPencil.title = 'Pencil (Solid drawing)';
    btnPencil.dataset.tooltip = 'Pencil (Draw)';
    btnPencil.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    `;
    btnPencil.addEventListener('click', () => selectTool('pencil'));
    toolbarEl.appendChild(btnPencil);

    // Highlighter Tool
    const btnHighlighter = document.createElement('button');
    btnHighlighter.className = 'sr-btn';
    btnHighlighter.id = 'sr-btn-highlighter';
    btnHighlighter.title = 'Highlighter (Translucent marker)';
    btnHighlighter.dataset.tooltip = 'Highlighter';
    btnHighlighter.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        <path d="M5 17h10" stroke="currentColor" stroke-linecap="round" stroke-width="2.5" stroke-opacity="0.65" />
      </svg>
    `;
    btnHighlighter.addEventListener('click', () => selectTool('highlighter'));
    toolbarEl.appendChild(btnHighlighter);

    // Square Shape Tool
    const btnSquare = document.createElement('button');
    btnSquare.className = 'sr-btn';
    btnSquare.id = 'sr-btn-square';
    btnSquare.title = 'Square Shape';
    btnSquare.dataset.tooltip = 'Square';
    btnSquare.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    `;
    btnSquare.addEventListener('click', () => selectTool('square'));
    toolbarEl.appendChild(btnSquare);

    // Circle Shape Tool
    const btnCircle = document.createElement('button');
    btnCircle.className = 'sr-btn';
    btnCircle.id = 'sr-btn-circle';
    btnCircle.title = 'Circle Shape';
    btnCircle.dataset.tooltip = 'Circle';
    btnCircle.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" />
      </svg>
    `;
    btnCircle.addEventListener('click', () => selectTool('circle'));
    toolbarEl.appendChild(btnCircle);

    // Line Tool
    const btnLine = document.createElement('button');
    btnLine.className = 'sr-btn';
    btnLine.id = 'sr-btn-line';
    btnLine.title = 'Draw Line';
    btnLine.dataset.tooltip = 'Line';
    btnLine.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <line x1="5" y1="19" x2="19" y2="5" />
      </svg>
    `;
    btnLine.addEventListener('click', () => selectTool('line'));
    toolbarEl.appendChild(btnLine);

    // Arrow Tool
    const btnArrow = document.createElement('button');
    btnArrow.className = 'sr-btn';
    btnArrow.id = 'sr-btn-arrow';
    btnArrow.title = 'Draw Arrow';
    btnArrow.dataset.tooltip = 'Arrow';
    btnArrow.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
      </svg>
    `;
    btnArrow.addEventListener('click', () => selectTool('arrow'));
    toolbarEl.appendChild(btnArrow);

    // Laser Pointer Tool
    const btnLaser = document.createElement('button');
    btnLaser.className = 'sr-btn';
    btnLaser.id = 'sr-btn-laser';
    btnLaser.title = 'Laser Pointer';
    btnLaser.dataset.tooltip = 'Laser Pointer';
    btnLaser.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 21L21 9l-5.096-.813L9.813 15.904z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 3.5L20 4.5M14 3L15 4M19 8.5L20 9.5" />
      </svg>
    `;
    btnLaser.addEventListener('click', () => selectTool('laser'));
    toolbarEl.appendChild(btnLaser);

    // Screen Magnifier Tool
    const btnMagnifier = document.createElement('button');
    btnMagnifier.className = 'sr-btn';
    btnMagnifier.id = 'sr-btn-magnifier';
    btnMagnifier.title = 'Screen Magnifier (Zoom)';
    btnMagnifier.dataset.tooltip = 'Magnifier';
    btnMagnifier.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    `;
    btnMagnifier.addEventListener('click', () => selectTool('magnifier'));
    toolbarEl.appendChild(btnMagnifier);

    // Text Tool
    const btnText = document.createElement('button');
    btnText.className = 'sr-btn';
    btnText.id = 'sr-btn-text';
    btnText.title = 'Add Text';
    btnText.dataset.tooltip = 'Text';
    btnText.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M12 6v14m-5 0h10" />
      </svg>
    `;
    btnText.addEventListener('click', () => selectTool('text'));
    toolbarEl.appendChild(btnText);

    // Eraser Tool
    const btnEraser = document.createElement('button');
    btnEraser.className = 'sr-btn';
    btnEraser.id = 'sr-btn-eraser';
    btnEraser.title = 'Eraser';
    btnEraser.dataset.tooltip = 'Eraser';
    btnEraser.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 3L3 9l9 9h9V9L9 3z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 3l9 9M13 13l4-4" />
      </svg>
    `;
    btnEraser.addEventListener('click', () => selectTool('eraser'));
    toolbarEl.appendChild(btnEraser);

    const divColors = document.createElement('div');
    divColors.className = 'sr-divider';
    toolbarEl.appendChild(divColors);

    // Colors Palette
    const colorsContainer = document.createElement('div');
    colorsContainer.className = 'sr-colors';

    const colorsList = [
      { value: '#eab308', name: 'yellow' },
      { value: '#ef4444', name: 'red' },
      { value: '#3b82f6', name: 'blue' },
      { value: '#22c55e', name: 'green' }
    ];

    const isCustomColor = !colorsList.some(c => c.value === currentColor);

    // Custom Color Picker Button
    const customColorBtn = document.createElement('button');
    customColorBtn.className = 'sr-color-btn sr-color-custom' + (isCustomColor ? ' sr-selected' : '');
    customColorBtn.title = 'Custom Color Picker';
    customColorBtn.dataset.tooltip = 'Custom Color';
    if (isCustomColor) {
      customColorBtn.style.background = currentColor;
      customColorBtn.style.color = currentColor;
    } else {
      customColorBtn.style.background = 'linear-gradient(135deg, #ff0000, #00ff00, #0000ff)';
      customColorBtn.style.color = 'transparent';
    }
    customColorBtn.style.position = 'relative';
    customColorBtn.style.overflow = 'hidden';
    
    const colorPickerInput = document.createElement('input');
    colorPickerInput.type = 'color';
    colorPickerInput.value = currentColor;
    colorPickerInput.style.position = 'absolute';
    colorPickerInput.style.top = '0';
    colorPickerInput.style.left = '0';
    colorPickerInput.style.width = '100%';
    colorPickerInput.style.height = '100%';
    colorPickerInput.style.opacity = '0';
    colorPickerInput.style.cursor = 'pointer';
    colorPickerInput.style.border = 'none';
    colorPickerInput.style.padding = '0';
    colorPickerInput.style.margin = '0';
    customColorBtn.appendChild(colorPickerInput);

    const handleCustomColorChange = () => {
      currentColor = colorPickerInput.value;
      customColorBtn.style.background = currentColor;
      customColorBtn.style.color = currentColor;
      
      colorsContainer.querySelectorAll('.sr-color-btn').forEach(btn => btn.classList.remove('sr-selected'));
      customColorBtn.classList.add('sr-selected');

      saveAndBroadcastSettings({ currentColor });
    };

    colorPickerInput.addEventListener('input', handleCustomColorChange);
    colorPickerInput.addEventListener('change', handleCustomColorChange);

    colorsList.forEach((color) => {
      const colorBtn = document.createElement('button');
      const isSelected = currentColor === color.value;
      colorBtn.className = `sr-color-btn sr-color-${color.name}` + (isSelected ? ' sr-selected' : '');
      colorBtn.style.backgroundColor = color.value;
      colorBtn.title = `Switch color to ${color.name}`;
      colorBtn.dataset.tooltip = color.name.charAt(0).toUpperCase() + color.name.slice(1);
      colorBtn.addEventListener('click', () => {
        currentColor = color.value;
        colorsContainer.querySelectorAll('.sr-color-btn').forEach(btn => btn.classList.remove('sr-selected'));
        colorBtn.classList.add('sr-selected');
        
        // Reset custom color button back to rainbow gradient
        customColorBtn.style.background = 'linear-gradient(135deg, #ff0000, #00ff00, #0000ff)';
        customColorBtn.style.color = 'transparent';

        saveAndBroadcastSettings({ currentColor });
      });
      colorsContainer.appendChild(colorBtn);
    });

    colorsContainer.appendChild(customColorBtn);
    toolbarEl.appendChild(colorsContainer);

    const divSizes = document.createElement('div');
    divSizes.className = 'sr-divider';
    toolbarEl.appendChild(divSizes);

    // Size cycle selector
    const sizesContainer = document.createElement('div');
    sizesContainer.className = 'sr-sizes';

    const sizesList = [
      { value: 4, name: 'small', title: 'Thin brush' },
      { value: 8, name: 'medium', title: 'Medium brush' },
      { value: 12, name: 'large', title: 'Thick brush' }
    ];

    sizesList.forEach(size => {
      const sizeBtn = document.createElement('button');
      const isSelected = brushSize === size.value;
      sizeBtn.className = `sr-size-btn sr-size-${size.name}` + (isSelected ? ' sr-selected' : '');
      sizeBtn.title = size.title;
      sizeBtn.dataset.tooltip = size.title;

      const dot = document.createElement('span');
      dot.className = 'sr-size-dot';
      dot.style.width = `${size.value}px`;
      dot.style.height = `${size.value}px`;

      sizeBtn.appendChild(dot);
      sizeBtn.addEventListener('click', () => {
        brushSize = size.value;
        sizesContainer.querySelectorAll('.sr-size-btn').forEach(btn => btn.classList.remove('sr-selected'));
        sizeBtn.classList.add('sr-selected');

        saveAndBroadcastSettings({ brushSize });
      });
      sizesContainer.appendChild(sizeBtn);
    });
    toolbarEl.appendChild(sizesContainer);

    const divHistory = document.createElement('div');
    divHistory.className = 'sr-divider';
    toolbarEl.appendChild(divHistory);

    // Undo Button
    const btnUndo = document.createElement('button');
    btnUndo.className = 'sr-btn sr-disabled';
    btnUndo.id = 'sr-btn-undo';
    btnUndo.title = 'Undo last action';
    btnUndo.dataset.tooltip = 'Undo';
    btnUndo.disabled = true;
    btnUndo.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
      </svg>
    `;
    btnUndo.addEventListener('click', executeUndo);
    toolbarEl.appendChild(btnUndo);

    // Redo Button
    const btnRedo = document.createElement('button');
    btnRedo.className = 'sr-btn sr-disabled';
    btnRedo.id = 'sr-btn-redo';
    btnRedo.title = 'Redo last action';
    btnRedo.dataset.tooltip = 'Redo';
    btnRedo.disabled = true;
    btnRedo.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
      </svg>
    `;
    btnRedo.addEventListener('click', executeRedo);
    toolbarEl.appendChild(btnRedo);

    // Capture Button
    const btnCapture = document.createElement('button');
    btnCapture.className = 'sr-btn';
    btnCapture.id = 'sr-btn-capture';
    btnCapture.title = 'Capture screen image';
    btnCapture.dataset.tooltip = 'Capture Image';
    btnCapture.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    `;
    btnCapture.addEventListener('click', executeCapture);
    toolbarEl.appendChild(btnCapture);

    // Clear Button
    const btnClear = document.createElement('button');
    btnClear.className = 'sr-btn sr-btn-clear';
    btnClear.id = 'sr-btn-clear';
    btnClear.title = 'Clear all drawings';
    btnClear.dataset.tooltip = 'Clear All';
    btnClear.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    `;
    btnClear.addEventListener('click', executeClear);
    toolbarEl.appendChild(btnClear);

    // Minimize Button
    const btnCollapse = document.createElement('button');
    btnCollapse.className = 'sr-btn sr-btn-collapse';
    btnCollapse.id = 'sr-btn-collapse';
    btnCollapse.title = 'Minimize toolbar';
    btnCollapse.dataset.tooltip = 'Minimize';
    btnCollapse.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 12H5" />
      </svg>
    `;
    toolbarEl.appendChild(btnCollapse);


    // Minimized Floating Trigger Button
    minimizedTrigger = document.createElement('button');
    minimizedTrigger.className = 'sr-minimized-trigger sr-hidden';
    minimizedTrigger.title = 'Expand drawing tools';
    minimizedTrigger.dataset.tooltip = 'Expand Tools';
    minimizedTrigger.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    `;
    parent.appendChild(minimizedTrigger);

    btnCollapse.addEventListener('click', () => {
      toolbarEl.classList.add('sr-hidden');
      minimizedTrigger.classList.remove('sr-hidden');
    });

    let startX = 0;
    let startY = 0;
    minimizedTrigger.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      startY = e.clientY;
    });

    minimizedTrigger.addEventListener('mouseup', (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      minimizedTrigger.classList.add('sr-hidden');
      toolbarEl.classList.remove('sr-hidden');
      if (toolbarEl.style.top) {
        ensureElementInBounds(toolbarEl);
      }
    });

    makeDraggable(toolbarEl, dragHandle);

    parent.appendChild(toolbarEl);
  }

  function ensureElementInBounds(element) {
    const isHidden = element.classList.contains('sr-hidden');
    if (isHidden) {
      element.classList.remove('sr-hidden');
    }

    const width = element.offsetWidth;
    const height = element.offsetHeight;

    if (isHidden) {
      element.classList.add('sr-hidden');
    }

    let currentTop = parseFloat(element.style.top);
    let currentLeft = parseFloat(element.style.left);

    if (isNaN(currentTop)) currentTop = element.offsetTop;
    if (isNaN(currentLeft)) currentLeft = element.offsetLeft;

    const maxTop = window.innerHeight - height - 10;
    const maxLeft = window.innerWidth - width - 10;

    const boundedTop = Math.max(10, Math.min(currentTop, maxTop));
    const boundedLeft = Math.max(10, Math.min(currentLeft, maxLeft));

    element.style.top = boundedTop + "px";
    element.style.left = boundedLeft + "px";
    element.style.bottom = "auto";
    element.style.right = "auto";
  }

  function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;

      const newTop = element.offsetTop - pos2;
      const newLeft = element.offsetLeft - pos1;

      // Keep inside bounds
      const maxTop = window.innerHeight - element.offsetHeight - 10;
      const maxLeft = window.innerWidth - element.offsetWidth - 10;

      const boundedTop = Math.max(10, Math.min(newTop, maxTop));
      const boundedLeft = Math.max(10, Math.min(newLeft, maxLeft));

      element.style.top = boundedTop + "px";
      element.style.left = boundedLeft + "px";
      element.style.bottom = "auto";
      element.style.right = "auto";

      if (typeof positionSettingsPanel === 'function') {
        positionSettingsPanel();
      }
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  function updateToolbarButtonVisibility(toolId, isVisible) {
    if (!shadowRoot) return;
    const btn = shadowRoot.getElementById(`sr-btn-${toolId}`);
    if (btn) {
      if (isVisible) {
        btn.classList.remove('sr-hidden');
      } else {
        btn.classList.add('sr-hidden');
      }
    }
  }

  function applyInitialToolVisibility() {
    const tools = ['highlight', 'ripple', 'mic', 'pencil', 'highlighter', 'square', 'circle', 'line', 'arrow', 'laser', 'magnifier', 'text', 'eraser', 'clear', 'undo', 'redo'];
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get({ toolVisibility: {} }, (res) => {
          const visibility = res.toolVisibility || {};
          tools.forEach(toolId => {
            const isVisible = visibility[toolId] !== false;
            updateToolbarButtonVisibility(toolId, isVisible);
          });
        });
        return;
      }
    } catch (err) {
      console.warn("[SR Overlay] Failed to load initial tool visibility:", err);
    }

    // Fallback: show all tools by default
    tools.forEach(toolId => {
      updateToolbarButtonVisibility(toolId, true);
    });
  }

  function getShadowStyles() {
    return `
      .sr-overlay-container {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        font-family: 'Outfit', sans-serif;
        pointer-events: none;
      }

      .sr-canvas {
        margin: 0;
        padding: 0;
      }

      .sr-drawing-canvas {
        position: absolute;
        top: 0;
        left: 0;
        z-index: 1;
        pointer-events: none;
      }

      .sr-interaction-canvas {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 2;
        pointer-events: none;
      }

      .sr-toolbar {
        position: fixed;
        z-index: 100;
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(17, 24, 39, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 9999px;
        padding: 8px 14px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
        pointer-events: auto;
        user-select: none;
        transition: opacity 0.3s ease, transform 0.3s ease;
      }

      .sr-drag-handle {
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: move;
        color: #6b7280;
        padding: 0 4px;
        transition: color 0.2s;
      }

      .sr-drag-handle:hover {
        color: #9ca3af;
      }

      .sr-drag-handle svg {
        width: 14px;
        height: 14px;
      }

      .sr-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: transparent;
        border: none;
        color: #9ca3af;
        cursor: pointer;
        outline: none;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .sr-btn svg {
        width: 18px;
        height: 18px;
      }

      .sr-btn:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.08);
        transform: scale(1.08);
      }

      .sr-btn:active {
        transform: scale(0.95);
      }

      .sr-btn.sr-active {
        color: #818cf8;
        background: rgba(99, 102, 241, 0.15);
        border: 1px solid rgba(99, 102, 241, 0.25);
        box-shadow: 0 0 12px rgba(99, 102, 241, 0.3);
      }

      .sr-btn:disabled,
      .sr-btn.sr-disabled {
        opacity: 0.35;
        cursor: not-allowed;
        pointer-events: none;
      }

      .sr-divider {
        width: 1px;
        height: 20px;
        background: rgba(255, 255, 255, 0.1);
        margin: 0 4px;
      }

      .sr-colors {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .sr-color-btn {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: 2px solid transparent;
        cursor: pointer;
        padding: 0;
        transition: all 0.2s;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3);
      }

      .sr-color-btn:hover {
        transform: scale(1.2);
      }

      .sr-color-btn.sr-selected {
        transform: scale(1.2);
        border-color: #ffffff;
        box-shadow: 0 0 8px currentColor;
      }

      .sr-color-btn.sr-color-custom {
        position: relative;
        background: linear-gradient(135deg, #ff0000, #00ff00, #0000ff);
      }

      .sr-sizes {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .sr-size-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 4px;
        background: transparent;
        border: 1px solid transparent;
        cursor: pointer;
        padding: 0;
        transition: all 0.2s;
      }

      .sr-size-btn:hover {
        background: rgba(255, 255, 255, 0.05);
      }

      .sr-size-btn.sr-selected {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.2);
      }

      .sr-size-dot {
        background-color: #9ca3af;
        border-radius: 50%;
        display: inline-block;
        transition: background-color 0.2s;
      }

      .sr-size-btn:hover .sr-size-dot,
      .sr-size-btn.sr-selected .sr-size-dot {
        background-color: #ffffff;
      }

      .sr-btn-clear:hover,
      .sr-btn-close-bar:hover {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.1);
      }

      .sr-btn-collapse {
        color: #6b7280;
      }

      .sr-minimized-trigger {
        position: fixed !important;
        z-index: 2147483647;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 48px;
        border-radius: 0 12px 12px 0;
        background: rgba(17, 24, 39, 0.35);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1.5px solid rgba(167, 139, 250, 0.4);
        border-left: none;
        color: #a78bfa;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25), 0 0 12px rgba(167, 139, 250, 0.15);
        pointer-events: auto;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        padding-left: 2px;
      }

      .sr-minimized-trigger:hover {
        transform: translateY(-50%) scale(1.08);
        background: rgba(17, 24, 39, 0.55);
        color: #22d3ee;
        border-color: rgba(34, 211, 238, 0.6);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35), 0 0 15px rgba(34, 211, 238, 0.3);
      }

      .sr-minimized-trigger svg {
        width: 22px;
        height: 22px;
        filter: drop-shadow(0 0 4px rgba(167, 139, 250, 0.3));
        transition: filter 0.3s;
      }

      .sr-minimized-trigger:hover svg {
        filter: drop-shadow(0 0 6px rgba(34, 211, 238, 0.5));
      }

      .sr-hidden {
        display: none !important;
      }

      /* Premium Hover Tooltips */
      .sr-btn,
      .sr-color-btn,
      .sr-size-btn {
        position: relative;
      }

      .sr-btn::after,
      .sr-color-btn::after,
      .sr-size-btn::after,
      .sr-minimized-trigger::after {
        content: attr(data-tooltip);
        position: absolute;
        bottom: 135%;
        left: 50%;
        transform: translateX(-50%) translateY(4px);
        background: rgba(15, 23, 42, 0.95);
        color: #f8fafc;
        font-size: 11px;
        font-weight: 500;
        padding: 5px 9px;
        border-radius: 6px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.08);
        z-index: 1000;
      }

      .sr-btn:hover::after,
      .sr-color-btn:hover::after,
      .sr-size-btn:hover::after {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      /* Tooltip override for minimized trigger stuck to left edge */
      .sr-minimized-trigger::after {
        bottom: auto;
        left: 125%;
        top: 50%;
        transform: translateY(-50%) translateX(-6px);
      }

      .sr-minimized-trigger:hover::after {
        opacity: 1;
        transform: translateY(-50%) translateX(0);
      }
    `;
  }

  // QUERY INITIAL STATE
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "GET_RECORDING_STATE" }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response) {
          isRecording = response.isRecording;
          const displaySurface = response.displaySurface || "browser";
          if (isRecording && displaySurface === "browser") {
            initOverlay();
          }
        }
      });
    }
  } catch (err) {
    console.warn("[SR Overlay] Failed to query initial state:", err);
  }

  // STATE CHANGE BROADCAST LISTENER
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.type === "STATE_CHANGED") {
          isRecording = message.isRecording;
          const displaySurface = message.displaySurface || "browser";
          if (isRecording && displaySurface === "browser") {
            initOverlay();
          } else {
            removeOverlay();
          }
        } else if (message.type === "TOOL_VISIBILITY_CHANGED") {
          if (typeof updateToolbarButtonVisibility === 'function') {
            updateToolbarButtonVisibility(message.toolId, message.isVisible);
          }
        } else if (message.type === "ALL_TOOLS_VISIBILITY_CHANGED") {
          if (typeof updateToolbarButtonVisibility === 'function') {
            Object.keys(message.visibility).forEach(toolId => {
              updateToolbarButtonVisibility(toolId, message.visibility[toolId]);
            });
          }
        } else if (message.type === "MIC_TOGGLE_FAILED") {
          isMicActive = false;
          hideMicPermissionModal();
          const btnMic = shadowRoot ? shadowRoot.getElementById('sr-btn-mic') : null;
          if (btnMic) {
            btnMic.classList.remove('sr-active');
            btnMic.innerHTML = getMicIconHtml(false);
          }
          alert("Microphone access failed: " + (message.error || "Permission denied"));
        } else if (message.type === "MIC_PERMISSION_REQUESTED") {
          showMicPermissionModal();
        } else if (message.type === "MIC_STATUS_CHANGED") {
          isMicActive = !!message.enabled;
          hideMicPermissionModal();
          const btnMic = shadowRoot ? shadowRoot.getElementById('sr-btn-mic') : null;
          if (btnMic) {
            btnMic.classList.toggle('sr-active', isMicActive);
            btnMic.innerHTML = getMicIconHtml(isMicActive);
          }
          if (!isMicActive && message.error) {
            alert("Microphone access failed: " + message.error);
          }
        } else if (message.type === "SETTINGS_CHANGED") {
          if (message.showHighlight !== undefined) {
            showHighlight = message.showHighlight;
          }
          if (message.showClickRipple !== undefined) {
            showClickRipple = message.showClickRipple;
          }
          if (message.showCaptureBtn !== undefined) {
            showCaptureBtn = message.showCaptureBtn;
          }
          if (message.showDrawingBar !== undefined) {
            showDrawingBar = message.showDrawingBar;
            if (typeof updateDrawingBarVisibility === 'function') {
              updateDrawingBarVisibility(showDrawingBar);
            }
          }
          if (message.currentColor !== undefined) {
            currentColor = message.currentColor;
          }
          if (message.brushSize !== undefined) {
            brushSize = message.brushSize;
          }
          if (message.currentTool !== undefined) {
            if (currentTool !== message.currentTool) {
              selectTool(message.currentTool, false, true);
            }
          }
          if (typeof updateToolbarUI === 'function') {
            updateToolbarUI();
          }
        }
      });
    }
  } catch (err) {
    console.warn("[SR Overlay] Failed to register message listener:", err);
  }
})();
