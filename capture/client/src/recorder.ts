const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function pickMimeType(): string | undefined {
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
}

export async function openCamera(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotFoundError') {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    throw e;
  }
}

export function recordFor(stream: MediaStream, seconds: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onerror = () => reject(new Error('recording failed'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' }));
    recorder.start();
    setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), seconds * 1000);
  });
}
