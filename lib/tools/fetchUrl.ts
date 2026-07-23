import { tool } from "ai";
import { z } from "zod";

function extractReadableText(html: string): string {
  // Strip script/style blocks, then tags, then collapse whitespace.
  // Deliberately dependency-free (no headless browser, no jsdom) — good enough for
  // reading article/documentation-style pages, which is the agent's primary use case.
  const noScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const text = noScripts
    .replace(/<\/(p|div|br|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

export const fetchUrlTool = tool({
  description:
    "Fetch a specific URL and return its readable text content, for reading a source in full after finding it via web_search.",
  parameters: z.object({
    url: z.string().url().describe("The URL to fetch"),
  }),
  execute: async ({ url }) => {
    const res = await fetch(url, {
      headers: { "User-Agent": "MicroManusBot/1.0 (+research agent)" },
      redirect: "follow",
    });

    if (!res.ok) {
      return { url, error: `Failed to fetch: ${res.status} ${res.statusText}` };
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return { url, error: `Unsupported content type: ${contentType}` };
    }

    const html = await res.text();
    const text = extractReadableText(html);
    const MAX_CHARS = 4000; // kept deliberately small: low-tier providers (e.g. Groq free tier,
    // 8K tokens/minute) can blow their rate limit in a single agent turn if tool results are
    // large. ~4000 chars is roughly 1000 tokens — enough to extract the gist of a page without
    // making every research turn borderline on constrained providers. Raise this if you're on
    // a higher-throughput plan/provider and want deeper page reads.

    return {
      url,
      content: text.slice(0, MAX_CHARS),
      truncated: text.length > MAX_CHARS,
    };
  },
});

