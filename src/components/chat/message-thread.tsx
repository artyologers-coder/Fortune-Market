"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Message {
  id: string;
  body: string;
  senderId: string;
  sender: { id: string; name: string; avatar: string | null };
  createdAt: string;
}

interface Conversation {
  id: string;
  otherParty: { id: string; name: string; avatar: string | null };
  product?: { id: string; name: string; nameSi: string } | null;
  order?: { id: string } | null;
}

interface MessageThreadProps {
  conversation: Conversation;
  currentUserId: string;
  onBack: () => void;
  refreshConversations: () => void;
}

export function MessageThread({
  conversation,
  currentUserId,
  onBack,
  refreshConversations,
}: MessageThreadProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const threadPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/conversations/${conversation.id}/messages`);
      const data = await res.json();
      setMessages(data.messages || []);
      scrollToBottom();
    } catch {
      // silent
    }
  }, [conversation.id]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Poll messages every 5s when visible
  useEffect(() => {
    function startPolling() {
      if (threadPollRef.current) return;
      threadPollRef.current = setInterval(() => {
        if (document.visibilityState === "visible") {
          fetchMessages();
        }
      }, 5000);
    }

    function stopPolling() {
      if (threadPollRef.current) {
        clearInterval(threadPollRef.current);
        threadPollRef.current = null;
      }
    }

    startPolling();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") startPolling();
      else stopPolling();
    });

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", () => {});
    };
  }, [fetchMessages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      const res = await fetch(`/api/chat/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
        setInput("");
        refreshConversations();
        scrollToBottom();
      }
    } catch {
      // silent
    }
    setSending(false);
  }

  const contextLabel = conversation.product?.name
    ? `About: ${conversation.product.name}`
    : conversation.order?.id
    ? `Order #${conversation.order.id.slice(-6).toUpperCase()}`
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3 bg-white">
        <button onClick={onBack} className="md:hidden text-gray-500 hover:text-gray-700 mr-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary font-bold text-sm">
          {conversation.otherParty.name.charAt(0)}
        </div>
        <div>
          <p className="font-medium text-gray-900 text-sm">{conversation.otherParty.name}</p>
          {contextLabel && (
            <p className="text-xs text-primary">{contextLabel}</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
        {messages.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">No messages yet. Say hello!</p>
        )}
        {messages.map((msg) => {
          const isMine = msg.senderId === currentUserId;
          return (
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-xs md:max-w-md px-4 py-2 rounded-2xl text-sm ${
                isMine
                  ? "bg-primary text-white rounded-br-sm"
                  : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm"
              }`}>
                <p>{msg.body}</p>
                <p className={`text-[10px] mt-1 ${isMine ? "text-green-200" : "text-gray-400"}`}>
                  {new Date(msg.createdAt).toLocaleTimeString("en-LK", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="px-4 py-3 border-t border-gray-200 bg-white flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="input-field flex-1 !py-2.5"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="btn-primary !px-5 !py-2.5 disabled:opacity-50"
        >
          {sending ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}
