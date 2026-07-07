import { useEffect, useRef, useState } from 'react';

export default function Recorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStoppedRef = useRef(false);
  const [downloadState, setDownloadState] = useState<'recording' | 'downloading' | 'failed' | 'completed'>('recording');
  const downloadIdRef = useRef<number | null>(null);

  const triggerDownload = () => {
    if (!recordedChunksRef.current.length) return;
    setDownloadState('downloading');

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
      }, (downloadId) => {
        if (chrome.runtime.lastError || !downloadId) {
          console.error("Download failed to start:", chrome.runtime.lastError);
          setDownloadState('failed');
          return;
        }
        downloadIdRef.current = downloadId;
      });
    });
  };

  const triggerDownloadRef = useRef(triggerDownload);
  useEffect(() => {
    triggerDownloadRef.current = triggerDownload;
  });

  const handleDiscard = () => {
    recordedChunksRef.current = [];
    chrome.runtime.sendMessage({ type: "RECORDING_STOPPED" }).catch(() => {});
    window.close();
  };

  useEffect(() => {
    async function startRecording() {
      let displayStream: MediaStream | null = null;
      let micStream: MediaStream | null = null;
      let audioCtx: AudioContext | null = null;

      try {
        const settings = await new Promise<{ recordMic?: boolean }>((resolve) => {
          chrome.storage.local.get({ recordMic: false }, (res) => {
            resolve(res);
          });
        });

        if (settings.recordMic) {
          try {
            micStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
              },
            });
          } catch (micErr) {
            console.warn("Microphone access declined or unavailable, recording screen only:", micErr);
          }
        }

        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        let finalStream = displayStream;

        if (settings.recordMic && micStream) {
          const displayAudioTracks = displayStream.getAudioTracks();
          if (displayAudioTracks.length > 0) {
            try {
              const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
              audioCtx = new AudioContextClass();
              const destination = audioCtx.createMediaStreamDestination();

              const displaySource = audioCtx.createMediaStreamSource(displayStream);
              displaySource.connect(destination);

              const micSource = audioCtx.createMediaStreamSource(micStream);
              micSource.connect(destination);

              if (audioCtx.state === 'suspended') {
                await audioCtx.resume();
              }

              const videoTrack = displayStream.getVideoTracks()[0];
              const mixedAudioTrack = destination.stream.getAudioTracks()[0];
              
              finalStream = new MediaStream([videoTrack]);
              if (mixedAudioTrack) {
                finalStream.addTrack(mixedAudioTrack);
              }
            } catch (mixErr) {
              console.error("Failed to mix audio tracks, using displayStream only:", mixErr);
              finalStream = displayStream;
            }
          } else {
            const videoTrack = displayStream.getVideoTracks()[0];
            const micAudioTrack = micStream.getAudioTracks()[0];
            finalStream = new MediaStream([videoTrack]);
            if (micAudioTrack) {
              finalStream.addTrack(micAudioTrack);
            }
          }
        }

        const mediaRecorder = new MediaRecorder(finalStream, {
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

          // Stop all tracks to release the streams
          if (displayStream) {
            displayStream.getTracks().forEach((track) => track.stop());
          }
          if (micStream) {
            micStream.getTracks().forEach((track) => track.stop());
          }
          if (audioCtx && audioCtx.state !== 'closed') {
            audioCtx.close().catch(() => {});
          }

          // Stop recording state immediately so drawing overlays are hidden
          chrome.runtime.sendMessage({ type: "RECORDING_STOPPED" }).catch(() => {});

          if (!recordedChunksRef.current.length) {
            window.close();
            return;
          }

          triggerDownloadRef.current();
        };

        // Handle user stopping sharing via Chrome's native control bar
        displayStream.getVideoTracks()[0].onended = () => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
          }
        };

        mediaRecorder.start();

        // Connect to background to keep service worker alive during recording
        chrome.runtime.connect({ name: "recorder-connection" });

        // Notify background.js that recording has successfully started
        const track = displayStream.getVideoTracks()[0];
        const displaySurface = track ? (track.getSettings()?.displaySurface || "browser") : "browser";
        chrome.runtime.sendMessage({
          type: "RECORDING_STARTED",
          startTime: Date.now(),
          displaySurface
        }).catch(() => {});
      } catch (err) {
        console.error("Recording failed:", err);
        if (displayStream) {
          displayStream.getTracks().forEach((track) => track.stop());
        }
        if (micStream) {
          micStream.getTracks().forEach((track) => track.stop());
        }
        if (audioCtx && audioCtx.state !== 'closed') {
          audioCtx.close().catch(() => {});
        }
        // User cancelled or error occurred -> close the tab safely
        window.close();
      }
    }

    startRecording();

    // Listen to download changes to handle cancel/complete states
    const handleDownloadChanged = (delta: chrome.downloads.DownloadDelta) => {
      if (downloadIdRef.current !== null && delta.id === downloadIdRef.current) {
        if (delta.state) {
          if (delta.state.current === 'complete') {
            recordedChunksRef.current = [];
            chrome.runtime.sendMessage({ type: "RECORDING_STOPPED" }).catch(() => {});
            setDownloadState('completed');
            setTimeout(() => {
              window.close();
            }, 1500);
          } else if (delta.state.current === 'interrupted') {
            setDownloadState('failed');
            downloadIdRef.current = null;
          }
        }
      }
    };
    chrome.downloads.onChanged.addListener(handleDownloadChanged);

    // LISTEN FOR MESSAGES
    const handleMessage = (msg: any) => {
      if (msg.type === "STOP") {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;
        mediaRecorderRef.current.stop();
      }

      if (msg.type === "DOWNLOAD") {
        if (!recordingStoppedRef.current || !recordedChunksRef.current.length) return;
        triggerDownloadRef.current();
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.downloads.onChanged.removeListener(handleDownloadChanged);
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  return (
    <div style={styles.container}>
      {downloadState === 'recording' && (
        <>
          <h2 style={styles.heading}>Recording Screen...</h2>
          <p style={styles.text}>You can minimize this tab while the recording is active.</p>
        </>
      )}
      {downloadState === 'downloading' && (
        <>
          <h2 style={styles.heading}>Saving Recording...</h2>
          <p style={styles.text}>Please choose where to save the video file.</p>
        </>
      )}
      {downloadState === 'failed' && (
        <>
          <h2 style={styles.heading}>Recording Finished</h2>
          <p style={styles.text}>The download was cancelled or could not be completed.</p>
          <div style={styles.btnContainer}>
            <button style={styles.btnPrimary} onClick={triggerDownload}>
              Download Recording
            </button>
            <button style={styles.btnSecondary} onClick={handleDiscard}>
              Discard
            </button>
          </div>
        </>
      )}
      {downloadState === 'completed' && (
        <>
          <h2 style={styles.headingSuccess}>Recording Saved!</h2>
          <p style={styles.text}>Closing this tab in a moment...</p>
        </>
      )}
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
  headingSuccess: {
    fontSize: '32px',
    marginBottom: '10px',
    background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  text: {
    color: '#9ca3af',
    fontSize: '16px',
  },
  btnContainer: {
    marginTop: '24px',
    display: 'flex',
    gap: '12px',
  },
  btnPrimary: {
    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    transition: 'all 0.2s',
  },
  btnSecondary: {
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    color: '#e5e7eb',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};
