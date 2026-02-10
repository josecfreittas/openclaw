import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../../config/config.js";
import { whatsappOutbound } from "./whatsapp.js";

describe("whatsappOutbound", () => {
  it("forwards replyToId for text sends", async () => {
    const sendWhatsApp = vi.fn(async () => ({ messageId: "w1", toJid: "jid" }));

    const result = await whatsappOutbound.sendText?.({
      cfg: {} as OpenClawConfig,
      to: "+15551234567",
      text: "hello",
      replyToId: "abc-123",
      deps: { sendWhatsApp },
    });

    expect(sendWhatsApp).toHaveBeenCalledWith(
      "+15551234567",
      "hello",
      expect.objectContaining({ replyToId: "abc-123", verbose: false }),
    );
    expect(result).toEqual({ channel: "whatsapp", messageId: "w1", toJid: "jid" });
  });

  it("forwards replyToId for media sends", async () => {
    const sendWhatsApp = vi.fn(async () => ({ messageId: "w2", toJid: "jid" }));

    const result = await whatsappOutbound.sendMedia?.({
      cfg: {} as OpenClawConfig,
      to: "+15551234567",
      text: "caption",
      mediaUrl: "https://example.com/file.jpg",
      replyToId: "def-456",
      deps: { sendWhatsApp },
    });

    expect(sendWhatsApp).toHaveBeenCalledWith(
      "+15551234567",
      "caption",
      expect.objectContaining({
        mediaUrl: "https://example.com/file.jpg",
        replyToId: "def-456",
        verbose: false,
      }),
    );
    expect(result).toEqual({ channel: "whatsapp", messageId: "w2", toJid: "jid" });
  });
});
