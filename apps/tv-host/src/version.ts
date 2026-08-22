// Release stamp shown at the bottom of the launch screen: yy.WW.pp (two-digit
// year, ISO week, patch within that week).
//
// Bumped by `yarn release tv` — don't edit by hand. Each app keeps its own
// stamp so the number only moves when that app actually got a new bundle.
//
// It deliberately lives in JS source rather than in app.config.ts: the app uses
// the `fingerprint` runtime version policy, and the Expo config `version` field
// feeds that fingerprint, so bumping it there would break OTA compatibility
// with installed builds. Here the stamp ships inside the JS bundle, which is
// exactly what an EAS update replaces — so a changed number on screen means the
// update landed.
export const APP_VERSION = '26.34.2';
