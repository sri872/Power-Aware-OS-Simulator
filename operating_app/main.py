import eel
import psutil
import time
import os
import signal
import threading
import sys

eel.init('web')

# Globals for the real power manager
suspended_pids = set()
running = False

TARGET_KEYWORDS = ['Chrome', 'Helper', 'Spotify', 'Slack', 'Discord', 'Code', 'Electron', 'node', 'app.py']
WHITELIST = [
    'kernel_task', 'WindowServer', 'launchd', 'Terminal', 'bash', 'zsh', 'python3', 
    'Python', 'Activity Monitor', 'sysmond', 'loginwindow', 'Finder', 'Dock', 'Antigravity'
]

def get_battery_status():
    try:
        import subprocess
        output = subprocess.check_output(['pmset', '-g', 'batt']).decode('utf-8')
        plugged = "discharging" not in output.lower()
        import re
        match = re.search(r'(\d+)%', output)
        percent = int(match.group(1)) if match else 100
        return percent, plugged
    except Exception:
        return 100, True

@eel.expose
def toggle_real_manager(start):
    global running
    running = start
    if not start:
        # Wake everything up on stop
        for pid in list(suspended_pids):
            try:
                os.kill(pid, signal.SIGCONT)
            except Exception:
                pass
        suspended_pids.clear()
        eel.update_real_processes([])()

def power_loop():
    global running
    import pwd
    current_user = os.environ.get('USER') or pwd.getpwuid(os.getuid()).pw_name
    
    last_ui_update = 0
    
    while True:
        if not running:
            time.sleep(1)
            continue
            
        cpu_percent = psutil.cpu_percent(interval=0.2)
        batt_percent, is_plugged = get_battery_status()
        
        throttle_needed = cpu_percent > 30 or (not is_plugged and batt_percent < 30)
        wake_needed = cpu_percent < 15 and (is_plugged or batt_percent > 30)
        
        current_time = time.time()
        needs_ui_update = (current_time - last_ui_update) >= 1.0
        needs_process_scan = throttle_needed or wake_needed or needs_ui_update
        
        if not needs_process_scan:
            eel.update_real_stats(cpu_percent, batt_percent, len(suspended_pids))()
            continue
            
        all_procs = []
        try:
            attrs = ['pid', 'name', 'username', 'status']
            if needs_ui_update:
                attrs.append('cpu_percent')
                
            for proc in psutil.process_iter(attrs):
                try:
                    all_procs.append(proc.info)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
        except Exception:
            pass
            
        if throttle_needed:
            for pinfo in all_procs:
                if pinfo.get('name') and pinfo.get('username') == current_user:
                    is_whitelisted = any(w.lower() in pinfo['name'].lower() for w in WHITELIST)
                    if not is_whitelisted and pinfo.get('status') != psutil.STATUS_STOPPED:
                        # Sleep it if it's a known target OR if it is actively causing the high load (>5% CPU)
                        is_target = any(k.lower() in pinfo['name'].lower() for k in TARGET_KEYWORDS)
                        is_heavy = pinfo.get('cpu_percent', 0) > 5.0
                        
                        if (is_target or is_heavy) and pinfo['pid'] not in suspended_pids:
                            try:
                                os.kill(pinfo['pid'], signal.SIGSTOP)
                                suspended_pids.add(pinfo['pid'])
                                if len(suspended_pids) >= 50: break
                            except Exception:
                                pass
        elif wake_needed and suspended_pids:
            pids_to_wake = list(suspended_pids)[:10]
            for pid in pids_to_wake:
                try:
                    os.kill(pid, signal.SIGCONT)
                except Exception:
                    pass
                if pid in suspended_pids:
                    suspended_pids.remove(pid)
        
        for pid in list(suspended_pids):
            if not psutil.pid_exists(pid):
                suspended_pids.remove(pid)
                
        if needs_ui_update:
            last_ui_update = current_time
            proc_list = []
            try:
                sorted_procs = sorted([p for p in all_procs if p.get('cpu_percent') is not None], key=lambda x: x['cpu_percent'], reverse=True)
                
                for pinfo in all_procs:
                    if pinfo['pid'] in suspended_pids or pinfo.get('status') == psutil.STATUS_STOPPED:
                        if pinfo['pid'] not in suspended_pids:
                            suspended_pids.add(pinfo['pid'])
                        name = pinfo.get('name') or "Unknown"
                        proc_list.append({'pid': pinfo['pid'], 'name': name, 'state': 'Energy-Sleep', 'cpuPercent': 0, 'energyUsed': 0})
                
                for pinfo in sorted_procs:
                    if pinfo['pid'] not in suspended_pids and len(proc_list) < 20:
                        name = pinfo.get('name') or "Unknown"
                        proc_list.append({'pid': pinfo['pid'], 'name': name, 'state': 'Running', 'cpuPercent': round(pinfo['cpu_percent'], 1), 'energyUsed': 0})
            except Exception as e:
                print("Error rendering table:", e)
                    
            proc_list.sort(key=lambda x: (x['state'] == 'Energy-Sleep', x['cpuPercent']), reverse=True)
            eel.update_real_stats(cpu_percent, batt_percent, len(suspended_pids))()
            eel.update_real_processes(proc_list[:20])()
        else:
            eel.update_real_stats(cpu_percent, batt_percent, len(suspended_pids))()

# Start background thread
threading.Thread(target=power_loop, daemon=True).start()

eel.start('index.html', size=(1000, 700), port=0)
