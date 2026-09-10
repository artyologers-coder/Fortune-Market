import { isFeatureEnabled } from "@/lib/feature-flags";

interface ChatUser {
  role: string;
  producerId?: string | null;
  verifiedProducer?: boolean;
}

/**
 * Determines whether a user can create/reply to conversations.
 * v1: free for all logged-in buyers, producers and admins.
 * Flip SELLER_SUBSCRIPTIONS on and add payment checks here later
 * to gate the feature without touching any other file.
 */
export function canUseChat(user: ChatUser): boolean {
  if (!isFeatureEnabled("INTERNAL_CHAT")) return false;

  const role = user.role;

  if (role === "ADMIN") {
    return true;
  }

  if (role === "PRODUCER") {
    if (!isFeatureEnabled("PRODUCER_ACCOUNTS")) return false;

    // Future gate: uncomment when SELLER_SUBSCRIPTIONS is enabled
    // if (isFeatureEnabled("SELLER_SUBSCRIPTIONS") && !user.verifiedProducer) return false;

    return true;
  }

  if (role === "BUYER") {
    if (!isFeatureEnabled("BUYER_ACCOUNTS")) return false;
    return true;
  }

  return false;
}
