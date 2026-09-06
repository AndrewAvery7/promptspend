# iPhone and iPad QA — iOS build 17

Status: historical private-QA baseline with a reported header defect; not a
public-release approval.

## Candidate and evidence

- App: PromptSpend 0.1.0 (17).
- EAS build: `2ce3cb87-aa5f-4fde-b58b-ed47348cefbe`.
- Source: `5a935049e4843b9907eaba9ff4a721fe4398107a`.
- Created: August 26, 2026 at 21:15 UTC; EAS FINISHED at 21:21 UTC.
- Profile: production / store-signed, for private internal TestFlight QA.
- [Authenticated EAS record](https://expo.dev/accounts/crestwood-holdings/projects/promptspend-app/builds/2ce3cb87-aa5f-4fde-b58b-ed47348cefbe).
- Read-only EAS identity/status refreshed August 31. The IPA was not downloaded
  again during that review; no new checksum or archive verification is claimed.
- TestFlight VALID / IN_BETA_TESTING was recorded August 26, not reverified in
  App Store Connect on August 31.

Build 16 (`9af64841-3668-4a63-bb14-996896f347fc`) failed native compilation at
`e4ee1a9` with `no member named 'executeSync' in 'worklets::WorkletRuntime'`.
The compatible Reanimated/Worklets pin in `5a93504` preceded this successful
build. Build 16 did not produce an installable candidate.

## Observed QA result

The August 26 iPhone report at approximately 17:19 showed Search, Guide, and
Color buttons stretched vertically on every non-Home tab, with the following
ticker encroaching on the button row. The user reported Home as unaffected.
The compact AppChrome action row's flexible growth inside the Guide wrapper
was identified as the source cause.

- Overall: reported presentation failure; full device matrix not signed off.
- Header correction: implemented later in source; **not in build 17**.
- Header correction's physical iPhone/iPad result: **not run on a replacement
  binary**.
- iPhone model/OS, Display Zoom, text size, and iPad retest details: not recorded
  in this report. Do not infer them from screenshot dimensions.
- Other unchecked journeys: not assessed, not implicitly passed.

## Replacement-candidate checks

Record the new exact build before testing; do not enter results here as though
build 17 changed. Use `docs/MOBILE_NATIVE_QA_SCOPE.md` and the full
`docs/MOBILE_BETA_QA.md` protocol.

- [ ] Cold launch opens Home (not only reopening an existing session).
- [ ] Search/Guide/Color remain bounded and tappable on every tab.
- [ ] Controls and ticker do not overlap at normal and largest text size.
- [ ] All six Guide steps show complete target content.
- [ ] Tab order is Home, Estimate, Compare, Data & Alerts, Learn.
- [ ] FAQ search, contextual help, and offline lessons work.
- [ ] Numeric edit then immediate action uses the latest accepted values.
- [ ] Save failures, hydration, and recovered-data states are truthful.
- [ ] Expired pricing is withheld, including from sharing/export actions.
- [ ] Repeat portrait/landscape and accessibility checks on both iPhone/iPad.

No App Review, external TestFlight review, or public release is authorized by
this evidence record.
