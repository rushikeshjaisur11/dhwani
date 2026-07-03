# Vanilla Strip — Remove OpenWhispr Billing/Cloud Remnants

**Date:** 2026-07-03
**Goal:** Dhwani is a local product. Remove every user-visible OpenWhispr billing,
Pro-plan, referral, and cloud-account surface, plus the startup network call to
`auth.openwhispr.com`.

## Root cause

All billing UI gates on `useAuth().isSignedIn` (better-auth session against
`auth.openwhispr.com`) and `useUsage()` (OpenWhispr cloud word-limit metering).
Stubbing `useAuth` to a signed-out constant kills every cloud gate and the
startup session fetch in one place. The rest is deleting the now-dead UI.

## Changes

1. `hooks/useAuth.ts` — stub: always signed-out, loaded, no session. No
   better-auth import.
2. `AppRouter.jsx` — drop `needsReauth` re-auth screen + `AuthenticationStep`
   + `useAuth`.
3. `OnboardingFlow.tsx` — drop the auth ("welcome") step and
   `EmailVerificationStep`; onboarding starts at use-case; remove
   signed-in-only branches (merged setup step, voiceAgent step gating).
4. `SettingsModal.tsx` — remove `account` and `plansBilling` sidebar items;
   default section `general`.
5. `SettingsPage.tsx` — delete `account` + `plansBilling` cases and their
   state/handlers (checkout, billing portal, plan switch, sign-out); remove
   the `openwhispr` cloud option from the transcription mode selector.
6. `settings/InferenceConfigEditor.tsx` — remove the `openwhispr` cloud mode
   option and `startCloudOnboarding`.
7. `ControlPanel.tsx` — remove `UpgradePrompt`, `ReferralModal`, limit-reached
   listener, past-due toast, cloud-migration effect/banner, `useUsage`, and the
   billing props to the sidebar; integrations no longer gated on Pro.
8. `ControlPanelSidebar.tsx` — remove upgrade/limit banners and referral button.
9. `IntegrationsView.tsx` (+ `McpIntegrationCard`, `CliIntegrationCard`) —
   remove the cloud API-keys card and the Pro gating; CLI/MCP (local
   cliBridge) always available.
10. `hooks/useAudioRecording.js` — remove openwhispr limit-reached notify.
11. `hooks/useNotesOnboarding.ts` — drop `useUsage`; Pro flags constant false.
12. Delete orphans: `UpgradePrompt.tsx`, `UsageDisplay.tsx`, `ReferralModal.tsx`,
    `ReferralDashboard.tsx`, `referral-cards/`, `AuthenticationStep.tsx`,
    `EmailVerificationStep.tsx`, `ForgotPasswordView.tsx`, `hooks/useUsage.ts`.

## Deliberately left (inert, unreachable)

- `openwhispr` value in the `InferenceMode` enum, settingsStore defaults, and
  audioManager routing — all gated on `isSignedIn` which is now constant false.
  Ripping the enum out is a large refactor with no user-visible gain.
- Main-process cloud IPC (`cloud-usage`, `cloud-checkout`, …), `lib/auth.ts`,
  `cloudApi.ts`, workspace/teams services — unreachable without sign-in;
  workspaces additionally behind `WORKSPACES_ENABLED=false`.
- Orphaned i18n keys in the 10 locale files — harmless; pruned opportunistically.

## Acceptance

- `npm run build:renderer` passes; brand guard passes.
- Fresh onboarding never shows sign-in/plans; Settings has no Account/Plans
  sections; sidebar has no upgrade banner or referral entry.
- No request to `*.openwhispr.com` on app start.
