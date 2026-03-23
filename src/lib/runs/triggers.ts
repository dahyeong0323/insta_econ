import { type PublishRunInput } from "@/lib/agents/schema";
import { resolvePublicBaseUrl } from "@/lib/public-base-url";

function getAppBaseUrl() {
  const baseUrl = resolvePublicBaseUrl();

  if (!baseUrl) {
    throw new Error("PUBLIC_BASE_URL or NEXT_PUBLIC_APP_URL is required.");
  }

  return baseUrl.replace(/\/$/, "");
}

function getInternalWorkflowSecrets() {
  return {
    operatorSecret: process.env.OPERATOR_API_SECRET?.trim() || null,
    dispatchSecret: process.env.RESEARCH_DISPATCH_SECRET?.trim() || null,
  };
}

function buildInternalHeaders() {
  const { operatorSecret, dispatchSecret } = getInternalWorkflowSecrets();
  const authorizationSecret = dispatchSecret ?? operatorSecret;

  return {
    "Content-Type": "application/json",
    ...(authorizationSecret ? { Authorization: `Bearer ${authorizationSecret}` } : {}),
    ...(dispatchSecret ? { "x-research-dispatch-secret": dispatchSecret } : {}),
    ...(operatorSecret ? { "x-operator-secret": operatorSecret } : {}),
  };
}

export async function triggerRunProcessing(runId: string) {
  const response = await fetch(`${getAppBaseUrl()}/api/runs/${runId}/process`, {
    method: "POST",
    headers: buildInternalHeaders(),
    body: "{}",
  });

  if (!response.ok) {
    throw new Error(`Failed to trigger run processing: ${response.status}`);
  }
}

export async function triggerRunPublish(runId: string, payload: PublishRunInput) {
  const response = await fetch(`${getAppBaseUrl()}/api/runs/${runId}/publish`, {
    method: "POST",
    headers: buildInternalHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to trigger run publish: ${response.status}`);
  }
}
