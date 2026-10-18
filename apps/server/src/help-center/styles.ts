import type { HelpCenterColors } from "./color";

/** The whole stylesheet, inline (no external fonts or CDNs). Colours are validated hex values. */
export function helpCenterCss(colors: HelpCenterColors): string {
  return `
:root{--brand:${colors.brand};--on-brand:${colors.onBrand};--ink:${colors.inkLight};--bg:#fbfbfd;--surface:#ffffff;--fill:#f1f1f5;--fg:#17171f;--muted:#5d5d6b;--line:#e4e4ec;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--ink:${colors.inkDark};--bg:#111116;--surface:#1a1a21;--fill:#23232c;--fg:#ececf1;--muted:#a3a3b2;--line:#2e2e38}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--ink);text-underline-offset:.18em;text-decoration-thickness:1px}
a:hover{text-decoration-thickness:2px}
:focus-visible{outline:3px solid var(--ink);outline-offset:2px;border-radius:4px}
.skip{position:absolute;left:1rem;top:-4rem;z-index:10;padding:.6rem 1rem;border-radius:999px;background:var(--fg);color:var(--bg);font-weight:600;text-decoration:none}
.skip:focus{top:1rem}
.visually-hidden{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.wrap{width:100%;max-width:48rem;margin:0 auto;padding:0 1.25rem}
.site-header{background:var(--brand);color:var(--on-brand)}
.site-header .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:4rem}
.brand{color:inherit;text-decoration:none;font-weight:700;font-size:1.05rem;letter-spacing:-.01em}
.brand span{font-weight:500;opacity:.85}
.langs{display:flex;gap:.25rem;margin:0;padding:0;list-style:none}
.langs a{display:block;color:inherit;text-decoration:none;font-size:.9rem;padding:.3rem .7rem;border-radius:999px}
.langs a:hover{background:color-mix(in srgb,var(--on-brand) 14%,transparent)}
.langs a[aria-current]{background:color-mix(in srgb,var(--on-brand) 20%,transparent);font-weight:600}
.site-header :focus-visible{outline-color:var(--on-brand)}
.hero{background:var(--brand);color:var(--on-brand);padding:1.5rem 0 2.75rem}
.hero h1{margin:0;font-size:clamp(1.75rem,4.5vw,2.4rem);line-height:1.15;letter-spacing:-.02em}
.hero p{margin:.6rem 0 0;max-width:60ch;opacity:.92}
.search{display:flex;gap:.5rem;margin-top:1.5rem}
.search input{flex:1;min-width:0;font:inherit;color:var(--fg);background:var(--surface);border:0;border-radius:999px;padding:.8rem 1.2rem;box-shadow:0 1px 2px rgb(0 0 0/.08),0 8px 24px -12px rgb(0 0 0/.25)}
.search button{font:inherit;font-weight:600;border:0;border-radius:999px;padding:.8rem 1.3rem;cursor:pointer;background:var(--fg);color:var(--bg)}
.hero .search button{background:var(--on-brand);color:var(--brand)}
.hero :focus-visible{outline-color:var(--on-brand)}
main{display:block;padding:0 0 3rem}
main>.wrap{padding-top:2rem}
main:focus{outline:none}
h1,h2,h3{line-height:1.25;letter-spacing:-.01em}
.page-title{font-size:clamp(1.6rem,4vw,2.1rem);margin:.25rem 0 .5rem}
.section{margin-top:2.25rem}
.section:first-child{margin-top:0}
.section h2{font-size:1.15rem;margin:0 0 .75rem;display:flex;align-items:baseline;gap:.6rem;flex-wrap:wrap}
.count{font-size:.85rem;font-weight:500;color:var(--muted)}
.list{list-style:none;margin:0;padding:0;background:var(--surface);border-radius:1rem;box-shadow:0 1px 2px rgb(0 0 0/.05)}
.list li+li{box-shadow:inset 0 1px 0 var(--line)}
.list a{display:block;padding:.9rem 1.15rem;text-decoration:none;color:var(--fg)}
.list a:hover .item-title{color:var(--ink);text-decoration:underline}
.item-title{display:block;font-weight:600}
.item-snippet{display:block;margin-top:.15rem;color:var(--muted);font-size:.93rem;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.crumbs{font-size:.9rem;color:var(--muted)}
.crumbs ol{display:flex;flex-wrap:wrap;gap:.4rem;margin:0;padding:0;list-style:none}
.crumbs li+li::before{content:"›";margin-right:.4rem}
.meta{color:var(--muted);font-size:.9rem;margin:0 0 1.5rem}
.prose{max-width:70ch;font-size:1.05rem;line-height:1.7;overflow-wrap:anywhere}
.prose>:first-child{margin-top:0}
.prose h2{font-size:1.35rem;margin:2rem 0 .6rem}
.prose h3{font-size:1.15rem;margin:1.6rem 0 .5rem}
.prose h4,.prose h5,.prose h6{font-size:1rem;margin:1.4rem 0 .4rem}
.prose p,.prose ul,.prose ol,.prose blockquote,.prose pre,.prose table{margin:0 0 1.1rem}
.prose li+li{margin-top:.3rem}
.prose img{max-width:100%;height:auto;border-radius:.75rem}
.prose blockquote{margin-left:0;padding:.6rem 1rem;background:var(--fill);border-radius:.75rem;color:var(--muted)}
.prose code{font:.9em/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--fill);padding:.1em .35em;border-radius:.35em}
.prose pre{background:var(--fill);padding:1rem;border-radius:.75rem;overflow-x:auto}
.prose pre code{background:none;padding:0}
.prose table{border-collapse:collapse;display:block;overflow-x:auto}
.prose th,.prose td{padding:.45rem .75rem;text-align:left;box-shadow:inset 0 -1px 0 var(--line)}
.prose hr{border:0;height:1px;background:var(--line);margin:2rem 0}
.cta{margin-top:2.5rem;padding:1.4rem 1.5rem;border-radius:1rem;background:var(--fill);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1rem}
.cta h2{margin:0;font-size:1.1rem}
.cta p{margin:.2rem 0 0;color:var(--muted)}
.cta[hidden]{display:none}
.btn{font:inherit;font-weight:600;border:0;border-radius:999px;padding:.7rem 1.3rem;cursor:pointer;background:var(--brand);color:var(--on-brand)}
.empty{padding:1.5rem;border-radius:1rem;background:var(--fill);color:var(--muted)}
@media (max-width:30rem){.search{flex-direction:column}.search button{width:100%}.cta{flex-direction:column;align-items:flex-start}}
@media (prefers-reduced-motion:no-preference){a,.btn{transition:color .15s,background-color .15s}}
`.trim();
}
