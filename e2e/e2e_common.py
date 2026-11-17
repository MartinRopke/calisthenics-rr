"""Shared setup for the e2e tests: start server.mjs on a free port with a temp data dir."""
import contextlib, os, pathlib, socket, subprocess, tempfile, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
CHROME = '/usr/bin/google-chrome'
LAUNCH = dict(executable_path=CHROME, args=['--no-sandbox']) if os.path.exists(CHROME) else {}


@contextlib.contextmanager
def server():
    """Yield the base URL of a fresh server (empty history, nothing written to data/)."""
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        port = s.getsockname()[1]
    with tempfile.TemporaryDirectory() as tmp:
        env = dict(os.environ, PORT=str(port), HOST='127.0.0.1', DATA_DIR=tmp)
        proc = subprocess.Popen(['node', 'server.mjs'], cwd=ROOT, env=env, stdout=subprocess.DEVNULL)
        url = 'http://127.0.0.1:%d/' % port
        try:
            for _ in range(50):
                try:
                    urllib.request.urlopen(url, timeout=1).close()
                    break
                except OSError:
                    time.sleep(0.1)
            yield url
        finally:
            proc.terminate()
            proc.wait()
