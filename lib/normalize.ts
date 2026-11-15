export const normalized = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
export const skillKey = (s: string) =>
  ({
    'node js': 'node',
    nodejs: 'node',
    'next js': 'next',
    nextjs: 'next',
    postgres: 'postgresql',
    js: 'javascript',
    ts: 'typescript',
  })[normalized(s)] ?? normalized(s);
