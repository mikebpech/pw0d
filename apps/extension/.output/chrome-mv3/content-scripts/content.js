var content=(function(){"use strict";function oe(t){return t}const R=globalThis.browser?.runtime?.id?globalThis.browser:globalThis.chrome,W="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";function B(t){const o=t.toUpperCase().replace(/[\s-]/g,"").replace(/=+$/,"");if(o.length===0)throw new Error("empty secret");let r=0,s=0;const u=[];for(const w of o){const g=W.indexOf(w);if(g===-1)throw new Error(`invalid base32 character: ${w}`);s=s<<5|g,r+=5,r>=8&&(u.push(s>>>r-8&255),r-=8)}return new Uint8Array(u)}function Y(t){const o=t.trim();if(!o.toLowerCase().startsWith("otpauth://"))return{secret:B(o),algorithm:"SHA-1",digits:6,period:30,issuer:null,account:null};const r=new URL(o);if(r.host!=="totp")throw new Error("only TOTP otpauth URIs are supported");const s=r.searchParams.get("secret");if(!s)throw new Error("otpauth URI is missing the secret");const u=(r.searchParams.get("algorithm")??"SHA1").toUpperCase(),w=u==="SHA256"?"SHA-256":u==="SHA512"?"SHA-512":"SHA-1",g=decodeURIComponent(r.pathname.replace(/^\//,"")),[y,S]=g.includes(":")?[g.slice(0,g.indexOf(":")),g.slice(g.indexOf(":")+1)]:[null,g||null];return{secret:B(s),algorithm:w,digits:Number(r.searchParams.get("digits")??6),period:Number(r.searchParams.get("period")??30),issuer:r.searchParams.get("issuer")??y,account:S}}async function q(t,o){const r=Math.floor(o/1e3/t.period),s=new Uint8Array(8);new DataView(s.buffer).setBigUint64(0,BigInt(r));const u=await crypto.subtle.importKey("raw",t.secret,{name:"HMAC",hash:t.algorithm},!1,["sign"]),w=new Uint8Array(await crypto.subtle.sign("HMAC",u,s)),g=w[w.length-1]&15,y=(w[g]&127)<<24|w[g+1]<<16|w[g+2]<<8|w[g+3];return String(y%10**t.digits).padStart(t.digits,"0")}async function O(t,o){const r=Y(t),s=await q(r,o),u=Math.floor(o/1e3)%r.period;return{code:s,secondsLeft:r.period-u,period:r.period}}function j(t){return R.runtime.sendMessage(t)}async function k(t){try{return await j(t)}catch{return null}}const K={matches:["http://*/*","https://*/*"],main(){const t=Q();function o(e){const n=e.getBoundingClientRect();return n.width>40&&n.height>10&&!e.disabled&&!e.readOnly}function r(e=document,n=[]){for(const l of e.querySelectorAll("*"))l instanceof HTMLInputElement&&n.push(l),l.shadowRoot&&r(l.shadowRoot,n);return n}function s(){return r().filter(e=>e.type==="password"&&o(e))}function u(e){const n=r().filter(o);let l=n.filter(p=>["email","text","tel"].includes(p.type));if(e.form){const p=l.filter(L=>L.form===e.form);p.length>0&&(l=p)}const h=n.indexOf(e);let x=null;for(const p of l)n.indexOf(p)<h&&(x=p);return x??l[0]??null}function w(e){return e.composedPath()[0]??e.target}function g(e){const n=s();if(n.length>=2)return"signup";for(const E of n)if((E.autocomplete||"").toLowerCase().includes("current-password"))return"login";const h=e.closest("form")??e.getRootNode();let x="";for(const E of h.querySelectorAll('button, input[type="submit"]'))x+=` ${E.textContent??""} ${E.value??""}`;const p=`${x} ${location.pathname} ${document.title}`.toLowerCase(),L=/sign\s?up|register|create\b.{0,16}account|join now|get started/.test(p);return/\blog\s?-?in\b|\bsign\s?-?in\b/.test(p)&&!L?"login":L||n.some(E=>(E.autocomplete||"").toLowerCase().includes("new-password"))?"signup":"login"}function y(e){if(e.type==="password")return!0;const n=`${e.name} ${e.id} ${e.autocomplete} ${e.placeholder}`.toLowerCase();return/user|email|login|account/.test(n)||S(e)}function S(e){if((e.autocomplete||"").toLowerCase().includes("one-time-code"))return!0;const n=`${e.name} ${e.id} ${e.placeholder} ${e.getAttribute("aria-label")??""}`.toLowerCase();return/\b(otp|2fa|mfa|totp)\b|one.?time.?(code|password)|verification.?code|security.?code|authenticator/.test(n)}const M=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;function I(e,n){M?.call(e,n),e.dispatchEvent(new Event("input",{bubbles:!0})),e.dispatchEvent(new Event("change",{bubbles:!0}))}function T(e,n,l){const h=s(),x=l?.type==="password"?l:h[0]??null,p=x?u(x):l??null;p&&e&&I(p,e),x&&n&&I(x,n)}let d=null;async function c(e){const n=await k({type:"menuState",url:location.href});if(!n||n.status==="logged-out"||n.disabled)return;const{status:l,matches:h,suggestions:x}=n,p=e.type==="password",L=async()=>{await k({type:"setSiteDisabled",url:location.href,disabled:!0}),i=null,t.syncIcons([],()=>{}),t.hideMenu()};if(l==="locked"){d=e,t.showMenu(e,{matches:[],suggestions:[],hint:null,showGenerate:!1,unlock:!0,onPick:()=>{},onSuggest:()=>{},onGenerate:()=>{},onUnlock:()=>{k({type:"openPopup"}),t.hideMenu()}});return}if(S(e)&&e.type!=="password"){const b=h.filter(C=>C.totp);if(b.length===0)return;d=e,t.showMenu(e,{matches:b,suggestions:[],hint:null,showGenerate:!1,pickLabel:"fill 2FA code",onPick:C=>{(async()=>{try{const{code:N}=await O(C.totp,Date.now());I(e,N)}catch{}t.hideMenu()})()},onSuggest:()=>{},onGenerate:()=>{}});return}const A=g(e),E={onPick:b=>{T(b.username,b.password,e),t.hideMenu(),b.totp&&(async()=>{try{const{code:C}=await O(b.totp,Date.now());await navigator.clipboard.writeText(C),t.toast(`2FA code for ${b.name} copied \u2014 paste when asked`)}catch{}})()},onSuggest:b=>{I(e,b),t.hideMenu()},onGenerate:async()=>{const b=await k({type:"generate"});if(!b)return;const{password:C}=b;for(const N of s())I(N,C);try{await navigator.clipboard.writeText(C)}catch{}t.hideMenu()},onDisableSite:L};if(A==="signup"){const b=()=>t.showMenu(e,{matches:h,suggestions:[],hint:null,showGenerate:p,...E});p?(d=e,t.showMenu(e,{matches:[],suggestions:[],hint:null,showGenerate:!0,collapsedCount:h.length,onExpandMatches:b,...E})):(x.length>0||h.length>0)&&(d=e,t.showMenu(e,{matches:[],suggestions:x,hint:null,showGenerate:!1,collapsedCount:h.length,onExpandMatches:b,...E}));return}if(h.length>0){d=e,t.showMenu(e,{matches:h,suggestions:[],hint:null,showGenerate:!1,...E});return}d=e,t.showMenu(e,{matches:[],suggestions:[],hint:"no logins saved for this site",showGenerate:!1,...E})}document.addEventListener("focusin",e=>{const n=w(e);!(n instanceof HTMLInputElement)||!y(n)||!o(n)||c(n)},!0),document.addEventListener("focusout",()=>{setTimeout(()=>{t.menuHasFocus()||t.hideMenu()},150)},!0),R.runtime.onMessage.addListener((e,n,l)=>{const h=e;if(h.type==="fillCredential"){T(h.username??"",h.password??"",d??void 0),l({ok:!0});return}if(h.type==="fillBestMatch")return(async()=>{const p=(await k({type:"credentialsForUrl",url:location.href}))?.matches[0];p&&T(p.username,p.password,d??void 0),l({ok:!!p})})(),!0});function v(){const e=s().find(l=>l.value);if(!e)return;const n=u(e)?.value??"";k({type:"loginSubmitted",url:location.href,username:n,password:e.value})}document.addEventListener("submit",v,!0),document.addEventListener("click",e=>{if(t.ownsEvent(e))return;const n=w(e);(n instanceof Element?n:null)?.closest('button[type="submit"], input[type="submit"], button')&&v()},!0),document.addEventListener("keydown",e=>{e.key==="Enter"&&w(e)instanceof HTMLInputElement&&v()},!0);function a(){const e=new Set;for(const n of s()){e.add(n);const l=u(n);l&&e.add(l)}for(const n of r()){if(!o(n))continue;const l=(n.autocomplete||"").toLowerCase();(l==="username"||l.includes("webauthn"))&&e.add(n),S(n)&&e.add(n)}return[...e].slice(0,6)}let i=null;async function f(){const e=Date.now();if(!i||e-i.at>5e3){const n=await k({type:"siteStatus",url:location.href});if(!n)return;i={status:n.status,disabled:n.disabled,at:e}}if(i.status==="logged-out"||i.disabled){t.syncIcons([],()=>{});return}t.syncIcons(a(),n=>{if(t.menuAnchor()===n){t.hideMenu();return}n.focus(),c(n)})}f();let m;new MutationObserver(()=>{clearTimeout(m),m=setTimeout(()=>{t.repositionIcons(),f()},350)}).observe(document.documentElement,{childList:!0,subtree:!0}),window.addEventListener("scroll",()=>t.repositionIcons(),{capture:!0,passive:!0}),window.addEventListener("resize",()=>t.repositionIcons(),{passive:!0}),(async()=>{const e=await k({type:"getPendingSave",url:location.href});e?.pending&&t.showSaveBanner(e.pending,e.candidates,async(n,l)=>{await k({type:"resolvePendingSave",accept:n,...l}),t.hideSaveBanner()})})()}},J=`
  :host { all: initial; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .menu, .banner {
    position: fixed;
    z-index: 2147483647;
    background: #26272b;
    color: #f2f1ee;
    border: 1px solid rgba(255,255,255,0.16);
    border-radius: 10px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.45);
    font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, sans-serif;
    overflow: hidden;
  }
  .menu { min-width: 260px; max-width: 340px; }
  .menu-header {
    padding: 7px 12px 6px;
    font: 600 10px/1 ui-monospace, monospace;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #9b9a96;
    border-bottom: 1px solid rgba(255,255,255,0.09);
  }
  .menu-header .zero { color: #c8f23f; }
  .row {
    display: flex; align-items: center; gap: 10px;
    width: 100%; padding: 9px 12px;
    background: none; border: none; color: inherit;
    font: inherit; text-align: left; cursor: pointer;
  }
  .row:hover { background: rgba(255,255,255,0.07); }
  .tile {
    width: 26px; height: 26px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid rgba(255,255,255,0.14); border-radius: 6px;
    font: 600 12px/1 ui-monospace, monospace;
    color: #9b9a96; text-transform: uppercase;
    background: rgba(255,255,255,0.04);
  }
  .meta { min-width: 0; }
  .name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .user { font: 11px ui-monospace, monospace; color: #9b9a96; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fill { margin-left: auto; font: 11px ui-monospace, monospace; color: #c8f23f; opacity: 0; }
  .row:hover .fill { opacity: 1; }
  .hint { padding: 9px 12px; font-size: 12px; color: #9b9a96; }
  .hintbtn {
    display: block; width: 100%; padding: 8px 12px;
    background: none; border: none; border-top: 1px solid rgba(255,255,255,0.09);
    color: #9b9a96; font: 12px ui-sans-serif, system-ui, sans-serif;
    text-align: left; cursor: pointer;
  }
  .hintbtn:hover { color: #f2f1ee; background: rgba(255,255,255,0.05); }
  .generate .tile { color: #c8f23f; border-color: rgba(200,242,63,0.35); }
  .generate { border-top: 1px solid rgba(255,255,255,0.09); }
  .toastmsg {
    position: fixed; bottom: 16px; right: 16px; z-index: 2147483647;
    max-width: 320px; padding: 10px 14px;
    background: #26272b; color: #f2f1ee;
    border: 1px solid rgba(200,242,63,0.4); border-radius: 9px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.45);
    font: 12.5px ui-sans-serif, system-ui, sans-serif;
    animation: reveal-toast 0.25s cubic-bezier(0.22, 1, 0.36, 1);
    transition: opacity 0.5s ease;
  }
  .toastmsg-out { opacity: 0; }
  @keyframes reveal-toast {
    from { opacity: 0; transform: translateY(8px); }
  }
  .pwicon {
    position: fixed;
    z-index: 2147483646;
    width: 20px; height: 20px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 5px;
    background: rgba(38,39,43,0.94);
    border: 1px solid rgba(255,255,255,0.18);
    padding: 0; cursor: pointer;
    opacity: 0; transform: scale(0.7);
    animation: pwicon-in 0.22s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    transition: transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
  }
  .pwicon:hover {
    transform: scale(1.12);
    border-color: rgba(200,242,63,0.65);
    box-shadow: 0 0 10px rgba(200,242,63,0.35);
  }
  .pwicon:active { transform: scale(0.95); }
  @keyframes pwicon-in {
    to { opacity: 0.95; transform: scale(1); }
  }
  .banner { top: 16px; right: 16px; width: 320px; padding: 14px; }
  .banner-title { font-weight: 600; margin-bottom: 2px; }
  .banner-sub { color: #9b9a96; font-size: 12px; word-break: break-all; }
  .banner-actions { display: flex; gap: 8px; margin-top: 12px; }
  .field { margin-top: 8px; }
  .field label {
    display: block; margin-bottom: 3px;
    font: 600 9.5px/1 ui-monospace, monospace;
    letter-spacing: 0.1em; text-transform: uppercase; color: #9b9a96;
  }
  .field input, .field select {
    width: 100%; height: 30px; padding: 0 8px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.16); border-radius: 7px;
    color: #f2f1ee; font: 12.5px ui-sans-serif, system-ui, sans-serif;
    outline: none;
  }
  .field input:focus, .field select:focus { border-color: rgba(200,242,63,0.55); }
  .field select option { background: #26272b; }
  .pwrow { display: flex; gap: 6px; }
  .pwrow input { font-family: ui-monospace, monospace; }
  .reveal {
    flex-shrink: 0; width: 32px; height: 30px; border-radius: 7px;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.16);
    color: #9b9a96; cursor: pointer; font-size: 12px;
  }
  .btn {
    flex: 1; padding: 7px 0; border-radius: 7px; border: none;
    font: 600 12.5px ui-sans-serif, system-ui, sans-serif; cursor: pointer;
  }
  .btn-primary { background: #c8f23f; color: #1d2705; }
  .btn-primary:hover { background: #d4f95c; }
  .btn-ghost { background: rgba(255,255,255,0.08); color: #f2f1ee; }
  .btn-ghost:hover { background: rgba(255,255,255,0.14); }
`;function Q(){const t=document.createElement("div");t.style.cssText="position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";const o=t.attachShadow({mode:"closed"}),r=document.createElement("style");r.textContent=J,o.appendChild(r),document.documentElement.appendChild(t);let s=null,u=null,w=null,g=!1,y=null;const S=new Map;function M(){s?.remove(),s=null,w=null,y&&(window.removeEventListener("scroll",y,!0),window.removeEventListener("resize",y),y=null)}const I=`<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
    <ellipse cx="6" cy="6" rx="3.4" ry="4.5" fill="none" stroke="#c8f23f" stroke-width="1.5"/>
    <line x1="3.6" y1="9.6" x2="8.4" y2="2.4" stroke="#c8f23f" stroke-width="1.2"/>
  </svg>`;function T(d,c){const v=d.getBoundingClientRect();if(v.width===0||v.bottom<0||v.top>innerHeight){c.style.display="none";return}c.style.display="flex",c.style.left=`${v.right-26}px`,c.style.top=`${v.top+(v.height-20)/2}px`}return{showMenu(d,c){M(),w=d,s=document.createElement("div"),s.className="menu",s.addEventListener("pointerenter",()=>g=!0),s.addEventListener("pointerleave",()=>g=!1);const v=document.createElement("div");v.className="menu-header",v.innerHTML='pw<span class="zero">0</span>d',s.appendChild(v);for(const a of c.matches.slice(0,6)){const i=document.createElement("button");i.type="button",i.className="row";const f=document.createElement("div");f.className="tile",f.textContent=(a.name.trim()[0]??"?").toUpperCase();const m=document.createElement("div");m.className="meta";const e=document.createElement("div");e.className="name",e.textContent=a.name;const n=document.createElement("div");n.className="user",n.textContent=a.username||"(no username)",m.append(e,n);const l=document.createElement("span");l.className="fill",l.textContent=`${c.pickLabel??"fill"} \u21B5`,i.append(f,m,l),i.addEventListener("click",()=>c.onPick(a)),s.appendChild(i)}for(const a of c.suggestions){const i=document.createElement("button");i.type="button",i.className="row";const f=document.createElement("div");f.className="tile",f.textContent="@";const m=document.createElement("div");m.className="meta";const e=document.createElement("div");e.className="name",e.textContent=a;const n=document.createElement("div");n.className="user",n.textContent="fill your usual email",m.append(e,n),i.append(f,m),i.addEventListener("click",()=>c.onSuggest(a)),s.appendChild(i)}if(c.hint){const a=document.createElement("div");a.className="hint",a.textContent=c.hint,s.appendChild(a)}if(c.unlock){const a=document.createElement("button");a.type="button",a.className="row generate";const i=document.createElement("div");i.className="tile",i.innerHTML=I;const f=document.createElement("div");f.className="meta";const m=document.createElement("div");m.className="name",m.textContent="Unlock pw0d";const e=document.createElement("div");e.className="user",e.textContent="Touch ID or master password",f.append(m,e),a.append(i,f),a.addEventListener("click",()=>c.onUnlock?.()),s.appendChild(a)}if(c.showGenerate){const a=document.createElement("button");a.type="button",a.className="row generate";const i=document.createElement("div");i.className="tile",i.textContent="\u2726";const f=document.createElement("div");f.className="meta";const m=document.createElement("div");m.className="name",m.textContent="Generate strong password";const e=document.createElement("div");e.className="user",e.textContent="fills the field & copies it",f.append(m,e),a.append(i,f),a.addEventListener("click",()=>c.onGenerate()),s.appendChild(a)}if(c.collapsedCount&&c.onExpandMatches){const a=document.createElement("button");a.type="button",a.className="hintbtn",a.textContent=`\u25B8 ${c.collapsedCount} saved login${c.collapsedCount===1?"":"s"} for this site`,a.addEventListener("click",()=>c.onExpandMatches?.()),s.appendChild(a)}if(c.onDisableSite){const a=document.createElement("button");a.type="button",a.className="hintbtn",a.textContent="\u2298 Turn off pw0d on this site",a.addEventListener("click",()=>c.onDisableSite?.()),s.appendChild(a)}o.appendChild(s),y=()=>{if(!s)return;const a=d.getBoundingClientRect();if(a.bottom<0||a.top>innerHeight)return M();s.style.left=`${Math.max(8,Math.min(a.left,innerWidth-s.offsetWidth-8))}px`,s.style.top=`${a.bottom+4}px`},y(),window.addEventListener("scroll",y,!0),window.addEventListener("resize",y)},hideMenu:M,menuHasFocus:()=>g,menuAnchor:()=>w,toast(d){const c=document.createElement("div");c.className="toastmsg",c.textContent=d,o.appendChild(c),setTimeout(()=>c.classList.add("toastmsg-out"),3600),setTimeout(()=>c.remove(),4100)},ownsEvent:d=>d.composedPath().includes(t),syncIcons(d,c){const v=new Set(d);for(const[a,i]of S)(!v.has(a)||!a.isConnected)&&(i.remove(),S.delete(a));for(const a of d){if(S.has(a))continue;const i=document.createElement("button");i.type="button",i.className="pwicon",i.title="pw0d",i.innerHTML=I,i.addEventListener("mousedown",f=>f.preventDefault()),i.addEventListener("click",()=>c(a)),o.appendChild(i),S.set(a,i),T(a,i)}},repositionIcons(){for(const[d,c]of S){if(!d.isConnected){c.remove(),S.delete(d);continue}T(d,c)}},showSaveBanner(d,c,v){u?.remove(),u=document.createElement("div"),u.className="banner";const a=document.createElement("div");a.className="banner-title",a.textContent=d.kind==="save"?"Save login to pw0d?":"Update password in pw0d?";const i=document.createElement("div");i.className="banner-sub",i.textContent=d.host,u.append(a,i);const f=(P,$)=>{const F=document.createElement("div");F.className="field";const _=document.createElement("label");return _.textContent=P,F.append(_,$),u.appendChild(F),F},m=document.createElement("select"),e=document.createElement("option");e.value="",e.textContent="Save as new login",m.appendChild(e);for(const P of c){const $=document.createElement("option");$.value=P.id,$.textContent=`Update \u201C${P.name}\u201D (${P.username||"no username"})`,m.appendChild($)}d.kind==="update"&&(m.value=d.itemId),c.length>0&&f("destination",m);const n=document.createElement("input");n.value=d.host;const l=f("name",n),h=document.createElement("input");h.value=d.username,f("username",h);const x=document.createElement("div");x.className="pwrow";const p=document.createElement("input");p.type="password",p.value=d.password;const L=document.createElement("button");L.type="button",L.className="reveal",L.textContent="\u{1F441}",L.addEventListener("click",()=>{p.type=p.type==="password"?"text":"password"}),x.append(p,L),f("password",x);const A=()=>{l.style.display=m.value?"none":""};m.addEventListener("change",A),A();const E=()=>({name:n.value,username:h.value,password:p.value,targetItemId:m.value||null}),b=document.createElement("div");b.className="banner-actions";const C=document.createElement("button");C.className="btn btn-primary",C.textContent="Save",C.addEventListener("click",()=>v(!0,E()));const N=document.createElement("button");N.className="btn btn-ghost",N.textContent="Not now",N.addEventListener("click",()=>v(!1,E())),b.append(C,N),u.appendChild(b),o.appendChild(u)},hideSaveBanner(){u?.remove(),u=null}}}function H(t,...o){}const X={debug:(...t)=>H(console.debug,...t),log:(...t)=>H(console.log,...t),warn:(...t)=>H(console.warn,...t),error:(...t)=>H(console.error,...t)};var z=class V extends Event{static EVENT_NAME=G("wxt:locationchange");constructor(o,r){super(V.EVENT_NAME,{}),this.newUrl=o,this.oldUrl=r}};function G(t){return`${R?.runtime?.id}:content:${t}`}const Z=typeof globalThis.navigation?.addEventListener=="function";function ee(t){let o,r=!1;return{run(){r||(r=!0,o=new URL(location.href),Z?globalThis.navigation.addEventListener("navigate",s=>{const u=new URL(s.destination.url);u.href!==o.href&&(window.dispatchEvent(new z(u,o)),o=u)},{signal:t.signal}):t.setInterval(()=>{const s=new URL(location.href);s.href!==o.href&&(window.dispatchEvent(new z(s,o)),o=s)},1e3))}}}var te=class U{static SCRIPT_STARTED_MESSAGE_TYPE=G("wxt:content-script-started");id;abortController;locationWatcher=ee(this);constructor(o,r){this.contentScriptName=o,this.options=r,this.id=Math.random().toString(36).slice(2),this.abortController=new AbortController,this.stopOldScripts(),this.listenForNewerScripts()}get signal(){return this.abortController.signal}abort(o){return this.abortController.abort(o)}get isInvalid(){return R.runtime?.id==null&&this.notifyInvalidated(),this.signal.aborted}get isValid(){return!this.isInvalid}onInvalidated(o){return this.signal.addEventListener("abort",o),()=>this.signal.removeEventListener("abort",o)}block(){return new Promise(()=>{})}setInterval(o,r){const s=setInterval(()=>{this.isValid&&o()},r);return this.onInvalidated(()=>clearInterval(s)),s}setTimeout(o,r){const s=setTimeout(()=>{this.isValid&&o()},r);return this.onInvalidated(()=>clearTimeout(s)),s}requestAnimationFrame(o){const r=requestAnimationFrame((...s)=>{this.isValid&&o(...s)});return this.onInvalidated(()=>cancelAnimationFrame(r)),r}requestIdleCallback(o,r){const s=requestIdleCallback((...u)=>{this.signal.aborted||o(...u)},r);return this.onInvalidated(()=>cancelIdleCallback(s)),s}addEventListener(o,r,s,u){r==="wxt:locationchange"&&this.isValid&&this.locationWatcher.run(),o.addEventListener?.(r.startsWith("wxt:")?G(r):r,s,{...u,signal:this.signal})}notifyInvalidated(){this.abort("Content script context invalidated"),X.debug(`Content script "${this.contentScriptName}" context invalidated`)}stopOldScripts(){document.dispatchEvent(new CustomEvent(U.SCRIPT_STARTED_MESSAGE_TYPE,{detail:{contentScriptName:this.contentScriptName,messageId:this.id}})),this.options?.noScriptStartedPostMessage||window.postMessage({type:U.SCRIPT_STARTED_MESSAGE_TYPE,contentScriptName:this.contentScriptName,messageId:this.id},"*")}verifyScriptStartedEvent(o){const r=o.detail?.contentScriptName===this.contentScriptName,s=o.detail?.messageId===this.id;return r&&!s}listenForNewerScripts(){const o=r=>{!(r instanceof CustomEvent)||!this.verifyScriptStartedEvent(r)||this.notifyInvalidated()};document.addEventListener(U.SCRIPT_STARTED_MESSAGE_TYPE,o),this.onInvalidated(()=>document.removeEventListener(U.SCRIPT_STARTED_MESSAGE_TYPE,o))}};function ae(){}function D(t,...o){}const ne={debug:(...t)=>D(console.debug,...t),log:(...t)=>D(console.log,...t),warn:(...t)=>D(console.warn,...t),error:(...t)=>D(console.error,...t)};return(async()=>{try{const{main:t,...o}=K;return await t(new te("content",o))}catch(t){throw ne.error('The content script "content" crashed on startup!',t),t}})()})();

content;