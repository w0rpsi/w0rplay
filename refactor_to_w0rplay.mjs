import fs from 'fs';
import path from 'path';

function walk(dir) {
  let files = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (item !== 'node_modules' && item !== '.git' && item !== 'target' && item !== 'dist' && item !== 'release-w0rplay') {
        files = files.concat(walk(full));
      }
    } else if (/\.(rs|toml|ts|tsx|html|css|json|txt|md|js|mjs)$/.test(item) && item !== 'refactor_to_w0rplay.mjs') {
      files.push(full);
    }
  }
  return files;
}

const files = walk('.');

let count = 0;
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Case-preserving replacements:
  // 1. WESTPLAY -> W0RPLAY
  content = content.replace(/WESTPLAY/g, 'W0RPLAY');
  // 2. WestPlay -> W0RPLAY
  content = content.replace(/WestPlay/g, 'W0RPLAY');
  // 3. westplay -> w0rplay
  content = content.replace(/westplay/g, 'w0rplay');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    count++;
    console.log(`Updated: ${file}`);
  }
}

console.log(`Refactored ${count} files.`);
