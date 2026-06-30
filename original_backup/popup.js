let timerInterval = null;

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function updateTimer(startTime) {
  const timerElement = document.getElementById("timer");
  if (!timerElement) return;

  const elapsed = Date.now() - startTime;
  timerElement.textContent = formatTime(elapsed);
}

function startTimer(startTime) {
  if (timerInterval) clearInterval(timerInterval);
  updateTimer(startTime);
  timerInterval = setInterval(() => {
    updateTimer(startTime);
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateUI(isRecording, startTime) {
  const idleState = document.getElementById("state-idle");
  const recordingState = document.getElementById("state-recording");

  if (isRecording) {
    idleState.classList.add("hidden");
    recordingState.classList.remove("hidden");
    if (startTime) {
      startTimer(startTime);
    }
  } else {
    idleState.classList.remove("hidden");
    recordingState.classList.add("hidden");
    stopTimer();
  }
}

// Query initial state on load
function getInitialState() {
  chrome.runtime.sendMessage({ type: "GET_RECORDING_STATE" }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("Could not get initial state:", chrome.runtime.lastError);
      return;
    }
    if (response) {
      updateUI(response.isRecording, response.startTime);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  getInitialState();

  document.getElementById("start")?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "START_RECORDING" });
  });

  document.getElementById("stop")?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
  });

  // Help Modal Toggle
  const helpBtn = document.getElementById("btn-help");
  const closeHelpBtn = document.getElementById("btn-close-help");
  const helpModal = document.getElementById("help-modal");

  helpBtn?.addEventListener("click", () => {
    document.body.classList.add("help-active");
    helpModal?.classList.remove("hidden");
  });

  closeHelpBtn?.addEventListener("click", () => {
    document.body.classList.remove("help-active");
    helpModal?.classList.add("hidden");
  });

  // Listen for state change broadcasts
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "STATE_CHANGED") {
      updateUI(message.isRecording, message.startTime);
    }
  });
});
