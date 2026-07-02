// Returns a translation key rather than raw text so it can be localized
// via useLanguage().t(getGreetingKey()).
export function getGreetingKey() {
  const hour = new Date().getHours()
  if (hour < 12) return 'greeting.morning'
  if (hour < 17) return 'greeting.afternoon'
  return 'greeting.evening'
}
