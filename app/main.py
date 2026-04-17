import os
import json
from typing import List, Dict

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from app.core.logic import FAQMatcher, LeadStore, RiddhiAgent, get_hybrid_response

load_dotenv()

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="RS Education — Riddhi AI Chat API",
    description="Pure REST + WebSocket API for the Riddhi live chat counsellor.",
    version="2.0.0",
)

# ── CORS (allow any website to call this API) ──────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Core services ──────────────────────────────────────────────────────────────
matcher      = FAQMatcher("app/data/knowledge.json")
lead_store   = LeadStore("leads.db")
agent        = RiddhiAgent(
    os.getenv("GROQ_API_KEY", ""),
    knowledge_context=matcher.get_context_summary(),
)

# ── Models ─────────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    query: str
    history: List[Dict[str, str]] = []

class LeadRequest(BaseModel):
    name: str
    phone: str
    course: str = ""

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/")
async def root():
    return {
        "api": "RS Education — Riddhi Chat API",
        "version": "2.0.0",
        "status": "online",
        "routes": {
            "POST /chat":         "Single response",
            "POST /chat/stream":  "Streaming (SSE)",
            "WS   /ws/chat":      "WebSocket",
            "POST /leads":        "Save lead",
            "GET  /leads":        "Get all leads",
            "GET  /health":       "Health check",
            "GET  /docs":         "Swagger UI",
        }
    }


@app.post("/chat")
async def chat(req: ChatRequest):
    try:
        response = get_hybrid_response(req.query, req.history, matcher, agent)
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """Server-Sent Events streaming. Each chunk: data: {"token":"..."} then data: {"done":true}"""
    match = matcher.get_match(req.query)
    query = req.query
    if match:
        query = f"{req.query}\n\n[CONTEXT: {match['answer']}]"

    def stream():
        try:
            for token in agent.stream_response(query, req.history):
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.websocket("/ws/chat")
async def ws_chat(ws: WebSocket):
    """WebSocket. Send: {"query":"...","history":[...]}  Receive: {"token":"..."} ... {"done":true}"""
    await ws.accept()
    try:
        while True:
            data    = json.loads(await ws.receive_text())
            query   = data.get("query", "").strip()
            history = data.get("history", [])
            if not query:
                await ws.send_text(json.dumps({"error": "Empty query"}))
                continue
            match = matcher.get_match(query)
            if match:
                query = f"{query}\n\n[CONTEXT: {match['answer']}]"
            try:
                for token in agent.stream_response(query, history):
                    await ws.send_text(json.dumps({"token": token}))
                await ws.send_text(json.dumps({"done": True}))
            except Exception as e:
                await ws.send_text(json.dumps({"error": str(e)}))
    except WebSocketDisconnect:
        pass


@app.post("/leads")
async def add_lead(req: LeadRequest):
    try:
        lead_store.add_lead(req.name, req.phone, req.course)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/leads")
async def get_leads():
    try:
        leads = lead_store.get_all_leads()
        return {"total": len(leads), "leads": leads}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "ok", "model": "llama-3.3-70b-versatile"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
