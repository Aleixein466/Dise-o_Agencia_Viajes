/**
 * Content is stored and served as PLAIN TEXT / Markdown, never HTML. Clients must render it as text (or through a
 * Markdown renderer that does not allow raw HTML). This strips anything that looks like markup before it is stored.
 */
const BLOCK_TAGS = /<\s*(script|style|iframe|object|embed)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;
const TAGS = /<\s*\/?\s*[a-zA-Z!?][^>]*>/g;
const UNSAFE_LINK = /\]\(\s*(?:javascript|vbscript|data)\s*:(?:[^()]|\([^)]*\))*\)/gi;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeText(value: string): string {
  let text = value.replace(/\r\n?/g, "\n").replace(CONTROL, "");
  // Repeat until stable so nested fragments ("<scr<script>ipt>") cannot reassemble into a tag.
  for (let pass = 0; pass < 5; pass++) {
    const next = text.replace(BLOCK_TAGS, "").replace(COMMENTS, "").replace(TAGS, "");
    if (next === text) break;
    text = next;
  }
  return text.replace(UNSAFE_LINK, "](#)").trim();
}

/** http(s) URL without credentials, or a site-relative path ("/destinos"). */
export function isSafeHref(value: string): boolean {
  if (/^\/(?![/\\])\S*$/.test(value)) return true;
  return isHttpUrl(value);
}
export function isHttpUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}
