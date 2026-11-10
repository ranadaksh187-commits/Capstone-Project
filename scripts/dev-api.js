const { spawn } = require('child_process');
const path = require('path');

const knownMavenBins = [
  'C:\\tools\\apache-maven-3.9.11\\bin',
  'C:\\maven\\apache-maven-3.9.16\\bin',
  'C:\\Users\\user\\.maven\\apache-maven-3.9.15\\maven-3.9.15\\bin',
  'C:\\Users\\user\\.m2\\wrapper\\dists\\apache-maven-3.9.16\\0daed3be3ebd1c706f0e69e8b07c6b73f5cc4ea3dfce72a8d0ec\\bin',
];

const windowsPathEntries = (process.env.PATH || '').split(';').filter(Boolean);
const fullPath = [...new Set([...knownMavenBins, ...windowsPathEntries])].join(';');

const env = {
  ...process.env,
  PATH: fullPath,
};

const backendDir = path.join(__dirname, '..', 'backend');
const mavenCommand = process.platform === 'win32' ? 'mvn.cmd' : 'mvn';
const child = spawn(mavenCommand, ['spring-boot:run'], {
  cwd: backendDir,
  stdio: 'inherit',
  shell: true,
  env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
