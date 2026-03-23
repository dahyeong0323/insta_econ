import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorReason = searchParams.get("error_reason");
  const errorDescription = searchParams.get("error_description");
  const state = searchParams.get("state");

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error,
        errorReason,
        errorDescription,
        state,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    code,
    state,
    message: "Instagram OAuth callback received.",
  });
}
