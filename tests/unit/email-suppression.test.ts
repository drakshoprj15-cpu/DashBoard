import { describe, expect, it } from "vitest";

import { suppressionReasonForResendEvent } from "@/features/emails/suppression";

describe("supressão de destinatários do Resend", () => {
  it("suprime somente bounces permanentes", () => {
    expect(
      suppressionReasonForResendEvent("email.bounced", {
        bounce: { type: "Permanent", subType: "General" },
      }),
    ).toBe("bounce");
    expect(
      suppressionReasonForResendEvent("email.bounced", {
        bounce: { type: "Transient", subType: "MailboxFull" },
      }),
    ).toBeNull();
    expect(
      suppressionReasonForResendEvent("email.bounced", {
        bounce: { type: "Undetermined" },
      }),
    ).toBeNull();
  });

  it("mantém reclamações e supressões do provedor protegidas", () => {
    expect(suppressionReasonForResendEvent("email.complained", {})).toBe(
      "complaint",
    );
    expect(suppressionReasonForResendEvent("email.suppressed", {})).toBe(
      "provider",
    );
    expect(suppressionReasonForResendEvent("email.failed", {})).toBeNull();
  });
});
