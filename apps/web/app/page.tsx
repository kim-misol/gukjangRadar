export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">국장레이더</h1>
      <p className="text-sm text-gray-500">
        뉴스와 종목 사이의 숨은 연결고리를 발견하는 서비스. 화면은 W6부터 만든다 (docs/15).
      </p>
      <p className="text-xs text-gray-400">
        국장레이더는 뉴스와 종목의 연결을 보여주는 정보 서비스이며 투자 추천·자문이 아닙니다. 투자
        판단과 그 결과는 이용자 본인에게 귀속됩니다.
      </p>
    </main>
  );
}
