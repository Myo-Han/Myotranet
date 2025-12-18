export function formatKoreanDateTimeYY(ts: string) {
  const d = new Date(ts);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');

  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');

  const ampm = h < 12 ? '오전' : '오후';
  h = h % 12;
  if (h === 0) h = 12;

  const hh = String(h).padStart(2, '0');
  return `${yy}-${mm}-${dd} ${ampm} ${hh}:${m}`;
}

export function buildAffiliation(u: {
  department?: string | null;
  project?: string | null;
  part?: string | null;
  position?: string | null;
}) {
  const parts = [u.department, u.project, u.part, u.position].filter(Boolean);
  return parts.join(' · ');
}
