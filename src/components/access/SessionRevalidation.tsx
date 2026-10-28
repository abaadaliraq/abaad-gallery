"use client";
// LiveProvider checks the same live server authorization on visibility/focus/BFCache restore.
// It clears session-scoped data and redirects only after an actual access denial.
// No route refresh or document reload is needed for valid sessions.
export default function SessionRevalidation() {
  return null;
}
