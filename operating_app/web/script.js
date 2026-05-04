// Constants & Settings
const FREQ_LEVELS = [
    { freq: 400, v: 0.8, power: 2 },
    { freq: 800, v: 0.9, power: 4 },
    { freq: 1200, v: 1.0, power: 6 },
    { freq: 1800, v: 1.1, power: 10 },
    { freq: 2400, v: 1.2, power: 15 }
];

let state = {
    isRunning: false,
    mode: 'simulated', // or 'real'
    tick: 0,
    speed: 1,
    processes: [],
    cores: [
        { id: 0, active: true, parked: false, process: null, load: 0, power: 0 },
        { id: 1, active: true, parked: false, process: null, load: 0, power: 0 },
        { id: 2, active: true, parked: false, process: null, load: 0, power: 0 },
        { id: 3, active: true, parked: false, process: null, load: 0, power: 0 }
    ],
    temperature: 40,
    battery: 100,
    budget: 15,
    powerMode: 'balanced',
    currentFreqIdx: 2,
    cpuLoadHistory: [0, 0, 0, 0, 0],
    totalEnergy: 0,
    history: { time: [], power: [] }
};

let chart;
let intervalId = null;

function init() {
    initChart();
    generateProcesses(10);
    updateUI();
}

function initChart() {
    const ctx = document.getElementById('powerChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Power/Load', data: [], borderColor: '#58a6ff', backgroundColor: 'rgba(88, 166, 255, 0.1)', fill: true, tension: 0.3, pointRadius: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { min: 0, max: 20, grid: { color: '#30363d' }, ticks: { color: '#8b949e' } } }, animation: false }
    });
}

function toggleRunMode() {
    state.mode = document.getElementById('runMode').value;
    resetSimulation();
    if(state.mode === 'real') {
        document.getElementById('sysTemp').innerText = "Load: 0%";
        document.getElementById('sysFreq').innerText = "Monitoring...";
        document.getElementById('sysPower').innerText = "0 Apps Suspended";
        chart.options.scales.y.max = 100; // Change to 100% for load
    } else {
        chart.options.scales.y.max = 20; // Change back to 20W
        updateUI();
    }
}

function startSimulation() {
    if(state.isRunning) return;
    state.isRunning = true;
    
    if(state.mode === 'simulated') {
        intervalId = setInterval(tick, 100);
    } else {
        eel.toggle_real_manager(true)();
    }
    
    document.getElementById('startBtn').innerText = "Stop / Pause";
    document.getElementById('startBtn').style.backgroundColor = "var(--danger-color)";
    document.getElementById('startBtn').style.color = "#fff";
}

function pauseSimulation() {
    state.isRunning = false;
    if(state.mode === 'simulated') {
        clearInterval(intervalId);
    } else {
        eel.toggle_real_manager(false)();
    }
    
    document.getElementById('startBtn').innerText = "Start";
    document.getElementById('startBtn').style.backgroundColor = "#238636";
}

function toggleSimulation() {
    if(state.isRunning) pauseSimulation();
    else startSimulation();
}

function resetSimulation() {
    pauseSimulation();
    state.tick = 0;
    state.temperature = 40;
    state.history = { time: [], power: [] };
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.update();
    if(state.mode === 'simulated') generateProcesses(10);
    updateUI();
}

// ==== SIMULATED LOGIC ====
function generateProcesses(count) {
    const names = ["chrome.exe", "vscode", "node", "python", "docker", "systemd", "spotify", "slack", "zoom", "terminal"];
    state.processes = [];
    for(let i=0; i<count; i++) {
        state.processes.push({
            pid: 1000 + i, name: names[i % names.length], remainingTime: Math.floor(Math.random() * 500) + 100, priority: 'medium', state: 'Ready', cpuPercent: 0
        });
    }
}

function tick() {
    state.tick++;
    // Simple simulated tick logic just to keep the visual moving
    let activeLoad = 0;
    
    state.cores.forEach(core => {
        if(core.process) {
            core.process.remainingTime--;
            if(core.process.remainingTime <= 0) { core.process.state = 'Terminated'; core.process.cpuPercent = 0; core.process = null; }
        }
    });
    
    let ready = state.processes.filter(p => p.state === 'Ready');
    state.cores.forEach(core => {
        if(!core.process && ready.length > 0) {
            let p = ready.shift();
            p.state = 'Running';
            p.cpuPercent = 25;
            core.process = p;
        }
        if(core.process) core.load = Math.min(100, core.load + 15);
        else core.load = Math.max(0, core.load - 5);
        activeLoad += core.load;
    });

    state.temperature += activeLoad > 200 ? 0.1 : -0.1;
    state.temperature = Math.max(30, state.temperature);
    
    updateUI();
    if(state.tick % 5 === 0) updateChart(activeLoad/4);
}

function updateUI() {
    if(state.mode === 'real') return;
    document.getElementById('sysTemp').innerText = state.temperature.toFixed(1) + '°C';
    let f = FREQ_LEVELS[state.currentFreqIdx];
    document.getElementById('sysFreq').innerText = f.freq + ' MHz';
    document.getElementById('sysPower').innerText = f.power + ' W';
    
    state.cores.forEach((core, i) => {
        let bar = document.getElementById(`core${i}Bar`);
        bar.style.width = core.load + '%';
        bar.style.backgroundColor = (core.load > 80 ? 'var(--danger-color)' : 'var(--success-color)');
        document.getElementById(`core${i}Val`).innerText = Math.round(core.load) + '%';
    });
    
    renderTable(state.processes);
}

function updateChart(val) {
    state.history.time.push(state.tick);
    state.history.power.push(val);
    if(state.history.time.length > 50) { state.history.time.shift(); state.history.power.shift(); }
    chart.data.labels = state.history.time;
    chart.data.datasets[0].data = state.history.power;
    chart.update();
}

function renderTable(processes) {
    let tbody = document.getElementById('processTable');
    tbody.innerHTML = '';
    processes.forEach(p => {
        let tr = document.createElement('tr');
        tr.innerHTML = `<td>${p.pid}</td><td>${p.name}</td><td>${p.cpuPercent}%</td><td><span class="badge state-${p.state}">${p.state}</span></td>`;
        tbody.appendChild(tr);
    });
}

// ==== REAL DEPLOYMENT LOGIC (Called from Python via Eel) ====
eel.expose(update_real_stats);
function update_real_stats(cpu_percent, batt_percent, suspended_count) {
    if(state.mode !== 'real') return;
    state.tick++;
    document.getElementById('sysTemp').innerText = "Sys Load: " + cpu_percent + "%";
    document.getElementById('sysBattery').innerText = batt_percent + "%";
    document.getElementById('sysPower').innerText = suspended_count + " Apps Sleeping";
    document.getElementById('sysFreq').innerText = suspended_count > 0 ? "Throttling Apps" : "All Apps Active";
    
    // Animate fake cores to match sys load
    state.cores.forEach((core, i) => {
        let load = Math.min(100, Math.max(0, cpu_percent + (Math.random() * 20 - 10)));
        document.getElementById(`core${i}Bar`).style.width = load + '%';
        document.getElementById(`core${i}Val`).innerText = Math.round(load) + '%';
        document.getElementById(`core${i}Bar`).style.backgroundColor = load > 50 ? 'var(--danger-color)' : 'var(--success-color)';
    });
    
    updateChart(cpu_percent);
}

eel.expose(update_real_processes);
function update_real_processes(processes) {
    if(state.mode !== 'real') return;
    renderTable(processes);
}

window.onload = init;
