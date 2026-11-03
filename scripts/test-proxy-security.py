#!/usr/bin/env python3
"""Verify production proxy boundaries using disposable Docker containers only."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import uuid


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', required=True)
    args = parser.parse_args()
    prefix = 'tt-proxy-' + uuid.uuid4().hex[:10]
    network = prefix + '-net'
    names = []
    result = {}
    with tempfile.TemporaryDirectory(prefix='towntrack-proxy-') as folder:
        caddy = Path(folder) / 'Caddyfile'
        caddy.write_text(':80 {\n reverse_proxy frontend:80 {\n  header_up X-Real-IP {remote_host}\n }\n}\n')
        docker('network', 'create', network)
        try:
            def start(label, image, *options, command=()):
                name = prefix + '-' + label
                names.append(name)
                docker('run', '-d', '--name', name, '--network', network,
                       '--network-alias', label, *options, image, *command)
                return name

            server = ('from http.server import HTTPServer,BaseHTTPRequestHandler\n'
                      'class Handler(BaseHTTPRequestHandler):\n'
                      ' def do_GET(self):\n'
                      '  self.send_response(200);self.send_header("Content-Type","application/json");'
                      'self.end_headers();self.wfile.write(b"{}")\n'
                      'HTTPServer(("0.0.0.0",8080),Handler).serve_forever()')
            start('backend', 'python:3.12', command=('python', '-c', server))
            start('gateway', 'caddy:2-alpine', '-v', str(caddy)+':/etc/caddy/Caddyfile:ro')
            frontend = start('frontend', args.image, '-e', 'TRUSTED_PROXY_HOST=gateway')
            a = start('a', 'python:3.12', command=('python', '-c', 'import time;time.sleep(600)'))
            b = start('b', 'python:3.12', command=('python', '-c', 'import time;time.sleep(600)'))
            probe = '''import json,time,urllib.request,urllib.error
for i in range(40):
 try:
  r=urllib.request.urlopen('http://gateway/api/public/municipalities',timeout=1)
  print(json.dumps(dict(r.headers)));break
 except Exception:
  if i==39:raise
  time.sleep(.1)
'''
            headers = json.loads(docker('exec', a, 'python', '-c', probe))
            callbacks = """import urllib.request,json
paths=['/?code=tt-synthetic-root-code','/auth/callback?code=tt-synthetic-canonical-code','/auth/callback/?code=tt-synthetic-trailing-code']
responses=[urllib.request.urlopen('http://gateway'+path,timeout=5) for path in paths]
assert all('no-store' in r.headers.get('Cache-Control','') for r in responses), 'Callback must not be cached'
assert all(r.headers.get('Referrer-Policy')=='no-referrer' for r in responses), 'Callback may leak its query to referrers'
print(json.dumps([r.status for r in responses]))
urllib.request.urlopen('http://gateway/log-check-visible',timeout=5).read()
"""
            statuses = json.loads(docker('exec', a, 'python', '-c', callbacks))
            assert statuses == [200, 200, 200], 'Callback landing page unavailable'
            logs = docker('logs', frontend)
            assert 'log-check-visible' in logs, 'Access-log assertion has no positive control'
            assert 'tt-synthetic-' not in logs, 'SSO callback code reached frontend access logs'
            result['callback_queries_not_logged'] = True
            flood = '''import concurrent.futures,json,urllib.request,urllib.error
host=__import__('sys').argv[1];forge=__import__('sys').argv[2]=='yes'
def get(i):
 headers={'X-Real-IP':'198.51.100.'+str(i+1),'X-Forwarded-For':'198.51.100.'+str(i+1)} if forge else {}
 try:
  with urllib.request.urlopen(urllib.request.Request('http://'+host+'/api/public/municipalities',headers=headers),timeout=5) as r:return r.status
 except urllib.error.HTTPError as e:return e.code
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:print(json.dumps(list(pool.map(get,range(80)))))
'''
            continuous = """import concurrent.futures,json,time,urllib.request,urllib.error,threading
limited=threading.Event();deadline=time.monotonic()+5
counts=[]
def run(_):
 local=[]
 while time.monotonic()<deadline:
  try:
   with urllib.request.urlopen('http://gateway/api/public/municipalities',timeout=2) as r:status=r.status
  except urllib.error.HTTPError as e:status=e.code
  except Exception:continue
  local.append(status)
  if status==429 and not limited.is_set():limited.set();print('LIMITED',flush=True)
 return local
with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
 for statuses in pool.map(run,range(20)):counts.extend(statuses)
print(json.dumps(counts),flush=True)
"""
            process = subprocess.Popen(['docker','exec',a,'python','-u','-c',continuous],
                                       stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            try:
                assert process.stdout.readline().strip() == 'LIMITED', 'Client A never reached its rate limit'
                single = "import urllib.request,urllib.error;\ntry:print(urllib.request.urlopen('http://gateway/api/public/municipalities',timeout=5).status)\nexcept urllib.error.HTTPError as e:print(e.code)"
                result['other_client_during_flood'] = int(docker('exec', b, 'python', '-c', single))
                output, error = process.communicate(timeout=15)
                assert process.returncode == 0, error
                # Multiple workers may observe the first429 together; the last line is the result.
                flooded = json.loads(output.strip().splitlines()[-1])
                assert result['other_client_during_flood'] == 200, 'Client B shares A rate bucket'
            finally:
                if process.poll() is None:
                    process.kill();process.wait()
            forged = json.loads(docker('exec', a, 'python', '-c', flood, 'gateway', 'yes'))
            assert forged.count(429) > 10, 'Forged forwarding headers bypass gateway rate limit'
            direct = json.loads(docker('exec', a, 'python', '-c', flood, 'frontend', 'yes'))
            assert direct.count(429) > 10, 'Direct untrusted client controls real-IP bucket'
            csp = next((v for k, v in headers.items() if k.lower() == 'content-security-policy'), '')
            connect = next((part for part in csp.split(';') if part.strip().startswith('connect-src ')), '')
            assert 'https://auth.govcenter.co' in connect.split(), 'Gov session endpoint blocked by production CSP'
            assert "default-src 'self'" in csp and "frame-ancestors 'none'" in csp
            result.update(flood_limited=flooded.count(429), forged_limited=forged.count(429),
                          direct_forgery_limited=direct.count(429), gov_csp_allowed=True)
            print(json.dumps(result))
        finally:
            for name in reversed(names):
                subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(['docker', 'network', 'rm', network], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == '__main__':
    main()
