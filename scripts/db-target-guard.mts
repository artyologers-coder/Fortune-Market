/**
 * Test-database interlock for the verification suites.
 *
 * WHY THIS EXISTS
 * ---------------
 * These suites write rows: producers, payments, commissions, payouts, guide
 * edits and audit entries. They used to run against whatever DATABASE_URL
 * pointed at, which was the live production endpoint. That silently wrote 400+
 * synthetic rows into the production audit log before anyone noticed.
 *
 * This module is imported for its side effect, BEFORE `../src/lib/prisma` is
 * evaluated, so PrismaClient is constructed against the checked target rather
 * than the ambient DATABASE_URL. ES module evaluation order guarantees this
 * holds as long as the import stays first in the file.
 *
 * Behaviour is fail-closed: if no explicit test URL is configured, the ambient
 * DATABASE_URL is checked too, so a production DATABASE_URL aborts the run
 * rather than writing to it.
 */

/**
 * Endpoint IDs that hold live user data. Matched as a prefix of the connection
 * host so the `-pooler` variant is covered by the same entry.
 *
 * If these endpoints are ever replaced, update this list in the same change
 * that repoints `.env`, or this guard will silently stop protecting anything.
 */
const PRODUCTION_ENDPOINTS = ["ep-rough-mountain-b3fah4f2"];

const TEST_URL_VAR = "REPRESENTATIVE_TEST_DATABASE_URL";
const OVERRIDE_VAR = "REPRESENTATIVE_ALLOW_PRODUCTION_TESTS";

function endpointIdOf(connectionString: string): string | null {
  const match = connectionString.match(/\/\/[^@/]*@?([^/:?]+)/);
  if (!match) return null;
  // Hostnames look like ep-<slug>[-pooler].<region>.neon.tech
  const ep = match[1].match(/^(ep-[a-z0-9-]+?)(?:-pooler)?(?:\.|$)/);
  return ep ? ep[1] : match[1];
}

function describe(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const user = decodeURIComponent(url.username);
    const host = url.hostname;
    return `${user}@${host}${url.pathname}`;
  } catch {
    return "(unparseable connection string)";
  }
}

const target = process.env[TEST_URL_VAR] ?? process.env.DATABASE_URL;

if (!target) {
  console.error(
    `[guard] No database target. Set ${TEST_URL_VAR} to a non-production branch URL.`
  );
  process.exit(1);
}

const endpointId = endpointIdOf(target);
const isProduction = endpointId !== null && PRODUCTION_ENDPOINTS.includes(endpointId);

if (isProduction) {
  if (process.env[OVERRIDE_VAR] !== "1") {
    console.error(
      [
        "",
        "[guard] REFUSING TO RUN: the verification suites would write to PRODUCTION.",
        "",
        `        target: ${describe(target)}`,
        `        endpoint: ${endpointId}`,
        "",
        `These suites create producers, payments, commissions, payouts and audit rows.`,
        `Point ${TEST_URL_VAR} at a dev branch instead:`,
        "",
        "    REPRESENTATIVE_TEST_DATABASE_URL=postgresql://...@<dev-endpoint>/neondb \\",
        "      npx tsx scripts/verify-rep-flows.mts",
        "",
        `To override deliberately (only if you accept polluting production data), set:`,
        `    ${OVERRIDE_VAR}=1`,
        "",
      ].join("\n")
    );
    process.exit(1);
  }
  console.warn(
    `[guard] WARNING: ${OVERRIDE_VAR}=1 set. Running against PRODUCTION ${describe(target)}.`
  );
} else {
  console.log(`[guard] test target: ${describe(target)} (endpoint ${endpointId ?? "unknown"})`);
}

// PrismaClient reads DATABASE_URL at construction. This assignment only works
// because this module is evaluated before ../src/lib/prisma.
process.env.DATABASE_URL = target;
