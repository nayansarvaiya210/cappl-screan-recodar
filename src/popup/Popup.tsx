import { useState, useEffect } from 'react';

export default function Popup() {
  const [isRecording, setIsRecording] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Handle CSS body height change when settings modal is open
  useEffect(() => {
    if (showSettings) {
      document.body.classList.add("settings-active");
    } else {
      document.body.classList.remove("settings-active");
    }
  }, [showSettings]);

  // Fetch initial recording state on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_RECORDING_STATE" }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("Could not get initial state:", chrome.runtime.lastError);
        return;
      }
      if (response) {
        setIsRecording(response.isRecording);
        setStartTime(response.startTime);
      }
    });

    // Listen for state change broadcasts from background
    const handleMessage = (message: any) => {
      if (message.type === "STATE_CHANGED") {
        setIsRecording(message.isRecording);
        setStartTime(message.startTime);
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  // Update timer interval when recording is active
  useEffect(() => {
    if (!isRecording || !startTime) {
      setElapsed(0);
      return;
    }

    // Set initial elapsed time
    setElapsed(Date.now() - startTime);

    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording, startTime]);

  // Handle CSS body height change when help modal is open
  useEffect(() => {
    if (showHelp) {
      document.body.classList.add("help-active");
    } else {
      document.body.classList.remove("help-active");
    }
  }, [showHelp]);

  const handleStart = () => {
    chrome.runtime.sendMessage({ type: "START_RECORDING" });
  };

  const handleStop = () => {
    chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="popup-container">
      <header>
        <div className="header-left">
          <div className="logo-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h14.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </div>
          <h1 className="gradient-title">Cappl Recorder</h1>
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button id="btn-settings" className="btn-help" title="Settings" onClick={() => setShowSettings(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button id="btn-help" className="btn-help" title="How to Use" onClick={() => setShowHelp(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </button>
        </div>
      </header>

      <main>
        {!isRecording ? (
          /* Idle State */
          <div id="state-idle" className="state-container">
            <p className="description">
              Record your screen with real-time drawings, highlights, cursor halos, and interactive click ripple effects.
            </p>
            <button id="start" className="btn-primary" onClick={handleStart}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
              Start Recording
            </button>
          </div>
        ) : (
          /* Recording State */
          <div id="state-recording" className="state-container">
            <div className="timer-card">
              <div className="indicator-container">
                <span className="pulse-dot"></span>
                <span className="status-text">Recording</span>
              </div>
              <div id="timer">{formatTime(elapsed)}</div>
            </div>
            <button id="stop" className="btn-danger" onClick={handleStop}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9A2.25 2.25 0 015.25 16.5v-9z" />
              </svg>
              Stop Recording
            </button>
          </div>
        )}
      </main>

      {/* Help / Guide Modal Overlay */}
      {showHelp && (
        <div id="help-modal" className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>How to use Cappl</h2>
              <button id="btn-close-help" className="btn-close" onClick={() => setShowHelp(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="guide-step">
                <span className="step-num">1</span>
                <div>
                  <h3>Start Recording</h3>
                  <p>Click "Start Recording" and choose your Screen, Window, or Chrome Tab.</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="step-num">2</span>
                <div>
                  <h3>Use Drawing Tools</h3>
                  <p>Select Pencil or Highlighter to draw. Customize color and brush size.</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="step-num">3</span>
                <div>
                  <h3>Mouse Enhancements</h3>
                  <p>Toggle Cursor Highlight and Click Ripples to emphasize actions dynamically.</p>
                </div>
              </div>
              <div className="guide-step">
                <span className="step-num">4</span>
                <div>
                  <h3>Stop & Save</h3>
                  <p>Click "Stop Recording" to open the video preview tab and save your video.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Settings Modal Overlay */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} isRecording={isRecording} />
      )}
    </div>
  );
}

function SettingsModal({ onClose, isRecording }: { onClose: () => void, isRecording: boolean }) {
  const [autoDownload, setAutoDownload] = useState(true);
  const [recordMic, setRecordMic] = useState(false);
  const [expandEditBar, setExpandEditBar] = useState(false);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});

  // Real-time synced parameters
  const [showHighlight, setShowHighlight] = useState(true);
  const [showClickRipple, setShowClickRipple] = useState(true);
  const [showCaptureBtn, setShowCaptureBtn] = useState(true);
  const [showDrawingBar, setShowDrawingBar] = useState(true);

  useEffect(() => {
    // Load initial settings
    chrome.storage.local.get({
      autoDownload: true,
      toolVisibility: {},
      showHighlight: true,
      showClickRipple: true,
      showCaptureBtn: true,
      showDrawingBar: true,
      recordMic: false
    }, (res) => {
      setAutoDownload(res.autoDownload !== false);
      setVisibility(res.toolVisibility || {});
      setShowHighlight(res.showHighlight !== false);
      setShowClickRipple(res.showClickRipple !== false);
      setShowCaptureBtn(res.showCaptureBtn !== false);
      setShowDrawingBar(res.showDrawingBar !== false);
      setRecordMic(res.recordMic || false);
    });

    // Listen for live updates from page floating toolbar
    const handleMessage = (message: any) => {
      if (message.type === "SETTINGS_CHANGED") {
        if (message.showHighlight !== undefined) setShowHighlight(message.showHighlight);
        if (message.showClickRipple !== undefined) setShowClickRipple(message.showClickRipple);
        if (message.showCaptureBtn !== undefined) setShowCaptureBtn(message.showCaptureBtn);
        if (message.showDrawingBar !== undefined) setShowDrawingBar(message.showDrawingBar);
      } else if (message.type === "MIC_STATUS_CHANGED") {
        setRecordMic(!!message.enabled);
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const handleAutoDownloadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setAutoDownload(checked);
    chrome.storage.local.set({ autoDownload: checked });
  };

  const handleRecordMicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setRecordMic(checked);
    chrome.storage.local.set({ recordMic: checked }, () => {
      if (isRecording) {
        chrome.runtime.sendMessage({ type: "TOGGLE_MIC_RUNTIME", enabled: checked }).catch(() => {});
      }
    });
  };

  const updateSetting = (key: string, value: any) => {
    chrome.storage.local.set({ [key]: value }, () => {
      // Send message to active tabs to update toolbar in real-time
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id !== undefined) {
            chrome.tabs.sendMessage(tab.id, {
              type: "SETTINGS_CHANGED",
              [key]: value
            }).catch(() => {});
          }
        });
      });
    });
  };

  const handleHighlightToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setShowHighlight(checked);
    updateSetting('showHighlight', checked);
  };

  const handleRippleToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setShowClickRipple(checked);
    updateSetting('showClickRipple', checked);
  };

  const handleCaptureToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setShowCaptureBtn(checked);
    updateSetting('showCaptureBtn', checked);
  };

  const handleDrawingBarToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setShowDrawingBar(checked);
    updateSetting('showDrawingBar', checked);
  };

  const handleToolToggle = (toolId: string, checked: boolean) => {
    const nextVisibility = { ...visibility, [toolId]: checked };
    setVisibility(nextVisibility);
    chrome.storage.local.set({ toolVisibility: nextVisibility }, () => {
      // Send message to active tabs to update toolbar in real-time if recording
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id !== undefined) {
            chrome.tabs.sendMessage(tab.id, {
              type: "TOOL_VISIBILITY_CHANGED",
              toolId,
              isVisible: checked
            }).catch(() => {});
          }
        });
      });
    });
  };

  const tools = [
    { id: 'highlight', label: 'Highlight Halo' },
    { id: 'ripple', label: 'Click Ripple' },
    { id: 'mic', label: 'Microphone Toggle' },
    { id: 'pencil', label: 'Pencil / Freehand' },
    { id: 'highlighter', label: 'Highlighter' },
    { id: 'square', label: 'Square Shape' },
    { id: 'circle', label: 'Circle Shape' },
    { id: 'line', label: 'Line Draw' },
    { id: 'arrow', label: 'Arrow Draw' },
    { id: 'laser', label: 'Laser Pointer' },
    { id: 'magnifier', label: 'Magnifier Lens' },
    { id: 'text', label: 'Text Tool' },
    { id: 'eraser', label: 'Eraser Tool' },
    { id: 'clear', label: 'Clear All' },
    { id: 'undo', label: 'Undo Action' },
    { id: 'redo', label: 'Redo Action' }
  ];

  const allToolsVisible = tools.every(t => visibility[t.id] !== false);

  const handleToggleAllTools = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    const nextVisibility: Record<string, boolean> = {};
    tools.forEach(t => {
      nextVisibility[t.id] = checked;
    });
    setVisibility(nextVisibility);
    chrome.storage.local.set({ toolVisibility: nextVisibility }, () => {
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id !== undefined) {
            chrome.tabs.sendMessage(tab.id, {
              type: "ALL_TOOLS_VISIBILITY_CHANGED",
              visibility: nextVisibility
            }).catch(() => {});
          }
        });
      });
    });
  };

  return (
    <div id="settings-modal" className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Recording Settings</h2>
          <button id="btn-close-settings" className="btn-close" onClick={onClose}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          {/* Auto Download Setting */}
          <div className="setting-row">
            <span className="setting-label">Auto Download WebM</span>
            <label className="switch-toggle">
              <input 
                type="checkbox" 
                checked={autoDownload} 
                onChange={handleAutoDownloadChange} 
              />
              <span className="slider-toggle"></span>
            </label>
          </div>

          {/* Record Microphone Setting */}
          <div className="setting-row">
            <span className="setting-label">Record Microphone</span>
            <label className="switch-toggle">
              <input 
                type="checkbox" 
                checked={recordMic} 
                onChange={handleRecordMicChange} 
              />
              <span className="slider-toggle"></span>
            </label>
          </div>

          {/* Cursor Highlight Toggle */}
          <div className="setting-row">
            <span className="setting-label">Cursor Highlight Halo</span>
            <label className="switch-toggle">
              <input 
                type="checkbox" 
                checked={showHighlight} 
                onChange={handleHighlightToggle} 
              />
              <span className="slider-toggle"></span>
            </label>
          </div>

          {/* Click Ripple Toggle */}
          <div className="setting-row">
            <span className="setting-label">Click Ripple Effect</span>
            <label className="switch-toggle">
              <input 
                type="checkbox" 
                checked={showClickRipple} 
                onChange={handleRippleToggle} 
              />
              <span className="slider-toggle"></span>
            </label>
          </div>

          {/* Show Capture Button Toggle */}
          <div className="setting-row">
            <span className="setting-label">Show Capture Button</span>
            <label className="switch-toggle">
              <input 
                type="checkbox" 
                checked={showCaptureBtn} 
                onChange={handleCaptureToggle} 
              />
              <span className="slider-toggle"></span>
            </label>
          </div>

          {/* Show Drawing Bar Toggle */}
          <div className="setting-row">
            <span className="setting-label">Show Drawing Bar</span>
            <label className="switch-toggle">
              <input 
                type="checkbox" 
                checked={showDrawingBar} 
                onChange={handleDrawingBarToggle} 
              />
              <span className="slider-toggle"></span>
            </label>
          </div>

          {/* Edit bar setting Accordion */}
          <div className="accordion-section">
            <div 
              className="accordion-header" 
              onClick={() => setExpandEditBar(!expandEditBar)}
            >
              <span>Edit bar setting</span>
              <svg 
                className={`accordion-chevron ${expandEditBar ? 'expanded' : ''}`} 
                xmlns="http://www.w3.org/2000/svg" 
                fill="none" 
                viewBox="0 0 24 24" 
                strokeWidth="2.5" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            
            {expandEditBar && (
              <div className="accordion-content">
                {/* Master Toggle All Buttons */}
                <div className="setting-row" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '10px', marginBottom: '10px' }}>
                  <span className="setting-label" style={{ fontWeight: '600', color: '#f3f4f6' }}>Toggle All Buttons</span>
                  <label className="switch-toggle">
                    <input 
                      type="checkbox" 
                      checked={allToolsVisible} 
                      onChange={handleToggleAllTools} 
                    />
                    <span className="slider-toggle"></span>
                  </label>
                </div>

                {tools.map(tool => {
                  const isVisible = visibility[tool.id] !== false;
                  return (
                    <div className="setting-row" key={tool.id} style={{ paddingLeft: '8px', margin: '8px 0' }}>
                      <span className="setting-label" style={{ fontSize: '12px', color: '#9ca3af' }}>{tool.label}</span>
                      <label className="switch-toggle" style={{ width: '28px', height: '16px' }}>
                        <input 
                          type="checkbox" 
                          checked={isVisible} 
                          onChange={(e) => handleToolToggle(tool.id, e.target.checked)} 
                        />
                        <span className="slider-toggle small"></span>
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
