process.on('message', () => {
  if (process.env.S5_CHILD_FAILURE === 'crash') process.kill(process.pid, 'SIGKILL');
});
process.on('SIGTERM', () => {});
