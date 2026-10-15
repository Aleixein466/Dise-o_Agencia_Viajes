"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";

const slides = [
  { src: "/images/social/san-andres-playa-2022.jpg", alt: "Viajeros en la playa y el mar turquesa de San Andrés", place: "San Andrés", note: "Mar que invita a quedarse", year: "2022" },
  { src: "/images/social/cartagena-getsemani-2022.jpg", alt: "Viajeros frente a las fachadas coloridas de Getsemaní, Cartagena", place: "Cartagena", note: "Calles con historia", year: "2022" },
  { src: "/images/social/eje-cafetero-2026.jpg", alt: "Grupo de Ricaurte Tours durante un viaje al Eje Cafetero", place: "Eje Cafetero", note: "Paisajes para compartir", year: "2026" },
];

export function HeroSlider() {
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const change = (direction: number) => setIndex((current) => (current + direction + slides.length) % slides.length);

  return <div className="hero-visual" aria-label="Fotografías de viajes realizados por Ricaurte Tours">
    <div className="hero-slide" key={slide.src}>
      <Image src={slide.src} alt={slide.alt} fill priority={index === 0} sizes="(max-width: 800px) 100vw, 52vw" />
      <div className="hero-slide-scrim" />
      <div className="hero-slide-caption"><span>DEL ÁLBUM DE RICAURTE TOURS · {slide.year}</span><strong>{slide.place}</strong><p>{slide.note}</p></div>
    </div>
    <div className="hero-slider-controls" aria-label="Controles de fotografías">
      <span className="hero-slide-count">0{index + 1} <i /> 0{slides.length}</span>
      <button type="button" onClick={() => change(-1)} aria-label="Fotografía anterior"><ArrowLeft size={18} /></button>
      <button type="button" onClick={() => change(1)} aria-label="Fotografía siguiente"><ArrowRight size={18} /></button>
    </div>
  </div>;
}
