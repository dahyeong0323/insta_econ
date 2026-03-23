import { type RunState } from "@/lib/agents/schema";
import { sendTelegramTextMessage } from "@/lib/integrations/telegram/client";
import {
  buildRunNotificationMessage,
  type TelegramRunNotificationType,
} from "@/lib/integrations/telegram/messages";

export async function notifyTelegramRunUpdate(input: {
  run: RunState;
  type: TelegramRunNotificationType;
  errorMessage?: string | null;
  permalink?: string | null;
}) {
  const chatId = input.run.telegram.last_chat_id;

  if (!chatId) {
    return null;
  }

  return sendTelegramTextMessage({
    chatId,
    text: buildRunNotificationMessage(input),
  }).catch(() => null);
}
