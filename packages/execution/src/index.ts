/**
 * @kriteria/execution — turning a plan into a recorded run.
 *
 * Pure logic only: case selection, aggregation, verdict, and mechanical
 * exit-criteria evaluation. The interactive shell (readline, evidence
 * capture, persistence) lives in the CLI, so everything here is unit-testable
 * without a human in the loop.
 */

export * from "./select.js";
export * from "./summary.js";
export * from "./exit-criteria.js";
export * from "./json-path.js";
export * from "./api-runner.js";
export * from "./http.js";
