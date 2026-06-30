let mediaRecorder;
let recordedChunks = [];
let recordingStopped = false;

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });

    mediaRecorder = new MediaRecorder(stream, {
      mimeType: "video/webm",
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    // Auto download when stopped
    mediaRecorder.onstop = () => {
      recordingStopped = true;

      // Stop all tracks to release the stream
      stream.getTracks().forEach((track) => track.stop());

      if (!recordedChunks.length) {
        chrome.runtime.sendMessage({ type: "RECORDING_STOPPED" }).catch(() => {});
        window.close();
        return;
      }

      const blob = new Blob(recordedChunks, {
        type: "video/webm",
      });

      const url = URL.createObjectURL(blob);

      chrome.downloads.download({
        url,
        filename: `screen-recording-${Date.now()}.webm`,
        saveAs: true,
      }, () => {
        recordedChunks = [];
        chrome.runtime.sendMessage({ type: "RECORDING_STOPPED" }).catch(() => {});
        window.close();
      });
    };

    // Handle user stopping sharing via Chrome's native control bar
    stream.getVideoTracks()[0].onended = () => {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
    };

    mediaRecorder.start();
    
    // Connect to background to keep service worker alive during recording
    chrome.runtime.connect({ name: "recorder-connection" });
    
    // Notify background.js that recording has successfully started
    chrome.runtime.sendMessage({ type: "RECORDING_STARTED", startTime: Date.now() }).catch(() => {});
  } catch (err) {
    console.error("Recording failed:", err);
    // User cancelled or error occurred -> close the tab safely
    window.close();
  }
}

// Start recording after page loads
startRecording();

// LISTEN FOR MESSAGES
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STOP") {
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;
    mediaRecorder.stop();
  }

  if (msg.type === "DOWNLOAD") {
    if (!recordingStopped || !recordedChunks.length) return;

    const blob = new Blob(recordedChunks, {
      type: "video/webm",
    });

    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
      url,
      filename: `screen-recording-${Date.now()}.webm`,
      saveAs: true,
    }, () => {
      window.close();
    });
  }
});
