"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/destinos", label: "Destinos" },
  { href: "/#galeria", label: "Galería" },
  { href: "/#planes", label: "Planea tu viaje" },
  { href: "/#preguntas", label: "Preguntas" },
  { href: "/contacto", label: "Contacto" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return <header className="site-header"><div className="top-bar"><div className="shell top-bar-inner"><span>Viajes que se convierten en historias</span><a href="https://www.facebook.com/ricaurtetours" target="_blank" rel="noopener noreferrer">Ricaurte Tours en Facebook <ArrowUpRight size={13} /></a></div></div><div className="shell nav-wrap"><Link href="/" className="brand" aria-label="Ricaurte Tours, ir al inicio" onClick={() => setOpen(false)}><Image src="/images/ricaurte-logo.jpg" width={108} height={97} alt="" priority /></Link><nav id="primary-navigation" aria-label="Navegación principal" className={open ? "nav-links is-open" : "nav-links"}>{links.map((link) => <Link href={link.href} key={link.href} aria-current={link.href === pathname || (link.href === "/destinos" && pathname.startsWith("/destinos/")) ? "page" : undefined} onClick={() => setOpen(false)}>{link.label}</Link>)}<Link href="/cotizar" className="mobile-quote" onClick={() => setOpen(false)}>Preparar consulta <ArrowUpRight size={17} /></Link></nav><Link href="/cotizar" className="header-cta">Preparar consulta <ArrowUpRight size={17} /></Link><button type="button" className="menu-toggle" aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-controls="primary-navigation" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button></div></header>;
}
