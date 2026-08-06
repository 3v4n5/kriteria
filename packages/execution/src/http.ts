/**
 * Real HTTP client: fetch with a hard timeout.
 *
 * Kept apart from the runner so every assertion, extraction and safety rule
 * is testable without a network, and so the transport can be swapped for a
 * proxy-aware client later without touching execution logic.
 */

import type { HttpClient } from "./api-runner.js";

export function createFetchClient(): HttpClient {
  return async (req, timeoutMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        ...(req.body !== undefined ? { body: req.body } : {}),
        signal: controller.signal,
        redirect: "manual", // a redirect is a result to assert on, not to follow
      });
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.text(),
      };
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new Error(`timeout tras ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}
