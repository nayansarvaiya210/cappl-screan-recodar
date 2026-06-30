let isRecording = false;
let startTime = null;
let recorderTabId = null;
let lastActiveTabId = null;

let badgeInterval = null;

function formatBadgeTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 10) {
    // Fits 4 characters (e.g. 1:09, 9:59)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  } else {
    // Fits 3 characters (e.g. 10m, 99m)
    return `${minutes}m`;
  }
}

function updateBadge() {
  if (!isRecording || !startTime) {
    stopBadgeTimer();
    chrome.action.setBadgeText({ text: "" }).catch(() => {});
    return;
  }
  const elapsed = Date.now() - startTime;
  const timeStr = formatBadgeTime(elapsed);
  chrome.action.setBadgeText({ text: timeStr }).catch(() => {});
}

function startBadgeTimer() {
  if (badgeInterval) clearInterval(badgeInterval);
  updateBadge();
  badgeInterval = setInterval(updateBadge, 1000);
}

function stopBadgeTimer() {
  if (badgeInterval) {
    clearInterval(badgeInterval);
    badgeInterval = null;
  }
}

function broadcastState() {
  // Update the extension badge depending on the recording state
  if (isRecording) {
    chrome.action.setBadgeBackgroundColor({ color: "#22c55e" }).catch(() => {});
    chrome.action.setBadgeTextColor({ color: "#ffffff" }).catch(() => {});
    startBadgeTimer();
  } else {
    stopBadgeTimer();
    chrome.action.setBadgeText({ text: "" }).catch(() => {});
  }

  // Broadcast to popup
  chrome.runtime.sendMessage({
    type: "STATE_CHANGED",
    isRecording,
    startTime
  }).catch(() => {
    // Suppress error when popup is not open
  });

  // Broadcast to all tabs so content script overlays update
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, {
        type: "STATE_CHANGED",
        isRecording,
        startTime
      }).catch(() => {
        // Suppress errors for tabs where content script is not loaded
      });
    });
  });
}

// Keep service worker alive while the recorder tab has an open port connection
chrome.runtime.onConnect.addListener((port) => {
  // No action needed; connection alone keeps service worker alive
});

// Watch for recorder tab removal to clean up state
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === recorderTabId) {
    recorderTabId = null;
    isRecording = false;
    startTime = null;
    broadcastState();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // GET STATE
  if (msg.type === "GET_RECORDING_STATE") {
    sendResponse({ isRecording, startTime });
    return true;
  }

  // START RECORDING
  if (msg.type === "START_RECORDING") {
    if (isRecording && recorderTabId) {
      chrome.tabs.sendMessage(recorderTabId, { type: "STOP" }).catch(() => {});
    }

    // Capture the current active tab ID before creating the recorder tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        lastActiveTabId = tabs[0].id;
      }
      
      chrome.tabs.create(
        {
          url: chrome.runtime.getURL("recorder.html"),
          active: true,
        },
        (tab) => {
          recorderTabId = tab.id;
        }
      );
    });
  }

  // RECORDING STARTED (notified by recorder.js)
  if (msg.type === "RECORDING_STARTED") {
    isRecording = true;
    startTime = msg.startTime || Date.now();
    if (sender.tab && sender.tab.id) {
      recorderTabId = sender.tab.id;
    }
    broadcastState();

    // Inject content script into the last active tab to show overlay immediately
    if (lastActiveTabId) {
      chrome.scripting.executeScript({
        target: { tabId: lastActiveTabId },
        files: ["content.js"]
      }).catch(err => console.log("Script injection failed:", err));
    }
  }

  // RECORDING STOPPED (notified by recorder.js)
  if (msg.type === "RECORDING_STOPPED") {
    isRecording = false;
    startTime = null;
    broadcastState();
  }

  // STOP RECORDING (from popup)
  if (msg.type === "STOP_RECORDING") {
    if (recorderTabId) {
      chrome.tabs.sendMessage(recorderTabId, { type: "STOP" }).catch(() => {});
    }
  }
});
