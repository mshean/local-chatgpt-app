from flask import Flask, request, jsonify
from flask_cors import CORS
import openai
import os
import json
from uuid import uuid4
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Set up OpenAI API key
client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

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

    # Check if the message is provided
    if not data or 'message' not in data:
        return jsonify({"error": "Message is required"}), 400

    user_msg = data.get("message")
    chat = load_chat(chat_id)

    # Check if chat exists
    if not chat:
        return jsonify({"error": "Chat not found"}), 404

    chat["messages"].append({"role": "user", "content": user_msg})

    try:
        # Prepare messages in the format expected by the Chat API
        messages = [{"role": msg["role"], "content": msg["content"]} for msg in chat["messages"]]
        
        # Call OpenAI API
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0.2,
            max_tokens=4000
        )
        
        # Extract the assistant's reply from the response
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


if __name__ == '__main__':
    app.run(debug=True, port=5000)