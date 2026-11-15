import re, pathlib
r = pathlib.Path('.')
css = (r/'style.css').read_text()
js = '\n'.join((r/f).read_text() for f in ['data.js','logic.js','app.js'])
html = f'''<!DOCTYPE html>
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
{css}
</style>
</head>
<body>
<div id="app"></div>
<div id="overlay"></div>
<div id="sheet"></div>
<div id="toast" aria-live="polite"></div>
<script>
{js}
</script>
</body>
</html>
'''
(r/'index.html').write_text(html)
print(len(html), 'bytes')
