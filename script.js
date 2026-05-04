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
    tick: 0,
    speed: 1, // multiplier
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
    mode: 'balanced', // performance, balanced, powersaver
    currentFreqIdx: 2, // starts at 1.2GHz
    cpuLoadHistory: [0, 0, 0, 0, 0],
    totalEnergy: 0,
    throttleEvents: 0,
    history: { time: [], power: [], temp: [] }
};

let chart;
let intervalId = null;

// Initialize
function init() {
    initChart();
    generateProcesses(10);
    updateUI();
}

function initChart() {
    const ctx = document.getElementById('powerChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Power (W)',
                data: [],
                borderColor: '#58a6ff',
                backgroundColor: 'rgba(88, 166, 255, 0.1)',
                fill: true,
                borderWidth: 2,
                tension: 0.3,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: { min: 0, max: 20, grid: { color: '#30363d' }, ticks: { color: '#8b949e' } }
            },
            animation: false
        }
    });
}

function generateProcesses(count) {
    const names = ["chrome.exe", "vscode", "node", "python", "docker", "systemd", "spotify", "slack", "zoom", "terminal", "java", "mysqld", "bash", "nginx", "redis-server"];
    const priorities = ["low", "medium", "high"];
    state.processes = [];
    for(let i=0; i<count; i++) {
        state.processes.push({
            pid: 1000 + i,
            name: names[i % names.length] + (i >= names.length ? i : ''),
            burstTime: Math.floor(Math.random() * 500) + 100,
            remainingTime: 0,
            priority: priorities[Math.floor(Math.random() * priorities.length)],
            state: 'Ready',
            energyUsed: 0,
            waitingTime: 0,
            cpuPercent: 0
        });
        state.processes[i].remainingTime = state.processes[i].burstTime;
    }
}

// Logic loops
function startSimulation() {
    if(state.isRunning) return;
    state.isRunning = true;
    intervalId = setInterval(tick, 1000 / (10 * state.speed));
    document.getElementById('startBtn').innerText = "Pause";
    document.getElementById('startBtn').style.backgroundColor = "var(--warning-color)";
    document.getElementById('startBtn').style.color = "#000";
}

function pauseSimulation() {
    state.isRunning = false;
    clearInterval(intervalId);
    document.getElementById('startBtn').innerText = "Start";
    document.getElementById('startBtn').style.backgroundColor = "#238636";
    document.getElementById('startBtn').style.color = "#fff";
}

function toggleSimulation() {
    if(state.isRunning) pauseSimulation();
    else startSimulation();
}

function resetSimulation() {
    pauseSimulation();
    state.tick = 0;
    state.temperature = 40;
    state.battery = parseFloat(document.getElementById('startBattery').value) || 100;
    state.totalEnergy = 0;
    state.throttleEvents = 0;
    state.history = { time: [], power: [], temp: [] };
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.update();
    generateProcesses(parseInt(document.getElementById('processCount').value) || 10);
    state.cores.forEach(c => { c.process = null; c.load = 0; c.parked = false; });
    updateUI();
}

function applySettings() {
    state.mode = document.getElementById('powerMode').value;
    state.speed = parseInt(document.getElementById('simSpeed').value);
    
    // Core parking logic for mode switch
    if(state.mode === 'powersaver') {
        state.cores[2].parked = true;
        state.cores[3].parked = true;
        state.currentFreqIdx = Math.min(state.currentFreqIdx, 1);
    } else if (state.mode === 'performance') {
        state.cores.forEach(c => c.parked = false);
        state.currentFreqIdx = FREQ_LEVELS.length - 1;
    } else {
        // Balanced
        state.cores.forEach(c => c.parked = false);
    }
    
    if(state.isRunning) {
        pauseSimulation();
        startSimulation();
    }
    updateUI();
}

function getPriorityWeight(p) {
    if(p === 'high') return 1.0;
    if(p === 'medium') return 0.6;
    return 0.2;
}

function tick() {
    state.tick++;
    
    let activeLoad = 0;
    let activeCores = 0;
    
    // 1 tick = 1ms simulated time
    
    // Process Execution & Release
    state.cores.forEach(core => {
        if(core.process) {
            let p = core.process;
            p.remainingTime -= 1;
            
            // Energy calculation in mW. 1W = 1000mW.
            // Power of core = Total Power / Active Cores
            let pwr = FREQ_LEVELS[state.currentFreqIdx].power;
            let activeCoresNum = state.cores.filter(c => !c.parked).length || 1;
            let energyMw = (pwr * 1000) / activeCoresNum; 
            
            p.energyUsed += energyMw; 
            state.totalEnergy += energyMw / 1000; // Total system energy in Joules
            
            if(p.remainingTime <= 0) {
                p.state = 'Terminated';
                p.cpuPercent = 0;
                core.process = null;
            }
        }
    });
    
    updateSystemState();

    // Assign processes to cores
    let readyProcesses = state.processes.filter(p => p.state === 'Ready' || p.state === 'Energy-Sleep' || p.state === 'Waiting' || p.state === 'New');
    
    if(state.mode === 'powersaver') {
        readyProcesses.forEach(p => {
            if(p.priority === 'low') p.state = 'Energy-Sleep';
        });
        readyProcesses = readyProcesses.filter(p => p.state !== 'Energy-Sleep');
    } else {
        readyProcesses.forEach(p => { if(p.state === 'Energy-Sleep') p.state = 'Ready'; });
    }

    readyProcesses.forEach(p => {
        let pWeight = getPriorityWeight(p.priority);
        let remInv = 1 / (p.remainingTime || 1);
        let energyCostInv = 1 / ((FREQ_LEVELS[state.currentFreqIdx].power) || 1);
        p.score = (pWeight * 0.4) + (remInv * 0.3) + (energyCostInv * 0.3);
    });
    
    readyProcesses.sort((a, b) => b.score - a.score);
    
    // Preempt running tasks in hybrid round-robin/priority (every 10 ticks = 10ms quantum)
    if(state.tick % 10 === 0) {
        state.cores.forEach(core => {
            if(core.process) {
                core.process.state = 'Ready';
                core.process.cpuPercent = 0;
                readyProcesses.push(core.process);
                core.process = null;
            }
        });
        readyProcesses.sort((a, b) => b.score - a.score);
    }
    
    state.cores.forEach(core => {
        if(core.parked) {
            core.process = null;
            core.load = 0;
            return;
        }
        
        if(!core.process && readyProcesses.length > 0) {
            let p = readyProcesses.shift();
            p.state = 'Running';
            p.cpuPercent = Math.floor(100 / (state.cores.filter(c => !c.parked).length || 1));
            core.process = p;
        }
        
        if(core.process) {
            core.load = Math.min(100, core.load + 15);
            activeLoad += core.load;
            activeCores++;
        } else {
            core.load = Math.max(0, core.load - 5);
        }
    });

    let avgLoad = activeCores > 0 ? activeLoad / activeCores : 0;
    
    state.cpuLoadHistory.shift();
    state.cpuLoadHistory.push(avgLoad);
    
    state.processes.filter(p => p.state === 'Ready').forEach(p => p.waitingTime++);
    
    updateUI();
    
    if(state.tick % 5 === 0) {
        updateChart();
    }
    
    if(state.processes.every(p => p.state === 'Terminated')) {
        pauseSimulation();
        showSummary();
    }
}

function updateSystemState() {
    let avgLoad = state.cpuLoadHistory.reduce((a,b)=>a+b,0) / 5;
    
    // DVFS Engine
    if(state.mode !== 'performance') {
        if(state.tick % 10 === 0) {
            if(avgLoad < 30 && state.currentFreqIdx > 0) {
                state.currentFreqIdx--;
            } else if(avgLoad > 80 && state.currentFreqIdx < FREQ_LEVELS.length - 1) {
                state.currentFreqIdx++;
            }
        }
    }
    
    if(state.mode === 'powersaver') {
        state.currentFreqIdx = Math.min(state.currentFreqIdx, 1);
    }
    
    let activeCores = state.cores.filter(c => !c.parked).length;
    let powerDraw = FREQ_LEVELS[state.currentFreqIdx].power * (activeCores / 4);
    
    // Add base power
    powerDraw += 1.0; 
    
    // Battery Drain: powerDraw (W) = Joules/sec. 1 tick = 1ms, so powerDraw/1000 Joules.
    // Assuming battery is 50,000 Joules total (to make it drain visibly over time)
    state.battery -= (powerDraw / 50000); 
    if(state.battery <= 0) {
        state.battery = 0;
        pauseSimulation();
        alert("Battery depleted!");
    }
    
    // Thermal Engine
    if(powerDraw > 8) {
        state.temperature += 0.05 * (powerDraw / 10);
    } else {
        state.temperature -= 0.05;
    }
    state.temperature = Math.max(30, Math.min(100, state.temperature));
    
    // Thermal Throttling
    if(state.temperature > 75 && state.mode !== 'performance') {
        if(state.currentFreqIdx > 0) {
            state.currentFreqIdx--;
            state.throttleEvents++;
            console.log("Thermal Throttle Event!");
        }
        if(state.temperature > 80) {
            // Critical
            if(!state.cores[2].parked) state.cores[2].parked = true;
            if(!state.cores[3].parked) state.cores[3].parked = true;
        }
    } else {
        if(state.mode === 'powersaver') {
            state.cores[2].parked = true;
            state.cores[3].parked = true;
        } else if(state.mode === 'balanced') {
            if(avgLoad > 60) {
                state.cores.forEach(c => c.parked = false);
            } else if (avgLoad < 20) {
                state.cores[3].parked = true;
            }
        } else {
            state.cores.forEach(c => c.parked = false);
        }
    }
    
    // Power Budget Manager
    if(powerDraw > state.budget) {
        state.cores[3].parked = true; // Park core to save power immediately
        if(state.currentFreqIdx > 0) state.currentFreqIdx--;
    }
}

function getThermalClass(temp) {
    if(temp < 55) return 'state-Running'; 
    if(temp < 70) return 'state-Ready'; 
    if(temp < 80) return 'state-Waiting'; 
    return 'btn-danger'; 
}

function updateUI() {
    document.getElementById('sysTemp').innerText = state.temperature.toFixed(1) + '°C';
    document.getElementById('sysTemp').className = 'stat-value ' + getThermalClass(state.temperature);
    
    document.getElementById('sysBattery').innerText = state.battery.toFixed(2) + '%';
    
    let f = FREQ_LEVELS[state.currentFreqIdx];
    document.getElementById('sysFreq').innerText = (f.freq >= 1000 ? (f.freq/1000).toFixed(1) + ' GHz' : f.freq + ' MHz') + ' (' + f.v + 'V)';
    
    let activeCoresNum = state.cores.filter(c => !c.parked).length;
    let powerDraw = (f.power * (activeCoresNum / 4)) + 1.0;
    document.getElementById('sysPower').innerText = powerDraw.toFixed(1) + ' W';
    
    state.cores.forEach((core, i) => {
        let bar = document.getElementById(`core${i}Bar`);
        let val = document.getElementById(`core${i}Val`);
        if(core.parked) {
            bar.style.width = '0%';
            bar.style.backgroundColor = 'transparent';
            val.innerText = 'Parked';
            val.style.color = 'var(--text-secondary)';
        } else {
            bar.style.width = core.load + '%';
            bar.style.backgroundColor = (core.load > 80 ? 'var(--danger-color)' : (core.load > 50 ? 'var(--warning-color)' : 'var(--success-color)'));
            val.innerText = Math.round(core.load) + '%';
            val.style.color = 'var(--text-primary)';
        }
    });
    
    let tbody = document.getElementById('processTable');
    tbody.innerHTML = '';
    state.processes.forEach(p => {
        let tr = document.createElement('tr');
        let memory = p.state === 'Terminated' ? '0 MB' : (Math.floor(Math.random() * 50) + 10) + ' MB'; // fake dynamic memory
        tr.innerHTML = `
            <td>${p.pid}</td>
            <td>${p.name}</td>
            <td>${p.priority}</td>
            <td>${p.cpuPercent}%</td>
            <td><span class="badge state-${p.state}">${p.state}</span></td>
            <td>${(p.energyUsed).toFixed(0)} mW</td>
        `;
        tbody.appendChild(tr);
    });
}

function updateChart() {
    let f = FREQ_LEVELS[state.currentFreqIdx];
    let activeCoresNum = state.cores.filter(c => !c.parked).length;
    let powerDraw = (f.power * (activeCoresNum / 4)) + 1.0;
    
    state.history.time.push(state.tick);
    state.history.power.push(powerDraw);
    
    if(state.history.time.length > 50) {
        state.history.time.shift();
        state.history.power.shift();
    }
    
    chart.data.labels = state.history.time;
    chart.data.datasets[0].data = state.history.power;
    chart.update();
}

function showSummary() {
    let totalWait = state.processes.reduce((a,b)=>a+b.waitingTime, 0);
    let avgWait = totalWait / state.processes.length;
    alert(`Simulation Complete!\n\nTotal Energy Consumed: ${state.totalEnergy.toFixed(2)} Joules\nThermal Throttle Events: ${state.throttleEvents}\nBattery Remaining: ${state.battery.toFixed(2)}%\nAverage Process Wait Time: ${avgWait.toFixed(1)} ms`);
}

window.onload = init;
