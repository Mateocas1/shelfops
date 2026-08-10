import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type SourceIdentity = Readonly<{ id: string; kind: "proposal" | "requirement" | "scenario"; title: string; file: string; parentId?: string }>;
export type SourceCorpus = Readonly<{ proposal: SourceIdentity[]; requirements: SourceIdentity[]; scenarios: SourceIdentity[]; all: SourceIdentity[] }>;

const specs = ["api", "authorization", "incident-management", "operational-views", "reference-data", "sla-alerts"];
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function parseSourceCorpus(proposalText: string, specTexts: Record<string, string>): SourceCorpus {
  const proposalSection = proposalText.split("## Proposal-Level Acceptance Boundaries\n")[1]?.split("\n## ")[0];
  if (!proposalSection) throw new Error("Malformed proposal acceptance section");
  const proposalTitles = [...proposalSection.matchAll(/^- (.+)$/gm)].map((match) => match[1]!.trim());
  if (new Set(proposalTitles).size !== proposalTitles.length) throw new Error("Duplicate proposal source");
  const proposal = proposalTitles.map((title, index) => ({ id: `PAB-${String(index + 1).padStart(2, "0")}`, kind: "proposal" as const, title, file: "proposal.md" }));
  const requirements: SourceIdentity[] = [];
  const scenarios: SourceIdentity[] = [];
  for (const [file, text] of Object.entries(specTexts).sort(([left], [right]) => left.localeCompare(right))) {
    const capability = file.replace(/\\/g, "/").split("/").at(-2) ?? slug(file);
    let requirement: SourceIdentity | undefined;
    for (const line of text.split(/\r?\n/)) {
      const requirementMatch = /^### Requirement: (.+)$/.exec(line);
      if (requirementMatch) {
        const title = requirementMatch[1]!.trim();
        requirement = { id: `REQ-${capability}-${slug(title)}`, kind: "requirement", title, file };
        requirements.push(requirement);
      }
      const scenarioMatch = /^#### Scenario: (.+)$/.exec(line);
      if (scenarioMatch) {
        if (!requirement) throw new Error(`Malformed orphan scenario in ${file}`);
        const title = scenarioMatch[1]!.trim();
        scenarios.push({ id: `SCN-${capability}-${slug(requirement.title)}-${slug(title)}`, kind: "scenario", title, file, parentId: requirement.id });
      }
    }
  }
  const all = [...proposal, ...requirements, ...scenarios];
  if (proposal.length !== 10 || requirements.length !== 75 || scenarios.length !== 134) throw new Error(`Malformed source cardinality ${proposal.length}/${requirements.length}/${scenarios.length}`);
  if (all.some(({ id, title }) => !slug(title) || !/^[A-Za-z0-9-]+$/.test(id)) || new Set(all.map(({ id }) => id)).size !== all.length) throw new Error("Duplicate or malformed source identity");
  return { proposal, requirements, scenarios, all };
}

export async function loadApprovedSourceIds(root = process.cwd()): Promise<SourceCorpus> {
  const base = resolve(root, "openspec/changes/shelfops-mvp");
  const proposal = await readFile(resolve(base, "proposal.md"), "utf8");
  const entries = await Promise.all(specs.map(async (name) => {
    const file = `specs/${name}/spec.md`;
    return [file, await readFile(resolve(base, file), "utf8")] as const;
  }));
  return parseSourceCorpus(proposal, Object.fromEntries(entries));
}
