import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const forbidden = /(?:^|[/@_-])(?:xlr8|conference-app)(?:$|[/@_-])/i;
const errors = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.(?:[cm]?[jt]sx?|json)$/.test(entry.name)) {
      const text = await readFile(path, 'utf8');
      if (entry.name === 'package.json') {
        const pkg = JSON.parse(text);
        for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies })) {
          if (forbidden.test(name)) errors.push(`${relative(root, path)} depends on ${name}`);
        }
      } else {
        for (const match of text.matchAll(/(?:from\s*|import\s*\(?|require\s*\()\s*['"]([^'"]+)['"]/g)) {
          if (forbidden.test(match[1])) errors.push(`${relative(root, path)} imports ${match[1]}`);
        }
      }
    }
  }
}
await walk(resolve(root, 'packages'));
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('Engine package boundaries passed.');
