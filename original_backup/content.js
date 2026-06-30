(function() {
  if (window.hasScreenRecorderOverlay) {
    // Already injected, check current state and initialize overlay if recording
    chrome.runtime.sendMessage({ type: "GET_RECORDING_STATE" }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response && response.isRecording) {
        if (window.srInitOverlay) window.srInitOverlay();
      }
    });
    return;
  }
  window.hasScreenRecorderOverlay = true;

  let isRecording = false;
  let showHighlight = true;
  let showClickRipple = true;
  let currentTool = 'none'; // 'none', 'pencil', 'highlighter', 'eraser'
  let isDrawingMode = false;
  let currentColor = '#eab308'; // Default yellow
  let brushSize = 8; // Default medium preset
  let isDrawing = false;
  let cursorPos = { x: 0, y: 0 };
  let ripples = [];
  let lastX = 0;
  let lastY = 0;
  let animationFrameId = null;

  // History stacks for Undo / Redo
  let undoStack = [];
  let redoStack = [];
  let currentStroke = null;

  let shadowRoot = null;
  let overlayHost = null;
  let drawingCanvas = null;
  let interactionCanvas = null;
  let drawingCtx = null;
  let interactionCtx = null;
  let toolbarEl = null;

  function getEffectiveBrushSize() {
    if (currentTool === 'pencil') return brushSize;
    if (currentTool === 'highlighter') return brushSize * 2.5;
    if (currentTool === 'eraser') return brushSize * 4;
    return brushSize;
  }

  function initOverlay() {
    if (overlayHost) return; // Already initialized

    // Create the host element for Shadow DOM
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

    // Create Drawing Canvas
    drawingCanvas = document.createElement('canvas');
    drawingCanvas.className = 'sr-canvas sr-drawing-canvas';
    container.appendChild(drawingCanvas);
    drawingCtx = drawingCanvas.getContext('2d');

    // Create Interaction Canvas (Mouse Highlight, Ripples)
    interactionCanvas = document.createElement('canvas');
    interactionCanvas.className = 'sr-canvas sr-interaction-canvas';
    container.appendChild(interactionCanvas);
    interactionCtx = interactionCanvas.getContext('2d');

    resizeCanvases();
    createToolbar(container);
    setupEvents();
    startLoop();
  }

  function removeOverlay() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    window.removeEventListener('resize', resizeCanvases);
    document.removeEventListener('mousemove', handleMouseMoveGlobal);
    document.removeEventListener('mousedown', handleMouseDownGlobal);

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
    }
  }

  // Expose functions for subsequent script runs
  window.srInitOverlay = initOverlay;
  window.srRemoveOverlay = removeOverlay;

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
      if (stroke.points.length === 0) return;

      drawingCtx.lineWidth = stroke.size;
      drawingCtx.lineCap = 'round';
      drawingCtx.lineJoin = 'round';

      if (stroke.tool === 'pencil') {
        drawingCtx.globalCompositeOperation = 'source-over';
        drawingCtx.globalAlpha = 1.0;
        drawingCtx.strokeStyle = stroke.color;
      } else if (stroke.tool === 'highlighter') {
        drawingCtx.globalCompositeOperation = 'source-over';
        drawingCtx.globalAlpha = 0.45;
        drawingCtx.strokeStyle = stroke.color;
      } else if (stroke.tool === 'eraser') {
        drawingCtx.globalCompositeOperation = 'destination-out';
        drawingCtx.globalAlpha = 1.0;
      }

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

    drawingCanvas.width = window.innerWidth;
    drawingCanvas.height = window.innerHeight;
    interactionCanvas.width = window.innerWidth;
    interactionCanvas.height = window.innerHeight;

    redrawCanvas();
  }

  function setupEvents() {
    window.addEventListener('resize', resizeCanvases);
    document.addEventListener('mousemove', handleMouseMoveGlobal);
    document.addEventListener('mousedown', handleMouseDownGlobal);

    // Canvas drawing mouse events
    interactionCanvas.addEventListener('mousedown', startDrawing);
    interactionCanvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDrawing);

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
  }

  function startDrawing(e) {
    if (currentTool === 'none') return;
    isDrawing = true;
    lastX = e.clientX;
    lastY = e.clientY;

    currentStroke = {
      tool: currentTool,
      color: currentColor,
      size: getEffectiveBrushSize(),
      points: [{ x: lastX, y: lastY }]
    };

    // Draw single dot on click immediately
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

  function draw(e) {
    if (!isDrawing || currentTool === 'none' || !currentStroke) return;

    currentStroke.points.push({ x: e.clientX, y: e.clientY });

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
    drawingCtx.lineTo(e.clientX, e.clientY);
    drawingCtx.stroke();

    lastX = e.clientX;
    lastY = e.clientY;
  }

  function stopDrawing() {
    if (isDrawing && currentStroke) {
      undoStack.push(currentStroke);
      redoStack = []; // Clear redo history
      updateUndoRedoButtons();
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

    // 1. Draw Mouse Assist (Highlight or active Brush outline)
    if (currentTool !== 'none') {
      // Active brush/eraser outline (Double circle for visibility on all backgrounds)
      interactionCtx.beginPath();
      interactionCtx.arc(cursorPos.x, cursorPos.y, getEffectiveBrushSize() / 2, 0, Math.PI * 2);
      
      // Black outer outline for contrast
      interactionCtx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      interactionCtx.lineWidth = 2.5;
      interactionCtx.stroke();

      if (currentTool === 'eraser') {
        // White dashed circle
        interactionCtx.strokeStyle = '#ffffff';
        interactionCtx.lineWidth = 1;
        interactionCtx.setLineDash([4, 4]);
        interactionCtx.stroke();
        interactionCtx.setLineDash([]);
      } else {
        // Inner colored solid circle
        const rgb = hexToRgb(currentColor);
        interactionCtx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`;
        interactionCtx.lineWidth = 1.25;
        interactionCtx.stroke();
      }
    } else if (showHighlight && !isDrawing) {
      // Standard Cursor Highlight Halo
      interactionCtx.beginPath();
      interactionCtx.arc(cursorPos.x, cursorPos.y, 25, 0, Math.PI * 2);
      const rgb = hexToRgb(currentColor);
      interactionCtx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`;
      interactionCtx.fill();

      // Dual ring for halo
      interactionCtx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
      interactionCtx.lineWidth = 2.5;
      interactionCtx.stroke();

      interactionCtx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.65)`;
      interactionCtx.lineWidth = 1;
      interactionCtx.stroke();
    }

    // 2. Draw Ripples
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

  function selectTool(toolName) {
    const btnPencil = shadowRoot.getElementById('sr-btn-pencil');
    const btnHighlighter = shadowRoot.getElementById('sr-btn-highlighter');
    const btnEraser = shadowRoot.getElementById('sr-btn-eraser');

    if (currentTool === toolName) {
      currentTool = 'none';
    } else {
      currentTool = toolName;
    }

    btnPencil.classList.toggle('sr-active', currentTool === 'pencil');
    btnHighlighter.classList.toggle('sr-active', currentTool === 'highlighter');
    btnEraser.classList.toggle('sr-active', currentTool === 'eraser');

    if (currentTool === 'none') {
      interactionCanvas.style.pointerEvents = 'none';
      interactionCanvas.style.cursor = 'default';
      isDrawingMode = false;
      isDrawing = false;
    } else {
      interactionCanvas.style.pointerEvents = 'auto';
      isDrawingMode = true;
      if (currentTool === 'eraser') {
        interactionCanvas.style.cursor = 'cell';
      } else {
        interactionCanvas.style.cursor = 'crosshair';
      }
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
    btnHighlight.className = 'sr-btn sr-active';
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
    });
    toolbarEl.appendChild(btnHighlight);

    // Ripple Toggle
    const btnRipple = document.createElement('button');
    btnRipple.className = 'sr-btn sr-active';
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
    });
    toolbarEl.appendChild(btnRipple);

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

    colorsList.forEach((color, idx) => {
      const colorBtn = document.createElement('button');
      colorBtn.className = `sr-color-btn sr-color-${color.name}` + (idx === 0 ? ' sr-selected' : '');
      colorBtn.style.backgroundColor = color.value;
      colorBtn.title = `Switch color to ${color.name}`;
      colorBtn.dataset.tooltip = color.name.charAt(0).toUpperCase() + color.name.slice(1);
      colorBtn.addEventListener('click', () => {
        currentColor = color.value;
        colorsContainer.querySelectorAll('.sr-color-btn').forEach(btn => btn.classList.remove('sr-selected'));
        colorBtn.classList.add('sr-selected');
      });
      colorsContainer.appendChild(colorBtn);
    });
    toolbarEl.appendChild(colorsContainer);

    const divSizes = document.createElement('div');
    divSizes.className = 'sr-divider';
    toolbarEl.appendChild(divSizes);

    // Size cycle selector
    const sizesContainer = document.createElement('div');
    sizesContainer.className = 'sr-sizes';

    const sizesList = [
      { value: 4, name: 'small', title: 'Thin brush' },
      { value: 8, name: 'medium', title: 'Medium brush', selected: true },
      { value: 12, name: 'large', title: 'Thick brush' }
    ];

    sizesList.forEach(size => {
      const sizeBtn = document.createElement('button');
      sizeBtn.className = `sr-size-btn sr-size-${size.name}` + (size.selected ? ' sr-selected' : '');
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

    // Clear Button
    const btnClear = document.createElement('button');
    btnClear.className = 'sr-btn sr-btn-clear';
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
    btnCollapse.title = 'Minimize toolbar';
    btnCollapse.dataset.tooltip = 'Minimize';
    btnCollapse.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 12H5" />
      </svg>
    `;
    toolbarEl.appendChild(btnCollapse);

    // Minimized Floating Trigger Button
    const minimizedTrigger = document.createElement('button');
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
      minimizedTrigger.style.bottom = toolbarEl.style.bottom;
      minimizedTrigger.style.right = toolbarEl.style.right;
      minimizedTrigger.style.top = toolbarEl.style.top;
      minimizedTrigger.style.left = toolbarEl.style.left;
    });

    minimizedTrigger.addEventListener('click', () => {
      minimizedTrigger.classList.add('sr-hidden');
      toolbarEl.classList.remove('sr-hidden');
      toolbarEl.style.bottom = minimizedTrigger.style.bottom;
      toolbarEl.style.right = minimizedTrigger.style.right;
      toolbarEl.style.top = minimizedTrigger.style.top;
      toolbarEl.style.left = minimizedTrigger.style.left;
    });

    makeDraggable(toolbarEl, dragHandle);
    makeDraggable(minimizedTrigger, minimizedTrigger);

    parent.appendChild(toolbarEl);
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
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
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
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        margin: 0;
        padding: 0;
      }

      .sr-drawing-canvas {
        z-index: 1;
      }

      .sr-interaction-canvas {
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

      .sr-btn-clear:hover {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.1);
      }

      .sr-btn-collapse {
        color: #6b7280;
      }

      .sr-minimized-trigger {
        position: fixed;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        border-radius: 50%;
        background: rgba(17, 24, 39, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #a78bfa;
        cursor: pointer;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4), 0 0 12px rgba(167, 139, 250, 0.2);
        pointer-events: auto;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .sr-minimized-trigger:hover {
        transform: scale(1.1);
        color: #c084fc;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4), 0 0 20px rgba(167, 139, 250, 0.4);
      }

      .sr-minimized-trigger svg {
        width: 22px;
        height: 22px;
      }

      .sr-hidden {
        display: none !important;
      }

      /* Premium Hover Tooltips */
      .sr-btn,
      .sr-color-btn,
      .sr-size-btn,
      .sr-minimized-trigger {
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
      .sr-size-btn:hover::after,
      .sr-minimized-trigger:hover::after {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    `;
  }

  // QUERY INITIAL STATE
  chrome.runtime.sendMessage({ type: "GET_RECORDING_STATE" }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response) {
      isRecording = response.isRecording;
      if (isRecording) {
        initOverlay();
      }
    }
  });

  // STATE CHANGE BROADCAST LISTENER
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "STATE_CHANGED") {
      isRecording = message.isRecording;
      if (isRecording) {
        initOverlay();
      } else {
        removeOverlay();
      }
    }
  });
})();
