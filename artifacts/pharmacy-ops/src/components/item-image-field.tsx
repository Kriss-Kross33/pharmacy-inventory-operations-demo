import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { prepareItemImage } from "../lib/pharmacy/item-image";
import { Button, Modal } from "./app-ui";

export function ItemImageField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => () => stopCamera(), []);

  const applyFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await prepareItemImage(file));
      setError("");
    } catch (err: any) {
      setError(err.message || "The image could not be attached.");
    } finally {
      setBusy(false);
    }
  };

  const openCamera = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      captureRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      captureRef.current?.click();
    }
  };

  const closeCamera = () => {
    stopCamera();
    setCameraOpen(false);
  };

  const captureFrame = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setBusy(true);
    try {
      onChange(await prepareItemImage(canvas.toDataURL("image/jpeg", 0.85)));
      setError("");
      closeCamera();
    } catch (err: any) {
      setError(err.message || "The photo could not be captured.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="item-image-field">
      <div className="item-image-preview">
        {value ? (
          <img src={value} alt="Item" />
        ) : (
          <span>
            <ImagePlus size={18} />
            No photo
          </span>
        )}
      </div>
      <div>
        <div className="field-label">Item photo</div>
        <p className="small-muted" style={{ margin: "0 0 10px" }}>
          Optional. Take a shelf photo or upload a pack shot. Images are stored with this browser demo only.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button className="btn-sm" disabled={busy} onClick={() => uploadRef.current?.click()} testid="button-upload-item-image">
            <ImagePlus size={13} /> Upload image
          </Button>
          <Button className="btn-sm" disabled={busy} onClick={openCamera} testid="button-capture-item-image">
            <Camera size={13} /> Take photo
          </Button>
          {value && (
            <Button className="btn-sm" disabled={busy} onClick={() => onChange("")}>
              <Trash2 size={13} /> Remove
            </Button>
          )}
        </div>
        {error && <div className="field-error">{error}</div>}
      </div>
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        hidden
        data-testid="input-item-image-upload"
        onChange={(event) => {
          void applyFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={captureRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid="input-item-image-capture"
        onChange={(event) => {
          void applyFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {cameraOpen && (
        <Modal
          title="Take item photo"
          onClose={closeCamera}
          footer={
            <>
              <Button onClick={closeCamera}>Cancel</Button>
              <Button variant="primary" disabled={busy} onClick={captureFrame} testid="button-use-photo">
                Use photo
              </Button>
            </>
          }
        >
          <video ref={videoRef} className="item-camera" playsInline muted autoPlay />
        </Modal>
      )}
    </div>
  );
}

export function ItemPhoto({ src, name, size = "sm" }: { src?: string; name: string; size?: "sm" | "lg" }) {
  if (!src) {
    return (
      <span className={`item-photo ${size === "lg" ? "item-photo-lg" : ""} item-photo-empty`} aria-hidden>
        <ImagePlus size={size === "lg" ? 22 : 14} />
      </span>
    );
  }
  return <img className={`item-photo ${size === "lg" ? "item-photo-lg" : ""}`} src={src} alt={name} />;
}
