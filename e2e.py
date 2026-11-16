import json, sys
from playwright.sync_api import sync_playwright
import pathlib, os
ROOT = pathlib.Path(__file__).resolve().parent
os.chdir(ROOT)
os.makedirs('shots', exist_ok=True)
URL = (ROOT / 'index.html').as_uri()
CHROME = '/usr/bin/google-chrome'
LAUNCH = dict(executable_path=CHROME, args=['--no-sandbox']) if os.path.exists(CHROME) else {}


STUB = """
(() => {
  const KEY='stubdb';
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){return {}}};
  const save=o=>localStorage.setItem(KEY,JSON.stringify(o));
  const mkSnap=(id,data)=>({id,exists:data!==undefined,data:()=>data,metadata:{}});
  const colRef=(path)=>{
    let q={order:null,dir:'asc',lim:1000};
    const self={
      path,
      doc:(id)=>docRef(path+'/'+id),
      orderBy:(f,d)=>{q.order=f;q.dir=d||'asc';return self},
      limit:(n)=>{q.lim=n;return self},
      get:async()=>{
        const s=load(); const pre=path+'/';
        let ids=Object.keys(s).filter(k=>k.startsWith(pre)&&!k.slice(pre.length).includes('/'));
        let docs=ids.map(k=>mkSnap(k.slice(pre.length),s[k]));
        if(q.order) docs.sort((a,b)=>a.data()[q.order]<b.data()[q.order]?-1:1);
        docs=docs.slice(0,q.lim);
        return {docs,size:docs.length,empty:!docs.length};
      }
    };return self;
  };
  const docRef=(path)=>({
    id:path.split('/').pop(),path,
    get:async()=>{const s=load();return mkSnap(path.split('/').pop(),s[path])},
    set:async(d)=>{const s=load();s[path]=JSON.parse(JSON.stringify(d));save(s)},
    delete:async()=>{const s=load();delete s[path];save(s)},
    collection:(p)=>colRef(path+'/'+p)
  });
  window.claude={use:async(n)=>{
    if(window.__nodb && n==='db') return null;
    if(n==='user') return {id:async()=>'u_test',isOwner:async()=>true};
    if(n==='db') return {doc:docRef,collection:colRef};
    return null;}};
})();
"""

errors=[]
with sync_playwright() as p:
    b = p.chromium.launch(**LAUNCH)
    ctx = b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.add_init_script(STUB)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append('pageerror: '+str(e)))
    page.on('console', lambda m: errors.append('console.'+m.type+': '+m.text) if m.type in ('error',) and 'ERR_TUNNEL' not in m.text and 'ERR_NAME' not in m.text and 'ERR_INTERNET' not in m.text else None)
    page.goto(URL)
    page.wait_for_timeout(600)
    page.screenshot(path='shots/01-hoje.png', full_page=True)

    # folha do exercício
    page.click('[data-act=open-ex][data-slot=pushup]')
    page.wait_for_timeout(200)
    page.screenshot(path='shots/02-folha.png')
    page.click('.sheet [data-act=sheet-close] >> nth=-1')

    # ajustes
    page.click('[data-act=tab][data-tab=ajustes]')
    page.screenshot(path='shots/03-ajustes.png', full_page=True)
    page.click('[data-act=tab][data-tab=hoje]')

    # treino
    page.click('[data-act=start]')
    page.wait_for_timeout(200)
    page.screenshot(path='shots/04-aquecimento.png')
    assert page.locator('.vid-box [data-act=play-vid]').count()==1  # vídeo do aquecimento
    page.screenshot(path='shots/04-aquecimento.png')
    for _ in range(3): page.click('[data-act=w-warm-next]')
    assert 'Deadbugs' in page.locator('.w-name').inner_text()
    page.click('[data-act=w-warm-timer]'); page.wait_for_timeout(1200)
    assert page.locator('#warmTime').inner_text() in ('0:29','0:28','0:30')
    page.screenshot(path='shots/04b-aquecimento-timer.png')
    page.click('[data-act=w-warm-back]'); assert 'GMB' in page.locator('.w-name').inner_text()
    page.click('[data-act=w-warm-skip]'); page.click('[data-act=w-warm-next]')
    page.wait_for_timeout(200)
    page.screenshot(path='shots/05-serie.png')
    steps=0; shot_rest=False
    while True:
        # Se ainda há série
        if page.locator('[data-act=w-log]').count()==0 and page.locator('[data-act=w-hold-start]').count()==0:
            break
        name=page.locator('.w-name').inner_text()
        # flexão diamante: subir para 8 em todas as séries para testar promoção
        if name.startswith('Flexão diamante'):
            for _ in range(3): page.click('[data-act=w-val][data-d="1"]')
        if page.locator('[data-act=w-hold-start]').count():
            page.click('[data-act=w-log]')
        else:
            page.click('[data-act=w-log]')
        steps+=1
        if page.locator('#restTime').count():
            if not shot_rest:
                assert page.locator('.next-up .vid-box [data-act=play-vid]').count()==1  # vídeo do próximo exercício
                page.screenshot(path='shots/06-descanso.png'); shot_rest=True
                page.click('.next-up [data-act=play-vid]')
                src=page.locator('.next-up iframe').get_attribute('src')
                assert 'youtube-nocookie.com/embed/' in src and 'autoplay=1' in src, src
                page.wait_for_timeout(1300)  # o timer continua e o player não some
                assert page.locator('.next-up iframe').count()==1
                page.screenshot(path='shots/06b-descanso-video.png')
            page.click('[data-act=w-rest-skip]')
        page.wait_for_timeout(30)
        if steps>60: break
    page.wait_for_timeout(200)
    page.screenshot(path='shots/07-resumo.png', full_page=True)
    print('series registradas:', steps)
    print('resumo:', page.locator('.w-body').inner_text().replace('\n',' | ')[:400])
    page.click('[data-act=w-close]')
    page.wait_for_timeout(200)
    page.screenshot(path='shots/08-hoje-depois.png', full_page=True)
    page.click('[data-act=tab][data-tab=progresso]')
    page.screenshot(path='shots/09-progresso.png', full_page=True)

    stub = page.evaluate("JSON.parse(localStorage.getItem('stubdb'))")
    print('chaves no db stub:', [k for k in stub.keys()])
    # recarregar: dados persistem?
    page.evaluate("localStorage.removeItem('treinoRR.v1')")
    page.reload(); page.wait_for_timeout(600)
    page.click('[data-act=tab][data-tab=progresso]')
    print('após reload (só db):', page.locator('.page-head p').inner_text())
    page.click('[data-act=tab][data-tab=hoje]')
    print('nível flexão agora:', page.locator('[data-act=open-ex][data-slot=pushup] .ex-name').inner_text(), '|', page.locator('[data-act=open-ex][data-slot=pushup] .ex-target').inner_text())
    b.close()
print('ERROS:', errors if errors else 'nenhum')
