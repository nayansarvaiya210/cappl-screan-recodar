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

              {/* Keyboard Shortcuts Section */}
              <div className="shortcuts-section" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px', marginTop: '4px' }}>
                <h3 style={{ fontSize: '12px', fontWeight: '600', color: '#f3f4f6', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', color: '#a78bfa' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
                  </svg>
                  Keyboard Shortcuts
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', color: '#9ca3af' }}>
                  <div>
                    <h4 style={{ fontSize: '10px', fontWeight: '600', color: '#a78bfa', textTransform: 'uppercase', marginBottom: '4px' }}>Recording</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px' }}>Start/Stop (Win):</span>
                        <kbd style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '2px 4px', borderRadius: '4px', color: '#ffffff', fontFamily: 'monospace', fontSize: '9px' }}>Ctrl+M</kbd>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px' }}>Start/Stop (Mac):</span>
                        <kbd style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '2px 4px', borderRadius: '4px', color: '#ffffff', fontFamily: 'monospace', fontSize: '9px' }}>Cmd+M</kbd>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px' }}>Stop (Win):</span>
                        <kbd style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '1px 3px', borderRadius: '4px', color: '#ffffff', fontFamily: 'monospace', fontSize: '9px' }}>Ctrl+Shift+S</kbd>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px' }}>Stop (Mac):</span>
                        <kbd style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '1px 3px', borderRadius: '4px', color: '#ffffff', fontFamily: 'monospace', fontSize: '9px' }}>Cmd+Shift+S</kbd>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 style={{ fontSize: '10px', fontWeight: '600', color: '#a78bfa', textTransform: 'uppercase', marginBottom: '4px' }}>Drawing Tools</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px' }}>Pen Tool:</span>
                        <kbd style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '1px 3px', borderRadius: '4px', color: '#ffffff', fontFamily: 'monospace', fontSize: '9px' }}>D</kbd>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px' }}>Highlighter:</span>
                        <kbd style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '1px 3px', borderRadius: '4px', color: '#ffffff', fontFamily: 'monospace', fontSize: '9px' }}>H</kbd>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px' }}>Eraser:</span>
                        <kbd style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '1px 3px', borderRadius: '4px', color: '#ffffff', fontFamily: 'monospace', fontSize: '9px' }}>E</kbd>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px' }}>Clear All:</span>
                        <kbd style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '1px 3px', borderRadius: '4px', color: '#ffffff', fontFamily: 'monospace', fontSize: '9px' }}>C</kbd>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px' }}>Undo:</span>
                        <kbd style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '1px 3px', borderRadius: '4px', color: '#ffffff', fontFamily: 'monospace', fontSize: '9px' }}>Ctrl+Z</kbd>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px' }}>Redo:</span>
                        <kbd style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '1px 3px', borderRadius: '4px', color: '#ffffff', fontFamily: 'monospace', fontSize: '9px' }}>Ctrl+Shift+Z</kbd>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px' }}>1st Color:</span>
                        <kbd style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '1px 3px', borderRadius: '4px', color: '#ffffff', fontFamily: 'monospace', fontSize: '9px' }}>1</kbd>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px' }}>2nd Color:</span>
                        <kbd style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '1px 3px', borderRadius: '4px', color: '#ffffff', fontFamily: 'monospace', fontSize: '9px' }}>2</kbd>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px' }}>3rd Color:</span>
                        <kbd style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '1px 3px', borderRadius: '4px', color: '#ffffff', fontFamily: 'monospace', fontSize: '9px' }}>3</kbd>
                      </div>
                    </div>
                  </div>
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
  const [recordingQuality, setRecordingQuality] = useState("720p");
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
      recordMic: false,
      recordingQuality: "720p"
    }, (res) => {
      setAutoDownload(res.autoDownload !== false);
      setVisibility(res.toolVisibility || {});
      setShowHighlight(res.showHighlight !== false);
      setShowClickRipple(res.showClickRipple !== false);
      setShowCaptureBtn(res.showCaptureBtn !== false);
      setShowDrawingBar(res.showDrawingBar !== false);
      setRecordMic(res.recordMic || false);
      setRecordingQuality(res.recordingQuality || "720p");
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

  const getToolIcon = (toolId: string) => {
    switch (toolId) {
      case 'highlight':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', marginRight: '6px', opacity: 0.8 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 9.152 12 12M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        );
      case 'ripple':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', marginRight: '6px', opacity: 0.8 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m12-9a9 9 0 1 1-6 0" />
          </svg>
        );
      case 'mic':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', marginRight: '6px', opacity: 0.8 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 0 3-3V4.5a3 3 0 0 0-6 0v8.25a3 3 0 0 0 3 3Z" />
          </svg>
        );
      case 'pencil':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', marginRight: '6px', opacity: 0.8 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.83 20.08a4.5 4.5 0 0 1-2.012 1.229l-3.57.992.993-3.57a4.5 4.5 0 0 1 1.229-2.012L16.863 4.487Zm0 0L19.5 7.125" />
          </svg>
        );
      case 'highlighter':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', marginRight: '6px', opacity: 0.8 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-2.22 4.283 9 9 0 1 1 11.233-11.233 3 3 0 0 0-4.283 2.22m-4.73 4.73a3 3 0 0 1 4.73-4.73" />
          </svg>
        );
      case 'square':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', marginRight: '6px', opacity: 0.8 }}>
            <rect x="5" y="5" width="14" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 'circle':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', marginRight: '6px', opacity: 0.8 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        );
      case 'line':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', marginRight: '6px', opacity: 0.8 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 4.5-15 15" />
          </svg>
        );
      case 'arrow':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', marginRight: '6px', opacity: 0.8 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        );
      case 'laser':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', marginRight: '6px', opacity: 0.8 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21L13.688 18M9.043 14.89l-5.113.73 3.688-3.688m6.302-3.131L19.5 3.5" />
          </svg>
        );
      case 'magnifier':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', marginRight: '6px', opacity: 0.8 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.637 10.637Z" />
          </svg>
        );
      case 'text':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', marginRight: '6px', opacity: 0.8 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-15h-15" />
          </svg>
        );
      case 'eraser':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', marginRight: '6px', opacity: 0.8 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5-4.5 4.5" />
          </svg>
        );
      case 'clear':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', marginRight: '6px', opacity: 0.8 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        );
      case 'undo':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', marginRight: '6px', opacity: 0.8 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
          </svg>
        );
      case 'redo':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', marginRight: '6px', opacity: 0.8 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m15 15 6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3" />
          </svg>
        );
      default:
        return null;
    }
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
            <span className="setting-label">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '16px', height: '16px', color: '#a78bfa' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 1 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Auto Download WebM
            </span>
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
            <span className="setting-label">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '16px', height: '16px', color: '#a78bfa' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 0 3-3V4.5a3 3 0 0 0-6 0v8.25a3 3 0 0 0 3 3Z" />
              </svg>
              Record Microphone
            </span>
            <label className="switch-toggle">
              <input 
                type="checkbox" 
                checked={recordMic} 
                onChange={handleRecordMicChange} 
              />
              <span className="slider-toggle"></span>
            </label>
          </div>

          {/* Recording Quality Setting */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
            <div className="setting-row" style={{ marginBottom: 0 }}>
              <span className="setting-label">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '16px', height: '16px', color: '#a78bfa' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                Recording Quality
              </span>
              <select
                className="premium-select"
                value={recordingQuality}
                disabled={isRecording}
                onChange={(e) => {
                  const val = e.target.value;
                  setRecordingQuality(val);
                  chrome.storage.local.set({ recordingQuality: val });
                }}
              >
                <option value="auto">Auto</option>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="4k">4K (Native)</option>
              </select>
            </div>
            {isRecording && (
              <span style={{ fontSize: '10px', color: '#ef4444', textAlign: 'right', display: 'block' }}>
                Cannot change quality during recording
              </span>
            )}
          </div>

          {/* Cursor Highlight Toggle */}
          <div className="setting-row">
            <span className="setting-label">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '16px', height: '16px', color: '#a78bfa' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 9.152 12 12M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              Cursor Highlight Halo
            </span>
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
            <span className="setting-label">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '16px', height: '16px', color: '#a78bfa' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m12-9a9 9 0 1 1-6 0" />
              </svg>
              Click Ripple Effect
            </span>
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
            <span className="setting-label">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '16px', height: '16px', color: '#a78bfa' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0a2.192 2.192 0 0 0-1.736 1.039l-.821 1.316ZM16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
              </svg>
              Show Capture Button
            </span>
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
            <span className="setting-label">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '16px', height: '16px', color: '#a78bfa' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-2.22 4.283 9 9 0 1 1 11.233-11.233 3 3 0 0 0-4.283 2.22m-4.73 4.73a3 3 0 0 1 4.73-4.73m-4.73 4.73.41-1.95a1.5 1.5 0 0 1 .389-.628l1.395-1.395m0 0a8.06 8.06 0 0 1-3.3-3.3m3.3 3.3-1.395 1.395a1.5 1.5 0 0 1-.628.389l-1.95.41Zm9.6-11.19a2.25 2.25 0 1 0-3.181-3.181L6.75 19.5v3h3L21.75 12.75Z" />
              </svg>
              Show Drawing Bar
            </span>
            <label className="switch-toggle">
              <input 
                type="checkbox" 
                checked={showDrawingBar} 
                onChange={handleDrawingBarToggle} 
              />
              <span className="slider-toggle"></span>
            </label>
          </div>

          {/* Edit Drawing bar settings Accordion */}
          <div className="accordion-section">
            <div 
              className="accordion-header" 
              onClick={() => setExpandEditBar(!expandEditBar)}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '16px', height: '16px', color: '#a78bfa' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 13.5V3.75m0 9.75a1.5 1.5 0 0 1 0 3m0-3a1.5 1.5 0 0 0 0 3m0 3.75V16.5m12-3V3.75m0 9.75a1.5 1.5 0 0 1 0 3m0-3a1.5 1.5 0 0 0 0 3m0 3.75V16.5m-6-9V3.75m0 3.75a1.5 1.5 0 0 1 0 3m0-3a1.5 1.5 0 0 0 0 3m0 9.75V10.5" />
                </svg>
                Edit Drawing Bar Settings
              </span>
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
                  <span className="setting-label" style={{ fontWeight: '600', color: '#f3f4f6' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', color: '#a78bfa' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    Toggle All Buttons
                  </span>
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
                      <span className="setting-label" style={{ fontSize: '12px', color: '#9ca3af' }}>
                        {getToolIcon(tool.id)}
                        {tool.label}
                      </span>
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
