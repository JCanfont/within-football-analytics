export function normalizeTeam(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function sameTeam(left: string, right: string) {
  const normalizedLeft = normalizeTeam(left);
  const normalizedRight = normalizeTeam(right);
  return normalizedLeft === normalizedRight ||
    (Math.min(normalizedLeft.length, normalizedRight.length) >= 5 &&
      (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)));
}
