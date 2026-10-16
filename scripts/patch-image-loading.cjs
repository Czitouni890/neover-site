const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

const filename = path.resolve(__dirname, '../neover-export/assets/index-B_QI3GIl.js');
const source = fs.readFileSync(filename, 'utf8');
if (source.includes('function neoverImageLoading(')) {
  console.log('Image loading already configured.');
  process.exit(0);
}
const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const edits = [];
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'CallExpression' && node.arguments[0]?.value === 'img') {
    const props = node.arguments[1];
    if (props?.type === 'ObjectExpression') {
      const src = props.properties.find(p => p.key?.name === 'src' || p.key?.value === 'src');
      if (src?.value) {
        edits.push({
          at: props.end - 1,
          text: `,...neoverImageLoading(${source.slice(src.value.start, src.value.end)})`,
        });
      }
    }
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') visit(value);
  }
}
visit(ast);
let result = source;
for (const edit of edits.sort((a, b) => b.at - a.at)) {
  result = result.slice(0, edit.at) + edit.text + result.slice(edit.at);
}
// Set native loading before React inserts the image, including hidden page sections.
result = `function neoverImageLoading(src){if(typeof src!=="string"||!/^\\/images\\/neover-photo-\\d+\\.jpg$/.test(src))return {};const hero=src==="/images/neover-photo-09.jpg"&&["/","/index.html"].includes(location.pathname);return {loading:hero?"eager":"lazy",decoding:"async",fetchPriority:hero?"high":"auto"};}\n` + result;
acorn.parse(result, { ecmaVersion: 'latest', sourceType: 'module' });
fs.writeFileSync(filename, result);
console.log(`Configured ${edits.length} image elements.`);
