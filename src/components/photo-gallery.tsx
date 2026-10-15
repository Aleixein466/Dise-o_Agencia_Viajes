"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, ArrowUpRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TripPhoto } from "@/lib/demo-data";

export function PhotoGallery({ photos, variant = "mosaic" }: { photos: TripPhoto[]; variant?: "mosaic" | "detail" }) {
  const [selected, setSelected] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (selected === null || !element) return;
    if (!element.open) element.showModal();
  }, [selected]);

  function close() { dialog.current?.close(); setSelected(null); }
  function onKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (selected === null) return;
    if (event.key === "ArrowRight") setSelected((selected + 1) % photos.length);
    if (event.key === "ArrowLeft") setSelected((selected - 1 + photos.length) % photos.length);
  }

  return <>
    <div className={variant === "mosaic" ? "photo-mosaic" : "detail-photo-grid"}>
      {photos.map((photo, index) => <button type="button" className="photo-tile" key={photo.image} onClick={() => setSelected(index)} aria-label={`Ampliar fotografía: ${photo.caption}`}>
        <Image src={photo.image} alt={photo.alt} fill sizes={variant === "mosaic" ? "(max-width: 650px) 50vw, (max-width: 1100px) 33vw, 25vw" : "(max-width: 650px) 50vw, 33vw"} />
        <span className="photo-tile-caption">{photo.caption}<span aria-hidden="true">＋</span></span>
      </button>)}
    </div>
    <dialog ref={dialog} className="photo-dialog" aria-label="Fotografía ampliada" onClose={() => setSelected(null)} onKeyDown={onKeyDown} onClick={(event) => { if (event.target === dialog.current) close(); }}>
      {selected !== null && <div className="photo-dialog-inner">
        <button className="photo-dialog-close" type="button" onClick={close} aria-label="Cerrar fotografía"><X size={24} /></button>
        <div className="photo-dialog-image"><Image src={photos[selected].image} alt={photos[selected].alt} fill sizes="(max-width: 800px) 92vw, 75vw" /></div>
        <div className="photo-dialog-footer"><div><span>0{selected + 1} / 0{photos.length}</span><strong>{photos[selected].caption}</strong></div><a href={photos[selected].sourceUrl} target="_blank" rel="noopener noreferrer">Ver publicación original <ArrowUpRight size={16} /></a></div>
        <div className="photo-dialog-arrows"><button type="button" onClick={() => setSelected((selected - 1 + photos.length) % photos.length)} aria-label="Fotografía anterior"><ArrowLeft size={20} /></button><button type="button" onClick={() => setSelected((selected + 1) % photos.length)} aria-label="Fotografía siguiente"><ArrowRight size={20} /></button></div>
      </div>}
    </dialog>
  </>;
}
