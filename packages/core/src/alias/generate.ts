/**
 * T1.1.3 — 별칭 생성기.
 * 결정론적 변환만 한다 (R1/R7): 주어진 사실(정식명/티커/영문명/구사명/브랜드명)로부터
 * `company_alias` 행 후보를 만든다. LLM 없이, 데이터에 없는 것을 지어내지 않는다.
 */
import type { AliasKind } from '@gukjang/spec';
import { normalizeName, toJamo } from '../normalize/hangul';
import { isAmbiguousAlias } from './ambiguous';

export interface CompanyAliasInput {
  /** 정식 사명 */
  name: string;
  ticker: string;
  /** 영문 사명 — 데이터 소스(KRX/DART)에 있을 때만 채운다. 번역해서 지어내지 않는다. */
  englishName?: string;
  /** 구 사명 이력 (A6: 하이닉스반도체 → SK하이닉스) */
  formerNames?: string[];
  /** 대표 브랜드명 (사명과 다른 경우) */
  brandNames?: string[];
  /** 지주회사 여부 — true면 "홀딩스/지주" 접미사를 뗀 SHORT 별칭을 만든다 (노루홀딩스 → 노루) */
  isHolding?: boolean;
}

export interface GeneratedAlias {
  alias: string;
  aliasNorm: string;
  aliasJamo: string;
  aliasType: AliasKind;
  isAmbiguous: boolean;
}

const HOLDING_SUFFIXES = ['홀딩스', '지주'] as const;

/** A5: 영문 2자 이하 약어(AI, SK, LG, GS…)는 ALIAS_EXACT 오탐 위험이 커 후보에서 제외한다. */
function isExcludedShortEnglishAbbrev(alias: string): boolean {
  return /^[A-Za-z]{1,2}$/.test(alias);
}

function buildAlias(alias: string, aliasType: AliasKind): GeneratedAlias | null {
  const trimmed = alias.trim();
  if (!trimmed) return null;
  if (isExcludedShortEnglishAbbrev(trimmed)) return null;
  const aliasNorm = normalizeName(trimmed);
  if (!aliasNorm) return null;
  return {
    alias: trimmed,
    aliasNorm,
    aliasJamo: toJamo(aliasNorm),
    aliasType,
    isAmbiguous: isAmbiguousAlias(aliasNorm),
  };
}

/**
 * 회사 하나에 대한 별칭 후보 전체를 생성한다.
 * 같은 (aliasType, aliasNorm) 조합은 한 번만 나온다 (schema.sql의
 * `UNIQUE(company_id, alias_norm, alias_type)`와 맞춤).
 */
export function generateAliasCandidates(input: CompanyAliasInput): GeneratedAlias[] {
  const out: GeneratedAlias[] = [];
  const seen = new Set<string>();

  const push = (alias: string | undefined, type: AliasKind): void => {
    if (!alias) return;
    const generated = buildAlias(alias, type);
    if (!generated) return;
    const key = `${generated.aliasType}:${generated.aliasNorm}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(generated);
  };

  push(input.name, 'OFFICIAL');
  push(input.ticker, 'TICKER');
  push(input.englishName, 'ENGLISH');
  for (const former of input.formerNames ?? []) push(former, 'FORMER');
  for (const brand of input.brandNames ?? []) push(brand, 'BRAND');

  if (input.isHolding) {
    for (const suffix of HOLDING_SUFFIXES) {
      if (input.name.endsWith(suffix) && input.name.length > suffix.length) {
        push(input.name.slice(0, -suffix.length), 'SHORT');
        break;
      }
    }
  }

  return out;
}
