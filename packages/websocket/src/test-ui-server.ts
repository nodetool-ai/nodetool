import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";
import { createLogger, getDefaultDbPath } from "@nodetool/config";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { WebSocketServer } from "ws";
import { NodeRegistry, createGraphNodeTypeResolver } from "@nodetool/node-sdk";
import { registerBaseNodes } from "@nodetool/base-nodes";
import { registerElevenLabsNodes } from "@nodetool/elevenlabs-nodes";
import {
  UnifiedWebSocketRunner,
  type WebSocketConnection
} from "./unified-websocket-runner.js";
import { ScriptedProvider, autoScript } from "@nodetool/runtime";
import { handleNodeHttpRequest, type HttpApiOptions } from "./http-api.js";
import { initDb } from "@nodetool/models";

const log = createLogger("nodetool.websocket.server");

function htmlPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NodeTool Pipeline Tester</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
  <style>
    html, body, #root { margin: 0; min-height: 100%; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@mui/material@5.15.19/umd/material-ui.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script type="text/babel" data-presets="env,react">
function normalizeType(raw) {
  const t = String(raw || '').toLowerCase();
  if (!t) return 'any';
  if (['any', 'object', 'unknown'].includes(t)) return 'any';
  if (['string', 'str', 'text'].includes(t)) return 'str';
  if (['int', 'integer'].includes(t)) return 'int';
  if (['float', 'double', 'number'].includes(t)) return 'float';
  if (['bool', 'boolean'].includes(t)) return 'bool';
  if (['list', 'array'].includes(t)) return 'list';
  if (['dict', 'dictionary', 'map'].includes(t)) return 'dict';
  return t;
}

function outputType(out) {
  return normalizeType(out?.type?.type);
}

function inputType(prop) {
  return normalizeType(prop?.type?.type);
}

function isTypeCompatible(fromType, toType) {
  if (fromType === 'any' || toType === 'any') return true;
  if (fromType === toType) return true;
  if (fromType === 'int' && toType === 'float') return true;
  return false;
}

function chooseLink(aMd, bMd) {
  const outputs = Array.isArray(aMd?.outputs) ? aMd.outputs : [];
  const inputs = Array.isArray(bMd?.properties) ? bMd.properties : [];
  if (!outputs.length || !inputs.length) {
    return {
      sourceHandle: outputs[0]?.name || 'output',
      targetHandle: inputs[0]?.name || 'input',
      warning: 'Fallback handle mapping due to missing metadata slots',
    };
  }

  for (const out of outputs) {
    for (const inp of inputs) {
      const ot = outputType(out);
      const it = inputType(inp);
      if (isTypeCompatible(ot, it)) {
        return { sourceHandle: out.name, targetHandle: inp.name, warning: null };
      }
    }
  }

  return {
    sourceHandle: outputs[0].name,
    targetHandle: inputs[0].name,
    warning: 'No compatible type match (' + outputType(outputs[0]) + ' -> ' + inputType(inputs[0]) + '), using first handles',
  };
}

const OUTPUT_NODE_TYPE = 'nodetool.output.Output';

const {
  Alert, Box, Button, Chip, CssBaseline, Divider, FormControlLabel, Grid, LinearProgress, List,
  ListItemButton, ListItemText, MenuItem, Paper, Stack, TextField, ThemeProvider, Typography, Checkbox, createTheme
} = MaterialUI;
const { useEffect, useMemo, useRef, useState } = React;

function propertyEnumValues(prop) {
  if (Array.isArray(prop?.type?.values) && prop.type.values.length > 0) return prop.type.values;
  if (Array.isArray(prop?.type?.type_args?.[0]?.values) && prop.type.type_args[0].values.length > 0) {
    return prop.type.type_args[0].values;
  }
  if (Array.isArray(prop?.values) && prop.values.length > 0) return prop.values;
  if (Array.isArray(prop?.enum) && prop.enum.length > 0) return prop.enum;
  return [];
}

function inputEditorKind(prop) {
  const t = String(prop?.type?.type || 'str').toLowerCase();
  const enumValues = propertyEnumValues(prop);
  if (enumValues.length > 0 || t === 'enum' || t === 'select') return 'enum';
  if (t === 'bool' || t === 'boolean') return 'checkbox';
  if (['int', 'integer', 'float', 'number'].includes(t)) return 'number';
  if (['text'].includes(t)) return 'multiline';
  if (['list', 'dict', 'json', 'record_type', 'dataframe', 'image_size'].includes(t)) return 'json';
  if (t === 'union') return 'json';
  return 'text';
}

function normalizePropertyValue(prop, value) {
  const kind = inputEditorKind(prop);
  if (kind === 'checkbox') return Boolean(value);
  if (kind === 'number') {
    if (value === '' || value === null || value === undefined) return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return value;
    const t = String(prop?.type?.type || '').toLowerCase();
    return (t === 'int' || t === 'integer') ? Math.trunc(n) : n;
  }
  if (kind === 'json') {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return value;
    const raw = value.trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return value;
    }
  }
  return value;
}

function App() {
  const [metadata, setMetadata] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedNodeType, setSelectedNodeType] = useState('');
  const [steps, setSteps] = useState([]);
  const [savedWorkflows, setSavedWorkflows] = useState([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [examples, setExamples] = useState([]);
  const [selectedExampleId, setSelectedExampleId] = useState('');
  const [importedGraph, setImportedGraph] = useState(null);
  const [importedGraphName, setImportedGraphName] = useState('');
  const [workflowName, setWorkflowName] = useState('Quick Test Pipeline');
  const [paramsText, setParamsText] = useState('');
  const [fixtureKey, setFixtureKey] = useState('text');
  const [statusText, setStatusText] = useState('Idle');
  const [logs, setLogs] = useState([]);
  const [runEvents, setRunEvents] = useState([]);
  const [outputEvents, setOutputEvents] = useState([]);
  const [jobId, setJobId] = useState(null);
  const [fixtureFile, setFixtureFile] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const wsRef = useRef(null);
  const startTimeRef = useRef(null);

  const log = (msg, type) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [{ text: '[' + time + '] ' + msg, type: type || 'info' }, ...prev].slice(0, 200));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return metadata.filter((n) => (
      !q ||
      String(n.title || '').toLowerCase().includes(q) ||
      String(n.node_type || '').toLowerCase().includes(q) ||
      String(n.namespace || '').toLowerCase().includes(q)
    ));
  }, [metadata, search]);

  const graphData = useMemo(() => {
    if (importedGraph && Array.isArray(importedGraph.nodes) && Array.isArray(importedGraph.edges)) {
      return { graph: importedGraph, warnings: ['Loaded example graph (read-only in builder mode)'] };
    }
    const state = { metadata, steps };
    return compileGraph(state);
  }, [metadata, steps, importedGraph]);

  const summaryText = 'events=' + runEvents.length + ', outputs=' + outputEvents.length;
  const lastOutput = outputEvents[outputEvents.length - 1];
  const formatDuration = (seconds) => {
    if (seconds < 1) return Math.round(seconds * 1000) + 'ms';
    if (seconds < 60) return seconds.toFixed(1) + 's';
    const minutes = Math.floor(seconds / 60);
    const remain = Math.round(seconds % 60);
    return minutes + 'm ' + remain + 's';
  };

  async function refreshSavedWorkflows() {
    const res = await fetch('/api/workflows?run_mode=test&limit=200');
    if (!res.ok) throw new Error('failed to list workflows: ' + res.status);
    const body = await res.json();
    setSavedWorkflows(Array.isArray(body.workflows) ? body.workflows : []);
  }

  async function refreshExamples() {
    const res = await fetch('/api/examples');
    if (!res.ok) throw new Error('failed to list examples: ' + res.status);
    const body = await res.json();
    setExamples(Array.isArray(body.examples) ? body.examples : []);
  }

  async function loadMetadata() {
    const res = await fetch('/api/node/metadata');
    if (!res.ok) throw new Error('metadata fetch failed: ' + res.status);
    const all = await res.json();
    const filteredAll = all.filter((n) => n && typeof n.node_type === 'string');
    setMetadata(filteredAll);
    log('Loaded ' + filteredAll.length + ' node metadata entries', 'ok');
    await refreshSavedWorkflows();
    await refreshExamples();
  }

  useEffect(() => {
    loadMetadata().catch((err) => log(String(err), 'err'));
  }, []);

  useEffect(() => {
    if (!isRunning) {
      startTimeRef.current = null;
      return;
    }
    startTimeRef.current = Date.now();
    setElapsedTime(0);
    const interval = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedTime((Date.now() - startTimeRef.current) / 1000);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isRunning]);

  async function connectWs() {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return wsRef.current;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(proto + '//' + location.host + '/ws');
    return await new Promise((resolve, reject) => {
      ws.onopen = () => {
        wsRef.current = ws;
        ws.send(JSON.stringify({ command: 'set_mode', data: { mode: 'text' } }));
        log('WS connected', 'ok');
        resolve(ws);
      };
      ws.onerror = (err) => reject(err);
      ws.onclose = () => {
        log('WS disconnected', 'err');
        if (wsRef.current === ws) wsRef.current = null;
        setIsRunning(false);
      };
      ws.onmessage = (event) => {
        let data = null;
        try { data = JSON.parse(event.data); } catch { return; }
        setRunEvents((prev) => [...prev, data]);
        if (data.type === 'output_update') {
          setOutputEvents((prev) => [...prev, data]);
        }
        if (data.type === 'job_update') {
          if (typeof data.job_id === 'string' && data.job_id) setJobId(data.job_id);
          const status = String(data.status || '');
          if (status === 'running') setIsRunning(true);
          if (['completed', 'failed', 'cancelled'].includes(status)) {
            setJobId(null);
            setIsRunning(false);
          }
          setStatusText('Job ' + (data.job_id || '') + ': ' + data.status + (data.error ? (' (' + data.error + ')') : ''));
        }
        if (data.error) log('Error: ' + data.error, 'err');
        else if (data.message) log(data.message, 'ok');
        else if (data.type) log(data.type + (data.status ? (' -> ' + data.status) : ''), 'info');
      };
    });
  }

  async function runPipeline() {
    try {
      const ws = await connectWs();
      setJobId(null);
      setRunEvents([]);
      setOutputEvents([]);
      setIsRunning(true);
      const raw = paramsText.trim();
      const params = raw ? JSON.parse(raw) : {};
      if (!steps.length) {
        log('Add at least one step', 'err');
        setIsRunning(false);
        return;
      }
      ws.send(JSON.stringify({
        command: 'run_job',
        data: { graph: graphData.graph, params }
      }));
      setStatusText('Submitted run request...');
    } catch (err) {
      log('Run failed: ' + String(err), 'err');
      setIsRunning(false);
    }
  }

  async function cancelRun() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!jobId) {
      log('No active job to cancel yet', 'err');
      return;
    }
    ws.send(JSON.stringify({ command: 'cancel_job', data: { job_id: jobId } }));
    log('Cancellation requested for job ' + jobId, 'info');
  }

  async function saveCurrentWorkflow() {
    const name = (workflowName || '').trim() || 'Quick Test Pipeline';
    if (!steps.length) {
      log('Cannot save empty pipeline', 'err');
      return;
    }
    const payload = {
      name,
      access: 'private',
      description: 'Saved from TS test UI',
      run_mode: 'test',
      graph: graphData.graph,
      tags: ['test-ui']
    };
    const res = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error('save failed: ' + res.status + ' ' + detail);
    }
    const wf = await res.json();
    setSelectedWorkflowId(wf.id);
    log('Saved test workflow: ' + wf.name, 'ok');
    await refreshSavedWorkflows();
  }

  async function loadSelectedExample() {
    if (!selectedExampleId) {
      log('Select an example first', 'err');
      return;
    }
    const res = await fetch('/api/examples/' + encodeURIComponent(selectedExampleId));
    if (!res.ok) throw new Error('example load failed: ' + res.status);
    const example = await res.json();
    if (!example?.graph || !Array.isArray(example.graph.nodes) || !Array.isArray(example.graph.edges)) {
      throw new Error('example graph is invalid');
    }
    setImportedGraph(example.graph);
    setImportedGraphName(typeof example.name === 'string' ? example.name : selectedExampleId);
    const nodes = Array.isArray(example.graph.nodes) ? example.graph.nodes : [];
    setSteps(
      nodes
        .filter((n) => n && n.type !== OUTPUT_NODE_TYPE)
        .map((n) => ({
          type: n.type,
          properties:
            n && typeof n === 'object' && n.data && typeof n.data === 'object'
              ? n.data
              : n && typeof n === 'object' && n.properties && typeof n.properties === 'object'
                ? n.properties
                : {}
        }))
    );
    log('Loaded example: ' + (example.name || selectedExampleId), 'ok');
  }

  async function loadSelectedWorkflow() {
    if (!selectedWorkflowId) {
      log('Select a saved workflow first', 'err');
      return;
    }
    const res = await fetch('/api/workflows/' + encodeURIComponent(selectedWorkflowId));
    if (!res.ok) throw new Error('load failed: ' + res.status);
    const wf = await res.json();
    const nodes = Array.isArray(wf.graph?.nodes) ? wf.graph.nodes : [];
    setSteps(
      nodes
        .filter((n) => n && n.type !== OUTPUT_NODE_TYPE)
        .map((n) => ({
          type: n.type,
          properties: n.properties && typeof n.properties === 'object' ? n.properties : {}
        }))
    );
    setImportedGraph(null);
    setImportedGraphName('');
    if (wf.name) setWorkflowName(wf.name);
    log('Loaded workflow: ' + (wf.name || selectedWorkflowId), 'ok');
  }

  async function applyFixture() {
    const key = (fixtureKey || '').trim();
    const file = fixtureFile;
    if (!key) {
      log('Fixture param key is required', 'err');
      return;
    }
    if (!file) {
      log('Choose a fixture file first', 'err');
      return;
    }
    const params = paramsText.trim() ? JSON.parse(paramsText) : {};
    if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.json')) {
      params[key] = await file.text();
    } else if (file.type.startsWith('image/')) {
      const dataUri = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed reading image file'));
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(file);
      });
      params[key] = dataUri;
    } else {
      log('Unsupported fixture type for quick mode; use text/image', 'err');
      return;
    }
    setParamsText(JSON.stringify(params, null, 2));
    log('Fixture applied to params key: ' + key, 'ok');
  }

  const theme = useMemo(() => createTheme({
    palette: {
      mode: 'dark',
      primary: { main: '#3b82f6' },
      secondary: { main: '#66bb6a' },
      error: { main: '#ef5350' },
      background: { default: '#0b1220', paper: '#0f172a' }
    },
    shape: { borderRadius: 12 },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            border: '1px solid rgba(148,163,184,0.16)',
            boxShadow: '0 12px 30px rgba(2,6,23,0.28)'
          }
        }
      }
    }
  }), []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{
        minHeight: '100vh',
        p: { xs: 1.5, md: 3 },
        background: 'radial-gradient(1200px 700px at 0% -15%, rgba(59,130,246,0.22) 0%, transparent 62%), radial-gradient(900px 500px at 100% -20%, rgba(16,185,129,0.16) 0%, transparent 60%), #0b1220'
      }}>
        <Box sx={{ maxWidth: 1700, mx: 'auto' }}>
          <Stack spacing={0.75} sx={{ mb: 2 }}>
            <Typography variant="h4" sx={{ fontWeight: 300 }}>NodeTool Pipeline Tester</Typography>
            <Typography variant="body2" color="text.secondary">
              Compose a quick test workflow, run it over websocket, and inspect outputs.
            </Typography>
          </Stack>
          {isRunning && (
            <Paper sx={{ p: 1.25, mb: 2 }}>
              <Stack direction="row" spacing={1.25} alignItems="center">
                <Box sx={{ flex: 1 }}>
                  <LinearProgress />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Running • {formatDuration(elapsedTime)}
                </Typography>
              </Stack>
            </Paper>
          )}
        <Grid container spacing={2}>
          <Grid item xs={12} lg={3}>
            <Paper sx={{ p: 2 }}>
              <Stack spacing={1.25}>
                <Typography variant="h6">Pipeline Builder</Typography>
                <TextField size="small" label="Search nodes" value={search} onChange={(e) => setSearch(e.target.value)} />
                <List dense sx={{ maxHeight: 260, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  {filtered.map((md) => (
                    <ListItemButton key={md.node_type} selected={selectedNodeType === md.node_type} onClick={() => setSelectedNodeType(md.node_type)}>
                      <ListItemText primary={md.title + ' (' + md.node_type + ')'} />
                    </ListItemButton>
                  ))}
                </List>
                <Button
                  variant="contained"
                  disabled={Boolean(importedGraph)}
                  onClick={() => selectedNodeType && setSteps((prev) => [...prev, { type: selectedNodeType, properties: {} }])}
                >
                  Add Step
                </Button>
                <Divider />
                <Typography variant="subtitle2">Saved Tests</Typography>
                <List dense sx={{ maxHeight: 180, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  {savedWorkflows.map((wf) => (
                    <ListItemButton key={wf.id} selected={selectedWorkflowId === wf.id} onClick={() => setSelectedWorkflowId(wf.id)}>
                      <ListItemText primary={wf.name + ' (' + String(wf.id).slice(0, 8) + ')'} />
                    </ListItemButton>
                  ))}
                </List>
                <Typography variant="subtitle2">NodeTool-Base Examples</Typography>
                <List dense sx={{ maxHeight: 200, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  {examples.map((ex) => (
                    <ListItemButton key={ex.id} selected={selectedExampleId === ex.id} onClick={() => setSelectedExampleId(ex.id)}>
                      <ListItemText
                        primary={ex.name || ex.id}
                        secondary={ex.description || ''}
                        secondaryTypographyProps={{ sx: { display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }}
                      />
                    </ListItemButton>
                  ))}
                </List>
                <Button variant="outlined" onClick={() => void loadSelectedExample().catch((err) => log(String(err), 'err'))}>Load Example</Button>
                {importedGraph && (
                  <Alert
                    severity="info"
                    action={<Button size="small" color="inherit" onClick={() => { setImportedGraph(null); setImportedGraphName(''); }}>Use Builder</Button>}
                  >
                    Using imported example graph: {importedGraphName || selectedExampleId}
                  </Alert>
                )}
                <TextField size="small" label="Workflow name" value={workflowName} onChange={(e) => setWorkflowName(e.target.value)} />
                <Stack direction="row" spacing={1}>
                  <Button fullWidth variant="outlined" onClick={() => void saveCurrentWorkflow().catch((err) => log(String(err), 'err'))}>Save Test</Button>
                  <Button fullWidth variant="outlined" onClick={() => void loadSelectedWorkflow().catch((err) => log(String(err), 'err'))}>Load</Button>
                </Stack>
                <Typography variant="subtitle2">Run Params (JSON)</Typography>
                <TextField multiline minRows={7} value={paramsText} onChange={(e) => setParamsText(e.target.value)} placeholder='{"text":"hello"}' />
                <Typography variant="subtitle2">Asset Fixture</Typography>
                <TextField size="small" label="Param key" value={fixtureKey} onChange={(e) => setFixtureKey(e.target.value)} />
                <Button variant="outlined" component="label">
                  {fixtureFile ? fixtureFile.name : 'Choose fixture file'}
                  <input hidden type="file" onChange={(e) => setFixtureFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                </Button>
                <Button variant="outlined" onClick={() => void applyFixture().catch((err) => log(String(err), 'err'))}>Apply Fixture To Params</Button>
                <Typography variant="caption" color="text.secondary">Text files become plain strings, images become data URIs.</Typography>
                <Stack direction="row" spacing={1}>
                  <Button fullWidth variant="contained" color={isRunning ? 'warning' : 'secondary'} onClick={isRunning ? cancelRun : runPipeline}>
                    {isRunning ? 'Stop' : 'Run Pipeline'}
                  </Button>
                  <Button fullWidth variant="contained" color="error" onClick={cancelRun} disabled={!isRunning}>Cancel</Button>
                </Stack>
                <Typography variant="body2" color="text.secondary">{statusText}</Typography>
              </Stack>
            </Paper>
          </Grid>
          <Grid item xs={12} lg={5}>
            <Paper sx={{ p: 2 }}>
              <Stack spacing={1.25}>
                <Typography variant="h6">Steps</Typography>
                {steps.length === 0 && <Typography variant="body2" color="text.secondary">No steps yet</Typography>}
                {steps.map((step, idx) => {
                  const md = metadata.find((m) => m.node_type === step.type);
                  const propList = md?.properties || [];
                  return (
                    <Paper key={idx} variant="outlined" sx={{ p: 1.25 }}>
                      <Stack spacing={1}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="subtitle2">{(idx + 1) + '. ' + (md?.title || step.type)}</Typography>
                          <Chip size="small" label={md?.namespace || ''} />
                        </Stack>
                        <Typography variant="caption" color="text.secondary">{step.type}</Typography>
                        {propList.map((prop) => {
                          const kind = inputEditorKind(prop);
                          const current = step.properties[prop.name] ?? prop.default ?? '';
                          const enumValues = propertyEnumValues(prop);
                          if (kind === 'checkbox') {
                            return (
                              <FormControlLabel
                                key={prop.name}
                                control={
                                  <Checkbox
                                    checked={Boolean(current)}
                                    disabled={Boolean(importedGraph)}
                                    onChange={(e) => {
                                      setSteps((prev) => prev.map((s, i) => i === idx ? { ...s, properties: { ...s.properties, [prop.name]: e.target.checked } } : s));
                                    }}
                                  />
                                }
                                label={prop.name}
                              />
                            );
                          }
                          if (kind === 'enum') {
                            const value = current === null || current === undefined ? '' : String(current);
                            return (
                              <TextField
                                key={prop.name}
                                size="small"
                                select
                                label={prop.name}
                                value={value}
                                disabled={Boolean(importedGraph)}
                                onChange={(e) => {
                                  setSteps((prev) => prev.map((s, i) => i === idx ? { ...s, properties: { ...s.properties, [prop.name]: e.target.value } } : s));
                                }}
                              >
                                {enumValues.map((opt, optIdx) => (
                                  <MenuItem key={String(opt) + ':' + optIdx} value={String(opt)}>{String(opt)}</MenuItem>
                                ))}
                              </TextField>
                            );
                          }
                          if (kind === 'json') {
                            const value = typeof current === 'string' ? current : JSON.stringify(current, null, 2);
                            return (
                              <TextField
                                key={prop.name}
                                size="small"
                                multiline
                                minRows={3}
                                label={prop.name}
                                value={value}
                                disabled={Boolean(importedGraph)}
                                onChange={(e) => {
                                  setSteps((prev) => prev.map((s, i) => i === idx ? { ...s, properties: { ...s.properties, [prop.name]: e.target.value } } : s));
                                }}
                              />
                            );
                          }
                          return (
                            <TextField
                              key={prop.name}
                              size="small"
                              type={kind === 'multiline' ? 'text' : kind}
                              multiline={kind === 'multiline'}
                              minRows={kind === 'multiline' ? 3 : undefined}
                              label={prop.name}
                              value={current === null || current === undefined ? '' : String(current)}
                              disabled={Boolean(importedGraph)}
                              onChange={(e) => {
                                setSteps((prev) => prev.map((s, i) => i === idx ? { ...s, properties: { ...s.properties, [prop.name]: e.target.value } } : s));
                              }}
                            />
                          );
                        })}
                        <Stack direction="row" spacing={1}>
                          <Button
                            fullWidth
                            variant="outlined"
                            disabled={Boolean(importedGraph)}
                            onClick={() => {
                              if (idx === 0) return;
                              setSteps((prev) => {
                                const next = [...prev];
                                const x = next[idx - 1];
                                next[idx - 1] = next[idx];
                                next[idx] = x;
                                return next;
                              });
                            }}
                          >Up</Button>
                          <Button
                            fullWidth
                            variant="outlined"
                            disabled={Boolean(importedGraph)}
                            onClick={() => {
                              if (idx === steps.length - 1) return;
                              setSteps((prev) => {
                                const next = [...prev];
                                const x = next[idx + 1];
                                next[idx + 1] = next[idx];
                                next[idx] = x;
                                return next;
                              });
                            }}
                          >Down</Button>
                          <Button fullWidth variant="contained" color="error" disabled={Boolean(importedGraph)} onClick={() => setSteps((prev) => prev.filter((_, i) => i !== idx))}>Remove</Button>
                        </Stack>
                      </Stack>
                    </Paper>
                  );
                })}
                <Typography variant="subtitle2">Connection Warnings</Typography>
                {graphData.warnings.length ? (
                  <Stack spacing={0.75}>
                    {graphData.warnings.map((w, i) => <Alert key={i} severity="warning">{w}</Alert>)}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">No connection warnings</Typography>
                )}
                <Typography variant="subtitle2">Compiled Graph</Typography>
                <Box component="pre" sx={{ m: 0, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, backgroundColor: 'rgba(0,0,0,0.25)', maxHeight: 300, overflow: 'auto', fontSize: 12 }}>
                  {JSON.stringify(graphData.graph, null, 2)}
                </Box>
              </Stack>
            </Paper>
          </Grid>
          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: 2 }}>
              <Stack spacing={1.25}>
                <Typography variant="h6">Run Output</Typography>
                <Typography variant="caption" color="text.secondary">{summaryText || 'No run yet'}</Typography>
                <Typography variant="subtitle2">Output Updates</Typography>
                <Box component="pre" sx={{ m: 0, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, backgroundColor: 'rgba(0,0,0,0.25)', maxHeight: 220, overflow: 'auto', fontSize: 12 }}>
                  {JSON.stringify(outputEvents, null, 2)}
                </Box>
                <Typography variant="subtitle2">Preview</Typography>
                {!lastOutput && <Typography variant="body2" color="text.secondary">No output yet</Typography>}
                {lastOutput && typeof lastOutput.value === 'string' && lastOutput.value.startsWith('data:image/') && (
                  <Box component="img" src={lastOutput.value} sx={{ width: '100%', borderRadius: 1, border: '1px solid', borderColor: 'divider' }} />
                )}
                {lastOutput && !(typeof lastOutput.value === 'string' && lastOutput.value.startsWith('data:image/')) && (
                  <Box component="pre" sx={{ m: 0, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, backgroundColor: 'rgba(0,0,0,0.25)', maxHeight: 220, overflow: 'auto', fontSize: 12 }}>
                    {typeof lastOutput.value === 'string' ? lastOutput.value : JSON.stringify(lastOutput.value, null, 2)}
                  </Box>
                )}
                <Typography variant="subtitle2">Event Log</Typography>
                <List dense sx={{ maxHeight: 320, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  {logs.map((entry, idx) => (
                    <ListItemText
                      key={idx}
                      primaryTypographyProps={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: 12,
                        color: entry.type === 'err' ? 'error.main' : entry.type === 'ok' ? 'success.main' : 'text.primary',
                        sx: { px: 1, py: 0.4 }
                      }}
                      primary={entry.text}
                    />
                  ))}
                </List>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

function compileGraph(state) {
  const warnings = [];
  const userNodes = state.steps.map((step, i) => {
    const id = 'n' + (i + 1);
    const md = state.metadata.find((m) => m.node_type === step.type);
    const propDefs = Array.isArray(md?.properties) ? md.properties : [];
    const normalizedProps = { ...step.properties };
    for (const prop of propDefs) {
      if (!(prop.name in normalizedProps)) continue;
      normalizedProps[prop.name] = normalizePropertyValue(prop, normalizedProps[prop.name]);
    }
    return {
      id,
      type: step.type,
      name: step.type,
      properties: normalizedProps
    };
  });
  const nodes = [...userNodes];
  if (userNodes.length) {
    const id = 'n' + (userNodes.length + 1);
    nodes.push({
      id,
      type: OUTPUT_NODE_TYPE,
      name: OUTPUT_NODE_TYPE,
      properties: {}
    });
  }
  const edges = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const aMd = state.metadata.find((m) => m.node_type === nodes[i].type);
    const bMd = state.metadata.find((m) => m.node_type === nodes[i + 1].type);
    const isOutputTarget = nodes[i + 1].type === OUTPUT_NODE_TYPE;
    const link = isOutputTarget
      ? {
          sourceHandle: Array.isArray(aMd?.outputs) && aMd.outputs.length ? aMd.outputs[0].name : 'output',
          targetHandle: 'value',
          warning:
            Array.isArray(aMd?.outputs) && aMd.outputs.length
              ? null
              : 'Auto output wiring used fallback source handle "output"'
        }
      : chooseLink(aMd, bMd);
    if (link.warning) {
      warnings.push(
        'Step ' + (i + 1) + ' -> ' + (i + 2) + ': ' + link.warning + ' (' + nodes[i].type + ' -> ' + nodes[i + 1].type + ')'
      );
    }
    edges.push({
      id: 'e' + (i + 1),
      source: nodes[i].id,
      target: nodes[i + 1].id,
      sourceHandle: link.sourceHandle,
      targetHandle: link.targetHandle,
      edge_type: 'data'
    });
  }
  return { graph: { nodes, edges }, warnings };
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
  </script>
</body>
</html>`;
}

class WsAdapter implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";

  private queue: WebSocketConnection["receive"] extends () => Promise<infer T>
    ? T[]
    : never = [];
  private waiters: Array<
    (frame: {
      type: string;
      bytes?: Uint8Array | null;
      text?: string | null;
    }) => void
  > = [];

  constructor(private socket: any) {
    socket.on("message", (raw: any, isBinary: boolean) => {
      const frame = isBinary
        ? {
            type: "websocket.message",
            bytes:
              raw instanceof Uint8Array ? raw : new Uint8Array(raw as Buffer)
          }
        : { type: "websocket.message", text: raw.toString() };
      const waiter = this.waiters.shift();
      if (waiter) waiter(frame);
      else this.queue.push(frame);
    });

    socket.on("close", () => {
      this.clientState = "disconnected";
      this.applicationState = "disconnected";
      const waiter = this.waiters.shift();
      if (waiter) waiter({ type: "websocket.disconnect" });
    });
  }

  async accept(): Promise<void> {}

  async receive(): Promise<{
    type: string;
    bytes?: Uint8Array | null;
    text?: string | null;
  }> {
    const next = this.queue.shift();
    if (next) return next;
    return await new Promise((resolve) => this.waiters.push(resolve));
  }

  async sendBytes(data: Uint8Array): Promise<void> {
    this.socket.send(data);
  }

  async sendText(data: string): Promise<void> {
    this.socket.send(data);
  }

  async close(code?: number, reason?: string): Promise<void> {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
    this.socket.close(code, reason);
  }
}

export interface TestUiServerOptions extends HttpApiOptions {
  port?: number;
  host?: string;
  examplesDir?: string;
}

function detectMetadataRootsFromPip(): string[] {
  const script = `
import json
import pathlib
import subprocess
import sys

packages = ["nodetool-core", "nodetool-base"]
roots = set()

try:
    proc = subprocess.run(
        [sys.executable, "-m", "pip", "show", "-f", *packages],
        capture_output=True,
        text=True,
        check=False,
    )
    output = proc.stdout or ""
except Exception:
    output = ""

location = None
in_files = False
for raw in output.splitlines():
    line = raw.rstrip("\\n")
    if line.startswith("Name: "):
        location = None
        in_files = False
        continue
    if line.startswith("Location: "):
        location = line.split(":", 1)[1].strip()
        continue
    if line.startswith("Editable project location: "):
        editable = line.split(":", 1)[1].strip()
        if editable:
            roots.add(editable)
        continue
    if line.startswith("Files:"):
        in_files = True
        continue
    if line.startswith("---"):
        location = None
        in_files = False
        continue

    if not in_files or not location or not line.startswith("  "):
        continue

    rel = line.strip().replace("\\\\", "/")
    if "package_metadata" not in rel:
        continue
    abs_path = (pathlib.Path(location) / rel).resolve()
    metadata_dir = abs_path if abs_path.is_dir() else abs_path.parent
    roots.add(str(metadata_dir))

print(json.dumps(sorted(roots)))
`;

  for (const python of ["python3", "python"]) {
    const proc = spawnSync(python, ["-c", script], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    if (proc.status !== 0 || !proc.stdout) continue;
    try {
      const roots = JSON.parse(proc.stdout.trim()) as string[];
      if (!Array.isArray(roots)) continue;
      return roots.filter(
        (p) => typeof p === "string" && p.length > 0 && existsSync(p)
      );
    } catch {
      // try next python executable
    }
  }
  return [];
}

function resolveMetadataRoots(options: TestUiServerOptions): string[] {
  if (options.metadataRoots && options.metadataRoots.length > 0) {
    return options.metadataRoots;
  }
  if (process.env.METADATA_ROOTS) {
    return process.env.METADATA_ROOTS.split(":").filter(Boolean);
  }
  const detected = detectMetadataRootsFromPip();
  if (detected.length > 0) return detected;
  const nearby = detectNearbyMetadataRoots(process.cwd());
  if (nearby.length > 0) return nearby;
  return [process.cwd()];
}

function hasMetadataLayout(root: string): boolean {
  return (
    existsSync(path.join(root, "src", "nodetool", "package_metadata")) ||
    existsSync(path.join(root, "nodetool", "package_metadata"))
  );
}

function detectNearbyMetadataRoots(cwd: string): string[] {
  const candidates = new Set<string>();
  let cur = path.resolve(cwd);
  for (let i = 0; i < 8; i++) {
    candidates.add(cur);
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }

  // Also inspect siblings in the parent workspace (e.g. nodetool-* repos).
  const workspaceRoot = path.resolve(cwd, "..", "..", "..", "..");
  if (existsSync(workspaceRoot)) {
    try {
      for (const entry of readdirSync(workspaceRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const name = entry.name.toLowerCase();
        if (!name.startsWith("nodetool")) continue;
        candidates.add(path.join(workspaceRoot, entry.name));
      }
    } catch {
      // ignore discovery failures
    }
  }

  return [...candidates].filter(hasMetadataLayout);
}

function hasNodetoolBaseExamplesLayout(root: string): boolean {
  return existsSync(
    path.join(root, "src", "nodetool", "examples", "nodetool-base")
  );
}

function detectNearbyNodetoolBaseRoot(cwd: string): string | null {
  const candidates = new Set<string>();
  let cur = path.resolve(cwd);
  for (let i = 0; i < 8; i++) {
    candidates.add(cur);
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }

  const workspaceRoot = path.resolve(cwd, "..", "..", "..", "..");
  if (existsSync(workspaceRoot)) {
    try {
      for (const entry of readdirSync(workspaceRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name.toLowerCase() !== "nodetool-base") continue;
        candidates.add(path.join(workspaceRoot, entry.name));
      }
    } catch {
      // ignore discovery failures
    }
  }

  for (const candidate of candidates) {
    if (hasNodetoolBaseExamplesLayout(candidate)) return candidate;
  }
  return null;
}

function resolveExamplesDir(options: TestUiServerOptions): string | null {
  if (options.examplesDir && existsSync(options.examplesDir))
    return options.examplesDir;
  if (
    process.env.NODETOOL_BASE_EXAMPLES_DIR &&
    existsSync(process.env.NODETOOL_BASE_EXAMPLES_DIR)
  ) {
    return process.env.NODETOOL_BASE_EXAMPLES_DIR;
  }
  const baseRoot = detectNearbyNodetoolBaseRoot(process.cwd());
  if (!baseRoot) return null;
  const dir = path.join(
    baseRoot,
    "src",
    "nodetool",
    "examples",
    "nodetool-base"
  );
  return existsSync(dir) ? dir : null;
}

function listExampleWorkflows(
  examplesDir: string
): Array<{ id: string; name: string; description: string; tags: string[] }> {
  const files = readdirSync(examplesDir, { withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json")
    )
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const items: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
  }> = [];
  for (const file of files) {
    try {
      const raw = readFileSync(path.join(examplesDir, file), "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      items.push({
        id: file,
        name:
          typeof parsed.name === "string"
            ? parsed.name
            : file.replace(/\.json$/i, ""),
        description:
          typeof parsed.description === "string" ? parsed.description : "",
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.filter((t) => typeof t === "string")
          : []
      });
    } catch {
      // skip invalid files
    }
  }
  return items;
}

function readExampleWorkflow(
  examplesDir: string,
  id: string
): Record<string, unknown> | null {
  const safeId = path.basename(id);
  if (!safeId.toLowerCase().endsWith(".json")) return null;
  const full = path.join(examplesDir, safeId);
  if (!existsSync(full)) return null;
  const raw = readFileSync(full, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const graph = parsed.graph as
    | { nodes?: unknown; edges?: unknown }
    | undefined;
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges))
    return null;
  return {
    id: safeId,
    name:
      typeof parsed.name === "string"
        ? parsed.name
        : safeId.replace(/\.json$/i, ""),
    description:
      typeof parsed.description === "string" ? parsed.description : "",
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.filter((t) => typeof t === "string")
      : [],
    graph
  };
}

export function createTestUiServer(options: TestUiServerOptions = {}) {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? Number(process.env.PORT ?? 7777);
  const examplesDir = resolveExamplesDir(options);

  const metadataRoots = resolveMetadataRoots(options);
  const registry = new NodeRegistry();
  registry.loadPythonMetadata({
    roots: metadataRoots,
    maxDepth: options.metadataMaxDepth ?? 8
  });
  registerBaseNodes(registry);
  registerElevenLabsNodes(registry);
  const resolvedApiOptions: HttpApiOptions = {
    ...options,
    metadataRoots,
    registry
  };
  const graphNodeTypeResolver = createGraphNodeTypeResolver(registry);

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    if (url.pathname === "/" || url.pathname === "/test-ui") {
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(htmlPage());
      return;
    }
    if (url.pathname === "/api/examples") {
      if (!examplesDir) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ examples: [] }));
        return;
      }
      const examples = listExampleWorkflows(examplesDir);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ examples }));
      return;
    }
    if (url.pathname.startsWith("/api/examples/")) {
      if (!examplesDir) {
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({ detail: "Examples directory not configured" })
        );
        return;
      }
      const id = decodeURIComponent(
        url.pathname.slice("/api/examples/".length)
      );
      const example = readExampleWorkflow(examplesDir, id);
      if (!example) {
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ detail: "Example not found" }));
        return;
      }
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(example));
      return;
    }
    if (
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/v1/") ||
      url.pathname.startsWith("/admin/")
    ) {
      void handleNodeHttpRequest(req, res, resolvedApiOptions);
      return;
    }
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ detail: "Not found" }));
  });

  const wss = new WebSocketServer({ noServer: true });

  wss.on("error", (error: Error) => {
    log.error("WebSocketServer error", error);
  });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws: any) => {
      ws.on("error", (error: Error) => {
        log.error("WebSocket client error", error);
      });
      const runner = new UnifiedWebSocketRunner({
        resolveExecutor: (node) => registry.resolve(node),
        resolveNodeType: graphNodeTypeResolver,
        resolveProvider: async (_providerId) =>
          new ScriptedProvider([
            autoScript({
              plan: {
                title: "Agent task",
                steps: [
                  {
                    id: "s1",
                    instructions: "Complete the objective",
                    depends_on: []
                  }
                ]
              },
              text: "fake agent response from server"
            })
          ]),
        getNodeMetadata: (nodeType) => registry.getMetadata(nodeType)
      });
      log.info("WebSocket client connected");
      void runner.run(new WsAdapter(ws)).catch((error) => {
        log.error(
          "Runner crashed",
          error instanceof Error ? error : new Error(String(error))
        );
      });
    });
  });

  return {
    server,
    listen: () =>
      new Promise<void>((resolve) => {
        server.listen(port, host, () => resolve());
      }),
    close: () =>
      new Promise<void>((resolve, reject) => {
        wss.close((err?: Error) => {
          if (err) reject(err);
          else {
            server.close((closeErr) => {
              if (closeErr) reject(closeErr);
              else resolve();
            });
          }
        });
      }),
    info: {
      host,
      port,
      metadataRoots,
      metadataCount: registry.listMetadata().length
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Initialize SQLite adapter pointing at the same DB as the Python side
  const dbPath = getDefaultDbPath();
  try {
    initDb(dbPath);
  } catch {
    // DB unavailable — secrets will appear unconfigured
  }

  const srv = createTestUiServer();
  void srv.listen().then(() => {
    log.info("Server listening", {
      host: srv.info.host,
      port: srv.info.port,
      metadataRoots: srv.info.metadataRoots,
      nodes: srv.info.metadataCount
    });
  });
}
