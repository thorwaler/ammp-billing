# Havana Club (Elum Annex D) — package fit

## Short answer

No new package is needed. The **Elum ePM** package already matches this contract's structure: per-MWp pricing split by a site-size threshold, scoped to an AMMP asset group, quarterly billing.

Annex D maps onto it as:

| Annex D term | Where it goes |
| --- | --- |
| Sites ≤ 2 MWp → EUR 650 / MWp / year | Below-threshold rate, threshold set to 2,000 kWp |
| Sites > 2 MWp → EUR 300 / MWp / year | Above-threshold rate |
| Econf access included | Nothing to configure — no extra charge |
| Quarterly invoicing | Billing frequency: quarterly |
| Minimum EUR 1,250 per quarter / EUR 5,000 ARR | Minimum annual value 5,000 (same figure, quarter = one quarter of it) |
| Onboarding 2,150 / dashboards 2,000 / KPIs 1,650 | One-off fees, billed once on the first invoice |

## Two gaps to close

Everything above works today except two things:

1. **The contract-wide annual minimum is not applied to Elum ePM.** Today ePM only supports a per-site minimum floor; the invoice total is never lifted to the contract minimum. So a quarter that computes below EUR 1,250 would invoice too low.
2. **One-off setup fees have no toggle on Elum ePM.** The "include one-time fee on this invoice" control exists only for Enterprise eConf and Matriarch.

## What to build

**1. Contract minimum for Elum ePM**
- In the invoice calculation, include `elum_epm` in the package list that lifts the base cost to `minimum annual value x frequency multiplier`.
- Effect for Havana Club: minimum annual value 5,000, quarterly → floor of 1,250 per invoice, shown as a "minimum adjustment" line exactly as it is for other packages.
- The existing per-site minimum floor (minimum charge tiers) stays untouched and stays optional; leave it empty for this contract.

**2. One-off fees on Elum ePM**
- Reuse the existing one-time fee field (`onboarding_setup_fee`) and its invoice toggle: allow it for `elum_epm` in the contract form, the invoice calculator toggle, and the resulting invoice line.
- Havana Club: 5,800 total (2,150 onboarding + 2,000 dashboards + 1,650 KPIs). Entered as a single setup amount, with the three components spelled out in the support document note, or split into three add-on lines if separate lines are preferred on the Xero invoice.

**3. Support document**
- Keep the ePM breakdown (site list with capacity, size bucket, rate, fee) and add the minimum-adjustment row when the floor applies, matching how other packages present it.

## Contract setup after the change

- Package: Elum ePM
- Asset group: the Havana Club AMMP group
- Threshold: 2,000 kWp; below rate 650, above rate 300 (per MWp/year)
- Currency EUR, billing quarterly, minimum annual value 5,000
- One-time setup fee 5,800, included on the first invoice only
- Period start 01.07.2026; first billable quarter = the quarter of first user onboarding

## Technical notes

- `src/lib/invoiceCalculations.ts`: add `elum_epm` to the `minimumAnnualValue` base-cost floor condition (~line 1805). No change to `calculateElumEpmBreakdown`.
- `src/components/contracts/ContractForm.tsx`: persist `onboarding_setup_fee` and `minimum_annual_value` for `elum_epm`; surface the setup-fee input for that package.
- `src/components/dashboard/InvoiceCalculator.tsx`: extend the `enterprise_econf` one-time-fee toggle blocks to also cover `elum_epm`.
- Support document generator: no new logic beyond the minimum-adjustment row already produced by the shared path.
