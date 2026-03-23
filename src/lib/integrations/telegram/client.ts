type TelegramImage = {
  filename: string;
  buffer: Buffer;
};

type TelegramInlineKeyboardButton = {
  text: string;
  callback_data: string;
};

type TelegramInlineKeyboardMarkup = {
  inline_keyboard: TelegramInlineKeyboardButton[][];
};

type SendTelegramImageGroupInput = {
  chatId?: string | null;
  caption?: string | null;
  images: TelegramImage[];
};

type TelegramMediaMessage = {
  message_id?: number;
};

type TelegramTextMessage = {
  message_id?: number;
};

function getTelegramBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN 환경 변수가 필요합니다.");
  }

  return token;
}

function resolveChatId(chatId?: string | null) {
  const resolved = chatId?.trim() || process.env.TELEGRAM_DEFAULT_CHAT_ID?.trim();

  if (!resolved) {
    throw new Error("Telegram chat ID가 필요합니다.");
  }

  return resolved;
}

export async function sendTelegramTextMessage(input: {
  text: string;
  chatId?: string | null;
  replyMarkup?: TelegramInlineKeyboardMarkup;
}) {
  const token = getTelegramBotToken();
  const resolvedChatId = resolveChatId(input.chatId);
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: resolvedChatId,
      text: input.text,
      ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
    }),
  });
  const data = (await response.json()) as {
    ok?: boolean;
    description?: string;
    result?: TelegramTextMessage;
  };

  if (!response.ok || !data.ok) {
    throw new Error(data.description || "Telegram 메시지 전송에 실패했습니다.");
  }

  return {
    chatId: resolvedChatId,
    messageId:
      typeof data.result?.message_id === "number" ? String(data.result.message_id) : null,
  };
}

export async function answerTelegramCallbackQuery(input: {
  callbackQueryId: string;
  text?: string;
}) {
  const token = getTelegramBotToken();
  const response = await fetch(
    `https://api.telegram.org/bot${token}/answerCallbackQuery`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        callback_query_id: input.callbackQueryId,
        ...(input.text ? { text: input.text } : {}),
      }),
    },
  );
  const data = (await response.json()) as {
    ok?: boolean;
    description?: string;
  };

  if (!response.ok || !data.ok) {
    throw new Error(data.description || "Telegram callback 응답 처리에 실패했습니다.");
  }
}

export async function sendTelegramImageGroup({
  chatId,
  caption,
  images,
}: SendTelegramImageGroupInput) {
  if (images.length === 0) {
    throw new Error("Telegram으로 보낼 이미지가 없습니다.");
  }

  const token = getTelegramBotToken();
  const resolvedChatId = resolveChatId(chatId);
  const form = new FormData();
  const media = images.map((image, index) => ({
    type: "photo",
    media: `attach://file${index}`,
    ...(index === 0 && caption ? { caption } : {}),
  }));

  form.set("chat_id", resolvedChatId);
  form.set("media", JSON.stringify(media));

  for (const [index, image] of images.entries()) {
    form.set(
      `file${index}`,
      new Blob([Uint8Array.from(image.buffer)], { type: "image/png" }),
      image.filename,
    );
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMediaGroup`,
    {
      method: "POST",
      body: form,
    },
  );
  const data = (await response.json()) as {
    ok?: boolean;
    description?: string;
    result?: TelegramMediaMessage[];
  };

  if (!response.ok || !data.ok) {
    throw new Error(data.description || "Telegram 이미지 전송에 실패했습니다.");
  }

  return {
    chatId: resolvedChatId,
    messageIds: (data.result ?? [])
      .map((message) => message.message_id)
      .filter((messageId): messageId is number => typeof messageId === "number")
      .map(String),
  };
}
