import { type RunState } from "@/lib/agents/schema";
import { shouldAutoPublishOnImageApproval } from "@/lib/runs/publish";
import { triggerRunProcessing, triggerRunPublish } from "@/lib/runs/triggers";

export type ApprovedRunContinuationResult =
  | "process_triggered"
  | "image_revision_process_triggered"
  | "publish_triggered"
  | "noop";

export async function continueApprovedRunWorkflow(
  run: RunState,
): Promise<ApprovedRunContinuationResult> {
  if (
    run.workflow_status === "script_approved" &&
    Boolean(run.project) &&
    run.image_approval.status === "rejected" &&
    run.status !== "running"
  ) {
    await triggerRunProcessing(run.id);
    return "image_revision_process_triggered";
  }

  if (run.workflow_status === "script_approved" && !run.project && run.status !== "running") {
    await triggerRunProcessing(run.id);
    return "process_triggered";
  }

  if (
    run.workflow_status === "image_approved" &&
    run.publish_result.status !== "published" &&
    shouldAutoPublishOnImageApproval()
  ) {
    await triggerRunPublish(run.id, {
      trigger: "auto_on_image_approval",
      requestedBy: "auto-image-approval",
    });
    return "publish_triggered";
  }

  return "noop";
}
