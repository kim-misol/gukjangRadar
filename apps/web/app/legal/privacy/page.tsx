import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: '개인정보처리방침 — 국장레이더' };

/**
 * T5.1 초안 — 실제로 수집하는 항목만 적는다(스키마 기준: app_user.email/provider,
 * push_subscription.endpoint/keys, connection_feedback.anon_id, alert_keyword).
 * 변호사 검토 전 임시 문서. 실 서비스 오픈 전 개인정보보호법 기준 정식 검토가 필요하다(T5.6).
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 font-sans text-sm leading-relaxed text-ink">
      <h1 className="mb-2 font-serif text-2xl font-bold">개인정보처리방침</h1>
      <p className="mb-6 border border-rule-strong bg-paper px-3 py-2 font-mono text-[11px] text-ink-soft">
        초안입니다. 정식 서비스 오픈 전 개인정보보호법 기준 변호사 검토를 거쳐야 합니다.
      </p>

      <h2 className="mb-2 mt-6 font-serif text-lg font-bold">1. 수집하는 개인정보 항목</h2>
      <ul className="mb-4 list-disc space-y-1 pl-5">
        <li>
          <strong>소셜 로그인(카카오/구글) 이용 시</strong>: 이메일 주소, 소셜 로그인 식별자
          (provider + provider 고유 ID). 비밀번호는 회사가 직접 수집·저장하지 않습니다(각 소셜
          로그인사가 인증을 담당).
        </li>
        <li>
          <strong>키워드 알림 등록 시</strong>: 등록한 키워드, 알림 조건(연결 강도 하한, 밈 연결
          포함 여부).
        </li>
        <li>
          <strong>웹푸시 구독 시</strong>: 브라우저가 발급하는 푸시 구독 정보(endpoint, 암호화 키) —
          브라우저 표준(Web Push)이 요구하는 최소 정보입니다.
        </li>
        <li>
          <strong>비로그인 이용 시</strong>: 연결 카드 피드백(이해됨/억지/틀림)을 남기면 기기에
          저장된 임의 식별자(anonId, 브라우저 localStorage)만 함께 기록됩니다 — 이름·이메일 등 실명
          식별 정보와 연결되지 않습니다.
        </li>
      </ul>

      <h2 className="mb-2 mt-6 font-serif text-lg font-bold">2. 이용 목적</h2>
      <p className="mb-4">
        회원 식별·로그인 유지, 키워드 알림 발송, 연결 품질 개선(피드백 분석)을 위해서만 이용합니다.
        수집한 정보를 광고나 제3자 마케팅에 이용하지 않습니다.
      </p>

      <h2 className="mb-2 mt-6 font-serif text-lg font-bold">3. 보유 기간</h2>
      <p className="mb-4">
        회원 탈퇴 시 계정 정보와 알림 키워드·구독 정보를 지체 없이 삭제합니다. 관계 법령에 따라 보존
        의무가 있는 정보는 해당 기간 동안만 별도 보관합니다.
      </p>

      <h2 className="mb-2 mt-6 font-serif text-lg font-bold">4. 제3자 제공</h2>
      <p className="mb-4">
        법령에 따른 경우를 제외하고 개인정보를 제3자에게 제공하지 않습니다. 소셜 로그인은
        카카오·구글의 인증 절차를 거치며, 이 과정에서 각 사의 개인정보처리방침이 함께 적용됩니다.
      </p>

      <h2 className="mb-2 mt-6 font-serif text-lg font-bold">5. 이용자의 권리</h2>
      <p className="mb-4">
        이용자는 언제든 알림 키워드 삭제, 웹푸시 구독 해제, 계정 삭제를 요청할 수 있습니다. 계정
        삭제는 &lsquo;알림&rsquo; 화면 우측 상단의 &lsquo;탈퇴&rsquo;에서 직접 처리할 수 있습니다.
      </p>

      <p className="mt-8 flex gap-3 font-mono text-xs text-ink-soft">
        <Link href="/legal/disclaimer" className="underline underline-offset-2">
          고지
        </Link>
        <Link href="/legal/terms" className="underline underline-offset-2">
          이용약관
        </Link>
      </p>
    </main>
  );
}
