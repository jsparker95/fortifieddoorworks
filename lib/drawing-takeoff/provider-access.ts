/** Account access errors need an operator action, not repeated paid requests. */
export function providerAccessProblem(error: unknown): string | null {
  const seen = new Set<unknown>();
  let current = error;
  for (let depth = 0; current && depth < 6 && !seen.has(current); depth++) {
    seen.add(current);
    const value = current as { statusCode?: number; message?: string; cause?: unknown };
    const message = value.message || '';
    if (/free tier users do not have access|insufficient (?:credits|balance)|credit balance.*(?:low|exhausted)|payment required/i.test(message) || value.statusCode === 402) {
      return 'AI processing paused because the Gateway account needs paid credits or access to the selected model. Saved results are retained. Update the Gateway account, then resume.';
    }
    if (value.statusCode === 401 || value.statusCode === 403) {
      return 'AI processing paused because the provider denied access. Check the Gateway credentials and model access, then resume. Saved results are retained.';
    }
    current = value.cause;
  }
  return null;
}
