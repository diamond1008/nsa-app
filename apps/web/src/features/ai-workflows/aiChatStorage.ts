/**
 * NSA AI Chat Session Storage & Retention Policy
 * 
 * Rules:
 * 1. Persists conversation history across page reloads and tab navigations.
 * 2. 24-hour Auto-Expiration: Session is automatically expired and deleted
 *    after 24 hours have passed since the last message timestamp.
 * 3. Manual Reset: Cleared immediately when the user clicks "Tạo cuộc trò chuyện mới" (New Chat).
 * 4. User-Scoped: Separate conversation caches per user ID to guarantee strict privacy.
 */

export const CHAT_STORAGE_KEY_PREFIX = "nsa_ai_chat_session_";
export const CHAT_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export interface StoredChatSession<T = any> {
  messages: T[];
  lastActivityAt: number; // Unix timestamp in ms of the last message
  reactionMap?: Record<string, "up" | "down">;
  expandedReasoning?: Record<string, boolean>;
}

export function getChatStorageKey(userId?: string): string {
  return `${CHAT_STORAGE_KEY_PREFIX}${userId || "default"}`;
}

/**
 * Loads the active chat session from localStorage if it has not expired (> 24 hours of inactivity).
 * If expired, it automatically removes the stale session and returns null.
 */
export function loadChatSession<T = any>(
  userId?: string,
  now: number = Date.now(),
  storage: Storage = localStorage
): StoredChatSession<T> | null {
  try {
    const key = getChatStorageKey(userId);
    const raw = storage.getItem(key);
    if (!raw) return null;

    const session: StoredChatSession<T> = JSON.parse(raw);
    if (!session || !Array.isArray(session.messages) || typeof session.lastActivityAt !== "number") {
      storage.removeItem(key);
      return null;
    }

    // Expire if 24 hours have elapsed since the last message
    const elapsed = now - session.lastActivityAt;
    if (elapsed > CHAT_RETENTION_MS) {
      storage.removeItem(key);
      return null;
    }

    return session;
  } catch (err) {
    console.warn("Failed to read chat session from storage", err);
    return null;
  }
}

/**
 * Saves or updates the chat session in localStorage.
 * If messages are empty, the session key is removed from storage.
 */
export function saveChatSession<T = any>(
  userId: string | undefined,
  messages: T[],
  lastActivityAt: number = Date.now(),
  reactionMap?: Record<string, "up" | "down">,
  expandedReasoning?: Record<string, boolean>,
  storage: Storage = localStorage
): void {
  try {
    const key = getChatStorageKey(userId);
    if (messages.length === 0) {
      storage.removeItem(key);
      return;
    }

    const session: StoredChatSession<T> = {
      messages,
      lastActivityAt,
      reactionMap,
      expandedReasoning,
    };
    storage.setItem(key, JSON.stringify(session));
  } catch (err) {
    console.warn("Failed to persist chat session to storage", err);
  }
}

/**
 * Manually clears the chat session from storage (called when user clicks "Tạo đoạn chat mới").
 */
export function clearChatSession(userId?: string, storage: Storage = localStorage): void {
  try {
    const key = getChatStorageKey(userId);
    storage.removeItem(key);
  } catch (err) {
    console.warn("Failed to clear chat session from storage", err);
  }
}
