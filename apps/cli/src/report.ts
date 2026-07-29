/**
 * `kriteria report` — informe HTML legible a partir de los artefactos de una
 * corrida: out/<REF>/{testplan.yml, testcases.yml, critic.md, run.json}
 * → out/<REF>/informe-<REF>.html
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export function reportCommand(dir: string): string {
  const ref = dir.replace(/\/+$/, "").split("/").pop()!;

  const plan = parse(readFileSync(join(dir, "testplan.yml"), "utf8"));
  const design = parse(readFileSync(join(dir, "testcases.yml"), "utf8"));
  const criticMd = readFileSync(join(dir, "critic.md"), "utf8");
  const run = JSON.parse(readFileSync(join(dir, "run.json"), "utf8"));

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const inlineMd = (s: string) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");

// --- critic.md → findings estructurados -----------------------------------
interface Finding { id: string; sev: string; kind: string; text: string; refs: string; fix: string }
function parseRound(md: string, round: number): { verdict: string; findings: Finding[] } | null {
  const m = md.match(new RegExp(`## Round ${round} — (\\S+)([\\s\\S]*?)(?=## Round |$)`));
  if (!m) return null;
  const findings: Finding[] = [];
  const re = /- \*\*\[(\w+)\] (CRT-\d+)\*\* \((.*?)\) ([\s\S]*?)\n\s*- refs: (.*?)\n\s*- fix: (.*?)(?=\n- \*\*|\n*$)/g;
  for (const f of m[2]!.matchAll(re)) {
    findings.push({ sev: f[1]!, id: f[2]!, kind: f[3]!, text: f[4]!.trim(), refs: f[5]!.trim(), fix: f[6]!.trim() });
  }
  return { verdict: m[1]!, findings };
}
const rounds = [1, 2].map((n) => parseRound(criticMd, n)).filter(Boolean) as { verdict: string; findings: Finding[] }[];
const scope = criticMd.match(/Scope: ([\s\S]*?)\n\n/)?.[1] ?? "";

const SEV_ES: Record<string, string> = { blocker: "Bloqueante", major: "Mayor", advisory: "Sugerencia" };
const PRIO_ES: Record<string, string> = { critical: "Crítica", high: "Alta", medium: "Media", low: "Baja" };
const DEPTH_ES: Record<string, string> = { smoke: "humo", standard: "estándar", thorough: "profunda", exhaustive: "exhaustiva" };

const riskCell = (n: number) => `<span class="scale s${n}">${n}</span>`;

const casesHtml = design.cases
  .map((c: any) => `
  <details class="case">
    <summary>
      <span class="cid">${esc(c.id)}</span>
      <span class="ctitle">${esc(c.title)}</span>
      <span class="badges">
        <span class="badge prio-${esc(c.priority)}">${PRIO_ES[c.priority] ?? esc(c.priority)}</span>
        <span class="badge">${esc(c.level)}</span>
        <span class="badge">${esc(c.type)}</span>
        <span class="badge tech">${esc(c.technique)}</span>
        ${c.needsHuman ? '<span class="badge human">requiere humano</span>' : ""}
      </span>
    </summary>
    <div class="casebody">
      <p class="trace"><strong>Cubre:</strong> ${esc(c.covers.join(", "))} &nbsp;·&nbsp;
        <strong>Mitiga:</strong> ${esc(c.mitigates.join(", ") || "—")} &nbsp;·&nbsp;
        <strong>Verifica:</strong> ${esc(c.verifies.join(", ") || "—")}</p>
      ${c.preconditions?.length ? `<p><strong>Precondiciones:</strong></p><ul>${c.preconditions.map((p: string) => `<li>${inlineMd(p)}</li>`).join("")}</ul>` : ""}
      ${c.dataRequirements?.length ? `<p><strong>Datos:</strong></p><ul>${c.dataRequirements.map((d: string) => `<li>${inlineMd(d)}</li>`).join("")}</ul>` : ""}
      <table class="steps"><thead><tr><th>#</th><th>Acción</th><th>Resultado esperado</th></tr></thead><tbody>
        ${c.steps.map((s: any, i: number) => `<tr><td>${i + 1}</td><td>${inlineMd(s.action)}</td><td>${inlineMd(s.expected)}</td></tr>`).join("")}
      </tbody></table>
      ${c.notes ? `<p><strong>Notas:</strong> ${inlineMd(c.notes)}</p>` : ""}
    </div>
  </details>`)
  .join("");

const findingsHtml = (r: { verdict: string; findings: Finding[] }, n: number) => `
  <h3>Ronda ${n} — <span class="verdict v-${r.verdict}">${r.verdict === "pass" ? "APROBADO" : "REQUIERE REVISIÓN"}</span></h3>
  ${r.findings.map((f) => `
  <div class="finding sev-${f.sev}">
    <div class="fhead"><span class="badge sev-${f.sev}">${SEV_ES[f.sev] ?? f.sev}</span>
      <strong>${esc(f.id)}</strong> <span class="kind">${esc(f.kind)}</span></div>
    <p>${inlineMd(f.text)}</p>
    <p class="fix"><strong>Corrección propuesta:</strong> ${inlineMd(f.fix)}</p>
    <p class="refs">Referencias: ${esc(f.refs)}</p>
  </div>`).join("")}`;

const totals = rounds.at(-1)!.findings.reduce(
  (a, f) => ({ ...a, [f.sev]: (a as any)[f.sev] + 1 }),
  { blocker: 0, major: 0, advisory: 0 },
);

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kriteria — Plan de QA ${esc(ref)}</title>
<style>
  :root { --ink:#1a1f2e; --muted:#5b6478; --line:#e3e6ee; --bg:#fafbfd; --card:#fff;
    --blocker:#c62838; --major:#b26a00; --advisory:#3d6bb3; --ok:#1e7d46; }
  * { box-sizing:border-box }
  body { font:15px/1.55 -apple-system,"Segoe UI",Roboto,sans-serif; color:var(--ink); background:var(--bg); margin:0; padding:2rem 1rem 4rem; }
  main { max-width:900px; margin:0 auto }
  h1 { font-size:1.5rem; margin:.2rem 0 } h2 { font-size:1.15rem; margin:2.2rem 0 .6rem; border-bottom:2px solid var(--line); padding-bottom:.3rem }
  h3 { font-size:1rem; margin:1.4rem 0 .5rem }
  .sub { color:var(--muted) } code { background:#eef1f7; padding:.05em .35em; border-radius:4px; font-size:.9em }
  .kpis { display:flex; gap:.7rem; flex-wrap:wrap; margin:1.2rem 0 }
  .kpi { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:.6rem 1rem; min-width:120px }
  .kpi b { display:block; font-size:1.15rem } .kpi span { color:var(--muted); font-size:.8rem }
  table { border-collapse:collapse; width:100%; background:var(--card); font-size:.92em }
  th,td { border:1px solid var(--line); padding:.45rem .6rem; text-align:left; vertical-align:top }
  th { background:#f0f2f8 }
  .badge { display:inline-block; font-size:.75rem; padding:.1rem .5rem; border-radius:99px; background:#eef1f7; color:var(--muted); margin-right:.25rem }
  .badge.tech { background:#e8f0fe; color:#2b579a } .badge.human { background:#fdeed8; color:#9a6b1a }
  .badge.prio-critical { background:#fbe0e3; color:var(--blocker) } .badge.prio-high { background:#fdeed8; color:#9a5800 }
  .badge.prio-medium { background:#e8f0fe; color:#2b579a } .badge.prio-low { background:#e7f3ec; color:var(--ok) }
  .badge.sev-blocker { background:var(--blocker); color:#fff } .badge.sev-major { background:var(--major); color:#fff }
  .badge.sev-advisory { background:var(--advisory); color:#fff }
  .verdict.v-pass { color:var(--ok) } .verdict.v-needs-revision { color:var(--blocker) }
  .case { background:var(--card); border:1px solid var(--line); border-radius:10px; margin:.5rem 0; overflow:hidden }
  .case summary { cursor:pointer; padding:.6rem .9rem; display:flex; gap:.6rem; align-items:center; flex-wrap:wrap }
  .case summary::-webkit-details-marker { display:none }
  .cid { font-weight:700; font-family:ui-monospace,monospace; color:#2b579a } .ctitle { flex:1; min-width:220px }
  .casebody { padding:.4rem 1rem 1rem; border-top:1px solid var(--line) }
  .trace { color:var(--muted); font-size:.88em }
  .finding { background:var(--card); border:1px solid var(--line); border-left:4px solid var(--line); border-radius:8px; padding:.7rem 1rem; margin:.6rem 0 }
  .finding.sev-blocker { border-left-color:var(--blocker) } .finding.sev-major { border-left-color:var(--major) }
  .finding.sev-advisory { border-left-color:var(--advisory) }
  .fhead { margin-bottom:.3rem } .kind { color:var(--muted); font-size:.85em }
  .fix { background:#f4f7f4; padding:.4rem .6rem; border-radius:6px; font-size:.92em }
  .refs { color:var(--muted); font-size:.8em }
  .scale { display:inline-block; width:1.6em; text-align:center; border-radius:5px; font-weight:600; color:#fff }
  .s1,.s2 { background:#7fae92 } .s3 { background:#d9a441 } .s4 { background:#cf7434 } .s5 { background:var(--blocker) }
  ul { margin:.3rem 0 .6rem 1.2rem; padding:0 }
  .amb { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:.7rem 1rem; margin:.5rem 0 }
  .amb p { margin:.25rem 0 }
</style></head><body><main>

<p class="sub">Kriteria · informe de corrida · ${esc(new Date(run.ranAt).toLocaleString("es-CO"))}</p>
<h1>Plan de QA — ${esc(ref)}</h1>
<p class="sub">${esc(plan.analysis.features[0]?.summary ?? "")}</p>

<div class="kpis">
  <div class="kpi"><b class="verdict v-${esc(run.verdict)}">${run.verdict === "pass" ? "APROBADO" : "REQUIERE REVISIÓN"}</b><span>veredicto del crítico</span></div>
  <div class="kpi"><b>${design.cases.length}</b><span>casos diseñados</span></div>
  <div class="kpi"><b>${totals.blocker} / ${totals.major} / ${totals.advisory}</b><span>bloq. / mayores / suger. (ronda final)</span></div>
  <div class="kpi"><b>${DEPTH_ES[plan.strategy.depth] ?? esc(plan.strategy.depth)}</b><span>profundidad</span></div>
  <div class="kpi"><b>${PRIO_ES[plan.strategy.overallRisk] ?? esc(plan.strategy.overallRisk)}</b><span>riesgo global</span></div>
</div>

<h2>1 · Estrategia seleccionada (motor determinista)</h2>
<p><strong>Enfoque:</strong> ${esc(plan.strategy.approach)}${plan.strategy.supporting?.length ? ` (apoyo: ${esc(plan.strategy.supporting.join(", "))})` : ""}</p>
<ul>${plan.strategy.approachRationale.map((r: string) => `<li>${esc(r)}</li>`).join("")}</ul>
<p><strong>Niveles:</strong> ${plan.strategy.levels.map((l: any) => `<span class="badge">${esc(l.value)}</span>`).join(" ")}
&nbsp; <strong>Tipos:</strong> ${plan.strategy.types.map((t: any) => `<span class="badge">${esc(t.value)}</span>`).join(" ")}</p>
<h3>Técnicas por nivel</h3>
<table><thead><tr><th>Nivel</th><th>Técnica</th><th>Obligatoria</th><th>Justificación</th></tr></thead><tbody>
${plan.strategy.techniquesByLevel.flatMap((lt: any) =>
  lt.techniques.map((t: any, i: number) =>
    `<tr>${i === 0 ? `<td rowspan="${lt.techniques.length}">${esc(lt.level)}</td>` : ""}<td><code>${esc(t.technique)}</code></td><td>${t.mandatory ? "✅ sí" : "—"}</td><td>${esc(t.rationale)}</td></tr>`,
  ),
).join("")}
</tbody></table>

<h2>2 · Registro de riesgos (impulsa la profundidad)</h2>
<table><thead><tr><th>ID</th><th>Riesgo</th><th>Área</th><th>Prob.</th><th>Imp.</th></tr></thead><tbody>
${plan.riskRegister.factors.map((f: any) =>
  `<tr><td><code>${esc(f.id)}</code></td><td>${esc(f.description)}${f.mitigationHint ? `<br><span class="sub">Mitigación: ${esc(f.mitigationHint)}</span>` : ""}</td><td>${esc(f.area)}</td><td>${riskCell(f.likelihood)}</td><td>${riskCell(f.impact)}</td></tr>`,
).join("")}
</tbody></table>

<h2>3 · Ambigüedades a resolver con el equipo</h2>
${plan.analysis.ambiguities.map((a: any) => `
<div class="amb">
  <p><strong>${esc(a.id)}:</strong> ${inlineMd(a.question)}</p>
  <p><span class="badge">supuesto de trabajo</span> ${inlineMd(a.workingAssumption)}</p>
  <p><span class="badge">riesgo si es falso</span> ${inlineMd(a.riskIfWrong)}</p>
</div>`).join("")}

<h2>4 · Criterios de entrada y salida</h2>
<h3>Entrada</h3><ul>${plan.entryCriteria.map((c: string) => `<li>${inlineMd(c)}</li>`).join("")}</ul>
<h3>Salida</h3><ul>${plan.exitCriteria.map((c: string) => `<li>${inlineMd(c)}</li>`).join("")}</ul>

<h2>5 · Casos de prueba (${design.cases.length}) — clic para expandir</h2>
${casesHtml}
${design.exclusions?.length ? `<h3>Exclusiones declaradas</h3><ul>${design.exclusions.map((e: any) => `<li><strong>${inlineMd(e.what)}</strong> — ${inlineMd(e.why)}</li>`).join("")}</ul>` : ""}

<h2>6 · Reporte del crítico adversarial</h2>
<p class="sub">${inlineMd(scope)}</p>
${rounds.map((r, i) => findingsHtml(r, i + 1)).join("")}

<h2>7 · Consumo de la corrida</h2>
<table><thead><tr><th>Rol</th><th>Modelo</th><th>Tokens entrada</th><th>Tokens salida</th></tr></thead><tbody>
${run.calls.map((c: any) => `<tr><td>${esc(c.role)}</td><td><code>${esc(c.model)}</code></td><td>${c.usage.inputTokens.toLocaleString()}</td><td>${c.usage.outputTokens.toLocaleString()}</td></tr>`).join("")}
</tbody></table>
<p class="sub">Etapas no listadas se sirvieron del caché ($0). Revisiones aplicadas: ${run.revisions}.</p>

</main></body></html>`;

  const outPath = join(dir, `informe-${ref}.html`);
  writeFileSync(outPath, html, "utf8");
  return outPath;
}
