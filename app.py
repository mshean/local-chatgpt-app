from flask import Flask, request, jsonify
from flask_cors import CORS
import openai
import os
import json
import logging
import re
from uuid import uuid4
from dotenv import load_dotenv
import tiktoken  # Import tiktoken

# Configuration constants
MAX_MODEL_TOKENS = 30000  # Conservative limit for GPT-4o (actual is ~32k)
MAX_RESPONSE_TOKENS = 8000  # Reserve for response (increased for code-heavy conversations)
MAX_CONTEXT_TOKENS = MAX_MODEL_TOKENS - MAX_RESPONSE_TOKENS  # 22k for context
RECENT_MESSAGES_COUNT = 8  # Keep last 8 messages in full
SUMMARY_MAX_TOKENS = 800  # Keep summaries concise
MIN_MESSAGES_TO_SUMMARIZE = 4  # Don't summarize very short conversations

# Load environment variables
load_dotenv()

# Set up OpenAI API key
client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Configure logging
logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Chat storage configuration
CHAT_DIR = "chats"
os.makedirs(CHAT_DIR, exist_ok=True)

# Initialize tiktoken encoder
encoder = tiktoken.encoding_for_model('gpt-4o')

def get_chat_path(chat_id):
    return os.path.join(CHAT_DIR, f"{chat_id}.json")

def load_chat(chat_id):
    try:
        with open(get_chat_path(chat_id), 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"chat_id": chat_id, "title": "New Chat", "messages": [], "summary": None}

def save_chat(chat):
    with open(get_chat_path(chat["chat_id"]), 'w') as f:
        json.dump(chat, f, indent=2)

def estimate_tokens(text):
    """
    Use tiktoken to estimate the number of tokens in a text.
    """
    if not text:
        return 0
    return len(encoder.encode(text))

def count_message_tokens(messages):
    """Count tokens for a list of messages, including role overhead."""
    total = 0
    for msg in messages:
        # Add tokens for content
        total += estimate_tokens(msg.get("content", ""))
        # Add overhead for role and formatting (~10 tokens per message)
        total += 10
    return total

def build_context_messages(system_prompt, summary, recent_messages):
    """Build the context messages for the API call."""
    context = [system_prompt]
    
    if summary:
        summary_msg = {
            "role": "system", 
            "content": f"Previous conversation summary: {summary}"
        }
        context.append(summary_msg)
    
    context.extend(recent_messages)
    return context

def summarize_conversation(messages, max_tokens=SUMMARY_MAX_TOKENS):
    """
    Create a concise summary of the conversation.
    """
    if len(messages) < MIN_MESSAGES_TO_SUMMARIZE:
        return None
    
    # Prepare conversation text
    conversation_text = ""
    for msg in messages:
        role = msg.get("role", "unknown")
        content = msg.get("content", "")
        conversation_text += f"{role}: {content}\n"
    
    # Create summary prompt
    prompt = f"""Please create a concise summary of this conversation that captures:
1. The main topics discussed
2. Key questions asked and answers provided
3. Important context that would be needed for continuing the conversation
4. Any ongoing tasks or problems being worked on

Keep the summary under {max_tokens//4} words. Here's the conversation:

{conversation_text}"""
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",  # Use cheaper model for summarization
            messages=[
                {"role": "system", "content": "You are an expert at creating concise, informative conversation summaries."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=max_tokens,
            temperature=0.2,
        )
        
        summary = response.choices[0].message.content.strip()
        logging.info(f"Created summary of {estimate_tokens(summary)} tokens from {len(messages)} messages")
        return summary
        
    except Exception as e:
        logging.error(f"Error creating summary: {e}")
        return None

def detect_conversation_type(messages):
    """
    Detect if this is a code-heavy conversation to adjust response limits.
    """
    if not messages:
        return "general"
    
    # Check recent messages for code indicators
    recent_text = " ".join([msg.get("content", "")[-500:] for msg in messages[-3:]])
    
    # Use regular expressions to detect code patterns
    code_patterns = [
        r"```[\s\S]*?```",  # Code blocks
        r"\bdef\b", r"\bclass\b", r"\bimport\b",  # Python keywords
        r"\bfunction\b", r"\bconst\b", r"\blet\b", r"\bvar\b",  # JavaScript keywords
        r"\bpublic class\b", r"#\!/", r"<script",  # Other languages
        r"\bSELECT\b", r"\bFROM\b", r"\bWHERE\b"  # SQL keywords
    ]
    
    code_score = sum(1 for pattern in code_patterns if re.search(pattern, recent_text, re.IGNORECASE))
    
    return "code" if code_score >= 2 else "general"

def get_response_token_limit(conversation_type):
    return 8000

def manage_context(chat, system_prompt):
    """
    Manage conversation context to stay within token limits.
    Returns the context messages to send to the API and response token limit.
    """
    messages = chat.get("messages", [])
    current_summary = chat.get("summary")
    
    # Detect conversation type and set appropriate limits
    conversation_type = detect_conversation_type(messages)
    response_tokens = get_response_token_limit(conversation_type)
    max_context_tokens = MAX_MODEL_TOKENS - response_tokens
    
    if len(messages) <= RECENT_MESSAGES_COUNT:
        # Short conversation, no need for summarization
        context = build_context_messages(system_prompt, current_summary, messages)
        token_count = count_message_tokens(context)
        
        if token_count <= max_context_tokens:
            return context, token_count, response_tokens
    
    # Get recent messages
    recent_messages = messages[-RECENT_MESSAGES_COUNT:]
    older_messages = messages[:-RECENT_MESSAGES_COUNT]
    
    # Build initial context
    context = build_context_messages(system_prompt, current_summary, recent_messages)
    token_count = count_message_tokens(context)
    
    # If context is too large, we need to manage it
    if token_count > max_context_tokens:
        logging.info(f"Context too large ({token_count} tokens), managing... (type: {conversation_type})")
        
        # First, try to create/update summary if we have older messages
        if older_messages and len(older_messages) >= MIN_MESSAGES_TO_SUMMARIZE:
            # If we already have a summary, combine it with some older messages
            messages_to_summarize = older_messages
            if current_summary:
                # Include the summary context in the messages to summarize
                summary_msg = {"role": "system", "content": f"Previous context: {current_summary}"}
                messages_to_summarize = [summary_msg] + older_messages
            
            new_summary = summarize_conversation(messages_to_summarize)
            if new_summary:
                chat["summary"] = new_summary
                context = build_context_messages(system_prompt, new_summary, recent_messages)
                token_count = count_message_tokens(context)
                logging.info(f"Updated summary, new context size: {token_count} tokens")
        
        # If still too large, trim recent messages
        while token_count > max_context_tokens and len(recent_messages) > 1:
            recent_messages.pop(0)  # Remove oldest of the recent messages
            context = build_context_messages(system_prompt, chat.get("summary"), recent_messages)
            token_count = count_message_tokens(context)
            logging.info(f"Trimmed recent messages, new context size: {token_count} tokens")
        
        # Last resort: if still too large, clear everything except the most recent message
        if token_count > max_context_tokens:
            logging.warning("Extreme context size, keeping only the last message")
            last_message = messages[-1] if messages else []
            context = build_context_messages(system_prompt, None, [last_message] if last_message else [])
            token_count = count_message_tokens(context)
            chat["summary"] = None  # Clear summary as we're starting fresh
    
    return context, token_count, response_tokens

@app.route("/api/chats", methods=["GET"])
def list_chats():
    try:
        chats = []
        for filename in os.listdir(CHAT_DIR):
            if filename.endswith('.json'):
                try:
                    with open(os.path.join(CHAT_DIR, filename), 'r') as f:
                        data = json.load(f)
                        chats.append({
                            "chat_id": data.get("chat_id", str(uuid4())),
                            "title": data.get("title", "New Chat")
                        })
                except (json.JSONDecodeError, KeyError):
                    continue
        return jsonify(chats)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/chat/<chat_id>", methods=["GET"])
def get_chat(chat_id):
    try:
        return jsonify(load_chat(chat_id))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/chat", methods=["POST"])
def new_chat():
    try:
        chat_id = str(uuid4())
        chat = {"chat_id": chat_id, "title": "New Chat", "messages": [], "summary": None}
        save_chat(chat)
        return jsonify(chat)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/chat/<chat_id>", methods=["POST"])
def send_message(chat_id):
    data = request.get_json()

    if not data or 'message' not in data:
        return jsonify({"error": "Message is required"}), 400

    user_msg = data.get("message")
    chat = load_chat(chat_id)

    if not chat:
        return jsonify({"error": "Chat not found"}), 404

    # Add user message
    chat["messages"].append({"role": "user", "content": user_msg})

    # System prompt
    system_prompt = {"role": "system", "content": "You are a helpful assistant."}

    # Manage context and get messages to send
    context_messages, token_count, response_limit = manage_context(chat, system_prompt)
    
    logging.info(f"Sending {token_count} tokens to OpenAI for chat_id={chat_id}, response limit: {response_limit}")

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=context_messages,
            temperature=0.2,
            max_tokens=response_limit
        )
        reply = response.choices[0].message.content
    except Exception as e:
        logging.error(f"OpenAI API error: {e}")
        return jsonify({"error": f"Failed to get response: {str(e)}"}), 500

    # Add assistant response
    chat["messages"].append({"role": "assistant", "content": reply})

    # Update title if it's a new chat
    if chat.get("title", "New Chat") == "New Chat":
        chat["title"] = user_msg[:30] + ("..." if len(user_msg) > 30 else "")

    # Save chat
    save_chat(chat)
    
    return jsonify({
        "reply": reply,
        "context_tokens": token_count,
        "response_limit": response_limit,
        "total_messages": len(chat["messages"]),
        "has_summary": bool(chat.get("summary"))
    })

@app.route("/api/chat/<chat_id>", methods=["DELETE"])
def delete_chat(chat_id):
    try:
        chat_path = get_chat_path(chat_id)
        if os.path.exists(chat_path):
            os.remove(chat_path)
            return jsonify({"message": "Chat deleted successfully"})
        else:
            return jsonify({"error": "Chat not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/chat/<chat_id>/rename", methods=["PATCH"])
def rename_chat(chat_id):
    data = request.get_json()
    new_title = data.get("title")

    if not new_title:
        return jsonify({"error": "Title is required"}), 400

    chat = load_chat(chat_id)

    if not chat:
        return jsonify({"error": "Chat not found"}), 404

    chat["title"] = new_title
    save_chat(chat)

    return jsonify({"chat_id": chat_id, "new_title": new_title})

@app.route("/api/chat/<chat_id>/stats", methods=["GET"])
def get_chat_stats(chat_id):
    """Get statistics about the chat for debugging/monitoring."""
    try:
        chat = load_chat(chat_id)
        if not chat:
            return jsonify({"error": "Chat not found"}), 404
        
        messages = chat.get("messages", [])
        summary = chat.get("summary")
        
        # Calculate some basic stats
        total_messages = len(messages)
        total_tokens = count_message_tokens(messages)
        summary_tokens = estimate_tokens(summary) if summary else 0
        
        recent_messages = messages[-RECENT_MESSAGES_COUNT:] if messages else []
        recent_tokens = count_message_tokens(recent_messages)
        
        return jsonify({
            "chat_id": chat_id,
            "total_messages": total_messages,
            "total_tokens": total_tokens,
            "summary_tokens": summary_tokens,
            "recent_messages_count": len(recent_messages),
            "recent_tokens": recent_tokens,
            "has_summary": bool(summary),
            "estimated_next_context_tokens": recent_tokens + summary_tokens + 50  # +50 for system prompt
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)