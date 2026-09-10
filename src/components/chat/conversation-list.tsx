"use client";

interface Conversation {
  id: string;
  otherParty: { id: string; name: string; avatar: string | null };
  messages: { body: string; senderId: string; createdAt: string }[];
  unreadCount: number;
  product?: { id: string; name: string; nameSi: string } | null;
  order?: { id: string } | null;
  updatedAt: string;
}

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  currentUserId: string;
  onSelect: (id: string) => void;
}

export function ConversationList({
  conversations,
  activeId,
  currentUserId,
  onSelect,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-gray-400 text-sm text-center">No conversations yet</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.map((conv) => {
        const lastMsg = conv.messages[0];
        const isActive = conv.id === activeId;
        const contextLabel = conv.product?.name || (conv.order ? `Order #${conv.order.id.slice(-6).toUpperCase()}` : null);

        return (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
              isActive ? "bg-primary-50 border-l-2 border-l-primary" : ""
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                {conv.otherParty.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${conv.unreadCount > 0 ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
                    {conv.otherParty.name}
                  </span>
                  {conv.unreadCount > 0 && (
                    <span className="bg-primary text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
                {contextLabel && (
                  <p className="text-xs text-primary font-medium mt-0.5 truncate">{contextLabel}</p>
                )}
                {lastMsg && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {lastMsg.senderId === currentUserId ? "You: " : ""}
                    {lastMsg.body}
                  </p>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
