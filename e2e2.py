import re
from playwright.sync_api import sync_playwright
import pathlib, os
ROOT = pathlib.Path(__file__).resolve().parent
os.chdir(ROOT)
os.makedirs('shots', exist_ok=True)
URL = (ROOT / 'index.html').as_uri()
CHROME = '/usr/bin/google-chrome'
LAUNCH = dict(executable_path=CHROME, args=['--no-sandbox']) if os.path.exists(CHROME) else {}

src = open('e2e.py').read()
STUB = re.search(r'STUB = """(.*?)"""', src, re.S).group(1)
errors = []; res = []
def ok(name, cond): res.append(('ok  ' if cond else 'FAIL') + ' ' + name)

with sync_playwright() as p:
    b = p.chromium.launch(**LAUNCH)
    def newpage(nodb=False, dark=False):
        ctx = b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme='dark' if dark else 'light')
        ctx.add_init_script(('window.__nodb=true;' if nodb else '') + STUB)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' and 'ERR_TUNNEL' not in m.text and 'ERR_NAME' not in m.text and 'ERR_INTERNET' not in m.text else None)
        pg.goto(URL); pg.wait_for_timeout(500)
        return ctx, pg

    # 1) com barra: pull-up entra; hold com cronômetro; pular; sair e continuar
    ctx, pg = newpage()
    pg.click('[data-act=tab][data-tab=ajustes]')
    pg.click('[data-act=toggle-bar]')
    ok('toggle da barra liga', pg.get_attribute('[data-act=toggle-bar]', 'aria-checked') == 'true')
    pg.click('[data-act=tab][data-tab=hoje]')
    ok('pull-up aparece com a barra', 'Scapular pulls' in pg.inner_text('#app'))
    pg.click('[data-act=start]'); pg.click('[data-act=w-begin]')
    ok('primeiro exercício é pull-up', 'Scapular pulls' in pg.inner_text('.w-name'))
    pg.click('[data-act=w-skip]')
    ok('pular exercício vai para o agachamento', 'Agachamento' in pg.inner_text('.w-name'))
    # abre "Como fazer" no treino
    pg.click('[data-act=w-info]'); pg.wait_for_timeout(100)
    ok('folha no treino abre', 'Como fazer' in pg.inner_text('#sheet'))
    # troca de nível no meio (nenhuma série feita ainda)
    pg.click('.ladder button >> nth=2'); pg.wait_for_timeout(100)
    pg.click('.sheet [data-act=sheet-close] >> nth=-1')
    ok('troca de nível no treino', 'Split' in pg.inner_text('.w-name') or 'dividido' in pg.inner_text('.w-name'))
    ok('por lado aparece', 'por lado' in pg.inner_text('.w-body'))
    pg.click('[data-act=w-log]')
    # após registrar, nível fica travado
    pg.click('[data-act=w-rest-skip]')
    pg.click('[data-act=w-skip]')  # pula o próximo (dip hold?) -> vê qual é
    # sair e continuar depois
    pg.click('[data-act=w-exit]'); pg.wait_for_timeout(100)
    ok('menu de sair mostra opções', 'Guardar e terminar' in pg.inner_text('#sheet') and 'continuar depois' in pg.inner_text('#sheet'))
    pg.click('[data-act=w-leave]'); pg.wait_for_timeout(100)
    ok('voltou para Hoje com rascunho', 'Continuar treino' in pg.inner_text('#app'))
    pg.screenshot(path='shots/10-rascunho.png')
    pg.click('[data-act=resume]'); pg.wait_for_timeout(100)
    ok('retomar volta ao treino', pg.locator('.overlay').count() == 1)
    # hold com cronômetro
    for _ in range(40):
        if pg.locator('[data-act=w-hold-start]').count(): break
        if pg.locator('[data-act=w-log]').count(): pg.click('[data-act=w-log]')
        if pg.locator('[data-act=w-rest-skip]').count(): pg.click('[data-act=w-rest-skip]')
    ok('chegou num hold', pg.locator('[data-act=w-hold-start]').count() == 1)
    pg.screenshot(path='shots/11-hold.png')
    pg.click('[data-act=w-hold-start]'); pg.wait_for_timeout(2300)
    ok('cronômetro conta', re.match(r'\d+ s', pg.inner_text('#holdTime')) is not None)
    pg.click('[data-act=w-hold-stop]'); pg.wait_for_timeout(100)
    v = pg.inner_text('#val')
    ok('parar grava valor (2 s)', v.strip() in ('2 s', '3 s'))
    pg.click('[data-act=w-val][data-d="5"]'); pg.click('[data-act=w-log]')
    # termina guardando
    pg.click('[data-act=w-exit]'); pg.click('[data-act=w-finish]'); pg.wait_for_timeout(200)
    ok('resumo aparece ao guardar', 'Treino concluído' in pg.inner_text('.overlay'))
    pg.screenshot(path='shots/12-resumo-parcial.png', full_page=True)
    pg.click('[data-act=w-close]')
    ok('rascunho some após terminar', pg.locator('[data-act=resume]').count() == 0)
    # progresso: toque numa barra muda a legenda
    pg.click('[data-act=tab][data-tab=progresso]')
    pg.click('.pcard .bar >> nth=0', force=True); ok('toque na barra mostra legenda', pg.locator('.pcard .chart-cap').first.inner_text() != '')
    ok('histórico lista o treino', pg.locator('details.sess').count() == 1)
    pg.click('details.sess summary')
    pg.screenshot(path='shots/13-historico.png', full_page=True)
    # backup: exportar -> importar em outro contexto
    pg.click('[data-act=tab][data-tab=ajustes]')
    bk = pg.input_value('#bk')
    ok('backup tem sessões', '"sessions":[{' in bk)
    ctx.close()

    # 2) sem conta (db nulo): usa localStorage e importa backup
    ctx, pg = newpage(nodb=True)
    pg.click('[data-act=tab][data-tab=ajustes]')
    ok('aviso de modo local', 'neste navegador' in pg.inner_text('.page-head'))
    pg.fill('#bk', bk); pg.click('[data-act=import-bk]'); pg.wait_for_timeout(100)
    pg.click('[data-act=tab][data-tab=progresso]')
    ok('importar restaura histórico', pg.locator('details.sess').count() == 1)
    pg.reload(); pg.wait_for_timeout(400); pg.click('[data-act=tab][data-tab=progresso]')
    ok('modo local persiste após recarregar', pg.locator('details.sess').count() == 1)
    pg.click('[data-act=tab][data-tab=ajustes]'); pg.fill('#bk', 'lixo'); pg.click('[data-act=import-bk]')
    ok('backup inválido avisa', 'inválido' in pg.inner_text('#toast'))
    pg.click('[data-act=reset-ask]'); pg.click('[data-act=reset-do]'); pg.wait_for_timeout(100)
    pg.click('[data-act=tab][data-tab=progresso]')
    ok('apagar tudo zera', pg.locator('details.sess').count() == 0)
    ctx.close()

    # 3) escuro
    ctx, pg = newpage(dark=True)
    pg.screenshot(path='shots/14-escuro.png')
    pg.click('[data-act=start]'); pg.click('[data-act=w-begin]')
    pg.screenshot(path='shots/15-escuro-serie.png')
    ctx.close(); b.close()
print('\n'.join(res)); print('ERROS:', errors or 'nenhum')
