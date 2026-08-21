/**
 * manual-verify-*.ts 스크립트가 공유하는 뉴스 클러스터+개체 fixture 생성 헬퍼.
 * manual-verify-connections.ts(W5)에서 처음 만들어졌다가 manual-verify-counter-check.ts(B6)도
 * 같은 시나리오("AI 가속기")를 재사용하게 되면서 공유 위치로 옮겼다.
 */
import { getDb, schema } from '@gukjang/db';
import { ensureGraphNode } from '../../apps/worker/src/graph/ensure-node';

export async function setupClusterWithEntity(
  db: ReturnType<typeof getDb>,
  now: Date,
  opts: {
    urlSuffix: string;
    headline: string;
    entityName: string;
    entityKind: 'WORD' | 'PRODUCT';
    subtype?: string;
  },
): Promise<{ clusterId: number; entityId: number; entityNodeId: number }> {
  const [source] = await db
    .insert(schema.newsSource)
    .values({ name: 'fixture:연결엔진', domain: 'fixture.local', tier: 1, kind: 'RSS' })
    .onConflictDoUpdate({ target: schema.newsSource.name, set: { tier: 1 } })
    .returning({ id: schema.newsSource.id });
  if (!source) throw new Error('news_source 생성 실패');

  const url = `https://fixture.local/connections/${opts.urlSuffix}`;
  const [article] = await db
    .insert(schema.newsArticle)
    .values({ sourceId: source.id, url, title: opts.headline, publishedAt: now, simhash: 0 })
    .onConflictDoUpdate({ target: schema.newsArticle.url, set: { title: opts.headline } })
    .returning({ id: schema.newsArticle.id });
  if (!article) throw new Error('news_article 생성 실패');

  const [cluster] = await db
    .insert(schema.newsCluster)
    .values({
      headline: opts.headline,
      aiSummary: `${opts.headline}. 관련 내용이 이어졌다. 시장의 관심이 모였다.`,
      tradeDate: '2026-08-21',
      firstSeenAt: now,
      lastSeenAt: now,
      articleCount: 1,
      representativeArticleId: article.id,
      analysisStatus: 'DONE',
    })
    .returning({ id: schema.newsCluster.id });
  if (!cluster) throw new Error('news_cluster 생성 실패');

  await db
    .insert(schema.clusterArticle)
    .values({ clusterId: cluster.id, articleId: article.id })
    .onConflictDoNothing();

  const nameNorm = opts.entityName.replace(/\s+/g, '');
  const [entity] = await db
    .insert(schema.entity)
    .values({
      name: opts.entityName,
      nameNorm,
      nameJamo: nameNorm,
      kind: opts.entityKind,
      subtype: opts.subtype,
      mentionTotal: 1,
    })
    .onConflictDoUpdate({
      target: [schema.entity.nameNorm, schema.entity.kind],
      set: { mentionTotal: 1 },
    })
    .returning({ id: schema.entity.id });
  if (!entity) throw new Error('entity 생성 실패');

  const entityNodeId = await ensureGraphNode(db, 'ENTITY', entity.id, opts.entityName);

  await db
    .insert(schema.newsEntity)
    .values({
      clusterId: cluster.id,
      entityId: entity.id,
      importance: '1',
      inHeadline: true,
      role: 'SUBJECT',
      mentionCount: 1,
    })
    .onConflictDoUpdate({
      target: [schema.newsEntity.clusterId, schema.newsEntity.entityId],
      set: { importance: '1' },
    });

  return { clusterId: cluster.id, entityId: entity.id, entityNodeId };
}
