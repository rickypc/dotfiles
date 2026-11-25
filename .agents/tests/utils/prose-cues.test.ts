import { expect, test } from 'bun:test';
import { scanText } from '../../utils/prose-cues.js';

test('reports matching cues with line identity and leaves input untouched', () => {
  const source = '[L001] At the end of the day, the task is done.\n[L002] The task is done.\n';
  const report = scanText(source);

  expect(report.schemaVersion).toBe(1);
  expect(report.lineCount).toBe(2);
  expect(report.flaggedLineCount).toBe(1);
  expect(report.matches).toEqual([
    {
      line: 1,
      lineId: 'L001',
      markers: ['at-the-end-of-the-day'],
      quotedContext: false,
      text: '[L001] At the end of the day, the task is done.',
    },
  ]);
  expect(source).toContain('[L001] At the end of the day');
});

test('ignores fenced and inline code while marking quoted context', () => {
  const ticks = '`'.repeat(3);
  const source = [
    `${ticks}text`,
    '[L001] delve into the problem',
    ticks,
    '[L002] The author wrote “At the end of the day, check the report.”',
    '> [L003] delve into the quoted passage',
    '`delve into` is literal code.',
  ].join('\n');
  const report = scanText(source);

  expect(report.flaggedLineCount).toBe(2);
  expect(report.matches.map(({ lineId }) => lineId)).toEqual(['L002', 'L003']);
  expect(report.matches.every(({ quotedContext }) => quotedContext)).toBe(true);
});

test('returns an empty report for clean prose', () => {
  const empty = scanText('');
  const report = scanText('[L001] The team reviewed the log.\n');

  expect(empty.lineCount).toBe(0);
  expect(empty.flaggedLineCount).toBe(0);
  expect(empty.matches).toEqual([]);
  expect(report.lineCount).toBe(1);
  expect(report.flaggedLineCount).toBe(0);
  expect(report.matches).toEqual([]);
});

test('flags both paragraphs of the supplied sample with multiple cues', () => {
  const sample = `In today’s fast-paced, ever-evolving digital landscape, it is more important than ever to delve into the intricate tapestry of modern productivity—a paradigm shift that is fundamentally transforming how we navigate the complexities of remote work. It’s not just about working harder; it’s about unlocking your true potential and fostering a holistic synergy between innovation and efficiency. Studies show that organizations that seamlessly leverage cutting-edge solutions are uniquely positioned to spearhead a new era of unparalleled growth, ultimately paving the way for a brighter, more streamlined tomorrow.
Moreover, as we stand at the precipice of this exciting technological revolution, one thing remains abundantly clear: adaptability is no longer a luxury—it is an absolute necessity. Whether you are a seasoned industry veteran or a budding entrepreneur, embracing this transformative journey requires a delicate balance of strategic foresight and unwavering resilience. At the end of the day, success isn’t a destination; it’s a mindset—and by harnessing the power of these game-changing insights, you can elevate your workflow to unprecedented heights and truly stand out in a crowded marketplace.`;
  const report = scanText(sample);

  expect(report.lineCount).toBe(2);
  expect(report.flaggedLineCount).toBe(2);
  expect(
    report.matches.reduce((total, row) => total + row.markers.length, 0),
  ).toBeGreaterThanOrEqual(20);
});
