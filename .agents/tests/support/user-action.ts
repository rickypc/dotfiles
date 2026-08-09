import { pathToFileURL } from 'node:url';

export interface UserAction {
  readonly continueWith: string;
  readonly do: string;
  readonly doLanguage: 'bash' | 'text';
  readonly expected: string;
  readonly title: string;
  readonly verify: string;
  readonly why: string;
}

export const renderUserAction = (
  action: UserAction,
): string => `## User action required — ${action.title}

Why

${action.why}

Do

\`\`\`${action.doLanguage}
${action.do}
\`\`\`

Verify

\`\`\`bash
${action.verify}
\`\`\`

Expected: \`${action.expected}\`.

Continue

\`\`\`text
Reply: ${action.continueWith}
\`\`\``;

export const renderBrowserVerificationAction = (
  pagePath: string,
  interaction: string,
  expected: string,
): string => {
  if (!pagePath.startsWith('/')) {
    throw new Error('Browser verification requires an absolute page path.');
  }
  if (!pagePath.endsWith('.html')) {
    throw new Error('Browser verification requires an HTML page.');
  }
  return renderUserAction({
    continueWith: 'browser verification passed, or describe the mismatch',
    do: `${pathToFileURL(pagePath).href}\n\nInteraction: ${interaction}`,
    doLanguage: 'text',
    expected,
    title: 'browser verification',
    verify:
      'Open the URL above in a browser and perform the stated interaction.',
    why: 'This session has no callable browser-control surface.',
  });
};
