"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type AdminNavItem = { href: string; label: string };

function isCurrent(href: string, pathname: string): boolean {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({ items }: Readonly<{ items: AdminNavItem[] }>) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Close the menu on navigation by adjusting state during render (same pattern as the public header).
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className="admin-sidebar">
      <button
        type="button"
        className="admin-menu-toggle"
        aria-controls="admin-navigation"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        <span>{open ? "Cerrar menú del panel" : "Abrir menú del panel"}</span>
      </button>
      <nav id="admin-navigation" aria-label="Módulos del panel" className={open ? "admin-nav is-open" : "admin-nav"}>
        <ul>
          {items.map((item) => (
            <li key={item.href}>
              <Link href={item.href} aria-current={isCurrent(item.href, pathname) ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
