# Hoobot 2.4.0 — lähdekoodipaketti (handoff)

Tämä kansio on **valmis lähdekoodipaketti** ilman API-avaimia, Discord-tokeneita tai henkilökohtaisia asetuksia.
Voit kopioida sen alkuperäiseen Hoobot-repositorioon ja tehdä branchin + mergen itse.

## Mitä paketissa on

| Polku | Sisältö |
|-------|---------|
| `src/` | Koko sovellus (Frontend, moodit, indikaattorit, simulaatio, Discord) |
| `scripts/` | Apuskriptit (Binance timeout, sim-kopiot, preset) |
| `settings/*.example` | Esimerkkikonfiguraatiot ja axis-grid-extreme |
| `package.json` | Versio **2.4.0**, riippuvuudet, npm-skriptit |
| `webpack.config.js`, `tsconfig.json`, `jest.config.cjs` | Build ja testit |
| `CHANGELOG-2.4.0.md` | Muutoslista |
| `PACKAGE-CONTENTS.txt` | Tiedostoluettelo (generoitu synkissä) |

**Ei mukana:** `node_modules`, `build/`, logit, simulaatiotulokset, omat `hoobot-options.json`-avaimet.

## Pika-asennus (testaa paketti erikseen)

```bash
cd hoobot
npm install
cp settings/hoobot-options.json.example settings/hoobot-options.json
# täytä API-avaimet settings/hoobot-options.json
npm run build
npm run start:nopm2
```

Web UI: http://localhost:5656

## Merge alkuperäiseen repoon (suositus)

```bash
# 1) Alkuperäinen repo
cd /path/to/original-hoobot
git checkout -b feature/contrib-2-4-0

# 2) Kopioi tämän paketin sisältö repojuureen (älä kopioi .git tätä kansiota varten)
# Windows PowerShell esimerkki:
#   Copy-Item -Path "E:\path\to\hoobot\*" -Destination "." -Recurse -Force

# 3) Tarkista diff, ratkaise konfliktit
git status
git diff

# 4) Commit + merge
git add -A
git commit -m "Merge community 2.4.0: extreme, adaptive algorithmic, indicator fixes"
# git merge feature/contrib-... main  (tai PR GitHubissa)
```

## Tärkeimmät uudet / muuttuneet alueet

- **Extreme-moodi** — `src/Hoobot/Modes/Extreme.ts`, UI, sim-grid
- **Adaptiivinen algorithmic** — `algorithmicAdaptive.ts`, UI-lohko
- **Complementary-indikaattoripreset** — `algorithmicIndicators.ts`
- **Indikaattorikorjaukset** — EMA, ADX, CMF, MACD, Bollinger, `indicatorVoteWeights.ts`
- **Sim / TP / order** — useita korjauksia (katso CHANGELOG)

## Huomio

- `hilow_fixed` (EUR) on poistettu moodilistasta; `HiLowFixed.ts` säilyy quote-apufunktioina Extreme-moodille.
- `settings/hoobot-options.json` tässä paketissa on vain tyhjä pohja — älä commitoi oikeita avaimia.

## Yhteystiedot

Paketti tuotettu yksityisestä Hoobot15-kehitysympäristöstä. Kysymykset merge-konflikteista: vertaa `CHANGELOG-2.4.0.md` ja `git diff` uusiin tiedostoihin.
