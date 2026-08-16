/**
 * Top-level native verification document. It is served by the Worker so the
 * anti-framing policy is an actual HTTP response header (CSP frame-ancestors
 * is ignored when placed in a meta tag).
 */
export function mobileTurnstilePage(): Response {
  return new Response(MOBILE_TURNSTILE_HTML, {
    headers: {
      'Cache-Control': 'public, max-age=300',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'unsafe-inline' https://challenges.cloudflare.com; connect-src https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'",
      'Content-Type': 'text/html; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
  });
}

const MOBILE_TURNSTILE_HTML = String.raw`<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><meta name="referrer" content="no-referrer"><title>PromptSpend secure verification</title>
<style>:root{color-scheme:light dark;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}*{box-sizing:border-box}body{align-items:center;background:transparent;display:flex;justify-content:center;margin:0;min-height:150px;padding:10px}#widget{min-height:65px;width:min(100%,360px)}#status{color:#5f6b78;font-size:13px;line-height:1.45;margin:8px 0 0;text-align:center}@media(prefers-color-scheme:dark){#status{color:#93a0b4}}</style>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script></head>
<body><main aria-label="Secure anti-abuse verification"><div id="widget"></div><p id="status" role="status">Preparing the secure check…</p></main>
<script>(()=>{const p=new URLSearchParams(location.search),sitekey=p.get('sitekey')||'',nonce=p.get('nonce')||'',theme=p.get('theme')==='dark'?'dark':'light',status=document.getElementById('status'),send=(payload)=>{if(window.ReactNativeWebView&&typeof window.ReactNativeWebView.postMessage==='function')window.ReactNativeWebView.postMessage(JSON.stringify({...payload,nonce}))};if(!/^[0-9A-Za-z_-]{10,100}$/.test(sitekey)){status.textContent='The verification service is not configured.';send({type:'error',reason:'missing-sitekey'});return}if(!/^[0-9a-z-]{20,160}$/.test(nonce)){status.textContent='The verification request could not be validated.';send({type:'error',reason:'missing-nonce'});return}let attempts=0;const render=()=>{if(!window.turnstile){if(++attempts>80){status.textContent='The secure check could not load.';send({type:'error',reason:'load-timeout'});return}setTimeout(render,100);return}status.textContent='Complete the check to continue.';window.turnstile.render('#widget',{sitekey,theme,size:'flexible',action:'mobile_email_alerts',callback:(token)=>{status.textContent='Secure check complete.';send({type:'token',token})},'expired-callback':()=>{status.textContent='The check expired. Complete it again.';send({type:'expired'})},'error-callback':()=>{status.textContent='The secure check needs to be retried.';send({type:'error',reason:'challenge-error'})}})};render()})();</script></body></html>`;
