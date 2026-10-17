import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createScanner } from 'typescript/unstable/ast/scanner';
import { SyntaxKind } from 'typescript/unstable/ast';

const forbidden = /(?:^|[:/@_.-])(?:xlr8|conference-app)(?:$|[/@_.#?-])/i;

export function inspectBoundary(path, text) {
  const errors = [];
  if (path.endsWith('package.json')) {
    const pkg = JSON.parse(text);
    for (const [name, target] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies })) {
      if (forbidden.test(name)) errors.push(`${path} depends on ${name}`);
      if (typeof target === 'string' && forbidden.test(target.replaceAll('\\', '/'))) errors.push(`${path} dependency ${name} targets the application`);
    }
  } else {
    // TypeScript 7 exposes a scanner instead of the former default compiler API.
    // This checks literal module references; computed imports need code review.
    const scanner = createScanner(true, undefined, text);
    let previous, beforePrevious, kind;
    while ((kind = scanner.scan()) !== SyntaxKind.EndOfFile) {
      const token = { kind, value: scanner.getTokenValue() };
      const literal = kind === SyntaxKind.StringLiteral || kind === SyntaxKind.NoSubstitutionTemplateLiteral;
      const staticImport = previous?.kind === SyntaxKind.FromKeyword || previous?.kind === SyntaxKind.ImportKeyword;
      const callImport = previous?.kind === SyntaxKind.OpenParenToken && (beforePrevious?.kind === SyntaxKind.ImportKeyword || ([SyntaxKind.Identifier, SyntaxKind.RequireKeyword].includes(beforePrevious?.kind) && beforePrevious.value === 'require'));
      if (literal && (staticImport || callImport) && forbidden.test(token.value)) errors.push(`${path} imports ${token.value}`);
      beforePrevious = previous;
      previous = token;
    }
  }
  return errors;
}

export async function checkBoundaries(root) {
  const errors = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) errors.push(`${relative(root, path)} is a symlink and needs explicit boundary review`);
      else if (entry.isDirectory()) await walk(path);
      else if (/\.(?:[cm]?[jt]sx?|json)$/.test(entry.name)) errors.push(...inspectBoundary(relative(root, path), await readFile(path, 'utf8')));
    }
  }
  errors.push(...inspectBoundary('package.json', await readFile(resolve(root, 'package.json'), 'utf8')));
  await walk(resolve(root, 'packages'));
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const errors = await checkBoundaries(resolve(import.meta.dirname, '..'));
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Engine static imports and package dependencies respect the application boundary.');
}
