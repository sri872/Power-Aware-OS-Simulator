import subprocess
try:
    proc_list = []
    ps_output = subprocess.check_output(['ps', '-e', '-r', '-o', 'pid,pcpu,comm']).decode('utf-8').splitlines()[1:20]
    for line in ps_output:
        parts = line.strip().split(None, 2)
        if len(parts) >= 3:
            pid = int(parts[0])
            cpu = float(parts[1])
            name = parts[2].split('/')[-1]
            proc_list.append({'pid': pid, 'name': name, 'state': 'Running', 'cpuPercent': cpu, 'energyUsed': 0})
    print(proc_list)
except Exception as e:
    import traceback
    traceback.print_exc()
