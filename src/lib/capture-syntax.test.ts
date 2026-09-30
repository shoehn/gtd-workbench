import { describe, expect, it } from 'vitest';
import { parse } from './capture-syntax';

const TODAY = '2026-09-26'; // a Saturday
const CONTEXTS = ['@computer', '@office', '@home', '@calls', '@errands', '@studio'];
const p = (line: string) => parse(line, TODAY, CONTEXTS);

describe('parse', () => {
  it('leaves a line without shorthand untouched', () => {
    expect(p('Replace the kitchen tap cartridge')).toEqual({
      text: 'Replace the kitchen tap cartridge',
      tags: [],
    });
  });

  it('parses context, priority and weekday together', () => {
    expect(p('Call the shop @calls !B ^fri')).toEqual({
      text: 'Call the shop',
      tags: [],
      context: '@calls',
      priority: 'B',
      date: '2026-10-02',
    });
  });

  it('collects tags and ignores a # inside a word', () => {
    expect(p('Learn C# basics #learning #someday-list')).toEqual({
      text: 'Learn C# basics',
      tags: ['learning', 'someday-list'],
    });
  });

  it('keeps unknown contexts and e-mail addresses in the text', () => {
    expect(p('Mail anna@example.com @garden')).toEqual({
      text: 'Mail anna@example.com @garden',
      tags: [],
    });
  });

  it('parses ^dd.mm, rolling into next year when the day has passed', () => {
    expect(p('Offer deadline ^03.10').date).toBe('2026-10-03');
    expect(p('Renew passport ^15.01').date).toBe('2027-01-15');
  });

  it('parses ^today and ^tomorrow', () => {
    expect(p('Water plants ^today').date).toBe('2026-09-26');
    expect(p('Water plants ^tomorrow').date).toBe('2026-09-27');
  });

  it('takes the next occurrence of a weekday, never today', () => {
    expect(p('Market ^sat').date).toBe('2026-10-03');
    expect(p('Standup ^mon').date).toBe('2026-09-28');
  });

  it('leaves invalid dates and priorities in the text', () => {
    expect(p('Fix ^31.02 and !D ^someday')).toEqual({
      text: 'Fix ^31.02 and !D ^someday',
      tags: [],
    });
  });

  it('is case-insensitive for shorthand values', () => {
    expect(p('Ring the bank @Calls !a ^FRI')).toMatchObject({
      text: 'Ring the bank',
      context: '@calls',
      priority: 'A',
      date: '2026-10-02',
    });
  });

  it('keeps the first of repeated shorthand and leaves the rest in the text', () => {
    expect(p('Buy screws @errands @studio !A !C')).toEqual({
      text: 'Buy screws @studio !C',
      tags: [],
      context: '@errands',
      priority: 'A',
    });
  });

  it('never throws on empty or odd input', () => {
    expect(p('')).toEqual({ text: '', tags: [] });
    expect(p('  # @ ! ^  ')).toEqual({ text: '# @ ! ^', tags: [] });
  });
});
