import type { MemeRankItem } from '@gukjang/spec';
import Link from 'next/link';
import { ScoreGauge } from '../ui/score-gauge';
import { ShareButton } from './share-button';

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * docs/05-screen-specs.md S1 블록1 — 오늘의 억지 관련주 TOP3. R4: 연결 강도/밈력 게이지 분리.
 * docs/05 S5(발견 화면)에서 "이번 주 명예의 전당"에도 title/showShare만 바꿔 재사용한다.
 * `showShare`가 켜지면 공유 버튼은 `<Link>` 밖(형제 요소)에 둔다 — 앵커 중첩 금지.
 */
export function MemeRankBlock({
  items,
  title = '😂 오늘의 억지 관련주',
  showShare = false,
}: {
  items: MemeRankItem[];
  title?: string;
  showShare?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <section className="border border-rule-strong p-4">
      <h2 className="mb-3 font-serif text-lg font-bold text-ink">{title}</h2>
      <ol className="space-y-3">
        {items.map((item) => (
          <li key={item.connection.id}>
            <Link href={`/news/${item.connection.clusterId}`} className="block">
              <p className="font-serif text-[15px] font-bold text-ink">
                {MEDALS[item.rank - 1] ?? `${item.rank}.`} {item.arrowLabel}
              </p>
              <p className="mt-0.5 font-sans text-xs text-ink-soft">{item.comment}</p>
              <div className="mt-1.5 space-y-1">
                <ScoreGauge
                  label="연결 강도"
                  value={item.connection.scores.connection}
                  tone="blue"
                />
                <ScoreGauge label="밈력" value={item.connection.scores.meme} tone="orange" />
              </div>
            </Link>
            {showShare && (
              <div className="mt-1">
                <ShareButton
                  connectionId={item.connection.id}
                  shareImageUrl={item.shareImageUrl}
                  deepLink={`/news/${item.connection.clusterId}`}
                />
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
