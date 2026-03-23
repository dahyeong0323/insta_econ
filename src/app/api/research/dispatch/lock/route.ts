import { NextResponse } from "next/server";

import {
  clearResearchDispatchLock,
  readResearchDispatchLockState,
} from "@/lib/research/scheduler";
import {
  authorizeOperatorRequest,
  RequestAuthError,
  RequestConfigError,
} from "@/lib/security/requests";
import { PersistentStorageConfigError } from "@/lib/storage/blob";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    authorizeOperatorRequest(request);

    const state = await readResearchDispatchLockState();
    return NextResponse.json(state);
  } catch (error) {
    const status =
      error instanceof RequestAuthError
        ? 401
        : error instanceof RequestConfigError || error instanceof PersistentStorageConfigError
          ? 500
          : 400;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to read research dispatch lock.",
      },
      { status },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    authorizeOperatorRequest(request);

    const result = await clearResearchDispatchLock();
    const state = await readResearchDispatchLockState();

    return NextResponse.json({
      ...result,
      state,
    });
  } catch (error) {
    const status =
      error instanceof RequestAuthError
        ? 401
        : error instanceof RequestConfigError || error instanceof PersistentStorageConfigError
          ? 500
          : 400;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to clear research dispatch lock.",
      },
      { status },
    );
  }
}
