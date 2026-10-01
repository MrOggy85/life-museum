import { useCallback, useEffect, useRef, useState } from 'react';
import { buildMetadata, type Mode, nextDuration, type Position, SNAP_SECONDS } from './meta.ts';
import { openCamera, recordFor } from './recorder.ts';
import { IndexedDbStore } from './queue.ts';
import { drain, sendCapture } from './uploader.ts';

const store = new IndexedDbStore();

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const position = useRef<Position | null>(null);
  const busy = useRef(false);
  const wake = useRef<number | undefined>(undefined);
  const [seconds, setSeconds] = useState(3);
  const [recording, setRecording] = useState<number | null>(null);
  const [flash, setFlash] = useState(0);
  const [camera, setCamera] = useState<'starting' | 'live' | 'denied'>('starting');

  const upload = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const { nextAttemptAt } = await drain(store, sendCapture);
      clearTimeout(wake.current);
      if (nextAttemptAt !== null) wake.current = setTimeout(upload, Math.max(1000, nextAttemptAt - Date.now()));
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const start = async () => {
      try {
        const stream = await openCamera();
        if (!alive) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamera('live');
      } catch {
        if (alive) setCamera('denied');
      }
    };
    const stop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (!busyRecording.current) stop();
      } else {
        if (!streamRef.current) void start();
        void upload();
      }
    };
    const busyRecording = { current: false };
    void start();
    void navigator.storage?.persist?.();
    const watch = navigator.geolocation?.watchPosition(
      (p) => position.current = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy },
      () => {},
      { maximumAge: 60_000, timeout: 30_000 },
    );
    document.addEventListener('visibilitychange', onVisibility);
    addEventListener('online', upload);
    void upload();
    return () => {
      alive = false;
      stop();
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      document.removeEventListener('visibilitychange', onVisibility);
      removeEventListener('online', upload);
    };
  }, [upload]);

  const capture = async (mode: Mode, requestedSeconds: number) => {
    const stream = streamRef.current;
    if (!stream || recording !== null) return;
    setRecording(requestedSeconds);
    const now = new Date();
    try {
      const blob = await recordFor(stream, requestedSeconds);
      const uuid = crypto.randomUUID();
      await store.add({
        client_uuid: uuid,
        blob,
        metadata: buildMetadata({
          uuid,
          now,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
          mode,
          requestedSeconds,
          position: position.current,
          userAgent: navigator.userAgent,
        }),
        attempts: 0,
        nextAttemptAt: 0,
      });
      navigator.vibrate?.(40);
      setFlash((n) => n + 1);
      void upload();
    } catch (e) {
      console.error(e);
    } finally {
      setRecording(null);
    }
  };

  const isRecording = recording !== null;

  return (
    <div className='viewfinder'>
      <video ref={videoRef} autoPlay muted playsInline />
      {flash > 0 && <div key={flash} className='flash' />}
      {camera === 'denied' && <p className='notice'>Camera access is needed.</p>}
      <div className='controls'>
        <button
          type='button'
          className='snap'
          aria-label='Snap'
          disabled={camera !== 'live' || isRecording}
          onClick={() => capture('snap', SNAP_SECONDS)}
        />
        <button
          type='button'
          className='shutter'
          aria-label='Record'
          disabled={camera !== 'live' || isRecording}
          onClick={() => capture('clip', seconds)}
        >
          <svg viewBox='0 0 100 100' aria-hidden='true'>
            <circle className='ring-track' cx='50' cy='50' r='46' />
            {isRecording && (
              <circle
                className='ring-drain'
                cx='50'
                cy='50'
                r='46'
                pathLength='100'
                style={{ animationDuration: `${recording}s` }}
              />
            )}
          </svg>
          <span className={isRecording ? 'core recording' : 'core'} />
        </button>
        <button
          type='button'
          className='duration'
          aria-label='Clip length'
          disabled={isRecording}
          onClick={() => setSeconds(nextDuration)}
        >
          {seconds}s
        </button>
      </div>
    </div>
  );
}
