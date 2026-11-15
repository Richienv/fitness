"use client";
import { useRef, type CSSProperties, type PointerEvent } from "react";
import { movePhotoCrop, type PhotoCrop } from "@/lib/nutritionPhoto";
export default function NutritionPhotoCrop({
  src,
  ratio,
  crop,
  onChange,
  disabled,
}: {
  src: string;
  ratio: number;
  crop: PhotoCrop;
  onChange: (crop: PhotoCrop) => void;
  disabled: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    crop: PhotoCrop;
    handle: string;
  } | null>(null);
  function down(e: PointerEvent<HTMLButtonElement>, handle: string) {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, crop, handle };
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current,
      b = box.current?.getBoundingClientRect();
    if (!d || !b) return;
    onChange(
      movePhotoCrop(
        d.crop,
        (e.clientX - d.x) / b.width,
        (e.clientY - d.y) / b.height,
        d.handle,
      ),
    );
  }
  function key(e: React.KeyboardEvent, handle: string) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key))
      return;
    e.preventDefault();
    onChange(
      movePhotoCrop(
        crop,
        e.key === "ArrowLeft" ? -0.02 : e.key === "ArrowRight" ? 0.02 : 0,
        e.key === "ArrowUp" ? -0.02 : e.key === "ArrowDown" ? 0.02 : 0,
        handle,
      ),
    );
  }
  return (
    <div
      className="scan-photo"
      ref={box}
      style={{ "--photo-ratio": ratio } as CSSProperties}
    >
      <img src={src} alt="Foto label yang akan dibaca" draggable={false} />
      <div
        className="scan-crop"
        style={{
          left: crop.x * 100 + "%",
          top: crop.y * 100 + "%",
          width: crop.width * 100 + "%",
          height: crop.height * 100 + "%",
        }}
      >
        <button
          type="button"
          className="scan-crop-move"
          aria-label="Geser area label"
          disabled={disabled}
          onPointerDown={(e) => down(e, "move")}
          onPointerMove={move}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={(e) => key(e, "move")}
        />
        {(["nw", "ne", "sw", "se"] as const).map((h, i) => (
          <button
            key={h}
            type="button"
            className={"scan-crop-handle " + h}
            aria-label={
              "Ubah sudut " +
              ["kiri atas", "kanan atas", "kiri bawah", "kanan bawah"][i]
            }
            disabled={disabled}
            onPointerDown={(e) => down(e, h)}
            onPointerMove={move}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={(e) => key(e, h)}
          />
        ))}
      </div>
    </div>
  );
}
