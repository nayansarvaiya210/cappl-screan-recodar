import { useEffect, useRef } from 'react';

export default function Recorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStoppedRef = useRef(false);

  useEffect(() => {
    async function startRecording() {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: "video/webm",
        });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };

        // Auto download when stopped
        mediaRecorder.onstop = () => {
          recordingStoppedRef.current = true;

          // Stop all tracks to release the stream
          stream.getTracks().forEach((track) => track.stop());

          if (!recordedChunksRef.current.length) {
            chrome.runtime.sendMessage({ type: "RECORDING_STOPPED" }).catch(() => {});
            window.close();
            return;
          }

          const blob = new Blob(recordedChunksRef.current, {
            type: "video/webm",
          });

          const url = URL.createObjectURL(blob);

          chrome.storage.local.get({ autoDownload: true }, (res) => {
            const isAuto = res.autoDownload !== false;
            chrome.downloads.download({
              url,
              filename: `screen-recording-${Date.now()}.webm`,
              saveAs: !isAuto,
            }, () => {
              recordedChunksRef.current = [];
              chrome.runtime.sendMessage({ type: "RECORDING_STOPPED" }).catch(() => {});
              window.close();
            });
          });
        };

        // Handle user stopping sharing via Chrome's native control bar
        stream.getVideoTracks()[0].onended = () => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
          }
        };

        mediaRecorder.start();

        // Connect to background to keep service worker alive during recording
        chrome.runtime.connect({ name: "recorder-connection" });

        // Notify background.js that recording has successfully started
        const track = stream.getVideoTracks()[0];
        const displaySurface = track ? (track.getSettings()?.displaySurface || "browser") : "browser";
        chrome.runtime.sendMessage({
          type: "RECORDING_STARTED",
          startTime: Date.now(),
          displaySurface
        }).catch(() => {});
      } catch (err) {
        console.error("Recording failed:", err);
        // User cancelled or error occurred -> close the tab safely
        window.close();
      }
    }

    startRecording();

    // LISTEN FOR MESSAGES
    const handleMessage = (msg: any) => {
      if (msg.type === "STOP") {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;
        mediaRecorderRef.current.stop();
      }

      if (msg.type === "DOWNLOAD") {
        if (!recordingStoppedRef.current || !recordedChunksRef.current.length) return;

        const blob = new Blob(recordedChunksRef.current, {
          type: "video/webm",
        });

        const url = URL.createObjectURL(blob);

        chrome.storage.local.get({ autoDownload: true }, (res) => {
          const isAuto = res.autoDownload !== false;
          chrome.downloads.download({
            url,
            filename: `screen-recording-${Date.now()}.webm`,
            saveAs: !isAuto,
          }, () => {
            window.close();
          });
        });
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Recording Screen...</h2>
      <p style={styles.text}>You can minimize this tab while the recording is active.</p>
    </div>
  );
}

const styles = {
  container: {
    background: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)',
    color: '#f3f4f6',
    fontFamily: "'Outfit', sans-serif",
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    margin: 0,
    textAlign: 'center' as const,
  },
  heading: {
    fontSize: '32px',
    marginBottom: '10px',
    background: 'linear-gradient(135deg, #a78bfa 0%, #22d3ee 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  text: {
    color: '#9ca3af',
    fontSize: '16px',
  },
};
