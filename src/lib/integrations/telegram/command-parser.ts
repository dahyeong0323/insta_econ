import { type TelegramCommand } from "@/lib/integrations/telegram/messages";

const KOREAN_REVISE = "\\uC218\\uC815";
const KOREAN_HOLD = "\\uBCF4\\uB958";
const KOREAN_SKIP = "\\uC2A4\\uD0B5";
const KOREAN_PUBLISH_RETRY = "\\uAC8C\\uC2DC\\s*\\uB2E4\\uC2DC\\s*\\uC2DC\\uB3C4";
const KOREAN_PUBLISH_STOP = "\\uAC8C\\uC2DC\\s*\\uC911\\uB2E8";

export function parseTelegramCommand(text: string | null | undefined): TelegramCommand {
  const normalized = text?.trim();

  if (!normalized) {
    return { action: "unknown" };
  }

  if (/^ok$/iu.test(normalized)) {
    return { action: "approve_script" };
  }

  if (/^image ok$/iu.test(normalized) || /^publish ok$/iu.test(normalized)) {
    return { action: "approve_image" };
  }

  if (new RegExp(`^(${KOREAN_PUBLISH_RETRY}|publish\\s*retry|retry\\s*publish)$`, "iu").test(normalized)) {
    return { action: "publish_retry" };
  }

  if (new RegExp(`^(${KOREAN_PUBLISH_STOP}|publish\\s*stop|stop\\s*publish)$`, "iu").test(normalized)) {
    return { action: "publish_stop" };
  }

  if (new RegExp(`^(${KOREAN_HOLD}|hold)$`, "iu").test(normalized)) {
    return { action: "hold" };
  }

  if (new RegExp(`^(${KOREAN_SKIP}|skip|pass)$`, "iu").test(normalized)) {
    return { action: "skip" };
  }

  const reviseMatch = normalized.match(
    new RegExp(`^(${KOREAN_REVISE}|revise)\\s*[:\\uFF1A]\\s*(.+)$`, "iu"),
  );

  if (reviseMatch) {
    return {
      action: "revise",
      feedback: reviseMatch[2].trim(),
    };
  }

  return { action: "unknown" };
}
