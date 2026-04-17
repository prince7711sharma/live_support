# Riddhi — AI Live Chat API
### RS Education & Solution

A conversational AI counsellor API built with FastAPI + Groq (LLaMA 3.3 70B).  
Supports REST, Server-Sent Events streaming, and WebSocket.

---

## 🚀 Run Locally

```bash
# 1. Clone & enter
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd ai-call-assitant

# 2. Create virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

# 3. Install dependencies
pip install -r requirements.txt

# 4. Add your API key
# Create a .env file:
echo GROQ_API_KEY=your_key_here > .env

# 5. Start server
uvicorn app.main:app --reload
```

Open: http://localhost:8000/docs

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API info |
| POST | `/chat` | Single response |
| POST | `/chat/stream` | Streaming (SSE) — **use this in your website** |
| WS | `/ws/chat` | WebSocket |
| POST | `/leads` | Save student lead |
| GET | `/leads` | View all leads |
| GET | `/health` | Health check |
| GET | `/docs` | Swagger UI |

---

## 🌐 Embed on Your Website

```html
<script>
async function askRiddhi(userMessage) {
  const res = await fetch('https://YOUR_RENDER_URL/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: userMessage, history: [] })
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '));
    for (const line of lines) {
      const json = JSON.parse(line.slice(6));
      if (json.token) document.getElementById('reply').innerHTML += json.token;
    }
  }
}
</script>
<div id="reply"></div>
```

---

## ☁️ Deploy on Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Render auto-detects `render.yaml`
5. In **Environment Variables**, add:
   - `GROQ_API_KEY` = your Groq key
6. Click **Deploy**

Your live API URL: `https://riddhi-chat-api.onrender.com`

---

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | ✅ Yes | Get from [console.groq.com](https://console.groq.com) |

> ⚠️ Never commit `.env` to GitHub. It's in `.gitignore`.
