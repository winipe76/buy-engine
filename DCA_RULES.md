# Buy Engine DCA Rules

기준 버전: `buy-engine-v1.7-negative-growth-value`

적용일: 2026-09-26 (다음 지표 업데이트부터)

## 기본 원칙

- DCA는 Value Score와 Overheat Score만으로 결정한다.
- Fundamental Stage, Fundamental Score 및 Fundamental Trend는 DCA 계산에 사용하지 않는다.
- Fundamental 정보는 종목 선정과 화면 참고 정보로만 유지한다.
- `0× PAUSE`는 매도가 아니라 신규 매수 중단이다.
- SELL 판단은 제공하지 않는다.

## 점수 구간

| Value Score | Value State |
|---:|---|
| 70 이상 | VERY_UNDERVALUED |
| 60 이상 70 미만 | UNDERVALUED |
| 40 이상 60 미만 | FAIR |
| 20 이상 40 미만 | OVERVALUED |
| 20 미만 | EXTREME_OVERVALUED |

| Overheat Score | Overheat State |
|---:|---|
| 25 미만 | LOW |
| 25 이상 50 미만 | NORMAL |
| 50 이상 75 미만 | HIGH |
| 75 이상 | EXTREME |

## DCA Matrix

| Value \ Overheat | LOW<br>`< 25` | NORMAL<br>`25–49.99` | HIGH<br>`50–74.99` | EXTREME<br>`≥ 75` |
|---|---:|---:|---:|---:|
| VERY_UNDERVALUED `≥ 70` | **1.5×** | 1.0× | 0.5× | **0× PAUSE** |
| UNDERVALUED `60–69.99` | 1.0× | 1.0× | 0.5× | **0× PAUSE** |
| FAIR `40–59.99` | 1.0× | 1.0× | 0.5× | **0× PAUSE** |
| OVERVALUED `20–39.99` | 0.5× | 0.5× | **0× PAUSE** | **0× PAUSE** |
| EXTREME_OVERVALUED `< 20` | **0× PAUSE** | **0× PAUSE** | **0× PAUSE** | **0× PAUSE** |

## 핵심 경계

- `1.5×`: Value ≥ 70 그리고 Overheat < 25
- `PAUSE`: Overheat ≥ 75 또는 Value < 20
- `PAUSE`: Value < 40이면서 Overheat ≥ 50
- Value 데이터가 부족하면 배수를 정하지 않고 `REVIEW`로 표시한다.

## 변경 관리

- 계산식이나 경계값을 바꾸면 `source_version`을 변경한다.
- 변경 내용은 `DASHBOARD_REVISIONS.md`에 날짜와 함께 누적 기록한다.
- 기존 Snapshot은 당시 `source_version`을 유지하며, 새 기준은 다음 지표 업데이트부터 적용한다.

## Value 데이터 정책 (v1.7)

- DCA Matrix와 Fundamental 제외 원칙은 v1.6 그대로 유지한다.
- 유효한 음의 EPS/매출 성장률은 대응 PEG/EV-Sales-Growth component에 0점으로 포함한다. 기존 동일 가중치 평균을 유지한다.
- 필수 입력 누락·비유한 값·growth 0은 missing으로 제외한다. 원본 성장률은 비율 단위로 보존한다.
- 기존 정상 3개 이상 component 조합 또는 유효한 Forward P/E와 FCF Yield 조합이면 산출한다. penalty는 충분성 개수에 사용하지 않는다.
- 나머지는 null/REVIEW이며 화면에 N/A로 표시한다. 실제 0점은 0.0이다. 과거 Snapshot은 재작성하지 않는다.
