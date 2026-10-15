"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useState } from "react";

const links = [
  { href: "/destinos", label: "Destinos" },
  { href: "/#lugares", label: "Lugares" },
  { href: "/#planes", label: "Planes de viaje" },
  { href: "/#preguntas", label: "Preguntas" },
  { href: "/contacto", label: "Contacto" },
  { href: "/pqrs", label: "PQRS" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="top-bar"><div className="shell top-bar-inner"><span>Ricaurte Tours · Agencia de viajes y turismo</span><a href="https://www.facebook.com/ricaurtetours" target="_blank" rel="noopener noreferrer">Conócenos en Facebook <ArrowUpRight size={13} /></a></div></div>
      <div className="nav-wrap shell">
        <Link href="/" className="brand brand-with-logo" aria-label="Ricaurte Tours, ir al inicio" onClick={() => setOpen(false)}>
          <Image src="/images/ricaurte-logo.jpg" width={96} height={87} alt="" priority />
        </Link>
        <nav aria-label="Navegación principal" className={open ? "nav-links is-open" : "nav-links"}>
          {links.map((link) => <Link onClick={() => setOpen(false)} href={link.href} key={link.href}>{link.label}</Link>)}
          <Link href="/cotizar" className="mobile-quote" onClick={() => setOpen(false)}>Cotizar mi viaje <ArrowUpRight size={16} /></Link>
        </nav>
        <Link href="/cotizar" className="header-cta">Cotizar mi viaje <ArrowUpRight size={17} /></Link>
        <button type="button" className="menu-toggle" aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
      </div>
    </header>
  );
}
