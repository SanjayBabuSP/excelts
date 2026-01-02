export function randomName(length: number = 5): string {
  const text: string[] = [];
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (let i = 0; i < length; i++) {
    text.push(possible.charAt(Math.floor(Math.random() * possible.length)));
  }

  return text.join("");
}

export function randomNum(d: number): number {
  return Math.round(Math.random() * d);
}

export function formatNumber(n: number): string {
  // output large numbers with thousands separator
  const s = n.toString();
  const l = s.length;
  const a: string[] = [];
  let r = l % 3 || 3;
  let i = 0;
  while (i < l) {
    a.push(s.substr(i, r));
    i += r;
    r = 3;
  }
  return a.join(",");
}
