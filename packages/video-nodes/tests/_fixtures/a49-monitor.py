"""External HTTP and /proc observer. Does not share the render event loop."""
import concurrent.futures
import http.client
import json
import os
import signal
from pathlib import Path
import subprocess
import sys
import time

report = Path(sys.argv[1])
command = sys.argv[2:]
while int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))) < 8 * 1024 * 1024:
    time.sleep(10)
log = report.with_suffix('.log').open('w')
process = subprocess.Popen(command, stdout=log, stderr=log)
samples = {'baseline': [], 'render': []}
threads = []
thread_names = {}
rss_samples = []
loads = []
errors = []
memory_floor_hit = False

def request(port, phase):
    start = time.monotonic()
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=30)
    try:
        connection.request('GET', '/api/health')
        response = connection.getresponse()
        body = json.loads(response.read())
        assert response.status == 200 and 'version' in body
        samples[phase].append((time.monotonic() - start) * 1000)
    except Exception as error:
        errors.append(str(error))
    finally:
        connection.close()

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    pending = []
    while process.poll() is None:
        try:
            state = json.loads(report.read_text())
            phase = state['phase']
            available = int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')))
            if available < 5 * 1024 * 1024:
                memory_floor_hit = True
                os.kill(state['pid'], signal.SIGTERM)
            if phase in samples:
                pending = [f for f in pending if not f.done()]
                if len(pending) < 4:
                    pending.append(pool.submit(request, state['port'], phase))
                if phase == 'render':
                    status = Path(f"/proc/{state['pid']}/status").read_text()
                    threads.append(int(next(line.split()[1] for line in status.splitlines() if line.startswith('Threads:'))))
                    loads.append(os.getloadavg()[0])
                    rss_samples.append(int(next(line.split()[1] for line in status.splitlines() if line.startswith('VmRSS:'))))
                    if len(threads) % 20 == 1:
                        for task in Path(f"/proc/{state['pid']}/task").glob('*/comm'):
                            name = task.read_text().strip()
                            thread_names[name] = thread_names.get(name, 0) + 1
        except (FileNotFoundError, json.JSONDecodeError, ProcessLookupError, StopIteration):
            pass
        time.sleep(0.05)

def stats(values):
    values = sorted(values)
    return {'n': len(values), 'p50': values[int((len(values)-1)*.5)], 'p95': values[int((len(values)-1)*.95)], 'max': max(values)} if values else None
result = {'exit': process.returncode, 'memoryFloorHit': memory_floor_hit, 'http': {k: stats(v) for k,v in samples.items()},
          'httpErrors': errors, 'threadNamesSamples': thread_names, 'rssKiB': stats(rss_samples), 'threads': stats(threads), 'loadRange': [min(loads), max(loads)] if loads else None}
report.with_suffix('.observer.json').write_text(json.dumps(result))
print(report.name, json.dumps(result), flush=True)
sys.exit(process.returncode)
