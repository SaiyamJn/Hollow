/** Time-of-day greetings — pick one within the bucket; rotate every few minutes. */

const LATE_NIGHT = [
  "Still at it",
  "Burning the midnight oil",
  "Quiet hours",
  "Night owl mode",
  "The world's asleep",
  "Soft lights, soft thoughts",
  "Hello from the other side of midnight",
  "One more thing before bed?",
];

const MORNING = [
  "Good morning",
  "Rise and shine",
  "Fresh start",
  "Morning, sunshine",
  "Ready when you are",
  "A new page",
  "Coffee first?",
  "Let's ease into it",
  "Hello, bright one",
  "The day is yours",
];

const AFTERNOON = [
  "Good afternoon",
  "Hope it's going well",
  "Keep the momentum",
  "Afternoon check-in",
  "You're doing fine",
  "Halfway there",
  "Still with you",
  "How's the day treating you?",
  "A little mid-day hello",
  "You've got this",
];

const EVENING = [
  "Good evening",
  "Winding down",
  "Evening vibes",
  "Nice work today",
  "Soft landing",
  "Almost there",
  "Welcome back",
  "The light's getting low",
  "Save a little for tomorrow",
  "Glad you're here",
];

function bucket(h: number): string[] {
  if (h < 5) return LATE_NIGHT;
  if (h < 12) return MORNING;
  if (h < 17) return AFTERNOON;
  return EVENING;
}

/** Stable-ish pick that changes every `periodMs` so the greeting feels alive. */
export function pickGreeting(now = new Date(), periodMs = 4 * 60_000): string {
  const list = bucket(now.getHours());
  const slot = Math.floor(now.getTime() / periodMs);
  return list[slot % list.length];
}
