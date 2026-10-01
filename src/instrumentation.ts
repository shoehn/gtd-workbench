// Runs once when a server instance starts (not during `next build`).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startCalendarSync } = await import('./lib/calendar/scheduler');
    startCalendarSync(); // does not wait for the first sync: the server is ready at once
  }
}
