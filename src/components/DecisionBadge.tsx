const STYLE: Record<string, string> = {
  APPLY_CANDIDATE: "badge-apply",
  REVIEW_REQUIRED: "badge-review",
  SKIP: "badge-skip",
};

const LABEL: Record<string, string> = {
  APPLY_CANDIDATE: "Apply candidate",
  REVIEW_REQUIRED: "Review required",
  SKIP: "Skip",
};

export function DecisionBadge({ decision }: { decision: string }) {
  return <span className={STYLE[decision] ?? "badge-skip"}>{LABEL[decision] ?? decision}</span>;
}
