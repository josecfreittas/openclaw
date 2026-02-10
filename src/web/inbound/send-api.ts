import type { AnyMessageContent, WAMessage, WAPresence } from "@whiskeysockets/baileys";
import type { ActiveWebSendOptions } from "../active-listener.js";
import { recordChannelActivity } from "../../infra/channel-activity.js";
import { toWhatsappJid } from "../../utils.js";

const QUOTED_MESSAGE_CACHE_LIMIT = 1000;

function readMessageId(result: unknown): string {
  if (typeof result !== "object" || !result || !("key" in result)) {
    return "unknown";
  }
  return String((result as { key?: { id?: string } }).key?.id ?? "unknown");
}

function asWAMessage(result: unknown): WAMessage | undefined {
  if (typeof result !== "object" || !result) {
    return undefined;
  }
  if (!("key" in result) || !("message" in result)) {
    return undefined;
  }
  const candidate = result as { key?: { id?: string; remoteJid?: string }; message?: unknown };
  if (!candidate.key?.id || !candidate.key.remoteJid || !candidate.message) {
    return undefined;
  }
  return result as WAMessage;
}

export function createWebSendApi(params: {
  sock: {
    sendMessage: (
      jid: string,
      content: AnyMessageContent,
      options?: { quoted?: WAMessage },
    ) => Promise<unknown>;
    sendPresenceUpdate: (presence: WAPresence, jid?: string) => Promise<unknown>;
  };
  defaultAccountId: string;
}) {
  const quotedMessageCache = new Map<string, WAMessage>();

  const quoteCacheKey = (jid: string, messageId: string) => `${toWhatsappJid(jid)}:${messageId}`;

  const pruneQuotedMessageCache = () => {
    while (quotedMessageCache.size > QUOTED_MESSAGE_CACHE_LIMIT) {
      const oldestKey = quotedMessageCache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      quotedMessageCache.delete(oldestKey);
    }
  };

  const rememberMessage = (message: WAMessage | null | undefined) => {
    if (!message) {
      return;
    }
    const messageId = message.key?.id?.trim();
    const remoteJid = message.key?.remoteJid?.trim();
    if (!messageId || !remoteJid || !message.message) {
      return;
    }
    const cacheKey = quoteCacheKey(remoteJid, messageId);
    quotedMessageCache.delete(cacheKey);
    quotedMessageCache.set(cacheKey, message);
    pruneQuotedMessageCache();
  };

  const resolveQuotedMessage = (jid: string, replyToId?: string): WAMessage | undefined => {
    const normalizedReplyToId = replyToId?.trim();
    if (!normalizedReplyToId) {
      return undefined;
    }
    return quotedMessageCache.get(quoteCacheKey(jid, normalizedReplyToId));
  };

  const sendContent = async (
    to: string,
    payload: AnyMessageContent,
    sendOptions?: ActiveWebSendOptions,
  ): Promise<{ messageId: string }> => {
    const jid = toWhatsappJid(to);
    const quoted = resolveQuotedMessage(jid, sendOptions?.replyToId);
    const result = quoted
      ? await params.sock.sendMessage(jid, payload, { quoted })
      : await params.sock.sendMessage(jid, payload);
    rememberMessage(asWAMessage(result));
    const accountId = sendOptions?.accountId ?? params.defaultAccountId;
    recordChannelActivity({
      channel: "whatsapp",
      accountId,
      direction: "outbound",
    });
    return { messageId: readMessageId(result) };
  };

  return {
    rememberMessage,
    sendContent,
    sendMessage: async (
      to: string,
      text: string,
      mediaBuffer?: Buffer,
      mediaType?: string,
      sendOptions?: ActiveWebSendOptions,
    ): Promise<{ messageId: string }> => {
      let payload: AnyMessageContent;
      if (mediaBuffer && mediaType) {
        if (mediaType.startsWith("image/")) {
          payload = {
            image: mediaBuffer,
            caption: text || undefined,
            mimetype: mediaType,
          };
        } else if (mediaType.startsWith("audio/")) {
          payload = { audio: mediaBuffer, ptt: true, mimetype: mediaType };
        } else if (mediaType.startsWith("video/")) {
          const gifPlayback = sendOptions?.gifPlayback;
          payload = {
            video: mediaBuffer,
            caption: text || undefined,
            mimetype: mediaType,
            ...(gifPlayback ? { gifPlayback: true } : {}),
          };
        } else {
          payload = {
            document: mediaBuffer,
            fileName: "file",
            caption: text || undefined,
            mimetype: mediaType,
          };
        }
      } else {
        payload = { text };
      }
      return await sendContent(to, payload, sendOptions);
    },
    sendPoll: async (
      to: string,
      poll: { question: string; options: string[]; maxSelections?: number },
    ): Promise<{ messageId: string }> => {
      return await sendContent(
        to,
        {
          poll: {
            name: poll.question,
            values: poll.options,
            selectableCount: poll.maxSelections ?? 1,
          },
        } as AnyMessageContent,
        { accountId: params.defaultAccountId },
      );
    },
    sendReaction: async (
      chatJid: string,
      messageId: string,
      emoji: string,
      fromMe: boolean,
      participant?: string,
    ): Promise<void> => {
      const jid = toWhatsappJid(chatJid);
      await params.sock.sendMessage(jid, {
        react: {
          text: emoji,
          key: {
            remoteJid: jid,
            id: messageId,
            fromMe,
            participant: participant ? toWhatsappJid(participant) : undefined,
          },
        },
      } as AnyMessageContent);
    },
    sendComposingTo: async (to: string): Promise<void> => {
      const jid = toWhatsappJid(to);
      await params.sock.sendPresenceUpdate("composing", jid);
    },
  } as const;
}
