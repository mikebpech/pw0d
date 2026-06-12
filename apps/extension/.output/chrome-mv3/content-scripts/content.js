var content=(function(){"use strict";function oe(t){return t}const U=globalThis.browser?.runtime?.id?globalThis.browser:globalThis.chrome,W="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";function D(t){const n=t.toUpperCase().replace(/[\s-]/g,"").replace(/=+$/,"");if(n.length===0)throw new Error("empty secret");let r=0,s=0;const d=[];for(const b of n){const w=W.indexOf(b);if(w===-1)throw new Error(`invalid base32 character: ${b}`);s=s<<5|w,r+=5,r>=8&&(d.push(s>>>r-8&255),r-=8)}return new Uint8Array(d)}function Y(t){const n=t.trim();if(!n.toLowerCase().startsWith("otpauth://"))return{secret:D(n),algorithm:"SHA-1",digits:6,period:30,issuer:null,account:null};const r=new URL(n);if(r.host!=="totp")throw new Error("only TOTP otpauth URIs are supported");const s=r.searchParams.get("secret");if(!s)throw new Error("otpauth URI is missing the secret");const d=(r.searchParams.get("algorithm")??"SHA1").toUpperCase(),b=d==="SHA256"?"SHA-256":d==="SHA512"?"SHA-512":"SHA-1",w=decodeURIComponent(r.pathname.replace(/^\//,"")),[E,S]=w.includes(":")?[w.slice(0,w.indexOf(":")),w.slice(w.indexOf(":")+1)]:[null,w||null];return{secret:D(s),algorithm:b,digits:Number(r.searchParams.get("digits")??6),period:Number(r.searchParams.get("period")??30),issuer:r.searchParams.get("issuer")??E,account:S}}async function q(t,n){const r=Math.floor(n/1e3/t.period),s=new Uint8Array(8);new DataView(s.buffer).setBigUint64(0,BigInt(r));const d=await crypto.subtle.importKey("raw",t.secret,{name:"HMAC",hash:t.algorithm},!1,["sign"]),b=new Uint8Array(await crypto.subtle.sign("HMAC",d,s)),w=b[b.length-1]&15,E=(b[w]&127)<<24|b[w+1]<<16|b[w+2]<<8|b[w+3];return String(E%10**t.digits).padStart(t.digits,"0")}async function O(t,n){const r=Y(t),s=await q(r,n),d=Math.floor(n/1e3)%r.period;return{code:s,secondsLeft:r.period-d,period:r.period}}function j(t){return U.runtime.sendMessage(t)}async function k(t){try{return await j(t)}catch{return null}}const K={matches:["http://*/*","https://*/*"],main(){const t=Q();function n(e){const o=e.getBoundingClientRect();return o.width>40&&o.height>10&&!e.disabled&&!e.readOnly}function r(e=document,o=[]){for(const u of e.querySelectorAll("*"))u instanceof HTMLInputElement&&o.push(u),u.shadowRoot&&r(u.shadowRoot,o);return o}function s(){return r().filter(e=>e.type==="password"&&n(e))}function d(e){const o=r().filter(n);let u=o.filter(p=>["email","text","tel"].includes(p.type));if(e.form){const p=u.filter(y=>y.form===e.form);p.length>0&&(u=p)}const g=o.indexOf(e);let x=null;for(const p of u)o.indexOf(p)<g&&(x=p);return x??u[0]??null}function b(e){return e.composedPath()[0]??e.target}function w(e){const o=s();if(o.length>=2)return"signup";for(const f of o)if((f.autocomplete||"").toLowerCase().includes("current-password"))return"login";const g=e.closest("form")??e.getRootNode();let x="";for(const f of g.querySelectorAll('button, input[type="submit"]'))x+=` ${f.textContent??""} ${f.value??""}`;const p=`${x} ${location.pathname} ${document.title}`.toLowerCase(),y=/sign\s?up|register|create\b.{0,16}account|join now|get started/.test(p);return/\blog\s?-?in\b|\bsign\s?-?in\b/.test(p)&&!y?"login":y||o.some(f=>(f.autocomplete||"").toLowerCase().includes("new-password"))?"signup":"login"}function E(e){if(e.type==="password")return!0;const o=`${e.name} ${e.id} ${e.autocomplete} ${e.placeholder}`.toLowerCase();return/user|email|login|account/.test(o)||S(e)}function S(e){if((e.autocomplete||"").toLowerCase().includes("one-time-code"))return!0;const o=`${e.name} ${e.id} ${e.placeholder} ${e.getAttribute("aria-label")??""}`.toLowerCase();return/\b(otp|2fa|mfa|totp)\b|one.?time.?(code|password)|verification.?code|security.?code|authenticator/.test(o)}const M=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;function I(e,o){M?.call(e,o),e.dispatchEvent(new Event("input",{bubbles:!0})),e.dispatchEvent(new Event("change",{bubbles:!0}))}function T(e,o,u){const g=s(),x=u?.type==="password"?u:g[0]??null,p=x?d(x):u??null;p&&e&&I(p,e),x&&o&&I(x,o)}let l=null;async function c(e){const o=await k({type:"menuState",url:location.href});if(!o||o.status==="logged-out")return;const{status:u,matches:g,suggestions:x}=o,p=e.type==="password";if(u==="locked"){l=e,t.showMenu(e,{matches:[],suggestions:[],hint:null,showGenerate:!1,unlock:!0,onPick:()=>{},onSuggest:()=>{},onGenerate:()=>{},onUnlock:()=>{k({type:"openPopup"}),t.hideMenu()}});return}if(S(e)&&e.type!=="password"){const f=g.filter(C=>C.totp);if(f.length===0)return;l=e,t.showMenu(e,{matches:f,suggestions:[],hint:null,showGenerate:!1,pickLabel:"fill 2FA code",onPick:C=>{(async()=>{try{const{code:N}=await O(C.totp,Date.now());I(e,N)}catch{}t.hideMenu()})()},onSuggest:()=>{},onGenerate:()=>{}});return}const y=w(e),L={onPick:f=>{T(f.username,f.password,e),t.hideMenu(),f.totp&&(async()=>{try{const{code:C}=await O(f.totp,Date.now());await navigator.clipboard.writeText(C),t.toast(`2FA code for ${f.name} copied \u2014 paste when asked`)}catch{}})()},onSuggest:f=>{I(e,f),t.hideMenu()},onGenerate:async()=>{const f=await k({type:"generate"});if(!f)return;const{password:C}=f;for(const N of s())I(N,C);try{await navigator.clipboard.writeText(C)}catch{}t.hideMenu()}};if(y==="signup"){const f=()=>t.showMenu(e,{matches:g,suggestions:[],hint:null,showGenerate:p,...L});p?(l=e,t.showMenu(e,{matches:[],suggestions:[],hint:null,showGenerate:!0,collapsedCount:g.length,onExpandMatches:f,...L})):(x.length>0||g.length>0)&&(l=e,t.showMenu(e,{matches:[],suggestions:x,hint:null,showGenerate:!1,collapsedCount:g.length,onExpandMatches:f,...L}));return}if(g.length>0){l=e,t.showMenu(e,{matches:g,suggestions:[],hint:null,showGenerate:!1,...L});return}l=e,t.showMenu(e,{matches:[],suggestions:[],hint:"no logins saved for this site",showGenerate:!1,...L})}document.addEventListener("focusin",e=>{const o=b(e);!(o instanceof HTMLInputElement)||!E(o)||!n(o)||c(o)},!0),document.addEventListener("focusout",()=>{setTimeout(()=>{t.menuHasFocus()||t.hideMenu()},150)},!0),U.runtime.onMessage.addListener((e,o,u)=>{const g=e;if(g.type==="fillCredential"){T(g.username??"",g.password??"",l??void 0),u({ok:!0});return}if(g.type==="fillBestMatch")return(async()=>{const p=(await k({type:"credentialsForUrl",url:location.href}))?.matches[0];p&&T(p.username,p.password,l??void 0),u({ok:!!p})})(),!0});function v(){const e=s().find(u=>u.value);if(!e)return;const o=d(e)?.value??"";k({type:"loginSubmitted",url:location.href,username:o,password:e.value})}document.addEventListener("submit",v,!0),document.addEventListener("click",e=>{if(t.ownsEvent(e))return;const o=b(e);(o instanceof Element?o:null)?.closest('button[type="submit"], input[type="submit"], button')&&v()},!0),document.addEventListener("keydown",e=>{e.key==="Enter"&&b(e)instanceof HTMLInputElement&&v()},!0);function a(){return r().filter(e=>n(e)&&E(e)).slice(0,8)}let i=null;async function h(){const e=Date.now();if(!i||e-i.at>5e3){const o=await k({type:"getState"});if(!o)return;i={status:o.status,at:e}}if(i.status==="logged-out"){t.syncIcons([],()=>{});return}t.syncIcons(a(),o=>{if(t.menuAnchor()===o){t.hideMenu();return}o.focus(),c(o)})}h();let m;new MutationObserver(()=>{clearTimeout(m),m=setTimeout(()=>{t.repositionIcons(),h()},350)}).observe(document.documentElement,{childList:!0,subtree:!0}),window.addEventListener("scroll",()=>t.repositionIcons(),{capture:!0,passive:!0}),window.addEventListener("resize",()=>t.repositionIcons(),{passive:!0}),(async()=>{const e=await k({type:"getPendingSave",url:location.href});e?.pending&&t.showSaveBanner(e.pending,e.candidates,async(o,u)=>{await k({type:"resolvePendingSave",accept:o,...u}),t.hideSaveBanner()})})()}},J=`
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
`;function Q(){const t=document.createElement("div");t.style.cssText="position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";const n=t.attachShadow({mode:"closed"}),r=document.createElement("style");r.textContent=J,n.appendChild(r),document.documentElement.appendChild(t);let s=null,d=null,b=null,w=!1,E=null;const S=new Map;function M(){s?.remove(),s=null,b=null,E&&(window.removeEventListener("scroll",E,!0),window.removeEventListener("resize",E),E=null)}const I=`<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
    <ellipse cx="6" cy="6" rx="3.4" ry="4.5" fill="none" stroke="#c8f23f" stroke-width="1.5"/>
    <line x1="3.6" y1="9.6" x2="8.4" y2="2.4" stroke="#c8f23f" stroke-width="1.2"/>
  </svg>`;function T(l,c){const v=l.getBoundingClientRect();if(v.width===0||v.bottom<0||v.top>innerHeight){c.style.display="none";return}c.style.display="flex",c.style.left=`${v.right-26}px`,c.style.top=`${v.top+(v.height-20)/2}px`}return{showMenu(l,c){M(),b=l,s=document.createElement("div"),s.className="menu",s.addEventListener("pointerenter",()=>w=!0),s.addEventListener("pointerleave",()=>w=!1);const v=document.createElement("div");v.className="menu-header",v.innerHTML='pw<span class="zero">0</span>d',s.appendChild(v);for(const a of c.matches.slice(0,6)){const i=document.createElement("button");i.type="button",i.className="row";const h=document.createElement("div");h.className="tile",h.textContent=(a.name.trim()[0]??"?").toUpperCase();const m=document.createElement("div");m.className="meta";const e=document.createElement("div");e.className="name",e.textContent=a.name;const o=document.createElement("div");o.className="user",o.textContent=a.username||"(no username)",m.append(e,o);const u=document.createElement("span");u.className="fill",u.textContent=`${c.pickLabel??"fill"} \u21B5`,i.append(h,m,u),i.addEventListener("click",()=>c.onPick(a)),s.appendChild(i)}for(const a of c.suggestions){const i=document.createElement("button");i.type="button",i.className="row";const h=document.createElement("div");h.className="tile",h.textContent="@";const m=document.createElement("div");m.className="meta";const e=document.createElement("div");e.className="name",e.textContent=a;const o=document.createElement("div");o.className="user",o.textContent="fill your usual email",m.append(e,o),i.append(h,m),i.addEventListener("click",()=>c.onSuggest(a)),s.appendChild(i)}if(c.hint){const a=document.createElement("div");a.className="hint",a.textContent=c.hint,s.appendChild(a)}if(c.unlock){const a=document.createElement("button");a.type="button",a.className="row generate";const i=document.createElement("div");i.className="tile",i.innerHTML=I;const h=document.createElement("div");h.className="meta";const m=document.createElement("div");m.className="name",m.textContent="Unlock pw0d";const e=document.createElement("div");e.className="user",e.textContent="Touch ID or master password",h.append(m,e),a.append(i,h),a.addEventListener("click",()=>c.onUnlock?.()),s.appendChild(a)}if(c.showGenerate){const a=document.createElement("button");a.type="button",a.className="row generate";const i=document.createElement("div");i.className="tile",i.textContent="\u2726";const h=document.createElement("div");h.className="meta";const m=document.createElement("div");m.className="name",m.textContent="Generate strong password";const e=document.createElement("div");e.className="user",e.textContent="fills the field & copies it",h.append(m,e),a.append(i,h),a.addEventListener("click",()=>c.onGenerate()),s.appendChild(a)}if(c.collapsedCount&&c.onExpandMatches){const a=document.createElement("button");a.type="button",a.className="hintbtn",a.textContent=`\u25B8 ${c.collapsedCount} saved login${c.collapsedCount===1?"":"s"} for this site`,a.addEventListener("click",()=>c.onExpandMatches?.()),s.appendChild(a)}n.appendChild(s),E=()=>{if(!s)return;const a=l.getBoundingClientRect();if(a.bottom<0||a.top>innerHeight)return M();s.style.left=`${Math.max(8,Math.min(a.left,innerWidth-s.offsetWidth-8))}px`,s.style.top=`${a.bottom+4}px`},E(),window.addEventListener("scroll",E,!0),window.addEventListener("resize",E)},hideMenu:M,menuHasFocus:()=>w,menuAnchor:()=>b,toast(l){const c=document.createElement("div");c.className="toastmsg",c.textContent=l,n.appendChild(c),setTimeout(()=>c.classList.add("toastmsg-out"),3600),setTimeout(()=>c.remove(),4100)},ownsEvent:l=>l.composedPath().includes(t),syncIcons(l,c){const v=new Set(l);for(const[a,i]of S)(!v.has(a)||!a.isConnected)&&(i.remove(),S.delete(a));for(const a of l){if(S.has(a))continue;const i=document.createElement("button");i.type="button",i.className="pwicon",i.title="pw0d",i.innerHTML=I,i.addEventListener("mousedown",h=>h.preventDefault()),i.addEventListener("click",()=>c(a)),n.appendChild(i),S.set(a,i),T(a,i)}},repositionIcons(){for(const[l,c]of S){if(!l.isConnected){c.remove(),S.delete(l);continue}T(l,c)}},showSaveBanner(l,c,v){d?.remove(),d=document.createElement("div"),d.className="banner";const a=document.createElement("div");a.className="banner-title",a.textContent=l.kind==="save"?"Save login to pw0d?":"Update password in pw0d?";const i=document.createElement("div");i.className="banner-sub",i.textContent=l.host,d.append(a,i);const h=(A,P)=>{const G=document.createElement("div");G.className="field";const _=document.createElement("label");return _.textContent=A,G.append(_,P),d.appendChild(G),G},m=document.createElement("select"),e=document.createElement("option");e.value="",e.textContent="Save as new login",m.appendChild(e);for(const A of c){const P=document.createElement("option");P.value=A.id,P.textContent=`Update \u201C${A.name}\u201D (${A.username||"no username"})`,m.appendChild(P)}l.kind==="update"&&(m.value=l.itemId),c.length>0&&h("destination",m);const o=document.createElement("input");o.value=l.host;const u=h("name",o),g=document.createElement("input");g.value=l.username,h("username",g);const x=document.createElement("div");x.className="pwrow";const p=document.createElement("input");p.type="password",p.value=l.password;const y=document.createElement("button");y.type="button",y.className="reveal",y.textContent="\u{1F441}",y.addEventListener("click",()=>{p.type=p.type==="password"?"text":"password"}),x.append(p,y),h("password",x);const L=()=>{u.style.display=m.value?"none":""};m.addEventListener("change",L),L();const f=()=>({name:o.value,username:g.value,password:p.value,targetItemId:m.value||null}),C=document.createElement("div");C.className="banner-actions";const N=document.createElement("button");N.className="btn btn-primary",N.textContent="Save",N.addEventListener("click",()=>v(!0,f()));const F=document.createElement("button");F.className="btn btn-ghost",F.textContent="Not now",F.addEventListener("click",()=>v(!1,f())),C.append(N,F),d.appendChild(C),n.appendChild(d)},hideSaveBanner(){d?.remove(),d=null}}}function R(t,...n){}const X={debug:(...t)=>R(console.debug,...t),log:(...t)=>R(console.log,...t),warn:(...t)=>R(console.warn,...t),error:(...t)=>R(console.error,...t)};var z=class V extends Event{static EVENT_NAME=B("wxt:locationchange");constructor(n,r){super(V.EVENT_NAME,{}),this.newUrl=n,this.oldUrl=r}};function B(t){return`${U?.runtime?.id}:content:${t}`}const Z=typeof globalThis.navigation?.addEventListener=="function";function ee(t){let n,r=!1;return{run(){r||(r=!0,n=new URL(location.href),Z?globalThis.navigation.addEventListener("navigate",s=>{const d=new URL(s.destination.url);d.href!==n.href&&(window.dispatchEvent(new z(d,n)),n=d)},{signal:t.signal}):t.setInterval(()=>{const s=new URL(location.href);s.href!==n.href&&(window.dispatchEvent(new z(s,n)),n=s)},1e3))}}}var te=class ${static SCRIPT_STARTED_MESSAGE_TYPE=B("wxt:content-script-started");id;abortController;locationWatcher=ee(this);constructor(n,r){this.contentScriptName=n,this.options=r,this.id=Math.random().toString(36).slice(2),this.abortController=new AbortController,this.stopOldScripts(),this.listenForNewerScripts()}get signal(){return this.abortController.signal}abort(n){return this.abortController.abort(n)}get isInvalid(){return U.runtime?.id==null&&this.notifyInvalidated(),this.signal.aborted}get isValid(){return!this.isInvalid}onInvalidated(n){return this.signal.addEventListener("abort",n),()=>this.signal.removeEventListener("abort",n)}block(){return new Promise(()=>{})}setInterval(n,r){const s=setInterval(()=>{this.isValid&&n()},r);return this.onInvalidated(()=>clearInterval(s)),s}setTimeout(n,r){const s=setTimeout(()=>{this.isValid&&n()},r);return this.onInvalidated(()=>clearTimeout(s)),s}requestAnimationFrame(n){const r=requestAnimationFrame((...s)=>{this.isValid&&n(...s)});return this.onInvalidated(()=>cancelAnimationFrame(r)),r}requestIdleCallback(n,r){const s=requestIdleCallback((...d)=>{this.signal.aborted||n(...d)},r);return this.onInvalidated(()=>cancelIdleCallback(s)),s}addEventListener(n,r,s,d){r==="wxt:locationchange"&&this.isValid&&this.locationWatcher.run(),n.addEventListener?.(r.startsWith("wxt:")?B(r):r,s,{...d,signal:this.signal})}notifyInvalidated(){this.abort("Content script context invalidated"),X.debug(`Content script "${this.contentScriptName}" context invalidated`)}stopOldScripts(){document.dispatchEvent(new CustomEvent($.SCRIPT_STARTED_MESSAGE_TYPE,{detail:{contentScriptName:this.contentScriptName,messageId:this.id}})),this.options?.noScriptStartedPostMessage||window.postMessage({type:$.SCRIPT_STARTED_MESSAGE_TYPE,contentScriptName:this.contentScriptName,messageId:this.id},"*")}verifyScriptStartedEvent(n){const r=n.detail?.contentScriptName===this.contentScriptName,s=n.detail?.messageId===this.id;return r&&!s}listenForNewerScripts(){const n=r=>{!(r instanceof CustomEvent)||!this.verifyScriptStartedEvent(r)||this.notifyInvalidated()};document.addEventListener($.SCRIPT_STARTED_MESSAGE_TYPE,n),this.onInvalidated(()=>document.removeEventListener($.SCRIPT_STARTED_MESSAGE_TYPE,n))}};function re(){}function H(t,...n){}const ne={debug:(...t)=>H(console.debug,...t),log:(...t)=>H(console.log,...t),warn:(...t)=>H(console.warn,...t),error:(...t)=>H(console.error,...t)};return(async()=>{try{const{main:t,...n}=K;return await t(new te("content",n))}catch(t){throw ne.error('The content script "content" crashed on startup!',t),t}})()})();

content;