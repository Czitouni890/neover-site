const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'neover-export', 'images');
const backups = path.resolve(root, '..', '.neover-image-originals');

async function main() {
  await fs.mkdir(backups, { recursive: true });
  let before = 0;
  let after = 0;
  for (const name of await fs.readdir(directory)) {
    if (!/^(neover-photo-\d+\.jpg|logo-neover\.png)$/.test(name)) continue;
    const target = path.join(directory, name);
    const original = path.join(backups, name);
    try {
      await fs.copyFile(target, original, require('node:fs').constants.COPYFILE_EXCL);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const input = await fs.readFile(original);
    const logo = name.endsWith('.png');
    let pipeline = sharp(input).rotate().resize({
      width: logo ? 240 : name === 'neover-photo-09.jpg' ? 1920 : 1440,
      withoutEnlargement: true,
    });
    pipeline = logo
      ? pipeline.png({ compressionLevel: 9, palette: true, quality: 95 })
      : pipeline.jpeg({ quality: 80, mozjpeg: true, progressive: true });
    const output = await pipeline.toBuffer();
    await fs.writeFile(target, output);
    before += input.length;
    after += output.length;
    console.log(`${name}: ${input.length} -> ${output.length} bytes`);
  }
  console.log(`Total: ${before} -> ${after} bytes (${(100 * (1 - after / before)).toFixed(1)}% smaller)`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
