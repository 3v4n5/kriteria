import { describe, expect, it } from "vitest";
import { normalizeJiraIssue, type RawJiraIssue } from "../src/jira.js";

/** ADF description as Jira Cloud actually returns it. */
const adfDescription = {
  type: "doc",
  version: 1,
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Buyers get tiered discounts. Contact " },
        { type: "text", text: "maria.perez@example.com" },
        { type: "text", text: " for details." },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Acceptance Criteria" }],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Cart >= 100 gets 10% off" }],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Checkout must feel smooth" }],
            },
          ],
        },
      ],
    },
  ],
};

const rawIssue: RawJiraIssue = {
  key: "SHOP-42",
  fields: {
    summary: "Tiered discount at checkout",
    description: adfDescription,
    issuetype: { name: "Story" },
    priority: { name: "High" },
    labels: ["checkout"],
    components: [{ name: "payments" }],
    updated: "2026-07-01T10:00:00.000+0000",
    issuelinks: [
      {
        type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
        outwardIssue: { key: "SHOP-50", fields: { summary: "Release 2.4" } },
      },
    ],
    attachment: [
      {
        filename: "mockup.png",
        mimeType: "image/png",
        content: "https://example.atlassian.net/secure/attachment/1/mockup.png",
      },
    ],
    parent: { key: "SHOP-1", fields: { summary: "Checkout epic" } },
    comment: {
      comments: [
        {
          body: {
            type: "doc",
            version: 1,
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "Test with card 4111 1111 1111 1111, token " },
                  {
                    type: "text",
                    text: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dQw4w9WgXcQdQw4w9WgXcQ",
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  },
};

describe("normalizeJiraIssue", () => {
  const { basis, redactions } = normalizeJiraIssue(rawIssue, {
    baseUrl: "https://example.atlassian.net",
  });

  it("produces a schema-valid TestBasis with source metadata", () => {
    expect(basis.source.kind).toBe("jira");
    expect(basis.source.ref).toBe("SHOP-42");
    expect(basis.source.url).toBe("https://example.atlassian.net/browse/SHOP-42");
    expect(basis.sourceType).toBe("Story");
    expect(basis.priority).toBe("High");
  });

  it("converts ADF and extracts acceptance criteria with testability", () => {
    expect(basis.acceptanceCriteria).toHaveLength(2);
    expect(basis.acceptanceCriteria[0]).toMatchObject({
      id: "AC-1",
      testable: true,
    });
    // "feel smooth" with no measurable anchor → not testable.
    expect(basis.acceptanceCriteria[1]!.testable).toBe(false);
  });

  it("sanitizes every field before it enters the basis", () => {
    const everything = JSON.stringify(basis);
    expect(everything).not.toContain("maria.perez@example.com");
    expect(everything).not.toContain("4111 1111 1111 1111");
    expect(everything).not.toContain("eyJhbGciOiJIUzI1NiI");

    expect(basis.description).toContain("[REDACTED:email]");
    expect(basis.discussion[0]).toContain("[REDACTED:payment-card:…1111]");
    expect(basis.discussion[0]).toContain("[REDACTED:jwt]");

    expect(redactions.counts.email).toBe(1);
    expect(redactions.counts["payment-card"]).toBe(1);
    expect(redactions.counts.jwt).toBe(1);
  });

  it("maps links, parent and attachments as references", () => {
    expect(basis.links).toContainEqual(
      expect.objectContaining({ ref: "SHOP-50", relation: "blocks" }),
    );
    expect(basis.links).toContainEqual(
      expect.objectContaining({ ref: "SHOP-1", relation: "parent" }),
    );
    expect(basis.attachments[0]).toMatchObject({
      name: "mockup.png",
      mimeType: "image/png",
    });
  });

  it("hashes sanitized content deterministically", () => {
    const again = normalizeJiraIssue(rawIssue, {
      baseUrl: "https://example.atlassian.net",
    });
    expect(again.basis.hash).toBe(basis.hash);

    const changed = normalizeJiraIssue(
      {
        ...rawIssue,
        fields: { ...rawIssue.fields, summary: "Different title" },
      },
      { baseUrl: "https://example.atlassian.net" },
    );
    expect(changed.basis.hash).not.toBe(basis.hash);
  });

  it("survives a minimal payload without optional fields", () => {
    const minimal = normalizeJiraIssue({ key: "X-1" });
    expect(minimal.basis.title).toBe("(no summary)");
    expect(minimal.basis.acceptanceCriteria).toEqual([]);
    expect(minimal.redactions.total).toBe(0);
  });
});
