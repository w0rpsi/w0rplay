import fs from 'fs';
import path from 'path';

function walk(dir) {
  let files = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (item !== 'node_modules' && item !== '.git' && item !== 'dist') {
        files = files.concat(walk(full));
      }
    } else if (/\.(ts|tsx|html|css|json)$/.test(item)) {
      files.push(full);
    }
  }
  return files;
}

const files = [
  ...walk('ui/src'),
  'ui/index.html',
  'ui/cabin.html'
];

let totalReplacements = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Replace W0RPLAY with W0RPLAY in strings and text
  // Match 'W0RPLAY', "W0RPLAY", `W0RPLAY` or W0RPLAY with Turkish suffixes
  // e.g. W0RPLAY'i, W0RPLAY'in, W0RPLAY'e, W0RPLAY’i, W0RPLAY’in, W0RPLAY’e
  content = content.replace(/W0RPLAY(’[a-z]+|'[a-z]+)?/g, (match, suffix) => {
    return 'W0RPLAY' + (suffix || '');
  });

  // Also in case there are lowercase w0rplay in user-facing texts (like w0rplay: 'W0RPLAY')
  // but keep object keys safe:
  // fix any accidental 'W0RPLAY: ' in words/*.ts
  content = content.replace(/(\s+)W0RPLAY: /g, '$1w0rplay: ');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    totalReplacements++;
    console.log(`Updated: ${file}`);
  }
}

console.log(`Done. Updated ${totalReplacements} files.`);
