// ponytail: Dhwani is local-only — auth is permanently signed-out. This stub
// keeps every cloud gate dark and avoids better-auth's startup session fetch
// to auth.openwhispr.com. Restore from git history if a cloud backend returns.
export function useAuth() {
  return {
    isSignedIn: false,
    isGracePeriodOnly: false,
    isLoaded: true,
    session: null,
    user: null,
  };
}
