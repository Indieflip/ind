"use client";
import { useEffect, useRef } from "react";

export function SignaturePad(props: { value: string; onChange: (dataUrl: string) => void; clearLabel: string; confirmText?: string }) {
  // Signature déjà enregistrée (bon modifié) : on l'affiche, « Effacer » permet de refaire signer
  if (props.value && !props.value.startsWith("data:")) {
    return (
      <div>
        <img src={props.value} alt="" className="h-44 w-full rounded-lg border-2 border-stone-200 bg-white object-contain" />
        <button type="button" className="btn-ghost mt-1 px-2 py-1 text-xs" onClick={() => confirm(props.confirmText ?? props.clearLabel) && props.onChange("")}>{props.clearLabel}</button>
      </div>
    );
  }
  return <Pad {...props} />;
}

function Pad({ value, onChange, clearLabel, confirmText }: { value: string; onChange: (dataUrl: string) => void; clearLabel: string; confirmText?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * ratio;
    c.height = rect.height * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  return (
    <div>
      <canvas
        ref={canvas}
        className="h-44 w-full touch-none rounded-lg border-2 border-dashed border-stone-300 bg-white"
        onPointerDown={(e) => {
          drawing.current = true;
          canvas.current!.setPointerCapture(e.pointerId);
          const ctx = canvas.current!.getContext("2d")!;
          const [x, y] = pos(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 0.1, y + 0.1);
          ctx.stroke();
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = canvas.current!.getContext("2d")!;
          const [x, y] = pos(e);
          ctx.lineTo(x, y);
          ctx.stroke();
          dirty.current = true;
        }}
        onPointerUp={() => {
          drawing.current = false;
          if (dirty.current) onChange(canvas.current!.toDataURL("image/png"));
        }}
      />
      <button
        type="button"
        className="btn-ghost mt-1 px-2 py-1 text-xs"
        onClick={() => {
          if (!confirm(confirmText ?? clearLabel)) return;
          const c = canvas.current!;
          c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
          dirty.current = false;
          onChange("");
        }}
      >
        {clearLabel}
      </button>
    </div>
  );
}
