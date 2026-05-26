# Changelog 2.4.0

## Uudet ominaisuudet

- **Extreme-moodi** — quote-ping-pong EUR-rajoilla, volatiliteetti/trendi, idle-pakko (`Extreme.ts`, `axis-grid-extreme.json`)
- **Adaptiivinen algorithmic** — ATR-skaalaus TP/profit-min:eihin, trendi-agreement, äänestyskonflikti → HOLD, idle-ease (`algorithmicAdaptive.ts`)
- **Complementary-indikaattoripreset** — MACD, RSI, ADX, BB, CMF oletuksena (`algorithmicIndicators.ts`)
- **Indikaattoripainojen snapshot** — boostit eivät jää seuraaville timeframeille (`indicatorVoteWeights.ts`)

## Korjaukset

- **EMA** — risteymäsignaali ei enää ylikirjoitu HOLD:lla
- **ADX** — ei BOTH-ääntä molempiin suuntiin; suunta +DI/−DI
- **CMF** — SMA toimii lyhyellä historialla
- **MACD / Bollinger** — guardit puuttuvaa dataa vastaan; BB lower band -indeksi
- **Trend EMA** — käyttää `trend.ema`, ei pakota trade-EMA:ta
- **Profit / TP** — trailing, forceAfter, sim-live -pariteetti (useita committeja)
- **Sim** — PnL, fees, profit-gating, grid cache

## Poistot / muutokset

- **hilow_fixed** poistettu live/sim/UI-moodeista (apufunktiot säilyvät `HiLowFixed.ts`)

## Testit

- `*.test.ts` — adaptive, indicators, EMA, ADX, CMF, Bollinger, MACD, Extreme, tradeGates, sim

## Versio

- `package.json`: **2.4.0**
