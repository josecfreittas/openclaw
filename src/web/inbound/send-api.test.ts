import type { WAMessage } from "@whiskeysockets/baileys";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWebSendApi } from "./send-api.js";

const recordChannelActivity = vi.fn();

vi.mock("../../infra/channel-activity.js", () => ({
  recordChannelActivity: (...args: unknown[]) => recordChannelActivity(...args),
}));

describe("createWebSendApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends quoted replies when replyToId resolves in cache", async () => {
    const sock = {
      sendMessage: vi.fn(async () => ({
        key: { id: "out-1", remoteJid: "15551234567@s.whatsapp.net", fromMe: true },
        message: { conversation: "reply" },
      })),
      sendPresenceUpdate: vi.fn(async () => undefined),
    };
    const api = createWebSendApi({
      sock,
      defaultAccountId: "default",
    });
    const quoted = {
      key: { id: "msg-1", remoteJid: "15551234567@s.whatsapp.net", fromMe: false },
      message: { conversation: "hello" },
    } as unknown as WAMessage;

    api.rememberMessage(quoted);

    const result = await api.sendMessage("+15551234567", "pong", undefined, undefined, {
      replyToId: "msg-1",
    });

    expect(sock.sendMessage).toHaveBeenCalledWith(
      "15551234567@s.whatsapp.net",
      { text: "pong" },
      { quoted },
    );
    expect(result).toEqual({ messageId: "out-1" });
  });

  it("falls back to a plain send when replyToId is missing from cache", async () => {
    const sock = {
      sendMessage: vi.fn(async () => ({
        key: { id: "out-2", remoteJid: "15551234567@s.whatsapp.net", fromMe: true },
        message: { conversation: "reply" },
      })),
      sendPresenceUpdate: vi.fn(async () => undefined),
    };
    const api = createWebSendApi({
      sock,
      defaultAccountId: "default",
    });

    const result = await api.sendMessage("+15551234567", "pong", undefined, undefined, {
      replyToId: "missing-id",
    });

    expect(sock.sendMessage).toHaveBeenCalledWith("15551234567@s.whatsapp.net", { text: "pong" });
    expect(result).toEqual({ messageId: "out-2" });
  });
});
