import json, sys
from playwright.sync_api import sync_playwright
import os
from e2e_common import ROOT, LAUNCH, server
os.chdir(ROOT)
os.makedirs('shots', exist_ok=True)


errors=[]
with server() as URL, sync_playwright() as p:
    b = p.chromium.launch(**LAUNCH)
    ctx = b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append('pageerror: '+str(e)))
    page.on('console', lambda m: errors.append('console.'+m.type+': '+m.text) if m.type in ('error',) and 'ERR_TUNNEL' not in m.text and 'ERR_NAME' not in m.text and 'ERR_INTERNET' not in m.text else None)
    page.goto(URL)
    page.wait_for_timeout(600)
    page.screenshot(path='shots/01-today.png', full_page=True)

    # exercise sheet
    page.click('[data-act=open-ex][data-slot=pushup]')
    page.wait_for_timeout(200)
    page.screenshot(path='shots/02-sheet.png')
    page.click('.sheet [data-act=sheet-close] >> nth=-1')

    # settings
    page.click('[data-act=tab][data-tab=settings]')
    page.screenshot(path='shots/03-settings.png', full_page=True)
    page.click('[data-act=tab][data-tab=today]')

    # workout
    page.click('[data-act=start]')
    page.wait_for_timeout(200)
    page.screenshot(path='shots/04-warmup.png')
    assert page.locator('.vid-box iframe').count()==1  # warmup video
    page.screenshot(path='shots/04-warmup.png')
    for _ in range(3): page.click('[data-act=w-warm-next]')
    assert 'Deadbugs' in page.locator('.w-name').inner_text()
    page.click('[data-act=w-warm-timer]'); page.wait_for_timeout(1200)
    assert page.locator('#warmTime').inner_text() in ('0:29','0:28','0:30')
    page.screenshot(path='shots/04b-warmup-timer.png')
    page.click('[data-act=w-warm-back]'); assert 'GMB' in page.locator('.w-name').inner_text()
    page.click('[data-act=w-warm-skip]'); page.click('[data-act=w-warm-next]')
    page.wait_for_timeout(200)
    page.screenshot(path='shots/05-set.png')
    steps=0; shot_rest=False
    while True:
        # If there are still sets
        if page.locator('[data-act=w-log]').count()==0 and page.locator('[data-act=w-hold-start]').count()==0:
            break
        name=page.locator('.w-name').inner_text()
        # diamond push-up: raise to 8 on all sets to test promotion
        if name.startswith('Diamond push-up'):
            for _ in range(3): page.click('[data-act=w-val][data-d="1"]')
        if page.locator('[data-act=w-hold-start]').count():
            page.click('[data-act=w-log]')
        else:
            page.click('[data-act=w-log]')
        steps+=1
        if page.locator('#restTime').count():
            if not shot_rest:
                assert page.locator('.next-up .vid-box iframe').count()==1  # next exercise video
                page.screenshot(path='shots/06-rest.png'); shot_rest=True
                src=page.locator('.next-up iframe').get_attribute('src')
                assert 'youtube-nocookie.com/embed/' in src, src
                page.wait_for_timeout(1300)  # the timer keeps going and the player stays
                assert page.locator('.next-up iframe').count()==1
                page.screenshot(path='shots/06b-rest-video.png')
            page.click('[data-act=w-rest-skip]')
        page.wait_for_timeout(30)
        if steps>60: break
    page.wait_for_timeout(200)
    page.screenshot(path='shots/07-summary.png', full_page=True)
    print('sets logged:', steps)
    print('summary:', page.locator('.w-body').inner_text().replace('\n',' | ')[:400])
    page.click('[data-act=w-close]')
    page.wait_for_timeout(200)
    page.screenshot(path='shots/08-today-after.png', full_page=True)
    page.click('[data-act=tab][data-tab=progress]')
    page.screenshot(path='shots/09-progress.png', full_page=True)

    saved = page.evaluate("fetch('/api/state').then(r => r.json())")
    print('keys saved by the server:', sorted(saved.keys()))
    # reload: does data persist (server file only)?
    page.evaluate("localStorage.removeItem('treinoRR.v1')")
    page.reload(); page.wait_for_timeout(600)
    page.click('[data-act=tab][data-tab=progress]')
    print('after reload (server only):', page.locator('.page-head p').inner_text())
    page.click('[data-act=tab][data-tab=today]')
    print('push-up level now:', page.locator('[data-act=open-ex][data-slot=pushup] .ex-name').inner_text(), '|', page.locator('[data-act=open-ex][data-slot=pushup] .ex-target').inner_text())
    b.close()
print('ERRORS:', errors if errors else 'none')
