"use client";

export default function DisclaimerBanner() {
  return (
    <div
      role="note"
      className="w-full px-4 py-1.5 text-center text-xs"
      style={{ background: "var(--warn-bg)", color: "var(--warn-fg)", borderBottom: "1px solid var(--warn-line)" }}
    >
      <strong className="font-semibold">Educational demo, not a medical device.</strong>{" "}
      Don&apos;t use it for clinical decisions, and don&apos;t upload images with patient information.
    </div>
  );
}
