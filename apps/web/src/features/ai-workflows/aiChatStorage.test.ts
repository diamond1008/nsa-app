import { describe, it, expect, beforeEach } from "vitest";
import {
  CHAT_RETENTION_MS,
  CHAT_STORAGE_KEY_PREFIX,
  clearChatSession,
  getChatStorageKey,
  loadChatSession,
  saveChatSession,
} from "./aiChatStorage";

describe("aiChatStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("generates correct user-scoped storage key", () => {
    expect(getChatStorageKey("user-123")).toBe(`${CHAT_STORAGE_KEY_PREFIX}user-123`);
    expect(getChatStorageKey(undefined)).toBe(`${CHAT_STORAGE_KEY_PREFIX}default`);
  });

  it("persists and restores messages within 24 hours", () => {
    const userId = "sale-user-1";
    const sampleMessages = [
      { id: "1", role: "user", content: "Chốt khách Chị Lê Thị Mai" },
      { id: "2", role: "assistant", content: "Tôi đã cập nhật..." },
    ];
    const messageTimestamp = 1000000000;

    saveChatSession(userId, sampleMessages, messageTimestamp, { "2": "up" }, { "2": true });

    // Load within 1 hour
    const loaded = loadChatSession<{ id: string; role: string; content: string }>(
      userId,
      messageTimestamp + 3600 * 1000,
    );
    expect(loaded).not.toBeNull();
    expect(loaded?.messages).toHaveLength(2);
    expect(loaded?.messages[0].content).toBe("Chốt khách Chị Lê Thị Mai");
    expect(loaded?.lastActivityAt).toBe(messageTimestamp);
    expect(loaded?.reactionMap?.["2"]).toBe("up");
    expect(loaded?.expandedReasoning?.["2"]).toBe(true);
  });

  it("automatically expires and deletes session after 24 hours of inactivity", () => {
    const userId = "sale-user-1";
    const sampleMessages = [{ id: "1", role: "user", content: "Hello" }];
    const messageTimestamp = 1000000000;

    saveChatSession(userId, sampleMessages, messageTimestamp);

    // 24 hours + 1 millisecond later
    const expiredTimestamp = messageTimestamp + CHAT_RETENTION_MS + 1;
    const loaded = loadChatSession(userId, expiredTimestamp);

    expect(loaded).toBeNull();
    // Verify it was purged from localStorage
    const raw = localStorage.getItem(getChatStorageKey(userId));
    expect(raw).toBeNull();
  });

  it("keeps session alive when loaded at 23.9 hours", () => {
    const userId = "sale-user-1";
    const sampleMessages = [{ id: "1", role: "user", content: "Hello" }];
    const messageTimestamp = 1000000000;

    saveChatSession(userId, sampleMessages, messageTimestamp);

    // 23 hours 59 minutes later
    const almostExpiredTimestamp = messageTimestamp + CHAT_RETENTION_MS - 60 * 1000;
    const loaded = loadChatSession(userId, almostExpiredTimestamp);

    expect(loaded).not.toBeNull();
    expect(loaded?.messages).toHaveLength(1);
  });

  it("manually clears session when clearChatSession is called (Tạo chat mới)", () => {
    const userId = "sale-user-1";
    saveChatSession(userId, [{ id: "1", role: "user", content: "Old conversation" }]);

    clearChatSession(userId);

    const loaded = loadChatSession(userId);
    expect(loaded).toBeNull();
  });

  it("automatically removes key when saving empty message array", () => {
    const userId = "sale-user-1";
    saveChatSession(userId, [{ id: "1", role: "user", content: "Msg" }]);
    expect(localStorage.getItem(getChatStorageKey(userId))).not.toBeNull();

    saveChatSession(userId, []);
    expect(localStorage.getItem(getChatStorageKey(userId))).toBeNull();
  });

  it("isolates chats between different users", () => {
    saveChatSession("user-a", [{ id: "a1", role: "user", content: "Chat of User A" }]);
    saveChatSession("user-b", [{ id: "b1", role: "user", content: "Chat of User B" }]);

    const chatA = loadChatSession<{ id: string; role: string; content: string }>("user-a");
    const chatB = loadChatSession<{ id: string; role: string; content: string }>("user-b");

    expect(chatA?.messages[0].content).toBe("Chat of User A");
    expect(chatB?.messages[0].content).toBe("Chat of User B");
  });
});
