import { Controller, Get, Header, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { TaskService } from '../task/task.service';
import { PlcStatusService } from './plc-status.service';

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WCS — PLC Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #f0f4f8;
      color: #1a202c;
      min-height: 100vh;
      padding: 28px 32px;
    }
    header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 28px;
      border-bottom: 1px solid #cbd5e0;
      padding-bottom: 16px;
    }
    header h1 { font-size: 1.4rem; font-weight: 700; letter-spacing: .04em; color: #2b6cb0; }
    #ts { font-size: .8rem; color: #718096; font-variant-numeric: tabular-nums; }

    .status-bar {
      display: flex;
      gap: 24px;
      align-items: center;
      background: #ffffff;
      border: 1px solid #cbd5e0;
      border-radius: 10px;
      padding: 14px 20px;
      margin-bottom: 28px;
      flex-wrap: wrap;
      box-shadow: 0 1px 4px rgba(0,0,0,.06);
    }
    .status-item { display: flex; flex-direction: column; gap: 2px; }
    .status-item .label { font-size: .7rem; text-transform: uppercase; letter-spacing: .08em; color: #718096; }
    .status-item .value { font-size: 1rem; font-weight: 600; font-variant-numeric: tabular-nums; }
    .conn-ok  { color: #276749; }
    .conn-err { color: #c53030; }
    .task-state { color: #c05621; font-size: 1.05rem; }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 680px) { .grid { grid-template-columns: 1fr; } }

    .card {
      background: #ffffff;
      border: 1px solid #cbd5e0;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,.06);
    }
    .card-header {
      padding: 12px 18px;
      background: #edf2f7;
      font-size: .75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .1em;
      color: #4a5568;
    }
    .signal-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 11px 18px;
      border-bottom: 1px solid #e2e8f0;
      gap: 12px;
    }
    .signal-row:last-child { border-bottom: none; }
    .signal-label { font-size: .85rem; color: #2d3748; }
    .signal-addr  { font-size: .72rem; color: #718096; font-variant-numeric: tabular-nums; }
    .led-wrap { display: flex; align-items: center; gap: 8px; }
    .led {
      width: 16px; height: 16px;
      border-radius: 50%;
      flex-shrink: 0;
      transition: background .15s, box-shadow .15s;
    }
    .led.on  { background: #38a169; box-shadow: 0 0 8px 2px #38a16966; }
    .led.off { background: #cbd5e0; box-shadow: none; }
    .led-text { font-size: .75rem; font-variant-numeric: tabular-nums; min-width: 24px; text-align: right; }
    .led-text.on  { color: #276749; }
    .led-text.off { color: #a0aec0; }

    .flow-section {
      margin-top: 28px;
      background: #ffffff;
      border: 1px solid #cbd5e0;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,.06);
    }
    .flow-header {
      padding: 12px 18px;
      background: #edf2f7;
      font-size: .75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .1em;
      color: #4a5568;
    }
    .flow-steps {
      display: flex;
      align-items: center;
      padding: 18px 20px;
      overflow-x: auto;
      gap: 0;
    }
    .step {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      min-width: 100px;
    }
    .step-dot {
      width: 36px; height: 36px;
      border-radius: 50%;
      border: 2px solid #cbd5e0;
      display: flex; align-items: center; justify-content: center;
      font-size: .8rem;
      font-weight: 700;
      color: #a0aec0;
      background: #f7fafc;
      transition: all .2s;
      flex-shrink: 0;
    }
    .step-dot.active {
      border-color: #dd6b20;
      color: #c05621;
      background: #fffaf0;
      box-shadow: 0 0 12px 2px #dd6b2033;
    }
    .step-dot.done {
      border-color: #38a169;
      color: #276749;
      background: #f0fff4;
    }
    .step-name { font-size: .65rem; text-align: center; color: #718096; max-width: 90px; line-height: 1.3; }
    .step-name.active { color: #c05621; }
    .step-name.done   { color: #276749; }
    .step-arrow { color: #cbd5e0; font-size: 1.1rem; padding: 0 4px; flex-shrink: 0; }

    footer { margin-top: 28px; font-size: .72rem; color: #a0aec0; text-align: center; }

    .btn-reset {
      background: #fff5f5;
      color: #c53030;
      border: 1px solid #feb2b2;
      border-radius: 6px;
      padding: 8px 16px;
      font-size: .82rem;
      font-weight: 600;
      cursor: pointer;
      transition: background .15s, transform .1s;
      white-space: nowrap;
    }
    .btn-reset:hover  { background: #fed7d7; }
    .btn-reset:active { transform: scale(.97); }
    .btn-reset:disabled { opacity: .45; cursor: not-allowed; }
    #resetMsg {
      margin-top: 5px;
      font-size: .72rem;
      min-height: 16px;
      text-align: right;
    }
    #resetMsg.ok  { color: #276749; }
    #resetMsg.err { color: #c53030; }

    #modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.35);
      backdrop-filter: blur(3px);
      z-index: 100;
      align-items: center;
      justify-content: center;
    }
    #modal-overlay.open { display: flex; }
    #modal {
      background: #ffffff;
      border: 1px solid #feb2b2;
      border-radius: 12px;
      padding: 28px 28px 22px;
      max-width: 420px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0,0,0,.15);
    }
    #modal-title {
      font-size: 1rem;
      font-weight: 700;
      color: #c53030;
      margin-bottom: 14px;
      letter-spacing: .02em;
    }
    #modal-body {
      font-size: .85rem;
      color: #4a5568;
      line-height: 1.6;
      margin-bottom: 22px;
    }
    #modal-body strong { color: #c05621; }
    #modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    #modal-cancel {
      background: #edf2f7;
      color: #2d3748;
      border: 1px solid #cbd5e0;
      border-radius: 6px;
      padding: 9px 20px;
      font-size: .85rem;
      font-weight: 600;
      cursor: pointer;
      transition: background .15s;
    }
    #modal-cancel:hover { background: #e2e8f0; }
    #modal-confirm {
      background: #fff5f5;
      color: #c53030;
      border: 1px solid #feb2b2;
      border-radius: 6px;
      padding: 9px 20px;
      font-size: .85rem;
      font-weight: 600;
      cursor: pointer;
      transition: background .15s;
    }
    #modal-confirm:hover { background: #fed7d7; }
    #modal-cancel:disabled, #modal-confirm:disabled { opacity: .45; cursor: not-allowed; }
  </style>
</head>
<body>
  <header>
    <h1>WCS — PLC Dashboard</h1>
    <span id="ts">Connecting...</span>
  </header>

  <div class="status-bar">
    <div class="status-item">
      <span class="label">PLC Connection</span>
      <span class="value" id="conn">--</span>
    </div>
    <div class="status-item">
      <span class="label">Task State</span>
      <span class="value task-state" id="taskState">--</span>
    </div>
    <div class="status-item">
      <span class="label">PLC Address</span>
      <span class="value" id="plcAddr">--</span>
    </div>
    <div style="margin-left:auto;display:flex;flex-direction:column;align-items:flex-end">
      <button class="btn-reset" id="btnReset" onclick="openResetModal()">Force Reset Task</button>
      <div id="resetMsg"></div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-header">Digital Inputs — PLC → WCS</div>
      <div class="signal-row">
        <div>
          <div class="signal-label">Request Pickup</div>
        </div>
        <div class="led-wrap">
          <div class="led off" id="di0"></div>
          <span class="led-text off" id="di0t">OFF</span>
        </div>
      </div>
      <div class="signal-row">
        <div>
          <div class="signal-label">Goods Loaded</div>
        </div>
        <div class="led-wrap">
          <div class="led off" id="di1"></div>
          <span class="led-text off" id="di1t">OFF</span>
        </div>
      </div>
      <div class="signal-row">
        <div>
          <div class="signal-label">Goods Unloaded</div>
        </div>
        <div class="led-wrap">
          <div class="led off" id="di2"></div>
          <span class="led-text off" id="di2t">OFF</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">Digital Outputs — WCS → PLC</div>
      <div class="signal-row">
        <div>
          <div class="signal-label">AGV Ready for Pickup</div>
        </div>
        <div class="led-wrap">
          <div class="led off" id="do0"></div>
          <span class="led-text off" id="do0t">OFF</span>
        </div>
      </div>
      <div class="signal-row">
        <div>
          <div class="signal-label">Request to Enter</div>
        </div>
        <div class="led-wrap">
          <div class="led off" id="do1"></div>
          <span class="led-text off" id="do1t">OFF</span>
        </div>
      </div>
      <div class="signal-row">
        <div>
          <div class="signal-label">AGV at Dock Waiting</div>
        </div>
        <div class="led-wrap">
          <div class="led off" id="do2"></div>
          <span class="led-text off" id="do2t">OFF</span>
        </div>
      </div>
      <div class="signal-row">
        <div>
          <div class="signal-label">Request to Exit</div>
        </div>
        <div class="led-wrap">
          <div class="led off" id="do3"></div>
          <span class="led-text off" id="do3t">OFF</span>
        </div>
      </div>
      <div class="signal-row">
        <div>
          <div class="signal-label">Task Complete</div>
        </div>
        <div class="led-wrap">
          <div class="led off" id="do4"></div>
          <span class="led-text off" id="do4t">OFF</span>
        </div>
      </div>
    </div>
  </div>

  <div class="flow-section">
    <div class="flow-header">Task Flow</div>
    <div class="flow-steps" id="flowSteps">
      <div class="step" data-states="IDLE,null"><div class="step-dot" id="s0">1</div><div class="step-name" id="s0n">IDLE</div></div>
      <div class="step-arrow">→</div>
      <div class="step" data-states="AGV_ENTERING"><div class="step-dot" id="s1">2</div><div class="step-name" id="s1n">AGV Entering</div></div>
      <div class="step-arrow">→</div>
      <div class="step" data-states="WAITING_FOR_PLC"><div class="step-dot" id="s2">3</div><div class="step-name" id="s2n">Waiting for PLC</div></div>
      <div class="step-arrow">→</div>
      <div class="step" data-states="AGV_EXITING"><div class="step-dot" id="s3">4</div><div class="step-name" id="s3n">AGV Exiting</div></div>
      <div class="step-arrow">→</div>
      <div class="step" data-states="AGV_AT_NOTIFICATION,AGV_TO_DESTINATION"><div class="step-dot" id="s4">5</div><div class="step-name" id="s4n">To Destination</div></div>
      <div class="step-arrow">→</div>
      <div class="step" data-states="AGV_AT_DESTINATION"><div class="step-dot" id="s5">6</div><div class="step-name" id="s5n">At Destination</div></div>
      <div class="step-arrow">→</div>
      <div class="step" data-states="COMPLETED"><div class="step-dot" id="s6">7</div><div class="step-name" id="s6n">Completed</div></div>
    </div>
  </div>

  <footer>Auto-refreshes every second · WCS Backend</footer>

  <div id="modal-overlay">
    <div id="modal">
      <div id="modal-title">Force Reset Task</div>
      <p id="modal-body">
        This will immediately clear the current task and turn OFF all DO coils.<br><br>
        Current state: <strong id="modal-state">--</strong><br><br>
        Use only when the AGV has been manually moved or RCS has already cancelled the task.
      </p>
      <div id="modal-actions">
        <button id="modal-cancel" onclick="closeModal()">Cancel</button>
        <button id="modal-confirm" onclick="confirmReset()">Confirm Reset</button>
      </div>
    </div>
  </div>

  <script>
    const STATE_ORDER = [
      ['IDLE', null],
      ['AGV_ENTERING'],
      ['WAITING_FOR_PLC'],
      ['AGV_EXITING'],
      ['AGV_AT_NOTIFICATION', 'AGV_TO_DESTINATION'],
      ['AGV_AT_DESTINATION'],
      ['COMPLETED'],
    ];

    function setLed(id, on) {
      const led  = document.getElementById(id);
      const text = document.getElementById(id + 't');
      led.className  = 'led ' + (on ? 'on' : 'off');
      text.className = 'led-text ' + (on ? 'on' : 'off');
      text.textContent = on ? 'ON' : 'OFF';
    }

    function updateFlow(state) {
      const norm = state ?? null;
      let activeIdx = -1;
      STATE_ORDER.forEach((states, idx) => {
        if (states.includes(norm)) activeIdx = idx;
      });
      STATE_ORDER.forEach((_, idx) => {
        const dot  = document.getElementById('s' + idx);
        const name = document.getElementById('s' + idx + 'n');
        dot.className  = 'step-dot'  + (idx === activeIdx ? ' active' : idx < activeIdx ? ' done' : '');
        name.className = 'step-name' + (idx === activeIdx ? ' active' : idx < activeIdx ? ' done' : '');
      });
    }

    let errorCount = 0;
    async function refresh() {
      try {
        const r = await fetch('/plc/status');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        errorCount = 0;

        document.getElementById('ts').textContent =
          'Last updated: ' + new Date(d.timestamp).toLocaleTimeString();
        document.getElementById('plcAddr').textContent =
          d.host + ':' + d.port;
        document.getElementById('taskState').textContent =
          d.taskState ?? 'IDLE';

        const connEl = document.getElementById('conn');
        if (d.connected) {
          connEl.textContent = '● Connected';
          connEl.className = 'value conn-ok';
        } else {
          connEl.textContent = '● Disconnected';
          connEl.className = 'value conn-err';
        }

        [0, 1, 2].forEach(i => setLed('di' + i, !!(d.di && d.di[i])));
        [0, 1, 2, 3, 4].forEach(i => setLed('do' + i, !!(d.do && d.do[i])));
        updateFlow(d.taskState);
      } catch (e) {
        errorCount++;
        if (errorCount >= 3) {
          document.getElementById('conn').textContent = '● Unreachable';
          document.getElementById('conn').className = 'value conn-err';
          document.getElementById('ts').textContent = 'Connection lost — retrying...';
        }
      }
    }

    refresh();
    setInterval(refresh, 1000);

    function openResetModal() {
      const state = document.getElementById('taskState').textContent || 'IDLE';
      document.getElementById('modal-state').textContent = state;
      document.getElementById('modal-cancel').disabled = false;
      document.getElementById('modal-confirm').disabled = false;
      document.getElementById('modal-overlay').classList.add('open');
    }

    function closeModal() {
      document.getElementById('modal-overlay').classList.remove('open');
    }

    async function confirmReset() {
      const cancelBtn  = document.getElementById('modal-cancel');
      const confirmBtn = document.getElementById('modal-confirm');
      const msg        = document.getElementById('resetMsg');
      cancelBtn.disabled  = true;
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Resetting...';
      try {
        const r = await fetch('/plc/force-reset', { method: 'POST' });
        const d = await r.json();
        closeModal();
        if (r.ok && d.cleared) {
          msg.textContent = 'Reset complete. Was: ' + (d.prevState ?? 'none');
          msg.className = 'ok';
        } else {
          msg.textContent = 'Reset failed: ' + JSON.stringify(d);
          msg.className = 'err';
        }
      } catch (e) {
        closeModal();
        msg.textContent = 'Request error: ' + e.message;
        msg.className = 'err';
      } finally {
        confirmBtn.textContent = 'Confirm Reset';
        cancelBtn.disabled  = false;
        confirmBtn.disabled = false;
        setTimeout(() => { msg.textContent = ''; msg.className = ''; }, 6000);
      }
    }

    document.getElementById('modal-overlay').addEventListener('click', function(e) {
      if (e.target === this) closeModal();
    });
  </script>
</body>
</html>`;

@Controller('plc')
export class PlcController {
  constructor(
    private readonly plcStatusService: PlcStatusService,
    private readonly taskService: TaskService,
  ) {}

  @Get('status')
  async getStatus() {
    return this.plcStatusService.readAll();
  }

  @Post('force-reset')
  @HttpCode(200)
  async forceReset() {
    return this.taskService.forceResetTask();
  }

  @Get('dashboard')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getDashboard(@Res() res: Response) {
    res.send(DASHBOARD_HTML);
  }
}
