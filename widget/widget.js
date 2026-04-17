/**
 * Riddhi Live Chat Widget — RS Education & Solution
 * ─────────────────────────────────────────────────
 * Embed on ANY website with just 2 lines:
 *
 *   <script>
 *     window.RiddhiConfig = { apiUrl: 'https://your-api-domain.com' };
 *   </script>
 *   <script src="https://your-api-domain.com/widget/widget.js"></script>
 *
 * Optional config:
 *   window.RiddhiConfig = {
 *     apiUrl:    'https://your-api.com',   // Required
 *     position:  'right',                  // 'right' (default) or 'left'
 *     accentColor: '#6c3fe0',              // Widget accent color
 *   };
 */

(function () {
  'use strict';

  /* ── Config ────────────────────────────────────────────────────────────── */
  const cfg = window.RiddhiConfig || {};
  const API   = (cfg.apiUrl || '').replace(/\/$/, '');
  const POS   = cfg.position === 'left' ? 'left: 1.5rem;' : 'right: 1.5rem;';
  const PANEL_POS = cfg.position === 'left' ? 'left: 1.5rem;' : 'right: 1.5rem;';
  const COLOR = cfg.accentColor || '#6c3fe0';

  if (!API) {
    console.error('[RiddhiWidget] Please set window.RiddhiConfig.apiUrl before loading widget.js');
    return;
  }

  /* ── Inject Styles ─────────────────────────────────────────────────────── */
  const STYLE = `
    #riddhi-widget-wrap * { box-sizing: border-box; font-family: 'Inter', system-ui, sans-serif; margin: 0; padding: 0; }
    #riddhi-trigger {
      position: fixed; bottom: 1.5rem; ${POS} z-index: 99999;
      display: flex; align-items: center; gap: 10px;
      background: #1a1a2e; border: 1px solid rgba(255,255,255,0.12);
      border-radius: 999px; padding: 9px 16px 9px 9px;
      cursor: pointer; box-shadow: 0 8px 30px rgba(0,0,0,0.35);
      transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s;
    }
    #riddhi-trigger:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0,0,0,0.4); border-color: ${COLOR}; }
    #riddhi-trigger img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; object-position: top; border: 2px solid ${COLOR}; }
    #riddhi-trigger-text strong { display: block; font-size: 0.85rem; font-weight: 700; color: #eee; line-height: 1.2; }
    #riddhi-trigger-text span { font-size: 0.72rem; color: #888; }
    #riddhi-online-dot { width: 10px; height: 10px; background: #22c55e; border-radius: 50%; border: 2px solid #1a1a2e; position: absolute; bottom: 10px; left: 38px; animation: riddhi-pulse 2s infinite; }
    @keyframes riddhi-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.8)} }

    #riddhi-panel {
      display: none; flex-direction: column;
      position: fixed; bottom: calc(1.5rem + 74px); ${PANEL_POS} z-index: 99998;
      width: 340px; max-height: 520px;
      background: #12121f; border: 1px solid rgba(255,255,255,0.10);
      border-radius: 18px; overflow: hidden;
      box-shadow: 0 30px 80px rgba(0,0,0,0.55);
    }
    #riddhi-panel.open { display: flex; animation: riddhi-open .3s cubic-bezier(0.34,1.56,0.64,1); }
    @keyframes riddhi-open { from{opacity:0;transform:scale(.88) translateY(20px)} to{opacity:1;transform:scale(1) translateY(0)} }

    #riddhi-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 14px;
      background: linear-gradient(135deg, ${COLOR}cc, ${COLOR});
    }
    #riddhi-header-left { display: flex; align-items: center; gap: 10px; }
    #riddhi-header img { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; object-position: top; border: 2px solid rgba(255,255,255,.35); }
    #riddhi-header h3 { font-size: .92rem; font-weight: 700; color: #fff; }
    #riddhi-status { font-size: .7rem; color: rgba(255,255,255,.75); display: flex; align-items: center; gap: 4px; }
    #riddhi-status-dot { width: 6px; height: 6px; background: #22c55e; border-radius: 50%; display: inline-block; animation: riddhi-pulse 2s infinite; }
    #riddhi-close-btn { background: rgba(255,255,255,.15); border: none; color: #fff; width: 28px; height: 28px; border-radius: 7px; cursor: pointer; font-size: .85rem; display: flex; align-items: center; justify-content: center; transition: background .2s; }
    #riddhi-close-btn:hover { background: rgba(255,255,255,.28); }

    #riddhi-messages {
      flex: 1; overflow-y: auto; padding: 14px; display: flex;
      flex-direction: column; gap: 10px; scroll-behavior: smooth; min-height: 0;
    }
    #riddhi-messages::-webkit-scrollbar { width: 4px; }
    #riddhi-messages::-webkit-scrollbar-thumb { background: ${COLOR}66; border-radius: 99px; }

    .r-msg { max-width: 84%; padding: 9px 12px; border-radius: 16px; font-size: .86rem; line-height: 1.5; word-wrap: break-word; animation: riddhi-msg .25s ease-out; }
    @keyframes riddhi-msg { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    .r-msg.ai { align-self: flex-start; background: #1e1e38; color: #e8e8ff; border-radius: 16px 16px 16px 3px; border: 1px solid rgba(255,255,255,.08); }
    .r-msg.user { align-self: flex-end; background: ${COLOR}; color: #fff; border-radius: 16px 16px 3px 16px; }
    .r-msg time { display: block; font-size: .65rem; color: rgba(255,255,255,.4); margin-top: 4px; text-align: right; }
    .r-msg.ai time { text-align: left; }

    .r-typing { align-self: flex-start; background: #1e1e38; border: 1px solid rgba(255,255,255,.08); border-radius: 16px 16px 16px 3px; padding: 10px 14px; display: flex; gap: 5px; align-items: center; }
    .r-typing span { width: 6px; height: 6px; background: #6060a0; border-radius: 50%; animation: riddhi-bounce 1.2s ease-in-out infinite; }
    .r-typing span:nth-child(2) { animation-delay: .15s; }
    .r-typing span:nth-child(3) { animation-delay: .30s; }
    @keyframes riddhi-bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }

    .r-cursor::after { content:'▋'; animation: riddhi-blink .6s step-end infinite; }
    @keyframes riddhi-blink { 0%,100%{opacity:1} 50%{opacity:0} }

    #riddhi-input-area {
      display: flex; align-items: flex-end; gap: 7px;
      padding: 10px 12px; background: #12121f; border-top: 1px solid rgba(255,255,255,.08);
    }
    #riddhi-input {
      flex: 1; background: #1e1e38; border: 1px solid rgba(255,255,255,.10);
      border-radius: 12px; padding: 8px 12px; color: #e8e8ff;
      font-size: .86rem; outline: none; resize: none; max-height: 80px;
      line-height: 1.45; font-family: inherit; transition: border-color .2s;
    }
    #riddhi-input::placeholder { color: #4a4a6a; }
    #riddhi-input:focus { border-color: ${COLOR}; box-shadow: 0 0 0 3px ${COLOR}22; }
    #riddhi-send {
      width: 36px; height: 36px; flex-shrink: 0; border: none; border-radius: 10px;
      background: ${COLOR}; color: #fff; cursor: pointer; font-size: .85rem;
      display: flex; align-items: center; justify-content: center;
      transition: all .2s; box-shadow: 0 4px 12px ${COLOR}55;
    }
    #riddhi-send:hover { transform: translateY(-2px); box-shadow: 0 6px 18px ${COLOR}77; }
    #riddhi-send:disabled { opacity: .45; cursor: not-allowed; transform: none; box-shadow: none; }

    #riddhi-branding { text-align: center; font-size: .64rem; color: #3a3a5a; padding: 5px 0 8px; }
    #riddhi-branding a { color: ${COLOR}88; text-decoration: none; }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  /* ── Build HTML ─────────────────────────────────────────────────────────── */
  const AVATAR = 'https://img.freepik.com/free-photo/young-beautiful-smiling-female-consultant-office-laptop_176420-7614.jpg';

  const wrap = document.createElement('div');
  wrap.id = 'riddhi-widget-wrap';
  wrap.innerHTML = `
    <!-- Trigger Button -->
    <div id="riddhi-trigger" role="button" aria-label="Chat with Riddhi" tabindex="0">
      <div style="position:relative;">
        <img src="${AVATAR}" alt="Riddhi">
        <span id="riddhi-online-dot"></span>
      </div>
      <div id="riddhi-trigger-text">
        <strong>Riddhi</strong>
        <span>Ask me anything!</span>
      </div>
    </div>

    <!-- Chat Panel -->
    <div id="riddhi-panel" role="dialog" aria-label="Chat with Riddhi">
      <div id="riddhi-header">
        <div id="riddhi-header-left">
          <img src="${AVATAR}" alt="Riddhi">
          <div>
            <h3>Riddhi</h3>
            <div id="riddhi-status">
              <span id="riddhi-status-dot"></span>
              Online · RS Education
            </div>
          </div>
        </div>
        <button id="riddhi-close-btn" aria-label="Close chat">✕</button>
      </div>

      <div id="riddhi-messages"></div>

      <div id="riddhi-input-area">
        <textarea id="riddhi-input" rows="1" placeholder="Message Riddhi..." aria-label="Type your message"></textarea>
        <button id="riddhi-send" aria-label="Send message">&#10148;</button>
      </div>
      <div id="riddhi-branding">Powered by <a href="https://rseducation.in" target="_blank">RS Education</a></div>
    </div>
  `;
  document.body.appendChild(wrap);

  /* ── DOM refs ───────────────────────────────────────────────────────────── */
  const trigger   = document.getElementById('riddhi-trigger');
  const panel     = document.getElementById('riddhi-panel');
  const closeBtn  = document.getElementById('riddhi-close-btn');
  const messages  = document.getElementById('riddhi-messages');
  const input     = document.getElementById('riddhi-input');
  const sendBtn   = document.getElementById('riddhi-send');

  /* ── State ──────────────────────────────────────────────────────────────── */
  let history    = [];
  let streaming  = false;
  let greeted    = false;

  /* ── Helpers ────────────────────────────────────────────────────────────── */
  function now() {
    return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  function renderMd(t) {
    return t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
            .replace(/\*(.+?)\*/g,'<em>$1</em>')
            .replace(/\n/g,'<br>');
  }

  function scrollBottom() { messages.scrollTop = messages.scrollHeight; }

  function addMsg(text, role) {
    const d = document.createElement('div');
    d.className = `r-msg ${role}`;
    d.innerHTML = `${renderMd(text)}<time>${now()}</time>`;
    messages.appendChild(d);
    scrollBottom();
    return d;
  }

  function showTyping() {
    const d = document.createElement('div');
    d.className = 'r-typing'; d.id = 'r-typing';
    d.innerHTML = '<span></span><span></span><span></span>';
    messages.appendChild(d); scrollBottom();
  }
  function hideTyping() { document.getElementById('r-typing')?.remove(); }

  function autoResize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 80) + 'px';
  }

  /* ── Open / Close ───────────────────────────────────────────────────────── */
  function openPanel() {
    panel.classList.add('open');
    if (!greeted) { greeted = true; fetchGreeting(); }
    input.focus();
  }
  function closePanel() { panel.classList.remove('open'); }

  /* ── Initial Greeting (SSE) ─────────────────────────────────────────────── */
  async function fetchGreeting() {
    await streamSend('Hello! Introduce yourself warmly in 1-2 lines and ask how you can help.', true);
  }

  /* ── Stream via SSE ─────────────────────────────────────────────────────── */
  async function streamSend(query, isSystem = false) {
    if (streaming) return;
    streaming = true;
    sendBtn.disabled = true;

    if (!isSystem) {
      addMsg(query, 'user');
      history.push({ role: 'user', content: query });
    }

    showTyping();
    let bubble = null;
    let accText = '';

    try {
      const resp = await fetch(`${API}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, history: history.slice(-16) }),
      });

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text  = decoder.decode(value);
        const lines = text.split('\n').filter(l => l.startsWith('data: '));

        for (const line of lines) {
          const json = JSON.parse(line.slice(6));

          if (json.error) {
            hideTyping();
            addMsg('⚠️ ' + json.error, 'ai');
            break;
          }

          if (json.token) {
            if (!bubble) {
              hideTyping();
              bubble = document.createElement('div');
              bubble.className = 'r-msg ai r-cursor';
              bubble.innerHTML = '';
              messages.appendChild(bubble);
            }
            accText += json.token;
            bubble.innerHTML = renderMd(accText);
            scrollBottom();
          }

          if (json.done && bubble) {
            bubble.classList.remove('r-cursor');
            bubble.innerHTML += `<time>${now()}</time>`;
            history.push({ role: 'assistant', content: accText });
          }
        }
      }
    } catch (e) {
      hideTyping();
      addMsg('Connection error. Please try again or call us at **+91 7982131324**.', 'ai');
    }

    streaming = false;
    sendBtn.disabled = false;
  }

  /* ── Send Message ───────────────────────────────────────────────────────── */
  function sendMessage() {
    const q = input.value.trim();
    if (!q || streaming) return;
    input.value = '';
    autoResize();
    streamSend(q);
  }

  /* ── Events ─────────────────────────────────────────────────────────────── */
  trigger.addEventListener('click', openPanel);
  trigger.addEventListener('keydown', e => { if (e.key === 'Enter') openPanel(); });
  closeBtn.addEventListener('click', closePanel);
  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  input.addEventListener('input', autoResize);

})();
