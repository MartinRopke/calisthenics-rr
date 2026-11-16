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

    # 1) with bar: pull-up shows up; timed hold; skip; leave and continue
    ctx, pg = newpage()
    pg.click('[data-act=tab][data-tab=settings]')
    pg.click('[data-act=toggle-bar]')
    ok('bar toggle switches on', pg.get_attribute('[data-act=toggle-bar]', 'aria-checked') == 'true')
    pg.click('[data-act=tab][data-tab=today]')
    ok('pull-up shows up with the bar', 'Scapular pulls' in pg.inner_text('#app'))
    pg.click('[data-act=start]'); pg.click('[data-act=w-begin]')
    ok('first exercise is pull-up', 'Scapular pulls' in pg.inner_text('.w-name'))
    pg.click('[data-act=w-skip]')
    ok('skipping goes to the squat', 'Squat' in pg.inner_text('.w-name'))
    # open "How to" in the workout
    pg.click('[data-act=w-info]'); pg.wait_for_timeout(100)
    ok('sheet opens in workout', 'How to' in pg.inner_text('#sheet'))
    # switch level mid-workout (no set done yet)
    pg.click('.ladder button >> nth=2'); pg.wait_for_timeout(100)
    pg.click('.sheet [data-act=sheet-close] >> nth=-1')
    ok('level switch in workout', 'Split' in pg.inner_text('.w-name'))
    ok('por lado aparece', 'per side' in pg.inner_text('.w-body'))
    pg.click('[data-act=w-log]')
    # after logging, the level is locked
    pg.click('[data-act=w-rest-skip]')
    pg.click('[data-act=w-skip]')  # skip the next one (dip hold?) -> see which it is
    # leave and continue later
    pg.click('[data-act=w-exit]'); pg.wait_for_timeout(100)
    ok('leave menu shows options', 'Save and finish' in pg.inner_text('#sheet') and 'continue later' in pg.inner_text('#sheet'))
    pg.click('[data-act=w-leave]'); pg.wait_for_timeout(100)
    ok('back on Today with draft', 'Continue workout' in pg.inner_text('#app'))
    pg.screenshot(path='shots/10-draft.png')
    pg.click('[data-act=resume]'); pg.wait_for_timeout(100)
    ok('resume returns to workout', pg.locator('.overlay').count() == 1)
    # timed hold
    for _ in range(40):
        if pg.locator('[data-act=w-hold-start]').count(): break
        if pg.locator('[data-act=w-log]').count(): pg.click('[data-act=w-log]')
        if pg.locator('[data-act=w-rest-skip]').count(): pg.click('[data-act=w-rest-skip]')
    ok('reached a hold', pg.locator('[data-act=w-hold-start]').count() == 1)
    pg.screenshot(path='shots/11-hold.png')
    pg.click('[data-act=w-hold-start]'); pg.wait_for_timeout(2300)
    ok('timer counts', re.match(r'\d+ s', pg.inner_text('#holdTime')) is not None)
    pg.click('[data-act=w-hold-stop]'); pg.wait_for_timeout(100)
    v = pg.inner_text('#val')
    ok('stop records value (2 s)', v.strip() in ('2 s', '3 s'))
    pg.click('[data-act=w-val][data-d="5"]'); pg.click('[data-act=w-log]')
    # finish by saving
    pg.click('[data-act=w-exit]'); pg.click('[data-act=w-finish]'); pg.wait_for_timeout(200)
    ok('summary shows on save', 'Workout complete' in pg.inner_text('.overlay'))
    pg.screenshot(path='shots/12-partial-summary.png', full_page=True)
    pg.click('[data-act=w-close]')
    ok('draft is gone after finishing', pg.locator('[data-act=resume]').count() == 0)
    # progress: tapping a bar changes the caption
    pg.click('[data-act=tab][data-tab=progress]')
    pg.click('.pcard .bar >> nth=0', force=True); ok('tapping a bar shows caption', pg.locator('.pcard .chart-cap').first.inner_text() != '')
    ok('history lists the workout', pg.locator('details.sess').count() == 1)
    pg.click('details.sess summary')
    pg.screenshot(path='shots/13-history.png', full_page=True)
    # backup: export -> import in another context
    pg.click('[data-act=tab][data-tab=settings]')
    bk = pg.input_value('#bk')
    ok('backup has sessions', '"sessions":[{' in bk)
    ctx.close()

    # 2) no account (null db): uses localStorage and imports backup
    ctx, pg = newpage(nodb=True)
    pg.click('[data-act=tab][data-tab=settings]')
    ok('local mode notice', 'in this browser' in pg.inner_text('.page-head'))
    pg.fill('#bk', bk); pg.click('[data-act=import-bk]'); pg.wait_for_timeout(100)
    pg.click('[data-act=tab][data-tab=progress]')
    ok('import restores history', pg.locator('details.sess').count() == 1)
    pg.reload(); pg.wait_for_timeout(400); pg.click('[data-act=tab][data-tab=progress]')
    ok('local mode persists after reload', pg.locator('details.sess').count() == 1)
    pg.click('[data-act=tab][data-tab=settings]'); pg.fill('#bk', 'junk'); pg.click('[data-act=import-bk]')
    ok('invalid backup warns', 'Invalid' in pg.inner_text('#toast'))
    pg.click('[data-act=reset-ask]'); pg.click('[data-act=reset-do]'); pg.wait_for_timeout(100)
    pg.click('[data-act=tab][data-tab=progress]')
    ok('clear all resets', pg.locator('details.sess').count() == 0)
    ctx.close()

    # 3) dark
    ctx, pg = newpage(dark=True)
    pg.screenshot(path='shots/14-dark.png')
    pg.click('[data-act=start]'); pg.click('[data-act=w-begin]')
    pg.screenshot(path='shots/15-dark-set.png')
    ctx.close(); b.close()
print('\n'.join(res)); print('ERRORS:', errors or 'none')
