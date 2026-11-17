// Input guardrail for posts. Heuristic stand-in for a model like Llama Guard.
// It blocks obvious prompt-injection / exfiltration attempts before routing.
const PATTERNS = [
  [/ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\s+(instructions|prompts?|rules)/i, 'instruction override attempt'],
  [/disregard\s+(all\s+|any\s+|the\s+)?(previous|prior|above|your)\s+(instructions|prompts?|rules)/i, 'instruction override attempt'],
  [/(reveal|print|output|show|send|leak|exfiltrate)\s+.{0,40}(system\s+prompt|api[\s_-]?key|secret|password|credentials?|token|private\s+key)/i, 'secret exfiltration attempt'],
  [/you\s+are\s+now\s+(a|an|the)\s/i, 'role hijack attempt'],
  [/(^|\n)\s*(system|assistant)\s*:/i, 'fake chat role marker'],
  [/<\|?(im_start|im_end|system|endoftext)\|?>/i, 'chat template token'],
  [/\[\s*(inst|\/inst)\s*\]/i, 'chat template token'],
  [/(transfer|wire|send)\s+(all\s+)?(funds|money|payment)s?\s+to/i, 'unauthorized financial instruction'],
];

function check(...texts) {
  const joined = texts.join('\n');
  const reasons = [];
  for (const [re, reason] of PATTERNS) {
    if (re.test(joined) && !reasons.includes(reason)) reasons.push(reason);
  }
  return { ok: reasons.length === 0, reasons };
}

// Strip control characters and cap length.
function sanitize(text, max = 5000) {
  return String(text).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

module.exports = { check, sanitize };
