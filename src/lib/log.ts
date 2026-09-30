// One-line server logs with a level from LOG_LEVEL (error | warn | info | debug; default info).
const LEVELS = ['error', 'warn', 'info', 'debug'] as const;
type Level = (typeof LEVELS)[number];

const threshold = LEVELS.indexOf((process.env.LOG_LEVEL as Level) ?? 'info');

function at(level: Level) {
  return (message: string) => {
    if (LEVELS.indexOf(level) > (threshold < 0 ? 2 : threshold)) return;
    const line = `${new Date().toISOString()} ${level.padEnd(5)} ${message}`;
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
  };
}

export const log = { error: at('error'), warn: at('warn'), info: at('info'), debug: at('debug') };
