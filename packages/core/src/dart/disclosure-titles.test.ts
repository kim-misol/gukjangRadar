import { describe, expect, it } from 'vitest';
import { extractDisclosureTitles } from './disclosure-titles';

describe('extractDisclosureTitles', () => {
  it('report_nm만 뽑아 배열로 돌려준다', () => {
    const titles = extractDisclosureTitles({
      status: '000',
      message: '정상',
      list: [
        { report_nm: '분기보고서 (2026.09)' },
        { report_nm: '임원ㆍ주요주주특정증권등소유상황보고서' },
      ],
    });
    expect(titles).toEqual(['분기보고서 (2026.09)', '임원ㆍ주요주주특정증권등소유상황보고서']);
  });

  it('limit을 넘는 건 잘라낸다', () => {
    const titles = extractDisclosureTitles(
      {
        status: '000',
        message: '정상',
        list: [{ report_nm: 'a' }, { report_nm: 'b' }, { report_nm: 'c' }],
      },
      2,
    );
    expect(titles).toEqual(['a', 'b']);
  });

  it('list가 없으면(공시 없음, status=013) 빈 배열', () => {
    expect(extractDisclosureTitles({ status: '013', message: '데이터 없음' })).toEqual([]);
  });
});
