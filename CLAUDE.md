# calisthenics-rr

App web de treino para o Recommended Routine (RR) do r/bodyweightfitness. Guia o treino do dia, aplica a progressão automaticamente e guarda o histórico. Um único usuário (Martin), usado no iPhone e no Mac. A interface é toda em inglês, por pedido do Martin.

## Comandos

- `npm run build`: gera o `index.html` juntando `style.css`, `data.js`, `videos.js`, `logic.js` e `app.js`. O `index.html` é commitado, porque o GitHub Pages publica o arquivo da raiz. Depois de editar qualquer fonte, rode o build e commite o `index.html` junto.
- `npm test`: testes da lógica, em Node, sem dependências. Rode sempre antes de commitar.
- `npm run guia`: regenera `docs/rr-guia.md` a partir do `data.js`. Rode depois de mudar escadas, dicas ou aquecimento.
- `npm run wiki`: guia o Martin a salvar as páginas originais do guia em `reference/` (fora do git). Abre cada página no navegador dele e grava o texto copiado. O Reddit bloqueia download automático, então só ele consegue rodar.
- `npm run test:e2e`: testes de tela com Playwright em Python (`pip install playwright` e `playwright install chromium`). Rodam o `index.html` com um db falso e salvam capturas em `shots/`, que o git ignora.
- `npm start`: servidor local (`server.mjs`, sem dependências) em http://localhost:8000. Serve o `index.html` e guarda o histórico em `data/treino.json`, que o git ignora. É o jeito de usar no Mac: os vídeos tocam em localhost e os dados ficam num arquivo.
- Abrir o `index.html` direto do disco funciona, mas os vídeos não tocam (erro 153 do YouTube). Os vídeos tocam em localhost e no GitHub Pages (https).

## Estrutura

- `data.js`: os 9 exercícios (`SLOTS`), as escadas de progressão (`LADDERS`, com caminhos alternativos), a ordem do treino (`PAIRS`, `CORE`), os níveis iniciais (`START_LEVELS`) e o aquecimento (`WARMUP`, `WARMUP_EXTRAS`).
- `videos.js`: um vídeo do YouTube por nível e por item do aquecimento.
- `logic.js`: funções puras, sem DOM, exportadas com `module.exports` para os testes. Toda regra de progressão mora aqui.
- `app.js`: telas, armazenamento e treino guiado. Os cliques passam por `data-act` e pelo objeto de funções `H`.
- `style.css`: tema claro e escuro por `prefers-color-scheme`.
- Os arquivos viram scripts globais, sem módulos, na ordem do build. O estilo é ES5 (`var`, `function`) de propósito.
- Com `npm start`, o app detecta `/api/state` e grava o histórico em `data/treino.json` (com cópia em `treino.bak.json`), além do `localStorage`. No GitHub Pages esse endereço não existe, então só vale o `localStorage` (chave `treinoRR.v1`, rascunho em `treinoRR.draft`). O código ainda tem um caminho para o `db` dos artifacts do Claude, que pode ser removido.

## Regras do produto (não mudar sem pedir)

- Corpo inteiro 3 vezes por semana (segunda, quarta e sexta), com pelo menos um dia entre os treinos.
- Ordem do treino: aquecimento, três pares de força (pull-up e agachamento, dip e hinge, remada e flexão) com 3 séries e 90 s de descanso, e o trio de core (anti-extensão, anti-rotação, extensão) com 3 séries e 60 s.
- Progressão de força: começa em 3x5, soma 1 repetição por série a cada treino até 3x8, e então passa ao próximo nível em 3x5. Core vai de 8 a 12 repetições.
- Isometrias vão de 10 a 30 s, em passos de 5 s, e passam de nível ao chegar a 30 s nas 3 séries. A página do dip pede 1 min, e usamos 30 s.
- Exercício unilateral: um lado mais o outro contam como uma série.
- Regra de meta (`targetsFor` e `prescribe`): na primeira vez no nível, todas as séries partem do mínimo. Se todas as séries bateram a meta, cada uma sobe um passo, limitado ao máximo. Senão, repete a última.
- Pull-up só entra no treino com `settings.hasBar` ligado ("I have a pull-up bar" em Settings). O Martin ainda não tem a barra.
- O aquecimento tem uma tela por item, sem escolhas. Os extras entram sozinhos conforme o nível.
- Os níveis iniciais estão em `START_LEVELS` e vieram do plano de treino do Martin. Mudar isso muda o treino dele, então combine antes.

## Vídeos e conteúdo

- A chave em `videos.js` é o id do nível, ou `w.<id>` no aquecimento. O teste exige vídeo para todo nível.
- Para trocar um vídeo: achar o novo no YouTube, conferir que permite incorporação (a URL `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=ID&format=json` responde 200) e preencher `id`, `t` (título) e `c` (canal).
- As dicas de execução são paráfrases do wiki do r/bodyweightfitness. Não copie texto, GIFs nem imagens do wiki para o repositório, que é público.
- `docs/rr-guia.md` é a referência do guia do RR em palavras próprias, com o link de cada página original. Consulte esse arquivo antes de mudar escadas ou regras. Não edite à mão: ele é gerado pelo `npm run guia`.
- `reference/` é a pasta onde o Martin guarda as páginas originais que salvou para uso pessoal. O git ignora essa pasta. Se ela existir, pode ler para conferir detalhes, mas nunca copie o conteúdo para arquivos versionados.

## Convenções

- Todo texto visível do app (telas, botões, dicas de execução, avisos) fica em inglês, com frases curtas e verbos no imperativo nos botões ("Set done", "Skip"). Os nomes dos exercícios seguem o nome do guia (Pull-up, Hinge, Copenhagen plank). Este CLAUDE.md e os comentários do código continuam em português.
- Exercício que pede equipamento mostra "Needs: ..." com um ícone de halter (Lucide, licença ISC, embutido no `app.js` como `ICON_EQUIP`) com as opções (campo `equip` do nível, em `data.js`). Sem equipamento, o campo fica vazio e nada aparece.
- Mobile primeiro (390 px de largura), alvos de toque de pelo menos 44 px.
- Sem dependências externas além da fonte Archivo e dos vídeos do YouTube.
- Mexeu na lógica? Adicione ou atualize o teste em `test.js`.
- O plano completo está no documento "Plano de treino RR" no Claude Docs. Se mudar escadas ou níveis iniciais, avise o Martin para atualizar o documento.

## Pendências conhecidas

- Redesenho visual (cores), pedido pelo Martin.
- Sem modo offline nem instalação como PWA (falta manifest e service worker).
- Os apitos do descanso podem não tocar com a tela bloqueada. O tempo é calculado por horário, então o cronômetro não se perde.
- Nunca foi testado em um iPhone real.
