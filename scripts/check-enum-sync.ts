/**
 * T0.2.2 — spec/schema.sql 의 ENUM 과 spec/types.ts 의 `as const` 배열이
 * 1:1 로 일치하는지 검사한다. (CLAUDE.md §3: "한쪽만 바꾸지 말 것")
 *
 * 실행: pnpm check-enum-sync
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as spec from '@gukjang/spec';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const schemaSqlPath = path.join(repoRoot, 'spec', 'schema.sql');

/** schema.sql 의 ENUM 타입명 → spec/types.ts export 이름 매핑 */
const ENUM_TO_EXPORT: Record<string, keyof typeof spec> = {
  market_kind: 'MARKETS',
  node_kind: 'NODE_KINDS',
  entity_kind: 'ENTITY_KINDS',
  alias_kind: 'ALIAS_KINDS',
  edge_kind: 'EDGE_KINDS',
  connection_kind: 'CONNECTION_KINDS',
  edge_origin: 'EDGE_ORIGINS',
  connection_state: 'CONNECTION_STATES',
  analysis_state: 'ANALYSIS_STATES',
  relevance_band: 'RELEVANCE_BANDS',
  feedback_kind: 'FEEDBACK_KINDS',
};

function parseSqlEnums(sql: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const re = /CREATE TYPE\s+(\w+)\s+AS ENUM\s*\(([\s\S]*?)\);/g;
  let match = re.exec(sql);
  while (match !== null) {
    const [, typeName, body] = match;
    const values = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    result.set(typeName, values);
    match = re.exec(sql);
  }
  return result;
}

function main(): void {
  const sql = readFileSync(schemaSqlPath, 'utf-8');
  const sqlEnums = parseSqlEnums(sql);

  let ok = true;
  const checked: string[] = [];

  for (const [typeName, exportName] of Object.entries(ENUM_TO_EXPORT)) {
    const sqlValues = sqlEnums.get(typeName);
    if (!sqlValues) {
      console.error(`✗ schema.sql 에 CREATE TYPE ${typeName} 이 없습니다.`);
      ok = false;
      continue;
    }
    const tsValues = spec[exportName] as readonly string[] | undefined;
    if (!tsValues) {
      console.error(`✗ spec/types.ts 에 export ${String(exportName)} 이 없습니다.`);
      ok = false;
      continue;
    }

    const sqlSorted = [...sqlValues].sort();
    const tsSorted = [...tsValues].sort();
    const same =
      sqlSorted.length === tsSorted.length && sqlSorted.every((v, i) => v === tsSorted[i]);

    if (!same) {
      ok = false;
      console.error(`✗ ${typeName} (schema.sql) ↔ ${String(exportName)} (types.ts) 불일치`);
      console.error(`  schema.sql : [${sqlValues.join(', ')}]`);
      console.error(`  types.ts   : [${tsValues.join(', ')}]`);
    } else {
      checked.push(typeName);
    }
  }

  // schema.sql 에는 있는데 매핑 테이블에도 없는 ENUM이 있으면 경고 (놓친 게 없는지)
  for (const typeName of sqlEnums.keys()) {
    if (!(typeName in ENUM_TO_EXPORT)) {
      console.warn(`⚠ schema.sql 의 ENUM "${typeName}" 이 check-enum-sync 매핑에 없습니다.`);
    }
  }

  if (ok) {
    console.log(`✓ enum 동기화 확인 완료 (${checked.length}개): ${checked.join(', ')}`);
    process.exit(0);
  } else {
    console.error('\nenum 동기화 실패. spec/schema.sql 과 spec/types.ts 를 같은 커밋에서 맞출 것.');
    process.exit(1);
  }
}

main();
