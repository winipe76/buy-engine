# Buy Engine Dashboard Revision History

이 문서는 Buy Engine Dashboard의 공식 변경 이력입니다.

## 기록 원칙

- 대시보드의 화면, 계산식, 데이터 수집, API, DB 구조 또는 운영 설정이 변경될 때마다 이 문서에 항목을 추가합니다.
- 각 항목에는 변경일, 변경 목적, 실제 변경 내용, 데이터·판단 결과에 미치는 영향, 검증 내용을 기록합니다.
- 기존 기록은 삭제하거나 덮어쓰지 않습니다. 최신 변경을 문서 상단에 추가합니다.
- 계산식 변경 시 `source_version`을 함께 올려 과거 Snapshot과 구분합니다.

---

## 2026-09-08 — 국내 ETF 현재가 표시 및 후보 제거

- 클라우드에서 Yahoo Finance 가격 이력을 받지 못해 ETF 현재가와 Valuation이 비어 있던 원인을 수정했습니다.
- 국내 ETF 검색과 동일하게 접근 가능한 Naver Finance의 520거래일 종가를 사용해 현재가와 역사적 가격 수준을 계산합니다.
- 기존 후보에도 새 소스로 다시 계산할 수 있는 `값 갱신` 버튼을 추가했습니다.
- 퇴직연금 후보 카드에 확인 절차가 있는 `제거` 버튼을 추가했습니다. 개별주식 후보와 DB에는 영향을 주지 않습니다.
- Naver 가격 이력 파서 테스트를 추가했습니다.

---

## 2026-09-08 — 클라우드 ETF 검색 502 수정

- 클라우드 Worker에서 KRX 검색 서버가 요청을 차단해 모든 ETF 검색이 502가 되던 문제를 확인했습니다.
- KRX 검색을 우선 사용하고, 차단될 경우 국내 상장 ETF 전체 목록을 제공하는 보조 소스로 자동 전환합니다.
- 보조 목록도 종목코드 및 공백으로 구분한 ETF명 키워드 검색을 동일하게 지원합니다.

---

## 2026-09-08 — ETF 종목코드·자동 연관 검색 보완

- KRX 검색기가 ETF명만 검색하는 제약을 보완해 6자리 숫자·영문 혼합 종목코드로도 검색하고 추가할 수 있게 했습니다.
- ETF명이나 키워드를 두 글자 이상 입력하고 0.35초 멈추면 연관 ETF를 자동으로 표시합니다.
- `KODEX 반도체`, `TIGER 반도체`처럼 운용사와 테마를 함께 입력하는 검색은 관련 ETF 목록을 유지합니다.
- `396500` 코드 검색 회귀 테스트를 추가했습니다.

---

## 2026-09-08 — 퇴직연금 ETF 검색·Valuation 모듈 추가

### 변경 목적

개별주식 Buy Engine과 분리된 퇴직연금 영역에서 국내 상장 ETF를 검색하고, 매수 신호 없이 현재 가격 수준만 확인할 수 있게 했습니다.

### 변경 내용

- 상단에 `개별주식`과 `퇴직연금` 메뉴를 추가했습니다.
- KRX 상장 ETF를 ETF명 또는 종목코드로 검색하고 별도 Pension 후보 DB에 저장하도록 구성했습니다.
- ETF명으로 금·나스닥·S&P 500·배당·채권·기타 Valuation Profile을 분류합니다.
- Yahoo Finance의 2년 종가 이력으로 중앙값 대비 가격, 가격 백분위, 1년 고점 대비 값을 계산합니다.
- 배당형 ETF에는 최근 12개월 분배금 수익률을 함께 표시합니다.
- 금의 실질금리·달러 및 지수 Forward P/E는 신뢰 가능한 데이터 소스가 아직 연결되지 않아 산출하지 않고, 화면에 미연결 상태를 명시합니다.
- 기존 FMP·Value·Overheat·ΔOverheat·DCA 및 개별주식 후보 테이블은 변경하지 않았습니다.

### 검증

- ETF Profile 분류와 역사적 Valuation 계산 테스트를 추가했습니다.
- 전체 빌드와 기존 Buy Engine 회귀 테스트를 통과했습니다.

---

## 2026-08-18 — 확정 종가·MA Extension·QQQ 비교 기준 정비

### 변경 목적

장중 미완성 일봉 때문에 외부 차트와 지표가 달라지는 문제를 방지하고, 화면에 표시되는 Overheat 근거와 실제 점수 계산식을 일치시켰습니다.

### 변경 내용

- 뉴욕시간 16:15 이후에만 당일 일봉을 확정 종가로 사용합니다. 그 전에는 직전 완료 거래일까지 계산합니다.
- 장중 저장된 QQQ 캐시를 장 마감 후 재사용하지 않도록 검증을 추가했습니다.
- SMA, RSI 및 종목 수익률은 종목 자체 일봉으로 계산하고, QQQ는 초과수익 계산 구간에서만 공통 날짜로 정렬합니다.
- MA 계열은 하나의 `MA Extension Score`로 통합했습니다.
  - MA20 Distance: MA Extension의 40%, Overheat 총점의 16%
  - MA50 Distance: MA Extension의 40%, Overheat 총점의 16%
  - MA200 Distance: MA Extension의 20%, Overheat 총점의 8%
- RSI14, 3M Momentum, QQQ Excess Return은 각각 Overheat 총점의 20%를 유지합니다.
- 상세 화면을 실제 계산 구성요소와 가중치가 그대로 보이도록 변경했습니다.
- 계산 데이터 버전을 `buy-engine-v1.3-confirmed-close-ma-extension`으로 변경했습니다.

### 영향 범위

- MA20·MA50·MA200 Distance 및 MA Extension Score
- RSI14, 1M·3M·6M 수익률의 입력 시계열
- QQQ Excess Return
- Overheat Score, ΔOverheat, Overheat 상태 및 DCA 판단

### 이력 처리

- 과거 Snapshot은 기존 버전과 점수를 그대로 보존합니다.
- 새 계산식은 다음 지표 업데이트부터 새 Snapshot으로 저장됩니다.

---

## 2026-08-18 — RSI14를 Wilder 방식으로 교정

### 변경 목적

외부 차트에서 사용하는 일반적인 RSI14와 Buy Engine의 RSI14 값이 크게 다른 문제를 수정했습니다.

### 변경 내용

- 최근 14개 등락폭의 단순평균 방식에서 Wilder RMA 재귀 평활 방식으로 변경했습니다.
- TypeScript 운영 엔진과 Python 검증 엔진에 동일한 공식을 적용했습니다.
- 화면 표기를 `RSI14 (Wilder)`로 변경하고 Daily Close 기준일을 표시합니다.
- 계산 데이터 버전을 `buy-engine-v1.2-wilder-rsi`로 변경했습니다.
- 기존 분석 Snapshot은 보존하며, 새로 갱신한 Snapshot부터 교정된 RSI가 적용됩니다.

### 영향 범위

- RSI14
- Overheat Score의 RSI 구성요소
- Overheat 상태 및 Value × Overheat DCA 판단

### 검증

- Wilder RSI 기준 수열 테스트를 추가했습니다.
- NVDA FMP 일봉(2026-08-18 종가 기준) 재계산에서 Wilder RSI14 `57.93`, Overheat Score `13.29`를 확인했습니다.

---

## 2026-08-17 — 후보 제거 동기화 보안 보강

- Fundamental Flow와 Buy Engine 사이의 후보 제거 동기화 경로를 보강했습니다.
- 후보 삭제 대신 비활성화 원칙과 기존 분석 이력 보존을 유지했습니다.
- 동기화 요청 검증 테스트를 추가했습니다.

---

## 2026-08-12 — 실시간 Buy Engine 지표 계산 연결

- 활성 후보에 대해 FMP Starter 데이터로 Price, Value, Overheat, ΔOverheat, DCA 및 Action을 계산하도록 연결했습니다.
- 후보 추가 직후 자동 계산과 상단 `지표 업데이트` 기능을 추가했습니다.
- FMP 원자료 및 분석 Snapshot 이력을 Buy Engine DB에 저장하도록 구성했습니다.
- Fundamental은 재계산하지 않고 Reference 정보로만 유지했습니다.

## 2026-08-12 — Fundamental Flow 후보 연동

- Fundamental Flow의 `Add to Buy Engine` 기능과 암호화된 후보 Snapshot 전달 경로를 추가했습니다.
- 후보 재등록 시 새 레코드를 생성하지 않고 기존 후보를 재활성화하도록 구성했습니다.
- Active 및 Inactive Candidates 관리 기능을 추가했습니다.

