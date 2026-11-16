# calisthenics-rr

App de treino para o Recommended Routine do r/bodyweightfitness. Guia o treino do dia, aplica a regra de progressão automaticamente e guarda o histórico.

## Estrutura

- `data.js`: exercícios, escadas de progressão, aquecimento e níveis iniciais
- `videos.js`: um vídeo do YouTube por exercício (para trocar, mude o `id`, o `t` e o `c` da linha)
- `logic.js`: regras de progressão e montagem do treino (funções puras)
- `app.js`: interface e armazenamento
- `style.css`: visual
- `build.py`: junta tudo em um único `index.html`
- `test.js`: testes da lógica (`node test.js`)
- `e2e.py` e `e2e2.py`: testes de interface com Playwright

## Rodar

```
python3 build.py
node test.js
```

Depois abra o `index.html` no navegador. Os vídeos só tocam quando o app está publicado em https (por exemplo no GitHub Pages), não ao abrir o arquivo direto do disco.

## Regra de progressão

Começa em 3x5, soma 1 repetição por série a cada treino até 3x8, e então passa para o próximo nível em 3x5. Isometrias vão de 10 a 30 s.

## Home use

Use the app on your iPhone while the Mac serves it over the home Wi-Fi.

1. On the Mac, run `npm run home`. The server prints the local URL and the network URLs.
2. On the iPhone, on the same Wi-Fi, open `http://<ip>:8000` (or `http://<mac-name>.local:8000`) in Safari.
3. Tap Share, then Add to Home Screen.

Notes:

- Anyone on the same Wi-Fi can reach the app and read or change the history. Use it only on a network you trust. Set `HOST=127.0.0.1` to go back to local-only access.
- Reserve the Mac's IP address in the router, so the URL does not change.
- The Mac must stay awake. `npm run home` uses `caffeinate` to prevent idle sleep while the server runs.
- YouTube videos over plain http by IP address are untested and may fail with error 153.
