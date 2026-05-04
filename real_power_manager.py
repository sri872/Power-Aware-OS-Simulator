import psutil
import time
import os
import signal
import subprocess

# We only target specific known resource-heavy background tasks to ensure we don't freeze the system
TARGET_KEYWORDS = ['Chrome', 'Helper', 'Spotify', 'Slack', 'Discord', 'Code', 'Electron', 'node']

# NEVER touch these, even if they match keywords
WHITELIST = [
    'kernel_task', 'WindowServer', 'launchd', 'Terminal', 'bash', 'zsh', 'python3', 
    'Python', 'Activity Monitor', 'sysmond', 'loginwindow', 'Finder', 'Dock', 'Antigravity'
]

suspended_pids = set()

def get_battery_status():
    try:
        output = subprocess.check_output(['pmset', '-g', 'batt']).decode('utf-8')
        plugged = "discharging" not in output.lower()
        import re
        match = re.search(r'(\d+)%', output)
        percent = int(match.group(1)) if match else 100
        return percent, plugged
    except Exception:
        return 100, True

def find_target_processes(current_user):
    targets = []
    for proc in psutil.process_iter(['pid', 'name', 'username', 'status']):
        try:
            pinfo = proc.info
            name = pinfo.get('name') or ''
            
            # Check if it belongs to current user and is not whitelisted
            is_whitelisted = any(w.lower() in name.lower() for w in WHITELIST)
            if pinfo.get('username') == current_user and not is_whitelisted and pinfo.get('status') != psutil.STATUS_STOPPED:
                # Is it a target background task?
                is_target = any(keyword.lower() in name.lower() for keyword in TARGET_KEYWORDS)
                
                if is_target:
                    targets.append(proc)
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    return targets

def manage_power():
    print("\n" + "="*50)
    print("🔋 REAL-LIFE POWER-AWARE CPU SCHEDULER")
    print("="*50)
    print("This script will monitor your actual CPU load and Battery.")
    print("When CPU load is HIGH, it will send SIGSTOP (Energy-Sleep) to background apps.")
    print("When CPU load is LOW, it will send SIGCONT to wake them up.")
    print("Open 'Activity Monitor' to watch their CPU usage drop to 0%!\n")
    
    import pwd
    current_user = os.environ.get('USER') or pwd.getpwuid(os.getuid()).pw_name
    
    # Warm up cpu_percent
    psutil.cpu_percent(interval=0.2)
    
    try:
        while True:
            cpu_percent = psutil.cpu_percent(interval=0.2)
            batt_percent, is_plugged = get_battery_status()
            
            # Print Dashboard
            status_symbol = "🟢" if cpu_percent < 40 else ("🟡" if cpu_percent < 70 else "🔴")
            plug_symbol = "🔌" if is_plugged else "🔋"
            print(f"[{time.strftime('%H:%M:%S')}] {status_symbol} Sys Load: {cpu_percent}% | {plug_symbol} Battery: {batt_percent}% | 💤 Suspended Apps: {len(suspended_pids)}")
            
            # Power Saving Thresholds
            throttle_needed = cpu_percent > 50 or (not is_plugged and batt_percent < 30)
            wake_needed = cpu_percent < 30 and (is_plugged or batt_percent > 30)
            
            if throttle_needed:
                targets = find_target_processes(current_user)
                for proc in targets:
                    pid = proc.info['pid']
                    name = proc.info['name']
                    
                    if pid not in suspended_pids:
                        # Suspend the process
                        try:
                            os.kill(pid, signal.SIGSTOP)
                            suspended_pids.add(pid)
                            print(f"   🛑 FORCE SLEEP: {name} (PID: {pid}) suspended to save power.")
                            
                            # Limit how many we suspend per tick so we don't freeze everything at once
                            if len(suspended_pids) >= 50: 
                                break
                        except ProcessLookupError:
                            pass

            elif wake_needed and suspended_pids:
                # Wake up 10 apps at a time to slowly ramp up
                pids_to_wake = list(suspended_pids)[:10]
                for pid in pids_to_wake:
                    try:
                        proc = psutil.Process(pid)
                        print(f"   ▶️ RESUMING: {proc.name()} (PID: {pid}) restored to active state.")
                        os.kill(pid, signal.SIGCONT)
                    except (psutil.NoSuchProcess, psutil.AccessDenied, ProcessLookupError):
                        pass
                    if pid in suspended_pids:
                        suspended_pids.remove(pid)
                    
            # Cleanup dead processes from our list
            for pid in list(suspended_pids):
                if not psutil.pid_exists(pid):
                    suspended_pids.remove(pid)
                    
    except KeyboardInterrupt:
        print("\n\nExiting Real-Life Power Manager...")
        print("Waking up all suspended processes to restore your system state...")
        for pid in list(suspended_pids):
            try:
                os.kill(pid, signal.SIGCONT)
                print(f" - Resumed PID {pid}")
            except Exception:
                pass
        print("Done. Goodbye!")

if __name__ == "__main__":
    manage_power()
