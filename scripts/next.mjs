// Disable framework telemetry before the Next CLI loads, in development and production.
process.env.NEXT_TELEMETRY_DISABLED = '1';
await import('next/dist/bin/next');
