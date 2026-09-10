"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";

interface Conversation {
  id: string;
  otherParty: { id: string; name: string; avatar: string | null };
  messages: { body: string; senderId: string; createdAt: string }[];
  unreadCount: number;
  product?: { id: string; name: string; nameSi: string } | null;
  order?: { id: string } | null;
  updatedAt: string;
}

interface ChatPageProps {
  initialProductId?: string | null;
  initialOrderId?: string | null;
  initialProducerId?: string | null;
  initialProducerUserId?: string | null;
}

export function ChatPage({
  initialProductId,
  initialOrderId,
  initialProducerId,
  initialProducerUserId,
}: ChatPageProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showThread, setShowThread] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
  }, [status, router]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      const data = await res.json();
      setConversations(data.conversations || []);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (status === "authenticated") {
      fetchConversations();
    }
  }, [status, fetchConversations]);

  // Polling every 5s when visible
  useEffect(() => {
    if (status !== "authenticated") return;

    function startPolling() {
      if (pollRef.current) return;
      pollRef.current = setInterval(() => {
        if (document.visibilityState === "visible") {
          fetchConversations();
        }
      }, 5000);
    }

    function stopPolling() {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
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
  }, [status, fetchConversations]);

  // Auto-create conversation from query params
  useEffect(() => {
    if (status !== "authenticated") return;
    const isAdminDirect =
      session?.user?.role === "ADMIN" && (!!initialProducerId || !!initialProducerUserId);
    if (!initialProductId && !initialOrderId && !isAdminDirect) return;

    async function createConversation() {
      const body: Record<string, string> = {};
      if (initialProductId) body.productId = initialProductId;
      else if (initialOrderId) {
        body.orderId = initialOrderId;
        if (initialProducerId) body.producerId = initialProducerId;
      } else if (initialProducerUserId) {
        body.producerUserId = initialProducerUserId;
      } else if (initialProducerId) {
        body.producerId = initialProducerId;
      }

      try {
        const res = await fetch("/api/chat/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.conversation) {
          setActiveId(data.conversation.id);
          setShowThread(true);
          fetchConversations();
          // Clean URL
          router.replace("/chat");
        }
      } catch {
        // silent
      }
    }

    createConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, initialProductId, initialOrderId, initialProducerId, initialProducerUserId, session?.user?.role, router, fetchConversations]);

  if (!isFeatureEnabled("INTERNAL_CHAT")) {
    return (
      <div className="page-container text-center py-20">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Coming Soon</h2>
        <p className="text-gray-500">Messaging is not yet available.</p>
      </div>
    );
  }

  if (status === "loading" || loading) {
    return <div className="page-container text-center text-gray-500">Loading...</div>;
  }

  if (status === "unauthenticated") return null;

  const activeConversation = conversations.find((c) => c.id === activeId) || null;

  return (
    <div className="page-container !p-0 h-[calc(100vh-4rem)]">
      <div className="flex h-full">
        {/* Conversation list */}
        <div
          className={`w-full md:w-80 md:min-w-[320px] border-r border-gray-200 flex flex-col ${
            showThread && activeId ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="p-4 border-b border-gray-200">
            <h1 className="text-lg font-bold text-gray-900">Messages</h1>
          </div>
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            currentUserId={session?.user?.id || ""}
            onSelect={(id) => {
              setActiveId(id);
              setShowThread(true);
            }}
          />
        </div>

        {/* Message thread */}
        <div
          className={`flex-1 flex flex-col ${
            !showThread || !activeId ? "hidden md:flex" : "flex"
          }`}
        >
          {activeConversation ? (
            <MessageThread
              conversation={activeConversation}
              currentUserId={session?.user?.id || ""}
              onBack={() => setShowThread(false)}
              refreshConversations={fetchConversations}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <p>Select a conversation to start messaging</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
