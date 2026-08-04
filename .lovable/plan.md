# Xero themes + tax codes: fix loading and add dropdowns

## What's wrong

The branding-theme list fails with a Xero 401 (`AuthorizationUnsuccessful`). The current Xero connection was authorised without the `accounting.settings.read` permission, which is required to read invoice settings (branding themes and tax rates). The scope was added to the connect flow, but the existing saved token still carries the old permissions — it only takes effect after reconnecting Xero.

Tax code is still a free-text field because there is no endpoint yet that lists the organisation's tax rates.

## What to build

1. **Reconnect prompt where it matters**
   - In the customer form, when theme loading fails with 401, show a clear inline message plus a "Reconnect Xero" button that runs the normal Xero connect flow (same one used on the integrations page), instead of the current generic error.
   - Keep the manual theme ID input as a fallback for anything else.

2. **Tax code dropdown**
   - New backend function that lists the organisation's active sales tax rates from Xero (name, code, effective rate).
   - Customer form replaces the free-text tax code with a dropdown showing e.g. "VAT on Income (OUTPUT) — 7.5%", with a "Contact default" empty option and the same manual-entry fallback when the list can't load.

3. **Shared loading**
   - Both themes and tax rates are fetched through one small cached hook so opening several customer cards doesn't refetch.

## Technical notes

- New edge function `xero-list-tax-rates` calling `GET /api.xro/2.0/TaxRates`, filtered to `Status = ACTIVE` and sales-capable rates (`CanApplyToRevenue`), mirroring the structure of `xero-list-branding-themes` including the 401 message.
- Generalise `src/hooks/useXeroBrandingThemes.ts` into a shared fetch helper reused by a new `useXeroTaxRates` hook; both expose `needsReconnect` when the backend returns 401.
- Reconnect button reuses the existing connect handler from `src/components/integrations/XeroIntegration.tsx` (extracted into a small helper so both places call `xero-oauth-init`).
- No database changes; `customers.xero_tax_type` and `xero_branding_theme_id` keep storing the same values.

## After this ships

You will still need to click "Reconnect Xero" once so the connection picks up the settings-read permission. Until then both fields fall back to manual entry and keep working.
