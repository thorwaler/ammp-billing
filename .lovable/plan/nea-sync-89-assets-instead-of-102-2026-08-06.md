# NEA sync: 89 assets instead of 102

## What the data shows

The last sync (today 08:21) resolved 89 assets: 86 standard + 3 eConf. The sync audit records **13 "placeholders"** that were dropped, which exactly accounts for the gap (102 - 13 = 89).

The 13 dropped assets are real sites, e.g.:

```text
AMERICAN SCHOOL OF ANTANANARIVO      WELIGHT AMPAMPAMENA
Jovena Tiana Morondava               WELIGHT ANKIJABE
SCRIMAD                              WELIGHT ANOSIBE IFANJA
STAR AMBATOLAMPY (TGBT 1)            WELIGHT ANTANETIBE
RELAIS DE LA REINE (NEW UNIT)        WELIGHT MADIROVALO
WELIGHT AMBODOBONARA                 WELIGHT MANERINERINA
                                     WELIGHT TSARAMANDROSO
```

## Cause

The placeholder heuristic added for the unassigned-org audit is also applied in the Enterprise eConf billing branch. It drops any asset where the org asset listing returns no PV power **and** no long name, country, latitude or tags. Sites that are genuinely configured but have no declared PV capacity (battery/mini-grid units, newly onboarded units) match that rule and silently disappear from billing.

## Fix

1. Stop dropping assets from the Enterprise eConf billing portfolio. Every asset returned for the contract org is billed (minus the NOT group), so NEA resolves 102.
2. Keep a safety net that is explicit rather than silent: assets that look like never-configured stubs are still counted and listed, but as a **"Zero-capacity sites"** note in the Org resolution panel, not removed from the portfolio. The existing zero-PV alert and 30-day revision flow then handles them as designed.
3. Keep the placeholder filter where it belongs — the flag-less sub-org coverage audit for Elum contracts — so that audit is unchanged.
4. Record the names of any zero-capacity assets in the sync result so the panel can show which sites they are instead of only a count.

## Technical details

- `supabase/functions/ammp-sync-contract/index.ts`, `enterprise_econf` branch (~lines 881-914): remove the `continue` on the stub check; instead collect `{assetId, assetName}` into a `zeroCapacityAssets` list and still push the asset into `assetsToProcess` / `assetOrgMap`. Replace `placeholders` in `orgResolutionLog` with `zeroCapacity` count + names.
- Leave the identical check in the flag-less org audit (~lines 774-780) untouched.
- `src/pages/ContractDetails.tsx` Org resolution panel: rename the "ignored placeholders" line to "zero-capacity sites (still billed)" and list the names.
- No database migration; after deploy, re-sync the NEA contract to get 102 assets.
