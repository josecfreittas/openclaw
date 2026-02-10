import { describe, expect, it, vi } from "vitest";
import type { WebInboundMsg } from "./types.js";
import { deliverWebReply } from "./deliver-reply.js";

function createMessage(overrides: Partial<WebInboundMsg> = {}): WebInboundMsg {
  return {
    id: "m1",
    from: "+15550001111",
    conversationId: "+15550001111",
    to: "+15550002222",
    accountId: "default",
    body: "hello",
    chatType: "direct",
    chatId: "direct:+15550001111",
    sendComposing: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    sendMedia: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("deliverWebReply threading policy", () => {
  it("does not quote direct-chat replies", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const msg = createMessage({
      chatType: "direct",
      chatId: "direct:+15550001111",
      reply,
    });

    await deliverWebReply({
      replyResult: {
        text: "hello there",
        replyToId: "quoted-1",
        replyToTag: true,
      },
      msg,
      maxMediaBytes: 1024 * 1024,
      textLimit: 4096,
      replyLogger: {
        info: vi.fn(),
        warn: vi.fn(),
      },
    });

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith("hello there");
  });

  it("quotes group replies when the bot is mentioned", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const msg = createMessage({
      id: "group-msg-1",
      from: "123@g.us",
      conversationId: "123@g.us",
      chatType: "group",
      chatId: "123@g.us",
      wasMentioned: true,
      reply,
    });

    await deliverWebReply({
      replyResult: {
        text: "hello group",
      },
      msg,
      maxMediaBytes: 1024 * 1024,
      textLimit: 4096,
      replyLogger: {
        info: vi.fn(),
        warn: vi.fn(),
      },
    });

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith("hello group", { replyToId: "group-msg-1" });
  });

  it("does not quote unmentioned group replies without explicit tag", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const msg = createMessage({
      id: "group-msg-2",
      from: "123@g.us",
      conversationId: "123@g.us",
      chatType: "group",
      chatId: "123@g.us",
      wasMentioned: false,
      reply,
    });

    await deliverWebReply({
      replyResult: {
        text: "no quote",
        replyToId: "quoted-2",
      },
      msg,
      maxMediaBytes: 1024 * 1024,
      textLimit: 4096,
      replyLogger: {
        info: vi.fn(),
        warn: vi.fn(),
      },
    });

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith("no quote");
  });

  it("honors explicit reply tags in groups", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const msg = createMessage({
      id: "group-msg-3",
      from: "123@g.us",
      conversationId: "123@g.us",
      chatType: "group",
      chatId: "123@g.us",
      wasMentioned: false,
      reply,
    });

    await deliverWebReply({
      replyResult: {
        text: "explicit quote",
        replyToId: "quoted-3",
        replyToTag: true,
      },
      msg,
      maxMediaBytes: 1024 * 1024,
      textLimit: 4096,
      replyLogger: {
        info: vi.fn(),
        warn: vi.fn(),
      },
    });

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith("explicit quote", { replyToId: "quoted-3" });
  });
});
