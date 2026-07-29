import { describe, expect, it } from "vitest";
import { sanitizeText } from "../src/sanitize.js";

describe("sanitizeText", () => {
  describe("secrets", () => {
    it("redacts private key blocks", () => {
      const input =
        "config:\n-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----\ndone";
      const { text, report } = sanitizeText(input);
      expect(text).not.toContain("MIIEow");
      expect(text).toContain("[REDACTED:private-key]");
      expect(report.counts["private-key"]).toBe(1);
    });

    it("redacts JWTs", () => {
      const jwt =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dQw4w9WgXcQdQw4w9WgXcQ";
      const { text, report } = sanitizeText(`login fails with ${jwt} attached`);
      expect(text).not.toContain("eyJhbGci");
      expect(report.counts.jwt).toBe(1);
    });

    it("redacts AWS access key ids", () => {
      const { text } = sanitizeText("creds AKIAIOSFODNN7EXAMPLE in env");
      expect(text).toContain("[REDACTED:aws-access-key]");
      expect(text).not.toContain("AKIAIOSFODNN7EXAMPLE");
    });

    it("redacts key=value style secrets", () => {
      const { text, report } = sanitizeText(
        'set password=Sup3rS3creta and api_key: "sk-abcdef123456"',
      );
      expect(text).not.toContain("Sup3rS3creta");
      expect(text).not.toContain("sk-abcdef123456");
      expect(report.counts["generic-secret"]).toBe(2);
    });

    it("does not flag the word password on its own", () => {
      const { report } = sanitizeText(
        "The password field must show a strength meter",
      );
      expect(report.total).toBe(0);
    });
  });

  describe("payment cards", () => {
    it("redacts Luhn-valid card numbers keeping last 4", () => {
      const { text, report } = sanitizeText(
        "customer paid with 4111 1111 1111 1111 at checkout",
      );
      expect(text).toContain("[REDACTED:payment-card:…1111]");
      expect(text).not.toContain("4111 1111 1111");
      expect(report.counts["payment-card"]).toBe(1);
    });

    it("leaves Luhn-invalid digit runs alone (ids, timestamps)", () => {
      const { text, report } = sanitizeText(
        "order 1234 5678 9012 3456 failed at 1699999999999",
      );
      expect(text).toContain("1234 5678 9012 3456");
      expect(report.counts["payment-card"]).toBeUndefined();
    });
  });

  describe("contact data", () => {
    it("redacts emails", () => {
      const { text, report } = sanitizeText(
        "reported by maria.perez@example.com yesterday",
      );
      expect(text).toContain("[REDACTED:email]");
      expect(text).not.toContain("maria.perez");
      expect(report.counts.email).toBe(1);
    });

    it("redacts international phone numbers", () => {
      const { text } = sanitizeText("call +57 300 123 4567 to confirm");
      expect(text).not.toContain("300 123 4567");
    });

    it("redacts US SSN shapes", () => {
      const { text } = sanitizeText("ssn on file 123-45-6789");
      expect(text).toContain("[REDACTED:government-id]");
    });

    it("does not mangle issue keys or versions", () => {
      const input = "PROJ-1234 regressed in v2.10.3 after PR #5678";
      const { text, report } = sanitizeText(input);
      expect(text).toBe(input);
      expect(report.total).toBe(0);
    });
  });

  it("reports counts only — the report never contains redacted values", () => {
    const { report } = sanitizeText("mail a@b.co card 4111111111111111");
    expect(JSON.stringify(report)).not.toContain("a@b.co");
    expect(JSON.stringify(report)).not.toContain("4111");
  });
});
