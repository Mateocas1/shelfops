import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const infra = "infra/terraform";
const demoRoot = `${infra}/envs/demo/main.tf`;
const computeModule = `${infra}/modules/compute/main.tf`;
const boundaryModule = `${infra}/modules/ci_boundary/main.tf`;
const oidcModule = `${infra}/modules/github_oidc/main.tf`;

const read = (path: string) => readFile(path, "utf8");

/** Body of the first HCL block whose header starts with `header`. */
const blockBody = (source: string, header: string): string => {
  const start = source.indexOf(header);
  if (start < 0) throw new Error(`block not found: ${header}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`unterminated block: ${header}`);
};

/** Every top-level `statement { ... }` body inside an HCL block body. */
const statementsOf = (body: string): string[] => {
  const statements: string[] = [];
  let cursor = 0;
  while (cursor < body.length) {
    const start = body.indexOf("statement {", cursor);
    if (start < 0) break;
    const statement = blockBody(body.slice(start), "statement {");
    statements.push(statement);
    cursor = start + statement.length;
  }
  return statements;
};

const statements = async (path: string, header: string) => statementsOf(blockBody(await read(path), header));
const roleBlocks = async (path: string) => {
  const source = await read(path);
  return [...source.matchAll(/resource "aws_iam_role" "([^"]+)"/g)].map((match) => blockBody(source.slice(match.index), `"${match[1]}"`));
};

describe("CI permissions boundary", () => {
  it("creates the project-scoped boundary from the AWS-documented pattern", async () => {
    const source = await read(boundaryModule);

    expect(source).toContain("${var.name}-ci-boundary");
    expect(source).toMatch(/docs\.aws\.amazon\.com\/IAM\/latest\/UserGuide\/access_policies_boundaries\.html/);
    expect(source).toMatch(/docs\.aws\.amazon\.com\/service-authorization\/latest\/reference\/list_iam\.html/);

    const policy = await statements(boundaryModule, 'data "aws_iam_policy_document" "boundary"');
    expect(policy.length).toBeGreaterThan(0);
    // The demo services are allowed, IAM is not: no blanket iam:* in an allow statement.
    for (const statement of policy.filter((entry) => entry.includes('"Allow"'))) {
      expect(statement).not.toMatch(/"iam:\*"/);
    }

    // Allow only when this boundary is attached, and deny roles/policies changed without it.
    const allow = policy.filter((statement) => statement.includes("iam:PermissionsBoundary") && statement.includes('"Allow"'));
    expect(allow.some((statement) => statement.includes("iam:CreateRole") && statement.includes("StringEquals"))).toBe(true);
    const deny = policy.filter((statement) => statement.includes("iam:PermissionsBoundary") && statement.includes('"Deny"'));
    expect(deny.some((statement) => statement.includes("StringNotEquals") && statement.includes("iam:PutRolePolicy"))).toBe(true);

    // The boundary itself can never be deleted, rewritten or detached.
    const protectedBy = policy.filter((statement) => statement.includes('"Deny"'));
    expect(protectedBy.some((statement) => statement.includes("iam:DeleteRolePermissionsBoundary"))).toBe(true);
    expect(protectedBy.some((statement) => statement.includes("iam:DeletePolicy") && statement.includes("local.boundary_arn"))).toBe(true);
    expect(protectedBy.some((statement) => statement.includes("iam:CreatePolicyVersion") && statement.includes("local.boundary_arn"))).toBe(true);
  });

  it("requires the boundary on the apply role's privilege-escalation actions", async () => {
    const policy = await statements(oidcModule, 'data "aws_iam_policy_document" "apply"');
    const escalation = policy.filter((statement) =>
      ["iam:CreateRole", "iam:PutRolePermissionsBoundary", "iam:PutRolePolicy", "iam:AttachRolePolicy"].some((action) => statement.includes(action))
    );

    expect(policy.some((statement) => statement.includes('"iam:*"'))).toBe(false);
    const guarded = escalation.filter((statement) => statement.includes("iam:PermissionsBoundary"));
    expect(guarded).toHaveLength(1);
    for (const action of ["iam:CreateRole", "iam:PutRolePermissionsBoundary", "iam:PutRolePolicy", "iam:AttachRolePolicy"]) {
      expect(guarded[0]).toContain(action);
    }
    expect(guarded[0]).toContain("StringEquals");
    expect(guarded[0]).toContain("var.permissions_boundary_arn");
  });

  it("attaches the boundary to every IAM role the stack creates", async () => {
    const roles = [...(await roleBlocks(computeModule)), ...(await roleBlocks(oidcModule))];

    expect(roles).toHaveLength(5);
    for (const role of roles) expect(role).toContain("permissions_boundary");
    expect((await read(demoRoot)).match(/permissions_boundary_arn\s*=/g)).toHaveLength(2);
  });
});
