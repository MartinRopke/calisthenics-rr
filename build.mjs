// Junta style.css e os scripts em um único index.html (é o arquivo que o GitHub Pages publica).
import { readFileSync, writeFileSync } from 'node:fs';

const css = readFileSync('style.css', 'utf8');
const js = ['data.js', 'videos.js', 'logic.js', 'app.js'].map((f) => readFileSync(f, 'utf8')).join('\n');

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Treino RR</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<div id="overlay"></div>
<div id="sheet"></div>
<div id="toast" aria-live="polite"></div>
<script>
${js}
</script>
</body>
</html>
`;

writeFileSync('index.html', html);
console.log(`index.html gerado (${Buffer.byteLength(html)} bytes)`);
