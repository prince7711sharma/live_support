import json
import os
import sqlite3
import random
from typing import Dict, List, Optional, AsyncGenerator
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from groq import Groq, AuthenticationError, RateLimitError, APIConnectionError
from dotenv import load_dotenv

load_dotenv()


class FAQMatcher:
    def __init__(self, knowledge_path: str):
        with open(knowledge_path, "r", encoding="utf-8") as f:
            self.data = json.load(f)

        self.faqs = self.data["faqs"]
        # Add org info and services as virtual FAQs
        self.faqs.append({
            "question": "What is RS Education?",
            "answer": self.data["org_info"]["description"]
        })
        self.faqs.append({
            "question": "Tell me about your services",
            "answer": "Our services include: " + ", ".join(self.data["services"])
        })
        self.faqs.append({
            "question": "Who is the founder?",
            "answer": f"RS Education & Solution was founded by {self.data['org_info']['founder']} in {self.data['org_info']['founded']}."
        })
        self.faqs.append({
            "question": "Where are you located?",
            "answer": f"We are located in {self.data['org_info']['location']}. You can contact us at {self.data['org_info']['contact']['phone']}."
        })

        self.questions = [faq["question"] for faq in self.faqs]
        self.vectorizer = TfidfVectorizer().fit(self.questions)
        self.tfidf_matrix = self.vectorizer.transform(self.questions)

    def get_match(self, query: str, threshold: float = 0.45) -> Optional[Dict]:
        query_vec = self.vectorizer.transform([query])
        similarities = cosine_similarity(query_vec, self.tfidf_matrix).flatten()
        idx = np.argmax(similarities)
        if similarities[idx] >= threshold:
            return self.faqs[idx]
        return None

    def get_context_summary(self) -> str:
        """Return a compact summary of org info for the AI system prompt."""
        org = self.data["org_info"]
        services = self.data["services"]
        colleges = self.data.get("colleges", [])
        college_names = [c["name"] for c in colleges[:8]]
        return f"""
ORGANIZATION: {org['name']}
Founder: {org['founder']} | Founded: {org['founded']} | Experience: {org['experience']}
Location: {org['location']} | Phone: {org['contact']['phone']} | Email: {org['contact']['email']}
Mission: {org['mission']}

SERVICES WE OFFER:
{chr(10).join(f'  - {s}' for s in services)}

PARTNER COLLEGES (sample): {', '.join(college_names)} and 200+ more nationwide.

SUCCESS HIGHLIGHTS:
{chr(10).join(f'  - {s}' for s in org['success_stories'])}
"""


class LeadStore:
    def __init__(self, db_path: str = "leads.db"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        c.execute("""
            CREATE TABLE IF NOT EXISTS leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                phone TEXT,
                course TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        conn.close()

    def add_lead(self, name: str, phone: str, course: str):
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        c.execute(
            "INSERT INTO leads (name, phone, course) VALUES (?, ?, ?)",
            (name, phone, course)
        )
        conn.commit()
        conn.close()

    def get_all_leads(self) -> List[Dict]:
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        c.execute("SELECT id, name, phone, course, timestamp FROM leads ORDER BY timestamp DESC")
        rows = c.fetchall()
        conn.close()
        return [{"id": r[0], "name": r[1], "phone": r[2], "course": r[3], "timestamp": r[4]} for r in rows]


class RiddhiAgent:
    def __init__(self, api_key: str, knowledge_context: str = ""):
        self.client = Groq(api_key=api_key)
        self.knowledge_context = knowledge_context
        self.system_prompt = f"""You are Riddhi, a warm, genuine, and highly experienced student counsellor at RS Education & Solution. You have 12+ years of experience helping students find the right colleges, courses, and career paths.

IMPORTANT RULES — READ CAREFULLY:
1. You are a REAL PERSON having a REAL CONVERSATION. Never sound robotic or scripted.
2. ANSWER QUESTIONS DIRECTLY and completely. Do NOT avoid giving real answers.
3. NEVER give the same response twice. Vary your tone, vocabulary, and structure every time.
4. **BREVITY IS MANDATORY** — Keep every reply to 3–4 short sentences MAX. No long paragraphs. No bullet lists unless the user asks for them.
5. Ask ONE short follow-up question at the end to keep the conversation going.
5. Use warm, natural language with slight fillers like "Actually," "You know," "I'd say," "Honestly."
6. Express genuine emotion — be excited about good options, empathetic about challenges.
7. ONLY redirect to a human counsellor when the student explicitly asks for one, or when the query is highly specific (e.g., exact fee breakdown, seat availability for current year).
8. DO NOT always say "please share your details below" — that makes you sound like a bot. Only say it once, naturally, when truly needed.
9. Remember what the student said earlier in the conversation and refer back to it.
10. If asked about colleges, courses, scholarships — GIVE real, helpful information from your knowledge base.

YOUR KNOWLEDGE BASE:
{knowledge_context}

YOUR PERSONALITY:
- Warm and approachable, like a trusted elder sibling
- Enthusiastic about education and students' futures
- Honest — acknowledge when you don't know something rather than deflecting
- Never pushy or salesy — genuinely helpful first

CONVERSATION STYLE:
- Short, punchy sentences mixed with longer explanations
- Use emojis sparingly but naturally (1–2 per message max)
- Break long responses into readable paragraphs
- Acknowledge what the student said before responding
"""

    def get_response(self, query: str, history: List[Dict]) -> str:
        messages = [{"role": "system", "content": self.system_prompt}]
        # Keep last 10 exchanges (20 messages) for rich conversational context
        messages.extend(history[-20:])
        messages.append({"role": "user", "content": query})

        completion = self.client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.82,
            max_tokens=180,
            top_p=0.9,
            frequency_penalty=0.4,
            presence_penalty=0.3,
        )
        return completion.choices[0].message.content

    def stream_response(self, query: str, history: List[Dict]):
        """Generator that streams the response token by token."""
        messages = [{"role": "system", "content": self.system_prompt}]
        messages.extend(history[-20:])
        messages.append({"role": "user", "content": query})

        stream = self.client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.82,
            max_tokens=180,
            top_p=0.9,
            frequency_penalty=0.4,
            presence_penalty=0.3,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta


def get_hybrid_response(
    query: str,
    history: List[Dict],
    matcher: FAQMatcher,
    agent: RiddhiAgent
) -> str:
    """
    Returns a complete AI response string. Uses the Groq API with full
    conversational context and proper error handling.
    """
    try:
        # Inject FAQ context inline if we found a match — helps the AI give accurate info
        match = matcher.get_match(query)
        augmented_query = query
        if match:
            augmented_query = (
                f"{query}\n\n"
                f"[CONTEXT — use this fact naturally in your reply without quoting it verbatim: "
                f"{match['answer']}]"
            )

        return agent.get_response(augmented_query, history)

    except AuthenticationError:
        return (
            "I'm having a quick authentication hiccup on my end — please try refreshing the page. "
            "Alternatively, you can reach us directly at **+91 7982131324** or email **rsedusolution09@gmail.com**."
        )

    except RateLimitError:
        return (
            "I'm handling a lot of queries right now and hit a brief limit! 😅 "
            "Give me just 30 seconds and try again, or you can reach our team directly at "
            "**+91 7982131324**. We're always available from 10 AM to 6 PM, Monday to Saturday."
        )

    except APIConnectionError:
        # Fall back to FAQ matching when there's no internet connection
        match = matcher.get_match(query)
        if match:
            return match["answer"]
        return (
            "I seem to have lost my connection for a moment. You can reach us directly at "
            "**+91 7982131324** or drop an email to **rsedusolution09@gmail.com** and we'll "
            "get back to you right away!"
        )

    except Exception as e:
        # Specific, helpful fallback that does NOT sound like the same old canned message
        match = matcher.get_match(query)
        if match:
            return match["answer"]
        return (
            "Hmm, something went slightly sideways on my end just now 🙈 "
            "Could you rephrase your question? Or feel free to call us at "
            "**+91 7982131324** — our counsellors are standing by!"
        )
