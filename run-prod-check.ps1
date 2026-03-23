param(
  [string]$BaseUrl
)

$envFile = Get-Content -LiteralPath ".env.local"

function Get-EnvValue([string]$name) {
  $line = $envFile | Where-Object { $_ -match "^$name=" } | Select-Object -First 1

  if (-not $line) {
    throw "Missing $name in .env.local"
  }

  return $line.Split("=", 2)[1].Trim()
}

$resolvedBaseUrl = if ($BaseUrl) {
  $BaseUrl.Trim().TrimEnd("/")
} else {
  (Get-EnvValue "PUBLIC_BASE_URL").TrimEnd("/")
}

$dispatchSecret = Get-EnvValue "RESEARCH_DISPATCH_SECRET"
$telegramSecret = Get-EnvValue "TELEGRAM_WEBHOOK_SECRET"
$operatorSecret = Get-EnvValue "OPERATOR_API_SECRET"

Write-Host "Checking production endpoints against $resolvedBaseUrl"

$dispatchHeaders = @{
  Authorization = "Bearer $dispatchSecret"
  "Content-Type" = "application/json"
}

$operatorHeaders = @{
  "x-operator-secret" = $operatorSecret
  "Content-Type" = "application/json"
}

$telegramHeaders = @{
  "x-telegram-bot-api-secret-token" = $telegramSecret
  "Content-Type" = "application/json"
}

try {
  $dispatchResponse = Invoke-WebRequest `
    -Uri "$resolvedBaseUrl/api/research/dispatch" `
    -Method POST `
    -Headers $dispatchHeaders `
    -Body '{"sendToTelegram":false}' `
    -UseBasicParsing
  Write-Host "dispatch status:" $dispatchResponse.StatusCode
  Write-Host $dispatchResponse.Content
} catch {
  Write-Host "dispatch failed"
  throw
}

try {
  $preflightResponse = Invoke-WebRequest `
    -Uri "$resolvedBaseUrl/api/instagram/preflight" `
    -Method POST `
    -Headers $operatorHeaders `
    -Body "{}" `
    -UseBasicParsing
  Write-Host "instagram preflight status:" $preflightResponse.StatusCode
  Write-Host $preflightResponse.Content
} catch {
  Write-Host "instagram preflight failed"
  throw
}

try {
  Invoke-WebRequest `
    -Uri "$resolvedBaseUrl/api/telegram/webhook" `
    -Method POST `
    -Headers @{ "Content-Type" = "application/json" } `
    -Body "{}" `
    -UseBasicParsing | Out-Null
  Write-Host "webhook without secret: unexpected success"
} catch {
  if ($_.Exception.Response) {
    Write-Host "webhook without secret status:" ([int]$_.Exception.Response.StatusCode)
  } else {
    throw
  }
}

try {
  $webhookResponse = Invoke-WebRequest `
    -Uri "$resolvedBaseUrl/api/telegram/webhook" `
    -Method POST `
    -Headers $telegramHeaders `
    -Body "{}" `
    -UseBasicParsing
  Write-Host "webhook with secret status:" $webhookResponse.StatusCode
  Write-Host $webhookResponse.Content
} catch {
  Write-Host "webhook with secret failed"
  throw
}

Write-Host ""
Write-Host "Operator publish endpoints still require a real run id to test fully."
Write-Host "Use -BaseUrl https://insta-econ-fzr1.vercel.app to override a stale local PUBLIC_BASE_URL."
