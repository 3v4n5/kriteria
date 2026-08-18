/**
 * @kriteria/evals — the measurement instrument.
 *
 * Scores produced plans against a senior QA's recorded expectations. Pure and
 * offline: it reads artifacts that already exist, so measuring costs nothing
 * and can be repeated after every prompt or engine change.
 */

export * from "./golden.js";
export * from "./score.js";
