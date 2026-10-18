const original = process.emitWarning.bind(process);
process.emitWarning = ((warning, ...args: unknown[]) => {
  const text = typeof warning === 'string' ? warning : warning instanceof Error ? warning.message : '';
  if (text.includes('SQLite is an experimental')) return;
  return Reflect.apply(original, process, [warning, ...args]) as void;
}) as typeof process.emitWarning;
