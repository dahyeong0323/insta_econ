function normalizeBaseUrl(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }

  return `https://${trimmed.replace(/^\/+/, "").replace(/\/$/, "")}`;
}

export function resolvePublicBaseUrl() {
  const configured = normalizeBaseUrl(
    process.env.PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || null,
  );
  const vercelProduction = normalizeBaseUrl(
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || null,
  );
  const vercelDeployment = normalizeBaseUrl(process.env.VERCEL_URL?.trim() || null);

  if (process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production") {
    return vercelProduction ?? configured ?? vercelDeployment;
  }

  if (process.env.VERCEL === "1") {
    return vercelDeployment ?? configured ?? vercelProduction;
  }

  return configured ?? vercelProduction ?? vercelDeployment;
}
