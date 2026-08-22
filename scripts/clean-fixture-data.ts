/**
 * 개발 DB 유지보수 스크립트 — `manual-verify-*.ts`가 실 로컬 postgres에 남긴 테스트 픽스처를
 * 정리한다(2026-08-22, 실 사용자 신고: "오늘의 억지 관련주"가 반복 축적된 "노루" fixture
 * 데이터로 도배됨). `news_source.domain ILIKE '%fixture%'`(manual-verify 스크립트들이
 * `fixture.local`로 통일해 만든 뉴스원)에서 파생된 news_cluster/connection/entity/llm_run/
 * guardrail_violation만 지운다 — `company`/`company_alias`/`concept`(packages/db/src/seed.ts
 * 정식 시드 데이터)는 절대 건드리지 않는다.
 *
 * 삭제 순서(FK 제약 준수): guardrail_violation(cluster_id 직접 매치) → llm_run
 * (input_ref->>'clusterId' 매치) → news_cluster(CASCADE로 cluster_article/news_entity/
 * connection[→connection_review/connection_feedback/bookmark]/alert_delivery까지 정리) →
 * graph_node(ENTITY/NEWS, CASCADE로 graph_edge 정리) → entity(더 이상 어떤 news_entity도
 * 참조하지 않는 것만) → news_article → news_source.
 *
 * 안전장치: entity 삭제 전 (1) 실(비fixture) 클러스터에서도 쓰이는 entity는 제외, (2) 다른
 * entity가 canonical_id로 삭제 대상을 가리키는 경우 없는지 확인 — 하나라도 걸리면 그 배치는
 * 스킵하고 경고만 남긴다(잘못 지우는 것보다 남기는 게 안전하다는 원칙).
 *
 * 오브 스윕(orphan sweep): `manual-verify-feedback-promotion.ts`/`manual-verify-review-recalc.ts`
 * 처럼 실 dev DB를 계속 쓰는 HTTP 기반 스크립트(NODE_ENV=test로 못 옮김 — 실행 중인 dev
 * 서버 자체가 DATABASE_URL을 보므로)는 news_cluster/connection은 스스로 지우지만
 * `setupClusterWithEntity`가 만든 news_article/news_source까지는 안 지운다 — 클러스터가
 * 없는 고아 기사가 남는다. 클러스터 기반 정리와 별개로, "어떤 cluster_article도 참조하지
 * 않는 fixture 기사"를 항상 마지막에 한 번 더 쓸어 담는다.
 *
 * 실행: pnpm clean-fixture-data          (실제 삭제)
 *       pnpm clean-fixture-data --dry-run (삭제 없이 대상 개수만 출력)
 */
import { closeDb, getDb, schema } from '@gukjang/db';
import { and, ilike, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';

async function sweepOrphanFixtureArticles(
  db: ReturnType<typeof getDb>,
  dryRun: boolean,
): Promise<void> {
  const referencedArticleIds = await db
    .select({ id: schema.clusterArticle.articleId })
    .from(schema.clusterArticle);
  const referencedSet = referencedArticleIds.map((r) => r.id);

  const orphanArticles = await db
    .select({ id: schema.newsArticle.id, sourceId: schema.newsArticle.sourceId })
    .from(schema.newsArticle)
    .innerJoin(schema.newsSource, sql`${schema.newsSource.id} = ${schema.newsArticle.sourceId}`)
    .where(
      and(
        ilike(schema.newsSource.domain, '%fixture%'),
        referencedSet.length > 0 ? notInArray(schema.newsArticle.id, referencedSet) : undefined,
      ),
    );
  console.log(`[오브 스윕] 클러스터 없는 고아 fixture 기사: ${orphanArticles.length}건`);
  if (orphanArticles.length === 0 || dryRun) return;

  await db.delete(schema.newsArticle).where(
    inArray(
      schema.newsArticle.id,
      orphanArticles.map((a) => a.id),
    ),
  );

  const emptySources = await db
    .select({ id: schema.newsSource.id })
    .from(schema.newsSource)
    .where(
      and(
        ilike(schema.newsSource.domain, '%fixture%'),
        sql`NOT EXISTS (SELECT 1 FROM news_article WHERE news_article.source_id = news_source.id)`,
      ),
    );
  if (emptySources.length > 0) {
    await db.delete(schema.newsSource).where(
      inArray(
        schema.newsSource.id,
        emptySources.map((s) => s.id),
      ),
    );
  }
  console.log(
    `✓ 고아 기사/빈 fixture 소스 정리 완료 (기사 ${orphanArticles.length}건, 소스 ${emptySources.length}건)`,
  );
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const db = getDb();

  const fixtureClusterIds = [
    ...new Set(
      (
        await db
          .select({ id: schema.newsCluster.id })
          .from(schema.newsCluster)
          .innerJoin(
            schema.clusterArticle,
            sql`${schema.clusterArticle.clusterId} = ${schema.newsCluster.id}`,
          )
          .innerJoin(
            schema.newsArticle,
            sql`${schema.newsArticle.id} = ${schema.clusterArticle.articleId}`,
          )
          .innerJoin(
            schema.newsSource,
            sql`${schema.newsSource.id} = ${schema.newsArticle.sourceId}`,
          )
          .where(ilike(schema.newsSource.domain, '%fixture%'))
      ).map((r) => r.id),
    ),
  ];
  console.log(`[1] fixture news_cluster 대상: ${fixtureClusterIds.length}건`);
  if (fixtureClusterIds.length === 0) {
    console.log('클러스터 기반 정리 대상 없음 — 오브 스윕만 진행');
    await sweepOrphanFixtureArticles(db, dryRun);
    await closeDb();
    return;
  }

  const entityIdsInFixture = [
    ...new Set(
      (
        await db
          .select({ id: schema.newsEntity.entityId })
          .from(schema.newsEntity)
          .where(inArray(schema.newsEntity.clusterId, fixtureClusterIds))
      ).map((r) => r.id),
    ),
  ];

  const realUsageRows = entityIdsInFixture.length
    ? await db
        .select({ entityId: schema.newsEntity.entityId })
        .from(schema.newsEntity)
        .where(
          and(
            inArray(schema.newsEntity.entityId, entityIdsInFixture),
            notInArray(schema.newsEntity.clusterId, fixtureClusterIds),
          ),
        )
    : [];
  const entitiesUsedElsewhere = new Set(realUsageRows.map((r) => r.entityId));
  const entityIdsSafeToDelete = entityIdsInFixture.filter((id) => !entitiesUsedElsewhere.has(id));

  const dangerousCanonical = entityIdsSafeToDelete.length
    ? await db
        .select({ id: schema.entity.id, canonicalId: schema.entity.canonicalId })
        .from(schema.entity)
        .where(isNotNull(schema.entity.canonicalId))
    : [];
  const canonicalDeleteSet = new Set(entityIdsSafeToDelete);
  const blockedByCanonical = new Set(
    dangerousCanonical
      .filter((r) => canonicalDeleteSet.has(r.canonicalId!) && !canonicalDeleteSet.has(r.id))
      .map((r) => r.canonicalId!),
  );
  const finalEntityIdsToDelete = entityIdsSafeToDelete.filter((id) => !blockedByCanonical.has(id));
  if (blockedByCanonical.size > 0) {
    console.log(
      `  ⚠ canonical_id로 다른 entity가 가리키는 ${blockedByCanonical.size}건은 안전을 위해 삭제 대상에서 제외`,
    );
  }
  console.log(
    `[2] 정리 후 고아가 될 entity: ${finalEntityIdsToDelete.length}건 (fixture에서만 쓰인 ${entityIdsInFixture.length}건 중 실제 뉴스에서도 쓰이는 ${entitiesUsedElsewhere.size}건 제외)`,
  );

  const fixtureSourceIds = [
    ...new Set(
      (
        await db
          .select({ id: schema.newsSource.id })
          .from(schema.newsSource)
          .where(ilike(schema.newsSource.domain, '%fixture%'))
      ).map((r) => r.id),
    ),
  ];
  const fixtureArticleIds = fixtureSourceIds.length
    ? [
        ...new Set(
          (
            await db
              .select({ id: schema.newsArticle.id })
              .from(schema.newsArticle)
              .where(inArray(schema.newsArticle.sourceId, fixtureSourceIds))
          ).map((r) => r.id),
        ),
      ]
    : [];
  console.log(
    `[3] fixture news_source: ${fixtureSourceIds.length}건, news_article: ${fixtureArticleIds.length}건`,
  );

  const gvCount = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.guardrailViolation)
    .where(inArray(schema.guardrailViolation.clusterId, fixtureClusterIds));
  const llmRunIds = (
    await db
      .select({ id: schema.llmRun.id })
      .from(schema.llmRun)
      .where(
        sql`(${schema.llmRun.inputRef} ->> 'clusterId')::bigint = ANY(${sql.raw(`ARRAY[${fixtureClusterIds.join(',')}]`)})`,
      )
  ).map((r) => r.id);
  console.log(`[4] guardrail_violation: ${gvCount[0]!.c}건, llm_run: ${llmRunIds.length}건`);

  if (dryRun) {
    await sweepOrphanFixtureArticles(db, dryRun);
    console.log('\n--dry-run: 실제 삭제는 하지 않았습니다.');
    await closeDb();
    return;
  }

  await db
    .delete(schema.guardrailViolation)
    .where(inArray(schema.guardrailViolation.clusterId, fixtureClusterIds));
  if (llmRunIds.length > 0) {
    await db.delete(schema.llmRun).where(inArray(schema.llmRun.id, llmRunIds));
  }
  const deletedClusters = await db
    .delete(schema.newsCluster)
    .where(inArray(schema.newsCluster.id, fixtureClusterIds))
    .returning({ id: schema.newsCluster.id });
  console.log(
    `✓ news_cluster 삭제(CASCADE로 connection/cluster_article/news_entity 등 포함): ${deletedClusters.length}건`,
  );

  if (finalEntityIdsToDelete.length > 0) {
    await db.delete(schema.graphNode).where(
      sql`(kind = 'ENTITY' AND ref_id = ANY(${sql.raw(`ARRAY[${finalEntityIdsToDelete.join(',')}]`)}))
        OR (kind = 'NEWS' AND ref_id = ANY(${sql.raw(`ARRAY[${fixtureClusterIds.join(',')}]`)}))`,
    );
    const deletedEntities = await db
      .delete(schema.entity)
      .where(inArray(schema.entity.id, finalEntityIdsToDelete))
      .returning({ id: schema.entity.id });
    console.log(`✓ graph_node/entity 삭제: ${deletedEntities.length}건`);
  } else {
    await db
      .delete(schema.graphNode)
      .where(
        sql`kind = 'NEWS' AND ref_id = ANY(${sql.raw(`ARRAY[${fixtureClusterIds.join(',')}]`)})`,
      );
  }

  if (fixtureArticleIds.length > 0) {
    await db.delete(schema.newsArticle).where(inArray(schema.newsArticle.id, fixtureArticleIds));
  }
  if (fixtureSourceIds.length > 0) {
    await db.delete(schema.newsSource).where(inArray(schema.newsSource.id, fixtureSourceIds));
  }
  console.log(`✓ news_article/news_source 삭제 완료`);

  const remaining = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.newsCluster)
    .innerJoin(
      schema.clusterArticle,
      sql`${schema.clusterArticle.clusterId} = ${schema.newsCluster.id}`,
    )
    .innerJoin(
      schema.newsArticle,
      sql`${schema.newsArticle.id} = ${schema.clusterArticle.articleId}`,
    )
    .innerJoin(schema.newsSource, sql`${schema.newsSource.id} = ${schema.newsArticle.sourceId}`)
    .where(ilike(schema.newsSource.domain, '%fixture%'));
  console.log(`\n남은 fixture news_cluster: ${remaining[0]!.c}건(0이어야 함)`);

  await sweepOrphanFixtureArticles(db, dryRun);

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
