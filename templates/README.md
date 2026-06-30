# templates/

클로드디자인에서 받은 HTML 파일을 여기에 넣으세요.

## 필요한 파일

### index.html — 메인 리스트 페이지
아래 플레이스홀더를 그대로 사용:
- `{{CARDS}}` — 아티클 카드 목록 (자동 생성)
- `{{JSON_LD}}` — Schema.org JSON-LD (자동 생성)
- `{{ARTICLE_COUNT}}` — 전체 아티클 수

### article.html — 아티클 상세 페이지
아래 플레이스홀더를 그대로 사용:
- `{{TITLE}}` — 아티클 제목
- `{{DESCRIPTION}}` — 요약 (160자)
- `{{BODY}}` — 본문 HTML
- `{{DATE}}` — 발행일 (한국어 형식)
- `{{URL}}` — 정규 URL
- `{{SLUG}}` — URL 슬러그
- `{{JSON_LD}}` — Schema.org JSON-LD (자동 생성)

## 템플릿 없을 때
templates/ 폴더가 비어있어도 빌드됩니다.
기본 HTML로 생성되므로 디자인만 없는 상태로 동작 확인 가능.
