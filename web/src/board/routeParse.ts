const NACH_UEBER = /\s+(?:nach|über|ueber)\s+/i;
const UK_KH_PREFIX = /^(uk|kh)\b/i;

/**
 * Routen-Parsing wie im Agent. Slash zuerst — „UK - Neunkirchen“ bleibt ein Ort.
 */
export function parseUeberfuehrungRoute(text?: string): { von: string; nach: string | null } {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) return { von: '', nach: null };

  const slashIdx = trimmed.indexOf(' / ');
  if (slashIdx >= 0) {
    return {
      von: trimmed.slice(0, slashIdx).trim(),
      nach: trimmed.slice(slashIdx + 3).trim(),
    };
  }

  const nachMatch = trimmed.match(NACH_UEBER);
  if (nachMatch?.index != null && nachMatch.index >= 0) {
    return {
      von: trimmed.slice(0, nachMatch.index).trim(),
      nach: trimmed.slice(nachMatch.index + nachMatch[0].length).trim(),
    };
  }

  if (!UK_KH_PREFIX.test(trimmed)) {
    const dashIdx = trimmed.indexOf(' - ');
    if (dashIdx > 0) {
      return {
        von: trimmed.slice(0, dashIdx).trim(),
        nach: trimmed.slice(dashIdx + 3).trim(),
      };
    }
  }

  return { von: trimmed, nach: null };
}
