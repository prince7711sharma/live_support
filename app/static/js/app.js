/* ════════════════════════════════════════════════
   RS Education — Live Chat Support JavaScript
   Features:
   - Real-time streaming via WebSocket (with SSE fallback)
   - Full conversation memory (full history sent to backend)
   - Voice input (Web Speech API)
   - Text-to-speech output
   - Lead capture modal
   - Auto-resize textarea
   ════════════════════════════════════════════════ */

'use strict';

// ── DOM References ────────────────────────────────────────────────────────────
const chatPanel       = document.getElementById('chat-panel');
const chatInput       = document.getElementById('chat-input');
const sendBtn         = document.getElementById('send-btn');
const micBtn          = document.getElementById('mic-btn');
const micIcon         = document.getElementById('mic-icon');
const messagesEl      = document.getElementById('messages-container');
const quickRepliesEl  = document.getElementById('quick-replies');
const muteBtn         = document.getElementById('mute-btn');
const muteIcon        = document.getElementById('mute-icon');
const clearBtn        = document.getElementById('clear-btn');
const closeChatBtn    = document.getElementById('close-chat');
const aiTrigger       = document.getElementById('ai-trigger');
const leadModal       = document.getElementById('lead-modal');
const modalCloseBtn   = document.getElementById('modal-close');
const leadForm        = document.getElementById('lead-form');

// ── State ─────────────────────────────────────────────────────────────────────
let chatHistory  = [];   // Full OpenAI-style message history [{role, content}, ...]
let isMuted      = false;
let isRecording  = false;
let isStreaming  = false;
let ws           = null; // Active WebSocket connection
let reconnectTimer = null;

// ── Utility: Format Time ──────────────────────────────────────────────────────
function formatTime() {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// ── Utility: Escape HTML ──────────────────────────────────────────────────────
function escapeHTML(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ── Markdown-lite renderer (bold, italic, newlines, links) ────────────────────
function renderMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

// ── Add a message bubble ──────────────────────────────────────────────────────
function addMessage(content, role = 'ai', options = {}) {
  const bubble = document.createElement('div');
  bubble.className = `message ${role}`;
  if (options.id) bubble.id = options.id;

  const body = document.createElement('div');
  body.className = 'msg-body';
  body.innerHTML = renderMarkdown(content);
  bubble.appendChild(body);

  if (!options.hideTime) {
    const time = document.createElement('div');
    time.className = 'msg-time';
    time.textContent = formatTime();
    bubble.appendChild(time);
  }

  messagesEl.appendChild(bubble);
  scrollToBottom();
  return bubble;
}

// ── Scroll to bottom ──────────────────────────────────────────────────────────
function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── Typing Indicator ──────────────────────────────────────────────────────────
function showTyping() {
  const el = document.createElement('div');
  el.className = 'typing-bubble';
  el.id = 'typing-indicator';
  el.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}
function hideTyping() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

// ── Chat open/close ───────────────────────────────────────────────────────────
function openChat() {
  chatPanel.classList.add('active');
  aiTrigger.style.display = 'none';
  chatInput.focus();
  connectWebSocket(); // Ensure WS is live
}

function closeChat() {
  chatPanel.classList.remove('active');
  aiTrigger.style.display = '';
}

// ── WebSocket connection ──────────────────────────────────────────────────────
function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws/chat`);

  ws.onopen = () => {
    console.log('[WS] Connected');
    updateStatus('Online · Typically replies instantly', true);
  };

  ws.onclose = () => {
    console.log('[WS] Disconnected — will use SSE fallback');
    ws = null;
    updateStatus('Reconnecting...', false);
    // Retry after 5 s
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWebSocket, 5000);
  };

  ws.onerror = (err) => {
    console.warn('[WS] Error:', err);
    ws = null;
  };

  // Messages handled inside sendMessage() via ws.onmessage assignment
}

function updateStatus(text, online) {
  const statusEl = document.getElementById('chat-status');
  if (!statusEl) return;
  const dot = online ? '<span class="status-online-dot"></span>' : '';
  statusEl.innerHTML = `${dot} ${text}`;
}

// ── Main send function ────────────────────────────────────────────────────────
async function sendMessage() {
  const query = chatInput.value.trim();
  if (!query || isStreaming) return;

  // Hide quick replies after first message
  if (quickRepliesEl) quickRepliesEl.style.display = 'none';

  // Add user bubble
  addMessage(escapeHTML(query), 'user');
  chatHistory.push({ role: 'user', content: query });
  chatInput.value = '';
  autoResize();
  sendBtn.disabled = true;
  isStreaming = true;

  // Try WebSocket streaming first; fall back to SSE
  if (ws && ws.readyState === WebSocket.OPEN) {
    await sendViaWebSocket(query);
  } else {
    await sendViaSSE(query);
  }

  sendBtn.disabled = false;
  isStreaming = false;
}

// ── WebSocket streaming ───────────────────────────────────────────────────────
function sendViaWebSocket(query) {
  return new Promise((resolve) => {
    showTyping();
    let aiBubble = null;
    let accText = '';
    let firstToken = true;

    ws.send(JSON.stringify({ query, history: chatHistory.slice(-20) }));

    function onMessage(event) {
      const data = JSON.parse(event.data);

      if (data.error) {
        hideTyping();
        addMessage('⚠️ ' + data.error, 'ai');
        ws.removeEventListener('message', onMessage);
        resolve();
        return;
      }

      if (data.token) {
        if (firstToken) {
          hideTyping();
          aiBubble = addMessage('', 'ai', { id: 'streaming-bubble', hideTime: true });
          aiBubble.querySelector('.msg-body').classList.add('stream-cursor');
          firstToken = false;
        }
        accText += data.token;
        aiBubble.querySelector('.msg-body').innerHTML = renderMarkdown(accText);
        scrollToBottom();
      }

      if (data.done) {
        if (aiBubble) {
          aiBubble.querySelector('.msg-body').classList.remove('stream-cursor');
          const time = document.createElement('div');
          time.className = 'msg-time';
          time.textContent = formatTime();
          aiBubble.appendChild(time);
          aiBubble.id = '';
        }
        chatHistory.push({ role: 'assistant', content: accText });
        ws.removeEventListener('message', onMessage);
        speak(accText);
        checkLeadTrigger(accText);
        resolve();
      }
    }

    ws.addEventListener('message', onMessage);
  });
}

// ── SSE streaming fallback ────────────────────────────────────────────────────
async function sendViaSSE(query) {
  showTyping();
  let aiBubble = null;
  let accText = '';
  let firstToken = true;

  try {
    const response = await fetch('/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, history: chatHistory.slice(-20) }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split('\n').filter(l => l.startsWith('data: '));

      for (const line of lines) {
        const json = JSON.parse(line.slice(6));

        if (json.error) {
          hideTyping();
          addMessage('⚠️ ' + json.error, 'ai');
          return;
        }

        if (json.token) {
          if (firstToken) {
            hideTyping();
            aiBubble = addMessage('', 'ai', { id: 'streaming-bubble', hideTime: true });
            aiBubble.querySelector('.msg-body').classList.add('stream-cursor');
            firstToken = false;
          }
          accText += json.token;
          aiBubble.querySelector('.msg-body').innerHTML = renderMarkdown(accText);
          scrollToBottom();
        }

        if (json.done) {
          if (aiBubble) {
            aiBubble.querySelector('.msg-body').classList.remove('stream-cursor');
            const time = document.createElement('div');
            time.className = 'msg-time';
            time.textContent = formatTime();
            aiBubble.appendChild(time);
            aiBubble.id = '';
          }
          chatHistory.push({ role: 'assistant', content: accText });
          speak(accText);
          checkLeadTrigger(accText);
        }
      }
    }
  } catch (error) {
    hideTyping();
    addMessage("I'm having a connection issue right now. Please try again or call us at **+91 7982131324**.", 'ai');
    console.error('[SSE] Error:', error);
  }
}

// ── Lead Trigger Detection ────────────────────────────────────────────────────
function checkLeadTrigger(responseText) {
  const triggers = [
    'share your details',
    'connect you with',
    'senior counsellor',
    'call you',
    'reach out to you',
  ];
  const triggered = triggers.some(t => responseText.toLowerCase().includes(t));
  // Show form after 6+ messages OR if AI naturally suggests it
  if ((triggered || chatHistory.length >= 12) && !document.getElementById('lead-modal-shown')) {
    document.getElementById('lead-modal-shown')?.remove();
    setTimeout(() => showLeadModal(), 800);
  }
}

// ── Lead Modal ────────────────────────────────────────────────────────────────
function showLeadModal() {
  leadModal.style.display = 'flex';
}
function hideLeadModal() {
  leadModal.style.display = 'none';
}

// ── Clear Chat ────────────────────────────────────────────────────────────────
function clearChat() {
  chatHistory = [];
  messagesEl.innerHTML = '';
  quickRepliesEl.style.display = 'flex';
  setTimeout(() => sendInitialGreeting(), 400);
}

// ── Initial Greeting ──────────────────────────────────────────────────────────
function sendInitialGreeting() {
  sendViaSSE("Hello! Please introduce yourself warmly in 2 short lines and ask the student how you can help them today.");
}

// ── Voice Input Setup ─────────────────────────────────────────────────────────
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.lang = 'en-IN';
  recognition.interimResults = false;

  recognition.onresult = (e) => {
    chatInput.value = e.results[0][0].transcript;
    autoResize();
    stopRecording();
    sendMessage();
  };
  recognition.onerror = () => stopRecording();
  recognition.onend   = () => stopRecording();
}

function startRecording() {
  if (!recognition) { alert('Speech recognition not supported in this browser.'); return; }
  isRecording = true;
  micBtn.classList.add('recording');
  micIcon.className = 'fas fa-microphone-slash';
  recognition.start();
}

function stopRecording() {
  isRecording = false;
  micBtn.classList.remove('recording');
  micIcon.className = 'fas fa-microphone';
  try { recognition?.stop(); } catch(e) {}
}

// ── Text-to-Speech ────────────────────────────────────────────────────────────
const synth = window.speechSynthesis;
let voicesLoaded = false;

function getVoice() {
  const voices = synth.getVoices();
  return (
    voices.find(v => v.name.includes('Google UK English Female')) ||
    voices.find(v => v.name.includes('Zira')) ||
    voices.find(v => v.name.toLowerCase().includes('female')) ||
    voices.find(v => v.lang.startsWith('en')) ||
    voices[0]
  );
}

function speak(text) {
  if (isMuted || !synth) return;
  if (synth.speaking) synth.cancel();
  // Strip markdown for TTS
  const clean = text.replace(/\*\*/g,'').replace(/\*/g,'').replace(/`/g,'');
  const utter = new SpeechSynthesisUtterance(clean);
  utter.voice = getVoice();
  utter.rate = 1.0;
  utter.pitch = 1.05;
  synth.speak(utter);
}

// Load voices async
if (synth) {
  synth.onvoiceschanged = () => { voicesLoaded = true; };
}

// ── Auto-resize textarea ──────────────────────────────────────────────────────
function autoResize() {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
}

// ════════════════════════════════════════════════
// EVENT LISTENERS
// ════════════════════════════════════════════════

// Open / close chat
aiTrigger.addEventListener('click', openChat);
closeChatBtn.addEventListener('click', closeChat);
document.getElementById('header-chat-btn')?.addEventListener('click', openChat);
document.getElementById('hero-chat-btn')?.addEventListener('click', openChat);

// Send
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
chatInput.addEventListener('input', autoResize);

// Mic
micBtn.addEventListener('click', () => {
  if (isRecording) stopRecording();
  else startRecording();
});

// Mute toggle
muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  muteIcon.className = isMuted ? 'fas fa-volume-xmark' : 'fas fa-volume-up';
  if (isMuted && synth.speaking) synth.cancel();
});

// Clear chat
clearBtn.addEventListener('click', clearChat);

// Quick replies
quickRepliesEl?.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    chatInput.value = btn.dataset.msg || btn.textContent;
    openChat();
    sendMessage();
  });
});

// Modal close
modalCloseBtn.addEventListener('click', hideLeadModal);
leadModal.addEventListener('click', (e) => {
  if (e.target === leadModal) hideLeadModal();
});

// Lead form submit
leadForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name   = document.getElementById('lead-name').value.trim();
  const phone  = document.getElementById('lead-phone').value.trim();
  const course = document.getElementById('lead-course').value.trim();

  if (!name || !phone) return;

  const submitBtn = document.getElementById('submit-lead');
  submitBtn.textContent = 'Sending...';
  submitBtn.disabled = true;

  try {
    await fetch('/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, course }),
    });

    // Show success state in modal
    document.querySelector('.modal-card').innerHTML = `
      <div style="text-align:center; padding: 2rem 0;">
        <div style="font-size:2.5rem; margin-bottom:1rem;">🎉</div>
        <h3 style="margin-bottom:0.5rem;">You're all set, ${name}!</h3>
        <p style="color:var(--text-muted); font-size:0.9rem; line-height:1.6;">
          Our expert counsellor will call you on <strong>${phone}</strong> within 30 minutes.<br>
          We're excited to help you on your journey!
        </p>
      </div>
    `;
    speak(`Thank you ${name}! One of our expert counsellors will call you very shortly.`);

    // Add a confirmation msg in chat
    addMessage(`✅ Details received! Our counsellor will call **${name}** on ${phone} soon. 😊`, 'ai');
    chatHistory.push({ role: 'assistant', content: `I've noted your details. A counsellor will call ${name} on ${phone} shortly.` });

    // Mark modal as shown to prevent re-opening
    const marker = document.createElement('span');
    marker.id = 'lead-modal-shown';
    marker.style.display = 'none';
    document.body.appendChild(marker);

    setTimeout(hideLeadModal, 4000);
  } catch (err) {
    submitBtn.textContent = 'Connect Me Now';
    submitBtn.disabled = false;
    alert('Something went wrong. Please call us directly at +91 7982131324.');
  }
});

// ════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════
window.addEventListener('load', () => {
  // Start WebSocket eagerly
  connectWebSocket();

  // Send initial greeting when chat first opens
  // (We wait for user to open the panel — greeting fires on first openChat())
  let greeted = false;
  const originalOpen = openChat;
  window.openChatWithGreeting = function() {
    originalOpen();
    if (!greeted) {
      greeted = true;
      // Small delay so panel animation completes first
      setTimeout(() => {
        chatHistory = []; // Fresh start
        sendInitialGreeting();
      }, 350);
    }
  };

  // Patch trigger buttons to use greeting version
  aiTrigger.removeEventListener('click', openChat);
  aiTrigger.addEventListener('click', window.openChatWithGreeting);
  document.getElementById('header-chat-btn')?.removeEventListener('click', openChat);
  document.getElementById('header-chat-btn')?.addEventListener('click', window.openChatWithGreeting);
  document.getElementById('hero-chat-btn')?.removeEventListener('click', openChat);
  document.getElementById('hero-chat-btn')?.addEventListener('click', window.openChatWithGreeting);
});
