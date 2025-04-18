from flask import Flask, request, jsonify
from flask_cors import CORS
import openai
import os
import json
import logging
from uuid import uuid4
from dotenv import load_dotenv

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

def get_chat_path(chat_id):
    return os.path.join(CHAT_DIR, f"{chat_id}.json")

def load_chat(chat_id):
    try:
        with open(get_chat_path(chat_id), 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"chat_id": chat_id, "title": "New Chat", "messages": []}

def save_chat(chat):
    with open(get_chat_path(chat["chat_id"]), 'w') as f:
        json.dump(chat, f, indent=2)

def get_recent_messages(messages, max_tokens=4000):
    """
    Approximates a limited token window of recent messages.
    Assumes ~4 characters per token.
    Returns trimmed messages and estimated token count.
    """
    token_limit = max_tokens
    estimated_token_count = 0
    recent_messages = []

    for msg in reversed(messages):
        msg_tokens = len(msg.get("content", "")) // 4
        if estimated_token_count + msg_tokens > token_limit:
            break
        recent_messages.insert(0, msg)
        estimated_token_count += msg_tokens

    return recent_messages, estimated_token_count

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
        chat = {"chat_id": chat_id, "title": "New Chat", "messages": []}
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

    chat["messages"].append({"role": "user", "content": user_msg})

    try:
        system_prompt = {"role": "system", "content": "You are a helpful assistant."}

        # Estimate and trim messages to fit token window
        trimmed_messages, estimated_tokens = get_recent_messages(
            [{"role": msg["role"], "content": msg["content"]} for msg in chat["messages"]],
            max_tokens=4000
        )

        messages = [system_prompt] + trimmed_messages
        logging.info(f"Sending estimated {estimated_tokens} tokens to OpenAI for chat_id={chat_id}")

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0.2,
            max_tokens=4000
        )

        reply = response.choices[0].message.content
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    chat["messages"].append({"role": "assistant", "content": reply})
    if chat["title"] == "New Chat":
        chat["title"] = user_msg[:30] + ("..." if len(user_msg) > 30 else "")

    save_chat(chat)
    return jsonify({"reply": reply})

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


if __name__ == '__main__':
    app.run(debug=True, port=5000)
